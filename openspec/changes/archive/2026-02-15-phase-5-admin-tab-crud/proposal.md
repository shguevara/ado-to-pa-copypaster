## Why

Phase 4 delivered the storage foundation (`GET_SETTINGS` / `SAVE_SETTINGS` / default seed), but there is no UI to manage mappings yet. Users have no way to add, edit, enable/disable, or delete `FieldMapping` entries without directly editing `chrome.storage` in DevTools. Phase 5 builds the Admin tab CRUD layer so the extension is self-configurable for the first time.

## What Changes

- **Admin tab — mapping list**: displays all `FieldMapping` entries (label, fieldType badge, enabled toggle, Edit / Delete buttons).
- **Add Mapping form**: inline form with Label, ADO Selector, Field Schema Name (PA), Field Type (`text` / `lookup` / `choice`) fields; form validation; Save / Cancel.
- **Edit Mapping**: same form pre-populated from the selected mapping; Save updates the entry in place.
- **Delete Mapping**: confirm via `window.confirm`, then remove from settings and persist.
- **Overwrite Mode toggle**: checkbox in Admin settings section, saves immediately on change via `SAVE_SETTINGS`.
- **Service-worker.js header fix**: update stale Phase 2 file header comment to accurately reflect all 8 current responsibilities (🟡 COMMENTS.md item from Phase 4 review — must be addressed before new code is added).
- Alpine store extended with admin-specific state fields and mutations needed by the form (`editingMapping`, `showMappingForm`, etc. — already in the §7.4 store shape).

> No picker ("Pick from Page"), no "Test Field" button in this phase — those are Phase 8 and Phase 9.

## Capabilities

### New Capabilities

- `admin-mapping-crud`: Full CRUD UI for `FieldMapping` entries in the Admin tab, plus the Overwrite Mode toggle. Covers: mapping list render, add/edit form with validation, delete with confirmation, settings persistence on every mutating action, and state management in the Alpine store.

### Modified Capabilities

- `sidepanel-shell`: The Alpine store shape and message listener wiring established in Phase 3 must be extended with Admin tab state fields and the `GET_SETTINGS` load-on-mount call. Existing `sidepanel-shell` spec requirements (tab switching, page-type reactive banner, TAB_CHANGED listener) are unchanged — only the scope of what the Admin tab panel renders expands.

## Impact

- **`sidepanel/index.html`** — Admin tab panel HTML: mapping list, add/edit form, overwrite toggle, export/import placeholders (buttons only, non-functional until Phase 6).
- **`sidepanel/app.js`** — Load settings on mount; add store methods for admin mutations (`openAddForm`, `openEditForm`, `saveMapping`, `deleteMapping`, `closeForm`, `setOverwriteMode`).
- **`sidepanel/styles.css`** — Mapping list table styles, form field styles, badge styles (`text` / `lookup` / `choice`), confirm/inline error states.
- **`background/service-worker.js`** — No new message handlers needed (Phase 4 already implemented `GET_SETTINGS` / `SAVE_SETTINGS`). Header comment updated only.
- **No `manifest.json` changes.**
- **No new storage schema keys.**
- **No new message contracts.**
