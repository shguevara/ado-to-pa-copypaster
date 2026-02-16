/**
 * @vitest-environment node
 *
 * Why the explicit annotation?
 *   scripts/ado-reader.js references `document` (default parameter) and
 *   `window` (fallback in function body).  Vitest v2 static analysis sees
 *   these browser globals and may attempt to load jsdom automatically.
 *   Annotating with `@vitest-environment node` overrides that detection and
 *   prevents the "Cannot find package 'jsdom'" error, consistent with the
 *   mock-doc strategy in design D-3.  (vitest.config.js is also set to
 *   environment: "node" globally, but explicit beats implicit.)
 */

/**
 * Unit tests for adoReaderMain() — the injectable ADO field-reader function
 * in scripts/ado-reader.js.
 *
 * Why mock document objects instead of jsdom?
 *   The design (D-3) specifies minimal mock objects to keep tests fast and
 *   dependency-free, consistent with the established Node/Vitest test style
 *   in this repo.  adoReaderMain accepts an optional `doc` argument so tests
 *   can inject a plain JS object rather than a real DOM document.
 *
 * Why no `@vitest-environment jsdom` annotation?
 *   The function's logic (URL extraction, HTML stripping, selector lookup,
 *   value extraction) is exercisable with simple mock objects.  Adding jsdom
 *   would slow down the suite and add a heavyweight dependency for no gain.
 *
 * TDD order: these tests were written BEFORE the implementation of
 * adoReaderMain, so they started failing.  Once the function is implemented
 * and exported, all tests must pass.
 */

import { describe, it, expect } from "vitest";
import { adoReaderMain } from "../scripts/ado-reader.js";

// ── Test helpers ─────────────────────────────────────────────────────────────

/**
 * Build a minimal mock document that supplies querySelector and location.
 * querySelector returns an element with the given value/textContent by default,
 * or `null` when `el: null` is passed explicitly.
 *
 * @param {{ value?, textContent?, el?, location? }} opts
 */
function makeMockDoc({
  value = "default value",
  textContent = "",
  el = undefined,
  location = { pathname: "/" },
} = {}) {
  // When `el` is explicitly passed (including `null`), use it directly.
  // Otherwise build a minimal element object from value/textContent.
  const element = el !== undefined ? el : { value, textContent };
  return {
    location,
    querySelector: () => element,
  };
}

/**
 * Build a minimal mapping object for testing.
 */
function makeMapping({ id = "field-1", label = "Field 1", adoSelector = ".my-field" } = {}) {
  return { id, label, adoSelector };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("adoReaderMain", () => {

  // ── FieldResult[] contract ────────────────────────────────────────────────

  it("returns an empty array when mappings is empty", () => {
    // An empty input must produce an empty output — no phantom entries.
    const result = adoReaderMain([], makeMockDoc());
    expect(result).toEqual([]);
  });

  it("returns results in the same order as the input mappings", () => {
    // Output order must mirror input order so the caller can correlate results
    // back to the original mapping configuration.
    const mappings = [
      makeMapping({ id: "a", label: "Alpha", adoSelector: ".alpha" }),
      makeMapping({ id: "b", label: "Beta",  adoSelector: ".beta"  }),
    ];
    const doc = makeMockDoc({ value: "some value" });
    const results = adoReaderMain(mappings, doc);
    expect(results).toHaveLength(2);
    expect(results[0].fieldId).toBe("a");
    expect(results[1].fieldId).toBe("b");
  });

  it("includes fieldId (from mapping.id) and label (from mapping.label) in every result", () => {
    const mapping = makeMapping({ id: "my-id", label: "My Label", adoSelector: ".field" });
    const doc = makeMockDoc({ value: "value" });
    const [result] = adoReaderMain([mapping], doc);
    expect(result.fieldId).toBe("my-id");
    expect(result.label).toBe("My Label");
  });

  // ── __URL_ID__ sentinel ────────────────────────────────────────────────────

  it("extracts the numeric work item ID from the URL when adoSelector is __URL_ID__ (success)", () => {
    // The regex /\/(\d+)(?:[/?#]|$)/ must match the terminal digit segment.
    const mapping = makeMapping({ id: "id-field", label: "Initiative ID", adoSelector: "__URL_ID__" });
    const doc = {
      location: { pathname: "/org/project/_workitems/edit/42" },
      querySelector: () => null,
    };
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("success");
    expect(result.value).toBe("42");
    expect(result.fieldId).toBe("id-field");
    expect(result.label).toBe("Initiative ID");
  });

  it("returns status error when __URL_ID__ finds no numeric segment in the URL", () => {
    // A URL without any pure-digit path segment must produce a clear error.
    const mapping = makeMapping({ id: "id-field", label: "Initiative ID", adoSelector: "__URL_ID__" });
    const doc = {
      location: { pathname: "/no/numeric/segments/here" },
      querySelector: () => null,
    };
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("error");
    expect(result.message).toBeTruthy(); // message must be non-empty
    expect(result.fieldId).toBe("id-field");
  });

  // ── DOM selector branch ────────────────────────────────────────────────────

  it("reads value from el.value when an input element is found (value path)", () => {
    const mapping = makeMapping({ adoSelector: "input.title" });
    // Simulate an <input> whose .value is populated.
    const doc = makeMockDoc({ value: "My Initiative Title", textContent: "" });
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("success");
    expect(result.value).toBe("My Initiative Title");
  });

  it("falls back to el.textContent when el.value is falsy (textContent path)", () => {
    const mapping = makeMapping({ adoSelector: "div.summary" });
    // Simulate a <div> where .value is undefined/empty and .textContent has text.
    const doc = makeMockDoc({ value: "", textContent: "Summary text" });
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("success");
    expect(result.value).toBe("Summary text");
  });

  // ── HTML stripping ─────────────────────────────────────────────────────────

  it("strips HTML tags from the extracted value and normalises whitespace", () => {
    const mapping = makeMapping({ adoSelector: ".rich-text" });
    // Raw value contains inline HTML — tags must be removed and whitespace collapsed.
    const doc = makeMockDoc({ value: "Hello <b>World</b> test", textContent: "" });
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("success");
    expect(result.value).toBe("Hello World test");
  });

  it("passes plain text through unchanged when no HTML is present", () => {
    const mapping = makeMapping({ adoSelector: ".plain" });
    const doc = makeMockDoc({ value: "Plain text", textContent: "" });
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("success");
    expect(result.value).toBe("Plain text");
  });

  // ── Blank detection ────────────────────────────────────────────────────────

  it("returns status blank when the extracted value is an empty string", () => {
    // A found element with no content is treated as blank — not an error.
    const mapping = makeMapping({ adoSelector: ".empty-field" });
    const doc = makeMockDoc({ value: "", textContent: "" });
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("blank");
    expect(result.message).toBe("Field is blank in ADO");
    expect(result.fieldId).toBe(mapping.id);
  });

  // ── Element not found ──────────────────────────────────────────────────────

  it("returns status error including the selector string when querySelector returns null", () => {
    const mapping = makeMapping({ adoSelector: ".nonexistent-selector" });
    // Explicitly pass `el: null` to make querySelector return null.
    const doc = makeMockDoc({ el: null });
    const [result] = adoReaderMain([mapping], doc);
    expect(result.status).toBe("error");
    // The error message must embed the selector so the user knows which field failed.
    expect(result.message).toContain(".nonexistent-selector");
    expect(result.fieldId).toBe(mapping.id);
  });

  // ── Per-field error isolation (BR-002) ────────────────────────────────────

  it("isolates per-field errors — surrounding fields are unaffected when one throws (BR-002)", () => {
    // Three mappings: the second one throws an unexpected error during querySelector.
    // The first and third must still return successful results.
    const mappings = [
      makeMapping({ id: "a", label: "Alpha", adoSelector: ".alpha" }),
      makeMapping({ id: "b", label: "Beta",  adoSelector: ".beta"  }),
      makeMapping({ id: "c", label: "Gamma", adoSelector: ".gamma" }),
    ];
    const doc = {
      location: { pathname: "/" },
      querySelector: (selector) => {
        // The second field's selector triggers an unexpected DOM-level error.
        if (selector === ".beta") throw new Error("Unexpected DOM error");
        return { value: "found", textContent: "" };
      },
    };

    const results = adoReaderMain(mappings, doc);

    // All three results must be present — no result is silently dropped.
    expect(results).toHaveLength(3);

    // First and third succeed despite the middle field throwing.
    expect(results[0].fieldId).toBe("a");
    expect(results[0].status).toBe("success");

    expect(results[2].fieldId).toBe("c");
    expect(results[2].status).toBe("success");

    // The middle field captures the exception as a status:error result.
    expect(results[1].fieldId).toBe("b");
    expect(results[1].status).toBe("error");
    expect(results[1].message).toBe("Unexpected DOM error");
  });

});
