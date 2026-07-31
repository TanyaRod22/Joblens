import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from openai_client import (
    analyze_job,
    generate_cold_email,
    generate_cover_letter,
    interview_chat,
    parse_resume,
    score_fit,
    suggest_improvements,
)
from rate_limit import is_rate_limited
from resume_parser import extract_text_from_upload
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

router = APIRouter()
app = FastAPI(title="JobScrapper API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins else ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _check_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    if is_rate_limited(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Try again in a minute.",
        )


def _validate_description(description: str) -> None:
    if len(description.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Job description is too short to analyze.",
        )


PRIVACY_POLICY_PATH = Path(__file__).parent / "privacy_policy.html"


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/privacy", response_class=HTMLResponse)
async def privacy_policy():
    return PRIVACY_POLICY_PATH.read_text(encoding="utf-8")


@router.post("/analyze-job", response_model=JobResponse)
async def get_job_response(job_request: JobRequest, request: Request):
    _check_rate_limit(request)
    _validate_description(job_request.description)

    try:
        return await analyze_job(job_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to analyze job") from e


@router.post("/score-fit", response_model=FitScoreResponse)
async def get_fit_score(job_request: JobWithProfileRequest, request: Request):
    _check_rate_limit(request)
    _validate_description(job_request.description)

    try:
        return await score_fit(job_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to score fit") from e


@router.post("/suggest-improvements", response_model=ImprovementsResponse)
async def get_improvements(improvements_request: ImprovementsRequest, request: Request):
    _check_rate_limit(request)
    _validate_description(improvements_request.description)

    try:
        return await suggest_improvements(improvements_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to suggest improvements") from e


@router.post("/generate-cold-email", response_model=ColdEmailResponse)
async def get_cold_email(cold_email_request: ColdEmailRequest, request: Request):
    _check_rate_limit(request)
    _validate_description(cold_email_request.description)

    try:
        return await generate_cold_email(cold_email_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate cold email") from e


@router.post("/generate-cover-letter", response_model=CoverLetterResponse)
async def get_cover_letter(cover_letter_request: JobWithProfileRequest, request: Request):
    _check_rate_limit(request)
    _validate_description(cover_letter_request.description)

    try:
        return await generate_cover_letter(cover_letter_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate cover letter") from e


@router.post("/interview-chat", response_model=InterviewChatResponse)
async def get_interview_chat(chat_request: InterviewChatRequest, request: Request):
    _check_rate_limit(request)
    _validate_description(chat_request.description)

    if not chat_request.messages:
        raise HTTPException(status_code=400, detail="At least one message is required.")

    last = chat_request.messages[-1]
    if (last.role or "").strip().lower() != "user" or not (last.content or "").strip():
        raise HTTPException(status_code=400, detail="Conversation must end with a user message.")

    try:
        return await interview_chat(chat_request)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to generate interview answer") from e


@router.post("/parse-resume", response_model=ParseResumeResponse)
async def get_parsed_resume(request: Request, file: UploadFile = File(...)):
    _check_rate_limit(request)

    try:
        content = await file.read()
        resume_text = extract_text_from_upload(file, content)

        if len(resume_text) < 50:
            raise HTTPException(status_code=400, detail="Resume text is too short to parse.")

        result = await parse_resume(resume_text)
        if not result.resume_text:
            result.resume_text = resume_text
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to parse resume") from e


app.include_router(router)
