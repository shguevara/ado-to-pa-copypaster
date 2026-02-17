## Context

Phases 1–6 have delivered the full settings infrastructure (tab detection, side panel shell, storage, mapping CRUD, export/import). The User Tab's "Copy Initiative" button exists in the HTML but does nothing — no handler, no spinner, no results list.

Phase 7 activates the copy half of the workflow. The gap to close:
- No `scripts/ado-reader.js` exists yet.
- `service-worker.js` does not handle `COPY_INITIATIVE` or `GET_COPIED_DATA`.
- `chrome.storage.session` has never been written.
- The side panel wires no copy action.

Constraints:
- All four ADO/PA host permissions and `scripting` + `storage` are already declared in `manifest.json` — no permission changes.
- No ES modules, no bundler, no CDN. `service-worker.js` is a classic (non-module) MV3 service worker.
- The Alpine CSP build prohibits expression-level assignments in directives; complex logic must live in store methods.

---

## Goals / Non-Goals

**Goals:**
- Implement `scripts/ado-reader.js` — injectable field-reading logic, unit-testable.
- Add `COPY_INITIATIVE` handler in `service-worker.js` — inject reader, store results in `chrome.storage.session`.
- Add `GET_COPIED_DATA` handler in `service-worker.js` — return session data to callers.
- Wire the User Tab "Copy Initiative" button, spinner, and per-field results list in `app.js` / `index.html`.

**Non-Goals:**
- PA writer (Phase 10), element picker (Phase 8), test-field (Phase 9).
- Any changes to `manifest.json`.
- `chrome.storage.session` key names or schema that differ from SPEC §4.2 / §6.2.

---

## Decisions

### D-1 — Injection approach: `importScripts` + `func` parameter (not `files`)

**The problem**: `chrome.scripting.executeScript({ files: [...] })` cannot pass runtime arguments. `executeScript({ func, args })` CAN pass arguments but requires the function to be in the service worker's scope.

**Chosen approach**:
1. `service-worker.js` calls `importScripts("scripts/ado-reader.js")` at the top of the file. This loads `adoReaderMain` into the SW's global scope synchronously.
2. The `COPY_INITIATIVE` handler calls `executeScript({ func: adoReaderMain, args: [enabledMappings] })`. Chrome serializes `adoReaderMain.toString()` and executes it in the ADO page's isolated world with `enabledMappings` as the first argument.

**Why not `files:` with a pre-set global?**
The two-step alternative (first inject a global via `func`, then inject the file via `files`) requires two separate `executeScript` round-trips. The `importScripts` approach is one round-trip and keeps the argument contract explicit and type-safe.

**Why not define `adoReaderMain` inline in `service-worker.js`?**
A separate file allows Vitest to import and unit-test the reader logic directly, matching the pattern established by `detectPageType` (service-worker.js) and `validateImportData` (app.js).

**`importScripts` compatibility**: Classic (non-module) MV3 service workers support `importScripts()` per Chrome's own documentation. The current service worker has no `"type": "module"` in manifest and uses no ES `import` statements — it IS a classic SW and `importScripts` works.

---

### D-2 — `adoReaderMain(mappings, doc = document)` signature

The function takes an optional `doc` parameter (defaulting to the global `document`) so Vitest can pass a mock object without needing jsdom. Default parameters are evaluated lazily (at call time, not definition time), so importing the file in Node.js does not throw even though `document` is undefined in Node.

- **In Chrome content context**: `doc` defaults to the ADO page's `document`. Correct.
- **In Vitest**: tests call `adoReaderMain(mappings, mockDoc)` with an explicit mock. Tests that call without `doc` would throw — that is intentional and desirable (a test misconfiguration should fail loudly).

---

### D-3 — Test strategy: mock DOM objects (no jsdom)

Existing tests use plain Vitest `node` environment and test pure string/object logic. The `adoReaderMain` function's logic (URL extraction, HTML stripping, selector lookup, value extraction) can all be exercised with minimal mock objects:

```js
// Example mock for "element found, value present"
const mockDoc = { querySelector: (sel) => ({ value: "my title", textContent: "" }) };
```

This keeps tests fast, dependency-free, and consistent with the established test style. No `@vitest-environment jsdom` annotation needed.

---

### D-4 — `executeScript` result unpacking

`chrome.scripting.executeScript` returns a `Promise<InjectionResult[]>`. The reader result lives at `results[0].result`. The SW wraps the entire `executeScript` call in `try/catch` — if Chrome throws (e.g., the tab navigated away between the pageType check and injection), it returns `{ success: false, error: err.message }` rather than crashing.

---

### D-5 — `CopiedFieldData[]` construction and `chrome.storage.session`

After `adoReaderMain` returns `FieldResult[]`, the SW converts to `CopiedFieldData[]` per SPEC §6.2 step 7:
- `status === "success"` → `{ fieldId, label, value: result.value, readStatus: "success" }`
- `status === "blank"` → `{ fieldId, label, value: "", readStatus: "blank", readMessage: result.message }`
- `status === "error"` → **omitted** from the stored array (no copyable data)

Written to `chrome.storage.session` under key `"copiedData"`. First-ever write to session storage in this extension; no permission changes required (`storage` permission covers both `local` and `session`).

---

### D-6 — Alpine store `copyInitiative()` method

Same async Promise-wrapping pattern as `importMappings()` and `_saveSettings()`. Key flow:

1. Set `copyStatus = "copying"`, `lastOperation = "copy"`, clear `fieldResults`.
2. Send `COPY_INITIATIVE` via `chrome.runtime.sendMessage`.
3. On response:
   - If `success === false`: set an error message in `fieldResults` (or use a dedicated error display).
   - If `success === true`: set `fieldResults = response.results`, `hasCopiedData = true`, `copyStatus = "done"`.

`fieldResults` is already declared in the Alpine store shape (Phase 3). `hasCopiedData` and `copyStatus` are also already declared — no store property additions needed, only a new method.

---

### D-7 — Status indicator color mapping

Per-field `FieldResult.status` → CSS class (already planned in `styles.css` structure):
- `"success"` → green indicator (✅)
- `"blank"`   → yellow/amber indicator (⚠ field exists but was empty in ADO)
- `"error"`   → red indicator (✗ selector didn't match or threw)

These three are the only statuses `adoReaderMain` can produce (`"warning"` and `"skipped"` are PA-writer statuses).

---

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `importScripts` path resolution | Use root-relative path `"scripts/ado-reader.js"`. Chrome resolves relative to the extension root for SW scripts. Verify during implementation. |
| `adoReaderMain.toString()` changes if minified | No minifier in this project — source files are the distributable. Not a risk here. |
| `executeScript` fails if tab navigates during copy | SW wraps call in `try/catch`; returns `{ success: false, error }` to side panel. |
| `chrome.storage.session` quota | Session storage shares the 5MB quota. A `CopiedFieldData[]` for 2–10 fields is well under 1KB. Not a concern. |
| ADO page CSP blocking injection | `scripting` permission with declared `host_permissions` bypasses page-level CSP for MV3 extension scripts. Not a risk. |
| Service worker not running when message arrives | MV3 SW wakes on messages. Pattern is identical to `GET_SETTINGS` / `SAVE_SETTINGS` — returning `true` keeps the channel open. |

---

## Migration Plan

Phase 7 adds new handlers and a new file. No existing storage keys are changed, no existing messages are altered. Deployment:

1. Load the updated unpacked extension at `chrome://extensions`.
2. No storage migration needed — `chrome.storage.session` is new (auto-initialises to empty).
3. Verify copy flow manually: navigate to an ADO work item, open side panel, click "Copy Initiative".

Rollback: reload the prior version — `chrome.storage.session` clears on browser close anyway.

---

## Open Questions

| # | Question | Owner | Notes |
|---|---|---|---|
| OQ-1 | Do ADO work item fields render in the DOM as `input[value]` or as `div[textContent]`? The SPEC uses `el.value \|\| el.textContent` — verify both paths fire correctly for the default `"Title"` selector during Phase 7 manual testing. | Developer | Low risk — standard HTML inputs; `el.value` should match. |
| OQ-2 | Does `importScripts("scripts/ado-reader.js")` work in the MV3 classic SW on Chrome 114+? Confirmed in Chrome docs but worth a quick smoke test before full implementation. | Developer | Fallback: define `adoReaderMain` inline in `service-worker.js` and keep `ado-reader.js` as tests-only. |
