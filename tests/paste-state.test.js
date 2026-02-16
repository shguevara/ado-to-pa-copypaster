/**
 * @vitest-environment node
 *
 * Unit tests for paste state management in sidepanel/app.js.
 *
 * WHY @vitest-environment node?
 *   The pure functions (computeIsPasteDisabled) and the async action runner
 *   (_runPasteInitiative) are module-scope extractions that have no browser
 *   dependencies — they can be tested cleanly in Node.
 *   (Same pattern as validateImportData in import-validator.test.js.)
 *
 * WHAT IS TESTED:
 *   - computeIsPasteDisabled: disabled when pageType !== "pa" OR hasCopiedData !== true
 *   - _runPasteInitiative: state transitions (pasting → done), updateAfterPaste
 *     delegation, and error-sentinel entry for success:false responses
 *
 * WHAT IS NOT TESTED:
 *   - computeHasPasteResults (removed in Phase 11 — function deleted from app.js)
 *   - Alpine store mounting (requires a browser + Alpine.js)
 *   - The chrome.runtime.onMessage wiring
 */

import { describe, it, expect, vi } from "vitest";
import {
  computeIsPasteDisabled,
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

// ── _runPasteInitiative ────────────────────────────────────────────────────────
//
// Phase 11 update: _runPasteInitiative now calls state.updateAfterPaste(results)
// instead of directly mutating state.pasteResults.  The mock store therefore
// needs the updateAfterPaste method rather than a pasteResults property.
// (design D-4, D-5; task 1.4)

describe("_runPasteInitiative", () => {

  /**
   * Build a minimal mock store state object with the paste-related properties.
   *
   * Phase 11 change: `pasteResults` replaced by `lastPasteResults` and
   * `updateAfterPaste(results)` method.  The real store's updateAfterPaste
   * method sets lastPasteResults, updates lastOperation, and re-derives
   * fieldUIStates — here we just capture the argument for assertion.
   */
  function makeMockStore(overrides = {}) {
    const store = {
      pasteStatus:      overrides.pasteStatus      ?? "idle",
      lastPasteResults: overrides.lastPasteResults ?? null,
    };
    // updateAfterPaste is a vi.fn() so tests can assert it was called with
    // the correct argument.  The implementation also sets lastPasteResults
    // for convenience in tests that need to read the final value.
    store.updateAfterPaste = vi.fn(function(results) {
      store.lastPasteResults = results;
    });
    return store;
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
        statusDuringMessage = store.pasteStatus;
        callback({ success: true, results: [] });
      }),
    };

    await _runPasteInitiative(store, chromeRuntime);

    expect(statusDuringMessage).toBe("pasting");
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

  // ── updateAfterPaste delegation ──────────────────────────────────────────
  //
  // Phase 11: _runPasteInitiative delegates result storage to
  // state.updateAfterPaste() rather than directly mutating state.pasteResults.
  // This keeps the function testable (only needs a mock with the method) and
  // avoids duplicating the deriveFieldUIStates call site.  (design D-5)

  it("calls state.updateAfterPaste with response.results on success", async () => {
    const fieldResults = [
      { fieldId: "f1", label: "Title", status: "success" },
      { fieldId: "f2", label: "Owner", status: "skipped" },
    ];
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({
      response: { success: true, results: fieldResults },
    });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.updateAfterPaste).toHaveBeenCalledTimes(1);
    expect(store.updateAfterPaste).toHaveBeenCalledWith(fieldResults);
  });

  it("calls state.updateAfterPaste with [] when response.results is absent", async () => {
    const store = makeMockStore();
    // Service worker returned success:true but no results key (edge case).
    const chromeRuntime = makeMockChromeRuntime({ response: { success: true } });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.updateAfterPaste).toHaveBeenCalledWith([]);
  });

  // ── Error sentinel entry ─────────────────────────────────────────────────

  it("calls updateAfterPaste with a single error-sentinel when response.success is false", async () => {
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({
      response: { success: false, error: "Not on a PowerApps page." },
    });

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.updateAfterPaste).toHaveBeenCalledTimes(1);
    const arg = store.updateAfterPaste.mock.calls[0][0];
    expect(arg).toHaveLength(1);
    expect(arg[0].fieldId).toBe("__error__");
    expect(arg[0].status).toBe("error");
    expect(arg[0].message).toBe("Not on a PowerApps page.");
  });

  it("error sentinel label is 'Error'", async () => {
    const store = makeMockStore();
    const chromeRuntime = makeMockChromeRuntime({
      response: { success: false, error: "Some error" },
    });

    await _runPasteInitiative(store, chromeRuntime);

    const arg = store.updateAfterPaste.mock.calls[0][0];
    expect(arg[0].label).toBe("Error");
  });

  it("calls updateAfterPaste with error-sentinel when chrome.runtime.lastError occurs", async () => {
    const store = makeMockStore();
    const chromeRuntime = {
      lastError: { message: "Could not establish connection." },
      sendMessage: vi.fn((msg, callback) => {
        callback(undefined); // callback receives undefined when lastError is set
      }),
    };

    await _runPasteInitiative(store, chromeRuntime);

    expect(store.pasteStatus).toBe("done");
    expect(store.updateAfterPaste).toHaveBeenCalledTimes(1);
    const arg = store.updateAfterPaste.mock.calls[0][0];
    expect(arg[0].status).toBe("error");
    expect(arg[0].message).toBe("Could not establish connection.");
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
