import { defineConfig } from "vite";
import path from "path";

// Content script: a plain script (not an ES module) so
// chrome.scripting.executeScript({files: [...]}) can inject it directly.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "src/content-script.ts"),
      name: "AbleContentScript",
      formats: ["iife"],
      fileName: () => "content-script.js",
    },
  },
});
