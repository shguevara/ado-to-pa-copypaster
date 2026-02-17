# Spec: admin-mapping-crud

Admin tab CRUD UI for FieldMapping entries — mapping list, add/edit form, delete with confirmation, enabled toggle, Overwrite Mode toggle, and Export/Import placeholders.

---

### Requirement: Admin tab renders all field mappings in a list

The Admin tab panel SHALL display all `FieldMapping` entries from `$store.app.settings.mappings`
as a list. Each row MUST show:
- The mapping `label`
- The `fieldType` as a badge (`text` / `lookup` / `choice`)
- An enabled/disabled toggle (checkbox) bound to `mapping.enabled`
- An "Edit" button
- A "Delete" button

When `settings.mappings` is empty, the list SHALL show a clear empty-state message
(e.g. "No mappings configured yet. Click + Add Mapping to get started.").

#### Scenario: Default mappings appear on first load
- **WHEN** the side panel loads with the two seeded default mappings in storage
- **THEN** the Admin tab mapping list shows two rows: "Title" and "Initiative ID", both with type "text"

#### Scenario: Empty state shown when no mappings exist
- **WHEN** `settings.mappings` is an empty array
- **THEN** the Admin tab shows the empty-state message instead of a list

---

### Requirement: Add Mapping form creates a new mapping

The Admin tab SHALL provide an "+ Add Mapping" button that opens an inline mapping form.
The form MUST include:
- **Label** — text input (required)
- **ADO Selector** — text input (required)
- **Field Schema Name (PA)** — text input (required; must be non-empty to save)
- **Field Type** — `<select>` with options: `text`, `lookup`, `choice` (required)

Clicking "Save" SHALL:
1. Validate that `label`, `adoSelector`, and `fieldSchemaName` are all non-empty strings and `fieldType` is one of `["text", "lookup", "choice"]`.
2. If validation fails: display an inline error message; do NOT save.
3. If validation passes: generate a new UUID v4 `id` via `crypto.randomUUID()`, set `enabled: true`, append the new `FieldMapping` to `settings.mappings`, send `SAVE_SETTINGS`, and close the form.

Clicking "Cancel" SHALL close the form without saving.

#### Scenario: Valid new mapping is saved and appears in list
- **WHEN** the user fills in all required fields and clicks "Save"
- **THEN** the new mapping appears at the bottom of the mapping list
- **AND** `chrome.storage.local` contains the updated `settings.mappings` array with the new entry
- **AND** the form closes

#### Scenario: Save blocked when Label is empty
- **WHEN** the user leaves Label blank and clicks "Save"
- **THEN** an inline validation error is displayed
- **AND** the form remains open
- **AND** `settings.mappings` is unchanged

#### Scenario: Save blocked when Field Schema Name is empty
- **WHEN** the user leaves Field Schema Name blank and clicks "Save"
- **THEN** an inline validation error is displayed
- **AND** the form remains open

#### Scenario: Cancel discards unsaved input
- **WHEN** the user has entered data in the form and clicks "Cancel"
- **THEN** the form closes and `settings.mappings` is unchanged

---

### Requirement: Edit Mapping form updates an existing mapping

Clicking "Edit" on any mapping row SHALL open the mapping form pre-populated with that
mapping's current values. All four fields SHALL be editable. Clicking "Save" SHALL update
the mapping in-place in `settings.mappings` (preserving its `id` and its position in the
array), send `SAVE_SETTINGS`, and close the form. Clicking "Cancel" SHALL discard changes.

The edit form MUST operate on a **copy** of the mapping data — cancelling SHALL leave the
original mapping's values in the store exactly as they were before Edit was clicked.

#### Scenario: Edit form pre-populates with current values
- **WHEN** the user clicks "Edit" on a mapping with label "Line of Business"
- **THEN** the Label field shows "Line of Business"
- **AND** all other fields show the mapping's current values

#### Scenario: Saved edit updates the mapping in place
- **WHEN** the user changes the Label to "Business Line" and clicks "Save"
- **THEN** the mapping list row shows "Business Line"
- **AND** the mapping's `id` and array position are unchanged
- **AND** `chrome.storage.local` reflects the updated label

#### Scenario: Cancel on edit leaves original values intact
- **WHEN** the user modifies a field and clicks "Cancel"
- **THEN** the mapping list row still shows the original values
- **AND** `settings.mappings` is unchanged

---

### Requirement: Delete Mapping removes the mapping after confirmation

Clicking "Delete" on a mapping row SHALL prompt the user with `window.confirm`. If the
user confirms, the mapping SHALL be removed from `settings.mappings`, `SAVE_SETTINGS`
SHALL be sent, and the row SHALL disappear from the list. If the user dismisses the
confirm dialog, no change SHALL occur.

#### Scenario: Confirmed delete removes the row
- **WHEN** the user clicks "Delete" on a mapping row and confirms the dialog
- **THEN** that mapping is no longer visible in the list
- **AND** `chrome.storage.local` no longer contains that mapping in `settings.mappings`

#### Scenario: Dismissed confirm leaves mapping intact
- **WHEN** the user clicks "Delete" on a mapping row and dismisses (cancels) the dialog
- **THEN** the mapping is still visible in the list
- **AND** `settings.mappings` is unchanged

---

### Requirement: Enabled toggle persists immediately

Each mapping row's enabled checkbox SHALL be directly bound to `mapping.enabled`.
Toggling the checkbox SHALL immediately call `SAVE_SETTINGS` with the updated settings.

#### Scenario: Disabling a mapping persists
- **WHEN** the user unchecks the enabled toggle on a mapping
- **THEN** `SAVE_SETTINGS` is sent with `mapping.enabled === false`
- **AND** reloading the panel shows the mapping as disabled

#### Scenario: Re-enabling a mapping persists
- **WHEN** the user checks the enabled toggle on a disabled mapping
- **THEN** `SAVE_SETTINGS` is sent with `mapping.enabled === true`

---

### Requirement: Overwrite Mode toggle persists immediately

The Admin tab SHALL display a checkbox labelled "Overwrite Mode — overwrite existing PA
field values during paste". Its checked state SHALL reflect `settings.overwriteMode`.
Toggling it SHALL immediately update `$store.app.settings.overwriteMode` and send
`SAVE_SETTINGS`.

#### Scenario: Overwrite Mode off by default
- **WHEN** the extension is installed fresh (default seed)
- **THEN** the Overwrite Mode checkbox is unchecked

#### Scenario: Enabling Overwrite Mode persists
- **WHEN** the user checks the Overwrite Mode checkbox
- **THEN** `SAVE_SETTINGS` is sent with `overwriteMode: true`
- **AND** reloading the panel shows the checkbox as checked

#### Scenario: Disabling Overwrite Mode persists
- **WHEN** the user unchecks the Overwrite Mode checkbox
- **THEN** `SAVE_SETTINGS` is sent with `overwriteMode: false`

---

### Requirement: All mapping mutations persist across panel reloads

Any change made through the Admin CRUD UI (add, edit, delete, toggle enabled,
toggle overwriteMode) MUST be written to `chrome.storage.local` via `SAVE_SETTINGS`
before the UI reflects the change as final. After closing and reopening the side panel,
all changes MUST still be present.

#### Scenario: New mapping survives panel close/reopen
- **WHEN** the user adds a mapping, then closes and reopens the side panel
- **THEN** the new mapping is present in the Admin tab list

#### Scenario: Deleted mapping does not reappear
- **WHEN** the user deletes a mapping, then closes and reopens the side panel
- **THEN** the deleted mapping is absent from the Admin tab list

---

### Requirement: Export and Import buttons are wired to their implementations

The Admin tab SHALL render an "Export Mappings" button and an "Import Mappings" button
at the bottom of the Admin panel. Both buttons SHALL be fully functional:
- "Export Mappings" SHALL trigger the export flow defined in the `export-import` spec.
- "Import Mappings" SHALL trigger the import flow defined in the `export-import` spec.

Neither button SHALL be a no-op. The placeholder behaviour from Phase 5 is replaced.

#### Scenario: Export and Import buttons are visible and functional
- **WHEN** the user views the Admin tab
- **THEN** both "Export Mappings" and "Import Mappings" buttons are visible in the UI
- **AND** clicking "Export Mappings" initiates a file download
- **AND** clicking "Import Mappings" opens a file picker
