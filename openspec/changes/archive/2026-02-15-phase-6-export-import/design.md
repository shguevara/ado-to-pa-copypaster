## Context

Phase 5 shipped Export/Import buttons in the Admin tab as disabled no-op placeholders (per the `admin-mapping-crud` spec). The Alpine store already has an `importMessage: null` slot. Phase 6 activates both buttons with their full implementations.

**Current state at the start of Phase 6:**
- `sidepanel/index.html` — Export and Import buttons present in DOM but `disabled`.
- `sidepanel/app.js` — `importMessage` state exists in the Alpine store; no export/import methods.
- No background service worker changes are needed — `SAVE_SETTINGS` (from Phase 4) is the only Chrome message required, and it already exists.
- Storage schema is unchanged.

---

## Goals / Non-Goals

**Goals:**
- Activate the Export button: serialise `AppSettings` to the §4.4 JSON format and download `ado-pa-mappings.json`.
- Activate the Import button: file picker → `FileReader` → validate → replace settings → refresh mapping list → show inline feedback.
- Extract validation logic as a testable pure function, covered by Vitest unit tests.

**Non-Goals:**
- No new Chrome runtime messages (SAVE_SETTINGS already covers the write).
- No background service worker changes.
- No manifest or storage schema changes.
- No undo / rollback mechanism for import (out of scope for v1).

---

## Decisions

### 1. Validation as a module-level pure function in `app.js`

**Decision:** Define `validateImportData(parsed)` as a named function at the top scope of `app.js`, not inside the Alpine store object. Expose it via a conditional export at the bottom of the file:

```js
if (typeof module !== "undefined") module.exports = { validateImportData };
```

**Why:** This follows the exact pattern established by `detectPageType` in `service-worker.js`. Vitest runs in Node.js and imports pure functions via `module.exports`. Functions defined inside `Alpine.store(...)` closures are not importable without a browser/Alpine environment. Keeping validation at module scope makes it testable with zero test infrastructure overhead.

**Alternative considered:** Extract to a separate `lib/import-validator.js` file. Rejected — overkill for a single function; adds a new file to maintain and requires a `<script>` tag in `index.html`.

---

### 2. Export reads from in-memory store state, not from storage

**Decision:** `exportMappings()` reads `$store.app.settings` directly (already loaded on Admin tab mount) rather than sending a fresh `GET_SETTINGS` message to the background.

**Why:** The Alpine store is the canonical in-memory mirror of storage. Any save (`SAVE_SETTINGS`) updates both storage and the store in sequence. A fresh storage read adds async complexity for no benefit. If settings somehow drifted, the user's next export would capture their most recently applied state — which is correct behaviour.

**Alternative considered:** Always issue `GET_SETTINGS` before export to guarantee freshness. Rejected — adds async code path, and the store is kept in sync with every `SAVE_SETTINGS` call already.

---

### 3. Import uses a hidden `<input type="file">` element

**Decision:** The Import button's `@click` handler programmatically calls `.click()` on a hidden `<input type="file" accept=".json">` element. The file input's `change` event drives the import flow.

**Why:** This is the standard browser pattern for triggering a file picker from a custom-styled button. No Chrome-specific file APIs are involved. The side panel page is a regular web page and the File API (including `FileReader`) works normally inside it.

**Critical detail — same-file re-selection:** After each import attempt (success or failure), the hidden input's `value` must be reset to `""`. Without this reset, selecting the same file twice does not fire the `change` event (browsers suppress the event when the selection is unchanged). The reset is done immediately after reading `event.target.files[0]`.

---

### 4. `overwriteMode` carry-through uses a key-presence check

**Decision:** When applying an imported file, check `'overwriteMode' in parsed` (not `parsed.overwriteMode` truthiness) before deciding whether to apply the imported value.

**Why:** If the file contains `"overwriteMode": false`, a truthiness check would incorrectly treat this as "absent" and retain the current stored value. The key-presence check correctly handles all cases:
- Key present, value `true` → apply `true`
- Key present, value `false` → apply `false`
- Key absent → retain current stored value

---

### 5. Inline feedback reuses the existing `importMessage` store slot

**Decision:** Rely on the `importMessage: null` slot already defined in the Alpine store from Phase 5. Success sets `{ type: "success", text: "Mappings imported successfully." }`; failure sets `{ type: "error", text: "<specific error>" }`. The message is cleared at the start of each new import attempt (before the file picker opens), not after a timeout.

**Why:** The store slot already exists — Phase 5 anticipated this. Clearing on attempt-start (rather than a timer) is less disruptive; the user sees their last result until they actively start a new one.

---

## Risks / Trade-offs

- **`FileReader` in extension side panel** — `FileReader` is a standard Web API available in extension pages without any special permissions. No risk.

- **Re-importing the same file** — handled by resetting `fileInput.value = ""` after each import (see Decision 3). If this reset is omitted, the second import of the same file silently does nothing.

- **Large import files** — `chrome.storage.local` has a 10 MB quota. Mapping files are at most a few KB. Not a practical concern.

- **Import is destructive with no undo** — all existing mappings are immediately replaced. This is consistent with the existing Delete behaviour and acceptable for the 2–4 PM user group. A user who imports accidentally can recover by re-exporting the file they had previously exported (or reconfiguring manually). No mitigation needed in v1.

- **Blob URL cleanup** — the export flow creates a temporary `URL.createObjectURL(blob)` and programmatically clicks an `<a>` element. The object URL must be revoked with `URL.revokeObjectURL(url)` immediately after the click to avoid memory leaks. The `<a>` element should also be removed from the DOM.

---

## Migration Plan

Changes required — side panel files only:

1. **`sidepanel/index.html`**:
   - Remove `disabled` from both buttons.
   - Bind Export button: `@click="$store.app.exportMappings()"`.
   - Bind Import button: `@click="$refs.importFileInput.click()"`.
   - Add hidden file input: `<input x-ref="importFileInput" type="file" accept=".json" class="visually-hidden" @change="$store.app.importMappings($event)">`.
   - Add `importMessage` display block below the buttons (bound to `$store.app.importMessage`).

2. **`sidepanel/app.js`**:
   - Add `validateImportData(parsed)` as a module-level pure function.
   - Add `exportMappings()` method to the Alpine store.
   - Add `importMappings(event)` method to the Alpine store.
   - Add `if (typeof module !== "undefined") module.exports = { validateImportData }` at the bottom.

3. **`sidepanel/styles.css`**:
   - Add `.visually-hidden` utility class (if not already present) for the hidden file input.
   - Ensure `.import-message--success` and `.import-message--error` styles exist for inline feedback.

4. **`tests/import-validator.test.js`** (new file):
   - Unit tests for all `validateImportData` branches (valid, malformed JSON, missing `mappings`, empty `mappings`, missing required field, invalid `fieldType`).

No background service worker changes. No manifest changes. No storage schema changes.

---

## Open Questions

None. All behaviour is fully specified in SPEC.md §4.4, §6.6, and §8.2, and captured in the `export-import` spec.
