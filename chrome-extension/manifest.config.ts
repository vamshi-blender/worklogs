import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Donna",
  version: "1.0.0",
  description:
    "One UI that runs as a toolbar popup or a side panel — switchable from inside the extension.",
  permissions: ["sidePanel", "storage"],
  icons: {
    16: "public/icons/icon16.png",
    32: "public/icons/icon32.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  action: {
    default_popup: "src/popup.html",
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
