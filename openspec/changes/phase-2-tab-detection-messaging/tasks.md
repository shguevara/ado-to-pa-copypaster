## 1. Unit Tests — detectPageType (TDD)

- [x] 1.1 Set up Vitest test file at `tests/detect-page-type.test.js` — import/require `detectPageType` once it is exported; write test cases covering all URL scenarios from spec (ADO dev.azure.com, ADO visualstudio.com, PA powerapps.com, PA dynamics.com, unsupported, ADO non-workitems path). Tests must fail before implementation. (Ref: SPEC.md §6.1, spec tab-detection-messaging Req 1)

## 2. Core Implementation — detectPageType

- [x] 2.1 Extract `detectPageType(url)` as a named function in `background/service-worker.js`. Implement URL pattern matching per SPEC.md §6.1: ADO patterns target `/_workitems/` pathnames on `dev.azure.com` and `*.visualstudio.com`; PA patterns target `*.powerapps.com` and `*.dynamics.com`; all else returns `"unsupported"`. Export / expose the function so unit tests can import it (use a conditional export: `if (typeof module !== "undefined") module.exports = { detectPageType }` to keep it loadable as both a plain SW file and a Node test module). (Ref: SPEC.md §6.1)
- [x] 2.2 Run the unit tests from 1.1 and confirm they all pass.

## 3. Service Worker — Tab Event Listeners & Cache

- [x] 3.1 Declare a module-level `let currentPageType = "unsupported"` variable in `service-worker.js`. Add a helper `async function updatePageType(tabId)` that gets the tab's URL via `chrome.tabs.get(tabId)`, calls `detectPageType`, updates the cache, and broadcasts `{ action: "TAB_CHANGED", pageType }` via `chrome.runtime.sendMessage`. Wrap the `sendMessage` call in try/catch and swallow the "no receiver" error silently (log to `console.error`). (Ref: design.md D-3, spec tab-detection-messaging Req 2)
- [x] 3.2 Register `chrome.tabs.onActivated.addListener(({ tabId }) => updatePageType(tabId))` to handle tab switches. (Ref: SPEC.md §6.1, spec Req 2)
- [x] 3.3 Register `chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { if (tabId === <activeTabId> && (changeInfo.url || changeInfo.status === "complete")) updatePageType(tabId); })`. Determine the active tab ID by querying `chrome.tabs.query({ active: true, currentWindow: true })` or tracking it from `onActivated`. (Ref: SPEC.md §6.1, design.md D-2, spec Req 2)

## 4. Service Worker — Message Handlers

- [x] 4.1 Add a `chrome.runtime.onMessage.addListener` handler. Respond to `GET_PAGE_CONTEXT` by returning `{ pageType: currentPageType }` synchronously (return `true` only if using async response). (Ref: SPEC.md §5.1, spec tab-detection-messaging Req 3)
- [x] 4.2 Add handler for `chrome.action.onClicked`: call `chrome.sidePanel.open({ windowId: tab.windowId })` to open the side panel when the extension icon is clicked. (Ref: SPEC.md §11 Phase 2 step 4, spec Req 4)

## 5. Manual Verification

- [ ] 5.1 Reload the unpacked extension. Open Chrome DevTools → Service Worker → verify no console errors on startup.
- [ ] 5.2 Navigate to an ADO work item URL (`https://dev.azure.com/.../_workitems/edit/...`). In the service worker console, confirm `TAB_CHANGED` with `pageType: "ado"` is dispatched (add a temporary `console.log` if needed, remove after verification).
- [ ] 5.3 Navigate to a PowerApps / Dynamics URL. Confirm `pageType: "pa"` is dispatched.
- [ ] 5.4 Navigate to any other page (e.g., google.com). Confirm `pageType: "unsupported"`.
- [ ] 5.5 Click the extension action icon. Confirm the side panel opens.
- [ ] 5.6 Remove any temporary `console.log` debug statements added during verification. Keep `console.error` for genuine errors.
