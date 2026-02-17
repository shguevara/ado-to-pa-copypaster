# Design: Phase 4 — Storage & Settings Foundation

## Context

The background service worker currently handles three concerns: page-type detection,
tab event listeners, and the `GET_PAGE_CONTEXT` message. Phase 4 adds a fourth:
`AppSettings` persistence. The service worker is the correct home for all storage
operations — it is the single writer to `chrome.storage.local`, and the side panel
only ever interacts with storage through it via `chrome.runtime.sendMessage`.

**Constraints:**
- No build step, no bundler, no ES module syntax in the service worker (the current
  `module.exports` export for Vitest confirms it is a classic service worker).
- The `typeof chrome !== "undefined"` guard (already in place) must continue to
  protect all Chrome API calls so Vitest can import `detectPageType` from Node.js.
- Manifest.json must not change.

## Goals / Non-Goals

**Goals:**
- Seed `AppSettings` with the 2 default `FieldMapping` entries on first install.
- Provide a `GET_SETTINGS` message handler that reads and returns `AppSettings`.
- Provide a `SAVE_SETTINGS` message handler that writes `AppSettings` to storage.
- Avoid overwriting user data on extension update or developer reload.

**Non-Goals:**
- Reading or writing `chrome.storage.session` — that belongs to Phase 7 (Copy flow).
- Exposing storage to injected scripts — only the service worker touches storage.
- Unit-testing the storage handlers — manual verification is the appropriate strategy
  (same rationale as Phase 3: the Chrome storage API cannot be sensibly unit-tested
  without a heavy mock harness for 2–3 lines of logic).

## Decisions

### D-1 — Default FieldMappings defined inline in `service-worker.js`, not in a separate `defaults.js`

**Choice**: Define `DEFAULT_SETTINGS` as a module-level constant near the top of
`service-worker.js`.

**Why**: The classic service worker cannot use ES `import` statements. The only
alternative for externalising the constant would be `importScripts()`, which loads
a URL synchronously at parse time and is awkward to mock in Vitest. Keeping the
defaults inline avoids a new file, a new import mechanism, and any testability concern.
The `defaults.js` naming in SPEC.md §4.3 is an implementation suggestion, not a hard
requirement; inlining achieves the same contract.

**Alternative considered**: `importScripts('lib/defaults.js')`. Works at runtime but
complicates testing and adds no semantic value for two small objects.

---

### D-2 — `onInstalled` guard reads storage before writing; skips write if settings exist

**Choice**: In the `onInstalled` handler (reason `"install"`), read
`chrome.storage.local.get("settings")` first. Write defaults only if the result is
`undefined` or `null`.

**Why**: The spec (SPEC.md §4.3) explicitly requires skipping the write on re-install
and update. Reading before writing is the correct guard. An alternative—trusting
`reason === "install"` alone—would clobber data if the extension is uninstalled and
reinstalled by a user who had previously configured mappings (exported and re-imported
after reinstall). The read-before-write pattern is safe in all scenarios.

**Alternative considered**: Relying solely on `reason === "install"`. Simpler, but
does not protect users who reinstall the extension.

---

### D-3 — Async message handlers return `true` to keep the response channel open

**Choice**: `GET_SETTINGS` and `SAVE_SETTINGS` handlers call
`chrome.storage.local.get/set`, which are Promise-based. The listener returns `true`
for these branches so Chrome holds the `sendResponse` channel open until the storage
operation resolves.

**Why**: Chrome's `onMessage` API closes the response channel synchronously after the
listener returns, unless the listener returns `true`. This is the documented contract
for asynchronous message handlers in MV3. `GET_PAGE_CONTEXT` remains synchronous
(`return false`) because it reads a module-level variable — no async work needed.

**Pattern**:
```
onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === "GET_PAGE_CONTEXT")  { ...; return false; }
    if (message.action === "GET_SETTINGS")      { ...async...; return true; }
    if (message.action === "SAVE_SETTINGS")     { ...async...; return true; }
    // unknown — fall through, returns undefined (treated as false by Chrome)
});
```

**Alternative considered**: Wrapping the entire listener in `async`. Not supported —
Chrome ignores the returned Promise and closes the channel immediately.

---

### D-4 — `SAVE_SETTINGS` replaces the entire `AppSettings` object atomically

**Choice**: `SAVE_SETTINGS` writes `chrome.storage.local.set({ settings: message.settings })`,
replacing the full `AppSettings` value in one call.

**Why**: `AppSettings` is small (a few KB at most). Atomic replacement is simpler,
avoids partial-update bugs (e.g. `overwriteMode` updated but `mappings` stale), and
matches the export/import model where settings are always treated as a whole. Partial
patch operations would add complexity with no benefit at this data size.

---

### D-5 — `GET_SETTINGS` returns a synthesised default if storage is empty

**Choice**: If `chrome.storage.local.get("settings")` returns `undefined` (i.e.
storage is empty — possible on a first-load before `onInstalled` fires, or in a test
environment), `GET_SETTINGS` returns `DEFAULT_SETTINGS` rather than returning `null`.

**Why**: The side panel's Alpine store initialises `settings: null` and must load
real data before rendering the Admin tab. Returning `null` from `GET_SETTINGS` would
force every caller to handle a null case and write defensive code. Falling back to
`DEFAULT_SETTINGS` means the side panel always gets a valid `AppSettings` object.
The caller (Phase 5 Admin tab) does not need to distinguish between "loaded from
storage" and "synthesised default".

**Alternative considered**: Return `null` and let callers handle it. Correct but
spreads null-handling logic across Phase 5, 7, and 10.

---

## Risks / Trade-offs

**[Risk] Service worker restarts between `onInstalled` firing and the async storage
write completing**
→ Extremely unlikely: the storage write is fast (< 1 ms for a small JSON blob) and
Chrome grants the service worker a short grace period to complete work initiated in
event handlers. If it did happen, the next `GET_SETTINGS` call would still return
`DEFAULT_SETTINGS` (D-5), so the user sees defaults rather than an error. They would
also lose any mappings added before the crash, but since this is `reason === "install"`
there are no user-configured mappings to lose.

**[Risk] `SAVE_SETTINGS` response channel closed before response is delivered**
→ If the side panel is navigated or closed while a `SAVE_SETTINGS` write is in flight,
Chrome may log an error about a closed message channel. The storage write still
completes. The side panel must treat a missing response as a possible success and
re-fetch settings on next load rather than assuming failure.

**[Trade-off] No unit tests for storage handlers**
→ The logic in `GET_SETTINGS` and `SAVE_SETTINGS` is ~3 lines each. Mocking
`chrome.storage.local` in Vitest requires installing `jest-chrome` or a similar shim,
which is disproportionate to the complexity being tested. Manual verification against
Chrome DevTools is faster and provides equivalent confidence. This is consistent with
the project's testing strategy for Chrome-API-bound code (see SPEC.md §9.1).

## Open Questions

_(None — SPEC.md §4.1, §4.3 and the message contracts in §5.1 are fully defined.)_
