## 1. Tab panel background tint

- [x] 1.1 In `sidepanel/styles.css`, locate the `[role="tabpanel"]` rule (≈ line 87). Add `background: #6b728008;` as a new property inside the existing rule block. Do not change any existing properties (`flex`, `overflow-y`, `padding`).

## 2. Field row card style

- [x] 2.1 In `sidepanel/styles.css`, locate the `.field-row` rule (≈ line 324). Add the following three properties: `background: #ffffff;`, `margin: 10px 0;`, `border-radius: 10px;`.

- [x] 2.2 In the same `.field-row` rule, **remove** the `border-bottom: 1px solid #F3F4F6;` declaration. The margin gap between cards replaces it as the visual separator. (design D-1)

- [x] 2.3 After making the changes, load the extension unpacked and visually inspect the User Tab field list. If the top of the first card or the bottom of the last card has excessive whitespace against the panel edges, add guard rules immediately after `.field-row { ... }`:
  ```css
  .field-row:first-child { margin-top: 0; }
  .field-row:last-child  { margin-bottom: 0; }
  ```
  Guard rules added proactively — the tabpanel has `padding: 12px 14px` and the
  10px margin would double-pad the edges without these guards.

## 3. Action buttons equal-width

- [x] 3.1 In `sidepanel/styles.css`, immediately after the closing brace of the `.action-buttons { ... }` block (≈ line 207), add the following new rule:
  ```css
  .action-buttons > * {
    flex: 1 1 0;
  }
  ```
  Add a comment above it explaining why the direct-child combinator is used instead of `.btn` (design D-2).

## 4. Manual QA

- [x] 4.1 Load the extension unpacked. Open the side panel on an ADO page. Confirm:
  - Panel background has a visible tint behind the field rows.
  - Each field row appears as a white rounded card with spacing between rows.
  - No horizontal separator lines are visible between rows.
  - Copy, Paste, and Clear buttons have equal widths.

- [x] 4.2 Switch to a PA page. Confirm the same visual properties hold after a Paste (pasted/skipped/failed state rows still look correct as cards).

- [x] 4.3 Confirm the Copy and Paste spinner elements (inside the context banner rows) are NOT affected by the equal-width rule — they should remain at their natural size.

## 5. Commit

- [x] 5.1 Stage `sidepanel/styles.css` only. Commit with message:
  `fix(ux): field-row card style, tab panel tint, equal-width action buttons`
  Committed: e44d0f7
