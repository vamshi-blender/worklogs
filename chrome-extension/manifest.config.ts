import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Donna",
  version: "1.0.0",
  description:
    "Donna opens in a floating pop-out window, with optional popup and side-panel modes.",
  permissions: ["activeTab", "scripting", "sidePanel", "storage"],
  host_permissions: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"],
  optional_host_permissions: ["https://*/*"],
  icons: {
    16: "public/icons/icon16.png",
    32: "public/icons/icon32.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  action: {
    default_title: "Donna",
    default_icon: {
      16: "public/icons/icon16.png",
      32: "public/icons/icon32.png",
    },
  },
  side_panel: {
    default_path: "src/sidepanel.html",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
});
