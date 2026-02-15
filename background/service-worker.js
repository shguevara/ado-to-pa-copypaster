/**
 * Background Service Worker — Phase 2: Tab Detection & Messaging
 *
 * Responsibilities:
 *   1. Classify the active tab as "ado", "pa", or "unsupported" based on its URL.
 *   2. Cache the current page type in a module-level variable.
 *   3. Broadcast TAB_CHANGED to the side panel whenever the page type changes.
 *   4. Respond to GET_PAGE_CONTEXT pull requests from the side panel.
 *   5. Open the side panel when the extension action icon is clicked.
 *
 * Architecture note: The service worker is ephemeral in MV3 — it can terminate
 * between events. Page type does NOT need to survive termination because it can
 * always be reconstructed from the current tab's URL on the next event.
 * Persistent data (settings, copied ADO data) will use chrome.storage in Phase 4+.
 */

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
      adoSelector: "input[aria-label='Title'], textarea[aria-label='Title']",
      paSelector:  "",
      fieldType:   "text",
      enabled:     true,
    },
    {
      id:          "default-id",
      label:       "Initiative ID",
      adoSelector: "__URL_ID__",
      paSelector:  "",
      fieldType:   "text",
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

    // Unknown messages are ignored — return undefined (Chrome treats as false).
  });
}

// ─── Test Export ─────────────────────────────────────────────────────────────
// Allow unit tests (Vitest / Node.js) to import detectPageType without a Chrome
// runtime. The guard ensures this line is a no-op when loaded by Chrome.
if (typeof module !== "undefined") {
  module.exports = { detectPageType };
}
