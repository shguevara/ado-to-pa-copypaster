## Why

Phase 11's reviewer identified a 🟡 Should Fix: the secondary line for `paste_failed` and
`skipped` field states omits the `copiedValue`, showing only the error/skip message.
The spec table (user-tab-field-states) requires **"copiedValue (if any) + message"** for both
states. This fix closes that gap so users can always see what value was attempted, even when a
paste fails or is skipped.

## What Changes

- **`getFieldSecondaryText(state)`** — for `paste_failed` and `skipped`, concatenate
  `state.copiedValue` (when non-empty) and `state.message` (when non-empty) with ` — ` separator,
  matching the reviewer's suggested fix in COMMENTS.md.
- **`showFieldSecondary(state)`** — for `paste_failed` and `skipped`, return `true` when
  *either* `copiedValue` or `message` is non-null/non-empty (not just when message exists).
- **Unit tests** — add/extend tests for `getFieldSecondaryText` and `showFieldSecondary` covering
  the corrected `paste_failed` and `skipped` paths (copiedValue only, message only, both).

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `user-tab-field-states`: Secondary-line display rule updated — `paste_failed` and `skipped`
  states must show `copiedValue` (if any) prepended to the message, not just the message alone.

## Impact

- `sidepanel/app.js` — `getFieldSecondaryText()` and `showFieldSecondary()` helper methods
- `tests/field-state.test.js` or a new test file — additional cases for the corrected helpers
- No storage schema changes, no manifest changes, no new permissions
