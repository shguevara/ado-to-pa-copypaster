/**
 * @vitest-environment node
 *
 * Unit tests for paste state management in sidepanel/app.js.
 *
 * WHY @vitest-environment node?
 *   The pure functions (computeIsPasteDisabled, computeHasPasteResults) and
 *   the async action runner (_runPasteInitiative) are module-scope extractions
 *   that have no browser dependencies — they can be tested cleanly in Node.
 *   (Same pattern as validateImportData in import-validator.test.js.)
 *
 * TDD ORDER:
 *   Written BEFORE the corresponding implementations.  Running `npm test`
 *   after creating this file (but before tasks 7.2–7.5) must produce failures.
 *   After tasks 7.2–7.5 all tests must pass.
 *
 * WHAT IS TESTED:
 *   - computeIsPasteDisabled: disabled when pageType !== "pa" OR hasCopiedData !== true
 *   - computeHasPasteResults: true when pasteStatus === "done" AND results non-empty
 *   - _runPasteInitiative: state transitions (pasting → done), result population,
 *     and error-sentinel entry for success:false responses
 *
 * WHAT IS NOT TESTED:
 *   - Alpine store mounting (requires a browser + Alpine.js)
 *   - The chrome.runtime.onMessage wiring
 */

import { describe, it, expect, vi } from "vitest";
import {
  computeIsPasteDisabled,
  computeHasPasteResults,
  _runPasteInitiative,
} from "../sidepanel/app.js";

// ── computeIsPasteDisabled ─────────────────────────────────────────────────────

describe("computeIsPasteDisabled", () => {

  it("returns true when pageType is 'ado'", () => {
    expect(computeIsPasteDisabled("ado", true)).toBe(true);
  });

  it("returns true when pageType is 'unsupported'", () => {
    expect(computeIsPasteDisabled("unsupported", true)).toBe(true);
  });

  it("returns true when pageType is 'pa' but hasCopiedData is false", () => {
    expect(computeIsPasteDisabled("pa", false)).toBe(true);
  });

  it("returns true when pageType is 'pa' but hasCopiedData is null/undefined", () => {
    expect(computeIsPasteDisabled("pa", null)).toBe(true);
    expect(computeIsPasteDisabled("pa", undefined)).toBe(true);
  });

  it("returns false when pageType is 'pa' AND hasCopiedData is true", () => {
    // Both conditions met — the Paste button should be enabled.
    expect(computeIsPasteDisabled("pa", true)).toBe(false);
  });

});

// ── computeHasPasteResults ─────────────────────────────────────────────────────

describe("computeHasPasteResults", () => {

  it("returns false when pasteStatus is 'idle'", () => {
    expect(computeHasPasteResults("idle", [{ fieldId: "a", status: "success" }])).toBe(false);
  });

  it("returns false when pasteStatus is 'pasting'", () => {
    expect(computeHasPasteResults("pasting", [{ fieldId: "a", status: "success" }])).toBe(false);
  });

  it("returns false when pasteStatus is 'done' but pasteResults is empty", () => {
    expect(computeHasPasteResults("done", [])).toBe(false);
  });

  it("returns true when pasteStatus is 'done' and pasteResults is non-empty", () => {
    const results = [{ fieldId: "a", label: "Title", status: "success" }];
    expect(computeHasPasteResults("done", results)).toBe(true);
  });

  it("returns true with multiple results", () => {
    const results = [
      { fieldId: "a", status: "success" },
      { fieldId: "b", status: "skipped" },
    ];
    expect(computeHasPasteResults("done", results)).toBe(true);
  });

  it("returns true even when the only result is an error sentinel", () => {
    // The error sentinel (fieldId: '__error__') is still a result and should be shown.
    const results = [{ fieldId: "__error__", label: "Error", status: "error", message: "Not on a PA page." }];
    expect(computeHasPasteResults("done", results)).toBe(true);
  });

});

// ── _runPasteInitiative ────────────────────────────────────────────────────────

describe("_runPasteInitiative", () => {

  /**
   * Build a minimal mock store state object with the paste-related properties.
   * The real store has many more properties; we only need the ones that
   * _runPasteInitiative reads or writes.
   */
  function makeMockStore(overrides = {}) {
    return {
      pasteStatus:   overrides.pasteStatus   ?? "idle",
      pasteResults:  overrides.pasteResults  ?? [],
    };
  }

  /**
   * Build a minimal mock chrome.runtime object.
   *
   * @param {object} opts
   * @param {object} opts.response - The response to pass back via the callback.
   * @param {object|null} opts.lastError - Simulate a chrome runtime error (null = no error).
   */
  function makeMockChromeRuntime(opts = {}) {
    const { response = { success: true, results: [] }, lastError = null } = opts;
    return {
      lastError,
      sendMessage: vi.fn((msg, callback) => {
        // Simulate the async callback from the service worker.
        // The sendMessage API is callback-based; _runPasteInitiative wraps it
        // in a Promise.  We call the callback synchronously here for simplicity.
        callback(response);
      }),
    };
  }

  // ── State transitions ────────────────────────────────────────────────────

  it("sets pasteStatus to 'pasting' synchronously before the message resolves", async () => {
    const store = makeMockStore();
    let statusDuringMessage;

    const chromeRuntime = {
      lastError: null,
      sendMessage: vi.fn((msg, callback) => {
        // Capture the status AT THE POINT the message is sent (before callback).
        statusDuringMessage = store.pasteStatus;
        callback({ success: true, results: [] });
      }),
    };

    await _runPasteInitiative(store, chromeRuntime);

    expect(statusDuringMessage).toBe("pasting");
  });

  it("clears pasteResults to [] before the message resolves", async () => {
    const store = makeMockStore({ pasteResults: [{ fieldId: "stale", status: "success" }] });
    let resultsDuringMessage;

    const chromeRuntime = {
      lastError: null,
      sendMessage: vi.fn((msg, callback) => {
        resultsDuringMessage = [...store.pasteResults];
        callback({ success: true, results: [] });
      }),
    };

    await _runPasteInitiative(store, chromeRuntime);

    expect(resultsDuringMessage).toEqual([]);
  });

  it("sets pasteStatus to 'done' after a successful response", async () => {
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({ response: { success: true, results: [] } });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteStatus).toBe("done");
  });

  it("sets pasteStatus to 'done' after a failed response", async () => {
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({
      response: { success: false, error: "Not on a PowerApps page." },
    });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteStatus).toBe("done");
  });

  // ── Result population ────────────────────────────────────────────────────

  it("populates pasteResults from response.results on success", async () => {
    const fieldResults = [
      { fieldId: "f1", label: "Title", status: "success" },
      { fieldId: "f2", label: "Owner", status: "skipped" },
    ];
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({
      response: { success: true, results: fieldResults },
    });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteResults).toEqual(fieldResults);
  });

  it("sets pasteResults to [] when response.results is absent (nullish coalescing)", async () => {
    const store = makeMockStore();
    // Service worker returned success:true but no results key (edge case).
    const chromeRuntime = makeMockChromeRuntime({ response: { success: true } });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteResults).toEqual([]);
  });

  // ── Error sentinel entry ─────────────────────────────────────────────────

  it("sets a single error-sentinel result when response.success is false", async () => {
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({
      response: { success: false, error: "Not on a PowerApps page." },
    });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteResults).toHaveLength(1);
    const sentinel = store.pasteResults[0];
    expect(sentinel.fieldId).toBe("__error__");
    expect(sentinel.status).toBe("error");
    expect(sentinel.message).toBe("Not on a PowerApps page.");
  });

  it("error sentinel label is 'Error'", async () => {
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({
      response: { success: false, error: "Some error" },
    });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteResults[0].label).toBe("Error");
  });

  it("handles chrome.runtime.lastError by setting an error sentinel", async () => {
    const store = makeMockStore();
    const chromeRuntime = {
      lastError: { message: "Could not establish connection." },
      sendMessage: vi.fn((msg, callback) => {
        callback(undefined); // callback receives undefined when lastError is set
      }),
    };

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteStatus).toBe("done");
    expect(store.pasteResults).toHaveLength(1);
    expect(store.pasteResults[0].status).toBe("error");
    expect(store.pasteResults[0].message).toBe("Could not establish connection.");
  });

  // ── Message sent correctly ───────────────────────────────────────────────

  it("sends PASTE_INITIATIVE action to the background", async () => {
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime();

    await _runPasteInitiative(store, chromeRuntime);

    expect(chromeRuntime.sendMessage).toHaveBeenCalledTimes(1);
    const [msg] = chromeRuntime.sendMessage.mock.calls[0];
    expect(msg.action).toBe("PASTE_INITIATIVE");
  });

});
