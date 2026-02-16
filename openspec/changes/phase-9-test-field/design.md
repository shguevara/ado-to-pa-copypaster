## Context

The Admin tab mapping form already has a stubbed "Test Field" button (rendered disabled with a "Available in Phase 9" tooltip). The mapping form's local Alpine `x-data` component manages form state; the global `Alpine.store("app")` holds cross-cutting state (pageType, pickerActive, pickerResult). Script injection follows the same pattern throughout the service worker: `chrome.tabs.query` → `executeScript({ target: { tabId }, func, args })`.

This design adds two test actions — one for the PA field schema name, one for the ADO CSS selector — to the existing mapping form without changing the surrounding architecture.

## Goals / Non-Goals

**Goals:**
- Activate the stubbed "Test Field" (PA) button and wire it end-to-end
- Add a "Test ADO" button next to the ADO Selector input with equivalent end-to-end wiring
- Single injected script (`selector-tester.js`) handles both test modes
- Inline feedback below each respective input; no modal/toast

**Non-Goals:**
- Testing `__URL_ID__` sentinel (no DOM element to test — button is simply disabled)
- Testing mappings in bulk (one-at-a-time, triggered manually by the user)
- Validating ADO selector syntax before injecting (runtime querySelector failure is sufficient)
- Persisting test results across form open/close cycles

## Decisions

### D-1 — Single dual-mode script rather than two separate files

`selector-tester.js` accepts a `mode` argument (`"pa"` | `"ado"`):
- `mode: "pa"` — derives the `data-id` selector from `fieldSchemaName` + `fieldType` per §6.5.1, then queries
- `mode: "ado"` — queries `adoSelector` directly, no derivation

**Why not two files?** The highlight-and-return logic is identical in both paths. Splitting into two files duplicates ~70% of the script for no gain. A single file with a `mode` discriminator is easier to maintain and follows the existing single-purpose-script pattern (`ado-reader.js`, `element-picker.js`).

**Why not re-use `element-picker.js`?** The picker is stateful (overlay, event listeners, Escape handler) and operates on click. The tester is stateless and fire-and-forget. Different enough to warrant a separate file.

### D-2 — Test result state lives in local `x-data`, not the global store

The picker result routes through `Alpine.store("app").pickerResult` + a `$watch` because Chrome runtime messages from injected scripts arrive *outside* Alpine's reactive context — the only way to notify Alpine is to write to the store from the external message listener.

Test results are different: they arrive as the `response` argument of `chrome.runtime.sendMessage(msg, response => { ... })`, which is called synchronously within the existing Alpine async handler. The result can be assigned directly to a local `x-data` property:

```js
async testAdoSelector() {
  const resp = await sendMessage({ action: "TEST_ADO_SELECTOR", adoSelector: this.form.adoSelector });
  this.adoTestResult = resp;
}
```

No store indirection needed. This keeps test results scoped to the form — they are ephemeral form-level state, not global application state.

### D-3 — Clear test results on input change, not on form submission

Each test result (`adoTestResult`, `paTestResult`) is cleared when its corresponding input value changes (via `@input` handlers on the text inputs). This prevents stale "✅ Found" messages from persisting after the user edits the field. Results are also cleared on form open/reset (the existing `$watch("$store.app.showMappingForm")` already resets all local form state).

### D-4 — Service worker validates page type before injection

The `TEST_SELECTOR` handler checks that the active tab `pageType === "pa"` before calling `executeScript`; `TEST_ADO_SELECTOR` checks `pageType === "ado"`. If the check fails, the SW returns `{ found: false, error: "Not on the expected page type" }` immediately without attempting injection.

**Why?** The UI already disables the buttons when the page type is wrong, but defense-in-depth avoids a confusing "not found" result if the user somehow triggers the action on the wrong tab (e.g., rapid tab switching). Consistent with how COPY_INITIATIVE / PASTE_INITIATIVE guard their own page type.

### D-5 — Lookup field: try primary selector, fall back to selected-tag

For `mode: "pa"` + `fieldType: "lookup"`, `selector-tester.js` tries the text-input selector first (`_textInputBox_with_filter_new`). If `document.querySelector` returns null, it tries the selected-tag selector (`_selected_tag`). The first match wins and is highlighted. This matches the PA writer's own lookup detection logic and correctly handles both the empty-field and filled-field states.

### D-6 — `__URL_ID__` disable is purely UI-side

The "Test ADO" button is disabled in the template when `form.adoSelector === '__URL_ID__'`. No sentinel check is needed in `selector-tester.js` or the service worker — the button simply cannot be clicked in that state. This avoids adding dead-code branches to the injected script.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Injecting into an ADO/PA tab with strict CSP may silently fail | `executeScript` already works for `ado-reader.js` and `element-picker.js` on the same tabs — no new CSP risk introduced |
| Selector-tester highlights an element the user wasn't expecting (e.g. a hidden element) | Visual highlight is 2s and non-destructive; `tagName` is shown in result so the user can see what was matched |
| Rapid button clicks queue multiple injections | "Testing…" state disables the button for the duration — only one in-flight request per button at a time |
| ADO page navigates between click and injection (race) | `chrome.scripting.executeScript` will fail with a tab navigation error; service worker catches and returns `{ found: false, error }` |

## Open Questions

None — all decisions resolved against SPEC.md v1.3.
