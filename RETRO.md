# Retrospective — Phase 7: ADO Reader + Copy Initiative Flow

**Date**: 2026-02-15
**Commits**: `c733e45` (implementation) → `8e468f5` (fix: importScripts path)

---

## What went well

Phase 7 was the first phase that touched Chrome script injection — a higher-risk
area than pure storage or UI work — and it landed with only one runtime bug.

Specific highlights:

- **TDD applied to injectable code**: `adoReaderMain` is executed inside the ADO
  page's isolated world by Chrome, making it impossible to test end-to-end without
  a real ADO tab. The mock-doc strategy (design D-3) made the function fully
  testable in Node.js by injecting a plain object with `querySelector` and `location`
  properties. All 12 tests were green before the service-worker integration was
  wired. When the extension was loaded in Chrome, it worked first try.

- **CSP-safe helper pattern applied upfront**: Lessons from phases 3 and 5 were
  applied directly — `isCopyDisabled()` and `hasCopyResults()` were written as store
  methods from the start rather than using `||` / `&&` inline in directives. Zero
  CSP parser errors on first load.

- **BR-002 per-field isolation is clean**: The `try/catch` wrapping each field in
  `adoReaderMain`'s loop, combined with the inner `readField()` function, means
  a broken selector on one field never blocks the others. The design of returning
  a typed `status:"error"` result (rather than filtering the field out) gives the
  user visibility into exactly which fields failed and why.

---

## What went wrong

### Bug 1 — `importScripts` path resolved relative to the SW, not the extension root

**Symptom**: On first extension reload after implementation, the service worker
failed to start:

```
Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope':
The script at 'chrome-extension://.../background/scripts/ado-reader.js' failed to load.
Service worker registration failed. Status code: 15
```

**Root cause**: The design doc stated "Chrome resolves relative to the extension
root for SW scripts" — this was incorrect. `importScripts` resolves paths relative
to the service worker script's own URL. Since the SW lives at
`background/service-worker.js`, `importScripts("scripts/ado-reader.js")` resolved
to `background/scripts/ado-reader.js` instead of the intended `scripts/ado-reader.js`
at the extension root.

**Fix**: Changed the path to `"../scripts/ado-reader.js"` — stepping up from
`background/` to the extension root before entering `scripts/`.

**Action**: Any `importScripts` call in a service worker that is not at the
extension root must use a path relative to the SW's own location. A SW at
`background/service-worker.js` needs `"../"` to reach the extension root.
Document this in the design whenever `importScripts` is used from a subdirectory.

---

### Bug 2 — Vitest v2 silently skipped ado-reader tests due to jsdom auto-detection

**Symptom**: Running `npm test` showed 25 tests from the two existing test files
passing, but `tests/ado-reader.test.js` appeared nowhere in the output — not
"failed", simply absent. When running that file alone: "no tests".
The runner reported one unhandled error: `Cannot find package 'jsdom'`.

**Root cause**: `scripts/ado-reader.js` contains `doc = document` (default parameter)
and `window.location` (function body fallback). Vitest v2's static source analysis
detected these browser globals in an imported file and attempted to switch the test
worker to a `jsdom` environment. Since `jsdom` is not installed, the worker's setup
threw before the test file was collected. The failure mode was silent — the file
simply disappeared from the run rather than appearing as a test error.

The existing tests (`detect-page-type.test.js`, `import-validator.test.js`) were
unaffected because their imported files either guard DOM references with
`typeof` checks or contain no DOM globals at all.

**Fix**: Two changes together:
1. Added `vitest.config.js` with `environment: "node"` to lock the global default.
2. Added `@vitest-environment node` annotation to `tests/ado-reader.test.js`.
   The explicit per-file annotation takes priority over any detection heuristic.

**Action**: Any test file that imports a module containing `document` or `window`
references — even inside function bodies — should carry a `@vitest-environment node`
annotation. This is now a project convention: add the annotation whenever the
imported source file operates on browser globals and uses the mock-doc pattern
rather than a real DOM.

---

## Summary table

| # | What happened | Root cause | Fix | Action going forward |
|---|---|---|---|---|
| 1 | `importScripts` 404 on extension load | Paths in `importScripts` are SW-relative, not extension-root-relative | Changed to `"../scripts/ado-reader.js"` | SW not at root: always prefix with `"../"` to reach extension root; verify path in Chrome error message immediately |
| 2 | `ado-reader.test.js` silently skipped; jsdom error | Vitest v2 detected `document`/`window` in imported file and tried to load jsdom | Added `@vitest-environment node` to test file + `vitest.config.js` | Add `@vitest-environment node` to any test file importing a module that references browser globals |

---

# Retrospective — Phase 6: Export / Import

**Date**: 2026-02-15
**Commits**: `3cd5777` (TDD red→green) → `023573b` (activate buttons) → `6ae8827` (mark tasks complete) → `ca99982` (fix: review items)

---

## What went well

Phase 6 was the cleanest phase to date. No bugs were found in manual verification — all
8 MT flows passed on first load. The implementation landed in two clean commits before
the fix commit, and all five design decisions from `design.md` were correctly applied
without deviation.

Specific highlights:

- **TDD was strictly observed**: 8 failing tests were written and confirmed red before a
  single line of production code was written. The test suite became the spec executable.
- **`validateImportData` at module scope**: extracting the validation function outside the
  Alpine store made it trivially testable from Node.js with zero test infrastructure
  overhead. The same conditional-export pattern (`if (typeof module !== "undefined")`)
  already established by `detectPageType` in `service-worker.js` was reused cleanly.
- **All 5 design decisions applied correctly**: in-memory export (no extra `GET_SETTINGS`
  round-trip), key-presence check for `overwriteMode`, immediate `value = ""` reset for
  same-file re-selection, `importMessage` cleared at attempt start, and helper methods
  to work around CSP parser limits.

---

## What was caught in review

### Issue 1 — `SAVE_SETTINGS` failure during import showed "success" (🔴 MUST FIX)

**Symptom**: If `SAVE_SETTINGS` failed (e.g. runtime error or service worker rejection),
the subsequent `GET_SETTINGS` reloaded old data, leaving the mapping list unchanged —
but `importMessage` was unconditionally set to `{ type: "success", text: "Mappings imported
successfully." }`. The user saw a green success banner while nothing was saved.

**Root cause**: The Promise wrapping `SAVE_SETTINGS` called `resolve()` unconditionally
in the callback regardless of the outcome. The success message was then always set after
the `await`, with no guard for the failure case. SPEC.md §8.5 requires an inline error
when `SAVE_SETTINGS` fails.

**Fix**: Added a `saveSucceeded = true` flag in the Promise closure. Both error branches
(`chrome.runtime.lastError` and `!response?.success`) set it to `false`. A guard after
the `await` returns early with an inline error message if `saveSucceeded` is false.

**Action**: Every `SAVE_SETTINGS` call that must give user-visible feedback on failure
should use the `saveSucceeded` callback-flag pattern established here. This is now the
third SAVE_SETTINGS caller in `app.js` (`addMapping`, `saveSettings`, `importMappings`)
— the pattern is now a project convention.

---

### Issue 2 — Required-field tests covered only 2 of 6 fields; §9.2 100% coverage gap (🟡 SHOULD FIX)

**Symptom**: Tests 1.5 (`fieldSchemaName` missing) and 1.6 (`label` missing) were the
only per-field tests. The remaining four required fields — `id`, `adoSelector`, `fieldType`
(absent key), and `enabled` — had no corresponding tests. SPEC.md §9.2 explicitly requires
100% validation rule coverage.

**Root cause**: The TDD approach correctly specified 8 test cases for the 8 tasks in
section 1 of `tasks.md`. Tasks 1.5 and 1.6 were written against the two most
"interesting" required fields (the ones most likely to be absent in real import files),
but the other four were not in the task list. Because `validateImportData` uses a
deterministic `for...of` loop over `REQUIRED_FIELDS`, any single-field test exercises
the same code path — but that is a correctness argument, not a coverage argument.
SPEC.md's rule is absolute.

**Fix**: Tests 1.9–1.12 added for `id`, `adoSelector`, `fieldType` (absent key, distinct
from 1.7's invalid-value case), and `enabled`.

**Action**: When writing TDD tests for a loop over a fixed array of keys (e.g.
`REQUIRED_FIELDS`), write one test per array entry — even if the code path is identical.
The tests prove the array is complete, not just that the loop fires. List all entries in
the task breakdown upfront.

---

### Bonus: Empty-string label accepted by `== null` guard (🟢 NICE TO HAVE, addressed)

**Symptom**: A mapping entry with `label: ""` passed the required-field check because
`"" != null` and `"label" in entry`. The spec defines `label` as "non-empty string"
(SPEC.md §4.4), so an empty string is semantically missing.

**Fix**: Extended the guard from `entry[field] == null` to also check `|| entry[field] === ""`
so that empty strings are rejected at Rule 3. Test 1.13 added. The `enabled` field is
boolean so `=== ""` never fires on it.

**Action**: When a spec defines a field as "non-empty string", the required-field guard
must include an empty-string check — `== null` alone is insufficient. Note this in the
next phase's task template wherever string fields are validated.

---

## Summary table

| # | What happened | Root cause | Fix | Action going forward |
|---|---|---|---|---|
| 1 | SAVE_SETTINGS failure silently showed "success" | `resolve()` called unconditionally; no guard on failure path | `saveSucceeded` flag + early return on failure | Use `saveSucceeded` callback-flag pattern for all SAVE_SETTINGS callers that surface user feedback |
| 2 | Only 2/6 required fields tested; §9.2 coverage gap | Task breakdown listed 2 representative fields, not all 6 | Tests 1.9–1.12 added | Write one test per REQUIRED_FIELDS entry, not just representative ones |
| 3 | `label: ""` passed required-field check | `== null` does not catch empty strings | `=== ""` guard added; test 1.13 | For "non-empty string" spec fields, always include `=== ""` in the required-field check |

---

# Retrospective — Phase 5: Admin Tab CRUD

**Date**: 2026-02-15
**Commits**: `b7a1d1e` (impl) → `ffb9349` (fix) → `003b8c8` (done)

---

## What went wrong

Two classes of bugs required a fix commit after the initial implementation.
Both were caught on the first manual verification pass (task 10.1).

---

### Bug 1 — `?.`, `??`, and template literals are not supported in Alpine CSP directive expressions

**Symptom**: On first load of the Admin tab, the mapping list was blank (no "Title" or
"Initiative ID" rows), and the DevTools console showed:

```
Uncaught Error: CSP Parser Error: Unexpected token: PUNCTUATION "."
```

**Root cause**: The Alpine CSP build replaces `new AsyncFunction` with a hand-written
expression parser. That parser does not implement optional chaining (`?.`), nullish
coalescing (`??`), or template literals. Three directive expressions triggered it:

- `:checked="$store.app.settings?.overwriteMode"` — `?.` on `settings`
- `x-show="($store.app.settings?.mappings ?? []).length === 0"` — `?.` and `??`
- `x-for="mapping in ($store.app.settings?.mappings ?? [])"` — same
- `:class="\`badge--${mapping.fieldType}\`"` — template literal

Because `settings` starts as `null` while `GET_SETTINGS` is in flight, the null guard
felt necessary inline. The correct approach is to push the guard into a JavaScript
store method where the full language is available, and expose a plain method call to
the HTML.

**Fix**: Added `getMappings()` and `getOverwriteMode()` store methods that do the
null-guarding in JS and return a safe value. Replaced the template-literal `:class`
with object-syntax using three explicit `===` comparisons.

**Action**: The Alpine CSP expression parser supports: property access, method calls,
comparison operators (`===`, `!==`, `<`, etc.), logical operators (`&&`, `||`, `!`),
ternary (`? :`), string/number/boolean literals, array and object literals.
It does **not** support: `?.`, `??`, template literals, arrow functions, `new`, spread.
When a directive needs null-safety or dynamic string construction, move the logic into
a store method or `x-data` component method — never inline it.

---

### Bug 2 — `adminMappingForm` not registered with `Alpine.data()`, and wrong `x-data` call syntax

**Symptom**: Every property in the mapping form component was undefined:

```
Uncaught Error: Undefined variable: adminMappingForm
Uncaught Error: Undefined variable: label
Uncaught Error: Undefined variable: adoSelector
Uncaught Error: Undefined variable: fieldSchemaName
```

**Root cause**: Two mistakes compounded each other.

1. `adminMappingForm` was defined as a plain global function in `app.js` but never
   registered with `Alpine.data()`. The Alpine CSP build resolves `x-data` attribute
   values from Alpine's own registry — it does not look in `window` globals. So
   `x-data="adminMappingForm()"` produced "Undefined variable: adminMappingForm".

2. Even if the function were resolvable, `x-data="adminMappingForm()"` is wrong syntax
   when using `Alpine.data()`. When a component is registered via `Alpine.data('name', fn)`,
   it is referenced in HTML as `x-data="name"` (the name string, without parentheses).
   Alpine calls the factory function internally. Writing `name()` asks the CSP parser to
   call a function, which it cannot do for a name it doesn't know.

**Fix**: Added `Alpine.data('adminMappingForm', adminMappingForm)` inside the
`alpine:init` callback, and changed `x-data="adminMappingForm()"` to
`x-data="adminMappingForm"`.

**Action**: Any `x-data` component function used in HTML must be registered via
`Alpine.data('name', fn)` inside `alpine:init`. Reference it in HTML as `x-data="name"`
(no parentheses). This is a hard rule in the CSP build — bare global functions are
invisible to the expression parser.

---

## Summary table

| # | What went wrong | Root cause | Fix | Action going forward |
|---|---|---|---|---|
| 1 | Mapping list blank, CSP parser error on `?.` / `??` / template literal | CSP expression parser does not support these operators | Add store helper methods (`getMappings`, `getOverwriteMode`); use object-syntax `:class` | Push null-guards and string construction into JS methods; keep directive expressions to simple property access and method calls |
| 2 | `adminMappingForm` and all local data properties undefined | Not registered via `Alpine.data()`; wrong `x-data="name()"` syntax | `Alpine.data('adminMappingForm', adminMappingForm)` + `x-data="adminMappingForm"` | Always register `x-data` component functions with `Alpine.data()` inside `alpine:init`; reference by name only, no parentheses |

---

# Retrospective — Phase 4: Storage & Settings Foundation

**Date**: 2026-02-15
**Commits**: `4859914` (impl) → `f622d19` (fix) → `d7a5c1d` (done)

---

## What went wrong

Two issues required correction after the initial implementation.
Both were caught during manual verification (tasks 5.1–5.4).

---

### Bug 1 — `onInstalled` reason filter blocked seeding on developer reload

**Symptom**: After clearing `"settings"` from `chrome.storage.local` and reloading
the extension via the Reload button at `chrome://extensions`, the `"settings"` key
remained absent from storage. Task 5.1 produced an empty storage view.

**Root cause**: The initial implementation guarded the seed with
`if (reason !== "install") return;`. Chrome fires `onInstalled` with
`reason === "update"` — not `"install"` — when you click the Reload button on an
unpacked extension. The design document (D-2) noted that `reason === "install"` was
the expected value but acknowledged Chrome's behaviour may differ. The spec's own
scenario ("Developer reload does not overwrite existing settings") was written to
cover the *non-empty storage* case; the *empty storage after manual clear* case was
not explicitly considered.

**Fix**: Removed the reason check entirely. The read-before-write storage guard
(`result.settings == null`) is the only protection needed and handles all scenarios
correctly:
- Storage empty → write defaults (first install, post-clear reload)
- Storage has data → skip (normal update, reload with existing data, reinstall)

**Action**: Do not filter `onInstalled` by reason when the intent is "seed if empty".
The reason only matters if you want different behaviour per event type (e.g. a
migration on update). For a simple "write defaults if absent" pattern, read storage
first and let the data be the guard — not the event metadata.

---

### Bug 2 — Task 5.3/5.4 instructions directed to the wrong console

**Symptom**: Running `chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, console.log)`
from the service worker's DevTools console returned `undefined` — no response arrived
— even though `chrome.storage.local` clearly held the correct `"settings"` value.

**Root cause**: Chrome does not route `chrome.runtime.sendMessage` back to the context
that sent the message. The service worker's `onMessage` listener never fires for a
message originating in the same context. The task description said "Open the service
worker's DevTools console" — which causes a self-send that the SW ignores — rather
than using a different extension context as the sender.

**Fix**: Ran the same commands from the **side panel's** DevTools console
(right-click inside the side panel → Inspect). Messages sent from the side panel
travel to the service worker over the normal inter-context channel, the `onMessage`
listener fires, and the response arrives correctly.

**Action**: When manually testing service worker message handlers, always send from
a separate extension context (side panel, popup, options page). The service worker
console is useful for inspecting state and calling Chrome APIs directly, but it is
the wrong sender for testing `onMessage` handlers.

---

## Summary table

| # | What went wrong | Root cause | Fix | Action going forward |
|---|---|---|---|---|
| 1 | Storage not seeded after clear + reload | `reason === "update"` on developer reload skipped the guard | Remove reason filter; rely solely on `result.settings == null` | For "seed if absent" patterns, use storage state as the guard — not `onInstalled` reason |
| 2 | `GET_SETTINGS` returned `undefined` from SW console | Chrome does not route `sendMessage` back to the sender context | Run test commands from side panel console instead | Always test `onMessage` handlers by sending from a different extension context |

---

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
