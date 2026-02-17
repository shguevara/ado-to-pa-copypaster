## ADDED Requirements

### Requirement: FieldUIState entity and deriveFieldUIStates pure function
`sidepanel/app.js` SHALL define a module-scope pure function `deriveFieldUIStates(enabledMappings, copiedData, lastPasteResults, lastOperation)` that returns a `FieldUIState[]` array. One entry per enabled mapping, in mapping order.

Derivation logic for each mapping `m`:
- `copiedItem   = copiedData?.find(d => d.fieldId === m.id) ?? null`
- `pasteResult  = lastPasteResults?.find(r => r.fieldId === m.id) ?? null`

If `lastOperation === "paste"` AND `pasteResult` is not null:
- `"success"` → state `"pasted"`, copiedValue from copiedItem, no message
- `"error"` or `"warning"` → state `"paste_failed"`, copiedValue from copiedItem, message from pasteResult
- `"skipped"` or `"blank"` → state `"skipped"`, copiedValue from copiedItem, message from pasteResult

Else if `copiedItem` is not null:
- `readStatus: "success"` → state `"copied"`, copiedValue from copiedItem.value, no message
- `readStatus: "blank"` → state `"copied"`, copiedValue `""`, no message
- `readStatus: "error"` → state `"copy_failed"`, copiedValue null, message from copiedItem.readMessage

Otherwise: state `"not_copied"`, copiedValue null, no message.

The function MUST be exported via `module.exports` (under the `typeof module !== "undefined"` guard) so Vitest can import and test it directly.

#### Scenario: not_copied state when no copiedData
- **WHEN** `copiedData` is null and `lastPasteResults` is null
- **THEN** every entry in the returned array SHALL have `state: "not_copied"`, `copiedValue: null`, `message: null`

#### Scenario: copied state after successful read
- **WHEN** `copiedData` contains an entry with `readStatus: "success"` and `value: "My Title"` for a given mapping
- **AND** `lastOperation` is not `"paste"`
- **THEN** the corresponding FieldUIState SHALL have `state: "copied"` and `copiedValue: "My Title"`

#### Scenario: copy_failed state after error read
- **WHEN** `copiedData` contains an entry with `readStatus: "error"` and `readMessage: "Selector not found"`
- **AND** `lastOperation` is not `"paste"`
- **THEN** the corresponding FieldUIState SHALL have `state: "copy_failed"`, `copiedValue: null`, `message: "Selector not found"`

#### Scenario: pasted state after successful paste
- **WHEN** `lastOperation` is `"paste"` and `lastPasteResults` contains an entry with `status: "success"`
- **AND** `copiedData` contains the corresponding entry with `value: "My Title"`
- **THEN** the FieldUIState SHALL have `state: "pasted"` and `copiedValue: "My Title"`

#### Scenario: paste_failed for warning paste result
- **WHEN** `lastOperation` is `"paste"` and `lastPasteResults` contains an entry with `status: "warning"` and `message: "No match found"`
- **THEN** the FieldUIState SHALL have `state: "paste_failed"` and `message: "No match found"`

#### Scenario: skipped state for skipped paste result
- **WHEN** `lastOperation` is `"paste"` and `lastPasteResults` contains an entry with `status: "skipped"` and `message: "Field already has value"`
- **THEN** the FieldUIState SHALL have `state: "skipped"` and `message: "Field already has value"`

#### Scenario: blank copiedItem renders as copied with empty value
- **WHEN** `copiedData` contains an entry with `readStatus: "blank"` and `value: ""`
- **AND** `lastOperation` is not `"paste"`
- **THEN** the FieldUIState SHALL have `state: "copied"` and `copiedValue: ""`

---

### Requirement: Always-visible field list in User Tab
The User Tab SHALL render the list of all enabled mappings as field rows at all times — before Copy, after Copy, and after Paste. The list SHALL be derived from `$store.app.enabledMappings`. If no mappings are enabled, the section is hidden.

The section SHALL include a label `"FIELDS"` (uppercase, muted style) above the rows.

#### Scenario: Field rows visible before any Copy
- **WHEN** the side panel opens and enabled mappings exist
- **THEN** all enabled mapping labels are visible in the User Tab field list
- **AND** each row shows the `NOT COPIED` badge

#### Scenario: Field rows hidden when no enabled mappings
- **WHEN** all mappings are disabled or no mappings are configured
- **THEN** the field section SHALL be hidden

#### Scenario: Field list persists across tab switches
- **WHEN** the user navigates to the Admin tab and returns to the User tab
- **THEN** the field rows and their current states are still visible (x-show not x-if)

---

### Requirement: Field row structure and per-state visual rendering
Each field row SHALL display:
- **Icon** (left column, ~24px fixed width): Unicode character per state (see table below)
- **Label** (`FieldMapping.label`, font-size 13px, font-weight 500)
- **Badge** (right-aligned pill, uppercase, font-size 10px, border-radius 4px): text and colour per state
- **Secondary line** (font-size 12px, below label): visibility and content rules per state (see table below)

| state | Icon | Badge text | Badge style | Secondary line |
|---|---|---|---|---|
| `not_copied` | `○` | `NOT COPIED` | color #9CA3AF, no background | hidden |
| `copied` | `●` | `COPIED` | color #16A34A on bg #DCFCE7 | copiedValue in #6B7280 (hidden when empty) |
| `copy_failed` | `✕` | `FAILED` | color #FFFFFF on bg #DC2626 | message in #DC2626, font-size 11px |
| `pasted` | `✓` | `PASTED` | color #FFFFFF on bg #16A34A | copiedValue in #6B7280 (hidden when empty) |
| `paste_failed` | `✕` | `FAILED` | color #FFFFFF on bg #DC2626 | copiedValue (if any) + message (if any), separated by ` — `, in #DC2626 |
| `skipped` | `⊘` | `SKIPPED` | color #D97706 on bg #FEF3C7 | copiedValue (if any) + message (if any), separated by ` — `, in #D97706 |

**Secondary line visibility rules:**
- `not_copied`: always hidden.
- `copied`, `pasted`: shown when `copiedValue` is non-null and non-empty.
- `copy_failed`: shown when `message` is non-null and non-empty.
- `paste_failed`, `skipped`: shown when **either** `copiedValue` (non-empty) **or** `message` (non-empty) is present.

**Secondary line text rules for `paste_failed` and `skipped`:**
- Both `copiedValue` and `message` present: `"<copiedValue> — <message>"`
- Only `copiedValue` present (message is null/empty): `"<copiedValue>"`
- Only `message` present (copiedValue is null/empty): `"<message>"`
- Neither present: `""` (secondary line hidden)

Icons MUST have an `aria-label` or be wrapped in an element with descriptive text so state is accessible to screen readers.

#### Scenario: NOT COPIED row renders correctly
- **WHEN** a field row has `state: "not_copied"`
- **THEN** the row SHALL show the `○` icon and the `NOT COPIED` badge with no secondary line

#### Scenario: COPIED row renders value
- **WHEN** a field row has `state: "copied"` and `copiedValue: "Initiative Alpha"`
- **THEN** the row SHALL show the `●` icon, `COPIED` badge (green), and `"Initiative Alpha"` on the secondary line

#### Scenario: FAILED (copy) row renders error message
- **WHEN** a field row has `state: "copy_failed"` and `message: "Selector not found"`
- **THEN** the row SHALL show the `✕` icon, `FAILED` badge (red), and `"Selector not found"` on the secondary line

#### Scenario: PASTED row renders copied value
- **WHEN** a field row has `state: "pasted"` and `copiedValue: "Initiative Alpha"`
- **THEN** the row SHALL show the `✓` icon, `PASTED` badge (green), and `"Initiative Alpha"` on the secondary line

#### Scenario: FAILED (paste) row renders copiedValue and message together
- **WHEN** a field row has `state: "paste_failed"`, `copiedValue: "Initiative Alpha"`, and `message: "No result matched"`
- **THEN** the row SHALL show the `✕` icon, `FAILED` badge (red), and `"Initiative Alpha — No result matched"` on the secondary line

#### Scenario: FAILED (paste) row renders only message when copiedValue is absent
- **WHEN** a field row has `state: "paste_failed"`, `copiedValue: null`, and `message: "Selector not found"`
- **THEN** the secondary line SHALL show `"Selector not found"`

#### Scenario: FAILED (paste) row renders only copiedValue when message is absent
- **WHEN** a field row has `state: "paste_failed"`, `copiedValue: "Initiative Alpha"`, and `message: null`
- **THEN** the secondary line SHALL show `"Initiative Alpha"`
- **AND** `showFieldSecondary` SHALL return `true`

#### Scenario: SKIPPED row renders copiedValue and reason together
- **WHEN** a field row has `state: "skipped"`, `copiedValue: "Initiative Alpha"`, and `message: "Field already has value"`
- **THEN** the row SHALL show the `⊘` icon, `SKIPPED` badge (amber), and `"Initiative Alpha — Field already has value"` on the secondary line

#### Scenario: SKIPPED row renders only message when copiedValue is absent
- **WHEN** a field row has `state: "skipped"`, `copiedValue: null`, and `message: "Field already has value"`
- **THEN** the secondary line SHALL show `"Field already has value"`

#### Scenario: SKIPPED row renders only copiedValue when message is absent
- **WHEN** a field row has `state: "skipped"`, `copiedValue: "Initiative Alpha"`, and `message: null`
- **THEN** the secondary line SHALL show `"Initiative Alpha"`
- **AND** `showFieldSecondary` SHALL return `true`

#### Scenario: SKIPPED row secondary line hidden when both copiedValue and message absent
- **WHEN** a field row has `state: "skipped"`, `copiedValue: null`, and `message: null`
- **THEN** `showFieldSecondary` SHALL return `false`

---

### Requirement: getFieldSecondaryText and showFieldSecondary as pure module-scope functions
`sidepanel/app.js` SHALL define `getFieldSecondaryText(state)` and `showFieldSecondary(state)`
as pure, module-scope functions (not only as store-method wrappers), following the same pattern
established by `deriveFieldUIStates`, `computeHasCopiedData`, and `computeIsClearDisabled`.

Both functions MUST be exported via `module.exports` (under the `typeof module !== "undefined"`
guard) so Vitest can import and unit-test them directly without Alpine mounting.

The Alpine store methods `getFieldSecondaryText` and `showFieldSecondary` SHALL delegate
to the corresponding module-scope functions, e.g.:
```
getFieldSecondaryText(state) { return getFieldSecondaryText(state); }
showFieldSecondary(state)    { return showFieldSecondary(state); }
```

#### Scenario: Pure functions are importable by Vitest
- **WHEN** a Vitest test imports `getFieldSecondaryText` and `showFieldSecondary` from `sidepanel/app.js`
- **THEN** both SHALL be callable functions that return the correct value for any `FieldUIState` input

---

### Requirement: Clear button in User Tab
The User Tab action buttons row SHALL include a "Clear" button alongside the Copy and Paste buttons.

**Behaviour**:
1. Sends `{ action: "CLEAR_COPIED_DATA" }` to the background service worker.
2. On success: sets `hasCopiedData = false`, `lastOperation = null`, `lastPasteResults = null`.
3. Calls `deriveFieldUIStates()` — all field rows reset to `not_copied` state.
4. Clear button becomes disabled (`hasCopiedData` is now `false`).

**Clear button enabled when**: `hasCopiedData === true`. Disabled at all other times.

**Styling**: background `#F3F4F6`, text colour `#374151`. Disabled: background `#CCCCCC`, text `#888888`.

#### Scenario: Clear resets all field rows to NOT COPIED
- **WHEN** the user clicks Clear and `CLEAR_COPIED_DATA` succeeds
- **THEN** all field rows SHALL show the `NOT COPIED` badge
- **AND** `hasCopiedData` SHALL be `false`
- **AND** the Paste button SHALL be disabled

#### Scenario: Clear button is disabled before any Copy
- **WHEN** `hasCopiedData` is `false` (no data copied yet)
- **THEN** the Clear button SHALL be visually disabled and non-interactive

#### Scenario: Clear button is enabled after a successful Copy
- **WHEN** `hasCopiedData` is `true`
- **THEN** the Clear button SHALL be enabled

---

### Requirement: copiedData loaded from session storage on init
`app.js` SHALL send `{ action: "GET_COPIED_DATA" }` during `alpine:init` (alongside `GET_SETTINGS`). Both responses MUST be received before `deriveFieldUIStates()` is first called, so field states are correct from the very first render.

If `GET_COPIED_DATA` returns `{ data: null }`, `copiedData` is treated as empty (all rows show `NOT COPIED`).

#### Scenario: Previously copied data restored on panel reopen
- **WHEN** the user copied data in a previous panel session (same browser session) and reopens the side panel
- **THEN** field rows SHALL show `COPIED` / `FAILED` states reflecting the persisted `copiedData`
- **AND** this SHALL happen before any user interaction

#### Scenario: No flash of wrong state on first render
- **WHEN** both `GET_SETTINGS` and `GET_COPIED_DATA` have resolved
- **THEN** `deriveFieldUIStates()` is called once with both datasets
- **AND** the field list shows the correct states without any intermediate flash of `NOT COPIED`

---

### Requirement: Field states re-derived after TAB_CHANGED
On receipt of a `TAB_CHANGED` message, `app.js` SHALL update `pageType` then send `GET_COPIED_DATA` and re-call `deriveFieldUIStates()` with the freshly fetched `copiedData` and the current in-memory `lastPasteResults`.

This ensures copy states survive tab switches (they come from session storage). Paste states also survive within the same panel session because `lastPasteResults` is in-memory.

#### Scenario: Copy states survive switching tabs
- **WHEN** the user copies data, switches to another tab, and switches back
- **THEN** the field rows continue to show `COPIED` or `FAILED` states (not `NOT COPIED`)

#### Scenario: Paste states survive switching tabs within a session
- **WHEN** the user pastes data, switches to another tab, and switches back
- **THEN** the field rows continue to show `PASTED`, `FAILED`, or `SKIPPED` states
