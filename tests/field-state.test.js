/**
 * @vitest-environment node
 *
 * Unit tests for field-state derivation pure functions in sidepanel/app.js.
 *
 * WHY @vitest-environment node?
 *   deriveFieldUIStates, computeHasCopiedData, and computeIsClearDisabled are
 *   module-scope pure functions with no browser dependencies — same testability
 *   pattern as validateImportData and computeIsPasteDisabled.
 *
 * TDD ORDER:
 *   Written BEFORE implementation (tasks 3.1–3.3).  Running `npm test` after
 *   creating this file (but before those tasks) must produce failures.
 *   After tasks 3.1–3.3 all tests here must pass.
 *
 * WHAT IS TESTED:
 *   - deriveFieldUIStates: all 6 field state paths (not_copied, copied,
 *     copy_failed, pasted, paste_failed, skipped) plus edge cases
 *   - computeHasCopiedData: null / all-error / mixed / all-success
 *     (NOTE: takes CopiedFieldData[] with readStatus field, not FieldResult[])
 *   - computeIsClearDisabled: delegates to !hasCopiedData
 *
 * WHAT IS NOT TESTED:
 *   - Alpine store mounting (requires a browser + Alpine.js)
 *   - chrome.runtime message wiring
 */

import { describe, it, expect } from "vitest";
import { deriveFieldUIStates, computeHasCopiedData, computeIsClearDisabled } from "../sidepanel/app.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const MAPPING_A = {
  id: "m1",
  label: "Title",
  adoSelector: "input[aria-label='Title']",
  fieldSchemaName: "shg_title",
  fieldType: "text",
  enabled: true,
};

const MAPPING_B = {
  id: "m2",
  label: "Owner",
  adoSelector: "select",
  fieldSchemaName: "shg_owner",
  fieldType: "lookup",
  enabled: true,
};

// ── deriveFieldUIStates ────────────────────────────────────────────────────────

describe("deriveFieldUIStates", () => {

  // ── Basic shape ──────────────────────────────────────────────────────────

  it("returns empty array when enabledMappings is empty", () => {
    expect(deriveFieldUIStates([], null, null, null)).toEqual([]);
  });

  it("returns one FieldUIState entry per enabled mapping, in order", () => {
    const result = deriveFieldUIStates([MAPPING_A, MAPPING_B], null, null, null);
    expect(result).toHaveLength(2);
    expect(result[0].fieldId).toBe("m1");
    expect(result[1].fieldId).toBe("m2");
  });

  it("each FieldUIState includes fieldId from mapping.id and label from mapping.label", () => {
    const result = deriveFieldUIStates([MAPPING_A], null, null, null);
    expect(result[0].fieldId).toBe("m1");
    expect(result[0].label).toBe("Title");
  });

  // ── not_copied state ─────────────────────────────────────────────────────
  //
  // All rows show not_copied when copiedData is null and there are no paste results.
  // This is the initial state when the side panel opens. (§7.2; spec §Scenario: not_copied)

  it("returns not_copied state when copiedData is null and no paste results", () => {
    const result = deriveFieldUIStates([MAPPING_A], null, null, null);
    expect(result[0]).toMatchObject({
      state: "not_copied",
      copiedValue: null,
      message: null,
    });
  });

  it("returns not_copied for ALL fields when copiedData is null", () => {
    const result = deriveFieldUIStates([MAPPING_A, MAPPING_B], null, null, null);
    for (const r of result) {
      expect(r.state).toBe("not_copied");
      expect(r.copiedValue).toBeNull();
      expect(r.message).toBeNull();
    }
  });

  it("returns not_copied when copiedData array has no entry for the mapping", () => {
    // copiedData has m2 but not m1 — m1 should be not_copied
    const copiedData = [
      { fieldId: "m2", label: "Owner", value: "Bob", readStatus: "success" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, null, "copy");
    expect(result[0].state).toBe("not_copied");
  });

  // ── copied state (readStatus: "success") ─────────────────────────────────
  //
  // When a copiedData entry has readStatus "success", the field was read
  // successfully and has a value. (§7.2 spec §Scenario: copied state)

  it("returns copied state with value when copiedData has success entry", () => {
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, null, "copy");
    expect(result[0]).toMatchObject({
      state: "copied",
      copiedValue: "My Title",
      message: null,
    });
  });

  // ── copied state (readStatus: "blank") ──────────────────────────────────
  //
  // A blank result means the ADO field exists but was empty.  The state is
  // still "copied" (not "not_copied"), but copiedValue is "" — the PA field
  // will be cleared during paste. (§7.2 spec §Scenario: blank copiedItem)

  it("returns copied state with empty copiedValue when readStatus is blank", () => {
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "", readStatus: "blank" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, null, "copy");
    expect(result[0]).toMatchObject({
      state: "copied",
      copiedValue: "",
      message: null,
    });
  });

  // ── copy_failed state (readStatus: "error") ──────────────────────────────
  //
  // When adoReader returned an error for a field, the row shows copy_failed
  // with the error message.  copiedValue is null (nothing was captured).
  // (§7.2 spec §Scenario: copy_failed state)

  it("returns copy_failed state with error message when copiedData has error entry", () => {
    const copiedData = [
      {
        fieldId: "m1",
        label: "Title",
        value: "",
        readStatus: "error",
        readMessage: "Selector not found",
      },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, null, "copy");
    expect(result[0]).toMatchObject({
      state: "copy_failed",
      copiedValue: null,
      message: "Selector not found",
    });
  });

  // ── pasted state (status: "success") ──────────────────────────────────────
  //
  // After a successful paste, the row shows "pasted" with the value that was
  // written to the PA field. (§7.2 spec §Scenario: pasted state)

  it("returns pasted state when lastOperation is 'paste' and paste result is success", () => {
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "success" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "paste");
    expect(result[0]).toMatchObject({
      state: "pasted",
      copiedValue: "My Title",
      message: null,
    });
  });

  // ── paste_failed state (status: "error") ─────────────────────────────────

  it("returns paste_failed state when paste result is error", () => {
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "error", message: "Element not found" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "paste");
    expect(result[0]).toMatchObject({
      state: "paste_failed",
      copiedValue: "My Title",
      message: "Element not found",
    });
  });

  // ── paste_failed state (status: "warning") ───────────────────────────────
  //
  // "warning" means the element was found but writing produced unexpected
  // results (e.g. no option matched in a choice field).  (spec §Scenario: paste_failed)

  it("returns paste_failed state when paste result is warning", () => {
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "warning", message: "No match found" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "paste");
    expect(result[0]).toMatchObject({
      state: "paste_failed",
      message: "No match found",
    });
  });

  // ── skipped state (status: "skipped") ────────────────────────────────────
  //
  // The PA field already had a value and overwriteMode was off.
  // (spec §Scenario: skipped state; BR-002 — per-field continue-on-failure)

  it("returns skipped state when paste result is skipped", () => {
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "skipped", message: "Field already has value" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "paste");
    expect(result[0]).toMatchObject({
      state: "skipped",
      copiedValue: "My Title",
      message: "Field already has value",
    });
  });

  // ── skipped state (status: "blank") ──────────────────────────────────────

  it("returns skipped state when paste result is blank", () => {
    const copiedData = null;
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "blank", message: "Value was empty" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "paste");
    expect(result[0]).toMatchObject({
      state: "skipped",
      message: "Value was empty",
    });
  });

  // ── Precedence: paste results take priority when lastOperation === "paste" ─

  it("paste results take priority over copy results when lastOperation is 'paste'", () => {
    // Even though copiedData has a success entry, the paste result determines
    // the state when lastOperation is "paste".
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "success" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "paste");
    expect(result[0].state).toBe("pasted");
  });

  it("ignores paste results when lastOperation is not 'paste'", () => {
    // lastOperation is "copy" — the copy state should be shown, not the paste state.
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "success" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "copy");
    expect(result[0].state).toBe("copied");
  });

  it("ignores paste results when lastOperation is null", () => {
    const copiedData = null;
    const lastPasteResults = [
      { fieldId: "m1", label: "Title", status: "success" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, null);
    expect(result[0].state).toBe("not_copied");
  });

  // ── paste result not found for mapping → falls through to copy state ──────
  //
  // If lastOperation is "paste" but no paste result exists for this mapping,
  // the derivation falls through to the copiedItem check. (spec §derivation logic)

  it("falls through to copy state when no paste result exists for mapping", () => {
    const copiedData = [
      { fieldId: "m1", label: "Title", value: "My Title", readStatus: "success" },
    ];
    // Paste results only have m2, not m1
    const lastPasteResults = [
      { fieldId: "m2", label: "Owner", status: "success" },
    ];
    const result = deriveFieldUIStates([MAPPING_A], copiedData, lastPasteResults, "paste");
    expect(result[0].state).toBe("copied");
  });

  // ── Mixed mapping results ─────────────────────────────────────────────────

  it("handles mixed copy states for multiple mappings", () => {
    const copiedData = [
      { fieldId: "m1", value: "My Title", readStatus: "success" },
      { fieldId: "m2", value: "", readStatus: "error", readMessage: "Not found" },
    ];
    const result = deriveFieldUIStates([MAPPING_A, MAPPING_B], copiedData, null, "copy");
    expect(result[0].state).toBe("copied");
    expect(result[1].state).toBe("copy_failed");
  });

  it("handles mixed paste states for multiple mappings", () => {
    const copiedData = [
      { fieldId: "m1", value: "My Title", readStatus: "success" },
      { fieldId: "m2", value: "Bob", readStatus: "success" },
    ];
    const lastPasteResults = [
      { fieldId: "m1", status: "success" },
      { fieldId: "m2", status: "skipped", message: "Field already has value" },
    ];
    const result = deriveFieldUIStates([MAPPING_A, MAPPING_B], copiedData, lastPasteResults, "paste");
    expect(result[0].state).toBe("pasted");
    expect(result[1].state).toBe("skipped");
  });

});

// ── computeHasCopiedData ───────────────────────────────────────────────────────
//
// NOTE: This function takes CopiedFieldData[] (with readStatus field) — NOT the
// FieldResult[] used in the previous app-logic.test.js helper.  The distinction
// is important: CopiedFieldData is what's stored in session storage after Copy.

describe("computeHasCopiedData", () => {

  it("returns false when copiedData is null", () => {
    expect(computeHasCopiedData(null)).toBe(false);
  });

  it("returns false when copiedData is an empty array", () => {
    expect(computeHasCopiedData([])).toBe(false);
  });

  it("returns false when ALL entries have readStatus 'error'", () => {
    const copiedData = [
      { fieldId: "a", readStatus: "error" },
      { fieldId: "b", readStatus: "error" },
    ];
    expect(computeHasCopiedData(copiedData)).toBe(false);
  });

  it("returns true when at least one entry has readStatus 'success'", () => {
    const copiedData = [
      { fieldId: "a", readStatus: "error" },
      { fieldId: "b", readStatus: "success", value: "My Title" },
    ];
    expect(computeHasCopiedData(copiedData)).toBe(true);
  });

  it("returns true when at least one entry has readStatus 'blank'", () => {
    // blank means the ADO field existed but was empty — still valid paste data
    const copiedData = [
      { fieldId: "a", readStatus: "error" },
      { fieldId: "b", readStatus: "blank", value: "" },
    ];
    expect(computeHasCopiedData(copiedData)).toBe(true);
  });

  it("returns true when all entries are success", () => {
    const copiedData = [
      { fieldId: "a", readStatus: "success", value: "foo" },
      { fieldId: "b", readStatus: "success", value: "bar" },
    ];
    expect(computeHasCopiedData(copiedData)).toBe(true);
  });

});

// ── computeIsClearDisabled ─────────────────────────────────────────────────────

describe("computeIsClearDisabled", () => {

  it("returns true when hasCopiedData is false (nothing to clear)", () => {
    expect(computeIsClearDisabled(false)).toBe(true);
  });

  it("returns false when hasCopiedData is true (Clear button should be enabled)", () => {
    expect(computeIsClearDisabled(true)).toBe(false);
  });

});
