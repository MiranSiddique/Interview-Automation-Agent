# Interview Agent

This repository contains a voice-first interview workflow built around a Python FastAPI control plane, a LiveKit agent worker, and a Next.js dashboard used to start, dispatch, and join interview sessions in real time.

The current iteration does more than run a mock interview. It now:

- Generates three role-specific interview questions from a job title and job description.
- Dispatches a LiveKit agent into a fresh room for each interview.
- Saves session transcripts to JSON.
- Produces Groq-based evaluation reports for completed interviews.
- Lets you inspect transcripts, logs, and analysis from the web UI.

## Project Structure

- `main.py` - FastAPI backend and process manager.
- `agent_with_questions_efficient.py` - LiveKit agent worker and transcript/evaluation saver.
- `utils.py` - Groq-powered interview question generation.
- `realtime-playground/web` - Next.js dashboard, token route, room pages, and UI components.
- `transcripts/` - Saved interview transcripts.
- `analysis/` - Saved AI evaluation reports.

## Current Workflow

1. Start the backend API.
2. Start the Next.js frontend.
3. Start the agent worker from the dashboard.
4. Enter a candidate name, job role, and job description.
5. Dispatch the interview.
6. Open the generated room link and join the session.
7. After the interview completes, the transcript and evaluation data are available in the UI and on disk.

## Backend Overview

The backend in `main.py` is the control plane for the whole system. It loads environment variables, manages the agent subprocess, creates LiveKit dispatches, and exposes transcript and analysis lookup endpoints.

Available endpoints:

- `GET /health` - health check.
- `GET /agent/status` - current agent process status.
- `POST /agent/start` - launch the agent worker in a new console.
- `POST /agent/stop` - stop the running worker.
- `POST /agent/restart` - restart the worker.
- `POST /agent/dispatch` - create a room, generate questions, and dispatch the agent.
- `GET /agent/logs` - recent orchestration log lines.
- `GET /rooms` - list transcript summaries.
- `GET /rooms/{room}` - latest transcript for a room.
- `GET /rooms/{room}/all` - all transcript payloads found for a room.
- `GET /rooms/{room}/analysis` - Groq-generated evaluation report for a room.

The backend now starts Uvicorn directly when you run `python main.py`.

## Agent Behavior

`agent_with_questions_efficient.py` defines the LiveKit worker and the interview behavior.

The agent:

- Uses a strict interview prompt.
- Asks exactly three questions.
- Asks one question at a time.
- Waits for a spoken response after each question.
- Ends with the fixed closing line: `Thank you for your time. This concludes our interview.`
- Saves the full session history to `transcripts/`.
- Runs a Groq-based evaluation pass and writes the result to `analysis/` when the interview finishes.

The worker supports:

- STT via Deepgram.
- LLM via Groq.
- TTS via either LiveKit inference TTS or Cartesia, depending on configuration.
- VAD via Silero.
- Optional noise cancellation.

## Interview Question Generation

`utils.py` generates exactly three concise technical questions with Groq. The backend passes:

- `job_title`
- `job_description`

Those questions are attached to the dispatch metadata and used by the agent during the live interview.

## Frontend Overview

The frontend lives in `realtime-playground/web` and uses the Next.js app router.

The dashboard includes:

- Agent start and stop controls.
- Candidate name, job role, and job description inputs.
- Role presets for quicker setup.
- A dispatch button that creates the room and sends the agent.
- A generated room link you can copy or open.
- A session viewer for raw transcripts.
- An evaluation viewer for AI-scored interview analysis.
- A live log panel for backend agent output.

Room entry routes:

- `/room/<roomName>` - primary interview room route.
- `/roomName=<roomName>` - alternate direct-connect route.

The frontend also exposes `POST /api/token`, which issues LiveKit access tokens using server-side environment variables.

## Environment Variables

Backend environment variables, typically in the root `.env`:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `GROQ_API_KEY`
- `INTERVIEW_AGENT_SCRIPT` - optional path to the worker script.
- `PYTHON_EXECUTABLE` or `AGENT_PYTHON` - optional interpreter override.
- `TRANSCRIPTS_DIR` - optional transcript output folder.
- `INTERVIEW_TTS_PROVIDER` - `inference` or `cartesia`.
- `INTERVIEW_TTS_MODEL` - used when inference TTS is selected.
- `CARTESIA_TTS_MODEL` - used when Cartesia is selected.
- `CARTESIA_TTS_VOICE` - used when Cartesia is selected.
- `HOST` - backend bind host.
- `PORT` - backend bind port.
- `RELOAD` - enable Uvicorn reload mode.

Frontend environment variables, typically in `realtime-playground/web/.env.local`:

- `NEXT_PUBLIC_AGENT_API_BASE` - backend base URL for the dashboard.
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

## Setup

1. Create and activate a Python virtual environment from the repo root:

```powershell
python -m venv venv
& .\venv\Scripts\Activate.ps1
```

2. Install backend dependencies:

```powershell
python -m pip install -r requirements.txt
```

3. Install frontend dependencies:

```powershell
cd realtime-playground/web
pnpm install
```

If you prefer npm, `npm install` also works for the frontend.

## Run Locally

Start the backend from the repository root:

```powershell
python main.py
```

Start the frontend in a separate terminal:

```powershell
cd realtime-playground/web
pnpm dev
```

Then open the dashboard in your browser, start the agent, dispatch an interview, and join the generated room.

## Data Files

Transcripts are written to `transcripts/` as JSON files containing the room metadata and full session history.

Evaluation reports are written to `analysis/` as JSON files with the same basename as the transcript they belong to.

The UI reads both locations so you can inspect past interviews without leaving the dashboard.

## Troubleshooting

- If `python main.py` fails because `uvicorn` is missing, install it with `python -m pip install uvicorn`.
- If the dashboard cannot reach the backend, confirm `NEXT_PUBLIC_AGENT_API_BASE` is correct.
- If LiveKit token generation fails, make sure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are set in the frontend server environment.
- If transcript evaluation does not appear, confirm `GROQ_API_KEY` is set and the interview completed successfully.

## Notes

- The repository contains generated session artifacts in `transcripts/` and `analysis/`.
- Keep real API keys out of source control.
- The nested frontend app has its own build and dependency lifecycle separate from the Python backend.

Last updated: 2026-07-01
