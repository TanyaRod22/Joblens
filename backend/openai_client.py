import os

from dotenv import load_dotenv
from openai import AsyncOpenAI

from prompts import (
    COLD_EMAIL_SYSTEM_PROMPT,
    COVER_LETTER_SYSTEM_PROMPT,
    FIT_SCORE_SYSTEM_PROMPT,
    IMPROVEMENTS_SYSTEM_PROMPT,
    PARSE_RESUME_SYSTEM_PROMPT,
    build_cold_email_prompt,
    build_cover_letter_prompt,
    build_fit_score_prompt,
    build_improvements_prompt,
    build_interview_chat_system_prompt,
    build_parse_resume_prompt,
    build_system_prompt,
    build_user_prompt,
)
from schemas import (
    ColdEmailRequest,
    ColdEmailResponse,
    CoverLetterResponse,
    FitScoreResponse,
    ImprovementsRequest,
    ImprovementsResponse,
    InterviewChatRequest,
    InterviewChatResponse,
    JobRequest,
    JobResponse,
    JobWithProfileRequest,
    ParseResumeResponse,
)

load_dotenv()

_client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


async def _parse_completion(system: str, user: str, response_format):
    completion = await _client.beta.chat.completions.parse(
        model=MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format=response_format,
    )
    result = completion.choices[0].message.parsed
    if result is None:
        raise ValueError("OpenAI returned no parsed response")
    return result


async def analyze_job(job: JobRequest) -> JobResponse:
    return await _parse_completion(
        build_system_prompt(job),
        build_user_prompt(job),
        JobResponse,
    )


async def score_fit(job: JobRequest) -> FitScoreResponse:
    if not job.profile:
        raise ValueError("Profile is required for fit scoring")
    return await _parse_completion(
        FIT_SCORE_SYSTEM_PROMPT,
        build_fit_score_prompt(job),
        FitScoreResponse,
    )


async def suggest_improvements(request: ImprovementsRequest) -> ImprovementsResponse:
    return await _parse_completion(
        IMPROVEMENTS_SYSTEM_PROMPT,
        build_improvements_prompt(request),
        ImprovementsResponse,
    )


async def generate_cold_email(request: ColdEmailRequest) -> ColdEmailResponse:
    return await _parse_completion(
        COLD_EMAIL_SYSTEM_PROMPT,
        build_cold_email_prompt(request),
        ColdEmailResponse,
    )


async def generate_cover_letter(request: JobWithProfileRequest) -> CoverLetterResponse:
    return await _parse_completion(
        COVER_LETTER_SYSTEM_PROMPT,
        build_cover_letter_prompt(request),
        CoverLetterResponse,
    )


async def parse_resume(resume_text: str) -> ParseResumeResponse:
    if len(resume_text.strip()) < 50:
        raise ValueError("Resume text is too short to parse")
    return await _parse_completion(
        PARSE_RESUME_SYSTEM_PROMPT,
        build_parse_resume_prompt(resume_text),
        ParseResumeResponse,
    )


async def interview_chat(request: InterviewChatRequest) -> InterviewChatResponse:
    if not request.messages:
        raise ValueError("At least one message is required")

    allowed_roles = {"user", "assistant"}
    chat_messages = [{"role": "system", "content": build_interview_chat_system_prompt(request)}]
    for message in request.messages[-12:]:
        role = (message.role or "").strip().lower()
        content = (message.content or "").strip()
        if role not in allowed_roles or not content:
            continue
        chat_messages.append({"role": role, "content": content})

    if len(chat_messages) < 2 or chat_messages[-1]["role"] != "user":
        raise ValueError("Conversation must end with a user message")

    completion = await _client.beta.chat.completions.parse(
        model=MODEL,
        messages=chat_messages,
        response_format=InterviewChatResponse,
    )
    result = completion.choices[0].message.parsed
    if result is None:
        raise ValueError("OpenAI returned no parsed response")
    return result
