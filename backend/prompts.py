from schemas import JobRequest, Profile


SYSTEM_PROMPT = """
You analyze job postings to help candidates prepare for interviews and cold outreach.
Return actionable output.
Focus on what the role actually requires, not generic advice.
For technical_skills, return only short skill names (1-3 words each), never full sentences.
Keep role_requirements, cold_email_points, and questions_to_ask concise.
""".strip()

PROFILE_SYSTEM_SUFFIX = """
When a candidate profile is provided, personalize all output to their background.
Reference concrete details from their profile rather than generic advice.

For why_role and why_company specifically:
- Write 2-4 paragraphs each (about 150-250 words).
- Name at least 3 skills from the candidate profile by name.
- Reference 1-2 specific experience bullets or roles that map to this job.
- Tie the narrative to growth, impact, and skill stretch for why_role.
- Tie company mission, product, or domain to the candidate's goals for why_company.
- Avoid filler like "great culture" or "exciting opportunity" without evidence from the posting or profile.
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

Always set experience_index to the 0-based experience entry the change belongs to.
When rewriting an existing bullet, set bullet_index to that bullet's 0-based index and is_new_bullet=false.
When adding a new bullet, set is_new_bullet=true and leave bullet_index null.
Copy the original bullet text exactly into original when rewriting.
Return 3-6 high-impact suggestions.
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

INTERVIEW_CHAT_SYSTEM_PROMPT = """
You are an interview and application coach helping a candidate answer questions about a specific job.
You have the job posting and (when provided) the candidate's profile.

For application/interview questions (e.g. "What interests you about this role?", "Why this company?",
"Tell me about yourself", "Walk me through your experience"):
- Give a structured, ready-to-adapt answer the candidate can say or paste.
- Prefer a clear structure: short opening, 2–3 concrete evidence points tied to the job/profile, brief close.
- Keep answers roughly 120–220 words unless the user asks for shorter or longer.
- Reference real skills, experience, and job details — never invent employers, metrics, or achievements.
- If no profile is provided, write a strong generic template with clear placeholders like [your project].

For follow-ups (shorter, more technical, more personal, etc.):
- Revise the previous answer accordingly; do not restart from scratch unless asked.
- Stay conversational and coach-like; you may briefly note what you changed.

Stay on topic: interview prep and application answers for this role. Decline unrelated requests briefly.
""".strip()


def format_profile(profile: Profile, include_indices: bool = False) -> str:
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
        for exp_index, exp in enumerate(profile.experience):
            header = f"  [{exp_index}] {exp.title} at {exp.company}" if include_indices else f"  - {exp.title} at {exp.company}"
            lines.append(header)
            for bullet_index, bullet in enumerate(exp.bullets):
                if include_indices:
                    lines.append(f"    [{bullet_index}] • {bullet}")
                else:
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
Use the indexed experience entries and bullets below when setting experience_index and bullet_index.
{fit_context}
Job posting:
{build_job_block(request)}

Candidate profile (indexed):
{format_profile(request.profile, include_indices=True)}
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


def build_interview_chat_system_prompt(request) -> str:
    context = f"Job posting:\n{build_job_block(request)}"
    if request.profile:
        context += f"\n\nCandidate profile:\n{format_profile(request.profile)}"
    else:
        context += (
            "\n\nNo candidate profile was provided. "
            "Use clear placeholders where personal details are needed."
        )
    return f"{INTERVIEW_CHAT_SYSTEM_PROMPT}\n\n{context}".strip()
