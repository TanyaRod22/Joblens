from pydantic import BaseModel, Field
from typing import Optional


class ExperienceItem(BaseModel):
    title: str = ""
    company: str = ""
    bullets: list[str] = Field(default_factory=list)


class ProfilePreferences(BaseModel):
    target_roles: list[str] = Field(default_factory=list)
    industries: list[str] = Field(default_factory=list)


class Profile(BaseModel):
    name: str = ""
    headline: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    resume_text: str = ""
    preferences: ProfilePreferences = Field(default_factory=ProfilePreferences)


class JobRequest(BaseModel):
    title: str
    description: str
    company: str
    location: Optional[str] = None
    url: str
    profile: Optional[Profile] = None


class JobResponse(BaseModel):
    role_requirements: list[str] = Field(description="The requirements for the role")
    technical_skills: list[str] = Field(
        description="Short technical skill names only (1-3 words each, e.g. Python, PyTorch, AWS)"
    )
    why_role: str = Field(
        description=(
            "2-4 paragraphs (150-250 words) explaining why this role fits the candidate. "
            "Name 3+ of their skills and reference 1-2 concrete experience details."
        )
    )
    why_company: str = Field(
        description=(
            "2-4 paragraphs (150-250 words) explaining why this company fits the candidate. "
            "Tie company mission/product to their background and goals."
        )
    )
    cold_email_points: list[str] = Field(description="The points to include in the cold email")
    questions_to_ask: list[str] = Field(description="The questions to ask the hiring manager")


class JobWithProfileRequest(BaseModel):
    title: str
    description: str
    company: str
    location: Optional[str] = None
    url: str
    profile: Profile


class FitScoreResponse(BaseModel):
    score: int = Field(ge=0, le=100, description="0-100 fit score for this role")
    matched_skills: list[str] = Field(description="Skills from the profile that match the job")
    missing_skills: list[str] = Field(description="Important job skills not evident in the profile")
    summary: str = Field(description="One sentence explaining the fit score")


class ResumeBulletSuggestion(BaseModel):
    original: str = Field(default="", description="Original bullet if rewriting an existing one")
    suggested: str = Field(description="Suggested resume bullet text")
    rationale: str = Field(description="Why this change improves fit for the role")
    experience_index: Optional[int] = Field(
        default=None,
        description="0-based index of the experience entry this suggestion applies to",
    )
    bullet_index: Optional[int] = Field(
        default=None,
        description="0-based index of the bullet being rewritten; null when adding a new bullet",
    )
    is_new_bullet: bool = Field(
        default=False,
        description="True when this suggestion should be appended as a new bullet",
    )


class ImprovementsResponse(BaseModel):
    suggestions: list[ResumeBulletSuggestion] = Field(
        description="Concrete resume bullet suggestions tailored to the role"
    )


class ImprovementsRequest(JobWithProfileRequest):
    fit_score: Optional[int] = Field(default=None, ge=0, le=100)
    matched_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)


class ColdEmailRequest(JobWithProfileRequest):
    cold_email_points: list[str] = Field(default_factory=list)


class ColdEmailResponse(BaseModel):
    subject: str = Field(description="Email subject line")
    body: str = Field(description="Full cold email draft")


class CoverLetterResponse(BaseModel):
    body: str = Field(description="Full cover letter draft")


class ParseResumeResponse(Profile):
    pass


class ChatMessage(BaseModel):
    role: str = Field(description="Message role: user or assistant")
    content: str = Field(description="Message text")


class InterviewChatRequest(BaseModel):
    title: str
    description: str
    company: str
    location: Optional[str] = None
    url: str
    profile: Optional[Profile] = None
    messages: list[ChatMessage] = Field(
        description="Conversation history including the latest user message"
    )


class InterviewChatResponse(BaseModel):
    answer: str = Field(
        description="Structured, ready-to-adapt answer to the candidate's question"
    )
