/**
 * Background Service Worker
 *
 * Responsibilities:
 *   1. Classify the active tab as "ado", "pa", or "unsupported" based on its URL.
 *   2. Cache the current page type in a module-level variable.
 *   3. Broadcast TAB_CHANGED to the side panel whenever the page type changes.
 *   4. Respond to GET_PAGE_CONTEXT pull requests from the side panel.
 *   5. Open the side panel when the extension action icon is clicked.
 *   6. Seed DEFAULT_SETTINGS into chrome.storage.local on first install
 *      (or after manual storage clear + reload during development).
 *   7. Respond to GET_SETTINGS requests from the side panel by reading
 *      chrome.storage.local and returning the stored AppSettings.
 *   8. Respond to SAVE_SETTINGS requests from the side panel by atomically
 *      replacing the entire AppSettings object in chrome.storage.local.
 *   9. Respond to COPY_INITIATIVE: inject ado-reader.js into the ADO tab,
 *      collect FieldResult[], persist CopiedFieldData[] to session storage,
 *      and return the full FieldResult[] to the side panel.
 *  10. Respond to GET_COPIED_DATA: return CopiedFieldData[] from session storage.
 *
 * Architecture note: The service worker is ephemeral in MV3 — it can terminate
 * between events. Page type does NOT need to survive termination because it can
 * always be reconstructed from the current tab's URL on the next event.
 * Persistent data (settings, copied ADO data) is stored in chrome.storage.local
 * and survives service-worker restarts automatically.
 */

// ─── Injectable Reader Script ─────────────────────────────────────────────────
//
// Load adoReaderMain into the SW's global scope so it can be passed as the
// `func` argument to chrome.scripting.executeScript.  Chrome serialises the
// function via Function.prototype.toString() and executes it in the ADO page's
// isolated world with the enabled mappings array as its argument.
//
// Why importScripts rather than definedfunc inline here?
//   A separate file keeps the reader logic independently unit-testable in
//   Vitest without mocking Chrome APIs — matching the pattern established by
//   detectPageType (service-worker.js) and validateImportData (app.js).
//   importScripts is synchronous so adoReaderMain is guaranteed to be in scope
//   before any message handler fires.  (design D-1)
//
// Why the typeof guard?
//   importScripts is a global only in classic service worker scope.
//   In Node.js (Vitest), it is undefined — the guard prevents a ReferenceError
//   that would abort the import and break the detectPageType tests.
if (typeof importScripts === "function") {
  // Why "../scripts/ado-reader.js" and not "scripts/ado-reader.js"?
  //   importScripts resolves paths relative to the service worker script's own
  //   URL — not the extension root.  The SW lives at background/service-worker.js,
  //   so a bare "scripts/..." path resolves to background/scripts/... (wrong).
  //   The "../" prefix steps up from background/ to the extension root first,
  //   giving the correct chrome-extension://<id>/scripts/ado-reader.js path.
  importScripts("../scripts/ado-reader.js");

  // Load selectorTesterMain into the SW's global scope so it can be passed as
  // the `func` argument to executeScript for TEST_SELECTOR / TEST_ADO_SELECTOR.
  // Same importScripts pattern as adoReaderMain above.  (design D-1)
  importScripts("../scripts/selector-tester.js");
}

// ─── Page Type Detection ─────────────────────────────────────────────────────

/**
 * Classify a browser tab's URL into one of three page types.
 *
 * Why this function is pure (no Chrome API calls)?
 * Keeping detectPageType as a pure string→string function makes it unit-testable
 * in Node.js via Vitest without mocking Chrome APIs. The callers (event handlers
 * below) supply the URL string from chrome.tabs.get().
 *
 * URL rules from SPEC.md §6.1:
 *   - ADO: dev.azure.com or *.visualstudio.com with /_workitems/ in the path
 *   - PA:  *.powerapps.com or *.dynamics.com
 *   - Anything else → unsupported
 *
 * @param {string} url - The full URL of the browser tab.
 * @returns {"ado" | "pa" | "unsupported"}
 */
function detectPageType(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    // Malformed or empty URL — treat as unsupported rather than crashing.
    return "unsupported";
  }

  const { hostname, pathname } = parsed;

  // ADO: must be a work item page, not just any ADO page (e.g. boards, repos).
  // We check for /_workitems/ in the path to avoid false positives.
  const isWorkItemPath = pathname.includes("/_workitems/");
  if (isWorkItemPath && (hostname === "dev.azure.com" || hostname.endsWith(".visualstudio.com"))) {
    return "ado";
  }

  // PowerApps and Dynamics 365 model-driven apps share these two host patterns.
  if (hostname.endsWith(".powerapps.com") || hostname.endsWith(".dynamics.com")) {
    return "pa";
  }

  return "unsupported";
}

// ─── Default AppSettings ─────────────────────────────────────────────────────

/**
 * The factory-default AppSettings written to chrome.storage.local on first install.
 *
 * Why inline here instead of a separate defaults.js?
 * The classic service worker cannot use ES `import` statements, and `importScripts()`
 * is synchronous and awkward to mock in Vitest. Two small objects do not warrant a
 * new file and a new import mechanism — keeping them inline is the simplest, most
 * reviewable choice. (design D-1)
 *
 * Matches SPEC.md §4.3 exactly:
 *   - "default-title": captures the Work Item title via an aria-label selector
 *   - "default-id":    captures the Initiative ID from the ADO page URL (__URL_ID__)
 */
const DEFAULT_SETTINGS = {
  overwriteMode: false,
  mappings: [
    {
      id:          "default-title",
      label:       "Title",
      adoSelector:      "input[aria-label='Title'], textarea[aria-label='Title']",
      fieldSchemaName:  "",
      fieldType:        "text",
      enabled:     true,
    },
    {
      id:          "default-id",
      label:       "Initiative ID",
      adoSelector:      "__URL_ID__",
      fieldSchemaName:  "",
      fieldType:        "text",
      enabled:     true,
    },
  ],
};

// ─── Page Type Cache ─────────────────────────────────────────────────────────

/**
 * Module-level cache for the current page type.
 *
 * Why not use chrome.storage? Page type is ephemeral — the correct value is
 * always reconstructable from the active tab's URL. If the service worker
 * restarts, "unsupported" is the right safe default (buttons stay disabled)
 * until the next tab event fires and repopulates this variable.
 */
let currentPageType = "unsupported";

// ─── Tab Change Handler ───────────────────────────────────────────────────────

/**
 * Re-evaluate the page type for a given tab, update the cache, and push
 * a TAB_CHANGED message to the side panel.
 *
 * The try/catch on sendMessage is critical: if the side panel is not open,
 * Chrome throws "Could not establish connection. Receiving end does not exist."
 * We must not let that crash the service worker.
 *
 * @param {number} tabId - The Chrome tab ID to evaluate.
 */
async function updatePageType(tabId) {
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    // Tab may have been closed before we could inspect it — ignore.
    return;
  }

  const newType = detectPageType(tab.url ?? "");
  currentPageType = newType;

  try {
    await chrome.runtime.sendMessage({ action: "TAB_CHANGED", pageType: newType });
  } catch (err) {
    // Swallow "no receiver" errors silently — the side panel may simply be closed.
    // Any other errors are worth logging for debugging.
    if (!err.message?.includes("Receiving end does not exist")) {
      console.error("[SW] TAB_CHANGED sendMessage failed:", err.message);
    }
  }
}

// ─── Chrome Event Listeners ───────────────────────────────────────────────────
// All Chrome API calls are guarded with `typeof chrome !== "undefined"` so that
// this file can be safely imported in Node.js (Vitest) to unit-test detectPageType
// without crashing on undefined globals.

if (typeof chrome !== "undefined") {
  // ── First-install seed ─────────────────────────────────────────────────────
  // Seed DEFAULT_SETTINGS into chrome.storage.local if it is not already set.
  //
  // Why we do NOT filter by reason:
  //   Chrome fires onInstalled with reason "update" — not "install" — when you
  //   click the Reload button at chrome://extensions on an unpacked extension.
  //   Filtering to reason === "install" only would mean "clear storage + reload"
  //   never re-seeds the defaults, breaking the developer verification workflow.
  //
  //   The read-before-write guard below is the ONLY protection we need:
  //     - Storage empty  → write defaults  (first install, or post-clear reload)
  //     - Storage has data → skip           (normal update, reload with existing data)
  //   This is safe for every scenario: clean install, update, reinstall, developer
  //   reload with data, and developer reload after manual clear. (design D-2)
  chrome.runtime.onInstalled.addListener(async () => {
    try {
      const result = await chrome.storage.local.get("settings");
      if (result.settings == null) {
        // Storage is empty — seed factory defaults.
        await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
      }
      // result.settings is already set → skip to preserve existing user data.
    } catch (err) {
      console.error("[SW] onInstalled: failed to seed default settings:", err);
    }
  });

  // ── Action click → open side panel ────────────────────────────────────────
  // MV3 requires the side panel to be opened in response to a user gesture.
  // chrome.sidePanel.open() is called here instead of setPanelBehavior so that
  // the Phase 1 stub approach is replaced with an explicit handler.
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });

  // ── Tab activated (user switches tabs) ────────────────────────────────────
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    updatePageType(tabId);
  });

  // ── Tab updated (navigation within a tab) ─────────────────────────────────
  // We re-evaluate on two conditions (OR, not AND — see design.md D-2):
  //   - changeInfo.url is set: the URL changed (catches SPA navigation on ADO).
  //   - changeInfo.status === "complete": the page finished loading.
  // The small risk of double-firing TAB_CHANGED is acceptable because the side
  // panel treats repeated identical pageType values as a no-op.
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status === "complete") {
      // Only re-evaluate the tab that actually changed.
      // We could compare against a tracked "active tab ID", but Chrome's
      // onUpdated fires for all tabs; calling tabs.get() is the simplest
      // way to check if this is the currently active tab.
      chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
        if (activeTab && activeTab.id === tabId) {
          updatePageType(tabId);
        }
      });
    }
  });

  // ── Message handler ────────────────────────────────────────────────────────
  // Handles pull requests from the side panel.
  //
  // Return value contract (design D-3):
  //   return false — response sent synchronously (GET_PAGE_CONTEXT)
  //   return true  — response sent asynchronously; Chrome must hold the channel
  //                  open until sendResponse() is called (GET_SETTINGS, SAVE_SETTINGS)
  //   (implicit)   — unknown action; Chrome treats undefined as false
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    // ── GET_PAGE_CONTEXT ──────────────────────────────────────────────────────
    // Synchronous: reads a module-level variable, no async work needed.
    if (message.action === "GET_PAGE_CONTEXT") {
      sendResponse({ pageType: currentPageType });
      return false;
    }

    // ── GET_SETTINGS ──────────────────────────────────────────────────────────
    // Async: reads chrome.storage.local. We must return `true` before the storage
    // call resolves so Chrome keeps the response channel open. (design D-3, D-5)
    if (message.action === "GET_SETTINGS") {
      chrome.storage.local.get("settings")
        .then((result) => {
          // Fall back to DEFAULT_SETTINGS if storage is empty (e.g. before
          // onInstalled completes on first load, or in a test environment).
          // This ensures callers always receive a valid AppSettings object. (design D-5)
          sendResponse({ settings: result.settings ?? DEFAULT_SETTINGS });
        })
        .catch((err) => {
          console.error("[SW] GET_SETTINGS: storage read failed:", err);
          sendResponse({ settings: DEFAULT_SETTINGS });
        });
      return true; // keep channel open for the async storage read
    }

    // ── SAVE_SETTINGS ─────────────────────────────────────────────────────────
    // Async: writes chrome.storage.local. Replaces the entire AppSettings object
    // atomically — no partial updates, no stale fields. (design D-3, D-4)
    if (message.action === "SAVE_SETTINGS") {
      chrome.storage.local.set({ settings: message.settings })
        .then(() => {
          sendResponse({ success: true });
        })
        .catch((err) => {
          console.error("[SW] SAVE_SETTINGS: storage write failed:", err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // keep channel open for the async storage write
    }

    // ── COPY_INITIATIVE ───────────────────────────────────────────────────────
    // Async: inject adoReaderMain into the active ADO tab, collect FieldResult[],
    // persist CopiedFieldData[] to session storage, return results to caller.
    //
    // Flow (design D-1, D-4, D-5; SPEC §6.2):
    //   1. Guard: must be on an ADO page — reject immediately if not.
    //   2. Load AppSettings to get the enabled mappings array.
    //   3. Find the active tab ID.
    //   4. Inject adoReaderMain via executeScript (func + args pattern).
    //      adoReaderMain is in global scope thanks to importScripts above.
    //   5. Convert FieldResult[] → CopiedFieldData[] (omit error entries).
    //   6. Persist to chrome.storage.session under "copiedData".
    //   7. Return { success: true, results: FieldResult[] }.
    //
    // The entire async body runs in a self-invoking async IIFE so we can use
    // await while still returning `true` synchronously to hold the channel.
    if (message.action === "COPY_INITIATIVE") {
      // Guard: side panel checks pageType but re-check here for safety.
      // Return synchronously (false) — no async work needed for this early exit.
      if (currentPageType !== "ado") {
        sendResponse({ success: false, error: "Not on an ADO work item page." });
        return false;
      }

      (async () => {
        try {
          // Load AppSettings from storage to get the current mapping list.
          const storageResult = await chrome.storage.local.get("settings");
          const settings = storageResult.settings ?? DEFAULT_SETTINGS;
          const enabledMappings = (settings.mappings ?? []).filter(m => m.enabled);

          // Find the active tab so we know which tab to inject into.
          // We could track this separately, but a fresh query is reliable and
          // consistent with the updatePageType() pattern used above. (design D-4)
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = activeTab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: "No active tab found." });
            return;
          }

          // Inject adoReaderMain into the ADO page.
          // adoReaderMain was loaded into the SW's global scope via importScripts.
          // Chrome serialises it with Function.prototype.toString() and runs it
          // in the ADO page's isolated world, passing enabledMappings as args[0].
          // If the tab navigated away between the pageType check and here, Chrome
          // will throw — we catch that below. (design D-4)
          let injectionResults;
          try {
            injectionResults = await chrome.scripting.executeScript({
              target: { tabId },
              func:   adoReaderMain,   // loaded via importScripts at the top of this file
              args:   [enabledMappings],
            });
          } catch (injErr) {
            console.error("[SW] COPY_INITIATIVE: executeScript failed:", injErr.message);
            sendResponse({ success: false, error: injErr.message });
            return;
          }

          // executeScript returns InjectionResult[].  The reader's return value
          // (FieldResult[]) lives in results[0].result. (design D-4)
          const fieldResults = injectionResults[0]?.result ?? [];

          // Convert FieldResult[] → CopiedFieldData[].
          // Only "success" and "blank" entries have copyable data.
          // "error" entries are omitted from storage — they carry no value to paste.
          // (design D-5; SPEC §6.2 step 7)
          const copiedData = fieldResults
            .filter(r => r.status === "success" || r.status === "blank")
            .map(r => {
              const entry = {
                fieldId:    r.fieldId,
                label:      r.label,
                value:      r.status === "success" ? r.value : "",
                readStatus: r.status,
              };
              // Include readMessage only for blank entries — the message explains
              // why the value is empty without cluttering success entries.
              if (r.status === "blank") entry.readMessage = r.message;
              return entry;
            });

          // First-ever write to chrome.storage.session in this extension.
          // Session storage is cleared when the browser closes — no migration needed.
          // The `storage` permission already declared in manifest.json covers
          // both local and session storage. (design D-5)
          await chrome.storage.session.set({ copiedData });

          sendResponse({ success: true, results: fieldResults });

        } catch (err) {
          console.error("[SW] COPY_INITIATIVE: unexpected error:", err);
          sendResponse({ success: false, error: err.message });
        }
      })();

      return true; // keep channel open for the async IIFE above
    }

    // ── START_ELEMENT_PICKER ──────────────────────────────────────────────────
    // Async: inject element-picker.js into the active PA tab so the user can
    // click a field element and have its schema name captured.
    //
    // Why `files` rather than `func` (the pattern used for ado-reader.js)?
    //   element-picker.js has DOM side-effects (overlay creation, event
    //   listeners) that must run in page scope.  We don't need a return value
    //   from it.  The `func` pattern is for pure-function injection that
    //   returns a value from the page context back to the SW.  Using `files`
    //   is simpler and more appropriate for side-effect-only injection.
    //   (design D-3; tasks.md §3.1 rationale comment)
    if (message.action === "START_ELEMENT_PICKER") {
      // Guard: element-picker.js is only useful on a PA page — PA forms
      // use data-id attributes for field identification.  On ADO or other
      // pages there are no PA field controls to pick from.
      if (currentPageType !== "pa") {
        sendResponse({ success: false, error: "Not on a PowerApps page." });
        return false;
      }

      (async () => {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = activeTab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: "No active tab found." });
            return;
          }

          await chrome.scripting.executeScript({
            target: { tabId },
            files: ["scripts/element-picker.js"],
          });

          sendResponse({ success: true });
        } catch (err) {
          console.error("[SW] START_ELEMENT_PICKER: executeScript failed:", err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();

      return true; // keep channel open for the async IIFE above
    }

    // ── ELEMENT_PICKED ────────────────────────────────────────────────────────
    // The injected element-picker.js calls chrome.runtime.sendMessage when the
    // user clicks an element (or if extractSchemaName returns null).  This SW
    // handler forwards the result to the side panel.
    //
    // Why two-hop routing (injected script → SW → side panel)?
    //   Injected scripts live in the page's isolated world and can only reach
    //   the extension via chrome.runtime.sendMessage to the background.  There
    //   is no direct channel from an injected script to the side panel.  This
    //   two-hop routing is the same pattern used for TAB_CHANGED push
    //   notifications in this extension.  (design D-3)
    if (message.action === "ELEMENT_PICKED") {
      // Forward to the side panel.  Wrap in try/catch — if the side panel is
      // closed, sendMessage throws "Receiving end does not exist" and we should
      // not let that crash the SW.  (same defensive pattern as TAB_CHANGED)
      try {
        chrome.runtime.sendMessage({
          action:     "ELEMENT_PICKED",
          schemaName: message.schemaName,
        });
      } catch {
        // Side panel is closed — nothing to forward. Safe to ignore.
      }
      return false; // no async response needed back to the injected script
    }

    // ── CANCEL_ELEMENT_PICKER ─────────────────────────────────────────────────
    // The side panel's "Cancel Pick" button sends this message.  We execute an
    // inline function in the active tab to remove the picker overlay (if it
    // still exists) and reset the page to its normal state.
    //
    // Why `func` here rather than `files`?
    //   We need to execute a tiny one-liner in the tab and the result is
    //   unimportant.  The overlay DOM node is already in the page from the
    //   START_ELEMENT_PICKER injection — we just need to remove it.
    //   Using `func` for this minimal teardown avoids injecting a second copy
    //   of element-picker.js (which would re-register all the listeners).
    if (message.action === "CANCEL_ELEMENT_PICKER") {
      (async () => {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = activeTab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: "No active tab found." });
            return;
          }

          await chrome.scripting.executeScript({
            target: { tabId },
            // Full teardown via the cleanup function stored on the overlay by
            // element-picker.js.  This removes the overlay, clears any hover
            // outline, and deregisters all three event listeners — avoiding the
            // "ghost outline + dangling listeners" bug observed when Cancel Pick
            // was clicked in the side panel.  (QA fix — bug 8)
            //
            // Why overlay._cleanup rather than a window global?
            //   Both this func and element-picker.js run in the same Chrome
            //   extension isolated world, so they share the same DOM object
            //   references.  Storing cleanup on the overlay element itself keeps
            //   the contract self-contained and doesn't pollute window scope.
            func: () => {
              const overlay = document.getElementById("ado-pa-picker-overlay");
              if (!overlay) return; // picker already cleaned up (Escape or click)
              if (typeof overlay._cleanup === "function") {
                overlay._cleanup();
              } else {
                overlay.remove(); // fallback: at least remove the overlay node
              }
            },
          });

          // Respond success regardless of whether the overlay was present.
          // The desired end-state (no overlay) is achieved either way.
          sendResponse({ success: true });
        } catch (err) {
          console.error("[SW] CANCEL_ELEMENT_PICKER: executeScript failed:", err.message);
          sendResponse({ success: false, error: err.message });
        }
      })();

      return true; // keep channel open for the async IIFE above
    }

    // ── TEST_SELECTOR ─────────────────────────────────────────────────────────
    // Async: inject selectorTesterMain into the active PA tab in "pa" mode.
    // Derives the data-id selector from fieldSchemaName + fieldType, runs
    // querySelector, highlights if found, and returns the result.
    //
    // Flow (design D-4; spec §TEST_SELECTOR background message handler):
    //   1. Guard: must be on a PA page — return { found: false, error } if not.
    //   2. Find the active tab ID.
    //   3. Inject selectorTesterMain via executeScript (func + args pattern).
    //      selectorTesterMain is in global scope thanks to importScripts above.
    //   4. Return InjectionResult[0].result to the caller.
    //   5. Catch injection errors and return { found: false, error: e.message }.
    //
    // Why func + args rather than files?
    //   Unlike element-picker.js, selectorTesterMain must return a value (the
    //   { found, tagName?, error? } result) back to the service worker.
    //   executeScript with `files` gives no return value; `func` + `args` does.
    //   Same reasoning as adoReaderMain.  (design D-1)
    if (message.action === "TEST_SELECTOR") {
      // Guard: side panel disables the button when pageType !== "pa", but this
      // check adds defense-in-depth against rapid tab switching.  (design D-4)
      if (currentPageType !== "pa") {
        sendResponse({ found: false, error: "Not on a PA page" });
        return false; // synchronous early exit — no async work needed
      }

      (async () => {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = activeTab?.id;
          if (!tabId) {
            sendResponse({ found: false, error: "No active tab found." });
            return;
          }

          let injectionResults;
          try {
            injectionResults = await chrome.scripting.executeScript({
              target: { tabId },
              func:   selectorTesterMain,   // loaded via importScripts above
              args:   [{ mode: "pa", fieldSchemaName: message.fieldSchemaName, fieldType: message.fieldType }],
            });
          } catch (injErr) {
            console.error("[SW] TEST_SELECTOR: executeScript failed:", injErr.message);
            sendResponse({ found: false, error: injErr.message });
            return;
          }

          // InjectionResult[].result is the value selectorTesterMain returned.
          const result = injectionResults[0]?.result ?? { found: false, error: "No result from script." };
          sendResponse(result);

        } catch (err) {
          console.error("[SW] TEST_SELECTOR: unexpected error:", err);
          sendResponse({ found: false, error: err.message });
        }
      })();

      return true; // keep channel open for the async IIFE above
    }

    // ── TEST_ADO_SELECTOR ─────────────────────────────────────────────────────
    // Async: inject selectorTesterMain into the active ADO tab in "ado" mode.
    // Passes adoSelector verbatim to querySelector, highlights if found, returns
    // the result.
    //
    // Flow mirrors TEST_SELECTOR with the guard reversed to pageType === "ado".
    // (design D-4; spec §TEST_ADO_SELECTOR background message handler)
    if (message.action === "TEST_ADO_SELECTOR") {
      // Guard: must be on an ADO page.
      if (currentPageType !== "ado") {
        sendResponse({ found: false, error: "Not on an ADO page" });
        return false; // synchronous early exit
      }

      (async () => {
        try {
          const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
          const tabId = activeTab?.id;
          if (!tabId) {
            sendResponse({ found: false, error: "No active tab found." });
            return;
          }

          let injectionResults;
          try {
            injectionResults = await chrome.scripting.executeScript({
              target: { tabId },
              func:   selectorTesterMain,   // loaded via importScripts above
              args:   [{ mode: "ado", adoSelector: message.adoSelector }],
            });
          } catch (injErr) {
            console.error("[SW] TEST_ADO_SELECTOR: executeScript failed:", injErr.message);
            sendResponse({ found: false, error: injErr.message });
            return;
          }

          const result = injectionResults[0]?.result ?? { found: false, error: "No result from script." };
          sendResponse(result);

        } catch (err) {
          console.error("[SW] TEST_ADO_SELECTOR: unexpected error:", err);
          sendResponse({ found: false, error: err.message });
        }
      })();

      return true; // keep channel open for the async IIFE above
    }

    // ── GET_COPIED_DATA ───────────────────────────────────────────────────────
    // Async: read CopiedFieldData[] from session storage and return to caller.
    // Returns { data: CopiedFieldData[] } or { data: null } if nothing stored.
    // (§5.1)
    if (message.action === "GET_COPIED_DATA") {
      chrome.storage.session.get("copiedData")
        .then((result) => {
          sendResponse({ data: result.copiedData ?? null });
        })
        .catch((err) => {
          console.error("[SW] GET_COPIED_DATA: storage read failed:", err);
          sendResponse({ data: null });
        });
      return true; // keep channel open for the async storage read
    }

    // Unknown messages are ignored — return undefined (Chrome treats as false).
  });
}

// ─── Test Export ─────────────────────────────────────────────────────────────
// Allow unit tests (Vitest / Node.js) to import detectPageType without a Chrome
// runtime. The guard ensures this line is a no-op when loaded by Chrome.
if (typeof module !== "undefined") {
  module.exports = { detectPageType };
}
