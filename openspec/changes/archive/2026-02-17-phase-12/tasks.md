## 1. Failing Tests (TDD — write before implementation)

- [x] 1.1 In `tests/field-state.test.js`, import `getFieldSecondaryText` from `sidepanel/app.js` (expect this import to fail or return undefined until task 2.3 is done — that is the failing baseline). Add test: `paste_failed` with `copiedValue: "Initiative Alpha"` and `message: "No match"` → returns `"Initiative Alpha — No match"` (spec: secondary line = copiedValue + ` — ` + message)
- [x] 1.2 Add test: `paste_failed` with `copiedValue: "Initiative Alpha"` and `message: null` → returns `"Initiative Alpha"` (copiedValue only; `showFieldSecondary` must return true)
- [x] 1.3 Add test: `paste_failed` with `copiedValue: null` and `message: "No match"` → returns `"No match"` (message only; unchanged from current behaviour)
- [x] 1.4 Add test: `paste_failed` with `copiedValue: null` and `message: null` → returns `""` and `showFieldSecondary` returns `false`
- [x] 1.5 Add test: `skipped` with `copiedValue: "Initiative Alpha"` and `message: "Field already has value"` → returns `"Initiative Alpha — Field already has value"`
- [x] 1.6 Add test: `skipped` with `copiedValue: "Initiative Alpha"` and `message: null` → returns `"Initiative Alpha"` (copiedValue only; `showFieldSecondary` must return `true`)
- [x] 1.7 Add test: `skipped` with `copiedValue: null` and `message: "Field already has value"` → returns `"Field already has value"` (message only; unchanged from current behaviour)
- [x] 1.8 Add test: `skipped` with `copiedValue: null` and `message: null` → returns `""` and `showFieldSecondary` returns `false`
- [x] 1.9 Import `showFieldSecondary` from `sidepanel/app.js` and add regression tests confirming existing correct behaviour is preserved: `not_copied` → false; `copied` with non-empty copiedValue → true; `copied` with empty copiedValue → false; `copy_failed` with message → true; `pasted` with non-empty copiedValue → true (spec §7.2 secondary line visibility rules)

## 2. Implementation (sidepanel/app.js — design D-1)

- [x] 2.1 Above the `Alpine.store(...)` call, define the module-scope pure function `getFieldSecondaryText(state)` with the corrected logic for `paste_failed` and `skipped`: build a `parts` array from non-empty `copiedValue` and non-empty `message`, then `return parts.join(" — ")`. Keep existing logic for all other states (`copy_failed` → message only; `copied`/`pasted` → copiedValue; default → `""`). Comment explaining why pure extraction enables Vitest coverage (design D-1).
- [x] 2.2 Define the module-scope pure function `showFieldSecondary(state)` with the corrected logic: for `paste_failed` and `skipped`, return `true` when **either** `state.copiedValue` (non-null and non-empty) **or** `state.message` (non-null and non-empty) is present. Keep existing logic for all other states unchanged.
- [x] 2.3 Add `getFieldSecondaryText` and `showFieldSecondary` to the `module.exports` guard at the bottom of `sidepanel/app.js` (alongside the existing exports: `deriveFieldUIStates`, `computeHasCopiedData`, `computeIsClearDisabled`).
- [x] 2.4 Inside `Alpine.store(...)`, replace the `getFieldSecondaryText(state)` store method body with a one-line delegation: `return getFieldSecondaryText(state);`. Do the same for `showFieldSecondary(state)`. Both store methods must retain their method definitions (CSP-safe — Alpine directives call the store methods, not the module-scope functions directly).

## 3. Verification

- [x] 3.1 Run `npm test` — all tests must be green (160 pre-existing + new tests added in section 1). Zero failures permitted before committing.
- [x] 3.2 Manual QA (MT-36): Open the side panel on a PA form page, trigger a Paste where at least one field is skipped (overwrite mode off, field already has a value). Confirm the SKIPPED row secondary line shows `"<copiedValue> — Field already has value"` (not just the message).
- [x] 3.3 Manual QA (MT-37): Trigger a paste where at least one field fails (e.g., lookup no-match). Confirm the FAILED row secondary line shows `"<copiedValue> — <error message>"` (not just the error message).
- [x] 3.4 Commit: stage `sidepanel/app.js` and `tests/field-state.test.js`; message must reference the COMMENTS.md 🟡 item (secondary line copiedValue fix for paste_failed / skipped).
