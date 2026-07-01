## Interview Agent — README

This repository implements a voice-first AI interview system built with a Python FastAPI backend, a LiveKit-based agent worker, and a Next.js frontend used to control and interact with the agent in real time.

This README documents architecture, setup, running instructions, and developer guidance so you can run, test, and extend the project.

--

**Contents**

- Project overview
- Architecture & components
- Environment variables
- Setup (Python + JS)
- Running the system (backend + frontend)
- End-to-end usage (UI workflow)
- How questions are generated
- Transcripts and logs
- Troubleshooting
- Development notes
- Security & cleanup

--

**Project overview**

The system provides a real-time interview experience where an AI agent asks a short sequence of role-specific interview questions, listens to the candidate's spoken answers, and responds with speech. The pipeline is:

- Browser UI (Next.js) ↔ Backend control API (FastAPI) ↔ LiveKit Agent Worker (Python) ↔ STT / LLM / TTS plugins

The agent saves transcripts as JSON files under the `transcripts/` folder for later inspection.

--

**Architecture & Key Components**

- `main.py` — FastAPI control plane and orchestration. Exposes endpoints used by the frontend:
  - `GET /health`
  - `GET /agent/status` — agent worker status
  - `POST /agent/start` — spawns agent worker (new console)
  - `POST /agent/stop`
  - `POST /agent/dispatch` — creates a new room, generates questions, and dispatches agent to LiveKit
  - `GET /rooms` / `GET /rooms/{room}` / `GET /rooms/{room}/all` — transcript listing & retrieval
  - `GET /agent/logs` — recent agent output captured by the orchestration process

- `agent_with_questions_efficient.py` — Agent implementation (LiveKit Agents worker). Responsibilities:
  - Connect to LiveKit and register a worker
  - Create an `InterviewAgent` class (subclass of the framework `Agent`) with strict system instructions (3 questions, one at a time, final phrase)
  - Use plugin stack for STT (Deepgram), LLM (Groq/LLM), TTS (Cartesia), VAD (Silero), and optional noise-cancellation
  - Save conversation history as JSON to `transcripts/interview_{room}_{timestamp}.json` on shutdown

- `utils.py` — Helper utilities (question generation). The `generate_interview_questions(job_title, job_desc)` function calls the Groq chat completion API to produce three concise technical questions.

- Frontend: `realtime-playground/web` (Next.js with app router)
  - UI components to start/stop/dispatch agent, choose role, view transcripts, and connect to a LiveKit room
  - Token endpoint `/api/token` that issues LiveKit access tokens to the browser using `LIVEKIT_API_KEY/SECRET/URL` from the frontend server environment
  - `src/lib/agentApi.ts` client communicates with the backend control API using `NEXT_PUBLIC_AGENT_API_BASE`

--

**Environment variables**

Backend (FastAPI) — set in root `.env` or your environment:

- `LIVEKIT_URL` (e.g. `wss://your-account.livekit.cloud`) — required
- `LIVEKIT_API_KEY` — required
- `LIVEKIT_API_SECRET` — required
- `INTERVIEW_AGENT_SCRIPT` — optional path to agent script (defaults to `agent_with_questions_efficient.py`)
- `PYTHON_EXECUTABLE` or `AGENT_PYTHON` — optional explicit interpreter for agent subprocess
- `TRANSCRIPTS_DIR` — defaults to `transcripts`

Frontend (Next.js) — edit `realtime-playground/web/.env.local` (use KEY=VALUE, no `export` prefix):

- `NEXT_PUBLIC_AGENT_API_BASE` — e.g. `http://127.0.0.1:8000` (points the frontend at the backend control API)
- `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — used by the frontend server to issue LiveKit tokens in `/api/token`

Note: Next.js client-side code only reads env vars prefixed with `NEXT_PUBLIC_` — the LiveKit secrets belong in the server-side `.env.local` used by Next.js.

--

Setup (recommended)

1. Create and activate a Python virtual environment:

```powershell
python -m venv venv
& .\venv\Scripts\Activate.ps1   # PowerShell
```

2. Install Python dependencies (from repo root):

```powershell
python -m pip install -r requirements.txt
```

3. Install Node deps and run frontend (from `realtime-playground/web`):

```powershell
cd realtime-playground/web
npm install        # or: pnpm install
npm run dev        # or: pnpm dev
```

If `pnpm` is not on PATH, you can use `npx pnpm install` or stick with `npm install`.

--

Running the system (end-to-end)

1. Start the backend control API (from repo root):

```powershell
python main.py
# opens Uvicorn on http://0.0.0.0:8000 (default)
```

2. Start the frontend dev server (in a separate terminal):

```powershell
cd realtime-playground/web
npm run dev
# UI: http://127.0.0.1:3000
```

3. In the web UI (http://127.0.0.1:3000):
  - Click `Start` (launches the agent worker as a subprocess)
  - Select `Interview Role` (drops a job title into the dispatch metadata)
  - Click `Dispatch` (creates a LiveKit room and dispatches the agent; the backend will generate 3 role-specific questions)
  - Copy the room ID shown or click `Connect` — note: the root UI prepares tokens; to actually join the LiveKit room you may open the room page directly at `http://127.0.0.1:3000/room/<room-id>` or `http://127.0.0.1:3000/roomName=<room-id>` which auto-connects

Notes:
- The UI's `Connect` control prepares the token and connection state. The LiveKit room view mounts on the `/room` route which performs the actual connection and joins audio.

--

How interview questions are generated

- `main.py`'s `/agent/dispatch` builds metadata for the job (role -> `job_title` and optional `job_description`) and calls `generate_interview_questions()` from `utils.py`.
- `utils.py` calls the Groq chat completion API (configured by environment) with a prompt requesting exactly 3 concise technical questions for the role and job description. The resulting list is added to dispatch metadata `questions` and sent to the agent.

Agent behavior

- `InterviewAgent` in `agent_with_questions_efficient.py` is instantiated with `metadata` that contains `job_title` and `questions`.
- The agent instructions force the agent to ask exactly three questions (in order), one at a time, acknowledging answers, handling a single short silent prompt, and finishing with the fixed final phrase:

  > "Thank you for your time. This concludes our interview."

- Session plugins used by the agent: STT (Deepgram), LLM (Groq LLM), TTS (Cartesia), VAD (Silero), and optional noise cancellation.

--

Transcripts & logs

- Conversations are saved as JSON in `transcripts/` with the filename format: `interview_{room}_{YYYYMMDD_HHMMSS}.json`.
- Use the frontend `Transcripts` viewer to list and inspect transcripts, or call the backend endpoints: `GET /rooms` and `GET /rooms/{room}/all`.
- Backend also exposes `GET /agent/logs` to stream recent agent output captured by the orchestration process.

--

Troubleshooting

- If `python main.py` exits without starting: ensure `uvicorn` is installed. The repository was updated so `python main.py` now launches Uvicorn. If missing, install:

```powershell
python -m pip install uvicorn
```

- If the frontend can't reach the backend from the browser, confirm `realtime-playground/web/.env.local` contains:

```
NEXT_PUBLIC_AGENT_API_BASE=http://127.0.0.1:8000
LIVEKIT_URL=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

- If `pnpm` isn't found after `npm install -g pnpm`: either restart your shell, add npm global bin to PATH (usually `%APPDATA%\\npm` on Windows), or use `npx pnpm` / `npm` instead.

- If the `Connect` button shows `Connecting` indefinitely, copy the dispatched room id and open the room page directly:

```
http://127.0.0.1:3000/room/<room-id>
```

--

Development notes

- To run the agent worker directly (for debugging) you can run the agent script:

```powershell
python agent_with_questions_efficient.py start
```

- The backend will normally spawn the agent worker in a new console when you click `Start` in the UI.
- Use `transcripts/` files for offline analysis; they contain a structured `history` dump from the agent session.

--

Security & cleanup

- The repository contains secrets placeholders in example `.env` files. Do not commit real API keys to source control. Rotate any keys you exposed during testing.
- When finished, stop the agent via the UI or:

```powershell
curl -X POST http://127.0.0.1:8000/agent/stop
```

--

If you'd like, I can:

- Add a `Job description` field to the root UI and wire it into `dispatch` metadata so generated questions incorporate both title and description.
- Add a button that navigates automatically to the room page after dispatch (so the UI joins automatically).

--

Files to inspect quickly:

- `main.py` — backend control API and process manager
- `agent_with_questions_efficient.py` — agent worker and interview logic
- `utils.py` — question generation helper
- `realtime-playground/web` — frontend app, token endpoint, and UI components

--

License: none provided in repo — respect original authorship.

--

Last updated: 2026-05-27
