/**
 * @vitest-environment node
 *
 * Unit tests for the COPY_INITIATIVE field-result conversion logic in
 * background/service-worker.js.
 *
 * WHY @vitest-environment node?
 *   convertFieldResultsToCopiedData is a pure module-scope function with no
 *   Chrome API dependencies — same testability pattern as detectPageType.
 *
 * TDD ORDER:
 *   Written BEFORE implementation (task 2.1).  Running `npm test` after
 *   creating this file (but before task 2.1) must produce failures because
 *   convertFieldResultsToCopiedData is not yet exported.
 *   After task 2.1 all tests here must pass.
 *
 * WHAT IS TESTED:
 *   Phase 11 D-6 behavior change: ALL FieldResult entries (including errors)
 *   are now converted to CopiedFieldData and persisted.  Previously only
 *   "success" and "blank" entries were stored.
 *
 * WHAT IS NOT TESTED:
 *   - The full onMessage COPY_INITIATIVE handler (requires Chrome APIs)
 *   - Session storage writes (integration concern)
 */

import { describe, it, expect } from "vitest";
import { convertFieldResultsToCopiedData } from "../background/service-worker.js";

describe("convertFieldResultsToCopiedData", () => {

  // ── Success entries ──────────────────────────────────────────────────────

  it("converts a success result with the correct shape", () => {
    const fieldResults = [
      { fieldId: "f1", label: "Title", status: "success", value: "My Title" },
    ];
    const result = convertFieldResultsToCopiedData(fieldResults);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fieldId:    "f1",
      label:      "Title",
      value:      "My Title",
      readStatus: "success",
    });
    // No readMessage on success entries
    expect(result[0].readMessage).toBeUndefined();
  });

  // ── Blank entries ────────────────────────────────────────────────────────

  it("converts a blank result with value '' and includes readMessage", () => {
    const fieldResults = [
      { fieldId: "f2", label: "Owner", status: "blank", value: "", message: "Field was empty" },
    ];
    const result = convertFieldResultsToCopiedData(fieldResults);
    expect(result[0]).toMatchObject({
      fieldId:     "f2",
      value:       "",
      readStatus:  "blank",
      readMessage: "Field was empty",
    });
  });

  // ── Error entries (Phase 11 NEW behavior) ────────────────────────────────
  //
  // Previous behavior: error entries were EXCLUDED from the CopiedFieldData[]
  // written to session storage.
  //
  // New behavior (Phase 11 D-6): error entries ARE included with value: ""
  // and readMessage set to the error text.  This lets the side panel show
  // FAILED badges even after tab switches (since the data is persisted).

  it("includes error entries in the output — NEW Phase 11 behavior", () => {
    const fieldResults = [
      { fieldId: "f3", label: "ID", status: "error", message: "Selector not found" },
    ];
    const result = convertFieldResultsToCopiedData(fieldResults);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fieldId:     "f3",
      label:       "ID",
      value:       "",
      readStatus:  "error",
      readMessage: "Selector not found",
    });
  });

  it("error entry has value '' even if the original result had a value", () => {
    // Error results should always have value: "" — there is no valid captured value
    const fieldResults = [
      { fieldId: "f3", label: "ID", status: "error", value: "should be ignored", message: "Err" },
    ];
    const result = convertFieldResultsToCopiedData(fieldResults);
    expect(result[0].value).toBe("");
  });

  it("error entry with null message gets readMessage set to empty string", () => {
    const fieldResults = [
      { fieldId: "f3", label: "ID", status: "error" },
    ];
    const result = convertFieldResultsToCopiedData(fieldResults);
    expect(result[0].readMessage).toBe("");
  });

  // ── Mixed results ────────────────────────────────────────────────────────
  //
  // The core Phase 11 scenario: when adoReader returns one success and one
  // error, BOTH should appear in the output.

  it("includes both success and error entries when results are mixed", () => {
    const fieldResults = [
      { fieldId: "f1", label: "Title", status: "success", value: "My Title" },
      { fieldId: "f2", label: "ID",    status: "error",   message: "Selector not found" },
    ];
    const result = convertFieldResultsToCopiedData(fieldResults);
    expect(result).toHaveLength(2);
    expect(result[0].readStatus).toBe("success");
    expect(result[1].readStatus).toBe("error");
    expect(result[1].readMessage).toBe("Selector not found");
  });

  it("preserves the order of input fieldResults", () => {
    const fieldResults = [
      { fieldId: "z", label: "Last",  status: "success", value: "Z" },
      { fieldId: "a", label: "First", status: "success", value: "A" },
    ];
    const result = convertFieldResultsToCopiedData(fieldResults);
    expect(result[0].fieldId).toBe("z");
    expect(result[1].fieldId).toBe("a");
  });

  it("returns an empty array for empty input", () => {
    expect(convertFieldResultsToCopiedData([])).toEqual([]);
  });

});
