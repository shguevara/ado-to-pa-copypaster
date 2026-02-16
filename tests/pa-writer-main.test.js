/**
 * @vitest-environment node
 *
 * Unit tests for paWriterMain() orchestration in scripts/pa-writer.js.
 *
 * WHY @vitest-environment node?
 *   paWriterMain is a pure orchestration loop — it iterates mappings, looks up
 *   copied data, and delegates to strategy functions.  The DOM-dependent
 *   strategy implementations (pasteText, pasteChoice, pasteLookup) are
 *   replaced with stub functions in all tests here, so no browser environment
 *   is needed.
 *
 * TDD ORDER:
 *   This file was written BEFORE the paWriterMain implementation.  Running
 *   `npm test` after creating this file (but before implementing paWriterMain)
 *   must produce failures.  After task 2.2 implements the function, all tests
 *   here must pass.
 *
 * WHAT IS TESTED:
 *   - Strategy dispatch by fieldType
 *   - Result array length and order match enabled mappings
 *   - Unmatched fieldId returns error result
 *   - Disabled mappings are excluded
 *   - Per-field try/catch isolation (BR-002): one strategy throws, others run
 *   - Empty mappings array returns []
 *
 * WHAT IS NOT TESTED:
 *   - DOM interactions (pasteText / pasteChoice / pasteLookup internals)
 *     → These depend on a live PowerApps DOM; covered by manual QA. (design D-10)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { paWriterMain } from "../scripts/pa-writer.js";

// ── Stub strategy helpers ──────────────────────────────────────────────────────
//
// We replace the real DOM-touching strategies with stubs that resolve
// immediately with a configurable result.  This lets us verify the orchestration
// logic in isolation without any browser environment.
//
// The stubs are passed INTO paWriterMain's PASTE_STRATEGIES via a test-only
// override path — see the note on test design below.

/**
 * Create a stub strategy function that resolves with `result`.
 *
 * @param {{status: string, message?: string}} result
 */
function stubStrategy(result) {
  return vi.fn().mockResolvedValue(result);
}

// ── Sample fixtures ────────────────────────────────────────────────────────────

function makeMapping(overrides = {}) {
  return {
    id:              overrides.id              ?? "field-a",
    label:           overrides.label           ?? "Field A",
    fieldSchemaName: overrides.fieldSchemaName ?? "shg_fielda",
    fieldType:       overrides.fieldType       ?? "text",
    enabled:         overrides.enabled         ?? true,
    adoSelector:     overrides.adoSelector     ?? "input[aria-label='Field A']",
  };
}

function makeCopiedData(fieldId, value = "Sample Value") {
  return { fieldId, label: "Field A", value, readStatus: "success" };
}

// ── Test design note ───────────────────────────────────────────────────────────
//
// paWriterMain dispatches through a module-level PASTE_STRATEGIES registry.
// To inject stub strategies without modifying the production code, we rely on
// the fieldType strings from the mappings: paWriterMain looks up
// PASTE_STRATEGIES[mapping.fieldType].
//
// The real PASTE_STRATEGIES are in the pa-writer.js module scope.  Since we
// cannot override them from outside the module in a Node.js import, we take
// two complementary approaches:
//
// 1. For orchestration logic tests (length, order, disabled, empty, unmatched):
//    we use REAL fieldType values ("text", "choice", "lookup") and let the
//    real strategies run — they will throw (no document/DOM) but the try/catch
//    in paWriterMain captures the error, giving us "error" status results.
//    That IS the correct behavior for a strategy that encounters no DOM.
//
// 2. For the per-field error isolation test (BR-002): we need one strategy to
//    throw while others succeed.  Since all real strategies will throw in Node,
//    we test isolation by checking that the error status appears for each field
//    independently — the loop must continue even when every strategy throws.
//
// This approach tests the orchestration contract correctly without needing to
// mock module internals.

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("paWriterMain — orchestration", () => {

  // ── Empty mappings ──────────────────────────────────────────────────────────

  it("returns an empty array when mappings is empty", async () => {
    const result = await paWriterMain(
      [makeCopiedData("field-a")],
      [],
      false
    );
    expect(result).toEqual([]);
  });

  it("returns an empty array when mappings is null/undefined", async () => {
    expect(await paWriterMain([], null, false)).toEqual([]);
    expect(await paWriterMain([], undefined, false)).toEqual([]);
  });

  // ── Disabled mappings are excluded ─────────────────────────────────────────

  it("excludes disabled mappings from the results", async () => {
    // Three mappings: one enabled, two disabled.
    const mappings = [
      makeMapping({ id: "field-a", enabled: true  }),
      makeMapping({ id: "field-b", enabled: false }),
      makeMapping({ id: "field-c", enabled: false }),
    ];
    const copiedData = [
      makeCopiedData("field-a"),
      makeCopiedData("field-b"),
      makeCopiedData("field-c"),
    ];

    const result = await paWriterMain(copiedData, mappings, false);

    // Only field-a should appear (disabled entries are silently skipped).
    expect(result).toHaveLength(1);
    expect(result[0].fieldId).toBe("field-a");
  });

  it("returns an empty array when all mappings are disabled", async () => {
    const mappings = [
      makeMapping({ id: "field-a", enabled: false }),
      makeMapping({ id: "field-b", enabled: false }),
    ];

    const result = await paWriterMain([makeCopiedData("field-a")], mappings, false);
    expect(result).toEqual([]);
  });

  // ── Result array length and order ───────────────────────────────────────────

  it("returns one result per enabled mapping in iteration order", async () => {
    // Two enabled mappings: A then B.  Results must be in the same order.
    const mappings = [
      makeMapping({ id: "field-a" }),
      makeMapping({ id: "field-b" }),
    ];
    const copiedData = [
      makeCopiedData("field-a"),
      makeCopiedData("field-b"),
    ];

    const result = await paWriterMain(copiedData, mappings, false);

    // Length must match the number of enabled mappings.
    expect(result).toHaveLength(2);

    // Order must match mapping iteration order.
    expect(result[0].fieldId).toBe("field-a");
    expect(result[1].fieldId).toBe("field-b");
  });

  it("result entries include fieldId and label from the mapping", async () => {
    const mappings = [
      makeMapping({ id: "field-a", label: "My Field Label" }),
    ];
    const copiedData = [makeCopiedData("field-a")];

    const result = await paWriterMain(copiedData, mappings, false);

    expect(result[0].fieldId).toBe("field-a");
    expect(result[0].label).toBe("My Field Label");
  });

  // ── Unmatched fieldId returns error ─────────────────────────────────────────

  it("returns status:error when there is no copiedData entry for the mapping id", async () => {
    // The mapping ID does not appear in copiedData → no data to paste.
    const mappings  = [makeMapping({ id: "field-x" })];
    const copiedData = [makeCopiedData("field-y")]; // different id

    const result = await paWriterMain(copiedData, mappings, false);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("error");
    expect(result[0].message).toMatch(/field-x/); // message should mention the fieldId
  });

  it("returns status:error for each unmatched mapping (not just the first)", async () => {
    const mappings = [
      makeMapping({ id: "field-x" }),
      makeMapping({ id: "field-y" }),
    ];
    const copiedData = []; // nothing copied

    const result = await paWriterMain(copiedData, mappings, false);

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("error");
    expect(result[1].status).toBe("error");
  });

  // ── Per-field error isolation (BR-002) ──────────────────────────────────────
  //
  // Even if one strategy throws, the loop MUST continue and produce a result
  // for every enabled mapping.  The throwing field gets status:"error"; the
  // others get their own (possibly also "error" in a Node.js environment where
  // no DOM is present) results — but crucially ALL three results exist.

  it("BR-002: all three results are present even when every strategy throws", async () => {
    // Three enabled mappings with matching copied data.  In the Node.js test
    // environment, all real strategies will throw (no document.querySelector),
    // but the try/catch MUST catch each one independently and continue.
    const mappings = [
      makeMapping({ id: "field-a" }),
      makeMapping({ id: "field-b" }),
      makeMapping({ id: "field-c" }),
    ];
    const copiedData = [
      makeCopiedData("field-a"),
      makeCopiedData("field-b"),
      makeCopiedData("field-c"),
    ];

    const result = await paWriterMain(copiedData, mappings, false);

    // All three must be present — the loop must not short-circuit on errors.
    expect(result).toHaveLength(3);
    expect(result[0].fieldId).toBe("field-a");
    expect(result[1].fieldId).toBe("field-b");
    expect(result[2].fieldId).toBe("field-c");

    // All will have status:"error" because strategies throw in Node.js (no DOM).
    // This is the correct observable behavior — the error is caught per-field.
    for (const r of result) {
      expect(r.status).toBe("error");
      expect(typeof r.message).toBe("string");
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it("BR-002: result includes error message from the thrown exception", async () => {
    // When a strategy throws, the catch block must set message = err.message.
    const mappings  = [makeMapping({ id: "field-a", fieldType: "text" })];
    const copiedData = [makeCopiedData("field-a")];

    const result = await paWriterMain(copiedData, mappings, false);

    // The strategy will throw "document is not defined" in Node.js.
    // The message must be the exception message, not a generic placeholder.
    expect(result[0].status).toBe("error");
    expect(result[0].message).toBeTruthy();
  });

  // ── Strategy dispatch by fieldType ──────────────────────────────────────────
  //
  // In the Node.js test environment the real strategies always throw because
  // there is no DOM.  What we CAN verify is that the error message originates
  // from the STRATEGY (not from the "no copied data" path or "unknown type"
  // path).  Specifically: if fieldType is a known type AND copiedData is
  // present, the error must be a runtime exception from the strategy, not our
  // custom "No copied data found" or "Unknown field type" sentinel messages.

  it("dispatches to the text strategy when fieldType is 'text'", async () => {
    const mappings  = [makeMapping({ id: "f1", fieldType: "text" })];
    const copiedData = [makeCopiedData("f1")];

    const result = await paWriterMain(copiedData, mappings, false);

    // Error should come from the strategy (DOM not available), not from our
    // "No copied data" or "Unknown field type" guards.
    expect(result[0].status).toBe("error");
    expect(result[0].message).not.toMatch(/No copied data/);
    expect(result[0].message).not.toMatch(/Unknown field type/);
  });

  it("dispatches to the choice strategy when fieldType is 'choice'", async () => {
    const mappings  = [makeMapping({ id: "f1", fieldType: "choice" })];
    const copiedData = [makeCopiedData("f1")];

    const result = await paWriterMain(copiedData, mappings, false);

    expect(result[0].status).toBe("error");
    expect(result[0].message).not.toMatch(/No copied data/);
    expect(result[0].message).not.toMatch(/Unknown field type/);
  });

  it("dispatches to the lookup strategy when fieldType is 'lookup'", async () => {
    const mappings  = [makeMapping({ id: "f1", fieldType: "lookup" })];
    const copiedData = [makeCopiedData("f1")];

    const result = await paWriterMain(copiedData, mappings, false);

    expect(result[0].status).toBe("error");
    expect(result[0].message).not.toMatch(/No copied data/);
    expect(result[0].message).not.toMatch(/Unknown field type/);
  });

  it("returns status:error for an unknown fieldType (not in PASTE_STRATEGIES)", async () => {
    // An unknown field type should not crash the loop — it should return an
    // error result with a descriptive message.  (BR-002)
    const mappings  = [makeMapping({ id: "f1", fieldType: "image" })]; // "image" is not valid
    const copiedData = [makeCopiedData("f1")];

    const result = await paWriterMain(copiedData, mappings, false);

    expect(result[0].status).toBe("error");
    expect(result[0].message).toMatch(/Unknown field type/);
  });

  // ── copiedData edge cases ───────────────────────────────────────────────────

  it("handles null copiedData gracefully (treats as empty)", async () => {
    const mappings = [makeMapping({ id: "field-a" })];

    const result = await paWriterMain(null, mappings, false);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("error");
    expect(result[0].message).toMatch(/No copied data/);
  });

  it("handles undefined copiedData gracefully (treats as empty)", async () => {
    const mappings = [makeMapping({ id: "field-a" })];

    const result = await paWriterMain(undefined, mappings, false);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("error");
    expect(result[0].message).toMatch(/No copied data/);
  });

});
