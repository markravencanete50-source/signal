import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Vitest config.
 *
 * - `@/` mirrors the tsconfig path alias so tests import the same way app code does.
 * - `server-only` is stubbed to an empty module: it throws by design when imported
 *   outside a React Server Component, but our server modules run perfectly under
 *   Node in a test — that guard is a bundler concern, not a runtime one.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  // No `include` here — each test script targets its own path (unit / rules /
  // integration), and a global include intersected with `--dir` matches nothing.
});
