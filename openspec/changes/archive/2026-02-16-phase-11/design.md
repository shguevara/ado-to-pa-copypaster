## Context

Phase 10 delivered the full Paste-to-PowerApps flow. The User Tab now has Copy and Paste buttons and shows two separate result lists — one after Copy, one after Paste. Both lists are hidden until the corresponding operation completes, which means the User Tab shows no field information until the user acts.

SPEC.md v1.4 replaces this design with a unified field state model that is **always visible**: as soon as the panel opens, every enabled mapping is shown as a row with a `NOT COPIED` badge. Rows advance through states (`COPIED`, `FAILED`, `PASTED`, `SKIPPED`) as Copy and Paste operations complete. A Clear button resets all rows back to `NOT COPIED`.

This phase also updates the context banner colours to match the brand palette (ADO blue, PA purple, Unsupported grey) and applies the button styling spec (height 48 px, font-size 12 px, specific hex colours per button).

Files affected: `sidepanel/app.js`, `sidepanel/index.html`, `sidepanel/styles.css`, `background/service-worker.js`.
No changes to `manifest.json`, injected scripts, or storage schema keys.

---

## Goals / Non-Goals

**Goals:**
- Replace the two separate post-operation result lists with a single always-visible field list driven by `FieldUIState`.
- Populate field states correctly at panel open time by reading `chrome.storage.session` during `alpine:init`.
- Persist ALL copy outcomes (including errors) in session storage so field states survive tab switches.
- Add a Clear button and `CLEAR_COPIED_DATA` service-worker handler.
- Update banner colours and button styling per §7.2 of SPEC.md v1.4.
- Add unit tests for `deriveFieldUIStates()` and `computeIsClearDisabled()`.

**Non-Goals:**
- No changes to paste strategy logic (`pa-writer.js`), ADO reader (`ado-reader.js`), or any injected scripts.
- No changes to `manifest.json`, permissions, or storage key names.
- No Admin Tab changes.

---

## Decisions

### D-1 — `deriveFieldUIStates()` as a pure module-level function

**Decision**: Extract `deriveFieldUIStates(enabledMappings, copiedData, lastPasteResults, lastOperation)` as a standalone pure function at module scope, with `module.exports` at the bottom for Vitest import. The Alpine store method `deriveFieldUIStates()` delegates to it.

**Why**: All complex logic in `app.js` that needs unit testing follows this pattern (`validateImportData`, `computeIsPasteDisabled`, `_runPasteInitiative`). Functions inside `Alpine.store(...)` closures cannot be imported by Node.js/Vitest because the closure is only created at browser runtime inside the `alpine:init` event. Keeping the function at module scope makes it importable and testable without any mocking of Alpine or Chrome APIs.

**Alternative considered**: Test through integration (Playwright). Rejected — the derivation logic has enough branching (6 states × 3 conditions × null guards) that a unit test suite covering every branch is far faster and more reliable than Playwright browser tests.

---

### D-2 — Load `GET_COPIED_DATA` during `alpine:init`

**Decision**: Add a third `sendMessage` call during `alpine:init` to fetch `copiedData` from `chrome.storage.session`. `deriveFieldUIStates()` is called only after BOTH `GET_SETTINGS` and `GET_COPIED_DATA` resolve.

**Why**: When the user reopens the side panel after a Copy operation (without closing the browser), `copiedData` is still in session storage. Without loading it at init, all rows would briefly show `NOT COPIED` even though data exists, then potentially never update to `COPIED`. The `GET_SETTINGS` call already exists; adding `GET_COPIED_DATA` alongside it is the natural extension of the same init pattern.

**Coordination strategy**: Use a simple counter — increment once per resolved callback, and call `deriveFieldUIStates()` only when the counter reaches 2. This avoids Promise.all (unavailable as a one-liner in the CSP environment) and avoids nesting one callback inside the other (makes ordering implicit).

**Alternative considered**: Sequential chaining — call `GET_COPIED_DATA` inside the `GET_SETTINGS` callback. Rejected — adds 1 extra RTT latency for no correctness benefit. Parallel calls are simpler and faster.

---

### D-3 — `TAB_CHANGED` re-fetches `GET_COPIED_DATA` before re-deriving

**Decision**: In the `TAB_CHANGED` message handler, after updating `store.pageType`, send `GET_COPIED_DATA` and call `deriveFieldUIStates()` in the callback with the freshly fetched data.

**Why**: `lastPasteResults` is in-memory only (not persisted). After a tab switch, `lastPasteResults` is still in the store if the user comes back to the same panel session. The re-derive after `TAB_CHANGED` intentionally uses the in-memory `lastPasteResults` if it exists and `lastOperation === "paste"`, so paste states survive tab switches within the same panel session. Only copy states come from session storage. The spec explicitly states: _"paste results are not persisted; only copy states survive tab switches"_ (§9 deriveFieldUIStates call #5).

---

### D-4 — Remove `fieldResults`, `pasteResults`; add `fieldUIStates`, `enabledMappings`, `lastPasteResults`

**Decision**: Remove the old `fieldResults: []` and `pasteResults: []` store properties and their associated helper methods (`hasCopyResults()`, `hasPasteResults()`). Replace with `fieldUIStates: []`, `enabledMappings: []`, and `lastPasteResults: null`. Remove the helper methods `computeHasPasteResults` (no longer needed). Remove their `module.exports` entries.

**Why**: The old model exposed two separate temporal slices of the same data. The new model unifies them. Keeping the old properties alongside the new ones would duplicate state and create consistency bugs (e.g. `fieldResults` showing stale data while `fieldUIStates` is already updated).

**Migration impact on tests**: `computeHasPasteResults` tests must be deleted. `_runPasteInitiative` still exists but its post-call effects change — it now sets `lastPasteResults` (not `pasteResults`) and calls `deriveFieldUIStates()` on the store instead of setting `pasteResults` directly. The test for `_runPasteInitiative` must be updated accordingly.

---

### D-5 — `_runPasteInitiative` and `copyInitiative` update `fieldUIStates` via store method call

**Decision**: After `COPY_INITIATIVE` completes, `copyInitiative()` calls `this.updateAfterCopy(results)` — a store method that stores `copiedData` from the results, updates `hasCopiedData`, and calls `deriveFieldUIStates()`. After `PASTE_INITIATIVE` completes, `_runPasteInitiative` calls `state.updateAfterPaste(results)`.

**Why**: Both functions run async code that touches multiple store properties. Grouping the state updates into named store methods (`updateAfterCopy`, `updateAfterPaste`) keeps `_runPasteInitiative` testable (it only needs a mock `state` with the method), avoids duplicating the `deriveFieldUIStates` call site, and names the operation semantically.

**Alternative considered**: Inline all state updates in `copyInitiative()` and `_runPasteInitiative()`. Rejected — `_runPasteInitiative` is a module-level function that already receives `state` as a mock-friendly parameter. Adding more direct state mutations to it would force test mocks to match a wider store shape.

---

### D-6 — Copy flow: store ALL outcomes in session storage (including errors)

**Decision**: Update the `COPY_INITIATIVE` handler in `service-worker.js` to persist ALL `FieldResult` entries (including `status === "error"`) as `CopiedFieldData` to `chrome.storage.session`.

**Current behaviour**: Only `success` and `blank` results are converted and stored. `error` results are returned in `FieldResult[]` but not persisted.

**New behaviour**: All results are converted. `error` entries are stored with `value: ""` and `readMessage: result.message`. This enables the side panel to display `FAILED` badges (with error messages) for fields that could not be read, without re-running Copy.

**Why now**: Previously, `error` results were only shown transiently in the `fieldResults` list. Under the new model, field states must survive tab switches — so the error outcomes must be in session storage.

---

### D-7 — CSS-only changes for banners and buttons

**Decision**: Update banner and button styles in `sidepanel/styles.css` only. No JavaScript changes.

**Banner changes**:
- PA banner: dot and text colour changes from green (#22c55e / old) to purple (`#7B1FA2`); background `#F3E5F5`; border `#CE93D8`.
- Unsupported banner: background `#FFFFFF`; border `#E0E0E0`; dot `#9CA3AF`; text `#616161`. Banner text changes to `"This page is not supported."` (shorter, per SPEC §7.2).

**Button changes**:
- All buttons in the action row: `height: 48px; font-size: 12px`.
- Copy button: `background: #0078D4` (unchanged).
- Paste button: `background: #742774`.
- Clear button: new style — background `#F3F4F6`, text `#374151`.
- Disabled: `background: #CCCCCC; color: #888888; cursor: not-allowed`.

**Clear button HTML**: New `<button>` in the action-buttons row. Disabled when `!hasCopiedData`. Calls `$store.app.clearCopiedData()` on click.

---

## Risks / Trade-offs

**[Risk] Init race: `GET_SETTINGS` returns before `GET_COPIED_DATA`**
→ Mitigation: counter-based coordination (Decision D-2). `deriveFieldUIStates()` not called until both callbacks fire. If either callback errors, the store initialises safely with its defaults (`enabledMappings: []` from null settings, `copiedData: null` meaning all rows show `NOT COPIED`).

**[Risk] Test suite breakage from removing `fieldResults`, `pasteResults`, `computeHasPasteResults`**
→ Mitigation: explicitly delete the tests for `computeHasPasteResults`; update `_runPasteInitiative` tests to match new state shape; add tests for `deriveFieldUIStates` and `computeIsClearDisabled` before touching the implementation.

**[Risk] `hasCopiedData` semantic change**
→ Currently set to `true` after Copy when `some(r => r.status !== "error")`. Under the new model it must also be `true` when `copiedData` is loaded from session at init (if the array is non-empty and contains at least one non-error entry). `hasCopiedData` derivation must be consistent in both paths. Mitigation: centralise the logic in a `computeHasCopiedData(copiedData)` pure function.

**[Risk] PA banner currently shows green dot (🟢 hardcoded emoji). SPEC v1.4 requires a CSS-rendered dot.**
→ The emoji dot approach is incompatible with the new spec (the dot must be a styled `<span>` with `background-color`). Mitigation: replace the emoji `<span>` with a `<span class="context-dot">` element styled via CSS in all three banner rows. This is a clean HTML + CSS change with no JS impact.

---

## Migration Plan

1. Write failing unit tests for `deriveFieldUIStates()` and `computeIsClearDisabled()`.
2. Update `service-worker.js`: extend `COPY_INITIATIVE` handler to store all copy outcomes; add `CLEAR_COPIED_DATA` handler.
3. Update `sidepanel/app.js`:
   - Add `deriveFieldUIStates()` pure function + `computeHasCopiedData()` pure function at module scope.
   - Replace `fieldResults`, `pasteResults` with `fieldUIStates`, `enabledMappings`, `lastPasteResults` in store shape.
   - Add `clearCopiedData()`, `updateAfterCopy()`, `updateAfterPaste()` store methods.
   - Update `copyInitiative()` and `_runPasteInitiative()` to use new state shape.
   - Add `GET_COPIED_DATA` call in `alpine:init` with counter-based coordination.
   - Update `TAB_CHANGED` handler to re-fetch `GET_COPIED_DATA`.
   - Remove `hasCopyResults()`, `hasPasteResults()`, `computeHasPasteResults`. Remove from `module.exports`.
4. Update `sidepanel/index.html`:
   - Rebuild field list section to use `fieldUIStates` (always visible, x-for, per-row state classes).
   - Replace banner dot emojis with CSS `<span class="context-dot">` elements; update banner text.
   - Add Clear button to action-buttons row.
   - Remove old two-list structure.
5. Update `sidepanel/styles.css`: banner colour tokens, button height/colour, field row badge styles, dot element styles.
6. Run full test suite — confirm all existing tests pass, new tests pass.

**Rollback**: All changes are in `sidepanel/` and `background/`. No schema changes, no manifest changes. Reverting any file to its Phase 10 state restores the previous behaviour.

---

## Open Questions

_None. SPEC.md v1.4 §7.2 fully specifies all state transitions, badge styles, and derivation logic. All technical decisions above are consistent with existing codebase patterns._
