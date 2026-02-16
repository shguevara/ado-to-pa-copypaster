/**
 * Side Panel Application — Phase 6: Export / Import
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
 *   validateImportData is a module-scope pure function exported via a
 *   conditional `module.exports` guard at the bottom (same pattern as
 *   detectPageType in service-worker.js).  Chrome and DOM API calls are
 *   wrapped in `typeof` guards so the file can be imported in Node.js
 *   without any mocks.
 */

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
  };
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
    copyStatus:   "idle",       // "idle" | "copying" | "done"
    pasteStatus:  "idle",       // "idle" | "pasting" | "done"
    hasCopiedData: false,
    lastOperation: null,        // "copy" | "paste" | null
    fieldResults:  [],          // FieldResult[] — rendered in status list

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
      // All four required fields (SPEC.md §4.1) are checked here so that any
      // future caller (test harness, Phase 10 script, etc.) cannot persist an
      // incomplete or invalid mapping. (design D-5)
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
          mappings[idx] = { ...formData }; // spread to decouple from the form object
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
      this._saveSettings();
      this.closeForm();
    },

    // Remove a mapping after the user confirms the destructive action.
    //
    // Why window.confirm rather than an inline confirmation widget?
    //   Simple and synchronous. Acceptable for an internal tool used by a
    //   small team. A richer inline confirmation is deferred to a later phase.
    deleteMapping(id) {
      if (!window.confirm("Delete this mapping? This cannot be undone.")) return;

      const mappings = (this.settings?.mappings ?? []).filter((m) => m.id !== id);
      this.settings = { ...this.settings, mappings };

      // If the form is open for the mapping that was just deleted, close it.
      // Without this guard, showMappingForm stays true and editingMapping holds
      // a stale shallow copy of the deleted entry — the user would see an open
      // form for a ghost mapping. (COMMENTS.md §Should Fix)
      if (this.editingMapping?.id === id) {
        this.closeForm();
      }

      this._saveSettings();
    },

    // Flip the enabled boolean on a single mapping and persist immediately.
    toggleEnabled(id) {
      const mappings = (this.settings?.mappings ?? []).map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      );
      this.settings = { ...this.settings, mappings };
      this._saveSettings();
    },

    // Update the overwrite mode preference and persist immediately.
    setOverwriteMode(value) {
      this.settings = { ...this.settings, overwriteMode: value };
      this._saveSettings();
    },

    // ── Copy Initiative ───────────────────────────────────────────────────
    //
    // Sends COPY_INITIATIVE to the service worker, which injects ado-reader.js
    // into the active ADO tab and returns per-field results.  The store
    // properties copyStatus / hasCopiedData / fieldResults are already declared
    // in the store shape from Phase 3 — this method wires them to the message.
    //
    // Why the same Promise-wrapping pattern as importMappings()?
    //   chrome.runtime.sendMessage's callback API is not natively awaitable.
    //   Wrapping in `new Promise(resolve => ...)` with a closure flag lets us
    //   use async/await for linear control flow and consolidate error handling
    //   in one place.  (design D-6; same idiom as importMappings SAVE_SETTINGS)
    async copyInitiative() {
      this.copyStatus   = "copying";
      this.lastOperation = "copy";
      this.fieldResults  = [];

      let response = null;
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "COPY_INITIATIVE" }, (res) => {
          if (chrome.runtime.lastError) {
            // Service worker unavailable or channel closed unexpectedly.
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
        // Successful copy — store all field results (success + blank + error)
        // so the user can see exactly which fields were read and their status.
        this.fieldResults  = response.results ?? [];
        // hasCopiedData is true only when at least one result is not an error.
        // "blank" results still have copyable data (an empty value for the PA
        // field), so they count as valid paste targets. Pure all-error results
        // (e.g. every selector failed) mean there is nothing meaningful to paste.
        // (design D-7; COMMENTS.md 🟡 item 1)
        this.hasCopiedData = (response.results ?? []).some(r => r.status !== "error");
        this.copyStatus    = "done";
      } else {
        // Copy failed (not on ADO page, injection error, etc.) — surface as a
        // single status:error row in the results list.  hasCopiedData stays
        // false because there is nothing valid to paste.  (design D-6)
        this.fieldResults = [{
          fieldId: "__error__",
          label:   "Error",
          status:  "error",
          message: response?.error ?? "Unknown error",
        }];
        this.copyStatus = "done";
      }
    },

    // ── User tab helpers — CSP-safe computed properties ───────────────────
    //
    // The Alpine CSP expression parser does not support logical operators
    // (&&, ||) or negation of property chains in directive expressions.
    // These three methods encapsulate the multi-condition logic so the HTML
    // directives stay as trivial method calls.  (design D-6, SPEC §3.2)

    // Returns true when the Copy Initiative button should be disabled:
    //   (a) not on an ADO page — nothing useful to copy
    //   (b) already copying — prevent duplicate in-flight requests
    isCopyDisabled() {
      return this.pageType !== "ado" || this.copyStatus === "copying";
    },

    // Returns true when the per-field results list should be visible:
    //   copyStatus is "done" AND there is at least one result entry.
    hasCopyResults() {
      return this.copyStatus === "done" && this.fieldResults.length > 0;
    },

    // ── Export — download settings as a JSON file ──────────────────────────
    //
    // Reads from the in-memory store (this.settings) rather than issuing a
    // fresh GET_SETTINGS message.  The store is always in sync with storage
    // after every SAVE_SETTINGS call, so a storage round-trip adds async
    // complexity for no correctness benefit.  (design.md Decision 2)
    //
    // Blob URL cleanup: createObjectURL allocates a browser-internal resource.
    // We must call revokeObjectURL() after the click to release that resource.
    // The temporary <a> element is also removed from the DOM to keep it clean.
    // (design.md Risks/Trade-offs — Blob URL cleanup)
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

      // Trigger a browser file download via a temporary hidden <a> element.
      // This is the standard cross-browser pattern — no special Chrome APIs needed.
      const a       = document.createElement("a");
      a.href        = url;
      a.download    = "ado-pa-mappings.json";
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Release the object URL immediately — the browser has already queued
      // the download so revoking now is safe and avoids memory leaks.
      URL.revokeObjectURL(url);
    },

    // ── Import — read a JSON file and replace settings ─────────────────────
    //
    // Async because FileReader is callback-based; we wrap it in a Promise so
    // the async/await flow is linear and error handling stays in one place.
    //
    // Key design points:
    //   (a) value reset — event.target.value is cleared immediately after
    //       reading the file reference so re-selecting the same file triggers
    //       the `change` event again (browsers suppress it if value is unchanged).
    //       (design.md Decision 3)
    //   (b) key-presence check — we use `'overwriteMode' in parsed` (not
    //       truthiness) so `"overwriteMode": false` is correctly applied rather
    //       than ignored.  (design.md Decision 4)
    //   (c) message cleared at import start — importMessage is reset to null
    //       before the file is read, not on a timer, so the user sees their
    //       last result until they explicitly begin a new import.  (design.md
    //       Decision 5)
    async importMappings(event) {
      const file = event.target.files[0];
      if (!file) return; // user dismissed the picker — do nothing

      // Reset the input value immediately so the same file can be re-selected
      // later without the browser suppressing the change event.
      event.target.value = "";

      // Clear any previous import result at the start of a new attempt.
      this.importMessage = null;

      // Read the file as text inside a Promise so we can use async/await.
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

      // Parse JSON — any syntax error produces the user-facing error message.
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        this.importMessage = { type: "error", text: "Invalid file: could not parse JSON." };
        return;
      }

      // Validate the parsed structure against all §4.4 rules.
      const validationError = validateImportData(parsed);
      if (validationError) {
        this.importMessage = { type: "error", text: validationError };
        return;
      }

      // Build the new AppSettings object.
      // overwriteMode: use key-presence check (not truthiness) so that
      // `"overwriteMode": false` in the import file correctly overrides the
      // current stored value to false.  (design.md Decision 4)
      const newSettings = {
        mappings:      parsed.mappings,
        overwriteMode: "overwriteMode" in parsed
          ? parsed.overwriteMode
          : this.settings.overwriteMode,
      };

      // Persist the new settings to storage via the background service worker.
      //
      // Why a `saveSucceeded` flag rather than reject()?
      //   We want to stay in the async/await flow (no try/catch around the
      //   Promise constructor) and still distinguish success from failure after
      //   the await.  Capturing the outcome in a closure variable keeps the
      //   callback-style chrome.runtime.sendMessage compatible with async/await
      //   without wrapping errors as rejections — same pattern used in
      //   addMapping() and saveSettings(). (SPEC.md §8.5)
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

      // Guard: if the save failed, surface an inline error (SPEC.md §8.5).
      // Do NOT show "success" — the settings in storage are unchanged, so
      // continuing would leave the mapping list untouched while displaying a
      // misleading "Mappings imported successfully." message.
      if (!saveSucceeded) {
        this.importMessage = { type: "error", text: "Failed to save settings. Please try again." };
        return;
      }

      // Reload settings from storage to ensure the UI reflects what was saved.
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, (response) => {
          if (!chrome.runtime.lastError && response?.settings) {
            this.settings = response.settings;
          }
          resolve();
        });
      });

      this.importMessage = { type: "success", text: "Mappings imported successfully." };
    },

    // ── Private helper — send SAVE_SETTINGS ───────────────────────────────
    //
    // Named with a leading underscore to signal "internal to the store".
    // Centralising the sendMessage call here means every mutating method
    // calls one line (_saveSettings()) rather than repeating the full
    // chrome.runtime.sendMessage(...) call with its error handling. (design D-3)
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
  //
  // WHY Alpine.data() and NOT a bare global function:
  //   The Alpine CSP build's expression parser resolves x-data attribute values
  //   by looking up names in Alpine's own registry, not in window globals.
  //   `x-data="adminMappingForm"` (without parentheses) works only when the name
  //   is registered here.  Leaving it as a bare global function causes the
  //   "Undefined variable: adminMappingForm" error the CSP parser throws when it
  //   can't resolve the name.  (design D-1; SPEC.md §3.2 CSP constraint)
  Alpine.data("adminMappingForm", adminMappingForm);

  // ── Hydrate pageType from the background service worker ───────────────────
  //
  // Why here rather than in x-init on the root element?
  //   Calling sendMessage inside alpine:init means pageType is set before
  //   Alpine evaluates any directive — the banner renders in the correct state
  //   from the very first frame, with no flash of the "unsupported" default.
  //
  // The service worker responds synchronously from its module-level cache
  // (see background/service-worker.js), so this callback fires immediately
  // on the next microtask turn — well within the same rendering cycle.
  chrome.runtime.sendMessage({ action: "GET_PAGE_CONTEXT" }, (response) => {
    if (chrome.runtime.lastError) {
      // Service worker not yet running (rare on first load) — pageType stays
      // "unsupported", which is the correct safe default.
      return;
    }
    // spec guarantees pageType is always "ado"|"pa"|"unsupported" — all truthy
    if (response?.pageType) {
      Alpine.store("app").pageType = response.pageType;
    }
  });

  // ── Hydrate AppSettings from storage ──────────────────────────────────────
  //
  // Sent immediately after GET_PAGE_CONTEXT so both initialisation calls are
  // co-located and easy to audit. Loading eagerly means the Admin tab renders
  // the correct mapping list from the very first frame — no flash of empty
  // state even if the user's default tab is Admin. (design D-2)
  //
  // If the service worker is unavailable, settings stays null (the store's
  // initial default) — the Admin tab will show the empty state until the
  // panel is reloaded, which is the safest fallback.
  chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, (response) => {
    if (chrome.runtime.lastError) {
      // Service worker not yet running — settings remains null (safe default).
      return;
    }
    if (response?.settings) {
      Alpine.store("app").settings = response.settings;
    }
  });

}); // end alpine:init

// ─── Test Export ──────────────────────────────────────────────────────────────
// Allow unit tests (Vitest / Node.js) to import validateImportData without a
// browser runtime.  The guard ensures this line is a no-op when loaded by Chrome
// (Chrome's module system does not expose `module`).
// Same pattern as detectPageType in service-worker.js. (design.md Decision 1)
if (typeof module !== "undefined") module.exports = { validateImportData };
