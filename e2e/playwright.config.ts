import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    channel: "chrome",
  },
  projects: [
    {
      name: "chrome",
      use: { channel: "chrome" },
    },
  ],
});
