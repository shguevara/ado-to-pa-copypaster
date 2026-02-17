## Why

Phase 5 shipped the Admin tab mapping CRUD with Export and Import buttons present as placeholders (no-op per spec). Phase 6 activates those buttons — giving admins a reliable way to back up their configuration, restore it after clearing storage, and share a consistent mapping set with teammates.

## What Changes

- **Export**: reads `AppSettings` from storage, serialises it to the §4.4 JSON schema (with `version`, `exportedAt`, `overwriteMode`, and `mappings`), and triggers a browser download of `ado-pa-mappings.json`.
- **Import**: opens a `<input type="file">` picker, reads the selected file with `FileReader`, runs all §4.4 validation rules (JSON parse, required fields, valid `fieldType`), applies `overwriteMode` from the file if present, sends `SAVE_SETTINGS`, refreshes the mapping list, and shows inline success or error feedback.
- **Export/Import buttons** in the Admin tab transition from no-op placeholders to fully wired actions.
- **Unit tests** cover all import validation branches (valid file, malformed JSON, missing `mappings`, missing required fields, invalid `fieldType`).

## Capabilities

### New Capabilities

- `export-import`: Full implementation of mapping export (download JSON) and import (file picker → validate → replace settings) as specified in SPEC.md §6.6 and §4.4. Covers the export serialisation format, all import validation rules, `overwriteMode` carry-through on import, and inline UI feedback for success and every error condition.

### Modified Capabilities

- `admin-mapping-crud`: The final requirement — "Export and Import buttons are visible but non-functional in this phase" — changes: both buttons become functional. The requirement is replaced by the full export/import behaviour defined in the new `export-import` spec.

## Impact

- **`sidepanel/app.js`** — add `exportMappings()` and `importMappings(file)` methods to the Alpine store; wire inline `importMessage` state.
- **`sidepanel/index.html`** — wire Export button `@click` to `exportMappings()`; wire Import button to trigger hidden `<input type="file">`; bind `importMessage` display.
- **`sidepanel/styles.css`** — minor: import success/error message styling (already partially in place from Phase 5 `importMessage` state).
- **`tests/`** — new unit test file for import validation logic.
- No changes to `manifest.json`, background service worker, message contracts, or storage schema.
