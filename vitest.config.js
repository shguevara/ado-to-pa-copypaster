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
 */
export default defineConfig({
  test: {
    environment: "node",
  },
});
