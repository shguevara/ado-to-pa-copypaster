# Retrospective — Phase 3: Side Panel Shell & Navigation

**Date**: 2026-02-15
**Commits**: `9348151` (impl) → `8e4d51f` → `733e757` → `9ff82c9` (fixes) → `5bba8c4` (done)

---

## What went wrong

Three bugs required fix commits after the initial implementation.
All three were caught during manual verification (tasks 5.1–5.4).

---

### Bug 1 — Missing `x-data` on the root element

**Symptom**: All tab panels and all three banner rows were visible simultaneously.
Clicking tabs did nothing. No console errors.

**Root cause**: Alpine.js does not process any directive (`x-show`, `@click`, `:class`)
unless the element is inside a component scope declared with `x-data`. Without it,
Alpine silently ignores the entire DOM.

**Fix**: Added `x-data` to `<div id="app">`.

**Action**: When scaffolding any Alpine.js UI, the very first thing to verify is that
a root `x-data` element wraps all directive-bearing HTML. Add it in the same commit
as the first directive — never defer it.

---

### Bug 2 — Standard Alpine.js build blocked by Chrome MV3 CSP

**Symptom**: `Uncaught EvalError: Evaluating a string as JavaScript violates the
following Content Security Policy directive because 'unsafe-eval' is not an allowed
source of script.`

**Root cause**: The standard Alpine.js build evaluates inline expressions
(`@click="..."`, `:class="{...}"`) by constructing a `new AsyncFunction(expression)`
at runtime. Chrome MV3's default Content Security Policy blocks `unsafe-eval`, which
covers both `eval()` and `new Function()` / `new AsyncFunction()`.

The design document noted this constraint correctly ("MV3 CSP forbids `unsafe-eval`;
Alpine.js v3 must be used") but drew the wrong conclusion — Alpine v3 still uses
`new AsyncFunction` in its standard build. The CSP-safe build is a **separate package**:
`@alpinejs/csp`.

**Fix**: Replaced `lib/alpine.min.js` with the `@alpinejs/csp@3.15.8` build downloaded
from jsDelivr.

**Action**: For any Chrome extension project using Alpine.js, always download
`@alpinejs/csp`, never the standard build. Document this explicitly in SPEC.md and
the README. The library filename (`alpine.min.js`) is deceptive — add "CSP build" to
the version comment so it is obvious which build is in use.

---

### Bug 3 — Property assignment through `$store` is silently dropped in the CSP build

**Symptom**: After fixing Bug 2, the page context banner worked but clicking the
Admin tab did nothing — the User tab stayed active.

**Root cause**: The Alpine CSP build replaces `new AsyncFunction` with a custom
expression parser. This parser handles **reads** through magic property chains
(`$store.app.activeTab === 'user'` ✅) but **silently drops assignments** through them
(`$store.app.activeTab = 'admin'` ❌). No error is thrown; the expression evaluates
to the right-hand side value and the assignment is lost.

The banner appeared to work because `pageType` was being set from JavaScript code
(`Alpine.store("app").pageType = ...` in `app.js`), not from a directive expression
— so that code path never hit the parser limitation.

**Fix**: Added a `setTab(tab)` method to the store. Method calls are fully supported
by the CSP parser. `@click="$store.app.setTab('admin')"` works correctly.

**Action**: When using the Alpine CSP build, **never write to `$store` properties
from directive expressions**. Instead, expose store methods for all mutations and
call them from event handlers. This is a hard rule, not a preference. Apply it to
all future phases whenever a directive needs to update store state.

---

## Summary table

| # | What went wrong | Root cause | Fix | Action going forward |
|---|---|---|---|---|
| 1 | All Alpine directives inert | No `x-data` on root element | `<div id="app" x-data>` | Always add `x-data` to the root wrapper in the same commit as the first directive |
| 2 | `EvalError` on load | Standard Alpine uses `new AsyncFunction`, blocked by MV3 CSP | Replace with `@alpinejs/csp` build | Always use `@alpinejs/csp` in Chrome extensions; document it in SPEC.md and README |
| 3 | Tab clicks silently ignored | CSP build drops `$store.x = y` assignments in directive expressions | Use `setTab()` store method | Never assign to `$store` properties from directives; always expose mutation methods on the store |
