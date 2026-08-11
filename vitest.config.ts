import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    testTimeout: 60_000,
    env: { MAX_PAGES: "5" },
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["./tests/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
