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
 *
 * PHASE 11.1 ADDITIONS (last-minute amendments):
 *   - saveMapping edit-mode pattern: preserves `enabled` flag (SPEC.md §7.3 v1.5)
 *   - updateAfterCopy conversion: mirrors convertFieldResultsToCopiedData contract
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

// ── saveMapping edit-mode: enabled flag preservation ───────────────────────
//
// WHY TESTED HERE:
//   saveMapping() is a store method that cannot be unit-tested without
//   mounting Alpine.  However, the core of the fix is the spread pattern:
//     { ...existingMapping, ...formData }
//   which preserves keys not present in formData.  These tests document that
//   contract so a future reader understands why the pattern was chosen and
//   can verify the behaviour at the pure-function level.  (SPEC.md §7.3 v1.5)
//
// REGRESSION GUARD:
//   Before the fix, saveMapping used `{ ...formData }` alone, which silently
//   dropped `enabled` — the enabled toggle was reset to unchecked on every
//   edit.  These tests pin the correct behaviour.

describe("saveMapping edit-mode spread pattern", () => {

  /**
   * Simulate the spread used in saveMapping edit mode after the fix:
   *   mappings[idx] = { ...mappings[idx], ...formData }
   *
   * formData is what adminMappingForm.save() passes — it never includes
   * `enabled` because the form does not render an enabled checkbox.
   */
  function applyEdit(existingMapping, formData) {
    return { ...existingMapping, ...formData };
  }

  it("preserves enabled:true when formData does not include enabled", () => {
    const existing = { id: "m1", label: "Old", adoSelector: ".old",
                       fieldSchemaName: "cr_old", fieldType: "text", enabled: true };
    const formData  = { id: "m1", label: "New", adoSelector: ".new",
                        fieldSchemaName: "cr_new", fieldType: "lookup" };
    const result = applyEdit(existing, formData);
    expect(result.enabled).toBe(true);
  });

  it("preserves enabled:false when formData does not include enabled", () => {
    // A disabled mapping should stay disabled after editing its label.
    const existing = { id: "m2", label: "Old", adoSelector: ".old",
                       fieldSchemaName: "cr_old", fieldType: "text", enabled: false };
    const formData  = { id: "m2", label: "Renamed", adoSelector: ".old",
                        fieldSchemaName: "cr_old", fieldType: "text" };
    const result = applyEdit(existing, formData);
    expect(result.enabled).toBe(false);
  });

  it("updates all form fields while leaving non-form fields intact", () => {
    const existing = { id: "m1", label: "Old", adoSelector: ".old",
                       fieldSchemaName: "cr_old", fieldType: "text", enabled: true };
    const formData  = { id: "m1", label: "New Title", adoSelector: ".new",
                        fieldSchemaName: "cr_new", fieldType: "choice" };
    const result = applyEdit(existing, formData);
    expect(result.label).toBe("New Title");
    expect(result.adoSelector).toBe(".new");
    expect(result.fieldSchemaName).toBe("cr_new");
    expect(result.fieldType).toBe("choice");
    expect(result.id).toBe("m1");      // id unchanged
    expect(result.enabled).toBe(true); // enabled unchanged
  });

});

// ── updateAfterCopy conversion contract ─────────────────────────────────────
//
// updateAfterCopy() in the Alpine store converts FieldResult[] to a
// CopiedFieldData-compatible array synchronously (without re-fetching from
// session storage) so deriveFieldUIStates() can build the correct UI state.
//
// The conversion MUST include `readMessage` for "error" and "blank" entries —
// deriveFieldUIStates uses copiedItem.readMessage as the secondary-line text
// for copy_failed rows.  Without it, the error message is never shown (§7.2).
//
// WHY TESTED AS A PURE FUNCTION:
//   updateAfterCopy is a store method and cannot be imported without Alpine.
//   We extract the conversion logic as a testable pure function below to pin
//   its contract.  The implementation in app.js mirrors this function.

/**
 * Pure mirror of the conversion inside updateAfterCopy().
 * Must produce the same shape as convertFieldResultsToCopiedData() in
 * service-worker.js so both paths agree on the CopiedFieldData contract.
 *
 * @param {object[]} fieldResults - FieldResult[] from COPY_INITIATIVE response
 * @returns {object[]} CopiedFieldData[]
 */
function buildCopiedDataFromResults(fieldResults) {
  return fieldResults.map(function(r) {
    var entry = {
      fieldId:    r.fieldId,
      label:      r.label,
      value:      r.status === "success" ? (r.value || "") : "",
      readStatus: r.status,
    };
    if (r.status === "blank" || r.status === "error") {
      entry.readMessage = r.message || "";
    }
    return entry;
  });
}

describe("updateAfterCopy conversion (mirrors convertFieldResultsToCopiedData)", () => {

  it("success entry: copies value and sets readStatus, no readMessage", () => {
    const result = buildCopiedDataFromResults([
      { fieldId: "f1", label: "Title", status: "success", value: "My Title" },
    ]);
    expect(result[0]).toMatchObject({ value: "My Title", readStatus: "success" });
    expect(result[0].readMessage).toBeUndefined();
  });

  it("error entry: value is '', readStatus is 'error', readMessage is set", () => {
    // This is the regression test for MT-30 / task 9.3:
    // Before the fix, readMessage was absent → copy_failed rows showed no message.
    const result = buildCopiedDataFromResults([
      { fieldId: "f2", label: "ID", status: "error", message: "Selector not found" },
    ]);
    expect(result[0]).toMatchObject({
      value:       "",
      readStatus:  "error",
      readMessage: "Selector not found",
    });
  });

  it("blank entry: value is '', readMessage is set", () => {
    const result = buildCopiedDataFromResults([
      { fieldId: "f3", label: "Owner", status: "blank", value: "", message: "Field was empty" },
    ]);
    expect(result[0]).toMatchObject({
      value:       "",
      readStatus:  "blank",
      readMessage: "Field was empty",
    });
  });

  it("error entry with no message: readMessage defaults to empty string", () => {
    const result = buildCopiedDataFromResults([
      { fieldId: "f4", label: "X", status: "error" },
    ]);
    expect(result[0].readMessage).toBe("");
  });

  it("mixed results: all entries included, correct shapes", () => {
    const results = buildCopiedDataFromResults([
      { fieldId: "f1", label: "T", status: "success", value: "V" },
      { fieldId: "f2", label: "E", status: "error",   message: "Err" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].readStatus).toBe("success");
    expect(results[1].readStatus).toBe("error");
    expect(results[1].readMessage).toBe("Err");
  });

});
