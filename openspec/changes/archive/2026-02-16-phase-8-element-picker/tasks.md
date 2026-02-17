## 0. Pre-work — COMMENTS.md 🟡 fixes (carry-over from Phase 7)

These two items must be addressed before Phase 10 builds on top of them.

- [x] 0.1 **Fix `hasCopiedData` edge case** (`sidepanel/app.js` line 450).
  Replace the unconditional assignment:
  ```js
  this.hasCopiedData = true;
  ```
  with:
  ```js
  this.hasCopiedData = (response.results ?? []).some(r => r.status !== "error");
  ```
  Then add a failing Vitest test first (TDD): in `tests/import-validator.test.js`
  or a new `tests/app-logic.test.js`, assert that `hasCopiedData` is `false` when
  results is `[]`, and `false` when all results have `status: "error"`, and `true`
  when at least one is `status: "success"` or `status: "blank"`.
  Make the test pass with the fix. Run `npm test` — full suite green.
  (design D-7; spec Requirement: hasCopiedData is only true when at least one non-error result exists)

- [x] 0.2 **Spec clarification** — open
  `openspec/specs/copy-initiative-flow/spec.md` and add an `## MODIFIED Requirements`
  block for the "Top-level error display for copy failure" requirement, updating the
  THEN clause to: *"THEN the field results list SHALL contain a single entry with
  `fieldId: '__error__'`, `status: 'error'`, and `message` set to the error string."*
  No code change required — this is a documentation-only alignment (design D-7
  rationale; COMMENTS.md 🟡 item 2).

---

## 1. TDD — extractSchemaName failing tests (red phase)

- [x] 1.1 Create `tests/element-picker.test.js` with the following **failing** tests
  (run `npm test` after creation and confirm they all fail with "extractSchemaName is
  not a function" or similar import error):
  - Direct `data-id` on the clicked element → returns the part before the first dot.
  - Clicked element has no `data-id`, parent has valid `data-id` → walks up 1 level.
  - Two levels up (grandparent) carries the valid `data-id` → walks up 2 levels.
  - An ancestor's `data-id` starts with a GUID pattern (`/^[0-9a-f]{8}-/i`) → skipped;
    if no other ancestor qualifies, returns `null`.
  - No `data-id` anywhere in the chain → returns `null`.
  - Walk stops before `document.body` → returns `null` (do not inspect `<body>` itself).

  Pattern: `import { extractSchemaName } from "../scripts/element-picker.js"`.
  Mock DOM nodes with plain JS objects (no `jsdom` required):
  ```js
  function mockEl(dataId, parent = null) {
    return { getAttribute: (attr) => attr === "data-id" ? dataId : null, parentElement: parent };
  }
  ```
  Add `@vitest-environment node` at the top of the file (same as `ado-reader.test.js`).

---

## 2. element-picker.js — Implementation

- [x] 2.1 Create `scripts/element-picker.js`. Declare `extractSchemaName(el)` as a
  **named `function` declaration** at module scope (not an arrow function, not nested
  inside another function — must be importable via `require` in Node.js):
  ```
  ALGORITHM (SPEC.md §6.4):
    FOR el = target; el && el !== document.body; el = el.parentElement:
      dataId = el.getAttribute('data-id')
      IF dataId is non-empty:
        candidate = dataId.split('.')[0]
        IF candidate does NOT match /^[0-9a-f]{8}-/i:
          RETURN candidate
    RETURN null
  ```
  Add a `module.exports` guard at the bottom of the file:
  ```js
  if (typeof module !== "undefined") module.exports = { extractSchemaName };
  ```
  Run `npm test` — all `element-picker.test.js` tests must now **pass**. No regressions.

- [x] 2.2 Below `extractSchemaName`, add the overlay setup code that runs in the
  injected-page context (wrapped in a top-level IIFE or just a sequence of statements
  at module scope, guarded by `if (typeof document !== "undefined")`):
  - Create `div#ado-pa-picker-overlay` with inline style:
    `position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;pointer-events:none`
  - Append to `document.body`.
  - Track `let hoveredEl = null` for outline cleanup.
  - Add a `mouseover` listener on `document` that:
    - Clears `hoveredEl`'s inline outline if set.
    - Sets `outline: 2px solid #4f9cf9; outline-offset: 1px` on `e.target`.
    - Updates `hoveredEl = e.target`.
  - Explain **why** `pointer-events: none` on the overlay: so mouse events fall through
    to real page elements, letting us read `e.target` accurately without intercepting
    them early. (design D-2)

- [x] 2.3 Add a `click` listener on `document` with `{ capture: true }`:
  - Call `e.preventDefault()` and `e.stopPropagation()`.
  - Clear any active hover outline.
  - Remove `#ado-pa-picker-overlay` from the DOM.
  - Remove all three listeners (mouseover, click, keydown) — use named function
    references (not anonymous lambdas) so `removeEventListener` works correctly.
  - Call `extractSchemaName(e.target)` and send:
    ```js
    chrome.runtime.sendMessage({ action: "ELEMENT_PICKED", schemaName });
    ```

- [x] 2.4 Add a `keydown` listener on `document`:
  - If `e.key === "Escape"`: clear hover outline, remove overlay, remove all three
    listeners. Do NOT send `ELEMENT_PICKED`.
  - Explain in a comment why Escape must NOT send the message: SPEC.md §6.4 step 8
    states cancellation should be silent — sending null would populate the field with
    a "no result" warning unintentionally.

- [x] 2.5 Run `npm test` — all tests must be green, no regressions. (The browser-facing
  code added in 2.2–2.4 never executes in Node because of the
  `typeof document !== "undefined"` guard.)

---

## 3. Service Worker — three new message handlers

- [x] 3.1 Add a `START_ELEMENT_PICKER` handler inside the `chrome.runtime.onMessage.addListener`
  block (after the `GET_COPIED_DATA` case). Handler flow:
  - Guard: if `currentPageType !== "pa"` → `sendResponse({ success: false, error: "Not on a PowerApps page." }); return false;`
  - Query active tab ID (same pattern as COPY_INITIATIVE).
  - Call `chrome.scripting.executeScript({ target: { tabId }, files: ["scripts/element-picker.js"] })`
    inside a `try/catch`; on success: `sendResponse({ success: true })`; on error:
    `sendResponse({ success: false, error: err.message })`.
  - Return `true` to keep the message channel open for the async response.
  - Add a comment explaining why `files` is used here instead of `func`:
    *element-picker.js has DOM side-effects (overlay creation, event listeners) that
    must run in page scope; we don't need a return value from it. The `func` pattern
    (used for ado-reader.js) is for pure-function injection that returns a value.*

- [x] 3.2 Add an `ELEMENT_PICKED` case immediately after `START_ELEMENT_PICKER`.
  When the injected element-picker.js calls `chrome.runtime.sendMessage({ action: "ELEMENT_PICKED", schemaName })`,
  this SW handler receives it and forwards it to the side panel:
  ```js
  if (message.action === "ELEMENT_PICKED") {
    // Forward to side panel (same broadcast pattern as TAB_CHANGED).
    // Wrap in try/catch — if the side panel is closed, sendMessage throws.
    try {
      chrome.runtime.sendMessage({ action: "ELEMENT_PICKED", schemaName: message.schemaName });
    } catch {
      // Side panel closed — nothing to forward. Safe to ignore.
    }
    return false; // no async response needed back to the injected script
  }
  ```

- [x] 3.3 Add a `CANCEL_ELEMENT_PICKER` handler. Use `executeScript` with an inline
  `func` to remove the overlay from the active tab:
  ```js
  chrome.scripting.executeScript({
    target: { tabId },
    func: () => { document.getElementById("ado-pa-picker-overlay")?.remove(); }
  })
  ```
  Respond `{ success: true }` regardless (even if the overlay didn't exist, the
  end state is the same — no overlay). Wrap in `try/catch`; on error respond
  `{ success: false, error: err.message }`. Return `true`.

- [x] 3.4 Run `npm test` — confirm all tests green, no regressions.

---

## 4. Alpine store — pickerResult property + onMessage extension

- [x] 4.1 Add `pickerResult: null` to the `Alpine.store("app", { ... })` property
  declaration block (alongside the existing `pickerActive: false` property).
  Add a comment:
  ```js
  // pickerResult is set to { schemaName } (an object, never the raw value) when
  // ELEMENT_PICKED arrives. The object wrapper distinguishes "no result yet" (null)
  // from "picker returned null schema name" ({ schemaName: null }). The
  // adminMappingForm $watch reacts to any non-null value here.
  pickerResult: null,
  ```

- [x] 4.2 In the module-level `chrome.runtime.onMessage.addListener` callback (the one
  that currently handles `TAB_CHANGED`), add an `ELEMENT_PICKED` case:
  ```js
  if (message.action === "ELEMENT_PICKED") {
    const store = Alpine.store("app");
    if (!store) return;
    store.pickerActive = false;
    store.pickerResult = { schemaName: message.schemaName };
    return;
  }
  ```
  Explain in a comment why direct property assignment (not a store method) is correct
  here: this is plain JS code, not an Alpine directive expression. The CSP constraint
  only applies to string expressions evaluated by Alpine's parser. (SPEC.md §3.2;
  same pattern as the existing `store.pageType = message.pageType` line above.)

- [x] 4.3 Add `isPickerStartDisabled()` as a read-only helper method to the store:
  ```js
  // Returns true when "Pick from Page" should be disabled.
  // A method rather than inline `pageType !== 'pa'` because the CSP parser
  // does not support the `!==` operator in all expression positions. Using
  // a method call is unambiguously supported. (SPEC.md §3.2)
  isPickerStartDisabled() { return this.pageType !== "pa"; },
  ```

---

## 5. adminMappingForm() — picker wiring

- [x] 5.1 Add `pickerWarning: ""` to the `adminMappingForm()` return object (next to
  `formError`). This holds the warning shown when the picker cannot determine a schema
  name. Extend the existing `$watch("$store.app.showMappingForm", ...)` handler to
  also reset `this.pickerWarning = ""` when the form opens (alongside the existing
  field resets), so stale warnings from a previous pick session do not carry over.

- [x] 5.2 Add a `$watch("$store.app.pickerResult", ...)` call inside `init()`, placed
  after the existing `showMappingForm` watch:
  ```js
  this.$watch("$store.app.pickerResult", (result) => {
    if (!result) return;  // initial null on store init — ignore
    if (result.schemaName) {
      this.fieldSchemaName = result.schemaName;
      this.pickerWarning   = "";
    } else {
      this.pickerWarning =
        "Could not determine field schema name — " +
        "try clicking directly on the field input or label";
    }
  });
  ```
  Add a comment explaining the object-wrapper pattern (see design D-4).

- [x] 5.3 Add `startPicker()` and `cancelPicker()` methods to `adminMappingForm()`:
  ```js
  startPicker() {
    // Set pickerActive immediately so the button label flips to "Cancel Pick"
    // without waiting for the SW round-trip.
    this.$store.app.pickerActive = true;
    chrome.runtime.sendMessage({ action: "START_ELEMENT_PICKER" }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        // Injection failed — revert the optimistic pickerActive flag and show error.
        this.$store.app.pickerActive = false;
        this.pickerWarning = response?.error ?? chrome.runtime.lastError?.message ?? "Failed to start picker";
      }
    });
  },
  cancelPicker() {
    this.$store.app.pickerActive = false;
    chrome.runtime.sendMessage({ action: "CANCEL_ELEMENT_PICKER" });
    // No response handling needed — cancelation is fire-and-forget.
  },
  ```

---

## 6. index.html — wire "Pick from Page" button

- [x] 6.1 In `sidepanel/index.html`, replace the placeholder "Pick from Page" button
  (currently: `<button class="btn btn--small btn--secondary" disabled title="Available in Phase 8">Pick from Page</button>`)
  with two mutually-exclusive buttons controlled by `x-show`:
  ```html
  <!-- Pick from Page — shown when picker is NOT active (SPEC.md §7.3) -->
  <button
    class="btn btn--small btn--secondary"
    x-show="!$store.app.pickerActive"
    :disabled="$store.app.isPickerStartDisabled()"
    title="Navigate to a PowerApps form first"
    @click="startPicker()"
  >Pick from Page</button>

  <!-- Cancel Pick — shown when picker IS active -->
  <button
    class="btn btn--small btn--secondary"
    x-show="$store.app.pickerActive"
    @click="cancelPicker()"
  >Cancel Pick</button>
  ```
  Note: these are inside the `x-data="adminMappingForm"` div, so `startPicker()` and
  `cancelPicker()` resolve to the local form component methods (task 5.3).

- [x] 6.2 Add a picker warning element immediately below the form-group row containing
  the Field Schema Name input (before the closing `</div>` of the form-group):
  ```html
  <!-- Picker warning — shown when element-picker.js returned null schema name -->
  <p class="inline-warning" x-show="pickerWarning" x-text="pickerWarning"></p>
  ```
  Add a CSS rule for `.inline-warning` in `sidepanel/styles.css` (amber/yellow
  colour, matching the existing `.status-blank` indicator style, small font,
  margin-top: 4px).

---

## 7. Final Verification

- [x] 7.1 Run `npm test` — full suite must be green with zero regressions (all existing
  tests plus new `element-picker.test.js` and the `hasCopiedData` test from task 0.1).

- [x] 7.2 Manual smoke test (unpacked extension in Chrome):
  - Navigate to a PowerApps form page (`https://*.powerapps.com/...` or `*.dynamics.com`).
  - Open the extension side panel → Admin tab → click "Add Mapping" or "Edit" on any mapping.
  - Verify "Pick from Page" button is **enabled**.
  - Click "Pick from Page": confirm button changes to "Cancel Pick".
  - Hover over form fields: confirm each hovered element gets a blue outline.
  - Click a field element with `data-id` (e.g. a text input inside a PA field control):
    confirm the Field Schema Name input is populated with the extracted schema name,
    and button returns to "Pick from Page".
  - Repeat, clicking an element with no `data-id` on any ancestor: confirm the warning
    message appears ("Could not determine field schema name…").
  - Test Escape cancel: start picker, press Escape — confirm overlay disappears and
    no schema name is populated.
  - Navigate to a non-PA page; confirm "Pick from Page" is **disabled**.
  - Check for console errors in: side panel, service worker (both must be clean).
