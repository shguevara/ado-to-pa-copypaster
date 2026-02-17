## 1. Unit Tests (write first — TDD)

- [x] 1.1 Create `tests/selector-tester.test.js` with failing tests for PA selector derivation: given `(fieldSchemaName, fieldType)` → expected `[data-id="..."]` string for `text`, `choice`, and `lookup` (primary selector). Ref: spec §Selector tester script dual-mode operation.
- [x] 1.2 Add failing test for lookup fallback: `derivePaSelector("shg_owner", "lookup")` returns both the primary and fallback selector strings in the expected format. Ref: spec §Selector tester script / design D-5.
- [x] 1.3 Add failing tests for `mode: "ado"` pass-through: the adoSelector value is used verbatim (no transformation). Ref: spec §Selector tester script dual-mode operation.
- [x] 1.4 Add failing test for exception path: a querySelector that throws returns `{ found: false, error: <message> }` without propagating. Ref: spec §Selector tester / Scenario: Script exception is caught.

## 2. selector-tester.js — Injected Script

- [x] 2.1 Create `scripts/selector-tester.js`. Accepts one argument object `{ mode, fieldSchemaName?, fieldType?, adoSelector? }`. Wraps all logic in top-level try/catch; never throws to host page. Ref: SPEC.md §6.5 / design D-1.
- [x] 2.2 Implement `mode: "pa"` path: derive primary `data-id` selector for `text` and `choice` types; run `document.querySelector`; if found highlight with `outline: 3px solid #22c55e` for 2000 ms then remove; return `{ found: true, tagName }`. Ref: SPEC.md §6.5.1.
- [x] 2.3 Implement lookup fallback in `mode: "pa"`: try `_textInputBox_with_filter_new` selector first; if null try `_selected_tag` selector; first match wins. Ref: SPEC.md §6.5.1 / design D-5.
- [x] 2.4 Implement `mode: "ado"` path: run `document.querySelector(adoSelector)` directly; highlight and return same `{ found, tagName }` / `{ found: false }` / `{ found: false, error }` structure. Ref: SPEC.md §6.5.2 / design D-1.
- [x] 2.5 Confirm all unit tests from Task 1 pass with the implementation.

## 3. Service Worker — Message Handlers

- [x] 3.1 Add `TEST_SELECTOR` handler to `background/service-worker.js`: guard `pageType === "pa"` (return `{ found: false, error: "Not on a PA page" }` if not); inject `scripts/selector-tester.js` with args `[{ mode: "pa", fieldSchemaName, fieldType }]`; return script result; catch injection errors and return `{ found: false, error: e.message }`. Ref: SPEC.md §5.1 / design D-4.
- [x] 3.2 Add `TEST_ADO_SELECTOR` handler to `background/service-worker.js`: guard `pageType === "ado"` (return `{ found: false, error: "Not on an ADO page" }` if not); inject `scripts/selector-tester.js` with args `[{ mode: "ado", adoSelector }]`; return script result; catch injection errors and return `{ found: false, error: e.message }`. Ref: SPEC.md §5.1 / design D-4.

## 4. Alpine Form State & Methods (app.js)

- [x] 4.1 Add `paTestResult: null`, `paTestRunning: false`, `adoTestResult: null`, `adoTestRunning: false` to the mapping form `x-data` initial state block. Ref: design D-2.
- [x] 4.2 Reset all four properties to their initial values inside the existing `$watch("$store.app.showMappingForm")` reset block so both result areas clear on form open. Ref: design D-3 / spec §Result clearing on form open.
- [x] 4.3 Add `async testPaField()` method: set `paTestRunning = true`; send `TEST_SELECTOR` with `{ fieldSchemaName: this.fieldSchemaName, fieldType: this.fieldType }`; store response in `this.paTestResult`; set `paTestRunning = false`. Ref: spec §Test Field button (PA) / design D-2.
- [x] 4.4 Add `async testAdoSelector()` method: set `adoTestRunning = true`; send `TEST_ADO_SELECTOR` with `{ adoSelector: this.adoSelector }`; store response in `this.adoTestResult`; set `adoTestRunning = false`. Ref: spec §Test ADO button / design D-2.

## 5. HTML Wiring (index.html)

- [x] 5.1 Activate the stubbed "Test Field" button: remove `disabled` attribute and "Available in Phase 9" tooltip; bind `:disabled="paTestRunning || $store.app.pageType !== 'pa'"` and `@click="testPaField()"`;  use `x-text` to toggle label between `"Test Field"` and `"Testing…"`. Ref: SPEC.md §7.3 / spec §Test Field button (PA).
- [x] 5.2 Add "Test ADO" button next to the ADO Selector input with `:disabled="adoTestRunning || $store.app.pageType !== 'ado' || adoSelector === '__URL_ID__'"` and `@click="testAdoSelector()"`; same `x-text` loading label pattern. Ref: SPEC.md §7.3 / spec §Test ADO button.
- [x] 5.3 Add `@input="adoTestResult = null"` handler on the ADO Selector `<input>` to clear stale results on edit. Ref: design D-3 / spec §Result clearing on input change.
- [x] 5.4 Add `@input="paTestResult = null"` handler on the Field Schema Name `<input>` and `@change="paTestResult = null"` on the Field Type `<select>` to clear stale results on edit. Ref: design D-3 / spec §Result clearing on input change.
- [x] 5.5 Add inline ADO result display element below the ADO Selector input: `x-show="adoTestResult"` with conditional green/red text — `✅ Found: <tagName> element`, `❌ No element found — check the CSS selector`, or `❌ Error: <message>`. Ref: SPEC.md §7.3 / spec §Inline test result display.
- [x] 5.6 Add inline PA result display element below the Field Schema Name input: `x-show="paTestResult"` with conditional green/red text — `✅ Found: <tagName> element`, `❌ No element found — check schema name and field type`, or `❌ Error: <message>`. Ref: SPEC.md §7.3 / spec §Inline test result display.

## 6. Manual QA

- [x] 6.1 MT-18 — Navigate to a PA form; open a mapping; enter a valid `fieldSchemaName` and `fieldType`; click "Test Field" → green "✅ Found: INPUT element" (or correct tag) appears; element briefly highlighted on page.
- [x] 6.2 MT-19 — On PA form; enter a non-existent schema name; click "Test Field" → red "❌ No element found — check schema name and field type".
- [x] 6.3 MT-19a — Navigate to an ADO work item; open a mapping; enter a valid CSS selector (e.g. `input[aria-label='Title']`); click "Test ADO" → green "✅ Found: INPUT element"; element briefly highlighted.
- [x] 6.4 MT-19b — On ADO work item; enter a non-matching CSS selector; click "Test ADO" → red "❌ No element found — check the CSS selector".
- [x] 6.5 MT-19c — Open a mapping where `adoSelector === "__URL_ID__"` → "Test ADO" button is disabled regardless of current page.
- [x] 6.6 Verify "Testing…" loading state appears on both buttons and they re-enable after result arrives.
- [x] 6.7 Verify editing the ADO Selector or Field Schema Name inputs clears the corresponding test result immediately.
- [x] 6.8 Verify both test results are absent when the mapping form is opened fresh (Add or Edit).
- [x] 6.9 Verify no new console errors in side panel, service worker, ADO page, or PA page.

<!-- Manual QA (6.1–6.9) requires a loaded Chrome extension against live ADO/PA pages. To be verified by the reviewer during /opsx:verify. -->
