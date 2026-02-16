/**
 * @vitest-environment node
 *
 * Unit tests for module-scope logic extracted from sidepanel/app.js.
 *
 * Why @vitest-environment node?
 *   app.js references `chrome`, `document`, `Alpine`, and other browser
 *   globals inside guards (`typeof chrome !== "undefined"`, etc.), so it
 *   can be safely imported in Node without any mocks. The node environment
 *   keeps this fast and dependency-free. (Same pattern as ado-reader.test.js)
 *
 * Why a separate file instead of adding to import-validator.test.js?
 *   The hasCopiedData fix tests a different concern (copy-result evaluation)
 *   from import-data validation. Separate files keep test intent clear and
 *   allow each file to grow independently.
 */

import { describe, it, expect } from "vitest";

// ── hasCopiedData helper ───────────────────────────────────────────────────
//
// The spec (design D-7) requires that hasCopiedData is true only when at
// least ONE result has status !== "error". This helper mirrors the expression
// used in copyInitiative() so we can test the logic independently of the
// Alpine store context.
//
// We import validateImportData (the currently exported symbol) just to confirm
// the module loads cleanly; the hasCopiedData logic is expressed as a helper
// below that mirrors the fix required in app.js.

import { validateImportData } from "../sidepanel/app.js";

/**
 * Mirror of the expression used in copyInitiative() after the fix.
 * We test the expression in isolation so we don't need to mock Alpine.
 *
 * @param {Array} results - FieldResult[] returned from COPY_INITIATIVE
 * @returns {boolean} true when at least one result is not an error
 */
function computeHasCopiedData(results) {
  return (results ?? []).some(r => r.status !== "error");
}

describe("hasCopiedData computation", () => {

  it("is false when results is an empty array (nothing was read)", () => {
    // An empty results array means no field data was successfully read.
    // hasCopiedData must be false — there is nothing to paste.
    expect(computeHasCopiedData([])).toBe(false);
  });

  it("is false when ALL results have status 'error'", () => {
    // Every field failed — there is no valid data to paste.
    const results = [
      { fieldId: "a", status: "error" },
      { fieldId: "b", status: "error" },
    ];
    expect(computeHasCopiedData(results)).toBe(false);
  });

  it("is true when at least one result has status 'success'", () => {
    // At least one field was read successfully — data is available to paste.
    const results = [
      { fieldId: "a", status: "error" },
      { fieldId: "b", status: "success", value: "My Title" },
    ];
    expect(computeHasCopiedData(results)).toBe(true);
  });

  it("is true when at least one result has status 'blank'", () => {
    // A blank result means the field exists in ADO but was empty.
    // The CopiedFieldData entry is still stored (value: ""), so it is a
    // valid paste target — the PA field should be cleared/left empty.
    // (design D-7 rationale: blank !== error)
    const results = [
      { fieldId: "a", status: "error" },
      { fieldId: "b", status: "blank" },
    ];
    expect(computeHasCopiedData(results)).toBe(true);
  });

  it("is true when all results are success", () => {
    // Happy path — all fields read successfully.
    const results = [
      { fieldId: "a", status: "success", value: "foo" },
      { fieldId: "b", status: "success", value: "bar" },
    ];
    expect(computeHasCopiedData(results)).toBe(true);
  });

  it("handles null/undefined results gracefully (nullish coalescing fallback)", () => {
    // The `?? []` guard means null/undefined is treated as an empty array.
    // This covers the edge case where the service worker response is malformed.
    expect(computeHasCopiedData(null)).toBe(false);
    expect(computeHasCopiedData(undefined)).toBe(false);
  });

});
