import { defineConfig } from "vite";
import path from "path";

// Side panel build: a normal Vite React app. No @vitejs/plugin-react --
// this is a one-shot production build (no Fast Refresh needed), and
// Vite's built-in esbuild JSX transform (respecting tsconfig's
// jsx:"react-jsx") handles .tsx without it, avoiding a peer-dependency
// conflict that package currently has with this repo's installed
// @babel/core version.
// Reuses the main app's real shadcn components/lib/engine modules via the
// same "@" alias (pointing at the repo-root src/, a sibling of this
// chrome-extension/ directory) so the extension renders with the identical
// design system and WCAG-mapping logic, not a re-implementation.
export default defineConfig({
  root: path.resolve(__dirname, "src/sidepanel"),
  // Vite defaults to absolute asset paths ("/assets/..."), which resolve
  // against the ORIGIN root. A Chrome extension's origin root is the
  // extension folder itself, not chrome-extension/dist/ -- so an absolute
  // path 404s (missing the "dist/" prefix) and the side panel loads blank.
  // Relative paths resolve against index.html's own location instead,
  // which is correct regardless of where in the extension dist/ sits.
  base: "./",
  // Without this Vite walks up from `root` looking for a `public/` dir and
  // finds the main Next.js app's (its own root is a sibling directory) --
  // copying unrelated demo/test HTML and default SVGs into the extension.
  publicDir: false,
  resolve: {
    alias: { "@": path.resolve(__dirname, "../src") },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/sidepanel/index.html"),
    },
  },
});
