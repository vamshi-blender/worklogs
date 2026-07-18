// Restores the saved display mode on browser/extension startup, owns the
// pop-out window (single instance: focus it if it exists, create otherwise),
// and runs the PMS tab-group session flow on toolbar-icon clicks.
// Live mode switching is handled by the page (App.tsx) — it applies the mode
// itself and awaits it, so nothing races against a suspended worker.
import { clearSessionIfGroup, ensureSessionTabGroup } from "./api/pmsSession";
import { applyMode, getSavedMode, POPOUT_PATH } from "./mode";

async function init() {
  await applyMode(await getSavedMode());
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);

async function openPopout(): Promise<void> {
  const { popoutWindowId } = await chrome.storage.session.get("popoutWindowId");
  if (typeof popoutWindowId === "number") {
    try {
      await chrome.windows.update(popoutWindowId, { focused: true });
      return;
    } catch {
      // Window was closed; fall through and create a new one.
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(POPOUT_PATH),
    type: "popup",
    width: 400,
    height: 600,
  });
  await chrome.storage.session.set({ popoutWindowId: win.id });
}

// Fires only when no popup is set on the action. Side-panel mode opens
// natively via openPanelOnActionClick (calling sidePanel.open() here fails
// once the worker cold-starts — the awaits drop the click's user gesture) and
// anchors its session from the panel page on mount, so only pop-out mode
// needs handling: windows.create carries no gesture requirement, so the
// session flow can safely run first.
chrome.action.onClicked.addListener(async (tab) => {
  if ((await getSavedMode()) === "popout") {
    await ensureSessionTabGroup(tab);
    await openPopout();
  }
});

// A closed tab group ends the session scope it anchored.
chrome.tabGroups.onRemoved.addListener(async (group) => {
  await clearSessionIfGroup(group.id);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const { popoutWindowId } = await chrome.storage.session.get("popoutWindowId");
  if (popoutWindowId === windowId) {
    await chrome.storage.session.remove("popoutWindowId");
  }
});

// Pages ask the background to open the pop-out so the single-instance logic
// lives in one place. sendMessage queues until the worker is awake, so this
// has no cold-start race.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "open-popout") {
    openPopout().then(() => sendResponse(true));
    return true;
  }
});
