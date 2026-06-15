const API_BASE = JOBSCRAPPER_CONFIG.apiBaseUrl;
const ENDPOINTS = JOBSCRAPPER_CONFIG.endpoints;
const PANEL_ID = "jobscrapper-panel";
const ROOT_ID = "jobscrapper-root";
const FAB_ID = "jobscrapper-fab";
const EXTENSION_ICON_URL = chrome.runtime.getURL("Insightlens.png");

let currentTab = "scan";
let lastScanView = "jsp-view-idle";
let currentJob = null;
let currentAnalysis = null;
let currentFitScore = null;
let profileStep = "choice";

function apiUrl(path) {
  return `${API_BASE}${path}`;
}

async function postJson(path, body) {
  const response = await chrome.runtime.sendMessage({
    action: "api-json",
    path,
    body,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "API request failed");
  }

  return response.data;
}

function createFloatingTrigger() {
  if (document.getElementById(FAB_ID)) return;

  const fab = document.createElement("button");
  fab.id = FAB_ID;
  fab.type = "button";
  fab.className = "jsp-fab";
  fab.setAttribute("aria-label", "Open JobScrapper");
  fab.innerHTML = `<img src="${EXTENSION_ICON_URL}" alt="" />`;
  fab.addEventListener("click", togglePanel);
  document.body.appendChild(fab);
}

function setFabVisible(visible) {
  const fab = document.getElementById(FAB_ID);
  if (!fab) return;
  fab.classList.toggle("jsp-fab-hidden", !visible);
}

function createPanel() {
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <div id="jobscrapper-backdrop"></div>
    <aside id="${PANEL_ID}" role="dialog" aria-label="Joblens">
      <header class="jsp-header">
        <div class="jsp-brand">
          <img class="jsp-logo-img" src="${EXTENSION_ICON_URL}" alt="" />
          <h1 class="jsp-title">Joblens</h1>
        </div>
        <div class="jsp-header-actions">
          <button type="button" class="jsp-btn-secondary jsp-hidden" id="jsp-rescan">Rescan</button>
          <button type="button" class="jsp-btn-icon" id="jsp-close" aria-label="Close panel">&times;</button>
        </div>
      </header>

      <nav class="jsp-tabs" aria-label="Panel sections">
        <button type="button" class="jsp-tab jsp-tab-active" data-tab="scan">Scan</button>
        <button type="button" class="jsp-tab" data-tab="profile">Profile</button>
      </nav>

      <div class="jsp-body">
        <section class="jsp-view jsp-idle jsp-active" id="jsp-view-idle">
          <div class="jsp-idle-icon" aria-hidden="true">&#128269;</div>
          <div>
            <h2>Ready to scan</h2>
            <p>Open a job posting, then scan to get interview prep and cold email talking points.</p>
          </div>
          <button type="button" class="jsp-btn-primary" id="jsp-scan">Scan Job</button>
        </section>

        <section class="jsp-view jsp-loading" id="jsp-view-loading">
          <div class="jsp-spinner" aria-hidden="true"></div>
          <h2>Scanning job...</h2>
          <ul class="jsp-loading-steps">
            <li id="jsp-step-read" class="jsp-step-active">Reading job page</li>
            <li id="jsp-step-analyze">Analyzing role</li>
            <li id="jsp-step-build">Building insights</li>
          </ul>
        </section>

        <section class="jsp-view" id="jsp-view-results">
          <div id="jsp-fit-card" class="jsp-hidden"></div>
          <div class="jsp-job-card">
            <img class="jsp-job-icon" id="jsp-job-icon" src="${EXTENSION_ICON_URL}" alt="" />
            <div class="jsp-job-info">
              <h2 id="jsp-job-title">Job title</h2>
              <p class="jsp-job-meta" id="jsp-job-meta">Company · Location</p>
              <p class="jsp-personalized-badge jsp-hidden" id="jsp-personalized-badge">Personalized to your profile</p>
            </div>
          </div>
          <div id="jsp-results-sections"></div>
          <div class="jsp-action-bar jsp-hidden" id="jsp-action-bar">
            <button type="button" class="jsp-btn-secondary jsp-action-btn" id="jsp-gen-email">Generate cold email</button>
            <button type="button" class="jsp-btn-secondary jsp-action-btn" id="jsp-gen-letter">Generate cover letter</button>
          </div>
          <div id="jsp-generated-output" class="jsp-hidden"></div>
        </section>

        <section class="jsp-view jsp-profile-view" id="jsp-view-profile">
          <div id="jsp-profile-choice" class="jsp-profile-step jsp-profile-step-active">
            <div class="jsp-profile-intro">
              <h2>Your profile</h2>
              <p>Save your resume once. Joblens personalizes analysis, fit scores, and outreach drafts to your background.</p>
            </div>
            <div class="jsp-profile-choice-cards">
              <button type="button" class="jsp-choice-card" id="jsp-choice-upload">
                <span class="jsp-choice-icon" aria-hidden="true">&#8593;</span>
                <strong>Upload resume</strong>
                <span>PDF, Word, or text file</span>
              </button>
              <button type="button" class="jsp-choice-card" id="jsp-choice-manual">
                <span class="jsp-choice-icon" aria-hidden="true">&#9998;</span>
                <strong>Fill manually</strong>
                <span>Enter your details yourself</span>
              </button>
            </div>
          </div>

          <div id="jsp-profile-upload" class="jsp-profile-step">
            <button type="button" class="jsp-btn-text jsp-profile-back" id="jsp-upload-back">&larr; Back</button>
            <div class="jsp-profile-intro">
              <h2>Upload resume</h2>
              <p>We'll extract your details so you can review before saving.</p>
            </div>
            <button type="button" class="jsp-upload-dropzone" id="jsp-upload-dropzone">
              <span class="jsp-upload-icon" aria-hidden="true">&#8593;</span>
              <span class="jsp-upload-label">Drag to attach file</span>
              <span class="jsp-upload-hint">or click to browse from your computer, Dropbox, or iCloud</span>
              <span class="jsp-upload-formats">PDF, DOCX, or TXT</span>
            </button>
            <input type="file" id="jsp-resume-file" class="jsp-hidden" accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain" />
            <div id="jsp-upload-loading" class="jsp-upload-loading jsp-hidden">
              <div class="jsp-spinner" aria-hidden="true"></div>
              <p>Reading your resume...</p>
            </div>
            <p id="jsp-upload-error" class="jsp-upload-error jsp-hidden" role="alert"></p>
          </div>

          <div id="jsp-profile-form-step" class="jsp-profile-step">
            <div class="jsp-profile-form-header">
              <button type="button" class="jsp-btn-text jsp-profile-back jsp-hidden" id="jsp-form-back">&larr; Back</button>
              <button type="button" class="jsp-btn-text jsp-profile-replace jsp-hidden" id="jsp-replace-resume">Upload new resume</button>
            </div>
            <div class="jsp-profile-intro">
              <h2 id="jsp-profile-form-title">Your profile</h2>
              <p id="jsp-profile-form-subtitle">Once you save your profile, Joblens generates a personalized analysis, fit scores, and outreach drafts based on your background.</p>
            </div>
            <div id="jsp-profile-verify-banner" class="jsp-profile-verify-banner jsp-hidden">
              Review the details we pulled from your resume, then save.
            </div>
            <form id="jsp-profile-form" class="jsp-profile-form">
              <label class="jsp-field">
                <span class="jsp-profile-form-label">Name</span>
                <input type="text" id="jsp-profile-name" placeholder="Jane Doe" />
              </label>
              <label class="jsp-field">
                <span class="jsp-profile-form-label">Headline</span>
                <input type="text" id="jsp-profile-headline" placeholder="Senior Frontend Engineer" />
              </label>
              <label class="jsp-field">
                <span class="jsp-profile-form-label">Summary</span>
                <textarea id="jsp-profile-summary" rows="3" placeholder="2–3 sentence pitch about your experience and goals"></textarea>
              </label>
              <label class="jsp-field">
                <span class="jsp-profile-form-label">Skills (comma-separated)</span>
                <input type="text" id="jsp-profile-skills" placeholder="React, TypeScript, Node.js" />
              </label>
              <div class="jsp-profile-section">
                <div class="jsp-profile-section-header">
                  <span>Experience</span>
                  <button type="button" class="jsp-btn-text" id="jsp-add-exp">+ Add role</button>
                </div>
                <div id="jsp-profile-experience"></div>
              </div>
              <label class="jsp-field">
                <span class="jsp-profile-form-label">Target roles (comma-separated)</span>
                <input type="text" id="jsp-profile-roles" placeholder="Frontend, Full-stack" />
              </label>
              <label class="jsp-field">
                <span class="jsp-profile-form-label">Target industries (comma-separated)</span>
                <input type="text" id="jsp-profile-industries" placeholder="Healthcare, Fintech" />
              </label>
              <label class="jsp-toggle-field">
                <input type="checkbox" id="jsp-include-profile" checked />
                <span>Include my profile in analysis</span>
              </label>
            <p class="jsp-privacy-note">
              Profile data is stored locally in your browser. When analysis or drafts are generated, relevant profile text is sent to the Joblens backend and OpenAI.
              <a class="jsp-privacy-link" href="${API_BASE}/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a>
            </p>
              <button type="submit" class="jsp-btn-primary" id="jsp-save-profile">Save profile</button>
              <p class="jsp-save-status jsp-hidden" id="jsp-save-status" role="status"></p>
            </form>
          </div>
        </section>

        <section class="jsp-view jsp-manual" id="jsp-view-manual">
          <div class="jsp-manual-intro">
            <h2>Paste job description</h2>
            <p id="jsp-manual-hint">We couldn't confidently read the job description from this page. Paste it below to continue.</p>
          </div>
          <div class="jsp-manual-fields">
            <label class="jsp-field">
              <span>Job title</span>
              <input type="text" id="jsp-manual-title" placeholder="Software Engineer" />
            </label>
            <label class="jsp-field">
              <span>Company</span>
              <input type="text" id="jsp-manual-company" placeholder="Acme Inc." />
            </label>
            <label class="jsp-field">
              <span>Job description</span>
              <textarea id="jsp-manual-description" rows="10" placeholder="Paste the full job description here..."></textarea>
            </label>
          </div>
          <div class="jsp-manual-actions">
            <button type="button" class="jsp-btn-primary" id="jsp-manual-analyze">Analyze</button>
            <button type="button" class="jsp-btn-secondary" id="jsp-manual-rescan">Try scan again</button>
          </div>
        </section>

        <section class="jsp-view jsp-error" id="jsp-view-error">
          <div class="jsp-error-icon" aria-hidden="true">&#9888;&#65039;</div>
          <div>
            <h2 id="jsp-error-title">Couldn't scan</h2>
            <p id="jsp-error-message">Something went wrong. Try again.</p>
          </div>
          <button type="button" class="jsp-btn-primary" id="jsp-retry">Try Again</button>
        </section>
      </div>
    </aside>
  `;

  document.body.appendChild(root);
  bindPanelEvents();
}

function bindPanelEvents() {
  document.getElementById("jsp-close").addEventListener("click", closePanel);
  document.getElementById("jobscrapper-backdrop").addEventListener("click", closePanel);
  document.getElementById("jsp-scan").addEventListener("click", runScan);
  document.getElementById("jsp-rescan").addEventListener("click", runScan);
  document.getElementById("jsp-retry").addEventListener("click", runScan);
  document.getElementById("jsp-manual-analyze").addEventListener("click", analyzeManualInput);
  document.getElementById("jsp-manual-rescan").addEventListener("click", () => runScan({ forceRescan: true }));
  document.querySelectorAll(".jsp-tab").forEach((tab) => {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  });
  document.getElementById("jsp-profile-form").addEventListener("submit", saveProfileForm);
  document.getElementById("jsp-add-exp").addEventListener("click", () => {
    addExperienceEntry(document.getElementById("jsp-profile-experience"));
  });
  document.getElementById("jsp-choice-upload").addEventListener("click", () => {
    setProfileStep("upload", { clearError: true, resetLoading: true });
  });
  document.getElementById("jsp-choice-manual").addEventListener("click", () => {
    resetProfileForm();
    showProfileForm({ mode: "manual" });
  });
  document.getElementById("jsp-upload-back").addEventListener("click", () => {
    setProfileStep("choice", { clearError: true, resetLoading: true });
  });
  document.getElementById("jsp-form-back").addEventListener("click", () => {
    setProfileStep("choice", { clearError: true, resetLoading: true });
  });
  document.getElementById("jsp-replace-resume").addEventListener("click", () => {
    setProfileStep("upload", { clearError: true, resetLoading: true });
  });
  bindResumeUploadEvents();
  document.getElementById("jsp-gen-email")?.addEventListener("click", handleGenerateColdEmail);
  document.getElementById("jsp-gen-letter")?.addEventListener("click", handleGenerateCoverLetter);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel();
  });
  initProfileView();
}

const PROFILE_STEP_IDS = {
  choice: "jsp-profile-choice",
  upload: "jsp-profile-upload",
  form: "jsp-profile-form-step",
};

function setProfileStep(step, options = {}) {
  const { clearError = false, resetLoading = false } = options;
  profileStep = step;
  document.querySelectorAll(".jsp-profile-step").forEach((el) => {
    el.classList.remove("jsp-profile-step-active");
  });
  document.getElementById(PROFILE_STEP_IDS[step])?.classList.add("jsp-profile-step-active");

  if (step === "upload") {
    if (clearError) clearUploadError();
    if (resetLoading) setUploadLoading(false);
  }
}

function showProfileForm(options = {}) {
  const { mode = "edit", fromUpload = false } = options;
  setProfileStep("form");

  const verifyBanner = document.getElementById("jsp-profile-verify-banner");
  const formTitle = document.getElementById("jsp-profile-form-title");
  const formSubtitle = document.getElementById("jsp-profile-form-subtitle");
  const backBtn = document.getElementById("jsp-form-back");
  const replaceBtn = document.getElementById("jsp-replace-resume");

  if (fromUpload) {
    verifyBanner.classList.remove("jsp-hidden");
    formTitle.textContent = "Review your profile";
    formSubtitle.textContent = "We pulled these details from your resume. Edit anything before saving.";
    backBtn.classList.remove("jsp-hidden");
    replaceBtn.classList.add("jsp-hidden");
    return;
  }

  verifyBanner.classList.add("jsp-hidden");

  if (mode === "manual") {
    formTitle.textContent = "Fill in your profile";
    formSubtitle.textContent = "Add your experience and skills so Joblens can personalize your job analysis.";
    backBtn.classList.remove("jsp-hidden");
    replaceBtn.classList.add("jsp-hidden");
    return;
  }

  formTitle.textContent = "Your profile";
  formSubtitle.textContent =
    "Save your resume once. Joblens personalizes analysis, fit scores, and outreach drafts to your background.";
  backBtn.classList.add("jsp-hidden");
  replaceBtn.classList.remove("jsp-hidden");
}

async function resolveProfileEntry() {
  const [profile, settings] = await Promise.all([loadProfile(), loadSettings()]);

  const includeCheckbox = document.getElementById("jsp-include-profile");
  if (includeCheckbox) includeCheckbox.checked = settings.includeProfileInAnalysis;

  if (hasProfileContent(profile)) {
    populateProfileForm(profile);
    showProfileForm({ mode: "edit" });
    return;
  }

  // Keep the user on upload/review if they're mid-flow and haven't saved yet.
  if (profileStep === "upload" || profileStep === "form") {
    return;
  }

  populateProfileForm(profile);
  setProfileStep("choice", { clearError: true, resetLoading: true });
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".jsp-tab").forEach((el) => {
    el.classList.toggle("jsp-tab-active", el.dataset.tab === tab);
  });

  const scanViews = document.querySelectorAll(
    ".jsp-view:not(#jsp-view-profile)"
  );
  const profileView = document.getElementById("jsp-view-profile");

  if (tab === "profile") {
    scanViews.forEach((el) => el.classList.remove("jsp-active"));
    profileView.classList.add("jsp-active");
    document.getElementById("jsp-rescan").classList.add("jsp-hidden");
    resolveProfileEntry();
    return;
  }

  profileView.classList.remove("jsp-active");
  setView(lastScanView);
}

async function initProfileView() {
  await resolveProfileEntry();
}

function clearUploadError() {
  const error = document.getElementById("jsp-upload-error");
  error.textContent = "";
  error.classList.add("jsp-hidden");
}

function setUploadLoading(loading) {
  document.getElementById("jsp-upload-loading").classList.toggle("jsp-hidden", !loading);
  document.getElementById("jsp-upload-dropzone").classList.toggle("jsp-hidden", loading);
}

function showUploadError(message) {
  const error = document.getElementById("jsp-upload-error");
  error.textContent = message;
  error.classList.remove("jsp-hidden");
}

function bindResumeUploadEvents() {
  const dropzone = document.getElementById("jsp-upload-dropzone");
  const fileInput = document.getElementById("jsp-resume-file");

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) handleResumeUpload(file);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.add("jsp-upload-dropzone-active");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropzone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropzone.classList.remove("jsp-upload-dropzone-active");
    });
  });

  dropzone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleResumeUpload(file);
  });
}

async function uploadResumeFile(file) {
  // ArrayBuffer does not survive sendMessage reliably — send raw bytes instead.
  const fileBytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  const response = await chrome.runtime.sendMessage({
    action: "parse-resume",
    fileName: file.name,
    fileType: file.type,
    fileBytes,
  });

  if (!response?.ok) {
    throw new Error(response?.error || "Failed to parse resume");
  }

  return response.data;
}

function formatUploadError(error) {
  if (error.message === "RATE_LIMIT") {
    return "Too many requests. Wait a minute and try again.";
  }
  if (error.message.includes("Could not establish connection") || error.message.includes("Receiving end does not exist")) {
    return "Extension background worker is unavailable. Reload the extension and try again.";
  }
  if (error.message.includes("Failed to fetch")) {
    return `Backend not reachable. Check that the API is running at ${API_BASE}.`;
  }
  return error.message;
}

async function handleResumeUpload(file) {
  clearUploadError();
  setUploadLoading(true);

  try {
    const parsedProfile = await uploadResumeFile(file);
    populateProfileForm(parsedProfile);
    showProfileForm({ fromUpload: true });
  } catch (error) {
    console.error("Resume upload failed:", error);
    setProfileStep("upload", { resetLoading: true });
    showUploadError(formatUploadError(error));
  } finally {
    setUploadLoading(false);
  }
}

async function saveProfileForm(event) {
  event.preventDefault();
  const form = document.getElementById("jsp-profile-form");
  const existing = await loadProfile();
  const profile = profileFromForm(form);
  if (!profile.resume_text && existing.resume_text) {
    profile.resume_text = existing.resume_text;
  }
  const settings = {
    includeProfileInAnalysis: document.getElementById("jsp-include-profile").checked,
  };

  await Promise.all([saveProfile(profile), saveSettings(settings)]);

  const status = document.getElementById("jsp-save-status");
  status.textContent = "Profile saved.";
  status.classList.remove("jsp-hidden");
  window.setTimeout(() => status.classList.add("jsp-hidden"), 2500);

  showProfileForm({ mode: "edit" });
}

async function getProfileForRequest() {
  const [profile, settings] = await Promise.all([loadProfile(), loadSettings()]);
  if (!settings.includeProfileInAnalysis || !hasProfileContent(profile)) {
    return { profile: null, personalized: false };
  }
  return { profile, personalized: true };
}

function buildJobRequestBody(job, profile) {
  const body = {
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    url: job.url,
  };
  if (profile) body.profile = profile;
  return body;
}

function openPanel() {
  createPanel();
  const backdrop = document.getElementById("jobscrapper-backdrop");
  const panel = document.getElementById(PANEL_ID);
  if (!backdrop || !panel) return;

  setFabVisible(false);
  backdrop.classList.remove("jsp-open");
  panel.classList.remove("jsp-open");

  // Defer open so the browser paints the closed state first (enables slide-in).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      backdrop.classList.add("jsp-open");
      panel.classList.add("jsp-open");
    });
  });
}

function closePanel() {
  const backdrop = document.getElementById("jobscrapper-backdrop");
  const panel = document.getElementById(PANEL_ID);
  if (!backdrop || !panel) return;

  backdrop.classList.remove("jsp-open");
  panel.classList.remove("jsp-open");

  let fabRestored = false;
  const restoreFab = () => {
    if (fabRestored) return;
    fabRestored = true;
    setFabVisible(true);
  };

  panel.addEventListener(
    "transitionend",
    (event) => {
      if (event.propertyName === "transform") restoreFab();
    },
    { once: true }
  );
  window.setTimeout(restoreFab, 450);
}

function togglePanel() {
  createPanel();
  const panel = document.getElementById(PANEL_ID);
  if (panel?.classList.contains("jsp-open")) {
    closePanel();
  } else {
    openPanel();
  }
}

function setView(viewId) {
  if (viewId !== "jsp-view-profile") {
    lastScanView = viewId;
  }

  if (currentTab === "profile" && viewId !== "jsp-view-profile") {
    return;
  }

  document.querySelectorAll(".jsp-view:not(#jsp-view-profile)").forEach((el) => {
    el.classList.remove("jsp-active");
  });
  document.getElementById("jsp-view-profile")?.classList.remove("jsp-active");
  document.getElementById(viewId)?.classList.add("jsp-active");

  const rescanBtn = document.getElementById("jsp-rescan");
  if (viewId === "jsp-view-results" && currentTab === "scan") {
    rescanBtn.classList.remove("jsp-hidden");
  } else {
    rescanBtn.classList.add("jsp-hidden");
  }
}

function setLoadingStep(step) {
  ["jsp-step-read", "jsp-step-analyze", "jsp-step-build"].forEach((id) => {
    document.getElementById(id)?.classList.remove("jsp-step-active");
  });
  document.getElementById(step)?.classList.add("jsp-step-active");
}

function pickText(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    const text = el?.innerText?.trim();
    if (text) return text;
  }
  return null;
}

function pickMeta(property) {
  return document.querySelector(`meta[property="${property}"]`)?.content?.trim() || null;
}

function getJsonLdJobPosting() {
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item?.["@type"] === "JobPosting") return item;
        if (Array.isArray(item?.["@graph"])) {
          const job = item["@graph"].find((node) => node?.["@type"] === "JobPosting");
          if (job) return job;
        }
      }
    } catch {
      // ignore invalid JSON-LD blocks
    }
  }
  return null;
}

function formatAddressPart(value) {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object") {
    const text = value.name || value.addressCountry || value.addressRegion || value.addressLocality;
    return typeof text === "string" ? text.trim() || null : null;
  }
  return String(value).trim() || null;
}

function parseLocationFromJsonLd(jobLocation) {
  if (!jobLocation) return null;
  if (typeof jobLocation === "string") return jobLocation;

  const locations = Array.isArray(jobLocation) ? jobLocation : [jobLocation];
  for (const loc of locations) {
    const address = loc?.address;
    if (typeof address === "string") return address;
    if (address) {
      const parts = [
        formatAddressPart(address.addressLocality),
        formatAddressPart(address.addressRegion),
        formatAddressPart(address.addressCountry),
      ].filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
    const locationName = formatAddressPart(loc?.name);
    if (locationName) return locationName;
  }
  return null;
}

function parseTitleFromDocumentTitle() {
  const parts = document.title
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;

  const last = parts[parts.length - 1].toLowerCase();
  if (last.includes("linkedin")) {
    return {
      title: parts[0],
      company: parts.length >= 3 ? parts[1] : null,
    };
  }

  if (parts.length === 2) {
    return { title: parts[0], company: parts[1] };
  }

  return null;
}

function companyFromUrl() {
  const { hostname, pathname } = window.location;

  if (hostname.includes("greenhouse.io")) {
    const match = pathname.match(/^\/([^/]+)\/jobs/i);
    if (match) return formatSlug(match[1]);
  }

  if (hostname.includes("lever.co")) {
    const match = pathname.match(/^\/([^/]+)(?:\/|$)/);
    if (match && match[1] !== "jobs") return formatSlug(match[1]);
  }

  if (hostname.includes("myworkdayjobs.com")) {
    const match = pathname.match(/\/([^/]+)\/job\//i);
    if (match) return formatSlug(match[1]);
  }

  if (hostname.includes("ashbyhq.com")) {
    const match = pathname.match(/^\/([^/]+)\/[a-f0-9-]+/i);
    if (match) return formatSlug(match[1]);
  }

  return null;
}

function findLabelValue(label) {
  const candidates = document.querySelectorAll("span, div, dt, p, label, h3, h4, li");
  for (const el of candidates) {
    if (el.children.length > 0) continue;
    if (el.innerText?.trim() !== label) continue;

    const sibling = el.nextElementSibling;
    if (sibling?.innerText?.trim()) return sibling.innerText.trim();

    const parent = el.parentElement;
    const valueNode = parent?.querySelector("dd, span:last-child, p:last-child");
    if (valueNode && valueNode !== el && valueNode.innerText?.trim()) {
      return valueNode.innerText.trim();
    }
  }
  return null;
}

function parseAshbyCompany() {
  const subtitle = pickText([
    "h1 + div",
    "h1 + span",
    '[class*="subtitle"]',
    '[class*="Subheading"]',
  ]);

  const atMatch = subtitle?.match(/\bat\s+(.+?)(?:\s*\(|$)/i);
  if (atMatch) return atMatch[1].trim();

  const logoAlt = document.querySelector('img[alt*="logo" i], header img, nav img')?.alt?.trim();
  if (logoAlt && !logoAlt.toLowerCase().includes("logo")) return logoAlt;

  return null;
}

function formatSlug(value) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function findLinkedInCompany() {
  const topCard = document.querySelector(
    ".jobs-unified-top-card, .job-details-jobs-unified-top-card, .jobs-details-top-card"
  );

  if (topCard) {
    const companyLink = topCard.querySelector('a[href*="/company/"]');
    const companyText = companyLink?.innerText?.trim();
    if (companyText) return companyText;
  }

  const companyLink = document.querySelector('a[href*="/company/"]');
  return companyLink?.innerText?.trim() || null;
}

function findLinkedInLocation() {
  const topCard = document.querySelector(
    ".jobs-unified-top-card, .job-details-jobs-unified-top-card, .jobs-details-top-card"
  );
  if (!topCard) return null;

  const primaryDescription = topCard.querySelector(
    ".jobs-unified-top-card__primary-description, .job-details-jobs-unified-top-card__primary-description"
  );
  if (primaryDescription) {
    const parts = primaryDescription.innerText
      .split("·")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }

  return (
    pickText([
      ".jobs-unified-top-card__bullet",
      ".job-details-jobs-unified-top-card__bullet",
      ".jobs-unified-top-card__workplace-type",
    ]) || null
  );
}

function scrapeCompanyLogo() {
  const logoImg = document.querySelector(
    '.jobs-unified-top-card__company-logo img, .job-details-jobs-unified-top-card__company-logo img, img[class*="company-logo"], .logo img, header img, nav img, img[alt*="logo" i]'
  );
  if (logoImg?.src) return logoImg.src;

  const jsonLd = getJsonLdJobPosting();
  const logo = jsonLd?.hiringOrganization?.logo;
  if (typeof logo === "string") return logo;
  if (logo?.url) return logo.url;

  return null;
}

const DESCRIPTION_SELECTORS = [
  "#job-description",
  ".job-description",
  '[data-testid="job-description"]',
  ".jobs-description__content",
  ".jobs-box__html-content",
  ".posting-page",
  ".content",
  '[data-automation-id="jobPostingDescription"]',
];

function computeScrapeConfidence(source, description) {
  const length = (description || "").trim().length;

  if (source === "json-ld" || source === "selector") {
    if (length >= 300) return "high";
    if (length >= 150) return "medium";
    return "low";
  }

  if (source === "og-description") {
    return length >= 200 ? "medium" : "low";
  }

  return "low";
}

function scrapeJobPage() {
  const host = window.location.hostname;
  const jsonLd = getJsonLdJobPosting();
  const titleFromPage = parseTitleFromDocumentTitle();

  let title =
    jsonLd?.title ||
    pickText([
      "h1.job-title",
      ".job-title h1",
      ".posting-headline h2",
      '[data-testid="job-title"]',
      ".jobs-unified-top-card__job-title",
      ".job-details-jobs-unified-top-card__job-title",
      "h1",
    ]) ||
    titleFromPage?.title ||
    document.title.split("|")[0].trim();

  let company =
    jsonLd?.hiringOrganization?.name ||
    pickText([
      ".company-name",
      ".employer-name",
      '[data-testid="company-name"]',
      ".jobs-unified-top-card__company-name",
      ".job-details-jobs-unified-top-card__company-name",
      ".posting-company",
      "a[data-tracking-control-name*='company']",
    ]) ||
    titleFromPage?.company ||
    null;

  let location =
    parseLocationFromJsonLd(jsonLd?.jobLocation) ||
    pickText([
      ".location",
      '[data-testid="job-location"]',
      ".jobs-unified-top-card__bullet",
      ".posting-categories .location",
    ]) ||
    null;

  if (host.includes("linkedin.com")) {
    company =
      company ||
      findLinkedInCompany() ||
      pickText([
        ".jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name a",
        ".artdeco-entity-lockup__subtitle",
      ]);
    location = location || findLinkedInLocation();
  }

  if (host.includes("greenhouse.io")) {
    company = company || pickText([".company-name", "#header .company-name"]) || companyFromUrl();
    location = location || pickText([".location", ".posting-category"]);
  }

  if (host.includes("lever.co")) {
    company = company || pickText([".posting-headline .company", ".main-header-text"]) || companyFromUrl();
    location = location || pickText([".posting-categories .location", ".sort-by-time"]);
  }

  if (host.includes("ashbyhq.com")) {
    company = company || parseAshbyCompany() || companyFromUrl();
    location = location || findLabelValue("Location");
  }

  if (!company) {
    company = pickMeta("og:site_name") || companyFromUrl();
  }

  let description = null;
  let scrapeSource = "none";

  if (jsonLd?.description) {
    description = jsonLd.description;
    scrapeSource = "json-ld";
  } else {
    const selectorText = pickText(DESCRIPTION_SELECTORS);
    if (selectorText) {
      description = selectorText;
      scrapeSource = "selector";
    } else {
      const ogDescription = pickMeta("og:description");
      if (ogDescription) {
        description = ogDescription;
        scrapeSource = "og-description";
      } else {
        description = document.body.innerText.slice(0, 8000);
        scrapeSource = "body-fallback";
      }
    }
  }

  const cleanedDescription = (description || "").trim() || "No description found on this page.";
  const confidence = computeScrapeConfidence(scrapeSource, cleanedDescription);

  return {
    title: title || "Untitled role",
    company: company || "Unknown company",
    location,
    description: cleanedDescription,
    url: window.location.href,
    logoUrl: scrapeCompanyLogo(),
    confidence,
    scrapeSource,
  };
}

function renderListItems(items) {
  if (!items?.length) return "<p class='jsp-text'>None identified.</p>";
  return `<ul class="jsp-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function normalizeSkill(skill) {
  const trimmed = String(skill).trim();
  if (trimmed.length <= 40) return trimmed;
  return trimmed.slice(0, 37) + "...";
}

function renderSkills(items, className = "") {
  if (!items?.length) return "<p class='jsp-text jsp-fit-empty'>None identified</p>";
  const extraClass = className ? ` ${className}` : "";
  return `<ul class="jsp-skill-list">${items
    .map((item) => `<li class="jsp-skill-item${extraClass}">${escapeHtml(normalizeSkill(item))}</li>`)
    .join("")}</ul>`;
}

function renderTechnicalSkills(analysis, fitScore, personalized) {
  const groups = [
    {
      label: "Required for this role",
      items: analysis.technical_skills,
      className: "",
    },
  ];

  if (personalized && fitScore) {
    groups.push(
      {
        label: "Skills you match",
        items: fitScore.matched_skills,
        className: "jsp-skill-match",
      },
      {
        label: "Skills missing",
        items: fitScore.missing_skills,
        className: "jsp-skill-gap",
      }
    );
  }

  const content = groups
    .map(
      (group) => `
      <div class="jsp-skill-group">
        <span class="jsp-fit-label">${escapeHtml(group.label)}</span>
        ${renderSkills(group.items, group.className)}
      </div>
    `
    )
    .join("");

  return `<div class="jsp-skills-scroll">${content}</div>`;
}

function renderNumberedList(items) {
  if (!items?.length) return "<p class='jsp-text'>None identified.</p>";
  return `<ol class="jsp-list jsp-numbered">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
}

function renderSection(title, bodyHtml, expanded = false) {
  return `
    <div class="jsp-section${expanded ? " jsp-expanded" : ""}">
      <button type="button" class="jsp-section-header">
        <span>${escapeHtml(title)}</span>
        <span class="jsp-chevron">&#9660;</span>
      </button>
      <div class="jsp-section-body">${bodyHtml}</div>
    </div>
  `;
}

function bindAccordionEvents() {
  document.querySelectorAll(".jsp-section-header").forEach((header) => {
    header.addEventListener("click", () => {
      header.parentElement.classList.toggle("jsp-expanded");
    });
  });
}

function setJobCardIcon(logoUrl) {
  const icon = document.getElementById("jsp-job-icon");
  if (!icon) return;

  icon.src = logoUrl || EXTENSION_ICON_URL;
  icon.onerror = () => {
    icon.onerror = null;
    icon.src = EXTENSION_ICON_URL;
  };
}

function renderFitCard(fitScore) {
  const card = document.getElementById("jsp-fit-card");
  if (!card) return;

  if (!fitScore) {
    card.classList.add("jsp-hidden");
    card.innerHTML = "";
    return;
  }

  const scoreClass =
    fitScore.score >= 75 ? "jsp-fit-high" : fitScore.score >= 50 ? "jsp-fit-mid" : "jsp-fit-low";

  card.classList.remove("jsp-hidden");
  card.innerHTML = `
    <div class="jsp-fit-score ${scoreClass}">
      <span class="jsp-fit-number">${fitScore.score}</span>
      <div class="jsp-fit-details">
        <strong class="jsp-profile-form-label">Resume fit</strong>
        <p class="jsp-fit-summary">${escapeHtml(fitScore.summary)}</p>
      </div>
    </div>
  `;
}

function renderImprovementsSection(suggestions) {
  if (!suggestions?.length) {
    return renderSection(
      "Improve my resume for this role",
      "<p class='jsp-text'>No suggestions yet. Add a profile and rescan to get tailored bullet rewrites.</p>"
    );
  }

  const items = suggestions
    .map(
      (item) => `
      <div class="jsp-improvement-item">
        ${item.original ? `<p class="jsp-improvement-original"><strong>Was:</strong> ${escapeHtml(item.original)}</p>` : ""}
        <p class="jsp-improvement-suggested"><strong>Suggested:</strong> ${escapeHtml(item.suggested)}</p>
        <p class="jsp-improvement-rationale">${escapeHtml(item.rationale)}</p>
      </div>
    `
    )
    .join("");

  return renderSection("Improve my resume for this role", items);
}

function renderResults(job, analysis, options = {}) {
  const { personalized = false, fitScore = null, improvements = null } = options;

  currentJob = job;
  currentAnalysis = analysis;
  currentFitScore = fitScore;

  document.getElementById("jsp-job-title").textContent = job.title;
  document.getElementById("jsp-job-meta").textContent = [
    job.company,
    job.location || "Location not specified",
  ].join(" · ");
  setJobCardIcon(job.logoUrl);

  const badge = document.getElementById("jsp-personalized-badge");
  badge.classList.toggle("jsp-hidden", !personalized);

  renderFitCard(fitScore);

  const actionBar = document.getElementById("jsp-action-bar");
  actionBar.classList.toggle("jsp-hidden", !personalized);

  const output = document.getElementById("jsp-generated-output");
  output.classList.add("jsp-hidden");
  output.innerHTML = "";

  const sections = [
    renderSection("Role Requirements", renderListItems(analysis.role_requirements), true),
    renderSection("Technical Skills", renderTechnicalSkills(analysis, fitScore, personalized)),
    renderSection("Why This Role", `<p class="jsp-text">${escapeHtml(analysis.why_role)}</p>`),
    renderSection("Why This Company", `<p class="jsp-text">${escapeHtml(analysis.why_company)}</p>`),
    renderSection(
      "Cold Email Points",
      `${renderNumberedList(analysis.cold_email_points)}
       <div class="jsp-section-actions">
         <button type="button" class="jsp-btn-secondary" id="jsp-copy-email">Copy all</button>
       </div>`
    ),
    renderSection("Questions to Ask", renderListItems(analysis.questions_to_ask)),
  ];

  if (personalized) {
    sections.push(renderImprovementsSection(improvements?.suggestions));
  }

  document.getElementById("jsp-results-sections").innerHTML = sections.join("");
  bindAccordionEvents();

  document.getElementById("jsp-copy-email")?.addEventListener("click", () => {
    const text = (analysis.cold_email_points || [])
      .map((point, index) => `${index + 1}. ${point}`)
      .join("\n");
    navigator.clipboard.writeText(text);
  });
}

function showGeneratedOutput(title, content, copyText) {
  const output = document.getElementById("jsp-generated-output");
  output.classList.remove("jsp-hidden");
  output.innerHTML = `
    <div class="jsp-generated-card">
      <div class="jsp-generated-header">
        <strong>${escapeHtml(title)}</strong>
        <button type="button" class="jsp-btn-secondary" id="jsp-copy-generated">Copy</button>
      </div>
      <pre class="jsp-generated-body">${escapeHtml(content)}</pre>
    </div>
  `;
  document.getElementById("jsp-copy-generated")?.addEventListener("click", () => {
    navigator.clipboard.writeText(copyText);
  });
  output.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function handleGenerateColdEmail() {
  if (!currentJob || !currentAnalysis) return;
  const { profile } = await getProfileForRequest();
  if (!profile) {
    showError("Profile required", "Add your profile and enable 'Include my profile in analysis' first.");
    return;
  }

  const btn = document.getElementById("jsp-gen-email");
  btn.disabled = true;
  btn.textContent = "Generating...";

  try {
    const result = await postJson(ENDPOINTS.generateColdEmail, {
      ...buildJobRequestBody(currentJob, profile),
      cold_email_points: currentAnalysis.cold_email_points || [],
    });
    const fullText = `Subject: ${result.subject}\n\n${result.body}`;
    showGeneratedOutput("Cold email draft", fullText, fullText);
  } catch (error) {
    if (error.message === "RATE_LIMIT") {
      showError("Rate limit reached", "Too many requests. Wait a minute and try again.");
    } else {
      showError("Couldn't generate email", error.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate cold email";
  }
}

async function handleGenerateCoverLetter() {
  if (!currentJob || !currentAnalysis) return;
  const { profile } = await getProfileForRequest();
  if (!profile) {
    showError("Profile required", "Add your profile and enable 'Include my profile in analysis' first.");
    return;
  }

  const btn = document.getElementById("jsp-gen-letter");
  btn.disabled = true;
  btn.textContent = "Generating...";

  try {
    const result = await postJson(ENDPOINTS.generateCoverLetter, buildJobRequestBody(currentJob, profile));
    showGeneratedOutput("Cover letter draft", result.body, result.body);
  } catch (error) {
    if (error.message === "RATE_LIMIT") {
      showError("Rate limit reached", "Too many requests. Wait a minute and try again.");
    } else {
      showError("Couldn't generate cover letter", error.message);
    }
  } finally {
    btn.disabled = false;
    btn.textContent = "Generate cover letter";
  }
}

function showError(title, message) {
  document.getElementById("jsp-error-title").textContent = title;
  document.getElementById("jsp-error-message").textContent = message;
  setView("jsp-view-error");
}

function showManualPasteView(job) {
  document.getElementById("jsp-manual-title").value = job.title === "Untitled role" ? "" : job.title;
  document.getElementById("jsp-manual-company").value =
    job.company === "Unknown company" ? "" : job.company;
  document.getElementById("jsp-manual-description").value =
    job.description === "No description found on this page." ? "" : job.description;

  const hint = document.getElementById("jsp-manual-hint");
  if (job.scrapeSource === "body-fallback") {
    hint.textContent =
      "This page layout isn't recognized. Paste the full job description below for accurate analysis.";
  } else if (job.description.length < 150) {
    hint.textContent =
      "The scraped description looks too short. Paste the full job description below to continue.";
  } else {
    hint.textContent =
      "We couldn't confidently read the job description from this page. Paste it below to continue.";
  }

  setView("jsp-view-manual");
}

function buildJobPayload({ title, company, location, description, url, logoUrl }) {
  return {
    title: title?.trim() || "Untitled role",
    company: company?.trim() || "Unknown company",
    location: location?.trim() || null,
    description: description?.trim() || "",
    url: url || window.location.href,
    logoUrl: logoUrl || scrapeCompanyLogo(),
  };
}

function analyzeManualInput() {
  const description = document.getElementById("jsp-manual-description").value.trim();
  if (description.length < 50) {
    showError(
      "Description too short",
      "Paste at least a few sentences from the job posting before analyzing."
    );
    return;
  }

  const job = buildJobPayload({
    title: document.getElementById("jsp-manual-title").value,
    company: document.getElementById("jsp-manual-company").value,
    location: findLabelValue("Location"),
    description,
    url: window.location.href,
    logoUrl: scrapeCompanyLogo(),
  });

  analyzeJob(job);
}

async function analyzeJob(job) {
  if (currentTab !== "scan") setTab("scan");
  setView("jsp-view-loading");
  setLoadingStep("jsp-step-analyze");

  try {
    const { profile, personalized } = await getProfileForRequest();
    const analysis = await postJson(ENDPOINTS.analyzeJob, buildJobRequestBody(job, profile));

    setLoadingStep("jsp-step-build");

    let fitScore = null;
    let improvements = null;

    if (personalized) {
      try {
        fitScore = await postJson(ENDPOINTS.scoreFit, buildJobRequestBody(job, profile));
        improvements = await postJson(ENDPOINTS.suggestImprovements, {
          ...buildJobRequestBody(job, profile),
          fit_score: fitScore.score,
          matched_skills: fitScore.matched_skills,
          missing_skills: fitScore.missing_skills,
        });
      } catch {
        // Fit score and improvements are optional enhancements
      }
    }

    renderResults(job, analysis, { personalized, fitScore, improvements });
    setView("jsp-view-results");
  } catch (error) {
    if (error.message === "RATE_LIMIT") {
      showError("Rate limit reached", "Too many requests. Wait a minute and try again.");
      return;
    }
    showError(
      "Couldn't scan",
      error.message.includes("Failed to fetch")
        ? `Backend not reachable. Check that the API is running at ${API_BASE}.`
        : error.message
    );
  }
}

async function runScan(options = {}) {
  openPanel();
  if (currentTab !== "scan") setTab("scan");
  setView("jsp-view-loading");
  setLoadingStep("jsp-step-read");

  await new Promise((resolve) => requestAnimationFrame(resolve));

  const job = scrapeJobPage();

  if (job.confidence === "low" && !options.forceAnalyze) {
    showManualPasteView(job);
    return;
  }

  await analyzeJob(job);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "toggle-panel") {
    togglePanel();
    sendResponse({ ok: true });
  }

  if (message.action === "scan-job") {
    runScan();
    sendResponse({ ok: true });
  }

  return true;
});

createFloatingTrigger();
