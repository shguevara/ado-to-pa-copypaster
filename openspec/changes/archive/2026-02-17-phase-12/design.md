## Context

Phase 11 shipped `getFieldSecondaryText(state)` and `showFieldSecondary(state)` as
Alpine store methods in `sidepanel/app.js`. The Phase 11 reviewer flagged a 🟡 Should Fix:
for `paste_failed` and `skipped` states both helpers only consider `state.message`, ignoring
`state.copiedValue`. The spec requires the secondary line to show
**"copiedValue (if any) + message"** for those two states — so a user can always see what
value was attempted even when a paste fails or is skipped.

The helpers were deliberately designed to be store methods (CSP-safe: no arrow functions,
no template literals in `x-data` directives). Because they live inside the Alpine store
closure they cannot currently be unit-tested without mounting Alpine.

## Goals / Non-Goals

**Goals:**
- Fix `getFieldSecondaryText` so `paste_failed` / `skipped` return
  `"<copiedValue> — <message>"`, `"<copiedValue>"` (no message), or `"<message>"` (no value).
- Fix `showFieldSecondary` so `paste_failed` / `skipped` return `true` whenever
  *either* `copiedValue` (non-empty) or `message` (non-empty) is present.
- Enable direct Vitest unit tests for both corrected helpers without Alpine mounting.

**Non-Goals:**
- Changing behaviour for `copied`, `pasted`, `copy_failed`, or `not_copied` states.
- Changing `getFieldSecondaryClass` (it is correct as-is).
- Changes to `deriveFieldUIStates`, store shape, service worker, or HTML template.

## Decisions

### D-1 — Extract helpers as pure module-scope functions

**Decision:** Extract `getFieldSecondaryText` and `showFieldSecondary` as pure,
module-scope functions (same pattern as `deriveFieldUIStates` in Phase 11), and have
the store methods delegate to them. Export via `module.exports` guard so Vitest can
import them directly.

**Why over "keep as store methods and test manually":**
- Phase 11 already established this extraction pattern for `deriveFieldUIStates`,
  `computeHasCopiedData`, and `computeIsClearDisabled`. Consistency matters for
  maintainability.
- Pure functions are trivially testable with Vitest — no Alpine mounting, no mocking of
  `this`, no JSDOM complexity.
- The COMMENTS.md "Missing Tests" section explicitly listed both helpers as candidates
  for extraction.
- CSP compliance is unaffected: the store method wrapper still exists; Alpine directives
  still call the store method (not the module-scope function directly).

**Alternative considered:** Add integration tests that drive Alpine through JSDOM. This
is much heavier and fragile; the extraction approach is strictly simpler.

### D-2 — Separator character between copiedValue and message

**Decision:** Use ` — ` (space + em-dash + space) as the separator, matching the
reviewer's suggestion in COMMENTS.md.

**Why:** The em-dash clearly separates two semantically distinct pieces of information
(the value that was attempted vs. the reason it was not applied). It is visually
distinct without requiring CSS, and it matches common UI patterns for "value — status".

### D-3 — Test file placement

**Decision:** Add the new helper tests to `tests/field-state.test.js` (extending the
existing file) rather than creating a new file.

**Why:** `field-state.test.js` already covers all module-scope helpers from `app.js`
(`deriveFieldUIStates`, `computeHasCopiedData`, `computeIsClearDisabled`). Adding the
two new helpers there keeps all field-display logic tests co-located and avoids
fragmentation.

## Risks / Trade-offs

- **Extraction introduces two new module.exports entries** → Minimal risk; the guard
  pattern (`if (typeof module !== "undefined") { module.exports = ... }`) is already
  established in app.js and is known to work with the extension's no-build model.
- **Store method wrapper adds one layer of indirection** → Negligible at runtime; the
  wrapper is a one-liner delegation call.

## Migration Plan

1. Extract `getFieldSecondaryText` and `showFieldSecondary` to module scope (pure functions).
2. Update the logic per the bug fix (paste_failed / skipped paths).
3. Add the module-scope names to `module.exports`.
4. Replace the store method bodies with delegation calls to the pure functions.
5. Add Vitest tests covering all states (6 states × meaningful input combinations).
6. Run full test suite — all 160 existing tests + new tests must pass.
7. Commit with a clear message referencing the COMMENTS.md issue.
