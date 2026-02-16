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

// ─── MutationObserver Helpers ─────────────────────────────────────────────────

/**
 * Wait for a single DOM element matching `selector` to appear in the document.
 *
 * Uses a MutationObserver on document.body rather than polling so the promise
 * resolves immediately when the node is inserted — no wasted CPU cycles.
 * (design D-3)
 *
 * Why observe document.body and not a narrower container?
 *   Fluent UI renders choice dropdowns and lookup flyouts into detached portal
 *   nodes (`<div id="__fluentPortalMountNode">`) that are direct children of
 *   <body>, NOT descendants of the field control.  We must observe at body
 *   level to catch these insertions.  (design D-5)
 *
 * @param {string}  selector  - A CSS selector string.
 * @param {number}  timeoutMs - Maximum wait time in milliseconds.
 * @returns {Promise<Element|null>} Resolves to the first matching element,
 *                                  or null if the timeout elapses.
 */
function waitForElement(selector, timeoutMs) {
  return new Promise((resolve) => {
    // Check immediately — element may already be in the DOM.
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let timer;
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        // Found it — disconnect before resolving so we don't fire twice.
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Fallback: if the element never appears, resolve with null and clean up.
    timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Wait for one or more DOM elements matching `selector` to appear.
 *
 * Same MutationObserver pattern as waitForElement but returns a NodeList.
 * Resolves with a non-empty NodeList as soon as at least one match is found,
 * or with an empty NodeList (from a final querySelectorAll call) on timeout.
 *
 * Why return an empty NodeList rather than null on timeout?
 *   Callers can uniformly check `.length === 0` without needing a null guard,
 *   keeping strategy code cleaner.  (spec: waitForElements helper)
 *
 * @param {string}  selector  - A CSS selector string.
 * @param {number}  timeoutMs - Maximum wait time in milliseconds.
 * @returns {Promise<NodeList>} Resolves to a NodeList (may be empty on timeout).
 */
function waitForElements(selector, timeoutMs) {
  return new Promise((resolve) => {
    // Check immediately.
    const existing = document.querySelectorAll(selector);
    if (existing.length > 0) {
      resolve(existing);
      return;
    }

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
      // Return whatever is in the DOM at timeout (may be empty NodeList).
      resolve(document.querySelectorAll(selector));
    }, timeoutMs);
  });
}

// ─── simulateTyping ───────────────────────────────────────────────────────────

/**
 * Type `text` into `inputElement` in a way that triggers PowerApps' React
 * synthetic event system.
 *
 * WHY THIS IS NECESSARY:
 *   A plain `input.value = "foo"` assignment does NOT fire React's change
 *   handler because React tracks internal state separately.  We need to fire
 *   a proper InputEvent, which React's reconciler detects.
 *
 * STRATEGY:
 *   1. Select all existing content (so the new text replaces it).
 *   2. Try document.execCommand('insertText') — fires a real InputEvent.
 *   3. If execCommand did not set the value (it no-ops in some contexts),
 *      fall back to the native HTMLInputElement property setter + bubbling
 *      input/change events.  (design D-4)
 *   4. Wait 300ms before resolving to give the PA framework time to
 *      fire API calls (e.g. Dataverse lookup search).
 *
 * @param {HTMLInputElement} inputElement - The input to type into.
 * @param {string}           text         - The value to type.
 * @returns {Promise<void>} Resolves after the 300ms settle delay.
 */
function simulateTyping(inputElement, text) {
  return new Promise((resolve) => {
    // Step 1: Select all — ensures execCommand replaces the full current value.
    inputElement.select();

    // Step 2: Attempt execCommand.  In a real Chrome context this fires the
    // InputEvent that React's synthetic event system intercepts.
    document.execCommand("insertText", false, text);

    // Step 3: If execCommand did not set the value (no-op context), fall back
    // to the native setter + explicit event dispatch.
    if (inputElement.value !== text) {
      // Native property setter via the Object prototype — bypasses React's own
      // property descriptor so the next dispatch triggers React's handler.
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set;
      nativeInputValueSetter.call(inputElement, text);

      // Dispatch bubbling events so React's SyntheticEvent system picks them up.
      inputElement.dispatchEvent(new Event("input",  { bubbles: true }));
      inputElement.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Step 4: Settle delay — PA framework needs time to react to the input
    // before the next interaction (e.g. lookup dropdown appearance).
    setTimeout(resolve, 300);
  });
}

// ─── Field Write Strategies ───────────────────────────────────────────────────

/**
 * Write a value into a plain text input field.
 *
 * Selector pattern: `[data-id="{schema}.fieldControl-text-box-text"]`
 *
 * Why `data-id` rather than `id` or `name`?
 *   PowerApps generates numeric GUIDs for `id` attributes on every page load
 *   so they are not stable.  The `data-id` attribute uses the field schema
 *   name which is deterministic and stable across sessions.  (design D-7)
 *
 * BR-003: This function NEVER submits or saves the form.
 *
 * @param {string}  fieldSchemaName - The PA field schema name (e.g. "cr123_title").
 * @param {string}  value           - The value to write.
 * @param {boolean} overwriteMode   - If false, skip fields that already have a value.
 * @returns {Promise<{status: string, message?: string}>}
 */
async function pasteText(fieldSchemaName, value, overwriteMode) {
  const selector = `[data-id="${fieldSchemaName}.fieldControl-text-box-text"]`;
  const input = document.querySelector(selector);

  if (!input) {
    return { status: "error", message: `Text input not found: ${selector}` };
  }

  // Overwrite guard: if the field already has content and overwriteMode is off,
  // leave it untouched.  (BR-001; spec: Overwrite Mode skip)
  if (overwriteMode === false && input.value !== "") {
    return {
      status: "skipped",
      message: "Field already has a value (overwrite mode is off)",
    };
  }

  input.focus();
  await simulateTyping(input, value);

  return { status: "success" };
}

/**
 * Write a value into a choice (option-set / combobox) field.
 *
 * Selector pattern: `[data-id="{schema}.fieldControl-option-set-select"]`
 *
 * CRITICAL DETAIL — Fluent UI portal:
 *   After clicking the combobox, the dropdown listbox is rendered into
 *   `<div id="__fluentPortalMountNode">`, a sibling of `<div id="shell-container">`
 *   at body level.  It is NOT a descendant of the combobox.  We must query
 *   `[role="option"]` from the document root, not from the combobox container.
 *   (design D-5; SPIKE-PA-STRATEGIES.md)
 *
 * @param {string}  fieldSchemaName - The PA field schema name.
 * @param {string}  value           - The option text to select (case-insensitive).
 * @param {boolean} overwriteMode   - If false, skip if a non-default option is selected.
 * @returns {Promise<{status: string, message?: string}>}
 */
async function pasteChoice(fieldSchemaName, value, overwriteMode) {
  const selector = `[data-id="${fieldSchemaName}.fieldControl-option-set-select"]`;
  const combobox = document.querySelector(selector);

  if (!combobox) {
    return { status: "error", message: `Choice combobox not found: ${selector}` };
  }

  // Overwrite guard: PA comboboxes show "---" as the default/empty placeholder.
  // Any non-empty, non-"---" title means a value is already selected.
  // (spec: Overwrite Mode skip — choice field)
  if (overwriteMode === false && combobox.title && combobox.title !== "---") {
    return {
      status: "skipped",
      message: "Field already has a value (overwrite mode is off)",
    };
  }

  // Open the dropdown.
  combobox.click();

  // Wait for the Fluent UI portal to render option elements.
  // Query from document root — the portal is detached from the field.  (design D-5)
  const options = await waitForElements('[role="option"]', 3000);
  if (options.length === 0) {
    return { status: "error", message: "No options appeared after opening dropdown" };
  }

  // Case-insensitive match against each option's trimmed text content.
  const target = value.trim().toLowerCase();
  let matchedOption = null;
  const available = [];

  for (const opt of options) {
    const text = opt.textContent.trim();
    available.push(text);
    if (text.toLowerCase() === target) {
      matchedOption = opt;
    }
  }

  if (!matchedOption) {
    return {
      status: "warning",
      message: `No option matched "${value}". Available: ${available.join(", ")}`,
    };
  }

  matchedOption.click();
  return { status: "success" };
}

/**
 * Write a value into a lookup (relationship) field.
 *
 * All sub-selectors are derived from the prefix:
 *   `{schema}.fieldControl-LookupResultsDropdown_{schema}`
 *
 * STATE DETECTION:
 *   PowerApps lookup fields render different DOM structures depending on whether
 *   a value is already selected.  The delete button (`{prefix}_selected_tag_delete`)
 *   is the most reliable sentinel: it exists only when a value is selected.
 *   (design D-6)
 *
 * BR-005: If search returns no results or no match, the typed text is cleared
 *   from the input before returning so the field is not left with partial text.
 *
 * @param {string}  fieldSchemaName - The PA field schema name.
 * @param {string}  value           - The lookup display name to search (case-insensitive).
 * @param {boolean} overwriteMode   - If false, skip if a value is already selected.
 * @returns {Promise<{status: string, message?: string}>}
 */
async function pasteLookup(fieldSchemaName, value, overwriteMode) {
  const prefix = `${fieldSchemaName}.fieldControl-LookupResultsDropdown_${fieldSchemaName}`;
  const deleteButtonSelector = `[data-id="${prefix}_selected_tag_delete"]`;
  const textInputSelector    = `[data-id="${prefix}_textInputBox_with_filter_new"]`;

  const deleteButton = document.querySelector(deleteButtonSelector);

  // Overwrite guard: if a value is already selected and overwrite is off, skip.
  // (BR-001; spec: Overwrite Mode skip — lookup field)
  if (overwriteMode === false && deleteButton) {
    return {
      status: "skipped",
      message: "Field already has a value (overwrite mode is off)",
    };
  }

  // If a value is selected and we are overwriting, clear it first.
  if (deleteButton) {
    deleteButton.click();

    // Wait for the text input to reappear after the existing value is cleared.
    const appeared = await waitForElement(textInputSelector, 3000);
    if (!appeared) {
      return {
        status: "error",
        message: "Text input did not appear after clearing existing value",
      };
    }
  }

  // Locate the text input (present immediately when field is empty).
  const textInput = document.querySelector(textInputSelector);
  if (!textInput) {
    return { status: "error", message: `Lookup text input not found: ${textInputSelector}` };
  }

  // Type the search term to trigger Dataverse lookup.
  textInput.focus();
  textInput.click();
  await simulateTyping(textInput, value);

  // Wait for Dataverse to return results.  5s timeout reflects real API latency.
  const resultsContainerSelector = `[data-id="${prefix}_resultsContainer"]`;
  const resultItems = await waitForElements(resultsContainerSelector, 5000);

  if (resultItems.length === 0) {
    // BR-005: clear the partial text so the field is not left in a bad state.
    await simulateTyping(textInput, "");
    return {
      status: "error",
      message: `No search results found for "${value}"`,
    };
  }

  // Match by the PRIMARY NAME — the part of aria-label before the first comma.
  // Example: aria-label "Contoso Corp, Account" → primary name "Contoso Corp"
  // (spec: lookup field write strategy — aria-label match)
  const target = value.trim().toLowerCase();
  let matchedResult = null;
  const available = [];

  for (const item of resultItems) {
    const label = item.getAttribute("aria-label") ?? "";
    const primaryName = label.split(",")[0].trim();
    available.push(primaryName);
    if (primaryName.toLowerCase() === target) {
      matchedResult = item;
    }
  }

  if (!matchedResult) {
    // BR-005: clear the partial text before returning a warning.
    await simulateTyping(textInput, "");
    return {
      status: "warning",
      message: `No result matched "${value}". Available: ${available.join(", ")}`,
    };
  }

  matchedResult.click();
  return { status: "success" };
}

// ─── Strategy Registry ────────────────────────────────────────────────────────

/**
 * Maps each fieldType string to its corresponding write strategy function.
 *
 * Why a registry object rather than a switch statement?
 *   The registry is easier to extend (add a new type = add one property) and
 *   each strategy can be independently tested.  (design D-2)
 */
const PASTE_STRATEGIES = {
  text:   pasteText,
  choice: pasteChoice,
  lookup: pasteLookup,
};

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Main entry point — called by the background service worker via
 * chrome.scripting.executeScript({ func: paWriterMain, args: [...] }).
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
  const results = [];

  // Only process enabled mappings — disabled ones are silently excluded.
  const enabledMappings = (mappings ?? []).filter(m => m.enabled);

  // Build a lookup map from fieldId → CopiedFieldData for O(1) access.
  const dataByFieldId = {};
  for (const entry of (copiedData ?? [])) {
    dataByFieldId[entry.fieldId] = entry;
  }

  for (const mapping of enabledMappings) {
    // Per-field try/catch: a strategy failure must NOT abort the loop. (BR-002)
    try {
      const copied = dataByFieldId[mapping.id];

      if (!copied) {
        // No matching data was captured from ADO for this mapping.
        results.push({
          fieldId: mapping.id,
          label:   mapping.label,
          status:  "error",
          message: `No copied data found for field "${mapping.id}"`,
        });
        continue;
      }

      const strategy = PASTE_STRATEGIES[mapping.fieldType];
      if (!strategy) {
        results.push({
          fieldId: mapping.id,
          label:   mapping.label,
          status:  "error",
          message: `Unknown field type "${mapping.fieldType}"`,
        });
        continue;
      }

      // Call the strategy — returns { status, message? }.
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
      // Unexpected error in strategy — record it and continue. (BR-002)
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
