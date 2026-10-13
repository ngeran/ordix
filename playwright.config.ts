import { defineConfig, devices } from "@playwright/test";

// E2E against a locally running production build (`npm run build`
// then `npx next start`) — the baseURL points at the standard port.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "iphone-13", use: { ...devices["iPhone 13"] } },
    { name: "iphone-13-landscape", use: { ...devices["iPhone 13 landscape"] } },
    { name: "ipad-landscape", use: { ...devices["iPad (gen 7) landscape"] } },
    { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
    { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "desktop-webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
