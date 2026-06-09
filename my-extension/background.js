chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { action: "toggle-panel" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["config.js", "content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { action: "toggle-panel" });
  }
});
