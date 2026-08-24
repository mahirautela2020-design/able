import { defineConfig } from "vite";
import path from "path";

// Background service worker: a plain script, referenced directly by
// manifest.json's background.service_worker (not an ES module entry --
// MV3 service workers can be type:"module" but a plain IIFE is simpler and
// this script has no imports of its own).
export default defineConfig({
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/background.ts"),
      name: "AbleBackground",
      formats: ["iife"],
      fileName: () => "background.js",
    },
  },
});
