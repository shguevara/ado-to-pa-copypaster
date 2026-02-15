## 1. Housekeeping — fix stale service-worker.js header (COMMENTS.md 🟡)

- [x] 1.1 Update the JSDoc block at `background/service-worker.js` lines 1–15 to list all 8 current responsibilities and correct the stale "will use chrome.storage in Phase 4+" forward reference. No logic changes. (COMMENTS.md 🟡 item; design D-7)

## 2. app.js — Load AppSettings on Alpine init (design D-2)

- [x] 2.1 In the `alpine:init` callback in `sidepanel/app.js`, add a `GET_SETTINGS` `sendMessage` call immediately after the existing `GET_PAGE_CONTEXT` call. On response, set `Alpine.store('app').settings = response.settings`. Guard against missing response (leave `settings` as `null`). (SPEC.md §7.4; spec: sidepanel-shell "AppSettings loaded from storage on Alpine init")

## 3. app.js — Admin CRUD store methods (design D-3)

- [x] 3.1 Add `openAddForm()` store method: sets `this.editingMapping = null` and `this.showMappingForm = true`. (SPEC.md §7.3; spec: admin-mapping-crud "Add Mapping form")

- [x] 3.2 Add `openEditForm(id)` store method: finds the mapping in `this.settings.mappings` by `id`, sets `this.editingMapping = { ...mapping }` (shallow copy — NOT a reference), sets `this.showMappingForm = true`. (SPEC.md §7.3; design D-3 "shallow copy on openEditForm"; spec: admin-mapping-crud "Edit Mapping form")

- [x] 3.3 Add `closeForm()` store method: sets `this.showMappingForm = false` and `this.editingMapping = null`. (SPEC.md §7.3)

- [x] 3.4 Add `saveMapping(formData)` store method: (a) If `formData.id` is present (edit mode), find that mapping in `settings.mappings` and replace it in-place with `{ ...formData }`. (b) If no `id` (add mode), generate a new `id` via `crypto.randomUUID()`, set `enabled: true`, and append to `settings.mappings`. (c) Send `SAVE_SETTINGS` with updated settings. (d) Call `this.closeForm()`. (SPEC.md §5.1 SAVE_SETTINGS, §7.3; design D-4 UUID; spec: admin-mapping-crud)

- [x] 3.5 Add `deleteMapping(id)` store method: filter `settings.mappings` to remove the entry with the given `id`, then send `SAVE_SETTINGS` with updated settings. (SPEC.md §7.3; spec: admin-mapping-crud "Delete Mapping")

- [x] 3.6 Add `toggleEnabled(id)` store method: find the mapping by `id` in `settings.mappings`, flip its `enabled` boolean, then send `SAVE_SETTINGS`. (SPEC.md §7.3; spec: admin-mapping-crud "Enabled toggle")

- [x] 3.7 Add `setOverwriteMode(value)` store method: set `this.settings.overwriteMode = value`, then send `SAVE_SETTINGS`. (SPEC.md §7.3; spec: admin-mapping-crud "Overwrite Mode toggle")

## 4. index.html — Admin tab settings section (SPEC.md §7.3)

- [x] 4.1 In the Admin tab panel, add an "⚙ Settings" heading followed by the Overwrite Mode checkbox: `<input type="checkbox">` labelled "Overwrite Mode — overwrite existing PA field values during paste". Wire `@change` to call `$store.app.setOverwriteMode($event.target.checked)` and `:checked` to `$store.app.settings?.overwriteMode`. (SPEC.md §7.3; spec: admin-mapping-crud "Overwrite Mode toggle")

## 5. index.html — Admin tab mapping list (SPEC.md §7.3)

- [x] 5.1 Add a "── Field Mappings ──" section heading and an "+ Add Mapping" button that calls `$store.app.openAddForm()` via `@click`. (SPEC.md §7.3; design D-3)

- [x] 5.2 Add a mapping list using `x-for="mapping in $store.app.settings?.mappings ?? []"`. Each row shows: `label`, a fieldType badge (`text` / `lookup` / `choice`), an enabled checkbox wired to `@change="$store.app.toggleEnabled(mapping.id)"` / `:checked="mapping.enabled"`, an "Edit" button calling `$store.app.openEditForm(mapping.id)`, and a "Delete" button calling `$store.app.deleteMapping(mapping.id)`. (SPEC.md §7.3; design D-3; spec: admin-mapping-crud "Mapping list")

- [x] 5.3 Add an empty-state message (`x-show="($store.app.settings?.mappings ?? []).length === 0"`) that displays "No mappings configured yet. Click + Add Mapping to get started." (spec: admin-mapping-crud "empty state")

## 6. index.html — Mapping form component (SPEC.md §7.3; design D-1, D-5)

- [x] 6.1 Add the mapping form panel with `x-show="$store.app.showMappingForm"` and a local `x-data` component (defined as a global function `adminMappingForm()` in `app.js`). The component provides local state (`label`, `adoSelector`, `fieldSchemaName`, `fieldType`, `formError`) and a `$watch`-based `init()` that copies from `$store.app.editingMapping` when `showMappingForm` becomes `true`. (design D-1; SPEC.md §7.3)

- [x] 6.2 Add the four form fields inside the mapping form: Label (text input, `x-model="label"`), ADO Selector (text input, `x-model="adoSelector"`), Field Schema Name (text input, `x-model="fieldSchemaName"`) with disabled "Pick from Page" button (Phase 8) and disabled "Test Field" button (Phase 9), and Field Type select (`x-model="fieldType"`, options: text / lookup / choice). (SPEC.md §7.3; design Non-Goals)

- [x] 6.3 Add form validation in the `adminMappingForm()` component's `save()` method: check that `label`, `adoSelector`, and `fieldSchemaName` are non-empty and `fieldType` is in `["text", "lookup", "choice"]`; set `formError` on failure; call `$store.app.saveMapping({ id: $store.app.editingMapping?.id, label, adoSelector, fieldSchemaName, fieldType })` on success. (design D-5; spec: admin-mapping-crud "Add Mapping form — validation")

- [x] 6.4 Add an inline error display `<p x-show="formError" x-text="formError">` below the form fields to show validation errors. (spec: admin-mapping-crud "Save blocked when Label is empty")

- [x] 6.5 Add "Save" button (`@click="save()"`) and "Cancel" button (`@click="$store.app.closeForm()"`) to the mapping form. (SPEC.md §7.3)

## 7. index.html — Export/Import placeholders (SPEC.md §7.3; Phase 6 deferred)

- [x] 7.1 At the bottom of the Admin tab panel, add "↓ Export Mappings" and "↑ Import Mappings" buttons. Both buttons MUST be non-functional (no `@click` handler or an empty no-op). They will be fully implemented in Phase 6. (spec: admin-mapping-crud "Export and Import buttons visible but non-functional")

## 8. app.js — adminMappingForm() global component function (design D-1)

- [x] 8.1 Define `function adminMappingForm()` at module level in `sidepanel/app.js` (before the `alpine:init` listener). The function returns a plain object with: `label`, `adoSelector`, `fieldSchemaName`, `fieldType` (default `"text"`), `formError` (default `""`) as local reactive state, plus an `init()` method that uses `this.$watch('$store.app.showMappingForm', ...)` to sync from `$store.app.editingMapping` each time the form opens, and a `save()` method implementing validation + store call (design D-5). (design D-1; SPEC.md §3.2 CSP constraint)

## 9. styles.css — Admin UI styles (SPEC.md §7.3)

- [x] 9.1 Add mapping list styles: row layout (flexbox, space-between), fieldType badge styles for `text` (neutral), `lookup` (blue), `choice` (purple), enabled checkbox sizing, Edit/Delete button styles. (SPEC.md §7.3)

- [x] 9.2 Add mapping form styles: form field labels and inputs (full-width, consistent spacing), Field Type select, inline error message style (red text), Save/Cancel button styles (Save = primary, Cancel = secondary). (SPEC.md §7.3)

- [x] 9.3 Add empty-state message styles (muted text, centered). (spec: admin-mapping-crud "empty state")

- [x] 9.4 Add Settings section header and Overwrite Mode checkbox layout styles. (SPEC.md §7.3)

## 10. Manual Verification (spec: admin-mapping-crud; SPEC.md §9.3)

- [x] 10.1 Load extension in Chrome. Open Admin tab. Verify two default mappings ("Title", "Initiative ID") are visible with correct type badges. Verify Overwrite Mode checkbox is unchecked.

- [x] 10.2 Click "+ Add Mapping". Fill in all fields. Click "Save". Verify new row appears at bottom of list. Close and reopen panel — verify new mapping persists.

- [x] 10.3 Click "Edit" on an existing mapping. Verify form pre-populates. Change the label. Click "Save". Verify list row shows new label, id and position are unchanged, and persistence survives panel reload.

- [x] 10.4 Click "Edit" on a mapping, change a field, then click "Cancel". Verify the original values are unchanged in the list.

- [x] 10.5 Click "Delete" on a mapping. Dismiss the confirm dialog. Verify mapping still present. Click "Delete" again, confirm. Verify mapping is gone and does not reappear after panel reload.

- [x] 10.6 Uncheck the enabled toggle on a mapping. Verify it persists across panel reload. Re-enable and verify again.

- [x] 10.7 Check the Overwrite Mode checkbox. Verify it persists across panel reload. Uncheck and verify.

- [x] 10.8 Attempt to save the Add form with an empty Label. Verify inline error is shown and no mapping is created.

- [x] 10.9 Attempt to save the Add form with an empty Field Schema Name. Verify inline error is shown.

- [x] 10.10 Verify no console errors appear in the side panel DevTools during any of the above operations.
