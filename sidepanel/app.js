/**
 * Side Panel Application — Phase 11: User Tab UI Overhaul
 *
 * Script loading contract (enforced in index.html):
 *   <script src="app.js">                      ← synchronous, runs immediately
 *   <script defer src="../lib/alpine.min.js">  ← deferred, runs after DOM parsed
 *
 * Why app.js is loaded WITHOUT defer, before Alpine:
 *   Alpine fires the 'alpine:init' event once, synchronously, during its own
 *   startup.  Our store registration and GET_PAGE_CONTEXT call must be wired
 *   inside that event so the store exists before Alpine evaluates any directive
 *   (x-show, :class, etc.) in index.html.  If app.js ran after Alpine, the
 *   'alpine:init' event would have already fired and the store would never be
 *   registered — every Alpine binding would silently reference undefined.
 *
 * Node.js / Vitest compatibility:
 *   Pure functions at module scope are exported via a conditional
 *   `module.exports` guard at the bottom (same pattern as detectPageType in
 *   service-worker.js).  Chrome and DOM API calls are wrapped in `typeof`
 *   guards so the file can be imported in Node.js without any mocks.
 */

// ─── Field State Derivation — module-scope pure functions ─────────────────────
//
// These functions are extracted to module scope (outside the Alpine store) so
// Vitest can import and test them in Node.js without needing a browser or Alpine.
// The store methods delegate to them, keeping the directive expressions trivial.
// (design D-1; same testability pattern as validateImportData below.)

/**
 * Derive a FieldUIState[] array from the current app state.
 *
 * Returns one FieldUIState per enabled mapping, in mapping order.
 *
 * Derivation logic (SPEC.md §7.2 / spec: user-tab-field-states):
 *   For each mapping m:
 *     1. Find copiedItem  = copiedData?.find(d => d.fieldId === m.id) ?? null
 *     2. Find pasteResult = lastPasteResults?.find(r => r.fieldId === m.id) ?? null
 *     3. If lastOperation === "paste" AND pasteResult is not null:
 *          "success"          → state "pasted",      copiedValue from copiedItem
 *          "error"|"warning"  → state "paste_failed", message from pasteResult
 *          "skipped"|"blank"  → state "skipped",      message from pasteResult
 *     4. Else if copiedItem is not null:
 *          readStatus "success" → state "copied",      copiedValue from copiedItem.value
 *          readStatus "blank"   → state "copied",      copiedValue ""
 *          readStatus "error"   → state "copy_failed", message from copiedItem.readMessage
 *     5. Otherwise: state "not_copied"
 *
 * Why pure rather than a computed Alpine property?
 *   The derivation has 6 branching states × multiple null guards — too complex
 *   to express safely in an Alpine directive expression, especially under the
 *   CSP constraint.  A pure function is independently unit-testable, and the
 *   Alpine store delegates to it via a method call.  (design D-1)
 *
 * @param {object[]} enabledMappings    - Enabled FieldMapping[] from settings.
 * @param {object[]|null} copiedData    - CopiedFieldData[] from session storage, or null.
 * @param {object[]|null} lastPasteResults - FieldResult[] from last Paste, or null.
 * @param {string|null}   lastOperation    - "copy" | "paste" | null.
 * @returns {object[]} FieldUIState[]
 */
function deriveFieldUIStates(enabledMappings, copiedData, lastPasteResults, lastOperation) {
  return enabledMappings.map(function(m) {
    // Look up this mapping's entries in both the copy and paste result sets.
    var copiedItem   = (copiedData        || []).find(function(d) { return d.fieldId === m.id; }) || null;
    var pasteResult  = (lastPasteResults  || []).find(function(r) { return r.fieldId === m.id; }) || null;

    // Paste results take priority when the last user action was "paste".
    // If no paste result exists for this mapping, fall through to copy state.
    if (lastOperation === "paste" && pasteResult !== null) {
      var ps = pasteResult.status;
      var copiedValue = copiedItem ? copiedItem.value : null;

      if (ps === "success") {
        return { fieldId: m.id, label: m.label, state: "pasted",       copiedValue: copiedValue,        message: null };
      }
      if (ps === "error" || ps === "warning") {
        return { fieldId: m.id, label: m.label, state: "paste_failed", copiedValue: copiedValue,        message: pasteResult.message || null };
      }
      // "skipped" or "blank"
      return   { fieldId: m.id, label: m.label, state: "skipped",      copiedValue: copiedValue,        message: pasteResult.message || null };
    }

    // Copy state: derive from the persisted copiedData entry.
    if (copiedItem !== null) {
      if (copiedItem.readStatus === "success") {
        return { fieldId: m.id, label: m.label, state: "copied",      copiedValue: copiedItem.value,   message: null };
      }
      if (copiedItem.readStatus === "blank") {
        return { fieldId: m.id, label: m.label, state: "copied",      copiedValue: "",                 message: null };
      }
      // readStatus "error"
      return   { fieldId: m.id, label: m.label, state: "copy_failed", copiedValue: null,               message: copiedItem.readMessage || null };
    }

    // No copy data and no paste result for this mapping → not yet copied.
    return { fieldId: m.id, label: m.label, state: "not_copied", copiedValue: null, message: null };
  });
}

/**
 * Returns true when `copiedData` contains at least one non-error entry.
 *
 * Why "non-error" rather than "any entry"?
 *   Phase 11 persists ALL copy outcomes including errors.  An all-error array
 *   means every ADO selector failed — there is nothing meaningful to paste.
 *   At least one "success" or "blank" entry means real data was captured and
 *   the Paste / Clear actions should be enabled.  (design D-3 risk)
 *
 * @param {object[]|null} copiedData - CopiedFieldData[] or null.
 * @returns {boolean}
 */
function computeHasCopiedData(copiedData) {
  if (!copiedData || copiedData.length === 0) return false;
  return copiedData.some(function(d) { return d.readStatus !== "error"; });
}

/**
 * Returns true when the Clear button should be disabled.
 *
 * The Clear button is only meaningful when there is data to clear.
 *
 * Why a pure function rather than inline Alpine `!hasCopiedData`?
 *   The Alpine CSP expression parser does not support the `!` unary operator
 *   on property-chain expressions in directive attributes.  Wrapping in a
 *   store method (which calls this) keeps the directive trivially parseable.
 *   (SPEC.md §3.2 CSP constraint; design D-1)
 *
 * @param {boolean} hasCopiedData
 * @returns {boolean}
 */
function computeIsClearDisabled(hasCopiedData) {
  return !hasCopiedData;
}

// ─── Paste state — module-scope pure functions ────────────────────────────────

/**
 * Returns true when the "Paste to PowerApps" button should be disabled.
 *
 * The button is only enabled when BOTH conditions are met:
 *   (a) pageType === "pa"       — there is a PA form to paste into
 *   (b) hasCopiedData === true  — there is ADO data ready to paste
 *
 * Why a pure function rather than inline Alpine expression?
 *   The Alpine CSP expression parser does not support the || (logical OR)
 *   operator in directive expressions (SPEC.md §3.2).  Wrapping the logic
 *   here lets the HTML directive stay a trivial method call.  (design D-9)
 *
 * @param {string}  pageType      - The current page type from the store.
 * @param {boolean} hasCopiedData - Whether ADO data has been copied.
 * @returns {boolean}
 */
function computeIsPasteDisabled(pageType, hasCopiedData) {
  return pageType !== "pa" || hasCopiedData !== true;
}

/**
 * Core async action for "Paste to PowerApps".
 *
 * Extracted from the Alpine store so it can be unit-tested by passing in a
 * mock chrome.runtime object.  The store method `pasteInitiative()` delegates
 * to this function.
 *
 * Phase 11 update: state changes after the response are now handled by
 * state.updateAfterPaste(results) rather than direct `state.pasteResults`
 * mutations.  This keeps the mock surface minimal (only pasteStatus +
 * updateAfterPaste() needed) and avoids duplicating the deriveFieldUIStates
 * call site.  (design D-5; task 1.4)
 *
 * State transitions:
 *   1. Before message: pasteStatus = "pasting"
 *   2. On success:     pasteStatus = "done", state.updateAfterPaste(results)
 *   3. On failure:     pasteStatus = "done", state.updateAfterPaste([error sentinel])
 *
 * @param {object} state          - The Alpine store (or mock store) with
 *                                  pasteStatus and updateAfterPaste().
 * @param {object} chromeRuntime  - chrome.runtime (or mock) with sendMessage
 *                                  and lastError.
 * @returns {Promise<void>}
 */
async function _runPasteInitiative(state, chromeRuntime) {
  // Step 1: set spinner state before messaging.
  state.pasteStatus = "pasting";

  let response = null;
  await new Promise((resolve) => {
    chromeRuntime.sendMessage({ action: "PASTE_INITIATIVE" }, (res) => {
      if (chromeRuntime.lastError) {
        // Service worker unavailable or channel closed unexpectedly.
        response = {
          success: false,
          error:   chromeRuntime.lastError.message,
        };
        console.error("[app] PASTE_INITIATIVE: runtime error:", chromeRuntime.lastError.message);
      } else {
        response = res;
      }
      resolve();
    });
  });

  // Step 2/3: delegate state update to the store method, then close spinner.
  if (response && response.success) {
    state.updateAfterPaste(response.results ?? []);
    state.pasteStatus = "done";
  } else {
    // Surface the error as a single sentinel entry so the field list shows
    // an error state.  This matches the pattern used by copyInitiative().
    state.updateAfterPaste([{
      fieldId: "__error__",
      label:   "Error",
      status:  "error",
      message: response?.error ?? "Unknown error",
    }]);
    state.pasteStatus = "done";
  }
}

// ─── Import validation — module-scope pure function ───────────────────────────
//
// Why at module scope rather than inside the Alpine store?
//   Functions defined inside Alpine.store(...) closures are not importable
//   from Node.js (the store is created inside a browser event callback).
//   Keeping this as a plain module-level function lets Vitest import and
//   unit-test it without any browser or Alpine mocking. (design.md Decision 1)
//
// @param {unknown} parsed - The parsed JSON value from the imported file.
// @returns {null} on success — all §4.4 validation rules passed.
// @returns {string} on failure — the first failing rule's error message.
function validateImportData(parsed) {
  // Rule 1: the root must have a `mappings` key that is an array.
  // null/undefined input also fails here (no `mappings` property at all).
  if (!parsed || !Array.isArray(parsed.mappings)) {
    return "Invalid format: 'mappings' array is required.";
  }

  // Rule 2: the mappings array must have at least one entry.
  // An empty export file is meaningless and likely a mistake.
  if (parsed.mappings.length === 0) {
    return "Invalid format: 'mappings' array must not be empty.";
  }

  // Rules 3 + 4: per-entry validation — check every mapping in order.
  const REQUIRED_FIELDS = ["id", "label", "adoSelector", "fieldSchemaName", "fieldType", "enabled"];
  const VALID_FIELD_TYPES = ["text", "lookup", "choice"];

  for (const entry of parsed.mappings) {
    // Rule 3: every required field must be present, non-null, and non-empty.
    // Why three conditions?
    //   `!(field in entry)` catches a completely absent key.
    //   `== null` catches explicit null or undefined values.
    //   `=== ""` catches empty strings — SPEC.md §4.4 defines string fields
    //   (e.g. label) as "non-empty string", so "" is as invalid as null.
    //   `enabled` is boolean (true/false) so the "" check never fires on it.
    for (const field of REQUIRED_FIELDS) {
      if (!(field in entry) || entry[field] == null || entry[field] === "") {
        return `Invalid mapping entry: missing required field '${field}'.`;
      }
    }

    // Rule 4: fieldType must be one of the three valid values.
    // Checked after the required-fields loop because fieldType must first
    // exist (rule 3) before we can meaningfully validate its value.
    if (!VALID_FIELD_TYPES.includes(entry.fieldType)) {
      return `Invalid fieldType in mapping '${entry.label}': must be text, lookup, or choice.`;
    }
  }

  // All rules passed — the data is safe to apply to storage.
  return null;
}

// ─── TAB_CHANGED push handler ─────────────────────────────────────────────────
//
// Registered at module level — outside the alpine:init callback — so the listener
// is active as soon as this script loads, before Alpine has even started.
//
// Why register this early?
//   If the user switches tabs in the brief window between this script loading and
//   Alpine finishing its init, a TAB_CHANGED message could arrive.  Registering
//   the listener here means we never miss that message.  The guard below handles
//   the case where the store hasn't been created yet.
//
// Why the `typeof chrome !== "undefined"` guard?
//   When Node.js imports this file for Vitest tests, `chrome` is not defined.
//   The guard is a no-op in the real extension (chrome is always defined there)
//   but prevents a ReferenceError that would abort the import in test runs.
//   Same pattern as service-worker.js. (design.md Decision 1)
if (typeof chrome !== "undefined") {
  chrome.runtime.onMessage.addListener((message) => {
    // Guard: if Alpine hasn't registered the store yet (extremely unlikely but
    // possible in theory), drop this message safely.
    const store = Alpine.store("app");
    if (!store) return;

    if (message.action === "TAB_CHANGED") {
      store.pageType = message.pageType;

      // Phase 11 D-3: After a tab switch, re-fetch copiedData and re-derive
      // fieldUIStates.  This ensures copy states (from session storage) survive
      // tab switches.  Paste states also survive because lastPasteResults is
      // in-memory within the same panel session.
      chrome.runtime.sendMessage({ action: "GET_COPIED_DATA" }, function(response) {
        if (chrome.runtime.lastError) return;
        var copiedData = response && response.data ? response.data : null;
        store.fieldUIStates = deriveFieldUIStates(
          store.enabledMappings,
          copiedData,
          store.lastPasteResults,
          store.lastOperation
        );
      });
      return;
    }

    if (message.action === "ELEMENT_PICKED") {
      // ELEMENT_PICKED is forwarded here from the SW after the injected
      // element-picker.js calls chrome.runtime.sendMessage in the PA tab.
      //
      // Why direct property assignment (not a store method) is correct here:
      //   This is plain JS code, not an Alpine directive expression.  The CSP
      //   constraint (SPEC.md §3.2) only applies to string expressions evaluated
      //   by Alpine's parser.  Direct assignment in plain JS triggers Alpine's
      //   reactivity normally — same pattern as `store.pageType = message.pageType`
      //   on the TAB_CHANGED line above.  (design D-4)
      store.pickerActive = false;
      store.pickerResult = { schemaName: message.schemaName };
      return;
    }
  });

  // ── Escape key cancel — side-panel-side handler ──────────────────────────
  //
  // Why handle Escape here rather than relying solely on element-picker.js?
  //   Keyboard focus stays in the side panel after the user clicks "Pick from
  //   Page".  Hovering over the PA tab moves the mouse there but does NOT
  //   transfer keyboard focus — that requires an explicit click in the tab.
  //   So when the user presses Escape, the keydown event fires in the side
  //   panel's document, not the PA tab's document, and element-picker.js never
  //   sees it.  This listener catches Escape in the side panel and drives the
  //   same cancel flow as the "Cancel Pick" button.  (QA fix — bug 7)
  //
  // The element-picker.js keydown listener is kept as a secondary path for
  // the rare case where the user clicks into the PA tab first (giving it
  // keyboard focus) and then presses Escape there.  Both paths converge on
  // the same outcome: pickerActive → false, overlay removed, no message sent.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const store = Alpine.store("app");
    if (!store || !store.pickerActive) return;

    // Mirror the cancelPicker() logic in adminMappingForm() so the cancel
    // works even when the mapping form component hasn't fully initialised yet
    // (e.g. if Escape is pressed extremely quickly after Pick starts).
    store.pickerActive = false;
    chrome.runtime.sendMessage({ action: "CANCEL_ELEMENT_PICKER" });
  });
}

// ─── adminMappingForm() — local x-data component for the mapping form ─────────
//
// Why a named function rather than an inline object literal in x-data?
//   The Alpine CSP build prohibits inline object expressions in x-data directives
//   (SPEC.md §3.2). Defining a global function and referencing it as
//   x-data="adminMappingForm()" is the canonical CSP-safe pattern for local
//   component state. (design D-1)
//
// Why not put this state in the Alpine store?
//   The form holds *draft* state while the user is typing — it should not affect
//   $store.app.settings until the user explicitly clicks "Save".  x-model binds
//   correctly to local x-data properties but silently fails against store properties
//   in the CSP build because the CSP parser drops write expressions. (design D-1)
function adminMappingForm() {
  return {
    // Local draft state — reset each time the form opens (see init()).
    label:           "",
    adoSelector:     "",
    fieldSchemaName: "",
    fieldType:       "text",  // default to simplest field type
    formError:       "",      // non-empty string → shown as an inline error message

    // pickerWarning — shown inline below the Field Schema Name input when the
    // element picker runs but cannot determine a schema name (e.g. clicked an
    // element with no data-id on any ancestor).  Cleared when the form opens
    // or when a successful pick result populates fieldSchemaName.  (design D-6)
    pickerWarning:   "",

    // Test result state (Phase 9) — local form state, NOT global store.
    // Why local rather than global store?
    //   Test results are ephemeral form-level feedback — they are meaningless
    //   outside the context of the currently open mapping form.  Routing them
    //   through the global store would pollute cross-cutting state with
    //   transient form data.  The results arrive synchronously inside async
    //   handler callbacks and can be assigned directly to x-data properties
    //   without store indirection.  (design D-2)
    paTestResult:    null,    // { found, tagName?, error? } | null
    paTestRunning:   false,
    adoTestResult:   null,    // { found, tagName?, error? } | null
    adoTestRunning:  false,

    // init() is called once by Alpine when this x-data component is mounted.
    // It sets up a $watch so the form resets itself every time showMappingForm
    // flips to true — handles both "add" mode (editingMapping is null) and
    // "edit" mode (editingMapping is a shallow copy of an existing mapping).
    //
    // Why $watch instead of x-effect or x-init reading the value once?
    //   The form stays in the DOM (x-show, not x-if) across opens and closes.
    //   We need to reset the fields every time the form becomes visible, not just
    //   on first mount.  $watch on the store property fires on every change.
    init() {
      this.$watch("$store.app.showMappingForm", (isOpen) => {
        if (!isOpen) return; // closing — nothing to reset

        const editing = this.$store.app.editingMapping;
        if (editing) {
          // Edit mode — pre-populate from the shallow copy placed by openEditForm().
          this.label           = editing.label           ?? "";
          this.adoSelector     = editing.adoSelector     ?? "";
          this.fieldSchemaName = editing.fieldSchemaName ?? "";
          this.fieldType       = editing.fieldType       ?? "text";
        } else {
          // Add mode — blank all fields.
          this.label           = "";
          this.adoSelector     = "";
          this.fieldSchemaName = "";
          this.fieldType       = "text";
        }
        // Clear any stale validation error and picker warning from the previous
        // open so the form always starts in a clean state.
        this.formError     = "";
        this.pickerWarning = "";

        // Reset test results on every form open so stale "✅ Found" messages
        // from a prior edit session are never shown for a freshly opened form.
        // (design D-3; spec §Test result clearing on input change and form reset)
        this.paTestResult   = null;
        this.paTestRunning  = false;
        this.adoTestResult  = null;
        this.adoTestRunning = false;
      });

      // React to ELEMENT_PICKED results forwarded through the store.
      //
      // Why watch $store.app.pickerResult rather than receiving the message
      // directly here?
      //   The ELEMENT_PICKED message arrives in the module-level onMessage
      //   listener (outside Alpine), which can only write to the global store.
      //   There is no direct channel from the listener to this local component.
      //   Routing through the store is the established pattern here.  (design D-4)
      //
      // Why the object wrapper ({ schemaName }) rather than a raw string?
      //   pickerResult starts as null and the pick can return schemaName: null.
      //   If we stored the raw string, null → null would not fire the $watch.
      //   An object wrapper means null → { schemaName: null } always signals
      //   a freshly returned result, distinguishable from the initial null state.
      //   (design D-4)
      this.$watch("$store.app.pickerResult", (result) => {
        if (!result) return; // initial null on store init — ignore

        if (result.schemaName) {
          // Successful pick — populate the draft field and clear any prior warning.
          this.fieldSchemaName = result.schemaName;
          this.pickerWarning   = "";
        } else {
          // Picker ran but could not extract a schema name (no data-id found
          // on any ancestor).  Leave fieldSchemaName unchanged and show a
          // helpful warning guiding the user to try a different element.
          this.pickerWarning =
            "Could not determine field schema name — " +
            "try clicking directly on the field input or label";
        }
      });
    },

    // ── Phase 9 helper methods ─────────────────────────────────────────────
    //
    // ALL of these methods exist because the Alpine CSP expression parser does
    // not support logical operators (||, &&), ternary expressions, or template
    // literals in directive attribute values.  (SPEC.md §3.2; design D-2)
    //
    // Wrapping the multi-condition and conditional-string logic in plain JS
    // method calls keeps the HTML directives as trivial, unambiguously parseable
    // identifiers.  This mirrors the pattern used for isCopyDisabled(),
    // isPickerStartDisabled(), getFormTitle(), etc. in the store.

    // Returns true when the "Test ADO" button should be disabled.
    //   • adoTestRunning      — a test is already in-flight (no double-send)
    //   • pageType !== "ado"  — no ADO tab to inject into
    //   • adoSelector === … — the __URL_ID__ sentinel has no DOM element (design D-6)
    isAdoTestDisabled() {
      return (
        this.adoTestRunning ||
        this.$store.app.pageType !== "ado" ||
        this.adoSelector === "__URL_ID__"
      );
    },

    // Returns true when the "Test Field" button should be disabled.
    //   • paTestRunning       — a test is already in-flight (no double-send)
    //   • pageType !== "pa"   — no PA tab to inject into
    isPaTestDisabled() {
      return this.paTestRunning || this.$store.app.pageType !== "pa";
    },

    // Returns the label text for the "Test ADO" button.
    //   "Testing…" while in-flight, "Test ADO" otherwise.
    getAdoTestLabel() {
      return this.adoTestRunning ? "Testing\u2026" : "Test ADO";
    },

    // Returns the label text for the "Test Field" button.
    //   "Testing…" while in-flight, "Test Field" otherwise.
    getPaTestLabel() {
      return this.paTestRunning ? "Testing\u2026" : "Test Field";
    },

    // Returns true when the ADO test result pill should use the "found" (green) style.
    isAdoFound() {
      return !!(this.adoTestResult && this.adoTestResult.found);
    },

    // Returns true when the ADO test result pill should use the "not found" (red) style.
    isAdoNotFound() {
      return !!(this.adoTestResult && !this.adoTestResult.found);
    },

    // Returns true when the PA test result pill should use the "found" (green) style.
    isPaFound() {
      return !!(this.paTestResult && this.paTestResult.found);
    },

    // Returns true when the PA test result pill should use the "not found" (red) style.
    isPaNotFound() {
      return !!(this.paTestResult && !this.paTestResult.found);
    },

    // Returns the inline feedback string for an ADO test result.
    //   Encodes the message in plain JS where string concatenation is fine —
    //   avoiding template literals that the CSP directive parser rejects.
    getAdoResultText() {
      var r = this.adoTestResult;
      if (!r) return "";
      if (r.error) return "\u274C Error: " + r.error;
      if (r.found) return "\u2705 Found: " + r.tagName + " element";
      return "\u274C No element found \u2014 check the CSS selector";
    },

    // Returns the inline feedback string for a PA test result.
    //   Same pattern as getAdoResultText(); different "not found" message.
    getPaResultText() {
      var r = this.paTestResult;
      if (!r) return "";
      if (r.error) return "\u274C Error: " + r.error;
      if (r.found) return "\u2705 Found: " + r.tagName + " element";
      return "\u274C No element found \u2014 check schema name and field type";
    },

    // save() — validate the draft, then delegate to the store.
    //
    // Validation lives here (local form) rather than in saveMapping() because
    // validation is a form-display concern — it needs to set formError, which
    // is local draft state. The store's saveMapping() still has a safety guard
    // but doesn't need to report errors back up. (design D-5)
    save() {
      // Reset any prior error before re-validating.
      this.formError = "";

      // All three text fields are required.
      if (!this.label.trim()) {
        this.formError = "Label is required.";
        return;
      }
      if (!this.adoSelector.trim()) {
        this.formError = "ADO Selector is required.";
        return;
      }
      if (!this.fieldSchemaName.trim()) {
        this.formError = "Field Schema Name is required.";
        return;
      }
      // fieldType must be one of the three valid values.
      if (!["text", "lookup", "choice"].includes(this.fieldType)) {
        this.formError = "Field Type must be text, lookup, or choice.";
        return;
      }

      // Validation passed — delegate to the store.
      // The store assigns the id for add mode (undefined here means "new mapping").
      this.$store.app.saveMapping({
        id:              this.$store.app.editingMapping?.id,  // undefined in add mode
        label:           this.label.trim(),
        adoSelector:     this.adoSelector.trim(),
        fieldSchemaName: this.fieldSchemaName.trim(),
        fieldType:       this.fieldType,
      });
    },

    // startPicker() — inject element-picker.js into the active PA tab.
    //
    // We set pickerActive = true immediately (optimistic update) so the button
    // label flips to "Cancel Pick" without waiting for the SW round-trip.  If
    // injection fails, we revert the flag and show an error via pickerWarning.
    // (design D-5; tasks.md §5.3)
    startPicker() {
      this.$store.app.pickerActive = true;
      chrome.runtime.sendMessage({ action: "START_ELEMENT_PICKER" }, (response) => {
        if (chrome.runtime.lastError || !response?.success) {
          // Injection failed — revert the optimistic pickerActive flag.
          this.$store.app.pickerActive = false;
          this.pickerWarning =
            response?.error ??
            chrome.runtime.lastError?.message ??
            "Failed to start picker";
        }
        // On success, pickerActive stays true until ELEMENT_PICKED arrives
        // (handled in the module-level onMessage listener → store → $watch above).
      });
    },

    // cancelPicker() — remove the picker overlay from the PA tab and reset state.
    //
    // Fire-and-forget: we don't wait for a response because the desired end
    // state (no overlay, pickerActive: false) is achieved regardless of whether
    // the executeScript in the SW succeeds.  The overlay may already be gone if
    // the user clicked or pressed Escape inside the PA tab.
    cancelPicker() {
      this.$store.app.pickerActive = false;
      chrome.runtime.sendMessage({ action: "CANCEL_ELEMENT_PICKER" });
    },

    // testPaField() — send TEST_SELECTOR to the service worker, which injects
    // selectorTesterMain into the active PA tab in "pa" mode and returns the result.
    //
    // Why async/await with a Promise wrapper?
    //   chrome.runtime.sendMessage's callback API is not natively awaitable.
    //   Wrapping in `new Promise(resolve => ...)` lets us use async/await for
    //   linear control flow — the same pattern used in copyInitiative().
    //   (design D-2; spec §Test Field button (PA))
    async testPaField() {
      this.paTestRunning = true;
      this.paTestResult  = null;

      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action:          "TEST_SELECTOR",
            fieldSchemaName: this.fieldSchemaName,
            fieldType:       this.fieldType,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              // Service worker unavailable — treat as an error result so the
              // side panel shows feedback rather than silently doing nothing.
              this.paTestResult = { found: false, error: chrome.runtime.lastError.message };
              console.error("[app] TEST_SELECTOR: runtime error:", chrome.runtime.lastError.message);
            } else {
              this.paTestResult = response;
            }
            resolve();
          }
        );
      });

      this.paTestRunning = false;
    },

    // testAdoSelector() — send TEST_ADO_SELECTOR to the service worker, which
    // injects selectorTesterMain into the active ADO tab in "ado" mode.
    //
    // Same Promise-wrapper pattern as testPaField() above.
    // (design D-2; spec §Test ADO button)
    async testAdoSelector() {
      this.adoTestRunning = true;
      this.adoTestResult  = null;

      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            action:      "TEST_ADO_SELECTOR",
            adoSelector: this.adoSelector,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              this.adoTestResult = { found: false, error: chrome.runtime.lastError.message };
              console.error("[app] TEST_ADO_SELECTOR: runtime error:", chrome.runtime.lastError.message);
            } else {
              this.adoTestResult = response;
            }
            resolve();
          }
        );
      });

      this.adoTestRunning = false;
    },
  };
}

// ─── Field-row secondary-line helpers — module-scope pure functions ───────────
//
// WHY extracted here rather than left as Alpine store methods?
//   Phase 12 design D-1: extracting as module-scope pure functions allows
//   Vitest to import and unit-test them directly in Node.js — no Alpine
//   mounting, no JSDOM, no mocking of `this`.  This is the same testability
//   pattern used for deriveFieldUIStates, computeHasCopiedData, and
//   computeIsClearDisabled (Phase 11).  The Alpine store methods below are
//   kept as one-liner delegations so CSP-safe directives continue to call
//   `$store.app.getFieldSecondaryText(state)` without any change.
//
// Secondary line rule (spec §7.2 user-tab-field-states):
//   paste_failed / skipped  → copiedValue (if non-empty) + " — " + message (if non-empty)
//   copy_failed             → message only
//   copied / pasted         → copiedValue only
//   not_copied              → "" (nothing shown)

/**
 * Returns the secondary-line text for a FieldUIState row.
 *
 * For `paste_failed` and `skipped`, the reviewer (COMMENTS.md 🟡) noted that
 * the previous implementation showed only `state.message`, omitting the
 * `copiedValue`.  The corrected rule: build a `parts` array from whichever of
 * copiedValue and message are non-empty, then join with " — ".  This ensures
 * the user always sees what value was attempted, even when the paste failed or
 * was skipped.
 *
 * @param {object} state - A FieldUIState: { state, copiedValue, message }
 * @returns {string}
 */
function getFieldSecondaryText(state) {
  // paste_failed / skipped: show copiedValue (if any) + " — " + message (if any).
  // Using a parts array + join avoids conditional string concatenation and
  // naturally handles all four combinations (both, value-only, message-only, neither).
  if (state.state === "paste_failed" || state.state === "skipped") {
    var parts = [];
    if (state.copiedValue !== null && state.copiedValue !== "") parts.push(state.copiedValue);
    if (state.message     !== null && state.message     !== "") parts.push(state.message);
    return parts.join(" \u2014 ");   // " — " (em-dash, design D-2)
  }
  // copy_failed: show the error message only (no copiedValue was captured).
  if (state.state === "copy_failed") {
    return state.message || "";
  }
  // copied / pasted: show the value that was read from ADO / written to PA.
  if (state.state === "copied" || state.state === "pasted") {
    return state.copiedValue !== null ? state.copiedValue : "";
  }
  // not_copied (and any unknown state): nothing to show.
  return "";
}

/**
 * Returns true when the secondary line should be visible for a FieldUIState row.
 *
 * For `paste_failed` and `skipped`, the secondary line is visible when EITHER
 * `state.copiedValue` (non-null, non-empty) OR `state.message` (non-null,
 * non-empty) is present — matching the corrected secondary-line text rule above.
 * The previous implementation checked only `state.message`, hiding the line when
 * a field was skipped/failed but the error had no message.  (COMMENTS.md 🟡)
 *
 * @param {object} state - A FieldUIState: { state, copiedValue, message }
 * @returns {boolean}
 */
function showFieldSecondary(state) {
  // paste_failed / skipped: visible when either piece of information is present.
  if (state.state === "paste_failed" || state.state === "skipped") {
    return !!(
      (state.copiedValue !== null && state.copiedValue !== "") ||
      (state.message     !== null && state.message     !== "")
    );
  }
  // copy_failed: visible when there is an error message to display.
  if (state.state === "copy_failed") {
    return !!(state.message);
  }
  // copied / pasted: visible when a non-empty value was captured.
  if (state.state === "copied" || state.state === "pasted") {
    return state.copiedValue !== null && state.copiedValue !== "";
  }
  // not_copied (and any unknown state): never show.
  return false;
}

// ─── Alpine store registration + initial hydration ───────────────────────────
//
// 'alpine:init' fires once, synchronously, during Alpine's startup — after
// Alpine is available on window but before it walks the DOM.  This is the
// correct place to register stores (Alpine.js docs §Stores).
//
// Wrapped in `typeof document !== "undefined"` so that Node.js (Vitest) can
// import this file without hitting a ReferenceError — document does not exist
// in Node.  In the real browser extension, document is always defined.
if (typeof document !== "undefined") document.addEventListener("alpine:init", () => {

  // ── Register the global application store ─────────────────────────────────
  //
  // All properties from SPEC.md §7.4 are declared here with their defaults
  // so that every later phase can bind to any property without re-registering
  // the store or adding properties dynamically.  Declaring the full shape
  // upfront makes the data contract explicit and easy to audit.
  Alpine.store("app", {

    // ── Navigation ────────────────────────────────────────────────────────
    activeTab: "user",          // "user" | "admin"

    // setTab is a method rather than a direct property assignment because the
    // Alpine CSP build's expression parser does not support assignment through
    // magic property chains ($store.app.x = y) in event handler expressions.
    // Method calls are fully supported, so @click="$store.app.setTab('admin')"
    // is the correct pattern when using the CSP build.
    setTab(tab) { this.activeTab = tab; },

    // ── Page context ──────────────────────────────────────────────────────
    // Default is "unsupported" so buttons stay disabled until the service
    // worker confirms the actual page type via GET_PAGE_CONTEXT (below).
    pageType: "unsupported",    // "ado" | "pa" | "unsupported"

    // ── User tab state ────────────────────────────────────────────────────
    copyStatus:    "idle",       // "idle" | "copying" | "done"
    pasteStatus:   "idle",       // "idle" | "pasting" | "done"
    hasCopiedData: false,
    lastOperation: null,         // "copy" | "paste" | null

    // Phase 11: always-visible field state model — replaces the old
    // `fieldResults[]` / `pasteResults[]` temporal slices.
    // enabledMappings: populated from settings.mappings.filter(m => m.enabled)
    //   on init and re-derived on every settings change.
    // fieldUIStates: derived from enabledMappings + copiedData + lastPasteResults.
    // lastPasteResults: in-memory only (not persisted); null before any paste.
    enabledMappings: [],         // FieldMapping[] — enabled subset of settings.mappings
    fieldUIStates:   [],         // FieldUIState[] — one per enabled mapping
    lastPasteResults: null,      // FieldResult[] | null — from last PASTE_INITIATIVE

    // ── Admin tab state ───────────────────────────────────────────────────
    settings:           null,   // AppSettings — loaded from storage on init (below)
    editingMapping:     null,   // FieldMapping | null (null = "add new" mode)
    showMappingForm:    false,
    pickerActive:       false,

    // pickerResult is set to { schemaName } (an object, never the raw value)
    // when ELEMENT_PICKED arrives.  The object wrapper distinguishes "no result
    // yet" (null) from "picker returned null schema name" ({ schemaName: null }).
    // The adminMappingForm $watch reacts to any non-null value here.
    // (design D-4)
    pickerResult: null,

    testSelectorResult: null,   // { found, tagName?, error? } | null
    testSelectorLoading: false,
    importMessage:      null,   // { type: "success"|"error", text } | null

    // ── Admin — read-only helpers for directive expressions ───────────────
    //
    // These methods exist purely because the Alpine CSP expression parser does
    // NOT support optional chaining (?.), nullish coalescing (??), or template
    // literals.  Wrapping the logic in store methods keeps all null-guards in
    // JavaScript where they work correctly, and the directive expressions stay
    // simple method calls that the CSP parser handles without issue.

    // Returns true when "Pick from Page" should be disabled.
    // A method rather than inline `pageType !== 'pa'` because the CSP parser
    // does not support the `!==` operator in all expression positions. Using
    // a method call is unambiguously supported.  (SPEC.md §3.2)
    isPickerStartDisabled() { return this.pageType !== "pa"; },

    // Setter methods for picker state — required for mutations triggered from
    // HTML directive expressions.  The Alpine CSP build silently drops direct
    // assignment expressions ($store.app.pickerActive = true) in event handler
    // directives.  Method calls are fully supported.  (design D-5)
    setPickerActive(value) { this.pickerActive = value; },
    setPickerResult(obj)   { this.pickerResult = obj;   },

    // Returns the mappings array, or an empty array if settings hasn't loaded yet.
    getMappings() {
      return (this.settings && this.settings.mappings) || [];
    },

    // Returns the overwriteMode boolean, or false while settings is still null.
    getOverwriteMode() {
      return !!(this.settings && this.settings.overwriteMode);
    },

    // Returns "ON" or "OFF" for the read-only Overwrite Mode badge in the
    // User Tab.  A method rather than an inline ternary because the Alpine CSP
    // expression parser does not support ternary operators in x-text directives.
    // (SPEC.md §3.2; design D-9)
    getOverwriteModeLabel() {
      return this.getOverwriteMode() ? "ON" : "OFF";
    },

    // Returns the form heading text — called from x-text in the form panel.
    // Using a method rather than an inline ternary to keep the HTML expression
    // trivially simple and unambiguously parseable by the CSP build.
    getFormTitle() {
      return this.editingMapping ? "Edit Mapping" : "Add Mapping";
    },

    // ── Import message helpers ─────────────────────────────────────────────
    //
    // These three methods exist because the Alpine CSP expression parser does
    // not support &&, optional chaining, or nullish coalescing in directives.
    // Rather than risk a silent parse failure, we centralise the null-guards
    // in JS and keep the HTML bindings as trivial method calls. (design D-1)

    // Returns the import message text, or "" when no message is set.
    getImportMessageText() {
      return this.importMessage ? this.importMessage.text : "";
    },

    // Returns true when the current import message is a success message.
    isImportSuccess() {
      return !!(this.importMessage && this.importMessage.type === "success");
    },

    // Returns true when the current import message is an error message.
    isImportError() {
      return !!(this.importMessage && this.importMessage.type === "error");
    },

    // ── Admin CRUD — form lifecycle ───────────────────────────────────────

    // Open the form in "add new" mode — no mapping is pre-loaded.
    openAddForm() {
      this.editingMapping  = null;
      this.showMappingForm = true;
    },

    // Open the form in "edit" mode pre-populated with the given mapping.
    //
    // Why shallow copy ({ ...mapping }) instead of a reference?
    //   If the user edits fields in the form and then cancels, we must NOT
    //   have mutated the original mapping object that lives in settings.mappings.
    //   A shallow copy ensures the form works on an independent object, so
    //   Cancel truly reverts to the original. (design D-3)
    openEditForm(id) {
      const mapping = (this.settings?.mappings ?? []).find((m) => m.id === id);
      if (!mapping) return; // guard against stale ids
      this.editingMapping  = { ...mapping }; // shallow copy — NOT a reference
      this.showMappingForm = true;
    },

    // Close the form and clear the draft mapping reference.
    closeForm() {
      this.showMappingForm = false;
      this.editingMapping  = null;
    },

    // Persist a new or updated mapping, then close the form.
    //
    // formData shape: { id?, label, adoSelector, fieldSchemaName, fieldType }
    // - id present  → edit mode: replace the mapping in-place.
    // - id absent   → add mode: generate a UUID, set enabled:true, append.
    //
    // Why replace the entire settings object rather than mutate in place?
    //   SAVE_SETTINGS expects the full AppSettings payload. Sending the full
    //   object avoids any risk of partial writes and matches the service
    //   worker's atomic replace contract. (design D-4; SPEC.md §5.1)
    saveMapping(formData) {
      // Safety guard — should never be reached because adminMappingForm.save()
      // validates first, but defensive programming prevents silent data corruption.
      if (
        !formData.label?.trim()           ||
        !formData.fieldSchemaName?.trim() ||
        !formData.adoSelector?.trim()     ||
        !["text", "lookup", "choice"].includes(formData.fieldType)
      ) return;

      const mappings = [...(this.settings?.mappings ?? [])];

      if (formData.id) {
        // Edit mode — find and replace in-place.  Array.findIndex preserves position.
        const idx = mappings.findIndex((m) => m.id === formData.id);
        if (idx !== -1) {
          // Spread existing mapping FIRST so all stored fields (including `enabled`)
          // are preserved, then spread formData on top to update only what the
          // form exposes (label, adoSelector, fieldSchemaName, fieldType).
          //
          // WHY? The mapping form does not render an `enabled` checkbox — that
          // is toggled separately via toggleEnabled().  Doing `{ ...formData }`
          // alone would silently drop `enabled`, resetting every edited mapping
          // to unchecked.  (SPEC.md §7.3 Mapping Form, v1.5 amendment)
          mappings[idx] = { ...mappings[idx], ...formData };
        }
      } else {
        // Add mode — generate a collision-free UUID and default to enabled.
        // crypto.randomUUID() is available in Chrome 92+ (SPEC requires Chrome 114+).
        mappings.push({
          ...formData,
          id:      crypto.randomUUID(),
          enabled: true,
        });
      }

      this.settings = { ...this.settings, mappings };
      this.updateEnabledMappings();
      this._saveSettings();
      this.closeForm();
    },

    // Remove a mapping after the user confirms the destructive action.
    deleteMapping(id) {
      if (!window.confirm("Delete this mapping? This cannot be undone.")) return;

      const mappings = (this.settings?.mappings ?? []).filter((m) => m.id !== id);
      this.settings = { ...this.settings, mappings };

      if (this.editingMapping?.id === id) {
        this.closeForm();
      }

      this.updateEnabledMappings();
      this._saveSettings();
    },

    // Flip the enabled boolean on a single mapping and persist immediately.
    toggleEnabled(id) {
      const mappings = (this.settings?.mappings ?? []).map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      );
      this.settings = { ...this.settings, mappings };
      this.updateEnabledMappings();
      this._saveSettings();
    },

    // Update the overwrite mode preference and persist immediately.
    setOverwriteMode(value) {
      this.settings = { ...this.settings, overwriteMode: value };
      this.updateEnabledMappings();
      this._saveSettings();
    },

    // ── Phase 11 — enabledMappings derived state ───────────────────────────
    //
    // updateEnabledMappings() re-derives the enabledMappings array from
    // settings.mappings whenever settings change.  It is called at the end of
    // every method that modifies this.settings.  (§7.2 Fields Section)
    //
    // Why not a computed Alpine property?
    //   Alpine.store() does not support reactive computed properties — only
    //   plain properties and methods.  We re-derive imperatively after each
    //   mutation, which gives identical semantics.
    updateEnabledMappings() {
      this.enabledMappings = (this.settings?.mappings ?? []).filter(function(m) {
        return m.enabled;
      });
    },

    // ── Phase 11 — post-copy state update ────────────────────────────────
    //
    // Called from copyInitiative() after a successful COPY_INITIATIVE response.
    // Converts the FieldResult[] to CopiedFieldData[] (for hasCopiedData),
    // sets hasCopiedData, records lastOperation, and re-derives fieldUIStates.
    // (design D-5; §7.4)
    updateAfterCopy(fieldResults) {
      // Build a CopiedFieldData-compatible array from the raw FieldResult[].
      //
      // WHY mirror convertFieldResultsToCopiedData (service-worker.js) here?
      //   The SW already stored the converted array in session storage, but
      //   sending a GET_COPIED_DATA round-trip just to re-read it would make
      //   updateAfterCopy asynchronous — complicating the call site in
      //   copyInitiative().  Instead we convert synchronously in-memory using
      //   the same rules:
      //     - error entries: value "", readMessage = r.message || ""
      //     - blank entries: value "", readMessage = r.message || ""
      //     - success entries: value = r.value || "", no readMessage
      //
      //   deriveFieldUIStates() uses copiedItem.readMessage to build the
      //   secondary "error" line in copy_failed rows (§7.2 derivation §6).
      //   Without readMessage, copy_failed rows show the badge but no message.
      var copiedData = fieldResults.map(function(r) {
        var entry = {
          fieldId:    r.fieldId,
          label:      r.label,
          value:      r.status === "success" ? (r.value || "") : "",
          readStatus: r.status,
        };
        if (r.status === "blank" || r.status === "error") {
          entry.readMessage = r.message || "";
        }
        return entry;
      });
      this.hasCopiedData  = computeHasCopiedData(copiedData);
      this.lastOperation  = "copy";
      this.fieldUIStates  = deriveFieldUIStates(this.enabledMappings, copiedData, null, "copy");
    },

    // ── Phase 11 — post-paste state update ───────────────────────────────
    //
    // Called from _runPasteInitiative() after a PASTE_INITIATIVE response.
    // Stores the paste results in-memory, records lastOperation, and re-derives
    // fieldUIStates using the in-memory lastPasteResults.  (design D-5)
    //
    // Why not re-fetch copiedData from session storage here?
    //   The paste results are received immediately after the paste completes.
    //   At that point hasCopiedData is already true (set during updateAfterCopy)
    //   and copiedData is in fieldUIStates from the copy step.  We re-read
    //   copiedData from the fieldUIStates by looking at what we stored after Copy
    //   (in session via SW) — but for simplicity we derive from the existing
    //   copiedData in store.  Actually, to stay in sync with session storage,
    //   we use a GET_COPIED_DATA call... but updateAfterPaste is synchronous.
    //   Solution: read copiedData from the current fieldUIStates' copiedValues.
    //   However, the cleanest solution is to pass the current copiedData directly.
    //
    // Note: we derive copiedData from fieldUIStates to avoid an async round-trip
    // here.  fieldUIStates already has the copiedValues from the copy step.
    updateAfterPaste(pasteResults) {
      this.lastPasteResults = pasteResults;
      this.lastOperation    = "paste";
      // Re-construct a minimal copiedData from fieldUIStates to pass to
      // deriveFieldUIStates.  We need this because pasteResult entries don't
      // carry the original copiedValue — it must come from the copy step.
      var copiedData = this.fieldUIStates
        .filter(function(s) { return s.state !== "not_copied"; })
        .map(function(s) {
          return {
            fieldId:    s.fieldId,
            value:      s.copiedValue !== null ? s.copiedValue : "",
            readStatus: (s.state === "copy_failed") ? "error" : "success",
            readMessage: s.message,
          };
        });
      // Include not_copied states as absent (copiedData won't have entries for them).
      if (!computeHasCopiedData(copiedData)) copiedData = null;
      this.fieldUIStates = deriveFieldUIStates(
        this.enabledMappings,
        copiedData,
        pasteResults,
        "paste"
      );
    },

    // ── Phase 11 — clear session data ────────────────────────────────────
    //
    // Sends CLEAR_COPIED_DATA to the service worker, then resets hasCopiedData,
    // lastOperation, lastPasteResults, and fieldUIStates.  (§5.1; spec Clear button)
    clearCopiedData() {
      chrome.runtime.sendMessage({ action: "CLEAR_COPIED_DATA" }, (response) => {
        if (chrome.runtime.lastError) {
          console.error("[app] CLEAR_COPIED_DATA: runtime error:", chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success) {
          this.hasCopiedData    = false;
          this.lastOperation    = null;
          this.lastPasteResults = null;
          this.fieldUIStates    = deriveFieldUIStates(this.enabledMappings, null, null, null);
        } else {
          console.error("[app] CLEAR_COPIED_DATA: service worker reported failure:", response && response.error);
        }
      });
    },

    // ── Phase 11 — isClearDisabled helper ─────────────────────────────────
    //
    // Delegates to computeIsClearDisabled so the Alpine CSP expression parser
    // never has to evaluate the `!` operator on a property chain in a directive.
    // (SPEC.md §3.2 CSP constraint; design D-1)
    isClearDisabled() {
      return computeIsClearDisabled(this.hasCopiedData);
    },

    // ── Phase 11 — field row rendering helpers ────────────────────────────
    //
    // ALL helper methods below exist because the Alpine CSP expression parser
    // prohibits multi-branch logic (switch, ternary, string concatenation,
    // logical operators) in directive attribute values.  The HTML bindings stay
    // as trivial method calls; all state-to-string mapping lives here in JS.
    // (SPEC.md §3.2 CSP constraint; task 6.4)

    // Returns the Unicode icon character for a given FieldUIState.
    getFieldIcon(state) {
      if (state.state === "not_copied")  return "\u25CB";   // ○
      if (state.state === "copied")      return "\u25CF";   // ●
      if (state.state === "copy_failed") return "\u2715";   // ✕
      if (state.state === "pasted")      return "\u2713";   // ✓
      if (state.state === "paste_failed")return "\u2715";   // ✕
      if (state.state === "skipped")     return "\u2298";   // ⊘
      return "\u25CB";
    },

    // Returns the aria-label for the icon span, for screen reader accessibility.
    getFieldIconLabel(state) {
      if (state.state === "not_copied")   return "Not copied";
      if (state.state === "copied")       return "Copied";
      if (state.state === "copy_failed")  return "Copy failed";
      if (state.state === "pasted")       return "Pasted";
      if (state.state === "paste_failed") return "Paste failed";
      if (state.state === "skipped")      return "Skipped";
      return "Unknown";
    },

    // Returns the uppercase badge text for a given FieldUIState.
    getFieldBadgeText(state) {
      if (state.state === "not_copied")   return "NOT COPIED";
      if (state.state === "copied")       return "COPIED";
      if (state.state === "copy_failed")  return "FAILED";
      if (state.state === "pasted")       return "PASTED";
      if (state.state === "paste_failed") return "FAILED";
      if (state.state === "skipped")      return "SKIPPED";
      return "";
    },

    // Returns the CSS class string for the badge element.
    getFieldBadgeClass(state) {
      if (state.state === "not_copied")   return "field-row__badge badge--not-copied";
      if (state.state === "copied")       return "field-row__badge badge--copied";
      if (state.state === "copy_failed")  return "field-row__badge badge--copy-failed";
      if (state.state === "pasted")       return "field-row__badge badge--pasted";
      if (state.state === "paste_failed") return "field-row__badge badge--paste-failed";
      if (state.state === "skipped")      return "field-row__badge badge--skipped";
      return "field-row__badge badge--not-copied";
    },

    // Returns the secondary-line text (value or error message) for a field row.
    // Returns "" when nothing should be shown.
    //
    // WHY a one-liner delegation?
    //   The logic is now in the module-scope pure function getFieldSecondaryText()
    //   so Vitest can test it directly (design D-1).  The store method must stay
    //   here because Alpine CSP-safe directives call $store.app.getFieldSecondaryText()
    //   — they cannot reference a plain module-scope function.
    getFieldSecondaryText(state) {
      return getFieldSecondaryText(state);
    },

    // Returns the CSS class for the secondary-line span.
    getFieldSecondaryClass(state) {
      if (state.state === "copy_failed" || state.state === "paste_failed") {
        return "field-row__secondary field-row__secondary--failed";
      }
      if (state.state === "skipped") {
        return "field-row__secondary field-row__secondary--skipped";
      }
      return "field-row__secondary field-row__secondary--value";
    },

    // Returns true when the secondary line should be visible for a field row.
    // Visible when: copied/pasted with a non-null copiedValue, OR when either
    // copiedValue or message is present for paste_failed/skipped.
    //
    // WHY a one-liner delegation? Same reason as getFieldSecondaryText() above —
    // logic lives in the module-scope pure function so Vitest can test it.
    showFieldSecondary(state) {
      return showFieldSecondary(state);
    },

    // ── Copy Initiative ───────────────────────────────────────────────────
    //
    // Sends COPY_INITIATIVE to the service worker, which injects ado-reader.js
    // into the active ADO tab and returns per-field results.
    //
    // Phase 11 update: result handling is delegated to updateAfterCopy()
    // instead of directly mutating fieldResults / hasCopiedData.  (design D-5)
    async copyInitiative() {
      this.copyStatus    = "copying";
      this.lastOperation = "copy";

      let response = null;
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "COPY_INITIATIVE" }, (res) => {
          if (chrome.runtime.lastError) {
            response = {
              success: false,
              error:   chrome.runtime.lastError.message,
            };
            console.error("[app] COPY_INITIATIVE: runtime error:", chrome.runtime.lastError.message);
          } else {
            response = res;
          }
          resolve();
        });
      });

      if (response?.success) {
        // Delegate to updateAfterCopy which computes hasCopiedData and
        // derives fieldUIStates from the FieldResult[] array.
        this.updateAfterCopy(response.results ?? []);
        this.copyStatus = "done";
      } else {
        // Copy failed — reset hasCopiedData and derive all-not_copied states.
        // Don't call updateAfterCopy for the error case because the error
        // response carries no fieldResults to populate hasCopiedData from.
        this.hasCopiedData  = false;
        this.fieldUIStates  = deriveFieldUIStates(this.enabledMappings, null, null, null);
        this.copyStatus     = "done";
      }
    },

    // ── User tab helpers — CSP-safe computed properties ───────────────────
    //
    // The Alpine CSP expression parser does not support logical operators
    // (&&, ||) or negation of property chains in directive expressions.
    // These methods encapsulate the multi-condition logic so the HTML
    // directives stay as trivial method calls.  (design D-6, SPEC §3.2)

    // Returns true when the Copy Initiative button should be disabled.
    isCopyDisabled() {
      return this.pageType !== "ado" || this.copyStatus === "copying";
    },

    // Returns true when the "Paste to PowerApps" button should be disabled.
    isPasteDisabled() {
      return computeIsPasteDisabled(this.pageType, this.hasCopiedData);
    },

    // ── Paste Initiative ──────────────────────────────────────────────────
    //
    // Delegates to _runPasteInitiative so the async state-machine logic is
    // independently unit-testable without Alpine or a Chrome runtime.
    async pasteInitiative() {
      await _runPasteInitiative(this, chrome.runtime);
    },

    // ── Export — download settings as a JSON file ──────────────────────────
    exportMappings() {
      const exportObj = {
        version:       "1.0",
        exportedAt:    new Date().toISOString(),
        overwriteMode: this.settings?.overwriteMode ?? false,
        mappings:      this.settings?.mappings ?? [],
      };

      const json = JSON.stringify(exportObj, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);

      const a       = document.createElement("a");
      a.href        = url;
      a.download    = "ado-pa-mappings.json";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    // ── Import — read a JSON file and replace settings ─────────────────────
    async importMappings(event) {
      const file = event.target.files[0];
      if (!file) return;

      event.target.value = "";
      this.importMessage = null;

      let text;
      try {
        text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload  = (e) => resolve(e.target.result);
          reader.onerror = ()  => reject(new Error("FileReader failed"));
          reader.readAsText(file);
        });
      } catch {
        this.importMessage = { type: "error", text: "Invalid file: could not read file." };
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.importMessage = { type: "error", text: "Invalid file: could not parse JSON." };
        return;
      }

      const validationError = validateImportData(parsed);
      if (validationError) {
        this.importMessage = { type: "error", text: validationError };
        return;
      }

      const newSettings = {
        mappings:      parsed.mappings,
        overwriteMode: "overwriteMode" in parsed
          ? parsed.overwriteMode
          : this.settings.overwriteMode,
      };

      let saveSucceeded = true;
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "SAVE_SETTINGS", settings: newSettings },
          (response) => {
            if (chrome.runtime.lastError) {
              saveSucceeded = false;
              console.error("[app] importMappings SAVE_SETTINGS error:", chrome.runtime.lastError.message);
            } else if (!response?.success) {
              saveSucceeded = false;
              console.error("[app] importMappings SAVE_SETTINGS failed:", response?.error);
            }
            resolve();
          }
        );
      });

      if (!saveSucceeded) {
        this.importMessage = { type: "error", text: "Failed to save settings. Please try again." };
        return;
      }

      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, (response) => {
          if (!chrome.runtime.lastError && response?.settings) {
            this.settings = response.settings;
            this.updateEnabledMappings();
          }
          resolve();
        });
      });

      this.importMessage = { type: "success", text: "Mappings imported successfully." };
    },

    // ── Private helper — send SAVE_SETTINGS ───────────────────────────────
    _saveSettings() {
      chrome.runtime.sendMessage(
        { action: "SAVE_SETTINGS", settings: this.settings },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("[app] SAVE_SETTINGS: runtime error:", chrome.runtime.lastError.message);
            return;
          }
          if (!response?.success) {
            console.error("[app] SAVE_SETTINGS: service worker reported failure:", response?.error);
          }
        }
      );
    },
  });

  // ── Register adminMappingForm as an Alpine.data component ─────────────────
  Alpine.data("adminMappingForm", adminMappingForm);

  // ── Hydrate pageType from the background service worker ───────────────────
  chrome.runtime.sendMessage({ action: "GET_PAGE_CONTEXT" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.pageType) {
      Alpine.store("app").pageType = response.pageType;
    }
  });

  // ── Hydrate AppSettings + copiedData in parallel (design D-2) ─────────────
  //
  // Both calls are fired simultaneously.  fieldUIStates is only derived once
  // BOTH callbacks have resolved (initCount === 2), so there is no flash of
  // NOT_COPIED states when the panel first opens with existing copied data.
  //
  // Counter pattern instead of Promise.all:
  //   Promise.all is not available as a one-liner in all Alpine CSP expression
  //   contexts, and nesting one callback inside the other would add 1 RTT of
  //   latency for no correctness benefit.  A simple counter is equally correct
  //   and synchronous-friendly.  (design D-2)

  let initCount = 0;
  let initSettings = null;
  let initCopiedData = null;

  function deriveAndApplyFieldStates() {
    // Called only after BOTH GET_SETTINGS and GET_COPIED_DATA have resolved.
    const store = Alpine.store("app");
    store.updateEnabledMappings();
    store.fieldUIStates = deriveFieldUIStates(
      store.enabledMappings,
      initCopiedData,
      null,
      null
    );
    // Restore hasCopiedData based on session storage so the Paste/Clear
    // buttons are correctly enabled when the panel reopens with prior data.
    store.hasCopiedData = computeHasCopiedData(initCopiedData);
  }

  chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, (response) => {
    if (chrome.runtime.lastError) {
      // Service worker not yet running — settings remains null (safe default).
    } else if (response?.settings) {
      Alpine.store("app").settings = response.settings;
      initSettings = response.settings;
    }
    initCount += 1;
    if (initCount === 2) deriveAndApplyFieldStates();
  });

  chrome.runtime.sendMessage({ action: "GET_COPIED_DATA" }, (response) => {
    if (!chrome.runtime.lastError && response?.data) {
      initCopiedData = response.data;
    }
    initCount += 1;
    if (initCount === 2) deriveAndApplyFieldStates();
  });

}); // end alpine:init

// ─── Test Export ──────────────────────────────────────────────────────────────
// Allow unit tests (Vitest / Node.js) to import pure functions without a
// browser runtime.  The guard ensures this line is a no-op when loaded by Chrome.
// Same pattern as detectPageType in service-worker.js. (design.md Decision 1)
if (typeof module !== "undefined") {
  module.exports = {
    validateImportData,
    computeIsPasteDisabled,
    computeHasCopiedData,
    computeIsClearDisabled,
    deriveFieldUIStates,
    _runPasteInitiative,
    getFieldSecondaryText,
    showFieldSecondary,
  };
}
