import { useEffect, useRef, useState } from "react";
import {
  applyMode,
  getSavedMode,
  saveMode,
  type DisplayMode,
} from "../mode";
import { applyTheme, getSavedTheme, type Theme } from "../theme";
import {
  getBackendUrl,
  getExtensionOrigin,
  saveBackendUrl,
} from "../api/backend";
import "./ModeSwitcher.css";

const CTX_LABELS: Record<DisplayMode, string> = {
  popup: "Popup",
  sidepanel: "Side panel",
  popout: "Pop-out window",
};

interface ModeSwitcherProps {
  ctx: DisplayMode;
}

export default function ModeSwitcher({ ctx }: ModeSwitcherProps) {
  const [mode, setMode] = useState<DisplayMode | null>(null);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [hint, setHint] = useState("");
  const [backendUrl, setBackendUrl] = useState("");
  const [backendDraft, setBackendDraft] = useState("");
  const [backendHint, setBackendHint] = useState("");
  const switching = useRef(false);

  useEffect(() => {
    getSavedMode().then(setMode);
    getSavedTheme().then(setTheme);
    getBackendUrl().then((url) => {
      setBackendUrl(url);
      setBackendDraft(url);
    });
  }, []);

  async function onSaveBackend() {
    setBackendHint("");
    try {
      const saved = await saveBackendUrl(backendDraft);
      setBackendUrl(saved);
      setBackendDraft(saved);
      setBackendHint("Backend saved.");
    } catch (error) {
      setBackendHint(error instanceof Error ? error.message : "Could not save backend.");
    }
  }

  async function onToggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    await chrome.storage.sync.set({ theme: next });
  }

  async function onSelect(next: DisplayMode) {
    if (switching.current || next === ctx) {
      setMode(next);
      return;
    }
    switching.current = true;
    setHint("");
    setMode(next);
    try {
      // Apply the behavior directly from this page — no dependency on the
      // background worker being awake — and wait for it to finish before
      // trying to open anything.
      await applyMode(next);
      await saveMode(next);

      if (next === "popout") {
        // Background owns the pop-out (single instance). sendMessage queues
        // until the worker wakes, so there's no cold-start race.
        await chrome.runtime.sendMessage({ type: "open-popout" });
        window.close();
      } else if (next === "sidepanel") {
        // The click counts as a user gesture, so we can open the panel in
        // the last-focused browser window (we may be in a pop-out window).
        const win = await chrome.windows.getLastFocused({
          windowTypes: ["normal"],
        });
        await chrome.sidePanel.open({ windowId: win.id! });
        window.close();
      } else {
        try {
          // openPopup anchors to the toolbar of an ACTIVE normal browser
          // window. From the pop-out (a chromeless window with no toolbar),
          // focus the last-used browser window first and target it
          // explicitly, or the call throws. Works in Chrome 127+.
          if (ctx === "popout") {
            const win = await chrome.windows.getLastFocused({
              windowTypes: ["normal"],
            });
            await chrome.windows.update(win.id!, { focused: true });
            await chrome.action.openPopup({ windowId: win.id! });
          } else {
            await chrome.action.openPopup();
          }
          window.close();
        } catch {
          setHint(
            "Popup mode saved. Close this window and click the toolbar icon to open the popup.",
          );
        }
      }
    } finally {
      switching.current = false;
    }
  }

  return (
    <div className="mode-switcher">
      <p className="mode-switcher-context">
        Running as: <strong>{CTX_LABELS[ctx]}</strong>
      </p>

      <fieldset>
        <legend>Appearance</legend>
        <label className="theme-toggle-row">
          <span>Light theme</span>
          <input
            type="checkbox"
            checked={theme === "light"}
            onChange={onToggleTheme}
          />
        </label>
      </fieldset>

      <fieldset>
        <legend>Display mode</legend>
        <label>
          <input
            type="radio"
            name="mode"
            value="popup"
            checked={mode === "popup"}
            onChange={() => onSelect("popup")}
          />
          Popup (opens from the toolbar icon)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="sidepanel"
            checked={mode === "sidepanel"}
            onChange={() => onSelect("sidepanel")}
          />
          Side panel (docked to the browser window)
        </label>
        <label>
          <input
            type="radio"
            name="mode"
            value="popout"
            checked={mode === "popout"}
            onChange={() => onSelect("popout")}
          />
          Pop-out window (floating, stays open)
        </label>
      </fieldset>

      <fieldset>
        <legend>Donna backend</legend>
        <label className="backend-url-label" htmlFor="backend-url">
          Server URL
        </label>
        <div className="backend-url-row">
          <input
            id="backend-url"
            type="url"
            value={backendDraft}
            onChange={(event) => setBackendDraft(event.target.value)}
            placeholder="http://localhost:3000"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onSaveBackend}
            disabled={!backendDraft.trim() || backendDraft === backendUrl}
          >
            Save
          </button>
        </div>
        <p className="backend-origin-hint">
          Extension origin for the server allowlist: <code>{getExtensionOrigin()}</code>
        </p>
        {backendHint && <p className="hint">{backendHint}</p>}
      </fieldset>

      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
