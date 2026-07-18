export type DisplayMode = "popup" | "sidepanel" | "popout";

const DEFAULT_DISPLAY_MODE: DisplayMode = "popout";
const DISPLAY_MODE_DEFAULT_VERSION = 1;

// Dynamic setPopup()/getURL() strings are not rewritten by the build, so these
// must match where the built HTML ends up in dist/ (CRXJS keeps source paths).
const POPUP_PATH = "src/popup.html";
export const POPOUT_PATH = "src/popout.html";

// Enable the new toolbar-icon behavior before removing the old one, so the
// icon is never left doing nothing mid-transition. (When both are set, the
// popup wins, which is harmless.) Side-panel mode must open natively via
// openPanelOnActionClick: sidePanel.open() from a cold-started background
// worker loses the click's user gesture and throws; the panel page anchors
// the PMS tab-group session itself on mount. In pop-out mode both are off:
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

/**
 * Applies a mode transition end-to-end: switches the toolbar-icon behavior,
 * persists the choice, opens the target surface, and closes the current one.
 * Shared by every UI that lets the user switch display mode (ModeSwitcher's
 * radio list, the topbar's quick toggle) so the transition logic lives once.
 */
export async function switchMode(
  next: DisplayMode,
  ctx: DisplayMode,
  onHint?: (hint: string) => void,
): Promise<void> {
  // Apply the behavior directly from this page — no dependency on the
  // background worker being awake — and wait for it to finish before trying
  // to open anything.
  await applyMode(next);
  await saveMode(next);

  if (next === "popout") {
    // Background owns the pop-out (single instance). sendMessage queues
    // until the worker wakes, so there's no cold-start race.
    await chrome.runtime.sendMessage({ type: "open-popout" });
    window.close();
  } else if (next === "sidepanel") {
    // The click counts as a user gesture, so we can open the panel in the
    // last-focused browser window (we may be in a pop-out window).
    const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
    await chrome.sidePanel.open({ windowId: win.id! });
    window.close();
  } else {
    try {
      // openPopup anchors to the toolbar of an ACTIVE normal browser window.
      // From the pop-out (a chromeless window with no toolbar), focus the
      // last-used browser window first and target it explicitly, or the call
      // throws. Works in Chrome 127+.
      if (ctx === "popout") {
        const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
        await chrome.windows.update(win.id!, { focused: true });
        await chrome.action.openPopup({ windowId: win.id! });
      } else {
        await chrome.action.openPopup();
      }
      window.close();
    } catch {
      onHint?.(
        "Popup mode saved. Close this window and click the toolbar icon to open the popup.",
      );
    }
  }
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
