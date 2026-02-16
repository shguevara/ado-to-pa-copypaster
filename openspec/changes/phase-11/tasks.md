# Phase 11 — User Tab UI Overhaul: Tasks

## 1. Failing Unit Tests (TDD — write before implementation)

- [x] 1.1 Write unit tests for `deriveFieldUIStates()` covering all 6 state paths: `not_copied` (null copiedData), `copied` (success), `copied` (blank → empty value), `copy_failed` (error), `pasted`, `paste_failed` (error + warning), `skipped`. Confirm tests fail before implementation. (§7.2 Field State Derivation Logic; spec: user-tab-field-states §Requirement: FieldUIState entity)

- [x] 1.2 Write unit test for `computeHasCopiedData(copiedData)`: returns `false` for `null`, `false` for all-error array, `true` for array with at least one non-error entry. (design D-3 risk: hasCopiedData semantic change)

- [x] 1.3 Write unit test for `computeIsClearDisabled(hasCopiedData)`: returns `true` when `hasCopiedData` is `false`, returns `false` when `true`. (spec: user-tab-field-states §Requirement: Clear button)

- [x] 1.4 Update existing `_runPasteInitiative` unit tests: rename `state.pasteResults` references to `state.lastPasteResults`; expect `state.updateAfterPaste(results)` to be called rather than direct `state.pasteResults` mutation. (design D-4, D-5)

- [x] 1.5 Delete the `computeHasPasteResults` unit tests (function is being removed). Confirm no other test relies on it. (design D-4)

- [x] 1.6 Update the `COPY_INITIATIVE` service-worker unit test: change the "Error fields are excluded from session storage" assertion to assert that error entries ARE written to session storage with `readStatus: "error"`, `value: ""`, and `readMessage` set. (spec: copy-initiative-flow §MODIFIED COPY_INITIATIVE; §6.2 step 7)

## 2. Service Worker Changes (background/service-worker.js)

- [x] 2.1 Update `COPY_INITIATIVE` handler step 7: convert ALL `FieldResult` entries to `CopiedFieldData[]`, including `status: "error"` entries. Error entries: `value: ""`, `readMessage: result.message ?? ""`. Remove the previous filter that excluded errors. (§6.2 step 7; spec: copy-initiative-flow §MODIFIED COPY_INITIATIVE)

- [x] 2.2 Add `CLEAR_COPIED_DATA` handler: writes `{ copiedData: null }` to `chrome.storage.session` and returns `{ success: true }` on success or `{ success: false, error: message }` on failure. Wire into the `switch`/`if` message router alongside existing handlers. (§5.1; spec: copy-initiative-flow §ADDED CLEAR_COPIED_DATA)

## 3. Pure Functions — Module Scope (sidepanel/app.js)

- [x] 3.1 Implement `deriveFieldUIStates(enabledMappings, copiedData, lastPasteResults, lastOperation)` as a pure module-scope function. Logic: one `FieldUIState` entry per enabled mapping, following the derivation rules from SPEC.md §7.2 Field State Derivation Logic. Export via `module.exports` guard. (design D-1; spec: user-tab-field-states)

- [x] 3.2 Implement `computeHasCopiedData(copiedData)` as a pure module-scope function. Returns `true` when `copiedData` is a non-empty array and contains at least one entry where `readStatus !== "error"`. Export via `module.exports` guard. (design risk: hasCopiedData semantic change)

- [x] 3.3 Implement `computeIsClearDisabled(hasCopiedData)` as a pure module-scope function. Returns `!hasCopiedData`. Export via `module.exports` guard. (spec: user-tab-field-states §Requirement: Clear button)

- [x] 3.4 Remove `computeHasPasteResults` from module scope and from `module.exports`. Verify no remaining references in `app.js` or tests. (design D-4)

## 4. Alpine Store Shape Migration (sidepanel/app.js)

- [x] 4.1 Update the `Alpine.store('app', { ... })` initial shape: remove `fieldResults: []`; add `enabledMappings: []`, `fieldUIStates: []`, `lastPasteResults: null`. Remove `pasteResults: []` (added in Phase 10 code but not persisted). (§7.4; spec: sidepanel-shell §MODIFIED store shape)

- [x] 4.2 Remove `hasCopyResults()` and `hasPasteResults()` store methods (superseded by always-visible `fieldUIStates`). Remove `computeHasPasteResults` import from `module.exports`. (design D-4)

- [x] 4.3 Add `updateEnabledMappings()` store method: derives `this.enabledMappings` from `(this.settings?.mappings ?? []).filter(m => m.enabled)`. Call it at the end of every method that modifies `this.settings` (`saveMapping`, `deleteMapping`, `toggleEnabled`, `setOverwriteMode`, `importMappings`). (§7.2 Fields Section "re-derived on every settings change")

- [x] 4.4 Add `updateAfterCopy(fieldResults)` store method: (a) convert `fieldResults` to `CopiedFieldData[]` using `computeHasCopiedData`; (b) set `this.hasCopiedData`; (c) set `this.lastOperation = "copy"`; (d) call `this.fieldUIStates = deriveFieldUIStates(this.enabledMappings, copiedData, null, "copy")`. Call this from `copyInitiative()` instead of the current direct property mutations. (design D-5; §7.4 `deriveFieldUIStates()`)

- [x] 4.5 Add `updateAfterPaste(pasteResults)` store method: (a) set `this.lastPasteResults = pasteResults`; (b) set `this.lastOperation = "paste"`; (c) call `this.fieldUIStates = deriveFieldUIStates(this.enabledMappings, <currentCopiedData>, pasteResults, "paste")`. Call this from `_runPasteInitiative()` via `state.updateAfterPaste(results)`. (design D-5)

- [x] 4.6 Add `clearCopiedData()` store method: (a) send `CLEAR_COPIED_DATA` to SW; (b) on success: set `this.hasCopiedData = false`, `this.lastOperation = null`, `this.lastPasteResults = null`; (c) call `this.fieldUIStates = deriveFieldUIStates(this.enabledMappings, null, null, null)`. (§5.1; spec: user-tab-field-states §Requirement: Clear button)

- [x] 4.7 Add `isClearDisabled()` store method: delegates to `computeIsClearDisabled(this.hasCopiedData)`. Required because Alpine CSP prohibits `!` operator in directive expressions. (SPEC.md §3.2 CSP constraint)

- [x] 4.8 Update `copyInitiative()`: replace direct `this.fieldResults = ...`, `this.hasCopiedData = ...` mutations with a call to `this.updateAfterCopy(response.results ?? [])`. Keep `this.copyStatus` transitions unchanged. (design D-5)

- [x] 4.9 Update `_runPasteInitiative(state, chromeRuntime)`: replace `state.pasteResults = ...` with `state.updateAfterPaste(response.results ?? [])`. Keep `state.pasteStatus` transitions unchanged. Ensure the error-sentinel path also calls `state.updateAfterPaste([errorEntry])`. (design D-5)

## 5. Init Hydration and TAB_CHANGED (sidepanel/app.js)

- [x] 5.1 Add `GET_COPIED_DATA` `sendMessage` call inside `alpine:init`, immediately after the `GET_SETTINGS` call. Use a two-counter coordination pattern: declare `let initCount = 0` in the `alpine:init` closure; each callback increments the counter and calls `deriveAndApplyFieldStates()` only when `initCount === 2`. (design D-2; spec: user-tab-field-states §copiedData loaded on init)

- [x] 5.2 In the `GET_SETTINGS` callback (inside `alpine:init`), add a call to `store.updateEnabledMappings()` after `store.settings = response.settings` so `enabledMappings` is always in sync before `deriveFieldUIStates` is first called. (§7.2 Fields Section "populated on mount from AppSettings.mappings.filter(m => m.enabled)")

- [x] 5.3 Update the `TAB_CHANGED` `onMessage` handler: after updating `store.pageType`, send `GET_COPIED_DATA` and call `store.fieldUIStates = deriveFieldUIStates(store.enabledMappings, data, store.lastPasteResults, store.lastOperation)` in the callback, using the freshly fetched `copiedData`. (design D-3; spec: user-tab-field-states §Field states re-derived after TAB_CHANGED)

## 6. User Tab HTML (sidepanel/index.html)

- [x] 6.1 Remove the two existing result `<ul>` elements (hasCopyResults block and hasPasteResults block) and their surrounding `<div class="field-results">` wrapper. (design D-4; spec: copy-initiative-flow §REMOVED Per-field status list)

- [x] 6.2 Add the always-visible Fields section below the Overwrite Mode badge. Include: a `"FIELDS"` section label (`x-show` when `fieldUIStates.length > 0`) and a `<ul>` with `x-for="state in $store.app.fieldUIStates" :key="state.fieldId"`. (§7.2 Fields Section; spec: user-tab-field-states §Always-visible field list)

- [x] 6.3 Implement each field row `<li>` with: icon `<span>` (aria-label per state), label `<span>`, badge `<span>` (class bound per state using `getFieldBadgeClass(state)` store method — required for CSP), and conditional secondary-line `<span>` for value/message. Bind state-specific CSS classes via store helper methods to keep directive expressions CSP-safe. (§7.2 Field Row Structure + Field State Reference; SPEC.md §3.2)

- [x] 6.4 Add store helper methods to `app.js` for field row rendering — CSP requires all multi-branch logic in JS: `getFieldIcon(state)`, `getFieldBadgeText(state)`, `getFieldBadgeClass(state)`, `getFieldSecondaryText(state)`, `showFieldSecondary(state)`. Each takes a `FieldUIState` object. (SPEC.md §3.2 CSP constraint)

- [x] 6.5 Add the Clear button to the action-buttons row between Copy and Paste. Wire: `@click="$store.app.clearCopiedData()"`, `:disabled="$store.app.isClearDisabled()"`. Style class: `btn btn--clear`. (§7.2 Action Buttons Row; spec: user-tab-field-states §Clear button)

- [x] 6.6 Update the three context banner rows: replace emoji `<span>` dot elements with `<span class="context-dot" aria-hidden="true"></span>` (no text content — colour is CSS only). Update label text to short form: ADO → `"Azure DevOps"`, PA → `"PowerApps"`, Unsupported → `"This page is not supported."`. (§7.2 Context Banner; spec: sidepanel-shell §MODIFIED banner; design D-7)

## 7. CSS (sidepanel/styles.css)

- [x] 7.1 Add `.context-dot` base style: `display: inline-block; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0`. Add per-banner overrides: `.context-banner__row--ado .context-dot { background-color: #1565C0 }`, `--pa` → `#7B1FA2`, `--unsupported` → `#9CA3AF`. (§7.2 Context Banner; spec: sidepanel-shell §MODIFIED banner)

- [x] 7.2 Update banner row background/border/text colours for all three variants. ADO: bg `#E3F2FD`, border `#90CAF9`, text `#1565C0`. PA: bg `#F3E5F5`, border `#CE93D8`, text `#7B1FA2`. Unsupported: bg `#FFFFFF`, border `#E0E0E0`, text `#616161`. (§7.2 Context Banner)

- [x] 7.3 Update action buttons in the User Tab: add `height: 48px; font-size: 12px` to `.action-buttons .btn`. Override Paste button: `background: #742774`. Add Clear button: `.btn--clear { background: #F3F4F6; color: #374151 }`. Disabled override applies to all: `background: #CCCCCC; color: #888888; cursor: not-allowed`. (§7.2 Action Buttons Row; spec: sidepanel-shell §ADDED button styling)

- [x] 7.4 Add field section layout styles: `.field-section` (wrapper), `.field-section__label` (uppercase label, font-size 11px, color #9CA3AF), `.field-row` (flex row, min-height ~40px, padding, border-bottom), `.field-row__icon` (24px fixed width), `.field-row__label` (font-size 13px, font-weight 500), `.field-row__badge` (right-aligned, font-size 10px, border-radius 4px, padding 2px 6px), `.field-row__secondary` (font-size 12px, full-row second line). (§7.2 Field Row Structure)

- [x] 7.5 Add field row badge state styles: `.badge--not-copied` (color #9CA3AF), `.badge--copied` (color #16A34A, bg #DCFCE7), `.badge--copy-failed` (color #FFFFFF, bg #DC2626), `.badge--pasted` (color #FFFFFF, bg #16A34A), `.badge--paste-failed` (color #FFFFFF, bg #DC2626), `.badge--skipped` (color #D97706, bg #FEF3C7). Add `.field-row__secondary--failed` (color #DC2626, font-size 11px), `.field-row__secondary--skipped` (color #D97706, font-size 11px), `.field-row__secondary--value` (color #6B7280). (§7.2 Field State Reference)

## 8. Build Gate

- [x] 8.1 Run `npm test` — all unit tests must pass, including the new `deriveFieldUIStates`, `computeHasCopiedData`, `computeIsClearDisabled` tests and updated `_runPasteInitiative` tests. Zero failures before proceeding to manual QA. (DEVELOPER.md §6 Build & Test Gate)

## 9. Manual QA (SPEC.md §9.3 MT-28 through MT-34)

- [ ] 9.1 MT-28: Open the side panel with at least one enabled mapping. Before clicking Copy, verify all rows are visible with `NOT COPIED` badge. Verify Clear and Paste buttons are disabled.

- [ ] 9.2 MT-29: Navigate to an ADO work item. Click "Copy from Initiative". Verify COPIED rows show the field value on the secondary line. Click "Clear" — verify all rows reset to NOT COPIED and Clear/Paste become disabled again.

- [ ] 9.3 MT-30: Configure a mapping with an invalid ADO selector. Click Copy. Verify that field shows `FAILED` badge and the error message on the secondary line. Verify other fields that succeeded still show `COPIED`.

- [ ] 9.4 MT-31: After a successful Copy, navigate to a PA form. Click "Paste to PowerApp". Verify successfully pasted fields show `PASTED` badge with the copied value on the secondary line.

- [ ] 9.5 MT-32: With Overwrite Mode OFF and a PA field that already has a value, click Paste. Verify the skipped field shows `SKIPPED` badge with reason `"Field already has value"` (or equivalent).

- [ ] 9.6 MT-33: After Copy, switch to another tab and back. Verify field rows still show `COPIED`/`FAILED` states (not reset to NOT COPIED). After Paste, switch tabs and back — verify `PASTED`/`SKIPPED`/`FAILED` states persist within the same browser session.

- [ ] 9.7 MT-34: Verify context banners show correct brand colours — ADO page: blue background/border/text; PA page: purple background/border/text; other page: white background with grey border. Verify dot is a CSS circle (not emoji). Verify banner label text is the short form: "Azure DevOps", "PowerApps", "This page is not supported."

- [ ] 9.8 MT-35: Verify all three action buttons are 48px tall with 12px font-size. Verify Copy is #0078D4, Paste is #742774, Clear is grey. Verify disabled state is #CCCCCC.
