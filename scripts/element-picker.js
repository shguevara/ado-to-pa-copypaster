/**
 * element-picker.js — Phase 8 Element Picker
 *
 * Injected on-demand into a PowerApps tab when the user clicks "Pick from Page"
 * in the Admin tab mapping form.  Responsibilities:
 *
 *   1. Create a full-screen transparent overlay (pointer-events: none) so the
 *      picker session has a visual z-index boundary and a cleanup handle.
 *   2. Highlight each element the user hovers over with a blue outline.
 *   3. On click: extract the field schema name from the clicked element's
 *      data-id attribute (walking up the DOM if necessary), send an
 *      ELEMENT_PICKED message to the service worker, and clean up.
 *   4. On Escape: silently cancel (no message sent) and clean up.
 *
 * Node.js / Vitest compatibility:
 *   extractSchemaName is a named function at module scope, exported via a
 *   conditional `module.exports` guard at the bottom.  The browser-side
 *   overlay / event-listener code is wrapped in a
 *   `typeof document !== "undefined"` guard so this file can be imported
 *   in Node.js without errors.  (design D-1)
 */

// ─── extractSchemaName — pure DOM-walking logic ───────────────────────────────
//
// Why a named function declaration rather than a const arrow function?
//   Named function declarations are hoisted and have a stable .name property.
//   More importantly, the `typeof module !== "undefined"` guard at the bottom
//   exports them using the same CommonJS pattern as ado-reader.js and
//   service-worker.js — this keeps the test-export strategy consistent across
//   the codebase.
//
// Why at module scope rather than inside the IIFE below?
//   Functions nested inside an IIFE are not reachable from Node.js `require`,
//   which would make them untestable.  Module-scope placement lets Vitest import
//   the function directly without any mocking.  (design D-1, D-8)

/**
 * Walk the DOM from the given element upward, looking for a data-id attribute
 * that is not a GUID-formatted container ID.  Return the part of the value
 * before the first dot (the field schema name), or null if none is found.
 *
 * ALGORITHM (SPEC.md §6.4):
 *   FOR el = target; el && el !== document.body; el = el.parentElement:
 *     dataId = el.getAttribute('data-id')
 *     IF dataId is non-empty:
 *       candidate = dataId.split('.')[0]
 *       IF candidate does NOT match /^[0-9a-f]{8}-/i:
 *         RETURN candidate
 *   RETURN null
 *
 * Why stop at document.body?
 *   document.body is a structural container, not a PA field element. If we
 *   walked past it we would inspect structural IDs that can never be a valid
 *   fieldSchemaName. Stopping before body keeps extraction anchored to real
 *   field elements.
 *
 * Why skip candidates matching /^[0-9a-f]{8}-/i?
 *   PowerApps wraps each field in a container `<div data-id="<GUID>-...">`.
 *   GUIDs start with 8 hex characters followed by a dash.  These container
 *   IDs are not the field schema names we need — skipping them avoids false
 *   positives and allows the walk to continue up to a real field element.
 *
 * @param {Element} el - The DOM element to start walking from.
 * @returns {string|null} The field schema name, or null if none found.
 */
function extractSchemaName(el) {
  // Walk from el up the DOM, stopping at (but NOT including) document.body.
  // In Node.js tests, document may be a mock object with a .body property.
  const body = (typeof document !== "undefined") ? document.body : null;

  for (let cur = el; cur && cur !== body; cur = cur.parentElement) {
    const dataId = cur.getAttribute("data-id");

    // Skip elements that have no data-id or an empty one.
    if (!dataId) continue;

    // The first segment (before any dot) is the candidate schema name.
    // e.g. "cr123_lineofbusiness.fieldControl-LookupResultsDropdown" → "cr123_lineofbusiness"
    const candidate = dataId.split(".")[0];

    // Reject GUID-style container IDs: 8 hex chars followed by a dash.
    // Case-insensitive because GUID casing is not guaranteed across PA versions.
    if (/^[0-9a-f]{8}-/i.test(candidate)) continue;

    // First non-GUID candidate wins — return it as the schema name.
    return candidate;
  }

  // No suitable data-id found in the chain.
  return null;
}

// ─── Browser-side overlay + event listeners ───────────────────────────────────
//
// Guarded by `typeof document !== "undefined"` so this block is a no-op in
// Node.js (Vitest) where `document` does not exist.  In the Chrome extension
// context, this block runs as soon as element-picker.js is injected into the
// PA tab via chrome.scripting.executeScript({ files: [...] }).
//
// Why `{ files: [...] }` rather than the `func` pattern used for ado-reader.js?
//   element-picker.js has DOM side-effects (overlay creation, event listeners)
//   that must run in the page's scope.  We don't need a return value from it.
//   The `func` pattern (used for ado-reader.js) is suited to pure-function
//   injection that returns a value from the page context back to the SW.
//   Using `files` is simpler and more appropriate for side-effect-only injection.
//   (design D-3; tasks.md §3.1 rationale comment)

if (typeof document !== "undefined") {

  // Create the transparent overlay div.
  //
  // Why pointer-events: none on the overlay?
  //   An overlay with pointer-events: none sits visually above the page but
  //   does NOT consume mouse events — they fall through to the real elements
  //   underneath.  This lets us read e.target to get the element the user is
  //   hovering or clicking, while the overlay prevents any accidental click
  //   from firing native PA React handlers before our capture listener runs.
  //   (design D-2)
  const overlay = document.createElement("div");
  overlay.id = "ado-pa-picker-overlay";
  overlay.style.cssText =
    "position:fixed;top:0;left:0;width:100%;height:100%;" +
    "z-index:2147483647;pointer-events:none";
  document.body.appendChild(overlay);

  // Track the element currently highlighted so we can clear its outline
  // before moving to the next one.
  let hoveredEl = null;

  // ── Named handler functions ────────────────────────────────────────────────
  //
  // Why named functions rather than anonymous arrow functions?
  //   removeEventListener requires an exact reference to the same function
  //   object passed to addEventListener.  Arrow functions assigned to const
  //   variables inside a closure work, but named function declarations are
  //   more explicit and easier to audit in a code review.
  //   (tasks.md §2.3; SPEC.md §6.4)

  function onMouseOver(e) {
    // Clear the previous hover outline before applying a new one.
    // This ensures only one element is highlighted at a time.
    if (hoveredEl) {
      hoveredEl.style.outline      = "";
      hoveredEl.style.outlineOffset = "";
    }
    // Highlight the newly hovered element with a distinct blue outline.
    // The colour #4f9cf9 is a mid-range blue — visible on both light and dark
    // PA themes without being as aggressive as the brand blue #2563eb.
    e.target.style.outline      = "2px solid #4f9cf9";
    e.target.style.outlineOffset = "1px";
    hoveredEl = e.target;
  }

  function onClick(e) {
    // Capture phase fires before React's bubbling handlers.
    // Prevent the native PA interaction from proceeding.
    e.preventDefault();
    e.stopPropagation();

    // Clean up hover state and overlay before sending the message.
    if (hoveredEl) {
      hoveredEl.style.outline      = "";
      hoveredEl.style.outlineOffset = "";
      hoveredEl = null;
    }
    overlay.remove();

    // Remove all three listeners so this injected script leaves no residual
    // state in the page after the pick session ends.
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("click",     onClick,   { capture: true });
    document.removeEventListener("keydown",   onKeyDown);

    // Extract the field schema name and send the result back to the SW.
    // If extractSchemaName returns null (no suitable data-id found), the SW
    // still receives the message — the null schemaName triggers a warning
    // in the Admin form UI rather than being silently ignored.
    const schemaName = extractSchemaName(e.target);
    chrome.runtime.sendMessage({ action: "ELEMENT_PICKED", schemaName });
  }

  function onKeyDown(e) {
    if (e.key !== "Escape") return;

    // Escape cancels the picker silently — no ELEMENT_PICKED message is sent.
    //
    // Why NOT send { action: "ELEMENT_PICKED", schemaName: null } on Escape?
    //   SPEC.md §6.4 step 8 specifies that cancellation is silent.  If we sent
    //   the message with a null schemaName, the $watch handler in
    //   adminMappingForm() would treat it as a completed pick that returned no
    //   result and show the "Could not determine field schema name" warning —
    //   which is misleading because the user explicitly chose to cancel.
    //   (design D-4; tasks.md §2.4)
    if (hoveredEl) {
      hoveredEl.style.outline      = "";
      hoveredEl.style.outlineOffset = "";
      hoveredEl = null;
    }
    overlay.remove();

    // Remove all three listeners — same cleanup as the click path.
    document.removeEventListener("mouseover", onMouseOver);
    document.removeEventListener("click",     onClick,   { capture: true });
    document.removeEventListener("keydown",   onKeyDown);
  }

  // Register all three listeners.
  // mouseover: highlights each element the mouse passes over.
  // click (capture): intercepts the user's selection before PA handles it.
  // keydown: listens for Escape to silently cancel.
  document.addEventListener("mouseover", onMouseOver);
  document.addEventListener("click",     onClick,   { capture: true });
  document.addEventListener("keydown",   onKeyDown);

} // end document guard

// ─── Test Export ──────────────────────────────────────────────────────────────
// Allow unit tests (Vitest / Node.js) to import extractSchemaName without a
// browser runtime.  The guard ensures this line is a no-op when loaded by
// Chrome (Chrome does not define `module`).
// Same pattern as detectPageType in service-worker.js and adoReaderMain in
// ado-reader.js. (design D-1)
if (typeof module !== "undefined") module.exports = { extractSchemaName };
