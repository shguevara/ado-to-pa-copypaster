# Spec Addendum v1.4 – User Tab UI Enhancements

## Scope

Enhance the **User tab** to:

1. Always display enabled mappings.
2. Show per-field Copy and Paste states with badges, icons, values, and error messages.
3. Add a Clear action.
4. Align button styling and context banners with approved UI reference.

---

# 1. Active Mapped Fields Always Visible

## Requirement

The User tab must always render the list of enabled mappings, even before any Copy action occurs.

## Behavior

Each row displays:

- Left icon placeholder (empty or neutral when not copied)
- Mapping label (for example: "ADO Id")
- Right-aligned status badge:
  - Default state: NOT COPIED

## Data Source

Enabled mappings are derived from:

```ts
AppSettings.mappings.filter(m => m.enabled)
```

Initial UI state is derived from mappings, not from previous operations.

## Acceptance Criteria

- When opening the side panel, enabled mappings are visible immediately.
- Before Copy, all rows show NOT COPIED.

---

# 2. Copy Field States (Azure DevOps)

## Requirement

After clicking Copy on an Azure DevOps Initiative page, each field row must transition to:

- COPIED (success)
- FAILED (error)

If COPIED, the copied value must appear under the label.

## Session Storage Model Update

Replace previous rule of storing only successful values.

Store all outcomes

## UI Rules

- COPIED:
  - Badge: COPIED
  - Value shown on second line
- FAILED:
  - Badge: FAILED
  - Error message shown below label

## Acceptance Criteria

- Copy results persist when switching tabs.
- Copied values are visible under the mapping name.
- Failures show the returned error message.

---

# 3. Paste Field States (PowerApps)

## Requirement

After clicking Paste on a PowerApps form, each field row must transition to:

- PASTED
- FAILED
- SKIPPED

## Status Mapping

| FieldResult.status | UI Badge | Icon |
|--------------------|----------|------|
| success            | PASTED   | Check |
| error              | FAILED   | X |
| skipped            | SKIPPED  | Forbidden |


## UI Rules

- PASTED:
  - Check icon
  - Badge: PASTED
- FAILED:
  - X icon
  - Badge: FAILED
  - Error message displayed
- SKIPPED:
  - Forbidden icon
  - Badge: SKIPPED
  - Message displayed (for example: "Field already has value")

If a copied value exists, display it under the mapping label for all states.

## Acceptance Criteria

- All rows display correct badge and icon.
- Error and skipped messages are visible.
- State persists until Clear or next Copy.

---

# 4. Action Buttons Enhancements

## 4.1 Clear Button

### Requirement

Add a Clear button in the User tab.

### Behavior

- Clears chrome.storage.session.copiedData
- Resets all rows to NOT COPIED
- Disables Paste button


### Acceptance Criteria

- After Clear:
  - Field list remains visible
  - All badges reset
  - Paste button disabled

---

## 4.2 Button Styling Requirements

### Typography

- Font size: 12px
- Height: 48px
- Horizontal padding consistent with reference UI

### Colors

- Copy button: rgb(0, 120, 212) (#0078D4)
- Paste button: rgb(116, 39, 116) (#742774)
- Disabled button: rgb(204, 204, 204) (#CCCCCC)

---

# 5. Context Banners

## Requirement

Replace existing banner with simplified contextual banners:

- Azure DevOps
- PowerApps
- Unsupported

Each banner contains:

- Colored dot on left
- Single label text
- Background fill and border

---

## Azure DevOps Banner

- Background: rgb(227, 242, 253) (#E3F2FD)
- Border: rgb(144, 202, 249) (#90CAF9)
- Dot: 🔵
- Text: rgb(21, 101, 192) (#1565C0)

---

## PowerApps Banner

- Background: rgb(243, 229, 245) (#F3E5F5)
- Border: rgb(206, 147, 216) (#CE93D8)
- Dot: 🟣
- Text: rgb(123, 31, 162) (#7B1FA2)

---

## Unsupported Banner

- Background: #FFFFFF
- Border: rgb(224, 224, 224) (#E0E0E0)
- Dot: ⚪
- Label: "This page is not supported."

---

# Required SPEC.md Updates

1. Update Data Model section to include full CopiedFieldData storage.
2. Add CLEAR_COPIED_DATA to message contracts.
3. Update User Tab layout section to:
   - Always render enabled mappings
   - Show per-field state transitions
   - Add Clear button
4. Update Alpine store logic to:
   - Maintain field UI states
   - Provide clearCopiedData() method
   - Derive UI state from mappings + session data

---

# Rationale

- Improved transparency during Copy and Paste operations.
- Faster debugging of DOM selector failures.
- Stable UI experience through persistent field visibility.
- Explicit reset mechanism to avoid stale session data.
- Visual consistency aligned with approved UI reference.

# Final check
Review the attached PNG for matching padding and spacing
