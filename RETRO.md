# Retrospective — Phase 4: Storage & Settings Foundation

**Date**: 2026-02-15
**Commits**: `4859914` (impl) → `f622d19` (fix) → `d7a5c1d` (done)

---

## What went wrong

Two issues required correction after the initial implementation.
Both were caught during manual verification (tasks 5.1–5.4).

---

### Bug 1 — `onInstalled` reason filter blocked seeding on developer reload

**Symptom**: After clearing `"settings"` from `chrome.storage.local` and reloading
the extension via the Reload button at `chrome://extensions`, the `"settings"` key
remained absent from storage. Task 5.1 produced an empty storage view.

**Root cause**: The initial implementation guarded the seed with
`if (reason !== "install") return;`. Chrome fires `onInstalled` with
`reason === "update"` — not `"install"` — when you click the Reload button on an
unpacked extension. The design document (D-2) noted that `reason === "install"` was
the expected value but acknowledged Chrome's behaviour may differ. The spec's own
scenario ("Developer reload does not overwrite existing settings") was written to
cover the *non-empty storage* case; the *empty storage after manual clear* case was
not explicitly considered.

**Fix**: Removed the reason check entirely. The read-before-write storage guard
(`result.settings == null`) is the only protection needed and handles all scenarios
correctly:
- Storage empty → write defaults (first install, post-clear reload)
- Storage has data → skip (normal update, reload with existing data, reinstall)

**Action**: Do not filter `onInstalled` by reason when the intent is "seed if empty".
The reason only matters if you want different behaviour per event type (e.g. a
migration on update). For a simple "write defaults if absent" pattern, read storage
first and let the data be the guard — not the event metadata.

---

### Bug 2 — Task 5.3/5.4 instructions directed to the wrong console

**Symptom**: Running `chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, console.log)`
from the service worker's DevTools console returned `undefined` — no response arrived
— even though `chrome.storage.local` clearly held the correct `"settings"` value.

**Root cause**: Chrome does not route `chrome.runtime.sendMessage` back to the context
that sent the message. The service worker's `onMessage` listener never fires for a
message originating in the same context. The task description said "Open the service
worker's DevTools console" — which causes a self-send that the SW ignores — rather
than using a different extension context as the sender.

**Fix**: Ran the same commands from the **side panel's** DevTools console
(right-click inside the side panel → Inspect). Messages sent from the side panel
travel to the service worker over the normal inter-context channel, the `onMessage`
listener fires, and the response arrives correctly.

**Action**: When manually testing service worker message handlers, always send from
a separate extension context (side panel, popup, options page). The service worker
console is useful for inspecting state and calling Chrome APIs directly, but it is
the wrong sender for testing `onMessage` handlers.

---

## Summary table

| # | What went wrong | Root cause | Fix | Action going forward |
|---|---|---|---|---|
| 1 | Storage not seeded after clear + reload | `reason === "update"` on developer reload skipped the guard | Remove reason filter; rely solely on `result.settings == null` | For "seed if absent" patterns, use storage state as the guard — not `onInstalled` reason |
| 2 | `GET_SETTINGS` returned `undefined` from SW console | Chrome does not route `sendMessage` back to the sender context | Run test commands from side panel console instead | Always test `onMessage` handlers by sending from a different extension context |

---

# Retrospective — Phase 3: Side Panel Shell & Navigation

**Date**: 2026-02-15
**Commits**: `9348151` (impl) → `8e4d51f` → `733e757` → `9ff82c9` (fixes) → `5bba8c4` (done)

---

## What went wrong

Three bugs required fix commits after the initial implementation.
All three were caught during manual verification (tasks 5.1–5.4).

---

### Bug 1 — Missing `x-data` on the root element

**Symptom**: All tab panels and all three banner rows were visible simultaneously.
Clicking tabs did nothing. No console errors.

**Root cause**: Alpine.js does not process any directive (`x-show`, `@click`, `:class`)
unless the element is inside a component scope declared with `x-data`. Without it,
Alpine silently ignores the entire DOM.

**Fix**: Added `x-data` to `<div id="app">`.

**Action**: When scaffolding any Alpine.js UI, the very first thing to verify is that
a root `x-data` element wraps all directive-bearing HTML. Add it in the same commit
as the first directive — never defer it.

---

### Bug 2 — Standard Alpine.js build blocked by Chrome MV3 CSP

**Symptom**: `Uncaught EvalError: Evaluating a string as JavaScript violates the
following Content Security Policy directive because 'unsafe-eval' is not an allowed
source of script.`

**Root cause**: The standard Alpine.js build evaluates inline expressions
(`@click="..."`, `:class="{...}"`) by constructing a `new AsyncFunction(expression)`
at runtime. Chrome MV3's default Content Security Policy blocks `unsafe-eval`, which
covers both `eval()` and `new Function()` / `new AsyncFunction()`.

The design document noted this constraint correctly ("MV3 CSP forbids `unsafe-eval`;
Alpine.js v3 must be used") but drew the wrong conclusion — Alpine v3 still uses
`new AsyncFunction` in its standard build. The CSP-safe build is a **separate package**:
`@alpinejs/csp`.

**Fix**: Replaced `lib/alpine.min.js` with the `@alpinejs/csp@3.15.8` build downloaded
from jsDelivr.

**Action**: For any Chrome extension project using Alpine.js, always download
`@alpinejs/csp`, never the standard build. Document this explicitly in SPEC.md and
the README. The library filename (`alpine.min.js`) is deceptive — add "CSP build" to
the version comment so it is obvious which build is in use.

---

### Bug 3 — Property assignment through `$store` is silently dropped in the CSP build

**Symptom**: After fixing Bug 2, the page context banner worked but clicking the
Admin tab did nothing — the User tab stayed active.

**Root cause**: The Alpine CSP build replaces `new AsyncFunction` with a custom
expression parser. This parser handles **reads** through magic property chains
(`$store.app.activeTab === 'user'` ✅) but **silently drops assignments** through them
(`$store.app.activeTab = 'admin'` ❌). No error is thrown; the expression evaluates
to the right-hand side value and the assignment is lost.

The banner appeared to work because `pageType` was being set from JavaScript code
(`Alpine.store("app").pageType = ...` in `app.js`), not from a directive expression
— so that code path never hit the parser limitation.

**Fix**: Added a `setTab(tab)` method to the store. Method calls are fully supported
by the CSP parser. `@click="$store.app.setTab('admin')"` works correctly.

**Action**: When using the Alpine CSP build, **never write to `$store` properties
from directive expressions**. Instead, expose store methods for all mutations and
call them from event handlers. This is a hard rule, not a preference. Apply it to
all future phases whenever a directive needs to update store state.

---

## Summary table

| # | What went wrong | Root cause | Fix | Action going forward |
|---|---|---|---|---|
| 1 | All Alpine directives inert | No `x-data` on root element | `<div id="app" x-data>` | Always add `x-data` to the root wrapper in the same commit as the first directive |
| 2 | `EvalError` on load | Standard Alpine uses `new AsyncFunction`, blocked by MV3 CSP | Replace with `@alpinejs/csp` build | Always use `@alpinejs/csp` in Chrome extensions; document it in SPEC.md and README |
| 3 | Tab clicks silently ignored | CSP build drops `$store.x = y` assignments in directive expressions | Use `setTab()` store method | Never assign to `$store` properties from directives; always expose mutation methods on the store |
