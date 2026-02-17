import { defineConfig } from "vitest/config";

/**
 * Vitest configuration.
 *
 * Why explicitly set environment: "node"?
 *   Vitest v2 can attempt to load jsdom when it detects browser-like globals
 *   (document, window) referenced in imported source files.  Our test suite
 *   uses mock objects instead of a real DOM — jsdom is neither installed nor
 *   needed.  Locking the environment to "node" prevents the auto-detection
 *   and avoids the "Cannot find package 'jsdom'" error. (design D-3)
 *
 * Why include only "*.test.js"?
 *   The tests/ directory also contains Playwright *.spec.ts files that are
 *   not yet active in this project.  Vitest's default glob would collect them
 *   and crash (Playwright's test() API is incompatible with Vitest's runner).
 *   Scoping to *.test.js keeps Vitest strictly on unit tests.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
