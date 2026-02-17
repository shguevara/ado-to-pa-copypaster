## Why

The Copy flow (Phase 7) captures field data from ADO into `chrome.storage.session`, but there is currently no mechanism to write that data into the PowerApps form. Phase 10 closes this gap by implementing the Paste side of the extension: a DOM-manipulating injected script (`pa-writer.js`) and the service-worker orchestration + side panel UI that drives it.

## What Changes

- **New file** `scripts/pa-writer.js` — injected on-demand into PA tabs. Implements three field-write strategies (`text`, `choice/combo-select`, `lookup`) with per-field try/catch isolation (BR-002). Never submits or saves the form (BR-003).
- **New message handler** `PASTE_INITIATIVE` in `background/service-worker.js` — loads stored `copiedData` + `mappings` + `overwriteMode`, injects `pa-writer.js`, returns `{ success, results: FieldResult[] }`.
- **Side panel UI** — "Paste to PowerApps" button wired to `PASTE_INITIATIVE`. Button enabled only when `pageType === "pa" && hasCopiedData`. Spinner during in-flight operation. Per-field result list after completion.
- **Overwrite Mode badge** — read-only display in User Tab showing the current `overwriteMode` setting.

## Capabilities

### New Capabilities

- `pa-writer`: The injected PA DOM-manipulation script. Covers the three field-write strategies (`text`, `choice`, `lookup`), `simulateTyping`, `waitForElement`/`waitForElements` (MutationObserver-based), overwrite-mode skip logic (BR-001), and per-field error isolation (BR-002, BR-003).
- `paste-initiative-flow`: The end-to-end paste orchestration. Covers the `PASTE_INITIATIVE` service-worker handler, injection of `pa-writer.js` with the correct arguments, the "Paste to PowerApps" button wiring in the User Tab, per-field result rendering, spinner state, and the read-only Overwrite Mode badge.

### Modified Capabilities

_(none — existing requirement contracts for copy flow, storage, and settings remain unchanged)_

## Impact

- **New file**: `scripts/pa-writer.js`
- **Modified file**: `background/service-worker.js` — adds `PASTE_INITIATIVE` handler branch
- **Modified file**: `sidepanel/app.js` — adds paste action, paste result state, overwrite mode badge data
- **Modified file**: `sidepanel/index.html` — adds Paste button, paste result list, overwrite mode badge markup
- **No changes** to `manifest.json`, storage schema, or message contracts beyond the new `PASTE_INITIATIVE` action name
- **No new dependencies** — `pa-writer.js` is vanilla JS using native DOM APIs + MutationObserver
