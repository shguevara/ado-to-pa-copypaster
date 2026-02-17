## ADDED Requirements

### Requirement: Overlay is injected on START_ELEMENT_PICKER
When the background service worker receives a `START_ELEMENT_PICKER` message it SHALL inject
`scripts/element-picker.js` into the active tab via `chrome.scripting.executeScript`.
The script SHALL create a full-screen transparent overlay `<div id="ado-pa-picker-overlay">`
with `position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 2147483647;
pointer-events: none` so that mouse events on the underlying page elements are not blocked.

#### Scenario: Overlay is created and appended to the document body
- **WHEN** the side panel sends `{ action: "START_ELEMENT_PICKER" }` to the background
- **THEN** the background responds `{ success: true }`
- **THEN** a `<div id="ado-pa-picker-overlay">` is present in the active PA tab's DOM

#### Scenario: Start picker on a non-PA tab returns an error
- **WHEN** the side panel sends `START_ELEMENT_PICKER` while the active tab is not a PA page
- **THEN** the background responds `{ success: false, error: "Not on a PowerApps page." }`

---

### Requirement: Hovered elements are highlighted during pick mode
While pick mode is active the script SHALL listen for `mouseover` events on `document`
and apply `outline: 2px solid #4f9cf9; outline-offset: 1px` to the currently hovered
element. When the cursor moves to a different element the outline on the previous element
SHALL be removed before the new outline is applied.

#### Scenario: Hovering an element applies a blue outline
- **WHEN** pick mode is active and the user moves the cursor over any element on the PA page
- **THEN** that element receives the style `outline: 2px solid #4f9cf9; outline-offset: 1px`

#### Scenario: Moving to a new element removes the previous outline
- **WHEN** pick mode is active and the cursor moves from element A to element B
- **THEN** element A's outline style is cleared
- **THEN** element B receives the blue outline

---

### Requirement: Click in pick mode captures the schema name and exits
When the user clicks any element while pick mode is active the script SHALL:
1. Call `e.preventDefault()` and `e.stopPropagation()` to prevent the underlying page
   from reacting to the click (capture-phase listener).
2. Invoke `extractSchemaName(e.target)` (see Requirement below).
3. Remove the overlay `<div>` from the DOM.
4. Remove all event listeners installed by the script (mouseover, click, keydown).
5. Send `{ action: "ELEMENT_PICKED", schemaName }` via `chrome.runtime.sendMessage`,
   where `schemaName` is the value returned by `extractSchemaName` (may be `null`).

#### Scenario: Click on a PA field element sends a non-null schema name
- **WHEN** the user clicks an element whose ancestor carries `data-id="shg_title.fieldControl-text-box-text"`
- **THEN** `ELEMENT_PICKED` is sent with `{ schemaName: "shg_title" }`

#### Scenario: Click on an element with no valid data-id sends null
- **WHEN** the user clicks an element that has no `data-id` on itself or any ancestor up to `<body>`
- **THEN** `ELEMENT_PICKED` is sent with `{ schemaName: null }`

#### Scenario: Click removes the overlay from the DOM
- **WHEN** the user clicks any element in pick mode
- **THEN** `document.getElementById("ado-pa-picker-overlay")` returns `null` after the click

---

### Requirement: Escape key cancels pick mode
If the user presses the Escape key while pick mode is active the script SHALL remove
the overlay and all event listeners without sending `ELEMENT_PICKED`.

#### Scenario: Escape key removes overlay and exits pick mode silently
- **WHEN** pick mode is active and the user presses the Escape key
- **THEN** the overlay `<div>` is removed from the DOM
- **THEN** no `ELEMENT_PICKED` message is sent
- **THEN** subsequent mouseover events do NOT produce blue outlines

---

### Requirement: Background forwards ELEMENT_PICKED to the side panel
When the background service worker receives `ELEMENT_PICKED` from the injected script it
SHALL forward the message `{ action: "ELEMENT_PICKED", schemaName }` to the side panel by
calling `chrome.runtime.sendMessage` (same mechanism used for `TAB_CHANGED`).

#### Scenario: ELEMENT_PICKED with a valid schema name is forwarded
- **WHEN** the injected script sends `{ action: "ELEMENT_PICKED", schemaName: "shg_title" }`
- **THEN** the background calls `chrome.runtime.sendMessage({ action: "ELEMENT_PICKED", schemaName: "shg_title" })`

#### Scenario: ELEMENT_PICKED with null schema name is forwarded unchanged
- **WHEN** the injected script sends `{ action: "ELEMENT_PICKED", schemaName: null }`
- **THEN** the background forwards `{ action: "ELEMENT_PICKED", schemaName: null }`

---

### Requirement: CANCEL_ELEMENT_PICKER removes the overlay via script execution
When the background service worker receives `CANCEL_ELEMENT_PICKER` it SHALL execute an
inline cleanup script in the active tab that removes `#ado-pa-picker-overlay` from the DOM
if it is present. The background SHALL respond `{ success: true }`.

#### Scenario: Cancel removes the overlay element
- **WHEN** the side panel sends `{ action: "CANCEL_ELEMENT_PICKER" }`
- **THEN** the background executes a cleanup script that calls `document.getElementById("ado-pa-picker-overlay")?.remove()`
- **THEN** the background responds `{ success: true }`

---

### Requirement: extractSchemaName extracts field schema name from data-id
`extractSchemaName(el)` SHALL walk from the clicked element up toward `<body>`, reading
the `data-id` attribute at each level. The first non-empty `data-id` whose value does NOT
begin with a GUID pattern (`/^[0-9a-f]{8}-/i`) SHALL be split on `.` and the part before
the first dot returned as the schema name. If no qualifying `data-id` is found before
`<body>`, `null` SHALL be returned.

The function SHALL be defined as a named standalone function at module scope (not nested
inside another function) so that Vitest can import and unit-test it without requiring a
browser or Chrome extension environment.

#### Scenario: Element has a direct qualifying data-id
- **WHEN** the clicked element has `data-id="shg_solutionfamily.fieldControl-text-box-text"`
- **THEN** `extractSchemaName` returns `"shg_solutionfamily"`

#### Scenario: Element itself has no data-id but a parent does
- **WHEN** the clicked element has no `data-id` but its parent has `data-id="cr123_owner.fieldControl-LookupResultsDropdown"`
- **THEN** `extractSchemaName` returns `"cr123_owner"`

#### Scenario: Multi-level DOM walk — grandparent has the data-id
- **WHEN** element, parent, and grandparent chain is inspected and only the grandparent has a valid `data-id="custom_field.fieldControl"`
- **THEN** `extractSchemaName` returns `"custom_field"`

#### Scenario: data-id starts with a GUID-format prefix — skipped
- **WHEN** an ancestor has `data-id="6927649b-abc-123.fieldControl"` (starts with GUID pattern `/^[0-9a-f]{8}-/i`)
- **THEN** that element is skipped and the walk continues up the DOM
- **THEN** if no other qualifying ancestor exists, `extractSchemaName` returns `null`

#### Scenario: No qualifying data-id anywhere in the ancestor chain
- **WHEN** no element from the clicked target up to (not including) `<body>` has any `data-id` attribute
- **THEN** `extractSchemaName` returns `null`

#### Scenario: Walk stops at document.body and does not go higher
- **WHEN** no qualifying ancestor is found before reaching `document.body`
- **THEN** `extractSchemaName` returns `null` and does not examine `<body>`, `<html>`, or `document`

---

### Requirement: Side panel populates fieldSchemaName on ELEMENT_PICKED
The side panel's module-level `onMessage` listener SHALL handle `ELEMENT_PICKED` messages
forwarded from the background. It SHALL:
1. Set `$store.app.pickerActive` to `false`.
2. Set `$store.app.pickerResult` to `{ schemaName }` (the full object, not just the value).
The `adminMappingForm()` x-data component SHALL `$watch` `$store.app.pickerResult` and
react when it becomes non-null:
- If `schemaName` is non-null: copy it into `this.fieldSchemaName` and clear any picker warning.
- If `schemaName` is null: set `this.pickerWarning` to the message defined in SPEC.md §6.4:
  "Could not determine field schema name — try clicking directly on the field input or label".

#### Scenario: Valid schema name populates the form input
- **WHEN** ELEMENT_PICKED arrives with `{ schemaName: "shg_lineofbusiness" }`
- **THEN** `$store.app.pickerActive` becomes `false`
- **THEN** `adminMappingForm().fieldSchemaName` is set to `"shg_lineofbusiness"`
- **THEN** no picker warning is shown

#### Scenario: Null schema name shows a warning in the form
- **WHEN** ELEMENT_PICKED arrives with `{ schemaName: null }`
- **THEN** `$store.app.pickerActive` becomes `false`
- **THEN** `adminMappingForm().fieldSchemaName` is unchanged
- **THEN** `adminMappingForm().pickerWarning` is set to "Could not determine field schema name — try clicking directly on the field input or label"

---

### Requirement: Pick from Page button is disabled when not on a PA page
In the Admin tab mapping form, the "Pick from Page" button SHALL be disabled (`:disabled` is
`true`) whenever `$store.app.pageType !== "pa"`. A tooltip (HTML `title` attribute) SHALL
read "Navigate to a PowerApps form first" when the button is disabled.

#### Scenario: Button disabled on an unsupported page
- **WHEN** `$store.app.pageType === "unsupported"`
- **THEN** the "Pick from Page" button is disabled

#### Scenario: Button enabled on a PA page
- **WHEN** `$store.app.pageType === "pa"`
- **THEN** the "Pick from Page" button is enabled (and picker is not currently active)

---

### Requirement: Pick from Page button label toggles while picker is active
While `$store.app.pickerActive` is `true` the button text SHALL read "Cancel Pick".
When `pickerActive` is `false` the button SHALL read "Pick from Page".
Clicking "Cancel Pick" SHALL send `CANCEL_ELEMENT_PICKER` to the background and set
`$store.app.pickerActive` to `false`.

#### Scenario: Button shows "Cancel Pick" when picker is active
- **WHEN** `$store.app.pickerActive` is `true`
- **THEN** the button text is "Cancel Pick"

#### Scenario: Clicking Cancel Pick sends CANCEL_ELEMENT_PICKER
- **WHEN** the user clicks "Cancel Pick"
- **THEN** `{ action: "CANCEL_ELEMENT_PICKER" }` is sent to the background
- **THEN** `$store.app.pickerActive` is set to `false`

---

### Requirement: hasCopiedData is only true when at least one non-error result exists
After a `COPY_INITIATIVE` response arrives with `{ success: true, results }`, the side panel
SHALL set `hasCopiedData` to `true` only when `results` contains at least one entry whose
`status` is not `"error"`. An empty `results` array or a results array containing only
`status: "error"` entries SHALL leave `hasCopiedData` as `false`.

This ensures the Paste button (Phase 10) is never enabled when there is nothing meaningful
to paste.

#### Scenario: All fields succeed — hasCopiedData is true
- **WHEN** COPY_INITIATIVE responds with results `[{status:"success"}, {status:"blank"}]`
- **THEN** `hasCopiedData` is `true`

#### Scenario: All fields error — hasCopiedData is false
- **WHEN** COPY_INITIATIVE responds with results `[{status:"error"}, {status:"error"}]`
- **THEN** `hasCopiedData` is `false`

#### Scenario: Empty results array — hasCopiedData is false
- **WHEN** COPY_INITIATIVE responds with `results: []` (no enabled mappings)
- **THEN** `hasCopiedData` is `false`

#### Scenario: Mixed results — hasCopiedData is true
- **WHEN** COPY_INITIATIVE responds with results `[{status:"error"}, {status:"success"}]`
- **THEN** `hasCopiedData` is `true`
