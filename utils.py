from groq import Groq
from dotenv import load_dotenv

import os

load_dotenv()

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

async def generate_interview_questions(job_title: str, job_desc: str):
    prompt = f"""
    Generate exactly 3 technical interview questions for the role "{job_title}".
    Job description: {job_desc}
    Each question must be one sentence and should test practical skills.
    Provide only a numbered list of 3 questions.
    but These questions should be concise and to the point. Do not include any additional text or explanations.
    """

    resp = groq_client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
        max_completion_tokens=300,
    )

    text = resp.choices[0].message.content
    questions = [
        line.strip(" -0123456789.")
        for line in text.split("\n")
        if line.strip()
    ]

    return questions[:3]
