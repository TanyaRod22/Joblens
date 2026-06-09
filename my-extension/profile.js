const PROFILE_STORAGE_KEY = "joblens_profile";
const SETTINGS_STORAGE_KEY = "joblens_settings";

const DEFAULT_PROFILE = {
  name: "",
  headline: "",
  summary: "",
  skills: [],
  experience: [],
  resume_text: "",
  preferences: {
    target_roles: [],
    industries: [],
  },
};

const DEFAULT_SETTINGS = {
  includeProfileInAnalysis: true,
};

function parseCommaList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasProfileContent(profile) {
  if (!profile) return false;
  return Boolean(
    profile.name?.trim() ||
      profile.headline?.trim() ||
      profile.summary?.trim() ||
      profile.resume_text?.trim() ||
      profile.skills?.length ||
      profile.experience?.length ||
      profile.preferences?.target_roles?.length ||
      profile.preferences?.industries?.length
  );
}

function loadProfile() {
  return new Promise((resolve) => {
    chrome.storage.local.get([PROFILE_STORAGE_KEY], (result) => {
      resolve({ ...DEFAULT_PROFILE, ...(result[PROFILE_STORAGE_KEY] || {}) });
    });
  });
}

function saveProfile(profile) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [PROFILE_STORAGE_KEY]: profile }, resolve);
  });
}

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SETTINGS_STORAGE_KEY], (result) => {
      resolve({ ...DEFAULT_SETTINGS, ...(result[SETTINGS_STORAGE_KEY] || {}) });
    });
  });
}

function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_STORAGE_KEY]: settings }, resolve);
  });
}

function profileFromForm(form) {
  const experience = [];
  form.querySelectorAll(".jsp-exp-entry").forEach((entry) => {
    const title = entry.querySelector(".jsp-exp-title")?.value.trim();
    const company = entry.querySelector(".jsp-exp-company")?.value.trim();
    const bulletsText = entry.querySelector(".jsp-exp-bullets")?.value.trim();
    if (!title && !company && !bulletsText) return;
    experience.push({
      title: title || "",
      company: company || "",
      bullets: bulletsText
        ? bulletsText
            .split("\n")
            .map((line) => line.replace(/^[-•*]\s*/, "").trim())
            .filter(Boolean)
        : [],
    });
  });

  return {
    name: form.querySelector("#jsp-profile-name")?.value.trim() || "",
    headline: form.querySelector("#jsp-profile-headline")?.value.trim() || "",
    summary: form.querySelector("#jsp-profile-summary")?.value.trim() || "",
    skills: parseCommaList(form.querySelector("#jsp-profile-skills")?.value || ""),
    experience,
    resume_text: form.querySelector("#jsp-profile-resume")?.value.trim() || "",
    preferences: {
      target_roles: parseCommaList(form.querySelector("#jsp-profile-roles")?.value || ""),
      industries: parseCommaList(form.querySelector("#jsp-profile-industries")?.value || ""),
    },
  };
}

function populateProfileForm(profile) {
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value || "";
  };

  setValue("jsp-profile-name", profile.name);
  setValue("jsp-profile-headline", profile.headline);
  setValue("jsp-profile-summary", profile.summary);
  setValue("jsp-profile-skills", (profile.skills || []).join(", "));
  // setValue("jsp-profile-resume", profile.resume_text);
  setValue("jsp-profile-roles", (profile.preferences?.target_roles || []).join(", "));
  setValue("jsp-profile-industries", (profile.preferences?.industries || []).join(", "));

  const container = document.getElementById("jsp-profile-experience");
  if (!container) return;
  container.innerHTML = "";

  const entries = profile.experience?.length ? profile.experience : [{ title: "", company: "", bullets: [] }];
  entries.forEach((exp) => addExperienceEntry(container, exp));
}

function experienceEntryHtml(exp = {}) {
  const bullets = (exp.bullets || []).join("\n");
  return `
    <div class="jsp-exp-entry">
      <label class="jsp-field">
        <span>Title</span>
        <input type="text" class="jsp-exp-title" placeholder="Senior Frontend Engineer" value="${escapeProfileHtml(exp.title || "")}" />
      </label>
      <label class="jsp-field">
        <span>Company</span>
        <input type="text" class="jsp-exp-company" placeholder="Acme Inc." value="${escapeProfileHtml(exp.company || "")}" />
      </label>
      <label class="jsp-field">
        <span>Bullets (one per line)</span>
        <textarea class="jsp-exp-bullets" rows="3" placeholder="Built X using Y&#10;Led team of Z">${escapeProfileHtml(bullets)}</textarea>
      </label>
      <button type="button" class="jsp-btn-text jsp-remove-exp">Remove</button>
    </div>
  `;
}

function escapeProfileHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function addExperienceEntry(container, exp = {}) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = experienceEntryHtml(exp);
  const entry = wrapper.firstElementChild;
  entry.querySelector(".jsp-remove-exp").addEventListener("click", () => entry.remove());
  container.appendChild(entry);
}

function resetProfileForm() {
  populateProfileForm({ ...DEFAULT_PROFILE });
}
