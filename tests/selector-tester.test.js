/**
 * @vitest-environment node
 *
 * Unit tests for selector-tester.js — both `derivePaSelector` (pure) and
 * `selectorTesterMain` (DOM-dependent, tested with mocked globals).
 *
 * Why @vitest-environment node?
 *   selector-tester.js is an injected script that normally runs in a browser
 *   tab.  Its DOM-access code is isolated inside selectorTesterMain().  The
 *   derivePaSelector helper is pure — no DOM involved.  For selectorTesterMain
 *   tests that need document.querySelector we mount a minimal global mock in
 *   each test and tear it down afterwards — no jsdom required.  (design D-1)
 *
 * TDD ORDER: These tests are written BEFORE the implementation.
 *   Running `npm test` after creating this file must fail with import errors
 *   or "is not a function" errors.  The implementation in selector-tester.js
 *   must make every test here pass.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { derivePaSelector, selectorTesterMain } from "../scripts/selector-tester.js";

// ── Global document mock helpers ──────────────────────────────────────────────

/**
 * Install a minimal document mock on globalThis so selectorTesterMain can call
 * document.querySelector() during tests.
 *
 * Why mock rather than jsdom?
 *   selectorTesterMain only uses document.querySelector and el.style.outline /
 *   el.tagName.  A POJO with those properties is sufficient and keeps the test
 *   suite fast and dependency-free — the same approach used in element-picker.test.js.
 *
 * @param {Element|null} returnValue - The mock element querySelector returns.
 * @param {boolean} shouldThrow - If true, querySelector throws instead of returning.
 */
let savedDocument;

function installDocumentMock(returnValue, shouldThrow = false) {
  savedDocument = globalThis.document;
  globalThis.document = {
    querySelector: shouldThrow
      ? () => { throw new Error("Invalid CSS selector"); }
      : vi.fn().mockReturnValue(returnValue),
  };
}

function restoreDocument() {
  if (savedDocument === undefined) {
    delete globalThis.document;
  } else {
    globalThis.document = savedDocument;
  }
}

// ─── derivePaSelector — pure selector string derivation ───────────────────────

describe("derivePaSelector", () => {

  // Task 1.1 — PA selector derivation for text, choice, and lookup (primary)

  it("1.1a — text type: derives the text-box selector from the schema name", () => {
    // Spec §6.5.1: text → [data-id="{schema}.fieldControl-text-box-text"]
    const result = derivePaSelector("shg_title", "text");
    expect(result.primary).toBe('[data-id="shg_title.fieldControl-text-box-text"]');
  });

  it("1.1b — choice type: derives the option-set-select selector from the schema name", () => {
    // Spec §6.5.1: choice → [data-id="{schema}.fieldControl-option-set-select"]
    const result = derivePaSelector("shg_status", "choice");
    expect(result.primary).toBe('[data-id="shg_status.fieldControl-option-set-select"]');
  });

  it("1.1c — lookup type: derives the textInputBox primary selector", () => {
    // Spec §6.5.1: lookup primary →
    //   [data-id="{schema}.fieldControl-LookupResultsDropdown_{schema}_textInputBox_with_filter_new"]
    const result = derivePaSelector("shg_owner", "lookup");
    expect(result.primary).toBe(
      '[data-id="shg_owner.fieldControl-LookupResultsDropdown_shg_owner_textInputBox_with_filter_new"]'
    );
  });

  // Task 1.2 — lookup fallback: derivePaSelector returns BOTH primary and fallback selectors

  it("1.2a — lookup type: also returns the fallback selected_tag selector", () => {
    // Spec §6.5.1 / design D-5: lookup fallback →
    //   [data-id="{schema}.fieldControl-LookupResultsDropdown_{schema}_selected_tag"]
    const result = derivePaSelector("shg_owner", "lookup");
    expect(result.fallback).toBe(
      '[data-id="shg_owner.fieldControl-LookupResultsDropdown_shg_owner_selected_tag"]'
    );
  });

  it("1.2b — text type: fallback is the whole-number-text-input selector", () => {
    // PA whole-number fields (e.g. Planned Year) use fieldControl-whole-number-text-input
    // instead of fieldControl-text-box-text.  Both map to fieldType "text".
    // A fallback selector is required so the tester and writer try the second
    // suffix when the first is not found.
    const result = derivePaSelector("shg_plannedroadmapyear", "text");
    expect(result.fallback).toBe(
      '[data-id="shg_plannedroadmapyear.fieldControl-whole-number-text-input"]'
    );
  });

  it("1.2c — choice type has no fallback selector", () => {
    const result = derivePaSelector("shg_status", "choice");
    expect(result.fallback).toBeUndefined();
  });

  it("1.2d — lookup selector strings correctly embed the schema name in both positions", () => {
    // The schema name appears twice in the lookup selector — once for the field
    // schema namespace prefix, once for the data-id sub-path.  Use a different
    // schema name to prove neither is hardcoded.
    const result = derivePaSelector("cr123_initiative", "lookup");
    expect(result.primary).toContain("cr123_initiative.fieldControl");
    expect(result.primary).toContain("cr123_initiative_textInputBox");
    expect(result.fallback).toContain("cr123_initiative.fieldControl");
    expect(result.fallback).toContain("cr123_initiative_selected_tag");
  });

});

// ─── selectorTesterMain — DOM integration (mocked document) ───────────────────

describe("selectorTesterMain", () => {

  afterEach(() => {
    restoreDocument();
  });

  // Task 1.3 — ADO pass-through: adoSelector is used verbatim, no transformation

  it("1.3a — mode 'ado': calls document.querySelector with the exact adoSelector string", () => {
    const mockEl = { tagName: "INPUT", style: { outline: "" } };
    installDocumentMock(mockEl);

    const result = selectorTesterMain({
      mode: "ado",
      adoSelector: "input[aria-label='Title']",
    });

    // querySelector must be called with the selector unchanged.
    expect(globalThis.document.querySelector).toHaveBeenCalledWith("input[aria-label='Title']");
    expect(result.found).toBe(true);
    expect(result.tagName).toBe("INPUT");
  });

  it("1.3b — mode 'ado': returns { found: false } when element is not in the page", () => {
    // querySelector returns null → element not present.
    installDocumentMock(null);

    const result = selectorTesterMain({
      mode: "ado",
      adoSelector: ".shg-nonexistent",
    });

    expect(result).toEqual({ found: false });
  });

  it("1.3c — mode 'ado': does NOT apply any PA selector derivation (schema name is irrelevant)", () => {
    const mockEl = { tagName: "SPAN", style: { outline: "" } };
    installDocumentMock(mockEl);

    // Passing fieldSchemaName + fieldType should be ignored in ado mode.
    selectorTesterMain({
      mode:            "ado",
      adoSelector:     ".my-raw-selector",
      fieldSchemaName: "shg_title",   // should be ignored
      fieldType:       "text",        // should be ignored
    });

    // querySelector must be called with adoSelector, not a derived PA selector.
    expect(globalThis.document.querySelector).toHaveBeenCalledWith(".my-raw-selector");
    expect(globalThis.document.querySelector).toHaveBeenCalledTimes(1);
  });

  // Task 1.4 — Exception path: querySelector throws → { found: false, error: message }

  it("1.4a — returns { found: false, error } when querySelector throws (no re-throw)", () => {
    // A malformed CSS selector string causes querySelector to throw a DOMException.
    // The script must catch it and return { found: false, error: <message> } rather
    // than propagating the exception to the host page.  (spec §Scenario: Script exception is caught)
    installDocumentMock(null, /* shouldThrow */ true);

    let threw = false;
    let result;
    try {
      result = selectorTesterMain({
        mode:        "ado",
        adoSelector: "###invalid",
      });
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result.found).toBe(false);
    expect(result.error).toBe("Invalid CSS selector");
  });

  it("1.4b — exception from PA mode querySelector is also caught", () => {
    installDocumentMock(null, /* shouldThrow */ true);

    let result;
    expect(() => {
      result = selectorTesterMain({
        mode:            "pa",
        fieldSchemaName: "shg_title",
        fieldType:       "text",
      });
    }).not.toThrow();

    expect(result.found).toBe(false);
    expect(result.error).toBe("Invalid CSS selector");
  });

  // Additional integration checks for PA mode

  it("PA text mode: calls querySelector with the derived text-box selector", () => {
    const mockEl = { tagName: "INPUT", style: { outline: "" } };
    installDocumentMock(mockEl);

    const result = selectorTesterMain({
      mode:            "pa",
      fieldSchemaName: "shg_title",
      fieldType:       "text",
    });

    expect(globalThis.document.querySelector).toHaveBeenCalledWith(
      '[data-id="shg_title.fieldControl-text-box-text"]'
    );
    expect(result).toEqual({ found: true, tagName: "INPUT" });
  });

  it("PA text mode: falls back to whole-number-text-input when primary returns null", () => {
    // PA whole-number fields (e.g. Planned Year / shg_plannedroadmapyear) use
    // fieldControl-whole-number-text-input instead of fieldControl-text-box-text.
    // When the primary selector returns null the fallback must be tried.
    const wholeNumberEl = { tagName: "INPUT", style: { outline: "" } };
    const querySpy = vi.fn()
      .mockReturnValueOnce(null)           // primary (text-box-text) → not found
      .mockReturnValueOnce(wholeNumberEl); // fallback (whole-number-text-input) → found
    savedDocument = globalThis.document;
    globalThis.document = { querySelector: querySpy };

    const result = selectorTesterMain({
      mode:            "pa",
      fieldSchemaName: "shg_plannedroadmapyear",
      fieldType:       "text",
    });

    expect(querySpy).toHaveBeenNthCalledWith(1,
      '[data-id="shg_plannedroadmapyear.fieldControl-text-box-text"]'
    );
    expect(querySpy).toHaveBeenNthCalledWith(2,
      '[data-id="shg_plannedroadmapyear.fieldControl-whole-number-text-input"]'
    );
    expect(result).toEqual({ found: true, tagName: "INPUT" });
  });

  it("PA text mode: returns { found: false } when both primary and whole-number fallback are null", () => {
    const querySpy = vi.fn().mockReturnValue(null);
    savedDocument = globalThis.document;
    globalThis.document = { querySelector: querySpy };

    const result = selectorTesterMain({
      mode:            "pa",
      fieldSchemaName: "shg_plannedroadmapyear",
      fieldType:       "text",
    });

    expect(querySpy).toHaveBeenCalledTimes(2); // primary + fallback both tried
    expect(result).toEqual({ found: false });
  });

  it("PA lookup mode: returns found when primary selector matches (no fallback needed)", () => {
    // Primary selector matches — fallback must NOT be tried.
    const mockEl = { tagName: "INPUT", style: { outline: "" } };
    const querySpy = vi.fn().mockReturnValue(mockEl);
    savedDocument = globalThis.document;
    globalThis.document = { querySelector: querySpy };

    const result = selectorTesterMain({
      mode:            "pa",
      fieldSchemaName: "shg_owner",
      fieldType:       "lookup",
    });

    // Only the primary selector should be called.
    expect(querySpy).toHaveBeenCalledWith(
      '[data-id="shg_owner.fieldControl-LookupResultsDropdown_shg_owner_textInputBox_with_filter_new"]'
    );
    expect(querySpy).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ found: true, tagName: "INPUT" });
  });

  it("PA lookup mode: falls back to selected_tag selector when primary returns null", () => {
    // Primary returns null (field filled / no text input visible).
    // Fallback selector must be tried and the matched element returned.
    const fallbackEl = { tagName: "BUTTON", style: { outline: "" } };
    const querySpy = vi.fn()
      .mockReturnValueOnce(null)         // primary → null
      .mockReturnValueOnce(fallbackEl);  // fallback → found
    savedDocument = globalThis.document;
    globalThis.document = { querySelector: querySpy };

    const result = selectorTesterMain({
      mode:            "pa",
      fieldSchemaName: "shg_owner",
      fieldType:       "lookup",
    });

    // Both primary and fallback must be tried (in that order).
    expect(querySpy).toHaveBeenNthCalledWith(1,
      '[data-id="shg_owner.fieldControl-LookupResultsDropdown_shg_owner_textInputBox_with_filter_new"]'
    );
    expect(querySpy).toHaveBeenNthCalledWith(2,
      '[data-id="shg_owner.fieldControl-LookupResultsDropdown_shg_owner_selected_tag"]'
    );
    expect(result).toEqual({ found: true, tagName: "BUTTON" });
  });

  it("PA lookup mode: returns { found: false } when both primary and fallback are null", () => {
    const querySpy = vi.fn().mockReturnValue(null);
    savedDocument = globalThis.document;
    globalThis.document = { querySelector: querySpy };

    const result = selectorTesterMain({
      mode:            "pa",
      fieldSchemaName: "shg_owner",
      fieldType:       "lookup",
    });

    expect(result).toEqual({ found: false });
  });

});
