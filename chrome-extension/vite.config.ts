import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config";

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    rollupOptions: {
      input: {
        // Not referenced in the manifest (opened via chrome.windows.create),
        // so CRXJS won't discover it — declare it explicitly.
        popout: "src/popout.html",
      },
    },
  },
});
