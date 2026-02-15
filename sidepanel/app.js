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
    // Rule 3: every required field must be present and non-null.
    // Why use the `in` operator plus a null check?
    //   `in` catches a completely absent key.  `== null` catches explicit null
    //   or undefined values.  Together they cover every "missing" case.
    for (const field of REQUIRED_FIELDS) {
      if (!(field in entry) || entry[field] == null) {
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
    if (message.action !== "TAB_CHANGED") return;

    // Guard: if Alpine hasn't registered the store yet (extremely unlikely but
    // possible in theory), drop this message safely.  The next tab-switch event
    // will re-sync pageType; no persistent stale state is introduced.
    const store = Alpine.store("app");
    if (!store) return;

    store.pageType = message.pageType;
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
        // Clear any stale validation error from the previous open.
        this.formError = "";
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
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: "SAVE_SETTINGS", settings: newSettings },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("[app] importMappings SAVE_SETTINGS error:", chrome.runtime.lastError.message);
            } else if (!response?.success) {
              console.error("[app] importMappings SAVE_SETTINGS failed:", response?.error);
            }
            resolve();
          }
        );
      });

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
