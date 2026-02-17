## Why

Post-phase-12 UX polish: three CSS-only tweaks improve the visual hierarchy of the
User Tab. Field rows currently render as flat lines separated by a bottom border;
the design intent is a card-per-row layout with a tinted panel backdrop. Action
buttons are also inconsistently sized because their widths are content-driven rather
than evenly distributed.

## What Changes

- **`[role="tabpanel"]`** — add `background: #6b728008` to give the tab content
  area a subtle warm-gray tint that creates visual depth beneath the white field-row
  cards.
- **`.field-row`** — add `background: #ffffff; margin: 10px 0; border-radius: 10px`
  to render each row as a distinct white card; remove the existing
  `border-bottom: 1px solid #F3F4F6` separator (replaced by the margin gap between
  cards — the flat underline is incompatible with the rounded card shape).
- **`.action-buttons > *`** (new rule) — add `flex: 1 1 0` so the Copy, Paste, and
  Clear buttons share the available row width equally regardless of label length.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `sidepanel-shell`: visual styling rules for tab panel background, field-row card
  shape, and action button width distribution are changing.

## Impact

- `sidepanel/styles.css` only — three targeted edits, no JS or HTML changes.
- No storage schema changes, no manifest changes, no new permissions.
- No unit tests required (pure visual CSS with no logic).
