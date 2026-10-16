const MATCHES_MAX_JOBS = 24;
const MATCHES_BATCH_SIZE = 4;

let matchesScanAbort = false;
let matchesResults = [];
let matchesMeta = {
  totalFound: 0,
  scored: 0,
  boardLabel: "",
  source: "",
};

function escapeMatchHtml(value) {
  if (typeof escapeHtml === "function") return escapeHtml(value);
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtmlEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value || "";
  return textarea.value;
}

function stripHtmlBasic(html) {
  const decoded = decodeHtmlEntities(html || "");
  return decoded
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMatchSlug(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function absoluteUrl(href, base = window.location.href) {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function dedupeJobsByUrl(jobs) {
  const seen = new Set();
  const result = [];
  for (const job of jobs) {
    const key = String(job.url || "")
      .split("?")[0]
      .split("#")[0]
      .replace(/\/$/, "")
      .toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(job);
  }
  return result;
}

async function fetchTextViaBackground(url) {
  const response = await chrome.runtime.sendMessage({
    action: "fetch-text",
    url,
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Failed to fetch board data");
  }
  return response.data;
}

async function fetchJsonViaBackground(url) {
  const data = await fetchTextViaBackground(url);
  try {
    return JSON.parse(data.text);
  } catch {
    throw new Error("Board API returned invalid JSON");
  }
}

function detectPageMode() {
  const host = window.location.hostname;
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  const segments = path.split("/").filter(Boolean);

  if (host.includes("greenhouse.io")) {
    // Detail: /company/jobs/123 or /embed/job_app?token=...
    if (/\/jobs\/\d+/i.test(path) || /job_app/i.test(path) || /gh_jid=/i.test(window.location.search)) {
      return { mode: "detail", ats: "greenhouse" };
    }
    if (segments.length >= 1) {
      return { mode: "board", ats: "greenhouse", token: segments[0] };
    }
  }

  if (host.includes("lever.co")) {
    // Detail: /company/uuid
    if (segments.length >= 2 && /^[a-f0-9-]{10,}$/i.test(segments[1])) {
      return { mode: "detail", ats: "lever" };
    }
    if (segments.length >= 1) {
      return { mode: "board", ats: "lever", token: segments[0] };
    }
  }

  if (host.includes("ashbyhq.com")) {
    // Detail often: /company/uuid or /company/job-title-slug
    if (segments.length >= 2) {
      return { mode: "detail", ats: "ashby" };
    }
    if (segments.length === 1) {
      return { mode: "board", ats: "ashby", token: segments[0] };
    }
  }

  if (host.includes("linkedin.com")) {
    const listed = scrapeLinkedInBoard(companyFromBoardPage("LinkedIn"));
    if (listed.length >= 2 || /\/jobs\/(search|collections)/i.test(path)) {
      return { mode: listed.length >= 1 ? "board" : "detail", ats: "linkedin" };
    }
    return { mode: "detail", ats: "linkedin" };
  }

  if (host.includes("indeed.com")) {
    const listed = scrapeIndeedBoard(companyFromBoardPage("Indeed"));
    if (listed.length >= 2 || /\/jobs/i.test(path)) {
      return { mode: listed.length >= 1 ? "board" : "detail", ats: "indeed" };
    }
    return { mode: "detail", ats: "indeed" };
  }

  if (host.includes("myworkdayjobs.com")) {
    const listed = scrapeWorkdayBoard(companyFromBoardPage("Workday"));
    if (listed.length >= 2) return { mode: "board", ats: "workday" };
    return { mode: "detail", ats: "workday" };
  }

  if (host.includes("joinhandshake.com")) {
    const listed = scrapeHandshakeBoard(companyFromBoardPage("Handshake"));
    if (listed.length >= 2 || /job|posting|search/i.test(path)) {
      return { mode: listed.length >= 1 ? "board" : "detail", ats: "handshake" };
    }
    return { mode: "detail", ats: "handshake" };
  }

  return { mode: "detail", ats: "unknown" };
}

function companyFromBoardPage(fallback) {
  const heading = document.querySelector("h1")?.textContent?.trim();
  if (heading && heading.length < 60 && !/search|jobs|careers/i.test(heading)) return heading;
  return fallback;
}

function pushBoardJob(jobs, job) {
  if (!job?.title || !job?.url) return;
  if (job.title.length < 2 || job.title.length > 160) return;
  jobs.push(job);
}

function scrapeLinkedInBoard(company) {
  const jobs = [];
  const cards = document.querySelectorAll(
    ".job-card-container, .jobs-search-results__list-item, li.scaffold-layout__list-item"
  );
  cards.forEach((el) => {
    const link =
      el.querySelector('a.job-card-list__title, a.job-card-container__link, a[href*="/jobs/view/"]') ||
      el.querySelector("a[href]");
    if (!link?.href) return;
    const title =
      link.getAttribute("aria-label")?.replace(/\s+with verification.*$/i, "").trim() ||
      link.textContent?.trim();
    const cardCompany =
      el.querySelector(".artdeco-entity-lockup__subtitle, .job-card-container__primary-description")
        ?.textContent?.trim() || company;
    const location =
      el.querySelector(".job-card-container__metadata-item, .job-card-container__metadata-wrapper li")
        ?.textContent?.trim() || null;
    const snippet =
      el.querySelector(".job-card-list__snippet, .job-card-container__description")?.textContent?.trim() ||
      "";
    pushBoardJob(jobs, {
      title,
      company: cardCompany,
      location,
      department: null,
      url: absoluteUrl(link.href),
      description: snippet,
    });
  });
  return jobs;
}

function scrapeIndeedBoard(company) {
  const jobs = [];
  document.querySelectorAll(".job_seen_beacon, .tapItem, .result").forEach((el) => {
    const link = el.querySelector("a.jcs-JobTitle, h2 a, a[href*='/rc/clk'], a[href*='viewjob']");
    if (!link?.href) return;
    const title = link.textContent?.trim();
    const cardCompany = el.querySelector('[data-testid="company-name"], .companyName')?.textContent?.trim() || company;
    const location = el.querySelector('[data-testid="text-location"], .companyLocation')?.textContent?.trim() || null;
    const snippet = el.querySelector(".job-snippet, [data-testid='jobsnippet']")?.textContent?.trim() || "";
    pushBoardJob(jobs, {
      title,
      company: cardCompany,
      location,
      department: null,
      url: absoluteUrl(link.href),
      description: snippet,
    });
  });
  return jobs;
}

function scrapeWorkdayBoard(company) {
  const jobs = [];
  document.querySelectorAll('a[data-automation-id="jobTitle"], li[data-automation-id="jobItem"]').forEach((el) => {
    const link = el.matches("a") ? el : el.querySelector("a");
    if (!link?.href) return;
    const title = link.textContent?.trim();
    const location =
      el.querySelector('[data-automation-id="locations"], [data-automation-id="location"]')?.textContent?.trim() ||
      null;
    pushBoardJob(jobs, {
      title,
      company,
      location,
      department: null,
      url: absoluteUrl(link.href),
      description: "",
    });
  });
  return jobs;
}

function scrapeHandshakeBoard(company) {
  const jobs = [];
  const cards = document.querySelectorAll(
    '[data-hook*="job-result-card"], [data-hook*="search-result"], [data-testid*="job-card"], a[href*="/jobs/"]'
  );
  cards.forEach((el) => {
    const link = el.matches("a") ? el : el.querySelector('a[href*="/jobs/"], a[href*="/job/"]');
    if (!link?.href) return;
    if (/\/jobs\/?$/i.test(link.pathname || "")) return;
    const title =
      el.querySelector("h2, h3, [data-hook*='job-title'], [data-testid*='job-title']")?.textContent?.trim() ||
      link.textContent?.trim();
    const cardCompany =
      el.querySelector("[data-hook*='employer'], [data-testid*='employer']")?.textContent?.trim() || company;
    const location = el.querySelector("[data-hook*='location'], [data-testid*='location']")?.textContent?.trim() || null;
    const snippet = el.querySelector("p")?.textContent?.trim() || "";
    pushBoardJob(jobs, {
      title: title?.split("\n")[0]?.trim(),
      company: cardCompany,
      location,
      department: null,
      url: absoluteUrl(link.href),
      description: snippet && snippet !== title ? snippet.slice(0, 500) : "",
    });
  });
  return jobs;
}

function scrapeGreenhouseBoardDom(company) {
  const jobs = [];
  const openings = document.querySelectorAll(
    '[data-qa="opening"], .opening, tr.job-post, .job-posts .job-post'
  );

  openings.forEach((el) => {
    const link =
      el.querySelector('a[data-qa="opening-list-title"]') ||
      el.querySelector("a[href*='/jobs/']") ||
      el.querySelector("a[href]");
    if (!link?.href) return;

    const title =
      link.textContent?.trim() ||
      el.querySelector('[data-qa="opening-list-title"], .opening-title, a')?.textContent?.trim();
    if (!title) return;

    const location =
      el.querySelector('[data-qa="opening-list-location"], .location, .body--metadata')?.textContent?.trim() ||
      null;
    const department =
      el.closest("section")?.querySelector("h3, h2, .department")?.textContent?.trim() || null;

    jobs.push({
      title,
      company,
      location,
      department,
      url: absoluteUrl(link.href),
      description: "",
    });
  });

  return jobs;
}

function scrapeLeverBoardDom(company) {
  const jobs = [];
  document.querySelectorAll(".posting, .lever-posting").forEach((el) => {
    const link = el.querySelector("a.posting-title, a[href*='/']");
    if (!link?.href) return;
    const title =
      link.querySelector("h5")?.textContent?.trim() ||
      link.textContent?.trim() ||
      el.querySelector("h5")?.textContent?.trim();
    if (!title) return;
    const location =
      el.querySelector(".posting-categories .location, .sorting-location, span.location")?.textContent?.trim() ||
      null;
    const department =
      el.querySelector(".posting-categories .department, .sorting-department")?.textContent?.trim() || null;

    jobs.push({
      title,
      company,
      location,
      department,
      url: absoluteUrl(link.href),
      description: "",
    });
  });
  return jobs;
}

function scrapeAshbyBoardDom(company) {
  const jobs = [];
  const anchors = document.querySelectorAll('a[href*="/"]');
  anchors.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (!href || href === "/" || href.startsWith("#")) return;
    // Ashby job links are usually /company/<id-or-slug>
    const path = href.replace(window.location.origin, "");
    const parts = path.split("/").filter(Boolean);
    if (parts.length < 2) return;
    if (parts[0].toLowerCase() !== company.replace(/\s+/g, "").toLowerCase() && parts[0] !== detectPageMode().token) {
      // still allow if path looks like a job under current board token
      const token = detectPageMode().token;
      if (!token || parts[0] !== token) return;
    }

    const title = link.textContent?.trim();
    if (!title || title.length < 3 || title.length > 120) return;
    // Skip nav-ish links
    if (/^(home|about|careers|jobs|apply|login)$/i.test(title)) return;

    const card = link.closest("div, li, article, section") || link.parentElement;
    const location =
      card?.querySelector('[class*="location"], [class*="Location"]')?.textContent?.trim() || null;

    jobs.push({
      title,
      company,
      location,
      department: null,
      url: absoluteUrl(link.href),
      description: "",
    });
  });
  return jobs;
}

async function fetchGreenhouseJobs(token) {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
  const payload = await fetchJsonViaBackground(apiUrl);
  const company = formatMatchSlug(token);
  const jobs = (payload.jobs || []).map((job) => ({
    title: job.title || "Untitled role",
    company: job.company_name || company,
    location: job.location?.name || null,
    department: (job.departments || []).map((d) => d.name).filter(Boolean).join(", ") || null,
    url: job.absolute_url || `https://job-boards.greenhouse.io/${token}/jobs/${job.id}`,
    description: stripHtmlBasic(job.content || ""),
  }));
  return { jobs, company, source: "greenhouse-api" };
}

async function fetchLeverJobs(token) {
  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`;
  const payload = await fetchJsonViaBackground(apiUrl);
  const company = formatMatchSlug(token);
  const list = Array.isArray(payload) ? payload : [];
  const jobs = list.map((job) => {
    const lists = job.lists || [];
    const descriptionParts = [
      job.descriptionPlain || stripHtmlBasic(job.description || ""),
      ...lists.map((item) => `${item.text || ""}\n${item.content || ""}`.trim()),
      job.additionalPlain || stripHtmlBasic(job.additional || ""),
    ].filter(Boolean);

    return {
      title: job.text || "Untitled role",
      company,
      location: job.categories?.location || null,
      department: job.categories?.department || job.categories?.team || null,
      url: job.hostedUrl || job.applyUrl || `https://jobs.lever.co/${token}/${job.id}`,
      description: descriptionParts.join("\n\n").trim(),
    };
  });
  return { jobs, company, source: "lever-api" };
}

async function fetchAshbyJobs(token) {
  const apiUrl = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(token)}?includeCompensation=true`;
  const payload = await fetchJsonViaBackground(apiUrl);
  const company = payload.organizationName || formatMatchSlug(token);
  const jobs = (payload.jobs || []).map((job) => ({
    title: job.title || "Untitled role",
    company,
    location: job.location || job.address?.postalAddress || null,
    department: job.department || job.team || null,
    url: job.jobUrl || `https://jobs.ashbyhq.com/${token}/${job.id}`,
    description: stripHtmlBasic(job.descriptionHtml || job.descriptionPlain || ""),
  }));
  return { jobs, company, source: "ashby-api" };
}

async function loadBoardJobs() {
  const page = detectPageMode();
  if (page.mode !== "board") {
    return {
      ok: false,
      reason: "not-board",
      message:
        "Open a careers listing (Greenhouse, Lever, Ashby, Handshake, LinkedIn Jobs, Indeed, or Workday) to find matches.",
    };
  }

  const token = page.token;
  const companyGuess = formatMatchSlug(token);

  try {
    if (page.ats === "greenhouse") {
      const result = await fetchGreenhouseJobs(token);
      return {
        ok: true,
        ...result,
        jobs: dedupeJobsByUrl(result.jobs).slice(0, MATCHES_MAX_JOBS),
        boardLabel: result.company,
      };
    }
    if (page.ats === "lever") {
      const result = await fetchLeverJobs(token);
      return {
        ok: true,
        ...result,
        jobs: dedupeJobsByUrl(result.jobs).slice(0, MATCHES_MAX_JOBS),
        boardLabel: result.company,
      };
    }
    if (page.ats === "ashby") {
      const result = await fetchAshbyJobs(token);
      return {
        ok: true,
        ...result,
        jobs: dedupeJobsByUrl(result.jobs).slice(0, MATCHES_MAX_JOBS),
        boardLabel: result.company,
      };
    }
  } catch (apiError) {
    console.warn("Board API failed, falling back to DOM scrape:", apiError);
  }

  // DOM listings. Snippets only — full descriptions are not fetched for every card.
  let domJobs = [];
  const siteLabel =
    {
      linkedin: "LinkedIn",
      indeed: "Indeed",
      workday: "Workday",
      handshake: "Handshake",
    }[page.ats] || companyGuess || "This board";
  if (page.ats === "greenhouse") domJobs = scrapeGreenhouseBoardDom(companyGuess);
  if (page.ats === "lever") domJobs = scrapeLeverBoardDom(companyGuess);
  if (page.ats === "ashby") domJobs = scrapeAshbyBoardDom(companyGuess);
  if (page.ats === "linkedin") domJobs = scrapeLinkedInBoard(siteLabel);
  if (page.ats === "indeed") domJobs = scrapeIndeedBoard(siteLabel);
  if (page.ats === "workday") domJobs = scrapeWorkdayBoard(siteLabel);
  if (page.ats === "handshake") domJobs = scrapeHandshakeBoard(siteLabel);

  const jobs = dedupeJobsByUrl(domJobs).slice(0, MATCHES_MAX_JOBS);
  if (!jobs.length) {
    return {
      ok: false,
      reason: "empty",
      message: "No job listings found on this page. Try scrolling to load more roles, then scan again.",
    };
  }

  return {
    ok: true,
    jobs,
    company: siteLabel,
    source: `${page.ats}-dom`,
    boardLabel: siteLabel,
  };
}

const AI_REFINE_LIMIT = 4;
const STUDENT_TITLE = /\b(intern|internship|new grad|new-grad|entry[- ]level|university|campus|co-op|coop|new graduate)\b/i;

function inferRoleType(title) {
  const text = String(title || "");
  if (/\bintern/i.test(text)) return "Internship";
  if (/\b(new grad|new-grad|entry|new graduate|university grad|campus)\b/i.test(text)) return "New grad";
  return "Full-time";
}

function localStudentFit(job, profile) {
  const haystack = `${job.title || ""} ${job.department || ""} ${job.location || ""} ${job.description || ""}`.toLowerCase();
  const skills = (profile?.skills || []).map((skill) => String(skill).trim()).filter((skill) => skill.length >= 2);
  const matched = skills.filter((skill) => haystack.includes(skill.toLowerCase()));
  const reasons = [];
  let score = 42;

  if (matched.length) {
    score += Math.min(36, matched.length * 9);
    reasons.push(`Matches ${matched.slice(0, 3).join(", ")}`);
  }

  const headline = `${profile?.headline || ""} ${(profile?.preferences?.target_roles || []).join(" ")}`.toLowerCase();
  const titleWords = String(job.title || "")
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .filter((word) => word.length > 3);
  const titleHits = titleWords.filter((word) => headline.includes(word));
  if (titleHits.length) {
    score += 8;
    reasons.push(`Title lines up with ${titleHits.slice(0, 2).join(", ")}`);
  }

  if (STUDENT_TITLE.test(job.title || "")) {
    score += 8;
    reasons.push("Internship or new-grad posting");
  }

  const evidence = [
    profile?.summary || "",
    profile?.resume_text || "",
    ...(profile?.experience || []).flatMap((entry) => [entry.title || "", ...(entry.bullets || [])]),
  ]
    .join(" ")
    .toLowerCase();
  if (/\b(project|course|coursework|research|intern)\b/.test(evidence)) {
    score += 6;
    reasons.push("Coursework, project, or internship on your profile counts");
  }

  const years = haystack.match(/(\d+)\+?\s+years/);
  const earlyCareer = (profile?.experience || []).length <= 2;
  if (years && Number(years[1]) >= 4 && earlyCareer && !STUDENT_TITLE.test(job.title || "")) {
    score -= 8;
    reasons.push(`Posting asks for ${years[1]}+ years`);
  }

  if (!reasons.length) reasons.push("Scored from the listing title and your profile");
  if ((job.description || "").trim().length < 80) {
    reasons.push("Listing snippet only — open the job for the full description");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    ...job,
    score,
    matched_skills: matched.slice(0, 6),
    missing_skills: [],
    summary: reasons.slice(0, 3).join(". "),
    scoreSource: "quick",
    roleType: inferRoleType(job.title),
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function scoreClassForMatch(score) {
  if (score >= 75) return "jsp-fit-high";
  if (score >= 50) return "jsp-fit-mid";
  return "jsp-fit-low";
}

function renderMatchSkills(skills) {
  const list = (skills || []).slice(0, 4);
  if (!list.length) return "";
  return `<ul class="jsp-match-skills">${list
    .map((skill) => `<li class="jsp-match-skill">${escapeMatchHtml(String(skill))}</li>`)
    .join("")}</ul>`;
}

function setMatchesStatus(text, options = {}) {
  const el = document.getElementById("jsp-matches-status");
  if (!el) return;
  if (!text) {
    el.classList.add("jsp-hidden");
    el.textContent = "";
    return;
  }
  el.textContent = text;
  el.classList.remove("jsp-hidden");
  el.classList.toggle("jsp-matches-status-error", Boolean(options.error));
}

function setMatchesProgress(done, total) {
  const wrap = document.getElementById("jsp-matches-progress");
  const label = document.getElementById("jsp-matches-progress-label");
  const bar = document.getElementById("jsp-matches-progress-bar");
  if (!wrap || !label || !bar) return;

  if (!total) {
    wrap.classList.add("jsp-hidden");
    return;
  }

  wrap.classList.remove("jsp-hidden");
  label.textContent = `Scoring ${done}/${total}…`;
  const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  bar.style.width = `${pct}%`;
}

function updateMatchesSummary(minScore) {
  const el = document.getElementById("jsp-matches-summary");
  if (!el) return;
  const shown = matchesResults.filter((job) => typeof job.score === "number" && job.score >= 75).length;
  if (!matchesMeta.totalFound) {
    el.textContent = "";
    el.classList.add("jsp-hidden");
    return;
  }
  el.classList.remove("jsp-hidden");
  el.textContent = `${shown} of ${matchesMeta.scored || matchesMeta.totalFound} scored roles at 75%. ${matchesMeta.boardLabel || "this board"}`;
}

function renderMatchesList(minScore) {
  const list = document.getElementById("jsp-matches-list");
  // const empty = document.getElementById("jsp-matches-empty");
  if (!list) return;

  const filtered = matchesResults
    .filter((job) => typeof job.score === "number" && job.score >= 75)
    .sort((a, b) => b.score - a.score);

  updateMatchesSummary(minScore);

  if (!filtered.length) {
    list.innerHTML = "";
    list.classList.add("jsp-hidden");
    // empty.classList.remove("jsp-hidden");
    return;
  }

  // empty.classList.add("jsp-hidden");
  list.classList.remove("jsp-hidden");
  list.innerHTML = filtered
    .map((job) => {
      const metaParts = [job.location, job.department].filter(Boolean);
      const meta = metaParts.length ? metaParts.join(" · ") : job.company || "";
      const sourceLabel = job.scoreSource === "model" ? "Checked" : "Quick";
      return `
        <article class="jsp-match-card">
          <button type="button" class="jsp-match-open" data-url="${escapeMatchHtml(job.url)}" data-title="${escapeMatchHtml(job.title)}" data-score="${job.score}">
            <div class="jsp-match-card-top">
              <div class="jsp-match-card-text">
                <strong class="jsp-match-title">${escapeMatchHtml(job.title)}</strong>
                ${meta ? `<span class="jsp-match-meta">${escapeMatchHtml(meta)}</span>` : ""}
                <span class="jsp-match-role">${escapeMatchHtml(job.roleType || inferRoleType(job.title))}</span>
              </div>
              <div class="jsp-match-score ${scoreClassForMatch(job.score)}">
                <span class="jsp-match-score-number">${job.score}</span>
                <span class="jsp-match-score-label">${sourceLabel}</span>
              </div>
            </div>
            ${renderMatchSkills(job.matched_skills)}
            ${job.summary ? `<p class="jsp-match-summary">${escapeMatchHtml(job.summary)}</p>` : ""}
          </button>
          <button type="button" class="jsp-btn-text jsp-match-save" data-url="${escapeMatchHtml(job.url)}">Save</button>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll(".jsp-match-open").forEach((card) => {
    card.addEventListener("click", () => handleMatchCardClick(card));
  });
  list.querySelectorAll(".jsp-match-save").forEach((button) => {
    button.addEventListener("click", () => saveMatchToShortlist(button.dataset.url));
  });
}

async function handleMatchCardClick(card) {
  const url = card.dataset.url;
  if (!url) return;
  const title = card.dataset.title || "";
  const score = Number(card.dataset.score);

  const job = matchesResults.find((item) => item.url === url);
  try {
    await markOpenedFromMatches({
      url,
      title: job?.title || title,
      company: job?.company || "",
      score: job?.score ?? score,
      matched_skills: job?.matched_skills || [],
      summary: job?.summary || "",
      scoreSource: job?.scoreSource || "",
      roleType: job?.roleType || inferRoleType(title),
    });
  } catch {
    // Opening the tab still helps even if storage fails
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

async function syncMatchesThresholdUi() {
  const settings = await loadSettings();
  const slider = document.getElementById("jsp-matches-threshold");
  const valueEl = document.getElementById("jsp-matches-threshold-value");
  if (slider) slider.value = String(settings.minFitScore);
  if (valueEl) valueEl.textContent = `${settings.minFitScore}%`;
  return settings.minFitScore;
}

async function onMatchesThresholdChange(event) {
  const value = Math.min(100, Math.max(50, Number(event.target.value) || 80));
  const valueEl = document.getElementById("jsp-matches-threshold-value");
  if (valueEl) valueEl.textContent = `${value}%`;

  const settings = await loadSettings();
  settings.minFitScore = value;
  await saveSettings(settings);
  renderMatchesList(value);
}

async function renderMatchesPanel() {
  const page = detectPageMode();
  // const boardHint = document.getElementById("jsp-matches-board-hint");
  // if (boardHint) {
  //   if (page.mode === "board") {
  //     boardHint.textContent = `Careers board detected (${page.ats}). Find roles that fit your saved profile.`;
  //     boardHint.classList.remove("jsp-hidden");
  //   } else {
  //     boardHint.textContent =
  //     boardHint.classList.remove("jsp-hidden");
  //   }
  // }

  const minScore = await syncMatchesThresholdUi();
  renderMatchesList(minScore);
  renderShortlist();

  const { personalized } = await getProfileForRequest();
  const findBtn = document.getElementById("jsp-matches-find");
  if (findBtn) {
    findBtn.disabled = false;
    findBtn.textContent = personalized ? "Find matches" : "Add profile to find matches";
  }
}

async function scoreSingleJob(job, profile) {
  const result = await postJson(ENDPOINTS.scoreFit, {
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    url: job.url,
    profile,
  });
  const fit = {
    score: result.score,
    matched_skills: result.matched_skills || [],
    missing_skills: result.missing_skills || [],
    summary: result.summary || "",
  };
  await setCachedFitScore(job.url, profile, fit);
  return { ...job, ...fit };
}

async function scoreBatchOrFallback(usable, profile) {
  const payload = {
    profile,
    jobs: usable.map((job) => ({
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      url: job.url,
    })),
  };

  try {
    const response = await postJson(ENDPOINTS.scoreFitBatch, payload);
    const byUrl = new Map((response.results || []).map((item) => [item.url, item]));
    const scored = [];
    for (const job of usable) {
      const result = byUrl.get(job.url);
      if (result && typeof result.score === "number") {
        const fit = {
          score: result.score,
          matched_skills: result.matched_skills || [],
          missing_skills: result.missing_skills || [],
          summary: result.summary || "",
        };
        await setCachedFitScore(job.url, profile, fit);
        scored.push({ ...job, ...fit });
      }
    }
    return scored;
  } catch (error) {
    // Older backends may not have /score-fit-batch yet
    const msg = String(error.message || "");
    if (error.message === "RATE_LIMIT") throw error;
    if (!/404|not found|Failed to score|score-fit-batch/i.test(msg) && !msg.includes("404")) {
      // Still try per-job fallback for unknown batch failures
    }

    const scored = [];
    for (const job of usable) {
      if (matchesScanAbort) break;
      try {
        scored.push(await scoreSingleJob(job, profile));
      } catch (singleError) {
        if (singleError.message === "RATE_LIMIT") throw singleError;
      }
    }
    return scored;
  }
}

async function scoreJobsAgainstProfile(jobs, profile, onProgress) {
  const scored = [];
  let done = 0;
  const total = jobs.length;

  const pending = [];
  for (const job of jobs) {
    const cached = await getCachedFitScore(job.url, profile);
    if (cached && typeof cached.score === "number") {
      scored.push({
        ...job,
        score: cached.score,
        matched_skills: cached.matched_skills || [],
        missing_skills: cached.missing_skills || [],
        summary: cached.summary || "",
      });
      done += 1;
      onProgress?.(done, total);
    } else {
      pending.push(job);
    }
  }

  const batches = chunkArray(pending, MATCHES_BATCH_SIZE);
  for (const batch of batches) {
    if (matchesScanAbort) break;

    const usable = batch.filter((job) => (job.description || "").trim().length >= 50);
    const skipped = batch.filter((job) => (job.description || "").trim().length < 50);
    for (const _job of skipped) {
      done += 1;
      onProgress?.(done, total);
    }

    if (!usable.length) continue;

    try {
      const batchScored = await scoreBatchOrFallback(usable, profile);
      scored.push(...batchScored);
      done += usable.length;
      onProgress?.(done, total);
    } catch (error) {
      if (error.message === "RATE_LIMIT") {
        setMatchesStatus("Rate limit reached — waiting a minute, then continuing…", { error: true });
        await new Promise((resolve) => setTimeout(resolve, 65000));
        if (matchesScanAbort) break;
        try {
          const batchScored = await scoreBatchOrFallback(usable, profile);
          scored.push(...batchScored);
          done += usable.length;
          onProgress?.(done, total);
          setMatchesStatus(`Scoring ${done}/${total}…`);
        } catch (retryError) {
          done += usable.length;
          onProgress?.(done, total);
          throw retryError;
        }
      } else {
        throw error;
      }
    }
  }

  return scored;
}

async function runMatchesScan() {
  matchesScanAbort = false;
  const findBtn = document.getElementById("jsp-matches-find");
  const cancelBtn = document.getElementById("jsp-matches-cancel");

  const profileBundle = await getProfileForRequest();
  if (!profileBundle.personalized || !profileBundle.profile) {
    setMatchesStatus("Save your profile first so Joblens can score fit against your experience.", {
      error: true,
    });
    setTab("profile");
    return;
  }

  if (findBtn) {
    findBtn.disabled = true;
    findBtn.textContent = "Finding…";
  }
  cancelBtn?.classList.remove("jsp-hidden");
  setMatchesStatus("Loading roles from this careers board…");
  setMatchesProgress(0, 0);

  try {
    const board = await loadBoardJobs();
    if (!board.ok) {
      setMatchesStatus(board.message, { error: true });
      setMatchesProgress(0, 0);
      matchesResults = [];
      matchesMeta = { totalFound: 0, scored: 0, boardLabel: "", source: "" };
      renderMatchesList((await loadSettings()).minFitScore);
      return;
    }

    if (matchesScanAbort) return;

    matchesMeta = {
      totalFound: board.jobs.length,
      scored: 0,
      boardLabel: board.boardLabel || board.company || "",
      source: board.source || "",
    };

    const quick = [];
    for (const job of board.jobs) {
      const cached = await getCachedFitScore(job.url, profileBundle.profile);
      if (cached && typeof cached.score === "number") {
        quick.push({
          ...job,
          score: cached.score,
          matched_skills: cached.matched_skills || [],
          missing_skills: cached.missing_skills || [],
          summary: cached.summary || "",
          scoreSource: "model",
          roleType: inferRoleType(job.title),
        });
      } else {
        quick.push(localStudentFit(job, profileBundle.profile));
      }
    }

    matchesResults = quick;
    matchesMeta.scored = quick.length;
    renderMatchesList(75);
    renderShortlist();
    setMatchesStatus(
      `${quick.filter((job) => job.score >= 75).length} quick matches at 75%+. Checking the top ${AI_REFINE_LIMIT} full descriptions…`
    );

    const refineTargets = quick
      .filter((job) => job.scoreSource !== "model" && (job.description || "").trim().length >= 50)
      .sort((a, b) => b.score - a.score)
      .slice(0, AI_REFINE_LIMIT);

    if (refineTargets.length && !matchesScanAbort) {
      setMatchesProgress(0, refineTargets.length);
      try {
        const refined = await scoreBatchOrFallback(refineTargets, profileBundle.profile);
        const byUrl = new Map(refined.map((job) => [job.url, job]));
        matchesResults = matchesResults.map((job) => {
          const next = byUrl.get(job.url);
          if (!next || typeof next.score !== "number") return job;
          return {
            ...job,
            ...next,
            scoreSource: "model",
            roleType: inferRoleType(job.title),
            summary: next.summary || job.summary,
          };
        });
        setMatchesProgress(refineTargets.length, refineTargets.length);
      } catch (error) {
        if (error.message !== "RATE_LIMIT") throw error;
        setMatchesStatus("Quick matches are ready. The full check hit the rate limit, so those scores stayed local.", {
          error: true,
        });
      }
    }

    if (matchesScanAbort) {
      setMatchesStatus("Scan cancelled. Quick matches stay on screen.");
      return;
    }

    const minScore = 75;
    const shown = matchesResults.filter((job) => job.score >= minScore).length;
    setMatchesStatus(
      shown
        ? `${shown} roles at 75%+. Quick scores use your skills and the listing. Checked scores read the description.`
        : "No roles reached 75% from the titles and skills on this page. Update your profile skills, or open a posting and scan it."
    );
    renderMatchesList(minScore);
    renderShortlist();
  } catch (error) {
    console.error("Matches scan failed:", error);
    if (error.message === "RATE_LIMIT") {
      setMatchesStatus("Rate limit reached. Wait a minute and try again.", { error: true });
    } else if (String(error.message || "").includes("Failed to fetch")) {
      setMatchesStatus(`Backend not reachable at ${API_BASE}.`, { error: true });
    } else {
      setMatchesStatus(error.message || "Couldn’t find matches. Try again.", { error: true });
    }
  } finally {
    if (findBtn) {
      findBtn.disabled = false;
      findBtn.textContent = "Find matches";
    }
    cancelBtn?.classList.add("jsp-hidden");
    window.setTimeout(() => setMatchesProgress(0, 0), 800);
  }
}

function cancelMatchesScan() {
  matchesScanAbort = true;
  setMatchesStatus("Cancelling…");
}

async function saveMatchToShortlist(url) {
  const job = matchesResults.find((item) => item.url === url);
  if (!job) return;
  await upsertShortlistItem({
    url: job.url,
    title: job.title,
    company: job.company,
    location: job.location,
    score: job.score,
    matched_skills: job.matched_skills,
    summary: job.summary,
    roleType: job.roleType || inferRoleType(job.title),
  });
  setMatchesStatus(`Saved “${job.title}” to your shortlist.`);
  renderShortlist();
}

async function renderShortlist() {
  const root = document.getElementById("jsp-shortlist");
  if (!root) return;
  const items = await loadShortlist();
  if (!items.length) {
    root.innerHTML = "";
    root.classList.add("jsp-hidden");
    return;
  }
  root.classList.remove("jsp-hidden");
  root.innerHTML = `
    <h3 class="jsp-shortlist-title">Shortlist</h3>
    <ul class="jsp-shortlist">
      ${items
        .map(
          (item) => `
        <li class="jsp-shortlist-item" data-url="${escapeMatchHtml(item.url)}">
          <div class="jsp-shortlist-main">
            <strong>${escapeMatchHtml(item.title)}</strong>
            <span>${escapeMatchHtml([item.company, item.roleType, item.score != null ? `${item.score}%` : ""].filter(Boolean).join(" · "))}</span>
          </div>
          <label class="jsp-shortlist-field">Status
            <select class="jsp-shortlist-status">
              ${["saved", "applied", "interview"]
                .map(
                  (status) =>
                    `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="jsp-shortlist-field">Deadline
            <input class="jsp-shortlist-deadline" type="date" value="${escapeMatchHtml(item.deadline || "")}" />
          </label>
          <button type="button" class="jsp-btn-text jsp-shortlist-open">Open</button>
          <button type="button" class="jsp-btn-text jsp-shortlist-remove">Remove</button>
        </li>`
        )
        .join("")}
    </ul>
  `;

  root.querySelectorAll(".jsp-shortlist-item").forEach((row) => {
    const url = row.dataset.url;
    row.querySelector(".jsp-shortlist-status")?.addEventListener("change", (event) => {
      updateShortlistItem(url, { status: event.target.value });
    });
    row.querySelector(".jsp-shortlist-deadline")?.addEventListener("change", (event) => {
      updateShortlistItem(url, { deadline: event.target.value });
    });
    row.querySelector(".jsp-shortlist-open")?.addEventListener("click", async () => {
      const item = items.find((entry) => entry.url === url);
      if (!item) return;
      await markOpenedFromMatches(item);
      window.open(url, "_blank", "noopener,noreferrer");
    });
    row.querySelector(".jsp-shortlist-remove")?.addEventListener("click", async () => {
      await removeShortlistItem(url);
      renderShortlist();
    });
  });
}

function bindMatchesEvents() {
  document.getElementById("jsp-matches-find")?.addEventListener("click", () => runMatchesScan());
  document.getElementById("jsp-matches-cancel")?.addEventListener("click", () => cancelMatchesScan());
  document.getElementById("jsp-matches-threshold")?.addEventListener("input", onMatchesThresholdChange);
  document.getElementById("jsp-matches-goto-profile")?.addEventListener("click", () => setTab("profile"));
}