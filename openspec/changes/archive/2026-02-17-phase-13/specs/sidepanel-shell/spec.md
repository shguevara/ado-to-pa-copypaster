## MODIFIED Requirements

### Requirement: Tab panel visual styling
`sidepanel/styles.css` SHALL apply a subtle background tint to `[role="tabpanel"]`
so that white field-row cards are visually distinct from the panel backdrop.

The `[role="tabpanel"]` rule SHALL include `background: #6b728008` in addition to
the existing layout properties (`flex: 1`, `overflow-y: auto`, `padding: 12px 14px`).

#### Scenario: Tab panel has tinted background
- **WHEN** either the User tab or Admin tab panel is visible
- **THEN** the panel area SHALL render with the `#6b728008` background tint

---

### Requirement: Field row card visual style
Each `.field-row` element SHALL render as a distinct white card with rounded corners
and vertical spacing between cards, replacing the previous flat-list separator style.

The `.field-row` rule SHALL include:
- `background: #ffffff`
- `margin: 10px 0`
- `border-radius: 10px`

The `.field-row` rule SHALL NOT include `border-bottom` (removed — the margin gap
between cards provides the visual separation previously served by the border).

#### Scenario: Field rows render as rounded cards
- **WHEN** the User Tab displays field rows
- **THEN** each row SHALL appear as a white card with rounded corners (`border-radius: 10px`)
- **AND** consecutive rows SHALL be separated by vertical space (`margin: 10px 0`)
- **AND** no horizontal separator line SHALL appear at the bottom of each row

#### Scenario: First and last cards do not double-margin against panel padding
- **WHEN** the field list is visible
- **THEN** the top of the first card and the bottom of the last card SHALL sit flush
  against the panel's existing `padding: 12px 14px` without excessive whitespace
  (add `:first-child { margin-top: 0 }` / `:last-child { margin-bottom: 0 }` guards
  if visual bleed is observed during manual QA)

---

### Requirement: Action buttons equal-width distribution
All direct children of `.action-buttons` SHALL share the available row width equally.

A new rule `.action-buttons > * { flex: 1 1 0; }` SHALL be added immediately after
the `.action-buttons { ... }` block. This ensures the Copy, Paste, and Clear buttons
each occupy one-third of the button bar regardless of label length.

#### Scenario: Copy, Paste, and Clear buttons have equal width
- **WHEN** the User Tab action button bar is visible with all three buttons enabled or disabled
- **THEN** each button SHALL occupy the same horizontal space in the bar

#### Scenario: Spinner elements inside context banners are unaffected
- **WHEN** the Copy or Paste spinner is visible
- **THEN** the spinner SHALL NOT be resized by the `.action-buttons > *` rule
  (spinners are inside `.context-banner` rows, not direct children of `.action-buttons`)
