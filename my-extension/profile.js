const PROFILE_STORAGE_KEY = "joblens_profile";
const SETTINGS_STORAGE_KEY = "joblens_settings";
const TAILORED_DRAFTS_KEY = "joblens_tailored_drafts";

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

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile || DEFAULT_PROFILE));
}

function getLocalStorageArea() {
  try {
    const area = globalThis.chrome?.storage?.local;
    if (!area) {
      throw new Error("EXTENSION_CONTEXT_INVALIDATED");
    }
    return area;
  } catch (error) {
    if (String(error?.message || "").includes("EXTENSION_CONTEXT_INVALIDATED")) {
      throw new Error("EXTENSION_CONTEXT_INVALIDATED");
    }
    // Chrome throws when the extension was reloaded and this page's old content script is stale.
    throw new Error("EXTENSION_CONTEXT_INVALIDATED");
  }
}

function storageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      getLocalStorageArea().get(keys, (result) => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(new Error(err.message || "EXTENSION_CONTEXT_INVALIDATED"));
          return;
        }
        resolve(result || {});
      });
    } catch (error) {
      reject(error);
    }
  });
}

function storageSet(values) {
  return new Promise((resolve, reject) => {
    try {
      getLocalStorageArea().set(values, () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(new Error(err.message || "EXTENSION_CONTEXT_INVALIDATED"));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function storageRemove(keys) {
  return new Promise((resolve, reject) => {
    try {
      getLocalStorageArea().remove(keys, () => {
        const err = chrome.runtime?.lastError;
        if (err) {
          reject(new Error(err.message || "EXTENSION_CONTEXT_INVALIDATED"));
          return;
        }
        resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function loadProfile() {
  return storageGet([PROFILE_STORAGE_KEY]).then((result) => ({
    ...DEFAULT_PROFILE,
    ...(result[PROFILE_STORAGE_KEY] || {}),
  }));
}

function saveProfile(profile) {
  return storageSet({ [PROFILE_STORAGE_KEY]: profile });
}

function deleteProfile() {
  return storageRemove([PROFILE_STORAGE_KEY]);
}

function deleteAllUserData() {
  return storageRemove([PROFILE_STORAGE_KEY, SETTINGS_STORAGE_KEY, TAILORED_DRAFTS_KEY]);
}

function loadSettings() {
  return storageGet([SETTINGS_STORAGE_KEY]).then((result) => ({
    ...DEFAULT_SETTINGS,
    ...(result[SETTINGS_STORAGE_KEY] || {}),
  }));
}

function saveSettings(settings) {
  return storageSet({ [SETTINGS_STORAGE_KEY]: settings });
}

function loadTailoredDrafts() {
  return storageGet([TAILORED_DRAFTS_KEY]).then((result) => result[TAILORED_DRAFTS_KEY] || {});
}

function saveTailoredDrafts(drafts) {
  return storageSet({ [TAILORED_DRAFTS_KEY]: drafts });
}

async function getTailoredDraft(jobUrl) {
  const drafts = await loadTailoredDrafts();
  return drafts[jobUrl] || null;
}

async function saveTailoredDraft(jobUrl, draft) {
  const drafts = await loadTailoredDrafts();
  drafts[jobUrl] = draft;
  await saveTailoredDrafts(drafts);
  return draft;
}

function createSuggestionId(index) {
  return `sug-${index}-${Date.now()}`;
}

function normalizeSuggestions(suggestions = []) {
  return suggestions.map((item, index) => ({
    id: item.id || createSuggestionId(index),
    original: item.original || "",
    suggested: item.suggested || "",
    rationale: item.rationale || "",
    experience_index:
      typeof item.experience_index === "number" ? item.experience_index : null,
    bullet_index: typeof item.bullet_index === "number" ? item.bullet_index : null,
    is_new_bullet: Boolean(item.is_new_bullet),
    status: item.status || "pending",
  }));
}

function applySuggestionToProfile(profile, suggestion, editedText) {
  const next = cloneProfile(profile);
  const text = (editedText || suggestion.suggested || "").trim();
  if (!text) return next;

  if (!Array.isArray(next.experience)) next.experience = [];

  const expIndex =
    typeof suggestion.experience_index === "number" ? suggestion.experience_index : 0;

  while (next.experience.length <= expIndex) {
    next.experience.push({ title: "", company: "", bullets: [] });
  }

  const entry = next.experience[expIndex];
  if (!Array.isArray(entry.bullets)) entry.bullets = [];

  if (
    !suggestion.is_new_bullet &&
    typeof suggestion.bullet_index === "number" &&
    suggestion.bullet_index >= 0 &&
    suggestion.bullet_index < entry.bullets.length
  ) {
    entry.bullets[suggestion.bullet_index] = text;
  } else if (!suggestion.is_new_bullet && suggestion.original) {
    const matchIndex = entry.bullets.findIndex(
      (bullet) => bullet.trim() === suggestion.original.trim()
    );
    if (matchIndex >= 0) {
      entry.bullets[matchIndex] = text;
    } else {
      entry.bullets.push(text);
    }
  } else {
    entry.bullets.push(text);
  }

  return next;
}

function profileToResumeText(profile) {
  const lines = [];
  if (profile.name) lines.push(profile.name);
  if (profile.headline) lines.push(profile.headline);
  if (profile.summary) {
    lines.push("");
    lines.push("SUMMARY");
    lines.push(profile.summary);
  }
  if (profile.skills?.length) {
    lines.push("");
    lines.push("SKILLS");
    lines.push(profile.skills.join(", "));
  }
  if (profile.experience?.length) {
    lines.push("");
    lines.push("EXPERIENCE");
    profile.experience.forEach((exp) => {
      const header = [exp.title, exp.company].filter(Boolean).join(" — ");
      if (header) lines.push("");
      if (header) lines.push(header);
      (exp.bullets || []).forEach((bullet) => {
        lines.push(`• ${bullet}`);
      });
    });
  }
  return lines.join("\n").trim();
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
    resume_text: "",
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
        <span class="jsp-profile-form-label">Title</span>
        <input type="text" class="jsp-exp-title" placeholder="Senior Frontend Engineer" value="${escapeProfileHtml(exp.title || "")}" />
      </label>
      <label class="jsp-field">
        <span class="jsp-profile-form-label">Company</span>
        <input type="text" class="jsp-exp-company" placeholder="Acme Inc." value="${escapeProfileHtml(exp.company || "")}" />
      </label>
      <label class="jsp-field">
        <span class="jsp-profile-form-label">Bullets (one per line)</span>
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
