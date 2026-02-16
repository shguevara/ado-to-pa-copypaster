/**
 * PA Writer — Phase 10
 *
 * PURPOSE:
 *   Injected on-demand into a PowerApps model-driven form tab by the
 *   background service worker in response to a PASTE_INITIATIVE message.
 *   Reads field values from `copiedData` (CopiedFieldData[]) and writes
 *   them into the PowerApps form DOM using field-type-specific strategies.
 *
 * THREE-STRATEGY ARCHITECTURE:
 *   PowerApps model-driven forms use Fluent UI and React synthetic events,
 *   which means three distinct field control types require three different
 *   interaction sequences:
 *
 *   1. text   — `[data-id="{schema}.fieldControl-text-box-text"]`
 *               Focus + select all + simulateTyping.
 *
 *   2. choice — `[data-id="{schema}.fieldControl-option-set-select"]`
 *               Click combobox → wait for Fluent UI portal options to appear
 *               (rendered in a detached DOM portal, NOT inside the field) →
 *               case-insensitive match on textContent → click option.
 *
 *   3. lookup — `[data-id="{prefix}_textInputBox_with_filter_new"]`
 *               Optionally clear existing value (delete button) → type search
 *               term → wait for Dataverse result list → match by aria-label
 *               primary name → click result.
 *
 * INJECTION MODEL:
 *   This file is NOT a persistent content script. It is injected on-demand
 *   via chrome.scripting.executeScript({ func: paWriterMain, args: [...] }).
 *   All required data (copiedData, mappings, overwriteMode) are passed as
 *   function arguments — the script does NOT call chrome.storage itself.
 *
 * INVARIANTS:
 *   BR-002: Each field write is wrapped in an independent try/catch so one
 *           field failure never aborts the remaining fields.
 *   BR-003: This script NEVER calls form.submit(), dispatches a "submit"
 *           event, or clicks any Save button. All interactions are scoped
 *           to individual field DOM elements only.
 *   BR-005: If a lookup search returns no results or no match, the typed
 *           text is cleared before returning so the field is not left in a
 *           partially-filled state.
 */

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Main entry point — called by the background service worker via
 * chrome.scripting.executeScript({ func: paWriterMain, args: [...] }).
 *
 * WHY ALL HELPERS ARE DEFINED INSIDE THIS FUNCTION:
 *   Chrome serialises the injected function via `Function.prototype.toString()`
 *   and evaluates that text in the PA page's isolated world.  Only the
 *   function body is captured — any module-scope variables (PASTE_STRATEGIES,
 *   pasteText, waitForElement, etc.) are NOT transferred and would throw
 *   ReferenceError at runtime.  Defining every helper as an inner function
 *   ensures the serialised text is fully self-contained, exactly the same
 *   pattern used by `adoReaderMain` in ado-reader.js.  (design D-1)
 *
 * Iterates over enabled mappings, looks up each in `copiedData`, and calls
 * the appropriate write strategy.  Each field is wrapped in an independent
 * try/catch so one failure never aborts the remaining fields (BR-002).
 *
 * BR-003: This function NEVER calls form.submit(), dispatches a "submit"
 * event, or clicks any Save button.
 *
 * @param {CopiedFieldData[]} copiedData    - Field values captured from ADO.
 * @param {FieldMapping[]}    mappings      - All field mappings (enabled + disabled).
 * @param {boolean}           overwriteMode - Whether to overwrite existing PA values.
 * @returns {Promise<FieldResult[]>} One result per enabled mapping, in order.
 */
async function paWriterMain(copiedData, mappings, overwriteMode) {

  // ── MutationObserver Helpers ─────────────────────────────────────────────
  //
  // Defined as inner functions so they are included in the serialised
  // function body when Chrome injects paWriterMain.  (design D-1, D-3)

  /**
   * Wait for a single DOM element matching `selector`.
   * Resolves with the element or null on timeout.
   *
   * Why observe document.body?
   *   Fluent UI renders choice dropdowns and lookup flyouts into detached
   *   portal nodes at body level — NOT inside the field control.  We must
   *   observe at body level to catch these insertions.  (design D-5)
   */
  function waitForElement(selector, timeoutMs) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) { resolve(existing); return; }

      let timer;
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(() => { observer.disconnect(); resolve(null); }, timeoutMs);
    });
  }

  /**
   * Wait for one or more DOM elements matching `selector`.
   * Resolves with a non-empty NodeList or an empty NodeList on timeout.
   */
  function waitForElements(selector, timeoutMs) {
    return new Promise((resolve) => {
      const existing = document.querySelectorAll(selector);
      if (existing.length > 0) { resolve(existing); return; }

      let timer;
      const observer = new MutationObserver(() => {
        const els = document.querySelectorAll(selector);
        if (els.length > 0) {
          observer.disconnect();
          clearTimeout(timer);
          resolve(els);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timer = setTimeout(() => {
        observer.disconnect();
        resolve(document.querySelectorAll(selector));
      }, timeoutMs);
    });
  }

  // ── simulateTyping ──────────────────────────────────────────────────────
  //
  // Types `text` into `inputElement` in a way that triggers PowerApps'
  // React synthetic event system.
  //
  // WHY:
  //   A plain `input.value = x` does NOT fire React's change handler.
  //   execCommand('insertText') fires a real InputEvent that React detects.
  //   The native-setter fallback handles contexts where execCommand no-ops.
  //   The 300ms settle delay lets PA fire Dataverse API calls before the
  //   next interaction.  (design D-4)

  function simulateTyping(inputElement, text) {
    return new Promise((resolve) => {
      inputElement.select();
      document.execCommand("insertText", false, text);

      if (inputElement.value !== text) {
        // Native property setter — bypasses React's descriptor so the
        // subsequent event dispatch triggers React's handler.
        const nativeSet = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, "value"
        ).set;
        nativeSet.call(inputElement, text);
        inputElement.dispatchEvent(new Event("input",  { bubbles: true }));
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));
      }

      setTimeout(resolve, 300);
    });
  }

  // ── Field Write Strategies ───────────────────────────────────────────────
  //
  // Each strategy is an inner async function so it is self-contained in the
  // serialised paWriterMain text.  (design D-1, D-2)

  /**
   * Write a value into a plain text input field.
   * Selector: `[data-id="{schema}.fieldControl-text-box-text"]`
   * BR-003: does not submit or save.
   */
  async function pasteText(fieldSchemaName, value, overwriteMode) {
    const selector = "[data-id=\"" + fieldSchemaName + ".fieldControl-text-box-text\"]";
    const input = document.querySelector(selector);
    if (!input) return { status: "error", message: "Text input not found: " + selector };
    if (overwriteMode === false && input.value !== "") {
      return { status: "skipped", message: "Field already has a value (overwrite mode is off)" };
    }
    input.focus();
    await simulateTyping(input, value);
    return { status: "success" };
  }

  /**
   * Write a value into a choice (option-set / combobox) field.
   * Selector: `[data-id="{schema}.fieldControl-option-set-select"]`
   *
   * CRITICAL: options are rendered in a Fluent UI portal detached from the
   * combobox element — query `[role="option"]` from document root.  (design D-5)
   */
  async function pasteChoice(fieldSchemaName, value, overwriteMode) {
    const selector = "[data-id=\"" + fieldSchemaName + ".fieldControl-option-set-select\"]";
    const combobox = document.querySelector(selector);
    if (!combobox) return { status: "error", message: "Choice combobox not found: " + selector };
    if (overwriteMode === false && combobox.title && combobox.title !== "---") {
      return { status: "skipped", message: "Field already has a value (overwrite mode is off)" };
    }
    combobox.click();
    const options = await waitForElements("[role=\"option\"]", 3000);
    if (options.length === 0) return { status: "error", message: "No options appeared after opening dropdown" };

    const target = value.trim().toLowerCase();
    let matchedOption = null;
    const available = [];
    for (const opt of options) {
      const text = opt.textContent.trim();
      available.push(text);
      if (text.toLowerCase() === target) matchedOption = opt;
    }
    if (!matchedOption) {
      return { status: "warning", message: "No option matched \"" + value + "\". Available: " + available.join(", ") };
    }
    matchedOption.click();
    return { status: "success" };
  }

  /**
   * Write a value into a lookup (relationship) field.
   * Prefix: `{schema}.fieldControl-LookupResultsDropdown_{schema}`
   *
   * Delete-button presence indicates an existing value (design D-6).
   * BR-005: clear typed text before returning error/warning.
   */
  async function pasteLookup(fieldSchemaName, value, overwriteMode) {
    const prefix = fieldSchemaName + ".fieldControl-LookupResultsDropdown_" + fieldSchemaName;
    const deleteButtonSelector = "[data-id=\"" + prefix + "_selected_tag_delete\"]";
    const textInputSelector    = "[data-id=\"" + prefix + "_textInputBox_with_filter_new\"]";

    const deleteButton = document.querySelector(deleteButtonSelector);
    if (overwriteMode === false && deleteButton) {
      return { status: "skipped", message: "Field already has a value (overwrite mode is off)" };
    }
    if (deleteButton) {
      deleteButton.click();
      const appeared = await waitForElement(textInputSelector, 3000);
      if (!appeared) return { status: "error", message: "Text input did not appear after clearing existing value" };
    }

    const textInput = document.querySelector(textInputSelector);
    if (!textInput) return { status: "error", message: "Lookup text input not found: " + textInputSelector };

    textInput.focus();
    textInput.click();
    await simulateTyping(textInput, value);

    const resultsContainerSelector = "[data-id=\"" + prefix + "_resultsContainer\"]";
    const resultItems = await waitForElements(resultsContainerSelector, 5000);
    if (resultItems.length === 0) {
      await simulateTyping(textInput, "");
      return { status: "error", message: "No search results found for \"" + value + "\"" };
    }

    const target = value.trim().toLowerCase();
    let matchedResult = null;
    const available = [];
    for (const item of resultItems) {
      const ariaLabel = item.getAttribute("aria-label") || "";
      const primaryName = ariaLabel.split(",")[0].trim();
      available.push(primaryName);
      if (primaryName.toLowerCase() === target) matchedResult = item;
    }
    if (!matchedResult) {
      await simulateTyping(textInput, "");
      return { status: "warning", message: "No result matched \"" + value + "\". Available: " + available.join(", ") };
    }
    matchedResult.click();
    return { status: "success" };
  }

  // ── Strategy Registry ────────────────────────────────────────────────────
  //
  // Maps fieldType → strategy function.  Defined inside paWriterMain so it
  // is included in the serialised injection.  (design D-2)

  const PASTE_STRATEGIES = {
    text:   pasteText,
    choice: pasteChoice,
    lookup: pasteLookup,
  };

  // ── Orchestration loop ───────────────────────────────────────────────────

  const results = [];
  const enabledMappings = (mappings ?? []).filter(function(m) { return m.enabled; });

  // Build a fieldId → CopiedFieldData lookup map for O(1) access.
  const dataByFieldId = {};
  for (const entry of (copiedData ?? [])) {
    dataByFieldId[entry.fieldId] = entry;
  }

  for (const mapping of enabledMappings) {
    // Per-field try/catch — one failure must NOT abort the loop. (BR-002)
    try {
      const copied = dataByFieldId[mapping.id];
      if (!copied) {
        results.push({
          fieldId: mapping.id,
          label:   mapping.label,
          status:  "error",
          message: "No copied data found for field \"" + mapping.id + "\"",
        });
        continue;
      }

      const strategy = PASTE_STRATEGIES[mapping.fieldType];
      if (!strategy) {
        results.push({
          fieldId: mapping.id,
          label:   mapping.label,
          status:  "error",
          message: "Unknown field type \"" + mapping.fieldType + "\"",
        });
        continue;
      }

      const strategyResult = await strategy(
        mapping.fieldSchemaName,
        copied.value,
        overwriteMode
      );

      results.push({
        fieldId: mapping.id,
        label:   mapping.label,
        ...strategyResult,
      });

    } catch (err) {
      // Unexpected error — record and continue. (BR-002)
      results.push({
        fieldId: mapping.id,
        label:   mapping.label ?? mapping.id,
        status:  "error",
        message: err.message,
      });
    }
  }

  return results;
}

// ─── Test Export ──────────────────────────────────────────────────────────────
// Allow Vitest (Node.js) to import paWriterMain and test the orchestration
// logic without a browser DOM.  The guard is a no-op when Chrome loads this
// file as an injected script (Chrome does not expose `module`).
if (typeof module !== "undefined") {
  module.exports = { paWriterMain };
}
