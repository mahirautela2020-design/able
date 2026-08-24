import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  // Without an explicit root, Vite defaults to the invoking process's cwd
  // (the repo root when this runs via the npm script) -- and without
  // publicDir:false, it then copies THAT cwd's public/ directory (the main
  // Next.js app's, full of unrelated demo HTML/SVGs) into this build's
  // outDir. Explicit root + publicDir:false avoids both.
  root: __dirname,
  publicDir: false,
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
