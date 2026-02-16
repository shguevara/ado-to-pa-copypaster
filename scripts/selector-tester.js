/**
 * Selector Tester — injected on-demand into ADO or PA tabs.
 *
 * Purpose:
 *   Given a `{ mode, ... }` argument, either:
 *     • mode "pa"  — derive the PA data-id selector from fieldSchemaName +
 *                    fieldType, run document.querySelector, highlight if found.
 *     • mode "ado" — run document.querySelector(adoSelector) directly.
 *
 *   In both modes: return a structured result object; never throw to the host
 *   page.  This lets the service worker forward the result to the side panel
 *   without worrying about unhandled injected-script exceptions.  (design D-1)
 *
 * Injection pattern:
 *   Chrome serialises `selectorTesterMain` via Function.prototype.toString()
 *   and runs it in the tab's isolated world with args[0] as the argument
 *   object.  The SW loads this file via importScripts so selectorTesterMain
 *   is in its global scope before any message handler fires.  (matches the
 *   adoReaderMain / importScripts pattern established in Phase 7)
 *
 * Testability:
 *   `derivePaSelector` is a pure function exported via a conditional
 *   `module.exports` guard so Vitest can import and test it without a DOM.
 *   `selectorTesterMain` is also exported so tests can call it with a mocked
 *   globalThis.document.  (design D-1, same pattern as detectPageType /
 *   validateImportData)
 */

// ─── derivePaSelector — pure PA selector derivation ──────────────────────────
//
// Why a separate exported function rather than inline in selectorTesterMain?
//   (a) Unit-testability: Vitest can import and verify the selector format
//       against the spec without needing any DOM mock.
//   (b) Readability: The selector format rules are easy to audit in one place.
//   (c) Reuse: if future phases need PA selector derivation (e.g. a bulk
//       tester), they can import this function without re-implementing the
//       mapping.
//
// Selector format rules from SPEC.md §6.5.1:
//   text   → primary:  [data-id="{schema}.fieldControl-text-box-text"]
//            fallback: [data-id="{schema}.fieldControl-whole-number-text-input"]
//              WHY: PA uses two different data-id suffixes for "text"-type inputs.
//              Plain text lines use fieldControl-text-box-text; integer / whole-number
//              fields (e.g. Planned Year) use fieldControl-whole-number-text-input.
//              Both render as <input type="text"> and both accept simulateTyping, so
//              both map to fieldType "text" in our schema.  We try the common suffix
//              first and fall back to the whole-number suffix if not found.
//   choice → [data-id="{schema}.fieldControl-option-set-select"]
//   lookup → primary:  [data-id="{schema}.fieldControl-LookupResultsDropdown_{schema}_textInputBox_with_filter_new"]
//            fallback: [data-id="{schema}.fieldControl-LookupResultsDropdown_{schema}_selected_tag"]
//
// @param {string} fieldSchemaName - The PA field schema name, e.g. "shg_title".
// @param {string} fieldType       - "text" | "choice" | "lookup"
// @returns {{ primary: string, fallback?: string }}
//   `fallback` is defined for text and lookup fields.
function derivePaSelector(fieldSchemaName, fieldType) {
  if (fieldType === "text") {
    return {
      primary:  '[data-id="' + fieldSchemaName + '.fieldControl-text-box-text"]',
      fallback: '[data-id="' + fieldSchemaName + '.fieldControl-whole-number-text-input"]',
    };
  }

  if (fieldType === "choice") {
    return {
      primary: '[data-id="' + fieldSchemaName + '.fieldControl-option-set-select"]',
    };
  }

  if (fieldType === "lookup") {
    // Lookup fields can be in two states in the DOM:
    //   • Empty  → the text-input filter box is visible (textInputBox_with_filter_new)
    //   • Filled → only the selected-tag chip is visible  (selected_tag)
    //
    // We try the primary (empty-state) selector first; if not found, fall back
    // to the filled-state selector.  First match wins.  (design D-5)
    //
    // Why does the schema name appear twice in the selector?
    //   The data-id encodes the full control path:
    //     {schema}.fieldControl-LookupResultsDropdown_{schema}_{controlSuffix}
    //   Both occurrences are necessary to match the exact element that PA renders.
    return {
      primary:
        '[data-id="' + fieldSchemaName +
        '.fieldControl-LookupResultsDropdown_' + fieldSchemaName +
        '_textInputBox_with_filter_new"]',
      fallback:
        '[data-id="' + fieldSchemaName +
        '.fieldControl-LookupResultsDropdown_' + fieldSchemaName +
        '_selected_tag"]',
    };
  }

  // Unknown fieldType — return an empty primary so querySelector returns null
  // rather than throwing (the caller's try/catch would handle it either way).
  return { primary: "" };
}

// ─── selectorTesterMain — injected entry point ────────────────────────────────
//
// Chrome injects this function into the target tab via executeScript({ func, args }).
// It receives a single argument object and returns a result object that Chrome
// sends back to the service worker as InjectionResult[0].result.
//
// Why a top-level try/catch rather than per-querySelector try/catch?
//   The spec requires that "on any exception: return { found: false, error }".
//   A single outer try/catch is simpler and ensures no exception can escape,
//   regardless of which line inside the function throws.  (spec §Selector tester)
//
// Why does selectorTesterMain call derivePaSelector directly?
//   Both functions live in the same script file.  When Chrome serialises
//   selectorTesterMain via Function.prototype.toString() for injection, only
//   the function body is serialised — NOT the surrounding file scope.
//   derivePaSelector would therefore be undefined inside the injected function.
//
//   To solve this, selectorTesterMain inlines a local copy of derivePaSelector
//   (see the nested function at the top of the try block).  This is the same
//   technique used in ado-reader.js where helper functions are nested inside
//   adoReaderMain so they survive Chrome's toString() serialisation.
//   (design D-1 rationale; adoReaderMain precedent)
//
// @param {object} args
//   @param {"pa"|"ado"} args.mode          - Determines selector source.
//   @param {string}     [args.fieldSchemaName] - PA mode only.
//   @param {string}     [args.fieldType]       - PA mode only.
//   @param {string}     [args.adoSelector]     - ADO mode only.
// @returns {{ found: true, tagName: string }
//          | { found: false }
//          | { found: false, error: string }}
function selectorTesterMain({ mode, fieldSchemaName, fieldType, adoSelector }) {
  // ── Inline copy of derivePaSelector ─────────────────────────────────────
  // Must be nested here so the logic survives Chrome's Function.toString()
  // serialisation.  The top-level derivePaSelector is kept for unit tests
  // (tests import it directly from module.exports).
  function derivePaSelectorInline(schema, type) {
    if (type === "text") {
      return {
        primary:  '[data-id="' + schema + '.fieldControl-text-box-text"]',
        fallback: '[data-id="' + schema + '.fieldControl-whole-number-text-input"]',
      };
    }
    if (type === "choice") {
      return { primary: '[data-id="' + schema + '.fieldControl-option-set-select"]' };
    }
    if (type === "lookup") {
      return {
        primary:
          '[data-id="' + schema +
          '.fieldControl-LookupResultsDropdown_' + schema +
          '_textInputBox_with_filter_new"]',
        fallback:
          '[data-id="' + schema +
          '.fieldControl-LookupResultsDropdown_' + schema +
          '_selected_tag"]',
      };
    }
    return { primary: "" };
  }

  try {
    var el = null;

    if (mode === "pa") {
      var selectors = derivePaSelectorInline(fieldSchemaName, fieldType);

      el = document.querySelector(selectors.primary);

      // Fallback: if the primary returns null, try the fallback selector before
      // concluding "not found".  Used for:
      //   • text   — whole-number-text-input (PA integer fields)
      //   • lookup — selected_tag (filled-state chip)  (design D-5)
      if (!el && selectors.fallback) {
        el = document.querySelector(selectors.fallback);
      }

    } else if (mode === "ado") {
      // ADO mode: use the raw CSS selector verbatim — no derivation at all.
      // This tests exactly the selector the service worker will use for field
      // extraction during COPY_INITIATIVE.  (spec §6.5.2)
      el = document.querySelector(adoSelector);
    }

    if (el) {
      // Highlight the found element with a green outline for 2 seconds.
      // After 2000 ms, restore the original outline so the page looks normal.
      // We capture the original value first so we don't clobber existing CSS.
      var originalOutline = el.style.outline;
      el.style.outline = "3px solid #22c55e";
      setTimeout(function () { el.style.outline = originalOutline; }, 2000);

      return { found: true, tagName: el.tagName };
    }

    return { found: false };

  } catch (e) {
    // The script must NEVER throw to the host page — return a structured error
    // result so the service worker can forward it to the side panel as feedback.
    return { found: false, error: e.message };
  }
}

// ─── Test Export ──────────────────────────────────────────────────────────────
// Allow unit tests (Vitest / Node.js) to import both functions without a Chrome
// runtime or a real DOM.  The guard ensures this line is a no-op when loaded by
// Chrome (Chrome's classic SW scope does not expose `module`).
// Same pattern as detectPageType (service-worker.js) and validateImportData (app.js).
if (typeof module !== "undefined") {
  module.exports = { derivePaSelector, selectorTesterMain };
}
