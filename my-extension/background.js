importScripts("config.js");

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggle-panel" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["config.js", "profile.js", "content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { action: "toggle-panel" });
  }
});

function formatApiError(payload, status) {
  if (!payload?.detail) return `Server responded with ${status}`;
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail.map((item) => item.msg || String(item)).join("; ");
  }
  return String(payload.detail);
}

async function postJsonApi({ path, body }) {
  const url = `${JOBSCRAPPER_CONFIG.apiBaseUrl}${path}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMIT");
  }

  if (!response.ok) {
    let message = `Server responded with ${response.status}`;
    try {
      message = formatApiError(await response.json(), response.status);
    } catch {
      // ignore invalid error JSON
    }
    throw new Error(message);
  }

  return response.json();
}

async function uploadResumeFile({ fileName, fileType, fileBytes }) {
  if (!Array.isArray(fileBytes) || !fileBytes.length) {
    throw new Error("Resume file data was lost during upload. Try again.");
  }

  const formData = new FormData();
  const bytes = Uint8Array.from(fileBytes);
  const blob = new Blob([bytes], { type: fileType || "application/octet-stream" });
  formData.append("file", blob, fileName || "resume.pdf");

  const response = await fetch(`${JOBSCRAPPER_CONFIG.apiBaseUrl}${JOBSCRAPPER_CONFIG.endpoints.parseResume}`, {
    method: "POST",
    body: formData,
  });

  if (response.status === 429) {
    throw new Error("RATE_LIMIT");
  }

  if (!response.ok) {
    let message = `Server responded with ${response.status}`;
    try {
      message = formatApiError(await response.json(), response.status);
    } catch {
      // ignore invalid error JSON
    }
    throw new Error(message);
  }

  return response.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "api-json") {
    postJsonApi(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message.action === "parse-resume") {
    uploadResumeFile(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});
