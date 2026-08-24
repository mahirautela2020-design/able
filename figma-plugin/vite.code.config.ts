import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, "code.ts"),
      formats: ["iife"],
      name: "ScanA11yFigmaPlugin",
      fileName: () => "code.js",
    },
  },
});
