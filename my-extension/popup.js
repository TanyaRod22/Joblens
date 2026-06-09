async function sendToActiveTab(action) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["config.js", "content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { action });
  }

  window.close();
}

document.getElementById("open-panel").addEventListener("click", () => {
  sendToActiveTab("toggle-panel");
});

document.getElementById("scan-job").addEventListener("click", () => {
  sendToActiveTab("scan-job");
});
