export type DisplayMode = "popup" | "sidepanel" | "popout";

const DEFAULT_DISPLAY_MODE: DisplayMode = "popout";
const DISPLAY_MODE_DEFAULT_VERSION = 1;

// Dynamic setPopup()/getURL() strings are not rewritten by the build, so these
// must match where the built HTML ends up in dist/ (CRXJS keeps source paths).
const POPUP_PATH = "src/popup.html";
export const POPOUT_PATH = "src/popout.html";

// Enable the new toolbar-icon behavior before removing the old one, so the
// icon is never left doing nothing mid-transition. (When both are set, the
// popup wins, which is harmless.) In pop-out mode both are intentionally off:
// the icon then fires chrome.action.onClicked, handled in background.ts.
export async function applyMode(mode: DisplayMode): Promise<void> {
  if (mode === "sidepanel") {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    await chrome.action.setPopup({ popup: "" });
  } else if (mode === "popup") {
    await chrome.action.setPopup({ popup: POPUP_PATH });
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  } else {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
    await chrome.action.setPopup({ popup: "" });
  }
}

export async function saveMode(mode: DisplayMode): Promise<void> {
  await chrome.storage.sync.set({
    mode,
    displayModeDefaultVersion: DISPLAY_MODE_DEFAULT_VERSION,
  });
}

export async function getSavedMode(): Promise<DisplayMode> {
  const { mode, displayModeDefaultVersion } = await chrome.storage.sync.get([
    "mode",
    "displayModeDefaultVersion",
  ]);

  // Before pop-out became the product default, installations either had no
  // saved mode or inherited "popup". Migrate that legacy state once so an
  // extension update changes the toolbar behavior immediately. Any choice the
  // user makes after this migration remains persistent.
  if (displayModeDefaultVersion !== DISPLAY_MODE_DEFAULT_VERSION) {
    const migratedMode =
      mode === "sidepanel" || mode === "popout"
        ? mode
        : DEFAULT_DISPLAY_MODE;
    await saveMode(migratedMode);
    return migratedMode;
  }

  if (mode === "popup" || mode === "sidepanel" || mode === "popout") {
    return mode;
  }

  return DEFAULT_DISPLAY_MODE;
}
