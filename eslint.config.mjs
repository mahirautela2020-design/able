import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone Chrome extension -- built output and vendored third-party
    // code (axe.min.js), not something to lint. chrome-extension/src/**
    // (real TS/React, built via Vite) IS linted with the same rules.
    "chrome-extension/dist/**",
    "chrome-extension/vendor/**",
    // Standalone Figma plugin -- built output, not something to lint.
    // figma-plugin/code.ts, figma-plugin/src/**, and figma-plugin/ui/**
    // (real TS/React, built via Vite) ARE linted with the same rules.
    "figma-plugin/dist/**",
  ]),
]);

export default eslintConfig;
