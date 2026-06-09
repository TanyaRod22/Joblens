from schemas import JobRequest, Profile


SYSTEM_PROMPT = """
You analyze job postings to help candidates prepare for interviews and cold outreach.
Return concise, actionable output.
Focus on what the role actually requires, not generic advice.
For technical_skills, return only short skill names (1-3 words each), never full sentences.
""".strip()

PROFILE_SYSTEM_SUFFIX = """
When a candidate profile is provided, personalize all output to their background.
Tie why_role and cold_email_points to their specific experience, skills, and career goals.
Reference concrete details from their profile rather than generic advice.
""".strip()

FIT_SCORE_SYSTEM_PROMPT = """
You compare a job posting against a candidate profile and produce an honest fit assessment.
Score 0-100 based on skills overlap, relevant experience, and role alignment.
Be specific about matched and missing skills — use short skill names (1-3 words).
""".strip()

IMPROVEMENTS_SYSTEM_PROMPT = """
You suggest concrete resume bullet rewrites to improve a candidate's fit for a specific role.
Each suggestion should be actionable, quantified where possible, and tied to job requirements.
Prefer rewriting existing bullets when relevant experience exists; suggest new bullets for gaps.
""".strip()

COLD_EMAIL_SYSTEM_PROMPT = """
You write concise, professional cold outreach emails for job applications.
Keep emails under 200 words, warm but not overly casual, and specific to the role and candidate.
Include a clear ask (conversation, referral, or application follow-up).
""".strip()

PARSE_RESUME_SYSTEM_PROMPT = """
You extract structured profile information from resume text.
Infer name, headline, summary, skills, experience entries with bullets, and target preferences when possible.
Include the original resume text in resume_text.
Leave fields empty when information is not present — do not invent details.
""".strip()

COVER_LETTER_SYSTEM_PROMPT = """
You write tailored cover letters for job applications.
Keep letters under 400 words, professional, and specific to the role and candidate background.
Structure: opening hook, relevant experience, why this company, closing call to action.
""".strip()


def format_profile(profile: Profile) -> str:
    lines = []
    if profile.name:
        lines.append(f"Name: {profile.name}")
    if profile.headline:
        lines.append(f"Headline: {profile.headline}")
    if profile.summary:
        lines.append(f"Summary: {profile.summary}")
    if profile.skills:
        lines.append(f"Skills: {', '.join(profile.skills)}")
    if profile.experience:
        lines.append("Experience:")
        for exp in profile.experience:
            lines.append(f"  - {exp.title} at {exp.company}")
            for bullet in exp.bullets:
                lines.append(f"    • {bullet}")
    if profile.resume_text:
        lines.append(f"Resume text:\n{profile.resume_text}")
    if profile.preferences.target_roles:
        lines.append(f"Target roles: {', '.join(profile.preferences.target_roles)}")
    if profile.preferences.industries:
        lines.append(f"Target industries: {', '.join(profile.preferences.industries)}")
    return "\n".join(lines) if lines else "No profile details provided."


def build_job_block(job: JobRequest) -> str:
    location = job.location or "Not specified"
    return f"""
Title: {job.title}
Company: {job.company}
Location: {location}
URL: {job.url}

Description:
{job.description}
""".strip()


def build_user_prompt(job: JobRequest) -> str:
    prompt = f"Analyze this job posting:\n\n{build_job_block(job)}"
    if job.profile:
        prompt += f"\n\nCandidate profile (personalize output to this person):\n{format_profile(job.profile)}"
    return prompt.strip()


def build_system_prompt(job: JobRequest) -> str:
    if job.profile:
        return f"{SYSTEM_PROMPT}\n\n{PROFILE_SYSTEM_SUFFIX}"
    return SYSTEM_PROMPT


def build_fit_score_prompt(job: JobRequest) -> str:
    return f"""
Score how well this candidate fits this job.

Job posting:
{build_job_block(job)}

Candidate profile:
{format_profile(job.profile)}
""".strip()


def build_improvements_prompt(request) -> str:
    fit_context = ""
    if request.fit_score is not None:
        fit_context = f"""
Fit score: {request.fit_score}/100
Matched skills: {', '.join(request.matched_skills) or 'None'}
Missing skills: {', '.join(request.missing_skills) or 'None'}
"""
    return f"""
Suggest resume bullet improvements for this candidate applying to this role.
{fit_context}
Job posting:
{build_job_block(request)}

Candidate profile:
{format_profile(request.profile)}
""".strip()


def build_cold_email_prompt(request) -> str:
    points = ""
    if request.cold_email_points:
        points = "Talking points to weave in:\n" + "\n".join(
            f"- {p}" for p in request.cold_email_points
        )
    return f"""
Write a cold outreach email for this candidate applying to this role.

Job posting:
{build_job_block(request)}

Candidate profile:
{format_profile(request.profile)}

{points}
""".strip()


def build_parse_resume_prompt(resume_text: str) -> str:
    return f"""
Extract structured profile fields from this resume:

{resume_text}
""".strip()


def build_cover_letter_prompt(request) -> str:
    return f"""
Write a cover letter for this candidate applying to this role.

Job posting:
{build_job_block(request)}

Candidate profile:
{format_profile(request.profile)}
""".strip()
