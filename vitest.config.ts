import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit + integration suites only. Browser journeys (smoke/e2e) are Playwright
// and are configured separately in P3-09/P3-10.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.ts?(x)", "tests/integration/**/*.test.ts?(x)"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
