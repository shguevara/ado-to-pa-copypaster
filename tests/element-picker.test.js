/**
 * @vitest-environment node
 *
 * Unit tests for extractSchemaName() from scripts/element-picker.js.
 *
 * Why @vitest-environment node?
 *   element-picker.js uses `document` in its browser-side code, but that
 *   code is guarded by `typeof document !== "undefined"`. The
 *   extractSchemaName function itself only reads `el.getAttribute("data-id")`
 *   and `el.parentElement` — both trivially mockable as plain JS objects.
 *   No jsdom required. (design D-1, D-8)
 *
 * TDD ORDER: These tests are written BEFORE the implementation.
 *   After creating this file, running `npm test` must show failures like
 *   "extractSchemaName is not a function" or similar import errors.
 *   Once element-picker.js is implemented, all tests here must pass.
 */

import { describe, it, expect } from "vitest";
import { extractSchemaName } from "../scripts/element-picker.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

/**
 * Build a minimal mock DOM element that supports getAttribute("data-id")
 * and has a parentElement reference.
 *
 * Why plain JS objects rather than jsdom?
 *   extractSchemaName only calls getAttribute('data-id') and reads
 *   .parentElement. A POJO with those two properties is sufficient and keeps
 *   the tests fast and dependency-free. (design D-8)
 *
 * @param {string|null} dataId - The value of the data-id attribute (null = absent)
 * @param {object|null} parent - The parent element mock, or null for root
 */
function mockEl(dataId, parent = null) {
  return {
    getAttribute: (attr) => attr === "data-id" ? dataId : null,
    parentElement: parent,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("extractSchemaName", () => {

  it("returns the part before the first dot when data-id is on the clicked element", () => {
    // Happy path: the clicked element itself carries the data-id.
    // "cr123_lineofbusiness.fieldControl-LookupResultsDropdown" → "cr123_lineofbusiness"
    const el = mockEl("cr123_lineofbusiness.fieldControl-LookupResultsDropdown");
    expect(extractSchemaName(el)).toBe("cr123_lineofbusiness");
  });

  it("walks up 1 level when the clicked element has no data-id but the parent does", () => {
    // The child has no data-id attribute (null); the parent does.
    // Algorithm must walk up one level and extract the schema name from there.
    const parent = mockEl("cr456_title.SomeControl");
    const child  = mockEl(null, parent);
    expect(extractSchemaName(child)).toBe("cr456_title");
  });

  it("walks up 2 levels when only the grandparent has a valid data-id", () => {
    // Neither the child nor parent have data-id; grandparent does.
    // The loop must continue walking up the chain.
    const grandparent = mockEl("cr789_status.AnotherControl");
    const parent      = mockEl(null, grandparent);
    const child       = mockEl(null, parent);
    expect(extractSchemaName(child)).toBe("cr789_status");
  });

  it("skips a data-id that matches the GUID pattern and returns null when no other qualifies", () => {
    // A data-id starting with a GUID (8 hex chars + dash) is a container ID,
    // not a field schema name. The algorithm must skip it.
    // Pattern: /^[0-9a-f]{8}-/i (case-insensitive, 8 hex digits then a dash)
    const el = mockEl("a1b2c3d4-1234-5678-abcd-ef0123456789");
    // The grandparent also has a GUID — no valid ancestor.
    const grandparent = mockEl("F0E1D2C3-0000-0000-0000-000000000001", null);
    const parent      = mockEl(null, grandparent);
    const child       = mockEl("a1b2c3d4-ffff-0000-0000-aabbccddeeff", parent);
    expect(extractSchemaName(child)).toBeNull();
  });

  it("returns null when no ancestor has any data-id attribute", () => {
    // Nothing to extract — no element in the chain has data-id.
    const grandparent = mockEl(null, null);
    const parent      = mockEl(null, grandparent);
    const child       = mockEl(null, parent);
    expect(extractSchemaName(child)).toBeNull();
  });

  it("stops before document.body and returns null (does not inspect body itself)", () => {
    // The algorithm must stop when it reaches document.body (el !== document.body
    // is the loop guard). We simulate body by making parentElement point to a
    // special sentinel object that represents document.body.
    //
    // Why is this important?
    //   document.body is not a PA field element. If the algorithm inspected it,
    //   a GUID-style body id could accidentally produce a spurious result.
    //   Stopping before body ensures we only inspect real PA field elements.
    //   (SPEC.md §6.4; design D-1)
    //
    // Simulate: child.parentElement = body (the sentinel), body has data-id
    // The loop condition `el !== document.body` should stop BEFORE examining body.
    const body  = { getAttribute: () => "bodyDataId", parentElement: null };
    const child = mockEl(null, body);

    // We must set document.body to our sentinel for the guard to work.
    // In Node (no real document), we temporarily attach the sentinel to global.
    const savedDocument = globalThis.document;
    globalThis.document = { body };

    try {
      // child has no data-id; its parentElement is "body".
      // The algorithm must NOT inspect body itself — it should return null.
      expect(extractSchemaName(child)).toBeNull();
    } finally {
      // Restore global state regardless of test outcome.
      if (savedDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = savedDocument;
      }
    }
  });

});
