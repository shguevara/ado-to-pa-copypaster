## Why

The extension can already manage field mappings (Phase 5) and export/import them (Phase 6), but it cannot yet read any data from Azure DevOps. Phase 7 delivers the ADO reading half of the copy/paste workflow: an injected reader script that harvests field values from the ADO work item DOM, plus the service worker message handler and User Tab UI that wire everything together so the user can press "Copy Initiative" and see per-field results.

## What Changes

- Add `scripts/ado-reader.js` — new injectable script that accepts a `mappings` array, iterates enabled fields, reads DOM values via CSS selector (or extracts the work item ID from the URL for the `__URL_ID__` sentinel), strips HTML, and returns a `FieldResult[]`. Each field is wrapped in a per-field `try/catch` (BR-002).
- Add `COPY_INITIATIVE` handler in `service-worker.js` — verifies `pageType === "ado"`, loads settings, filters enabled mappings, injects `ado-reader.js` via `chrome.scripting.executeScript`, converts results to `CopiedFieldData[]`, writes to `chrome.storage.session`, returns `{ success, results }`.
- Add `GET_COPIED_DATA` handler in `service-worker.js` — reads `CopiedFieldData[]` from `chrome.storage.session` and returns it to the caller.
- Update `sidepanel/app.js` — wire "Copy Initiative" button to send `COPY_INITIATIVE`, show spinner during operation, display per-field status list with green/yellow/red indicators on completion.

## Capabilities

### New Capabilities
- `ado-reader`: The injectable ADO reader script (`ado-reader.js`) — selector-driven DOM traversal, `__URL_ID__` sentinel handling, HTML stripping, per-field error isolation, `FieldResult[]` return contract.
- `copy-initiative-flow`: End-to-end copy flow — `COPY_INITIATIVE` and `GET_COPIED_DATA` service worker message handlers, `chrome.storage.session` write/read, and User Tab UI (button wiring, spinner, per-field status indicators).

### Modified Capabilities
_(none — no existing spec-level requirements are changing)_

## Impact

- **New files**: `scripts/ado-reader.js`
- **Modified files**: `background/service-worker.js`, `sidepanel/app.js`
- **Storage**: `chrome.storage.session` — written for the first time (key: `copiedData`, shape: `CopiedFieldData[]`); no schema change to `chrome.storage.local`.
- **Messages added**: `COPY_INITIATIVE` (side panel → SW), `GET_COPIED_DATA` (side panel → SW); no existing message contracts change.
- **Permissions**: No new permissions required — `scripting` and `storage` are already declared; `chrome.storage.session` requires no additional permission.
- **Tests**: New Vitest unit tests for `ado-reader.js` pure logic (selector matching, `__URL_ID__` extraction, HTML stripping, error isolation) and service worker message handler helpers.
