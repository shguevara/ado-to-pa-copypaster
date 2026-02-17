# Proposal: Phase 4 — Storage & Settings Foundation

## Why

The side panel shell (Phase 3) is live but has nowhere to load settings from and
nowhere to save them to. Before any Admin tab CRUD (Phase 5), Copy flow (Phase 7),
or Paste flow (Phase 10) can function, the service worker must be able to seed default
`AppSettings` on first install and service `GET_SETTINGS` / `SAVE_SETTINGS` messages
from the side panel.

## What Changes

- **`background/service-worker.js`**: add a `chrome.runtime.onInstalled` handler that
  fires when `reason === "install"` and writes the default `AppSettings` object to
  `chrome.storage.local` — 2 pre-seeded `FieldMapping` entries (Title, Initiative ID)
  plus `overwriteMode: false`. Skips the write if settings are already present
  (re-installs, extension updates, or developer reloads must not clobber user data).
- Handle `GET_SETTINGS` message: read `AppSettings` from `chrome.storage.local` and
  return `{ settings: AppSettings }` to the requesting side panel.
- Handle `SAVE_SETTINGS` message: write the supplied `AppSettings` to
  `chrome.storage.local` and return `{ success: true }` (or `{ success: false, error }` on failure).
- No changes to `manifest.json`, `sidepanel/`, `scripts/`, or `lib/`.

## Capabilities

### New Capabilities

- `storage-settings`: AppSettings persistence layer in the background service worker —
  first-install default seed (2 FieldMappings, `overwriteMode: false`), `GET_SETTINGS`
  request handler, and `SAVE_SETTINGS` request handler. Defines the full AppSettings
  read/write contract that all subsequent phases depend on.

### Modified Capabilities

_(None — `tab-detection-messaging` and `extension-scaffold` specs are unaffected.)_

## Impact

**Files changed:**
- `background/service-worker.js` (add `onInstalled` handler + two message handlers)

**Files unchanged:** `manifest.json`, `sidepanel/*`, `scripts/*`, `lib/*`, `assets/*`

**Dependencies on prior phases:**
- Requires the message routing infrastructure from Phase 2 (`onMessage` switch-case)
  to be in place — it is already live.

**Unblocks:**
- Phase 5 — Admin tab CRUD (`GET_SETTINGS` on mount, `SAVE_SETTINGS` on every change)
- Phase 7 — ADO Reader / Copy flow (loads enabled mappings via `GET_SETTINGS`)
- Phase 10 — PA Writer / Paste flow (loads mappings + `overwriteMode` via `GET_SETTINGS`)
