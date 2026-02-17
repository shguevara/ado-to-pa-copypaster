## Context

The extension can already **read** Initiative data from ADO (Phase 7) and store it in `chrome.storage.session` as `CopiedFieldData[]`. The side panel has a "Copy Initiative" button that drives this flow. Phase 10 adds the symmetric **write** side: a "Paste to PowerApps" button that injects `pa-writer.js` into the active PA tab and populates the form.

The PA DOM strategy was validated against a live PowerApps model-driven form (`org6216945a.crm.dynamics.com`) — see `SPIKE-PA-STRATEGIES.md`. Three control types exist on the target form: `text` inputs, `choice` (option-set/combo) dropdowns, and `lookup` relationship fields. Each requires a distinct interaction sequence because PowerApps uses Fluent UI components and React synthetic events.

**Constraints:**
- No build tooling; `pa-writer.js` must run natively in Chrome 114+
- `pa-writer.js` is injected on-demand (no persistent content script)
- Must honour BR-001 (skip existing values when overwriteMode=false), BR-002 (per-field try/catch), BR-003 (no form submit/save)

---

## Goals / Non-Goals

**Goals:**
- Implement `scripts/pa-writer.js` with all three PA write strategies (`text`, `choice`, `lookup`)
- Implement the `PASTE_INITIATIVE` service-worker message handler
- Wire the Paste button and result display in the side panel User Tab
- Display the current Overwrite Mode setting as a read-only badge in the User Tab
- Achieve unit test coverage on all logic that can be exercised outside the live PA DOM

**Non-Goals:**
- Automated E2E testing of `pa-writer.js` DOM interactions (PA DOM requires a live PowerApps session; not feasible in Vitest — covered by manual QA per SPEC.md §10 Phase 10 step 5)
- Custom domain support for PA host detection (tracked as OQ-04)
- Any changes to the mapping schema, storage keys, or manifest permissions

---

## Decisions

### D-1: pa-writer.js receives all data as injection args

**Decision:** The service worker passes `{ copiedData, mappings, overwriteMode }` as the `args` array to `chrome.scripting.executeScript`. `pa-writer.js` accepts these as function parameters — it does not read from `chrome.storage` itself.

**Why:** Injected scripts cannot use Chrome extension APIs (no `chrome.storage` access from an injected function context). Passing data as args is the established pattern used by `ado-reader.js`. It also makes the script independently testable: the entry-point function (`paWriterMain`) can be called directly in Vitest with mock data.

**Alternative considered:** Inject a content script with storage access first, then message it. Rejected: adds architectural complexity and violates the "no persistent content scripts" invariant.

---

### D-2: Strategy selection via a registry object

**Decision:** A `PASTE_STRATEGIES` registry maps each `fieldType` string (`"text"`, `"choice"`, `"lookup"`) to its strategy function. The main loop calls `PASTE_STRATEGIES[mapping.fieldType](mapping.paSelector, value)`.

**Why:** A `switch` statement would work but the registry is easier to extend and makes each strategy independently importable/testable. It also matches the pattern used in `ado-reader.js` (per-field selector dispatch).

---

### D-3: MutationObserver for all async waits — no setTimeout polling

**Decision:** `waitForElement` and `waitForElements` use a `MutationObserver` on `document.body` with a fallback `setTimeout` for the deadline.

**Why:** PowerApps renders Fluent UI option lists and lookup results as portal DOM nodes that appear asynchronously after user interactions. A polling approach (`setInterval` checking every 100ms) wastes CPU and has irregular response times. MutationObserver fires immediately when the node is inserted — more reliable and cheaper.

**Why NOT `waitForElement` on the specific portal container:** The choice dropdown options appear inside `<div id="__fluentPortalMountNode">` which is a detached mount root, not a child of the combobox. Observing the full `document.body` is necessary for both choice and lookup flyouts.

---

### D-4: simulateTyping — execCommand first, native-setter fallback

**Decision:**
1. Call `document.execCommand('insertText', false, text)` after selecting all existing text.
2. If the input value still doesn't match (execCommand no-ops in some contexts), fall back to native setter + bubbling `input`/`change` events.
3. Wait 300ms after typing to allow the PA framework time to fire API calls.

**Why:** PowerApps uses React's synthetic event system. A plain `input.value = x` assignment does not trigger React's change handlers. `execCommand('insertText')` fires a proper `InputEvent` that React's reconciler detects. The native setter + event dispatch is the standard React-testing workaround for when execCommand is unavailable.

**Why NOT the Chrome debugger API:** Requires the `"debugger"` permission which is heavyweight, requires user confirmation, and shows a yellow banner in the browser. Out of scope per CLAUDE.md §5 (ask before adding permissions).

---

### D-5: Choice strategy queries from document root, not field container

**Decision:** After clicking the combobox, call `document.querySelectorAll('[role="option"]')` from `document`, not from within the combobox's parent.

**Why:** Fluent UI renders the dropdown listbox into a detached portal (`<div id="__fluentPortalMountNode">`), which is a sibling of `<div id="shell-container">` at the body level — NOT a descendant of the field. Scoping the query to the field container would find zero elements.

---

### D-6: Lookup strategy detects current state via delete-button presence

**Decision:** Check for `[data-id="{prefix}_selected_tag_delete"]` to determine if the field already has a value. If present → click it, wait for text input to appear, then proceed. If absent → proceed directly to the text input.

**Why:** PowerApps lookup fields render completely different DOM structures in their empty vs. populated states. The delete button is the most reliable sentinel — it only exists when a value is selected, and its selector is deterministic.

**BR-001 interaction:** If `overwriteMode === false` and the delete button is present (field has a value), the strategy returns `{ status: "skipped" }` without touching the DOM. The delete button check doubles as the overwrite-mode guard for lookups.

---

### D-7: paSelector field holds the PA field schema name

**Decision:** For the PA write side, `FieldMapping.paSelector` stores the **field schema name** (e.g., `shg_solutionfamily`), not a raw CSS selector. All internal selectors are derived at runtime from this name using the deterministic `data-id` patterns documented in SPIKE-PA-STRATEGIES.md.

**Why:** GUID-based `id` attributes change on every page load. `data-id` attributes are stable and predictable (PowerApps generates them deterministically from the schema name). Using the schema name as the single identifier is simpler, more reliable, and what the element picker (Phase 8) already captures via its `data-id` → schema-name extraction logic.

**No schema change required:** `FieldMapping.paSelector` already exists in storage and the Admin UI. The field simply holds a schema name string instead of a complex CSS selector — the storage contract is unchanged.

---

### D-8: PASTE_INITIATIVE handler mirrors COPY_INITIATIVE pattern

**Decision:** The `PASTE_INITIATIVE` service-worker handler follows the same structure as `COPY_INITIATIVE`:
1. Guard page type (`pageType === "pa"`).
2. Load `AppSettings` and `copiedData` from storage.
3. Guard `copiedData !== null`.
4. Filter to enabled mappings.
5. Inject `pa-writer.js` with `{ copiedData, mappings, overwriteMode }`.
6. Return `{ success: true, results: FieldResult[] }`.

**Why:** Symmetry. The two handlers form a matching pair; consistent structure makes the codebase easier to understand and future handlers easier to add.

---

### D-9: Overwrite Mode badge is read-only, loaded on app init + TAB_CHANGED

**Decision:** The User Tab displays the current `overwriteMode` value as a small read-only badge (`ON` / `OFF`). The value is loaded from `AppSettings` during the same `GET_SETTINGS` call already made at app initialisation and on each `TAB_CHANGED` event.

**Why:** The badge gives users a quick reminder of the current overwrite behaviour without requiring them to navigate to the Admin tab. It is read-only because changing it mid-session is an admin action that belongs in the Admin tab. Loading it on `TAB_CHANGED` keeps it fresh after a settings update in another tab.

---

### D-10: TDD deviation for pa-writer.js DOM interactions

**Justification:** The three PA write strategies depend on:
- A live PowerApps DOM (Fluent UI portals, React synthetic events, Dataverse API responses)
- MutationObserver behaviour tied to real DOM mutations
- `document.execCommand` which is not available in jsdom (Vitest's DOM environment)

None of this can be meaningfully unit-tested in Vitest. Attempting to mock the entire Fluent UI portal structure and React event system would create brittle tests that verify the mock, not the code.

**Alternative coverage:** The manual QA steps in SPEC.md Phase 10 step 5 (five scenarios: text field, choice field, lookup with/without existing value, overwrite ON/OFF) provide the acceptance coverage for `pa-writer.js` internals.

**What IS unit-tested:**
- `paWriterMain` orchestration logic (mapping iteration, overwrite guard, result assembly) using stub strategies
- `PASTE_INITIATIVE` service-worker handler (storage reads, injection call, error paths)
- Side panel paste state management (button enable/disable, spinner, result list population)

---

## Risks / Trade-offs

**[Risk] PA DOM structure changes between PowerApps versions → Mitigation:** All selectors are isolated inside named strategy functions. If a selector breaks, only that field type fails (BR-002). The `data-id` suffix patterns are PowerApps standard for model-driven apps (OQ-03 validation recommended before production use).

**[Risk] execCommand deprecated in future Chrome → Mitigation:** The native-setter fallback is already in place. If execCommand stops working, the fallback handles it without code changes.

**[Risk] Lookup API timeout (Dataverse takes >5s) → Mitigation:** `waitForElements` has a 5000ms timeout and returns an empty NodeList on timeout rather than throwing. The strategy then returns `{ status: "error", message: "No search results found…" }` — visible to the user in the result list.

**[Risk] Only one Fluent UI flyout can be open at a time (PA constraint) → Mitigation:** Processing fields sequentially (one at a time in the `for` loop) ensures only one flyout is open at any moment. Parallel processing is not used.

**[Trade-off] simulateTyping 300ms settle delay → Effect:** Each typed field adds 300ms to the total paste duration. For 9 fields this is ~2.7s additional latency. Accepted: without the settle time, PA does not fire the Dataverse search API in time for lookup fields.

---

## Migration Plan

1. Create `scripts/pa-writer.js` (new file — no migration needed).
2. Add `PASTE_INITIATIVE` handler to `background/service-worker.js` (additive, no existing handlers modified).
3. Add Paste button, result list, and Overwrite badge to `sidepanel/index.html` + `app.js` (additive to existing User Tab).
4. Run full unit test suite — verify zero regressions.
5. Load extension unpacked and perform manual QA per SPEC.md Phase 10 step 5.

No storage schema changes. No manifest changes. Rollback = revert the three modified/new files.

---

## Open Questions

| # | Question | Impact |
|---|---|---|
| OQ-03 | PA DOM pattern validation: verify `data-id` suffix patterns against the actual target environment before production use | Low risk — patterns are PA standard, but selector suffix may differ on older PA versions |
| OQ-04 | Custom PA domains: if PA is on a non-`*.dynamics.com` / non-`*.powerapps.com` domain, `host_permissions` and page-type detection must be extended | Out of scope for Phase 10 |
