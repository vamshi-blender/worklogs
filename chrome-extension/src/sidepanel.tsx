import { createRoot } from "react-dom/client";
import App from "./App";
import { establishSessionFromCurrentTab } from "./api/pmsSession";
import { applyTheme, getSavedTheme } from "./theme";
import "./base.css";
import "./design-system.css";

getSavedTheme().then(applyTheme);

// The panel document is created on each open, so this anchors the session's
// PMS tab group every time the panel opens (icon click or mode switch).
void establishSessionFromCurrentTab();

createRoot(document.getElementById("root")!).render(<App ctx="sidepanel" />);
