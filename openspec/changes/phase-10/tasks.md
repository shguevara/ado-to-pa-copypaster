## 1. pa-writer.js — File Skeleton and Helpers

- [x] 1.1 Create `scripts/pa-writer.js` with a top-level block comment explaining the script's purpose, its three-strategy architecture, and that it is injected on-demand (no persistent content_script). Stub out `paWriterMain`, `PASTE_STRATEGIES`, `waitForElement`, `waitForElements`, and `simulateTyping` so the file is syntactically complete before any logic is added. (SPEC.md §11 Phase 10 step 1; design D-1, D-2; **BR-003: this script must never call form.submit(), click Save, or dispatch a submit event**)

- [x] 1.2 Implement `waitForElement(selector, timeoutMs)` — resolves to the matching element via MutationObserver on `document.body`, or `null` on timeout. Observer must be disconnected before resolving in all code paths. (spec: `pa-writer` Requirement: waitForElement helper; design D-3)

- [x] 1.3 Implement `waitForElements(selector, timeoutMs)` — same pattern as `waitForElement` but returns a `NodeList`; resolves with an empty NodeList (not null) on timeout. (spec: `pa-writer` Requirement: waitForElements helper; design D-3)

- [x] 1.4 Implement `simulateTyping(inputElement, text)` — selects all, attempts `document.execCommand('insertText', false, text)`, falls back to native HTMLInputElement setter + bubbling `input`/`change` events if execCommand did not set the value, waits 300ms before resolving. (spec: `pa-writer` Requirement: simulateTyping helper; design D-4)

---

## 2. pa-writer.js — paWriterMain Orchestration (TDD)

- [x] 2.1 Write failing unit tests for `paWriterMain` orchestration covering: strategy dispatch by `fieldType`, result array length/order, unmatched fieldId returns error, disabled mappings are excluded, per-field try/catch isolation (one strategy throws → others still run, BR-002), and empty mappings returns `[]`. Use stub strategy functions that resolve immediately. (spec: `pa-writer` Requirements: paWriterMain entry point contract, Per-field error isolation, FieldResult[] return contract)

- [x] 2.2 Implement `paWriterMain(copiedData, mappings, overwriteMode)` — iterates enabled mappings, looks up each in `copiedData`, calls `PASTE_STRATEGIES[mapping.fieldType]`, wraps each call in try/catch (BR-002), returns `FieldResult[]`. **BR-003: paWriterMain must never call any form submit or save method.** (design D-1, D-2)

- [x] 2.3 Run unit tests (`npm test`) — confirm all paWriterMain tests pass with zero failures.

---

## 3. pa-writer.js — text Strategy

- [x] 3.1 Implement `pasteText(fieldSchemaName, value, overwriteMode)` strategy: query `[data-id="{fieldSchemaName}.fieldControl-text-box-text"]`; if not found return `status: "error"`; if `overwriteMode === false` and input has non-empty `.value` return `status: "skipped"`; otherwise focus, select all, call `simulateTyping`; return `status: "success"`. **BR-003: do not submit or save.** (spec: `pa-writer` Requirement: text field write strategy; SPEC.md §11 Phase 10 step 1; design D-7)

---

## 4. pa-writer.js — choice Strategy

- [x] 4.1 Implement `pasteChoice(fieldSchemaName, value, overwriteMode)` strategy: query `[data-id="{fieldSchemaName}.fieldControl-option-set-select"]`; if not found return `status: "error"`; if `overwriteMode === false` and combobox `title` is not the default placeholder return `status: "skipped"`; click combobox; call `waitForElements('[role="option"]', 3000)` from **document root** (Fluent UI portal is detached from the combobox — design D-5); if no options appear return `status: "error"`; case-insensitively match `textContent.trim()`; if no match return `status: "warning"` with available options; click match; return `status: "success"`. (spec: `pa-writer` Requirement: choice field write strategy; SPEC.md §11 Phase 10 step 1)

---

## 5. pa-writer.js — lookup Strategy

- [x] 5.1 Implement `pasteLookup(fieldSchemaName, value, overwriteMode)` strategy using the prefix `"{fieldSchemaName}.fieldControl-LookupResultsDropdown_{fieldSchemaName}"`: check for delete button (`{prefix}_selected_tag_delete`); if `overwriteMode === false` and delete button present return `status: "skipped"`; if delete button present click it and `waitForElement` text input (3s timeout — if null, return error); query text input (`{prefix}_textInputBox_with_filter_new`) — if not found return error; focus + click + `simulateTyping`; `waitForElements("{prefix}_resultsContainer", 5000)`; if no results clear typed value (BR-005) and return error; match by `aria-label` primary name (before first comma, case-insensitive); if no match clear typed value (BR-005) and return `status: "warning"`; click match; return `status: "success"`. (spec: `pa-writer` Requirement: lookup field write strategy; SPEC.md §11 Phase 10 step 1; BR-001, BR-005; design D-6)

---

## 6. PASTE_INITIATIVE Service Worker Handler (TDD)

- [x] 6.1 Write failing unit tests for the `PASTE_INITIATIVE` handler covering: page-type guard (`pageType !== "pa"` → `{ success: false, error }`), null copiedData guard, `executeScript` not called when guards fail, successful injection path (executeScript called with correct args), injection throws → `{ success: false, error }`. (spec: `paste-initiative-flow` Requirement: PASTE_INITIATIVE service worker handler)

- [x] 6.2 Implement `PASTE_INITIATIVE` handler in `background/service-worker.js`: guard `currentPageType === "pa"`, load `AppSettings` + `copiedData` from storage, guard `copiedData !== null`, filter enabled mappings, inject `scripts/pa-writer.js` with `args: [copiedData, mappings, overwriteMode]`, return `{ success: true, results }`. Follow the same promise-guard pattern used by `COPY_INITIATIVE`. (spec: `paste-initiative-flow` Requirement: PASTE_INITIATIVE service worker handler; SPEC.md §11 Phase 10 step 2; design D-8)

- [x] 6.3 Run unit tests (`npm test`) — confirm all PASTE_INITIATIVE handler tests pass.

---

## 7. Side Panel — Paste Action and State (TDD)

- [x] 7.1 Write failing unit tests for paste state management in `app.js` covering: `isPasteDisabled()` returns true when `pageType !== "pa"` or `hasCopiedData === false`, returns false when both conditions met; `hasPasteResults()` returns true when `pasteStatus === "done"` and `pasteResults.length > 0`; `pasteInitiative()` sets `pasteStatus = "pasting"` before messaging, sets `pasteStatus = "done"` on response, populates `pasteResults` from `response.results`, handles `success: false` with error sentinel entry (`fieldId: '__error__'`). (spec: `paste-initiative-flow` Requirements: Paste button wiring, Spinner, Per-field result list, Top-level error display)

- [x] 7.2 Add `pasteResults: []` state to `$store.app` in `sidepanel/app.js`. Note: `pasteStatus` and `hasCopiedData` are already declared — do not duplicate.

- [x] 7.3 Implement `isPasteDisabled()` store helper in `app.js` — returns `true` unless `pageType === "pa"` AND `hasCopiedData === true`. Use a store method (not inline expression) to keep Alpine CSP directives simple (same pattern as `isCopyDisabled()`). (SPEC.md §3.2; design D-9; BR-004)

- [x] 7.4 Implement `hasPasteResults()` store helper in `app.js` — returns `true` when `pasteStatus === "done"` and `pasteResults.length > 0`. (Mirrors `hasCopyResults()` pattern.)

- [x] 7.5 Implement `pasteInitiative()` async action in `app.js`: set `pasteStatus = "pasting"`, clear `pasteResults`, send `{ action: "PASTE_INITIATIVE" }`, on success set `pasteResults = response.results ?? []` and `pasteStatus = "done"`, on `success: false` set `pasteResults = [{ fieldId: '__error__', label: 'Error', status: 'error', message: response.error }]` and `pasteStatus = "done"`. (spec: `paste-initiative-flow`; design D-8, D-10; SPEC.md §11 Phase 10 step 3)

- [x] 7.6 Run unit tests (`npm test`) — confirm all paste state management tests pass.

---

## 8. Side Panel — HTML Markup

- [x] 8.1 Replace the `<!-- TODO Phase 10: Paste to PowerApps button + spinner -->` placeholder in `sidepanel/index.html` (line 138) with a "Paste to PowerApps" button wired to `$store.app.pasteInitiative()`, disabled via `:disabled="$store.app.isPasteDisabled()"`, and a spinner visible while `pasteStatus === 'pasting'`. Follow the same markup pattern as the Copy button and its spinner directly above. (spec: `paste-initiative-flow` Requirements: Paste button wiring, Spinner; SPEC.md §11 Phase 10 step 3; BR-004)

- [x] 8.2 Replace the `<!-- TODO Phase 10: render fieldResults after Paste -->` placeholder in `sidepanel/index.html` (line 203) with a `<ul x-show="$store.app.hasPasteResults()">` result list using `x-for="result in $store.app.pasteResults"`. Include colour-coded status classes (`.status-success`, `.status-skipped`, `.status-warning`, `.status-error`), the field label (`x-text="result.label"`), and optional message. (spec: `paste-initiative-flow` Requirement: Per-field result list; SPEC.md §11 Phase 10 step 3)

- [x] 8.3 Add a read-only Overwrite Mode badge to the User Tab in `sidepanel/index.html`. Badge shows `"ON"` when `$store.app.getOverwriteMode()` is true, `"OFF"` when false. No click handler — display only. `getOverwriteMode()` is already implemented in app.js. (spec: `paste-initiative-flow` Requirement: Overwrite Mode badge; SPEC.md §11 Phase 10 step 4)

---

## 9. Build Gate and Manual QA

- [x] 9.1 Run full unit test suite (`npm test`) — confirm zero failures and zero regressions in existing tests.

- [ ] 9.2 Manual QA — text field: load the extension, copy an ADO Initiative, navigate to the PA form, click "Paste to PowerApps", verify the text field value appears in the PA form and the result list shows `status: "success"`. (SPEC.md §11 Phase 10 step 5a)

- [ ] 9.3 Manual QA — choice field: verify the choice dropdown opens, the matching option is selected, and the field shows the new value in the PA form. (SPEC.md §11 Phase 10 step 5a)

- [ ] 9.4 Manual QA — lookup field (empty): verify search results appear and the correct record is selected. (SPEC.md §11 Phase 10 step 5a)

- [ ] 9.5 Manual QA — overwrite OFF: for each field type (text, choice, lookup), set `overwriteMode: false` via Admin tab, pre-fill the PA field, paste again, and confirm the field value is unchanged and result shows `status: "skipped"`. (SPEC.md §11 Phase 10 step 5b)

- [ ] 9.6 Manual QA — overwrite ON with lookup that has an existing value: set `overwriteMode: true`, confirm the existing lookup value is deleted, search is executed, and a new record is selected. (SPEC.md §11 Phase 10 step 5b)
