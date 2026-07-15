import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Popup + Side Panel Switcher",
  version: "1.0.0",
  description:
    "One UI that runs as a toolbar popup or a side panel — switchable from inside the extension.",
  permissions: ["sidePanel", "storage"],
  action: {
    default_popup: "src/popup.html",
    default_title: "Open extension",
  },
  side_panel: {
    default_path: "src/sidepanel.html",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
});
