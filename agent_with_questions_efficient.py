import os
import json
import socket
import asyncio
import logging
from contextlib import closing
from datetime import datetime, timedelta
from dotenv import load_dotenv

from livekit import agents
from livekit.agents import AgentSession, Agent, inference, room_io
from livekit.plugins import groq, cartesia, silero, noise_cancellation, deepgram

load_dotenv()

logger = logging.getLogger("interviewer-agent")

FINAL_PHRASE = "Thank you for your time. This concludes our interview."

def find_free_port() -> int:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
        s.bind(('', 0))
        return s.getsockname()[1]


def build_tts():
    provider = os.getenv("INTERVIEW_TTS_PROVIDER", "inference").strip().lower()
    if provider == "cartesia":
        logger.info("Using Cartesia TTS")
        return cartesia.TTS(
            model=os.getenv("CARTESIA_TTS_MODEL", "sonic-english"),
            voice=os.getenv("CARTESIA_TTS_VOICE", "5ee9feff-1265-424a-9d7f-8e4d431a12c7"),
        )

    if provider == "inference":
        logger.info("Using LiveKit inference TTS")
        return inference.TTS(os.getenv("INTERVIEW_TTS_MODEL", "cartesia/sonic-3"))

    logger.info("Using LiveKit inference TTS")
    return inference.TTS(os.getenv("INTERVIEW_TTS_MODEL", "cartesia/sonic-3"))

class InterviewAgent(Agent):
    def __init__(self, metadata=None, llm=None):
        metadata = metadata or {}
        job_title = metadata.get("job_title", "").strip()
        questions = [q.strip() for q in metadata.get("questions", []) if str(q).strip()]
        defaults = [
            "Can you tell me about yourself?",
            "Why are you interested in this role?",
            "What is one challenge you solved recently?",
        ]
        while len(questions) < 3:
            questions.append(defaults[len(questions)])
        questions = questions[:3]
        self.questions = questions

        instruction_text = f"""
You are Alex, an interview agent for the role of {job_title}. And you are given 3 questions that you have to ask the user in any order you like. You can rephrase the questions if you want, but the meaning must remain the same.
Be as human as you can. And you can answer only the user's queries that are related to the interview and nothing beyond that.
start the interview with a brief greeting, then proceed to ask the candidate the following questions.

Follow these rules EXACTLY:

1) Ask EXACTLY the following three questions in this order:
   1. {self.questions[0]}
   2. {self.questions[1]}
   3. {self.questions[2]}

2) Ask ONLY ONE question at a time. After asking a question, STOP and wait for the candidate's verbal response.

3) All questions must be oral-only questions that can be answered verbally. 
   Do NOT ask for write a code, equations, algorithms, lists, or anything requiring typing or written output.

4) After each answer, acknowledge with ONE short sentence, then move to the next question.

5) If the candidate is silent, you may say one short prompt such as "Could you say a bit more?" once.

6) After the third answer, say exactly:
   "Thank you for your time. This concludes our interview."
   Then STOP completely.

7) Do NOT answer your own questions, invent new ones, merge questions, or add extra tasks.

Be concise, polite, and strictly follow the steps.
"""
        super().__init__(instructions=instruction_text)

    @staticmethod
    def setup_transcript_saver(ctx, session, metadata):
        async def save_transcript():
            import re
            candidate_name = metadata.get("candidate_name", "Unknown").strip()
            job_title = metadata.get("job_title", "Unknown").strip()
            questions = metadata.get("questions", [])

            # Sanitize name and job title for filename
            def sanitize(s):
                return re.sub(r'[^a-zA-Z0-9_\-]', '_', s)

            cand_sanitized = sanitize(candidate_name)
            job_sanitized = sanitize(job_title)

            # Build filename: transcripts/<Candidate_Name>_<Job_Role>.json
            os.makedirs("transcripts", exist_ok=True)
            filename = f"transcripts/{cand_sanitized}_{job_sanitized}.json"

            history_dict = session.history.to_dict()

            data_to_save = {
                "room": ctx.room.name,
                "candidate_name": candidate_name,
                "job_title": job_title,
                "questions": questions,
                "created_at": datetime.now().strftime("%Y%m%d_%H%M%S"),
                "history": history_dict
            }

            try:
                with open(filename, "w", encoding="utf-8") as f:
                    json.dump(data_to_save, f, indent=2)
                logger.info(f"Transcript saved to {filename}")
            except Exception as e:
                logger.error(f"Failed to save transcript: {e}")

            # Extract answers
            history_items = history_dict.get("items", [])
            answers = ["", "", ""]
            current_q_idx = -1

            # Match user responses to questions
            for item in history_items:
                if item.get("type") != "message":
                    continue
                role = item.get("role")
                content_list = item.get("content", [])
                content = " ".join(content_list) if isinstance(content_list, list) else str(content_list)

                if role == "assistant":
                    for idx, q in enumerate(questions):
                        q_words = set(re.findall(r'\w+', q.lower()))
                        content_words = set(re.findall(r'\w+', content.lower()))
                        overlap = q_words.intersection(content_words)
                        if len(overlap) >= min(5, len(q_words) * 0.5):
                            current_q_idx = idx
                            break
                elif role == "user":
                    if 0 <= current_q_idx < 3:
                        if answers[current_q_idx]:
                            answers[current_q_idx] += " " + content
                        else:
                            answers[current_q_idx] = content

            # Check if any answer is empty, fallback to order-based pairing
            if not any(answers):
                assistant_turns = []
                current_user_responses = []
                for item in history_items:
                    if item.get("type") != "message":
                        continue
                    role = item.get("role")
                    content_list = item.get("content", [])
                    content = " ".join(content_list) if isinstance(content_list, list) else str(content_list)

                    if role == "assistant":
                        if len(re.findall(r'\w+', content)) > 5:
                            if current_user_responses and assistant_turns:
                                assistant_turns[-1]["user_content"] = " ".join(current_user_responses)
                                current_user_responses = []
                            assistant_turns.append({"content": content, "user_content": ""})
                    elif role == "user":
                        current_user_responses.append(content)
                if current_user_responses and assistant_turns:
                    assistant_turns[-1]["user_content"] = " ".join(current_user_responses)

                for idx, q in enumerate(questions):
                    best_match = None
                    best_overlap = 0
                    for turn in assistant_turns:
                        q_words = set(re.findall(r'\w+', q.lower()))
                        turn_words = set(re.findall(r'\w+', turn["content"].lower()))
                        overlap = len(q_words.intersection(turn_words))
                        if overlap > best_overlap:
                            best_overlap = overlap
                            best_match = turn
                    if best_match and best_overlap >= 3:
                        answers[idx] = best_match["user_content"]

            # Ultimate fallback sequential mapping
            for idx, q in enumerate(questions):
                if not answers[idx].strip():
                    user_msgs = []
                    for item in history_items:
                        if item.get("type") == "message" and item.get("role") == "user":
                            content_list = item.get("content", [])
                            content = " ".join(content_list) if isinstance(content_list, list) else str(content_list)
                            user_msgs.append(content)
                    if len(user_msgs) >= 3:
                        if idx == 0:
                            answers[idx] = user_msgs[0]
                        elif idx == 1:
                            answers[idx] = user_msgs[1]
                        elif idx == 2:
                            answers[idx] = " ".join(user_msgs[2:])

            # Run evaluation on Groq and save to analysis/ folder
            def run_eval():
                from groq import Groq
                api_key = os.getenv("GROQ_API_KEY")
                if not api_key:
                    logger.error("GROQ_API_KEY not set. Cannot run evaluation.")
                    return
                
                client = Groq(api_key=api_key)
                evaluations = []

                system_prompt = """You are an expert technical interviewer with 15+ years of experience.

Your responsibility is to objectively evaluate a candidate's answer.

You are NOT provided with a model answer.

Instead, first determine what an excellent answer would contain based solely on the interview question.

Evaluation Process (perform internally):

Step 1:
Determine the ideal answer that a senior interviewer would expect.

Step 2:
Identify:
- mandatory concepts
- optional advanced concepts
- common misconceptions

Step 3:
Compare the candidate answer against the ideal answer.

Step 4:
Assign a score from 0-100.

Scoring Guidelines:

90-100
Excellent answer.
Technically correct, covers almost every important concept, demonstrates practical understanding.

75-89
Good answer.
Mostly correct with minor omissions.

60-74
Average answer.
Basic understanding but lacks depth or misses important concepts.

40-59
Weak answer.
Some correct ideas but significant misunderstandings.

20-39
Very weak answer.
Minimal understanding.

0-19
Incorrect, irrelevant, or "I don't know."

Do not score based on:
- grammar
- fluency
- accent
- confidence
- speaking speed

Only evaluate technical content.

Return JSON only."""

                for q, a in zip(questions, answers):
                    # Clean the answer
                    ans_text = a.strip() if a.strip() else "No answer provided or candidate was silent."
                    user_prompt = f"""Interview Question:

{q}

Candidate Answer:

"{ans_text}"

Evaluate this answer.

Return:

{{
    "ideal_answer": "...",

    "key_concepts": [
        ...
    ],

    "candidate_summary": "...",

    "strengths": [
        ...
    ],

    "missing_concepts": [
        ...
    ],

    "technical_errors": [
        ...
    ],

    "score": 23,

    "justification": "...",

    "difficulty": "Easy/Medium/Hard",

    "recommendation": "Proceed/Borderline/Reject"
}}"""
                    try:
                        # Use a high-quality model, fallback to a smaller/faster one
                        model = "llama-3.3-70b-versatile"
                        try:
                            resp = client.chat.completions.create(
                                model=model,
                                messages=[
                                    {"role": "system", "content": system_prompt},
                                    {"role": "user", "content": user_prompt}
                                ],
                                temperature=0.2,
                                response_format={"type": "json_object"}
                            )
                        except Exception as e:
                            logger.warning(f"Failed with {model}: {e}. Retrying with llama-3.1-8b-instant...")
                            model = "llama-3.1-8b-instant"
                            try:
                                resp = client.chat.completions.create(
                                    model=model,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt}
                                    ],
                                    temperature=0.2,
                                    response_format={"type": "json_object"}
                                )
                            except Exception as e2:
                                logger.warning(f"Failed with {model}: {e2}. Retrying with openai/gpt-oss-20b...")
                                model = "openai/gpt-oss-20b"
                                resp = client.chat.completions.create(
                                    model=model,
                                    messages=[
                                        {"role": "system", "content": system_prompt},
                                        {"role": "user", "content": user_prompt}
                                    ],
                                    temperature=0.2,
                                    response_format={"type": "json_object"}
                                )

                        result_text = resp.choices[0].message.content
                        eval_data = json.loads(result_text)
                        eval_data["question"] = q
                        eval_data["candidate_answer"] = ans_text
                        evaluations.append(eval_data)
                    except Exception as e:
                        logger.error(f"Failed to evaluate question '{q}': {e}")
                        evaluations.append({
                            "question": q,
                            "candidate_answer": ans_text,
                            "error": str(e),
                            "score": 0,
                            "ideal_answer": "Failed to generate evaluation",
                            "key_concepts": [],
                            "candidate_summary": "Failed to parse candidate answer",
                            "strengths": [],
                            "missing_concepts": [],
                            "technical_errors": [str(e)],
                            "justification": "API error during evaluation",
                            "difficulty": "Unknown",
                            "recommendation": "Borderline"
                        })

                os.makedirs("analysis", exist_ok=True)
                analysis_filename = f"analysis/{cand_sanitized}_{job_sanitized}.json"
                try:
                    with open(analysis_filename, "w", encoding="utf-8") as f:
                        json.dump(evaluations, f, indent=2)
                    logger.info(f"Analysis saved to {analysis_filename}")
                except Exception as e:
                    logger.error(f"Failed to save analysis file: {e}")

            # Run in thread so we don't block
            await asyncio.to_thread(run_eval)

        ctx.add_shutdown_callback(save_transcript)

    @staticmethod
    async def delete_room_via_api(ctx):
        try:
            await ctx.api.delete_room(room=ctx.room.name)
        except Exception:
            pass

    @staticmethod
    async def _history_contains_final_phrase(session) -> bool:
        try:
            hist = session.history.to_dict()
        except Exception:
            try:
                items = getattr(session.history, "items", [])
                for it in items:
                    if FINAL_PHRASE.lower() in str(it).lower():
                        return True
                return False
            except Exception:
                return False

        items = hist.get("items", []) if isinstance(hist, dict) else []
        phrase = FINAL_PHRASE.lower()
        for it in items:
            if isinstance(it, dict):
                for k in ("text", "content", "message", "body", "speech"):
                    v = it.get(k)
                    if v and phrase in str(v).lower():
                        return True
                if phrase in json.dumps(it, ensure_ascii=False).lower():
                    return True
            else:
                if phrase in str(it).lower():
                    return True
        return False

    @staticmethod
    async def entrypoint(ctx: agents.JobContext):
        metadata = {}
        if ctx.job.metadata:
            try:
                metadata = json.loads(ctx.job.metadata)
            except json.JSONDecodeError:
                metadata = {}

        await ctx.connect()

        llm = groq.LLM(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            temperature=0.2
        )

        assistant = InterviewAgent(metadata=metadata, llm=llm)

        session = AgentSession(
            stt=deepgram.STT(),
            llm=llm,
            tts=build_tts(),
            vad=silero.VAD.load(),
        )

        # avatar = anam.AvatarSession(
        #     persona_config=anam.PersonaConfig(
        #         name="Alister",
        #         avatarId="5701b9ca-c474-4b28-b108-4ca81911ca16",
        #     ),
        # )

        InterviewAgent.setup_transcript_saver(ctx, session, metadata)

        # await avatar.start(session, room=ctx.room)
        await session.start(
            room=ctx.room,
            agent=assistant,
            room_options=room_io.RoomOptions(
                audio_input=room_io.AudioInputOptions(
                    noise_cancellation=noise_cancellation.BVC()
                )
            )
        )

        initial_len = len(session.history.items)
        user_spoke = False

        while not user_spoke:
            await asyncio.sleep(0.2)
            if len(session.history.items) > initial_len:
                last = session.history.items[-1]
                if getattr(last, "role", None) == "user":
                    user_spoke = True

        timeout_minutes = int(os.getenv("INTERVIEW_TIMEOUT_MINUTES", "5"))
        deadline = datetime.utcnow() + timedelta(minutes=timeout_minutes)

        try:
            while True:
                if await InterviewAgent._history_contains_final_phrase(session):
                    await asyncio.sleep(1)
                    break

                if datetime.utcnow() > deadline:
                    try:
                        await session.generate_reply(
                            instructions=(
                                "It seems the interview has timed out. "
                                "Thank you for your time. This concludes our interview."
                            )
                        )
                        await asyncio.sleep(1)
                    except Exception:
                        pass
                    break

                await asyncio.sleep(1)

        finally:
            try:
                await session.aclose()
            except Exception:
                pass

            try:
                await InterviewAgent.delete_room_via_api(ctx)
            except Exception:
                pass

if __name__ == "__main__":
    port = find_free_port()
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=InterviewAgent.entrypoint,
            agent_name="interviewer-agent",
        )
    )
