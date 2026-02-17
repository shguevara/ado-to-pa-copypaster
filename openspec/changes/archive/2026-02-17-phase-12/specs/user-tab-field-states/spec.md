## ADDED Requirements

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

## MODIFIED Requirements

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
