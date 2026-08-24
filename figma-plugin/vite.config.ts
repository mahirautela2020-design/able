import { defineConfig } from "vite";
import path from "path";
import { viteSingleFile } from "vite-plugin-singlefile";

// Figma loads plugin UI from a single opaque HTML string (figma.showUI(__html__)),
// not from a folder that can resolve separate asset requests -- unlike the Chrome
// extension's side panel, everything (JS + CSS) must be inlined into one file.
// vite-plugin-singlefile does exactly that.
export default defineConfig({
  root: path.resolve(__dirname, "ui"),
  base: "./",
  publicDir: false,
  plugins: [viteSingleFile()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, "ui/index.html"),
    },
  },
});
