## Context

Phase 11 introduced the field-row list and action button bar to the User Tab. The
visual design used a flat-list pattern (rows separated by `border-bottom`) and
content-driven button widths. Phase 12 shipped the secondary-line fix. Neither
addressed the card-style visual treatment intended for field rows, the tinted
backdrop that gives the cards depth, or the unequal button widths.

This change is CSS-only: three targeted edits to `sidepanel/styles.css`. No HTML,
JS, storage, or manifest changes are involved.

## Goals / Non-Goals

**Goals:**
- Give the `[role="tabpanel"]` a subtle tinted background so field-row cards
  visually pop against the panel backdrop.
- Convert `.field-row` from a flat bordered line to a rounded white card with
  vertical margin spacing.
- Make all `.action-buttons` direct children share width equally via flex.

**Non-Goals:**
- Changing any other visual properties of the field rows (padding, font sizes,
  badge colours, icon alignment) — those are correct as-is.
- Changing anything outside `sidepanel/styles.css`.
- Adding automated visual regression tests (the no-build, no-Playwright constraint
  makes this impractical; manual QA is sufficient for CSS-only changes).

## Decisions

### D-1 — Remove `border-bottom` when switching .field-row to card style

**Decision:** When adding `border-radius: 10px` and `margin: 10px 0` to
`.field-row`, the existing `border-bottom: 1px solid #F3F4F6` separator MUST be
removed simultaneously.

**Why:** A flat underline on a rounded element renders incorrectly — the line
extends through the border-radius curve and creates a visual artifact at the
bottom corners. The margin gap between cards provides the same visual separation
function that the border-bottom previously served, so removing it is a safe swap.

### D-2 — Use direct child combinator for equal-width buttons

**Decision:** The new flex rule targets `.action-buttons > *` (direct children),
not `.action-buttons .btn` (all descendant buttons).

**Why:** Spinner `<span>` elements that were previously inside `.action-buttons`
were relocated to the context banner rows in commit `7d2259f`. The only direct
children of `.action-buttons` are now the three `<button>` elements (Copy, Paste,
Clear). Using `> *` instead of `.btn` future-proofs the selector and avoids
needing to know the button class name. If a non-button element is ever added as a
direct child (e.g., a divider), `flex: 1 1 0` will stretch it too — acceptable
risk given the stable structure of this component.

### D-3 — No tests for CSS-only changes

**Decision:** No Vitest tests added; manual visual QA is the verification method.

**Why:** The project has no automated visual regression testing infrastructure
(Playwright is untracked/uncommitted; no-build constraint rules out Storybook or
similar). The changes are small, deterministic, and immediately visible. A manual
check of the side panel on any page type is sufficient.

## Risks / Trade-offs

- **First/last card margin bleed** → `.field-row:first-child { margin-top: 0 }` /
  `.field-row:last-child { margin-bottom: 0 }` can be added if the top/bottom
  margin interacts badly with the panel's `padding: 12px 14px`. Developer should
  check at implementation time and add these guards if needed.
- **`flex: 1 1 0` on all direct children** → if a future non-button element is
  added as a direct child of `.action-buttons`, it will also stretch. Low risk
  given the stable structure.
- **Background colour on tabpanel** → `#6b728008` is a very low-opacity token.
  If the host OS or Chrome theme sets its own background, the tint may be
  imperceptible. Acceptable — the card-on-tint effect is an enhancement, not a
  functional requirement.

## Migration Plan

1. Open `sidepanel/styles.css`.
2. Add `background: #6b728008` to the existing `[role="tabpanel"]` rule (line ~87).
3. In the `.field-row` rule (line ~324): add `background: #ffffff; margin: 10px 0;
   border-radius: 10px;` and remove `border-bottom: 1px solid #F3F4F6`.
4. Add new rule `.action-buttons > * { flex: 1 1 0; }` immediately after the
   `.action-buttons { ... }` closing brace (line ~207).
5. Load the extension unpacked in Chrome, open the side panel, and visually verify
   all three changes on an ADO page and a PA page.
6. Commit: stage `sidepanel/styles.css` only.
