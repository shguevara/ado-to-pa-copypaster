## Why

Phase 1 delivered a loadable extension skeleton with a stub service worker. Before any Copy/Paste functionality can work, the background service worker must know what kind of page the user is on and be able to communicate that to the side panel. This is the foundational plumbing that every later phase depends on.

## What Changes

- Implement `detectPageType(url)` in `background/service-worker.js` using the URL patterns from SPEC.md §6.1 to classify tabs as `"ado"`, `"pa"`, or `"unsupported"`.
- Add `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` listeners to re-evaluate page type on every tab switch and navigation; cache the result in a module-level variable.
- Push `TAB_CHANGED` messages to the side panel whenever the page type changes.
- Handle the `GET_PAGE_CONTEXT` request message — return the cached `{ pageType }` to any caller (side panel on load).
- Handle `chrome.action.onClicked` to open the side panel via `chrome.sidePanel.open({ windowId })`.

## Capabilities

### New Capabilities

- `tab-detection-messaging`: Classifies the active browser tab as `ado`, `pa`, or `unsupported` based on URL patterns, caches the result in the service worker, and broadcasts `TAB_CHANGED` push messages to the side panel on every tab switch or navigation. Also handles the `GET_PAGE_CONTEXT` pull request and `chrome.action.onClicked` to open the side panel.

### Modified Capabilities

<!-- No existing spec-level requirements are changing in this phase. -->

## Impact

- `background/service-worker.js` — primary file being implemented (replaces the Phase 1 stub).
- `manifest.json` — no changes required (all needed permissions already declared in Phase 1: `tabs`, `sidePanel`, `activeTab`).
- No other files change in this phase.
