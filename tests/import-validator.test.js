/**
 * Unit tests for validateImportData() — the pure import-validation function
 * that will live in sidepanel/app.js at module scope.
 *
 * Why test a function in app.js from Node.js?
 *   app.js is a browser-only file (Chrome extension side panel). However,
 *   validateImportData is a pure function with no browser or Chrome API
 *   dependencies. It is exported via a conditional `module.exports` guard
 *   (the same pattern used by detectPageType in service-worker.js), which
 *   makes it importable here in Node.js / Vitest without any mocks.
 *
 * TDD order: these tests were written BEFORE the implementation of
 * validateImportData, so they started out failing. Once the function is
 * defined and exported in app.js, all 8 tests should pass.
 */

import { describe, it, expect } from "vitest";
import { validateImportData } from "../sidepanel/app.js";

// ── Shared test fixture ───────────────────────────────────────────────────────
//
// A fully-populated FieldMapping that satisfies every §4.4 validation rule.
// Individual tests destructure this to selectively remove fields.
const validMapping = {
  id:              "abc-123",
  label:           "Title",
  adoSelector:     "input[aria-label='Title']",
  fieldSchemaName: "cr123_title",
  fieldType:       "text",
  enabled:         true,
};

describe("validateImportData", () => {

  // ── 1.1 — valid §4.4 object (including optional metadata) ────────────────
  it("returns null for a valid §4.4 export object with all optional fields present", () => {
    // A file produced by exportMappings() includes version, exportedAt, and
    // overwriteMode. Importing it back in should pass every validation rule.
    const validExport = {
      version:       "1.0",
      exportedAt:    "2026-02-15T00:00:00.000Z",
      overwriteMode: false,
      mappings:      [validMapping],
    };
    expect(validateImportData(validExport)).toBe(null);
  });

  // ── 1.2 — null input ─────────────────────────────────────────────────────
  it("returns the 'mappings array is required' error for null input", () => {
    // null has no 'mappings' key — the first validation rule fires.
    expect(validateImportData(null)).toBe(
      "Invalid format: 'mappings' array is required."
    );
  });

  // ── 1.3 — mappings is not an array ───────────────────────────────────────
  it("returns the 'mappings array is required' error when mappings is not an array", () => {
    // JSON like { "mappings": "all the things" } is structurally wrong.
    expect(validateImportData({ mappings: "not-an-array" })).toBe(
      "Invalid format: 'mappings' array is required."
    );
  });

  // ── 1.4 — empty mappings array ───────────────────────────────────────────
  it("returns the 'must not be empty' error when mappings is an empty array", () => {
    // A valid array but with no entries — second validation rule fires.
    expect(validateImportData({ mappings: [] })).toBe(
      "Invalid format: 'mappings' array must not be empty."
    );
  });

  // ── 1.5 — missing fieldSchemaName ────────────────────────────────────────
  it("returns the 'missing required field' error for a mapping entry without fieldSchemaName", () => {
    // Omit fieldSchemaName from the valid fixture via destructuring.
    const { fieldSchemaName: _removed, ...noSchemaName } = validMapping;
    expect(validateImportData({ mappings: [noSchemaName] })).toBe(
      "Invalid mapping entry: missing required field 'fieldSchemaName'."
    );
  });

  // ── 1.6 — missing label ──────────────────────────────────────────────────
  it("returns the 'missing required field' error for a mapping entry without label", () => {
    // Omit label from the valid fixture.
    const { label: _removed, ...noLabel } = validMapping;
    expect(validateImportData({ mappings: [noLabel] })).toBe(
      "Invalid mapping entry: missing required field 'label'."
    );
  });

  // ── 1.7 — invalid fieldType ──────────────────────────────────────────────
  it("returns the 'Invalid fieldType' error when fieldType is not text, lookup, or choice", () => {
    // 'dropdown' is a plausible guess but not a valid value per §4.4.
    const badType = { ...validMapping, fieldType: "dropdown" };
    expect(validateImportData({ mappings: [badType] })).toBe(
      "Invalid fieldType in mapping 'Title': must be text, lookup, or choice."
    );
  });

  // ── 1.8 — version and exportedAt are optional ────────────────────────────
  it("returns null when version and exportedAt are absent (they are optional per §4.4)", () => {
    // A minimal valid file: only the mappings array is required.
    // version and exportedAt are metadata added by exportMappings() but not
    // required for import validation — the spec explicitly makes them optional.
    const minimal = { mappings: [validMapping] };
    expect(validateImportData(minimal)).toBe(null);
  });

  // ── 1.9–1.12 — remaining required-field coverage (§9.2: 100% coverage) ──
  //
  // SPEC.md §9.2 requires 100% validation rule coverage.  Tests 1.5/1.6
  // already exercise the REQUIRED_FIELDS loop for fieldSchemaName and label;
  // these four cover the remaining entries: id, adoSelector, fieldType
  // (absent key — distinct from 1.7's invalid value), and enabled.
  //
  // Because validateImportData uses a deterministic `for...of` loop over
  // REQUIRED_FIELDS, any single-field removal exercises the same code path.
  // The tests here confirm that each field name is in the REQUIRED_FIELDS
  // array and that the error string is interpolated correctly for each one.

  // ── 1.9 — missing id ─────────────────────────────────────────────────────
  it("returns the 'missing required field' error for a mapping entry without id", () => {
    const { id: _removed, ...noId } = validMapping;
    expect(validateImportData({ mappings: [noId] })).toBe(
      "Invalid mapping entry: missing required field 'id'."
    );
  });

  // ── 1.10 — missing adoSelector ───────────────────────────────────────────
  it("returns the 'missing required field' error for a mapping entry without adoSelector", () => {
    const { adoSelector: _removed, ...noAdoSelector } = validMapping;
    expect(validateImportData({ mappings: [noAdoSelector] })).toBe(
      "Invalid mapping entry: missing required field 'adoSelector'."
    );
  });

  // ── 1.11 — fieldType key absent (Rule 3 — distinct from Rule 4 in 1.7) ──
  it("returns the 'missing required field' error for a mapping entry without fieldType key", () => {
    // Test 1.7 passes fieldType: "dropdown" (key present, value invalid) so
    // Rule 4 fires.  Here fieldType is absent entirely — Rule 3 fires first
    // before the VALID_FIELD_TYPES check is ever reached.
    const { fieldType: _removed, ...noFieldType } = validMapping;
    expect(validateImportData({ mappings: [noFieldType] })).toBe(
      "Invalid mapping entry: missing required field 'fieldType'."
    );
  });

  // ── 1.12 — missing enabled ───────────────────────────────────────────────
  it("returns the 'missing required field' error for a mapping entry without enabled", () => {
    const { enabled: _removed, ...noEnabled } = validMapping;
    expect(validateImportData({ mappings: [noEnabled] })).toBe(
      "Invalid mapping entry: missing required field 'enabled'."
    );
  });

  // ── 1.13 — label is empty string ─────────────────────────────────────────
  //
  // SPEC.md §4.4 defines label as a "non-empty string".  An entry with
  // label: "" has the key present (so `in` succeeds) and is not null/undefined
  // (so `== null` succeeds), but it is semantically missing — a blank label
  // produces a mapping with no visible name in the UI.
  //
  // The guard `entry[field] === ""` catches this case.  The error message
  // re-uses "missing required field" because the intent is the same: the field
  // value is absent/unusable.
  it("returns the 'missing required field' error for a mapping entry with an empty-string label", () => {
    const emptyLabel = { ...validMapping, label: "" };
    expect(validateImportData({ mappings: [emptyLabel] })).toBe(
      "Invalid mapping entry: missing required field 'label'."
    );
  });

});
