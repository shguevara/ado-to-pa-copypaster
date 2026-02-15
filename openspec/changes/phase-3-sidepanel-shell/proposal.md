# Proposal: Phase 3 — Side Panel Shell & Navigation

## Why

The extension currently has a non-functional side panel stub (`sidepanel/index.html` renders
only a bare `<div>Hello</div>`). Before any user-facing features can be built, the reactive
UI shell must exist: Alpine.js wired up, the User/Admin tab structure rendered, and the
`pageType` state kept in sync with the background service worker so subsequent phases have a
live, testable UI foundation to build on.

## What Changes

- **Place Alpine.js v3 locally** (`lib/alpine.min.js`) — required by MV3 CSP; no CDN allowed.
- **Rebuild `sidepanel/index.html`** — tab bar (User / Admin), two tab panels toggled with
  `x-show`, all bound to the Alpine store.
- **Create `sidepanel/app.js`** — registers `Alpine.store("app", { ... })` with the full
  store shape defined in SPEC.md §7.4; sends `GET_PAGE_CONTEXT` on Alpine init to hydrate
  `pageType`; registers a `chrome.runtime.onMessage` listener to handle `TAB_CHANGED` push
  notifications from the background service worker.
- **Create `sidepanel/styles.css`** — tab bar layout, active-tab indicator, basic content
  area sizing, and placeholder rules for the status indicators that will be filled in by
  later phases.
- No changes to `manifest.json`, `background/service-worker.js`, or any injected script.

## Capabilities

### New Capabilities

- `sidepanel-shell`: The reactive side panel UI shell — Alpine.js store, tab navigation
  (User / Admin), page-context banner driven by live `pageType` state, and the full Alpine
  store shape that all future phases extend.

### Modified Capabilities

_(None — no existing spec-level requirements are changing.)_

## Impact

**Files created / replaced:**
- `lib/alpine.min.js` (new — downloaded from Alpine.js v3 GitHub release)
- `sidepanel/index.html` (replaces stub)
- `sidepanel/app.js` (new)
- `sidepanel/styles.css` (new)

**Files unchanged:** `manifest.json`, `background/service-worker.js`, all `scripts/`,
`lib/selector-generator.js`, `assets/`.

**Dependencies on prior phases:**
- Requires the `TAB_CHANGED` push and `GET_PAGE_CONTEXT` handler from Phase 2
  (`tab-detection-messaging`) to be in place — both are already live.

**No breaking changes.** The side panel currently shows a stub; this phase replaces it
with a functional shell while keeping all existing message contracts intact.
