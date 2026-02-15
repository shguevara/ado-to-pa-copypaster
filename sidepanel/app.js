/**
 * Side Panel Application — Phase 3: Alpine.js Store & Message Wiring
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
 */

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
chrome.runtime.onMessage.addListener((message) => {
  if (message.action !== "TAB_CHANGED") return;

  // Guard: if Alpine hasn't registered the store yet (extremely unlikely but
  // possible in theory), drop this message safely.  The next tab-switch event
  // will re-sync pageType; no persistent stale state is introduced.
  const store = Alpine.store("app");
  if (!store) return;

  store.pageType = message.pageType;
});

// ─── Alpine store registration + initial hydration ───────────────────────────
//
// 'alpine:init' fires once, synchronously, during Alpine's startup — after
// Alpine is available on window but before it walks the DOM.  This is the
// correct place to register stores (Alpine.js docs §Stores).

document.addEventListener("alpine:init", () => {

  // ── Register the global application store ─────────────────────────────────
  //
  // All 13 properties from SPEC.md §7.4 are declared here with their defaults
  // so that every later phase can bind to any property without re-registering
  // the store or adding properties dynamically.  Declaring the full shape
  // upfront also makes the data contract explicit and easy to audit.
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
    settings:           null,   // AppSettings — loaded in Phase 4
    editingMapping:     null,   // FieldMapping | null (null = "add new" mode)
    showMappingForm:    false,
    pickerActive:       false,
    testSelectorResult: null,   // { found, tagName?, error? } | null
    testSelectorLoading: false,
    importMessage:      null,   // { type: "success"|"error", text } | null
  });

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
    if (response?.pageType) {
      Alpine.store("app").pageType = response.pageType;
    }
  });

});
