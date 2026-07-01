import os
import re
import json
import uuid
import time
import signal
import platform
import asyncio
import threading
import subprocess
import sys
import shutil
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from utils import generate_interview_questions
from livekit import api as lkapi

load_dotenv()
main_dir = os.path.dirname(os.path.abspath(__file__))

script_name = os.getenv("INTERVIEW_AGENT_SCRIPT", "agent_with_questions_efficient.py")
if os.path.isabs(script_name):
    AGENT_SCRIPT = script_name
else:
    AGENT_SCRIPT = os.path.join(main_dir, script_name)

PYTHON_BIN = os.getenv("PYTHON_EXECUTABLE") or os.getenv("AGENT_PYTHON") or "python"

transcripts_env = os.getenv("TRANSCRIPTS_DIR", "transcripts")
if os.path.isabs(transcripts_env):
    TRANSCRIPTS_DIR = transcripts_env
else:
    TRANSCRIPTS_DIR = os.path.join(main_dir, transcripts_env)

LIVEKIT_URL = os.getenv("LIVEKIT_URL")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
    print("WARNING: LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET not all set.")

_livekit_api = None
def livekit_api():
    global _livekit_api
    if _livekit_api is None:
        from livekit import api as lkapi  # type: ignore
        _livekit_api = lkapi.LiveKitAPI(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    return _livekit_api

os.makedirs(TRANSCRIPTS_DIR, exist_ok=True)
_proc_lock = threading.Lock()
_proc: Optional[subprocess.Popen] = None
_proc_meta: Dict[str, Any] = {}

class DispatchRequest(BaseModel):
    room: Optional[str] = Field(None)
    role: Optional[str] = Field(None)
    job_description: Optional[str] = Field(None)
    candidate_name: Optional[str] = Field(None)
    extra_metadata: Dict[str, Any] = Field(default_factory=dict)

class DispatchResponse(BaseModel):
    room: str
    dispatch_id: Optional[str] = None
    metadata: Dict[str, Any]
    agent_name: Optional[str] = None

class AgentStatus(BaseModel):
    running: bool
    pid: Optional[int] = None
    started_at: Optional[str] = None
    command: Optional[List[str]] = None

class TranscriptSummary(BaseModel):
    room: str
    timestamp: str
    file: str
    items: int
    candidate_name: Optional[str] = None
    job_role: Optional[str] = None

def _choose_interpreter() -> str:
    """"""
    candidates: List[str] = []
    for env_var in ["AGENT_PYTHON", "PYTHON_EXECUTABLE"]:
        val = os.getenv(env_var)
        if val:
            candidates.append(val)
    main_dir = os.path.dirname(os.path.abspath(__file__))
    candidates.extend([
        os.path.join(main_dir, "venv", "Scripts", "python.exe"),
        os.path.join(main_dir, "venv", "bin", "python"),
        sys.executable,
    ])
    for name in ["python", "python3"]:
        found = shutil.which(name)
        if found:
            candidates.append(found)
    test_snippet = "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('livekit') else 1)"
    chosen = None
    for c in candidates:
        if not c or not os.path.exists(c):
            continue
        try:
            res = subprocess.run([c, '-c', test_snippet], capture_output=True)
            if res.returncode == 0:
                chosen = c
                break
        except Exception:
            continue
    return chosen or sys.executable

def _start_agent():
    global _proc, _proc_meta
    with _proc_lock:
        if _proc and _proc.poll() is None:
            raise HTTPException(status_code=409, detail="Agent already running")
        if not os.path.exists(AGENT_SCRIPT):
            raise HTTPException(status_code=404, detail=f"Agent script not found: {AGENT_SCRIPT}")
        py = _choose_interpreter()
        cmd = [py, AGENT_SCRIPT, 'start']

        main_dir = os.path.dirname(os.path.abspath(__file__))
        popen_kwargs: Dict[str, Any] = {"cwd": main_dir}
        if platform.system().lower().startswith('win'):
            popen_kwargs["creationflags"] = getattr(subprocess, 'CREATE_NEW_CONSOLE', 0)
        else:
            pass
        try:
            _proc = subprocess.Popen(cmd, **popen_kwargs)
        except FileNotFoundError:
            raise HTTPException(status_code=500, detail=f"Failed to launch interpreter: {py}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to start agent: {e}")

        _proc_meta = {
            "started_at": datetime.utcnow().isoformat(),
            "command": cmd,
            "output": [f"[agent] launched in new terminal: {' '.join(cmd)}"],
        }

def _stop_agent():
    global _proc
    with _proc_lock:
        if not _proc or _proc.poll() is not None:
            raise HTTPException(status_code=404, detail="Agent not running")
        if platform.system().lower().startswith("win"):
            subprocess.run(["taskkill", "/PID", str(_proc.pid), "/T", "/F"], capture_output=True)
        else:
            try:
                _proc.send_signal(signal.SIGTERM)
            except Exception:
                pass
        try:
            _proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            try:
                _proc.kill()
            except Exception:
                pass

def _status() -> AgentStatus:
    with _proc_lock:
        if not _proc:
            return AgentStatus(running=False)
        running = _proc.poll() is None
        return AgentStatus(
            running=running,
            pid=_proc.pid if running else None,
            started_at=_proc_meta.get("started_at"),
            command=_proc_meta.get("command"),
        )

 
_TS_REGEX = re.compile(r"^interview_(?P<room>.+)_(?P<ts>\d{8}_\d{6})\.json$")

def list_transcript_files() -> List[TranscriptSummary]:
    out: List[TranscriptSummary] = []
    for fname in os.listdir(TRANSCRIPTS_DIR):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(TRANSCRIPTS_DIR, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue

        if isinstance(data, dict) and "history" in data:
            room = data.get("room") or fname.replace(".json", "")
            items = len(data.get("history", {}).get("items", []))
            created_at = data.get("created_at") or datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y%m%d_%H%M%S")
            candidate_name = data.get("candidate_name")
            job_role = data.get("job_title")
        else:
            m = _TS_REGEX.match(fname)
            room = m.group("room") if m else fname.replace(".json", "")
            created_at = m.group("ts") if m else datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y%m%d_%H%M%S")
            items = len(data.get("items", [])) if isinstance(data, dict) else 0
            candidate_name = None
            job_role = None

        out.append(
            TranscriptSummary(
                room=room,
                timestamp=created_at,
                file=fname,
                items=items,
                candidate_name=candidate_name,
                job_role=job_role,
            )
        )
    out.sort(key=lambda s: s.timestamp, reverse=True)
    return out

def load_room_transcripts(room: str) -> List[Dict[str, Any]]:
    summaries = list_transcript_files()
    matched = [s for s in summaries if s.room == room]
    loaded: List[Dict[str, Any]] = []
    for s in matched:
        path = os.path.join(TRANSCRIPTS_DIR, s.file)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict) and "history" in data:
                    res = data["history"]
                    res["room"] = data.get("room")
                    res["candidate_name"] = data.get("candidate_name")
                    res["job_title"] = data.get("job_title")
                    res["created_at"] = data.get("created_at")
                    loaded.append(res)
                else:
                    loaded.append(data)
        except Exception:
            continue
    loaded.sort(key=lambda d: d.get("created_at") or "")
    return loaded

def latest_room_transcript(room: str) -> Dict[str, Any]:
    transcripts = load_room_transcripts(room)
    if not transcripts:
        raise HTTPException(status_code=404, detail="No transcripts for room")
    return transcripts[-1]

app = FastAPI(title="InterviewAgent Control API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/agent/status", response_model=AgentStatus)
def agent_status():
    return _status()

@app.post("/agent/start", response_model=AgentStatus)
def agent_start():
    _start_agent()
    time.sleep(0.4)
    return _status()

@app.post("/agent/stop", response_model=AgentStatus)
def agent_stop():
    _stop_agent()
    return _status()

@app.post("/agent/restart", response_model=AgentStatus)
def agent_restart():
    try:
        _stop_agent()
    except HTTPException:
        pass
    _start_agent()
    time.sleep(0.4)
    return _status()

@app.post("/agent/dispatch", response_model=DispatchResponse)
async def agent_dispatch(req: DispatchRequest | None = None):
    st = _status()
    if not st.running:
        raise HTTPException(status_code=409, detail="Agent not running")

    req = req or DispatchRequest()
    agent_name = "interviewer-agent"
    room = str(uuid.uuid4())

    meta: Dict[str, Any] = {}

    if req.role:
        meta["job_title"] = req.role

    if getattr(req, "job_description", None):
        meta["job_description"] = req.job_description
    else:
        meta["job_description"] = ""

    if getattr(req, "candidate_name", None):
        meta["candidate_name"] = req.candidate_name
    else:
        meta["candidate_name"] = "Candidate"

    if req.extra_metadata:
        meta.update(req.extra_metadata)
    try:
        questions = await generate_interview_questions(
            meta.get("job_title", ""),
            meta.get("job_description", "")
        )
        meta["questions"] = questions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate questions: {e}")

    meta_str = json.dumps(meta)

    try:
        api = livekit_api()
        request_cls = getattr(lkapi, "CreateAgentDispatchRequest", None)
        method = api.agent_dispatch.create_dispatch

        resp = None
        call_kwargs = dict(agent_name=agent_name, room=room, metadata=meta_str)

        if request_cls:
            try:
                request_obj = request_cls(**call_kwargs)
                if asyncio.iscoroutinefunction(method):
                    resp = await method(request_obj)
                else:
                    resp = await asyncio.to_thread(method, request_obj)
            except Exception:
                request_obj = None

        if resp is None:
            try:
                if asyncio.iscoroutinefunction(method):
                    resp = await method(**call_kwargs)
                else:
                    resp = await asyncio.to_thread(lambda: method(**call_kwargs))
            except TypeError:
                raise HTTPException(
                    status_code=500,
                    detail="Dispatch incompatible with current SDK (unable to construct request object)"
                )

        dispatch_id = getattr(resp, "id", None)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Dispatch failed: {e}")

    return DispatchResponse(
        room=room,
        dispatch_id=dispatch_id,
        metadata=meta,
        agent_name=agent_name
    )

@app.get("/rooms", response_model=List[TranscriptSummary])
def list_rooms():
    return list_transcript_files()

@app.get("/rooms/{room_id}")
def get_room_latest(room_id: str):
    return latest_room_transcript(room_id)

@app.get("/rooms/{room_id}/all")
def get_room_all(room_id: str):
    data = load_room_transcripts(room_id)
    if not data:
        raise HTTPException(status_code=404, detail="No transcripts for room")
    return data

@app.get("/rooms/{room_id}/analysis")
def get_room_analysis(room_id: str):
    summaries = list_transcript_files()
    matched = [s for s in summaries if s.room == room_id]
    if not matched:
        raise HTTPException(status_code=404, detail="No transcript found for room")
    
    basename = matched[0].file.replace(".json", "")
    analysis_path = os.path.join("analysis", f"{basename}.json")
    if not os.path.exists(analysis_path):
        raise HTTPException(status_code=404, detail="No analysis found for this room")
    
    try:
        with open(analysis_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read analysis: {e}")

@app.get("/agent/logs")
def agent_logs(limit: int = 200):
    with _proc_lock:
        logs = _proc_meta.get("output", [])[-limit:]
    return {"lines": logs}


if __name__ == "__main__":
    try:
        import uvicorn
    except ImportError as exc:
        raise SystemExit(
            "uvicorn is required to run the FastAPI server. Install it with: python -m pip install uvicorn"
        ) from exc

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    reload_enabled = os.getenv("RELOAD", "false").lower() in {"1", "true", "yes", "on"}
    uvicorn.run("main:app", host=host, port=port, reload=reload_enabled)