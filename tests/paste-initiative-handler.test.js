/**
 * @vitest-environment node
 *
 * Unit tests for the PASTE_INITIATIVE service-worker handler logic.
 *
 * WHY @vitest-environment node?
 *   The handler logic is a pure async function that accepts all Chrome API
 *   references as injectable dependencies — no real chrome global needed.
 *   Node is faster and this keeps the test file dependency-free.
 *
 * TDD ORDER:
 *   This file is written BEFORE handlePasteInitiative is implemented.
 *   Running `npm test` after creating this file (but before task 6.2)
 *   must produce failures.  After task 6.2 all tests here must pass.
 *
 * WHAT IS TESTED:
 *   1. pageType guard: pageType !== "pa" → { success: false, error }
 *   2. copiedData null guard → { success: false, error }
 *   3. executeScript NOT called when guards fail
 *   4. Successful injection path (executeScript called with correct args)
 *   5. Injection throws → { success: false, error }
 *
 * WHAT IS NOT TESTED:
 *   - The full chrome.runtime.onMessage wiring (tested by extension integration)
 *   - importScripts side effects (no-op in Node.js environment)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlePasteInitiative } from "../background/service-worker.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  overwriteMode: false,
  mappings: [
    {
      id:              "field-a",
      label:           "Title",
      adoSelector:     "input[aria-label='Title']",
      fieldSchemaName: "shg_title",
      fieldType:       "text",
      enabled:         true,
    },
    {
      id:              "field-b",
      label:           "Disabled",
      adoSelector:     "input[aria-label='Something']",
      fieldSchemaName: "shg_something",
      fieldType:       "text",
      enabled:         false, // disabled — should not appear in executeScript args
    },
  ],
};

const SAMPLE_COPIED_DATA = [
  { fieldId: "field-a", label: "Title", value: "My Initiative", readStatus: "success" },
];

const SAMPLE_FIELD_RESULTS = [
  { fieldId: "field-a", label: "Title", status: "success" },
];

/**
 * Build a standard deps object for testing.
 * Each dependency is a vi.fn() that can be overridden per test.
 */
function makeDeps(overrides = {}) {
  return {
    pageType: overrides.pageType ?? "pa",
    getLocalSettings: overrides.getLocalSettings ?? vi.fn().mockResolvedValue({ settings: DEFAULT_SETTINGS }),
    getSessionData:   overrides.getSessionData   ?? vi.fn().mockResolvedValue({ copiedData: SAMPLE_COPIED_DATA }),
    queryActiveTab:   overrides.queryActiveTab   ?? vi.fn().mockResolvedValue([{ id: 123 }]),
    injectScript:     overrides.injectScript     ?? vi.fn().mockResolvedValue([{ result: SAMPLE_FIELD_RESULTS }]),
    writerFunc:       overrides.writerFunc       ?? function paWriterMain() {},
    defaultSettings:  overrides.defaultSettings  ?? DEFAULT_SETTINGS,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("handlePasteInitiative", () => {

  // ── Page-type guard ─────────────────────────────────────────────────────────

  it("returns { success: false } when pageType is 'ado'", async () => {
    const deps = makeDeps({ pageType: "ado" });

    const result = await handlePasteInitiative(deps);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("returns { success: false } when pageType is 'unsupported'", async () => {
    const deps = makeDeps({ pageType: "unsupported" });

    const result = await handlePasteInitiative(deps);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("does NOT call injectScript when pageType is not 'pa'", async () => {
    const deps = makeDeps({ pageType: "ado" });

    await handlePasteInitiative(deps);

    expect(deps.injectScript).not.toHaveBeenCalled();
  });

  it("error message references PowerApps when pageType guard fails", async () => {
    const deps = makeDeps({ pageType: "unsupported" });

    const result = await handlePasteInitiative(deps);

    // The message should tell the user what's wrong — they're not on a PA page.
    expect(result.error).toMatch(/PowerApps/i);
  });

  // ── copiedData null guard ────────────────────────────────────────────────────

  it("returns { success: false } when copiedData is null in session storage", async () => {
    const deps = makeDeps({
      getSessionData: vi.fn().mockResolvedValue({ copiedData: null }),
    });

    const result = await handlePasteInitiative(deps);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("returns { success: false } when copiedData key is absent from session storage", async () => {
    const deps = makeDeps({
      // copiedData key is absent → copiedData will be undefined, treated as null
      getSessionData: vi.fn().mockResolvedValue({}),
    });

    const result = await handlePasteInitiative(deps);

    expect(result.success).toBe(false);
  });

  it("does NOT call injectScript when copiedData is null", async () => {
    const deps = makeDeps({
      getSessionData: vi.fn().mockResolvedValue({ copiedData: null }),
    });

    await handlePasteInitiative(deps);

    expect(deps.injectScript).not.toHaveBeenCalled();
  });

  it("error message references copying when copiedData guard fails", async () => {
    const deps = makeDeps({
      getSessionData: vi.fn().mockResolvedValue({ copiedData: null }),
    });

    const result = await handlePasteInitiative(deps);

    // The message should direct the user to copy first.
    expect(result.error).toMatch(/copy/i);
  });

  // ── Successful injection path ────────────────────────────────────────────────

  it("returns { success: true, results } on a successful injection", async () => {
    const deps = makeDeps();

    const result = await handlePasteInitiative(deps);

    expect(result.success).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
  });

  it("calls injectScript exactly once on the happy path", async () => {
    const deps = makeDeps();

    await handlePasteInitiative(deps);

    expect(deps.injectScript).toHaveBeenCalledTimes(1);
  });

  it("calls injectScript with the active tab id", async () => {
    const deps = makeDeps({
      queryActiveTab: vi.fn().mockResolvedValue([{ id: 999 }]),
    });

    await handlePasteInitiative(deps);

    const callArg = deps.injectScript.mock.calls[0][0];
    expect(callArg.target.tabId).toBe(999);
  });

  it("passes copiedData in the args array to injectScript", async () => {
    const deps = makeDeps();

    await handlePasteInitiative(deps);

    const callArg = deps.injectScript.mock.calls[0][0];
    // args[0] is copiedData
    expect(callArg.args[0]).toEqual(SAMPLE_COPIED_DATA);
  });

  it("passes only ENABLED mappings in the args array to injectScript", async () => {
    const deps = makeDeps();
    // DEFAULT_SETTINGS has field-a (enabled) and field-b (disabled).
    // Only field-a should appear in args[1].

    await handlePasteInitiative(deps);

    const callArg = deps.injectScript.mock.calls[0][0];
    const mappingsArg = callArg.args[1];
    expect(mappingsArg.every(m => m.enabled)).toBe(true);
    expect(mappingsArg.find(m => m.id === "field-b")).toBeUndefined();
  });

  it("passes overwriteMode in the args array to injectScript", async () => {
    const settingsWithOverwrite = { ...DEFAULT_SETTINGS, overwriteMode: true };
    const deps = makeDeps({
      getLocalSettings: vi.fn().mockResolvedValue({ settings: settingsWithOverwrite }),
    });

    await handlePasteInitiative(deps);

    const callArg = deps.injectScript.mock.calls[0][0];
    // args[2] is overwriteMode
    expect(callArg.args[2]).toBe(true);
  });

  it("passes the writerFunc as the func argument to injectScript", async () => {
    const myWriterFunc = function paWriterMain() {};
    const deps = makeDeps({ writerFunc: myWriterFunc });

    await handlePasteInitiative(deps);

    const callArg = deps.injectScript.mock.calls[0][0];
    expect(callArg.func).toBe(myWriterFunc);
  });

  it("returns the field results from the injection", async () => {
    const fieldResults = [
      { fieldId: "field-a", label: "Title", status: "success" },
      { fieldId: "field-b", label: "Other", status: "skipped" },
    ];
    const deps = makeDeps({
      injectScript: vi.fn().mockResolvedValue([{ result: fieldResults }]),
    });

    const response = await handlePasteInitiative(deps);

    expect(response.results).toEqual(fieldResults);
  });

  // ── Injection failure ────────────────────────────────────────────────────────

  it("returns { success: false, error } when injectScript throws", async () => {
    const deps = makeDeps({
      injectScript: vi.fn().mockRejectedValue(new Error("Tab navigated away")),
    });

    const result = await handlePasteInitiative(deps);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Tab navigated away");
  });

  // ── No active tab ────────────────────────────────────────────────────────────

  it("returns { success: false } when there is no active tab", async () => {
    const deps = makeDeps({
      queryActiveTab: vi.fn().mockResolvedValue([]), // empty — no active tab
    });

    const result = await handlePasteInitiative(deps);

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("does NOT call injectScript when there is no active tab", async () => {
    const deps = makeDeps({
      queryActiveTab: vi.fn().mockResolvedValue([]),
    });

    await handlePasteInitiative(deps);

    expect(deps.injectScript).not.toHaveBeenCalled();
  });

});
