/**
 * ADO Reader — Injectable Field-Reading Script
 *
 * This file is loaded into the background service worker's global scope via
 * `importScripts("scripts/ado-reader.js")` so that `adoReaderMain` can be
 * passed as the `func` argument to `chrome.scripting.executeScript`.  Chrome
 * serialises `adoReaderMain.toString()` and executes it in the ADO page's
 * isolated world, passing the `mappings` array as the first argument.
 * (design D-1)
 *
 * Why a regular `function` declaration, not an arrow function?
 *   `Function.prototype.toString()` on both arrow and regular functions
 *   produces valid JS when re-evaluated by `executeScript`.  However, a
 *   regular `function` declaration is a statement and serialises cleanly.
 *   It is also the established style in this codebase (detectPageType,
 *   updatePageType, etc.).  (design D-1)
 *
 * Why the optional `doc` parameter?
 *   Default parameters are evaluated lazily (at call time, not at definition
 *   time).  In Node.js / Vitest, `document` is undefined — accessing it at
 *   import time would throw.  The `doc = document` default evaluates only
 *   when `adoReaderMain` is called without a second argument, which never
 *   happens in tests (they pass a mock doc object).  In the Chrome content
 *   world the default correctly resolves to the ADO page's document.
 *   (design D-2, D-3)
 */
function adoReaderMain(mappings, doc = document) {

  /**
   * Read a single field from the ADO page and return a FieldResult.
   *
   * Kept as an inner function so the serialised `adoReaderMain.toString()`
   * that Chrome executes in the ADO page carries all its own dependencies
   * inline — no external scope needs to be transferred separately.
   *
   * @param {{ id: string, label: string, adoSelector: string }} mapping
   * @returns {{ fieldId: string, label: string, status: string, value?: string, message?: string }}
   */
  function readField(mapping) {
    const { id: fieldId, label, adoSelector } = mapping;

    // ── __URL_ID__ sentinel ───────────────────────────────────────────────
    //
    // When the selector is this special sentinel, we extract the numeric
    // work item ID from the page URL rather than querying the DOM.  ADO
    // embeds the work item ID as a pure-digit path segment in its URLs:
    //   https://dev.azure.com/org/project/_workitems/edit/42
    //
    // Why `doc.location ?? window.location`?
    //   Allows unit tests to mock the location without a real browser
    //   document.  In the Chrome content world, `doc === document` (the
    //   default), and `doc.location` is the real window.location.  (§6.2)
    if (adoSelector === "__URL_ID__") {
      const loc = doc.location ?? window.location;
      // The regex captures the first path segment that consists entirely of
      // digits, optionally followed by /, ?, # or end-of-string.  A segment
      // like "123abc" does NOT match because \d+ consumes the digits and then
      // the lookahead fails on the subsequent non-separator character.
      const match = loc.pathname.match(/\/(\d+)(?:[/?#]|$)/);
      if (match) {
        return { fieldId, label, status: "success", value: match[1] };
      }
      return {
        fieldId,
        label,
        status:  "error",
        message: "Could not extract work item ID from URL",
      };
    }

    // ── CSS selector branch ───────────────────────────────────────────────

    const el = doc.querySelector(adoSelector);
    if (!el) {
      return {
        fieldId,
        label,
        status:  "error",
        message: `Element not found (selector: ${adoSelector})`,
      };
    }

    // Extract the field value: prefer .value (input/textarea), then fall
    // back to .textContent (div, span, rich-text containers).  Strip HTML
    // from either path — ADO occasionally embeds inline tags in text fields.
    const rawValue = el.value || el.textContent?.trim() || "";
    const stripped = rawValue
      .replace(/<[^>]+>/g, " ")  // replace every HTML tag sequence with a space
      .replace(/\s+/g, " ")      // collapse consecutive whitespace to one space
      .trim();                   // remove leading / trailing whitespace

    if (!stripped) {
      return { fieldId, label, status: "blank", message: "Field is blank in ADO" };
    }

    return { fieldId, label, status: "success", value: stripped };
  }

  // ── Per-field loop with error isolation (BR-002) ─────────────────────────
  //
  // Each field is processed inside its own try/catch so that an exception
  // thrown while reading one field — caused by e.g. a buggy selector, a
  // null dereference, or an unexpected DOM state — is recorded as a
  // status:"error" result without aborting the remaining fields.
  //
  // The outer function MUST NOT throw to its caller.  `executeScript` calls
  // this function in the ADO page's isolated world; an uncaught exception
  // would cause the injection to silently fail with no result returned to
  // the service worker. (BR-002)
  const results = [];
  for (const mapping of mappings) {
    try {
      results.push(readField(mapping));
    } catch (err) {
      results.push({
        fieldId: mapping.id,
        label:   mapping.label,
        status:  "error",
        message: err.message,
      });
    }
  }
  return results;
}

// ─── Test Export ─────────────────────────────────────────────────────────────
// Allow unit tests (Vitest / Node.js) to import adoReaderMain without a Chrome
// runtime.  The guard ensures this is a no-op when loaded by Chrome's
// importScripts() or in the injected content world (where `module` is
// undefined).  Same pattern as detectPageType in service-worker.js. (design D-1)
if (typeof module !== "undefined") {
  module.exports = { adoReaderMain };
}
