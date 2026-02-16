## 1. ado-reader.js — Failing Tests (TDD red phase, §6.2, §9)

- [x] 1.1 Create `tests/ado-reader.test.js` with failing tests covering all six spec requirements: `__URL_ID__` sentinel extraction (success + no-ID-found cases), DOM selector read (value path + textContent path), HTML stripping, blank detection, element-not-found error, per-field error isolation (BR-002), and FieldResult[] contract (order preserved, empty input → empty output). All tests must fail (no implementation yet). Pattern: import `adoReaderMain` from `../scripts/ado-reader.js`, pass a mock `doc` as second argument (no jsdom required — minimal object mocks are sufficient per design D-3).

## 2. ado-reader.js — Implementation (§6.2, design D-1, D-2)

- [x] 2.1 Create `scripts/ado-reader.js`: declare `adoReaderMain(mappings, doc = document)` as a regular `function` declaration (not an arrow function — required for `Function.prototype.toString()` serialization per design D-1). Add `module.exports = { adoReaderMain }` guard at the bottom (same pattern as `service-worker.js` and `app.js`). File should be importable by Vitest at this point, but all tests still fail.

- [x] 2.2 Implement the `__URL_ID__` sentinel branch: when `mapping.adoSelector === "__URL_ID__"`, extract the numeric work item ID from `window.location.pathname` (use `doc.location ?? window.location` to remain mockable) using regex `/\/(\d+)(?:[/?#]|$)/`. Return `{ fieldId, label, status: "success", value: id }` on match, `{ fieldId, label, status: "error", message: "Could not extract work item ID from URL" }` on no match. (§6.2)

- [x] 2.3 Implement the CSS selector branch: call `doc.querySelector(adoSelector)`, return `{ fieldId, label, status: "error", message: "Element not found (selector: <selector>)" }` when result is `null`. When found, extract `el.value || el.textContent?.trim() || ""`, strip HTML with `.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()`, return `{ fieldId, label, status: "blank", message: "Field is blank in ADO" }` for empty string or `{ fieldId, label, status: "success", value }` for non-empty. (§6.2)

- [x] 2.4 Wrap each mapping's read in a per-field `try/catch` (BR-002): exceptions must produce `{ fieldId, label, status: "error", message: err.message }` and must not abort the loop over remaining mappings. The outer function itself must never throw to its caller (the Chrome scripting runtime).

- [x] 2.5 Run `npm test` — confirm all `ado-reader.test.js` tests pass and no regressions exist in `detect-page-type.test.js` or `import-validator.test.js`.

## 3. Service Worker — importScripts and COPY_INITIATIVE handler (§5.1, §6.2, design D-1, D-4, D-5)

- [x] 3.1 Add `importScripts("scripts/ado-reader.js")` at the very top of `background/service-worker.js` (before any function declarations). This loads `adoReaderMain` into the SW's global scope so it can be passed as the `func` parameter to `executeScript`. Add a comment explaining the pattern (design D-1). Run `npm test` to confirm existing tests still pass.

- [x] 3.2 Add `COPY_INITIATIVE` handler inside the `chrome.runtime.onMessage.addListener` block (following the SAVE_SETTINGS pattern). Handler must: (a) return early with `{ success: false, error: "Not on an ADO work item page." }` if `currentPageType !== "ado"`; (b) load settings via `chrome.storage.local.get("settings")`; (c) filter `settings.mappings.filter(m => m.enabled)`; (d) call `chrome.scripting.executeScript({ target: { tabId }, func: adoReaderMain, args: [enabledMappings] })` inside a `try/catch`; (e) build `CopiedFieldData[]` including only `success` and `blank` results (per design D-5); (f) write to `chrome.storage.session.set({ copiedData: ... })`; (g) return `{ success: true, results: fieldResults }`. Must `return true` to keep the message channel open. (§6.2)

- [x] 3.3 Add `GET_COPIED_DATA` handler: call `chrome.storage.session.get("copiedData")`, return `{ data: result.copiedData ?? null }`. Must `return true` to keep the channel open. (§5.1)

- [x] 3.4 Run `npm test` — confirm all tests green, no regressions.

## 4. Side Panel — Alpine store method (§7.4, design D-6)

- [x] 4.1 Add `copyInitiative()` async method to the Alpine store in `sidepanel/app.js`. Method flow: (1) set `this.copyStatus = "copying"`, `this.lastOperation = "copy"`, `this.fieldResults = []`; (2) wrap `chrome.runtime.sendMessage({ action: "COPY_INITIATIVE" }, callback)` in a Promise (same pattern as `importMappings()`); (3) on `success: true` → set `this.fieldResults = response.results`, `this.hasCopiedData = true`, `this.copyStatus = "done"`; (4) on `success: false` → set `this.fieldResults = [{ fieldId: "__error__", label: "Error", status: "error", message: response.error }]`, `this.copyStatus = "done"`. Handle `chrome.runtime.lastError` with an error entry.

## 5. Side Panel — HTML and CSS (§7.1, §8.2)

- [x] 5.1 Wire the "Copy Initiative" button in `sidepanel/index.html` User Tab section: add `@click="$store.app.copyInitiative()"` and a `:disabled` binding that disables the button when `$store.app.pageType !== 'ado'` or `$store.app.copyStatus === 'copying'` (BR-004, design D-6). Use `$store.app.` method calls — no inline expressions with `&&` or `||` (Alpine CSP constraint).

- [x] 5.2 Add a spinner element to the User Tab in `index.html`: visible with `x-show="$store.app.copyStatus === 'copying'"`. Use the same spinner style already present in the panel (or a simple CSS spinner) — match the existing visual language.

- [x] 5.3 Add the per-field results list to the User Tab in `index.html`: an `x-for` loop over `$store.app.fieldResults`, rendering each field's `label` and a status indicator element whose CSS class reflects `result.status` (`status-success`, `status-blank`, `status-error`). Show the list only when `$store.app.copyStatus === 'done'` and `$store.app.fieldResults.length > 0`.

- [x] 5.4 Add CSS rules to `sidepanel/styles.css` for `.status-success` (green indicator), `.status-blank` (yellow/amber indicator), and `.status-error` (red indicator). Match the visual weight of existing status elements in the panel.

## 6. Final Verification

- [x] 6.1 Run `npm test` — full suite must be green with no regressions.

- [ ] 6.2 Manual smoke test (unpacked extension in Chrome): navigate to an ADO work item page (`https://dev.azure.com/.../_workitems/edit/<id>`), open the extension side panel, click "Copy Initiative", verify: (a) spinner appears during operation, (b) per-field results list renders after completion, (c) green/yellow/red indicators match actual ADO field states, (d) `hasCopiedData` flag enables the Paste button (inspect via DevTools Alpine store), (e) no console errors in side panel or service worker.
