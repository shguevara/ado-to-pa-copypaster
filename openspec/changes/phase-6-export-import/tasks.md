## 1. Tests: Import Validation (TDD — write before implementation)

- [x] 1.1 Create `tests/import-validator.test.js` — import `validateImportData` from `../sidepanel/app.js`; write failing test: valid §4.4 JSON object returns `null` (no error)
- [x] 1.2 Add failing test: `validateImportData(null)` returns `"Invalid format: 'mappings' array is required."` (§8.2)
- [x] 1.3 Add failing test: object with `mappings` not an array returns `"Invalid format: 'mappings' array is required."` (§8.2)
- [x] 1.4 Add failing test: object with `mappings: []` returns `"Invalid format: 'mappings' array must not be empty."` (§8.2, export-import spec)
- [x] 1.5 Add failing test: mapping entry missing `fieldSchemaName` returns `"Invalid mapping entry: missing required field 'fieldSchemaName'."` (§8.2)
- [x] 1.6 Add failing test: mapping entry missing `label` returns `"Invalid mapping entry: missing required field 'label'."` (§8.2)
- [x] 1.7 Add failing test: mapping entry with `fieldType: "dropdown"` returns `"Invalid fieldType in mapping '<label>': must be text, lookup, or choice."` (§8.2)
- [x] 1.8 Add failing test: `version` and `exportedAt` fields are optional — valid object with those fields absent still returns `null` (§4.4)
- [x] 1.9 Run `npm test` — verify all 8 import-validator tests are red (failing) before writing implementation

## 2. Validation Function in `app.js`

- [x] 2.1 Define `validateImportData(parsed)` at module scope in `sidepanel/app.js` (before `Alpine.store(...)`): implement all §4.4 validation rules in order — array check, empty check, per-entry required-field check, per-entry `fieldType` check; return `null` on success, error string on failure
- [x] 2.2 Add `if (typeof module !== "undefined") module.exports = { validateImportData };` at the bottom of `sidepanel/app.js` (same conditional-export pattern as `detectPageType` in `service-worker.js`)
- [x] 2.3 Run `npm test` — all 8 import-validator tests pass; existing `detect-page-type` tests still pass

## 3. Export Implementation

- [x] 3.1 Add `exportMappings()` method to the Alpine store in `sidepanel/app.js`: build the §4.4 export object from `this.settings` (in-memory store, no storage round-trip needed); serialise with `JSON.stringify(obj, null, 2)`; create `Blob({ type: "application/json" })`; create object URL; append a temporary `<a download="ado-pa-mappings.json">` to the DOM, `.click()` it, then remove the `<a>` and call `URL.revokeObjectURL()` to avoid memory leaks (§6.6)
- [x] 3.2 In `sidepanel/index.html`: remove `disabled` from the Export button; bind `@click="$store.app.exportMappings()"` (§7.3)

## 4. Import Implementation

- [x] 4.1 Add `async importMappings(event)` method to the Alpine store in `sidepanel/app.js`: (a) get `file = event.target.files[0]`; if absent return early; (b) immediately reset `event.target.value = ""` so re-selecting the same file fires `change` again (browser quirk — see design.md Decision 3); (c) set `this.importMessage = null`; (d) wrap `FileReader.readAsText` in a Promise; (e) `JSON.parse` the result — on failure set `this.importMessage = { type: "error", text: "Invalid file: could not parse JSON." }` and return; (f) call `validateImportData(parsed)` — on error set `this.importMessage = { type: "error", text: errorString }` and return; (g) build new `AppSettings`: `mappings` from parsed data; `overwriteMode` from `'overwriteMode' in parsed ? parsed.overwriteMode : this.settings.overwriteMode` (key-presence check, not truthiness — see design.md Decision 4); (h) send `SAVE_SETTINGS`; (i) reload settings via `GET_SETTINGS` and update `this.settings`; (j) set `this.importMessage = { type: "success", text: "Mappings imported successfully." }` (§6.6, §8.2)
- [x] 4.2 In `sidepanel/index.html`: add `<input type="file" accept=".json" x-ref="importFileInput" class="visually-hidden" @change="$store.app.importMappings($event)">` inside the import-export section (§7.3)
- [x] 4.3 In `sidepanel/index.html`: remove `disabled` from the Import button; bind `@click="$refs.importFileInput.click()"` (§7.3)
- [x] 4.4 In `sidepanel/index.html`: add inline `importMessage` display block below the import-export buttons — bind visibility to `$store.app.importMessage`; apply `.import-message--success` or `.import-message--error` CSS class based on `$store.app.importMessage.type` (§7.3)

## 5. Styles

- [x] 5.1 In `sidepanel/styles.css`: add `.visually-hidden` utility class that positions the hidden file input off-screen (use `position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0)` — avoid `display: none` which breaks programmatic `.click()` in some browsers)
- [x] 5.2 In `sidepanel/styles.css`: ensure `.import-message--success` (green background / text) and `.import-message--error` (red background / text) styles are defined for the inline feedback element (§7.3)

## 6. Final Verification

- [x] 6.1 Run full test suite (`npm test`) — all tests pass with no regressions
- [ ] 6.2 Manual (MT-16): load extension, Admin tab → click "Export Mappings" — verify `ado-pa-mappings.json` downloads; inspect file contents for `version`, `exportedAt`, `overwriteMode`, and `mappings` keys matching §4.4
- [ ] 6.3 Manual (MT-13): import the file from 6.2 — verify success message "Mappings imported successfully." appears; mapping list is correct
- [ ] 6.4 Manual (MT-14): import a plain text file (invalid JSON) — verify error "Invalid file: could not parse JSON." appears; existing mappings unchanged
- [ ] 6.5 Manual (MT-15): import a JSON file with a mapping entry missing `fieldSchemaName` — verify error "Invalid mapping entry: missing required field 'fieldSchemaName'." appears; existing mappings unchanged
- [ ] 6.6 Manual: import a file that contains `"overwriteMode": true` — verify Overwrite Mode toggle switches to ON after import
- [ ] 6.7 Manual: import a file with no `overwriteMode` key — verify Overwrite Mode toggle is unchanged after import
- [ ] 6.8 Manual: select the same file twice in a row via Import — verify the second selection opens correctly (confirms `value = ""` reset is working)
- [ ] 6.9 Verify no new `console.error` or unhandled exceptions in the side panel DevTools console during any of the above flows
