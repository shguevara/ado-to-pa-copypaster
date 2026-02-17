# Spec: export-import

Export and Import of FieldMapping configuration — serialise `AppSettings` to a JSON file for download, and restore settings from a previously exported file with full validation and inline feedback.

---

### Requirement: Export mappings downloads a JSON file

The Admin tab SHALL provide an "Export Mappings" button. When clicked, it SHALL:
1. Read the current `AppSettings` from `chrome.storage.local` via `GET_SETTINGS`.
2. Build an export object with the following shape (SPEC.md §4.4):
   - `version`: `"1.0"` (string literal)
   - `exportedAt`: current UTC timestamp in ISO 8601 format (`new Date().toISOString()`)
   - `overwriteMode`: current `settings.overwriteMode` boolean
   - `mappings`: the full `settings.mappings` array
3. Serialise with `JSON.stringify(exportObj, null, 2)` (human-readable, 2-space indent).
4. Create a `Blob` with `type: "application/json"`.
5. Trigger a browser download with filename `ado-pa-mappings.json` via a temporary `<a download>` element that is programmatically clicked then removed from the DOM.

The button MUST NOT be disabled based on page type — export works regardless of which page is active.

#### Scenario: Export downloads a valid JSON file
- **WHEN** the user clicks "Export Mappings" in the Admin tab
- **THEN** a file named `ado-pa-mappings.json` is downloaded
- **AND** the file contains valid JSON with `version`, `exportedAt`, `overwriteMode`, and `mappings` keys
- **AND** the `mappings` array matches all currently configured `FieldMapping` entries

#### Scenario: Export with no mappings configured
- **WHEN** `settings.mappings` is an empty array and the user clicks "Export Mappings"
- **THEN** a file is still downloaded with `"mappings": []`

---

### Requirement: Import mappings replaces all settings from a JSON file

The Admin tab SHALL provide an "Import Mappings" button. When clicked, it SHALL open a hidden `<input type="file" accept=".json">` element. After the user selects a file, the import flow SHALL:
1. Read the file contents using `FileReader.readAsText`.
2. Attempt `JSON.parse`. On failure: display an error message, do NOT modify storage.
3. Validate the parsed object against the §4.4 rules (see validation requirement below). On failure: display the specific error, do NOT modify storage.
4. Build a new `AppSettings`:
   - `mappings`: from the imported data.
   - `overwriteMode`: from the imported data if the `overwriteMode` key is present; otherwise retain the current stored value.
5. Send `SAVE_SETTINGS` with the new `AppSettings`.
6. Reload the Admin tab mapping list from the freshly saved settings.
7. Display an inline success message: `"Mappings imported successfully."`.

#### Scenario: Import a valid mapping file
- **WHEN** the user clicks "Import Mappings" and selects a well-formed JSON file matching §4.4
- **THEN** the mapping list is replaced with the imported mappings
- **AND** `chrome.storage.local` contains the new `settings.mappings`
- **AND** the success message `"Mappings imported successfully."` is shown in the Admin tab
- **AND** the `overwriteMode` toggle reflects the imported value if `overwriteMode` was present in the file

#### Scenario: Import retains current overwriteMode when file omits it
- **WHEN** the imported file has no `overwriteMode` key
- **THEN** `settings.overwriteMode` is unchanged after import

#### Scenario: Import file not selected (dialog cancelled)
- **WHEN** the user clicks "Import Mappings" but dismisses the file picker without selecting a file
- **THEN** no action occurs; `settings.mappings` is unchanged; no message is shown

---

### Requirement: Import validates the file before applying

Before modifying any storage, the import flow SHALL validate the parsed JSON object with the following rules (in order). On the first failing rule, display the corresponding error and abort — do NOT continue validation or modify storage.

| Rule | Error message |
|---|---|
| File is not valid JSON | `"Invalid file: could not parse JSON."` |
| `mappings` key is absent or not an array | `"Invalid format: 'mappings' array is required."` |
| `mappings` array is empty | `"Invalid format: 'mappings' array must not be empty."` |
| A mapping entry is missing `id`, `label`, `adoSelector`, `fieldSchemaName`, `fieldType`, or `enabled` | `"Invalid mapping entry: missing required field '<fieldName>'."` |
| A mapping entry's `fieldType` is not one of `["text", "lookup", "choice"]` | `"Invalid fieldType in mapping '<label>': must be text, lookup, or choice."` |

The `version` and `exportedAt` fields are optional and SHALL be ignored on import.

#### Scenario: Import malformed JSON
- **WHEN** the user imports a file that is not valid JSON
- **THEN** the error `"Invalid file: could not parse JSON."` is shown inline in the Admin tab
- **AND** `settings.mappings` is unchanged

#### Scenario: Import JSON missing the mappings array
- **WHEN** the imported JSON has no `mappings` key
- **THEN** the error `"Invalid format: 'mappings' array is required."` is shown
- **AND** `settings.mappings` is unchanged

#### Scenario: Import JSON with an empty mappings array
- **WHEN** the imported JSON has `"mappings": []`
- **THEN** the error `"Invalid format: 'mappings' array must not be empty."` is shown
- **AND** `settings.mappings` is unchanged

#### Scenario: Import mapping entry missing a required field
- **WHEN** a mapping entry is missing `fieldSchemaName`
- **THEN** the error `"Invalid mapping entry: missing required field 'fieldSchemaName'."` is shown
- **AND** `settings.mappings` is unchanged

#### Scenario: Import mapping entry with invalid fieldType
- **WHEN** a mapping entry has `fieldType: "dropdown"` (not a valid value)
- **THEN** the error `"Invalid fieldType in mapping '<label>': must be text, lookup, or choice."` is shown
- **AND** `settings.mappings` is unchanged

---

### Requirement: Import result message is shown inline and dismissible

After an import attempt (success or failure), the result message SHALL appear inline in the Admin tab below the Import button. The message SHALL:
- Show with a green background for success, red background for errors.
- Persist until the next import attempt or until the user navigates away from the Admin tab.
- NOT use `alert()` or any browser-native dialog.

#### Scenario: Success message shown after valid import
- **WHEN** a valid import completes
- **THEN** a green inline message `"Mappings imported successfully."` is visible in the Admin tab

#### Scenario: Error message shown after failed import
- **WHEN** an import fails validation
- **THEN** a red inline error message is visible in the Admin tab
- **AND** no browser alert or confirm dialog is used

#### Scenario: Previous message cleared on new import attempt
- **WHEN** the user attempts a second import after a prior attempt left a message visible
- **THEN** the previous message is cleared before the new result is shown
