# Developer Retrospective — ADO to PowerApps Copypaster (All Phases)

**Author**: Developer persona
**Date**: 2026-02-17
**Phases covered**: 1 – 13
**Timeline**: 2026-02-14 → 2026-02-17 (3 days)

---

## Framing

This retrospective is written from the inside of the implementation — not a
post-hoc audit of what was shipped, but an account of what it was like to actually
build each phase: which decisions were easy, which were expensive, where the workflow
helped, and where it got in the way. The reviewer's retro covers the output. This one
covers the experience of producing it.

---

## The OpenSpec workflow — honest assessment

The proposal → spec → tasks pipeline was the most useful structural decision in the
project. By the time implementation began for any phase, the task list already had the
acceptance criteria carved out; the only question was execution. This meant I rarely
needed to stop and re-read the SPEC mid-phase — the task breakdown was already the
distillation.

The flip side: in the earlier phases (4, 5, 6), task lists were sometimes a step ahead
of my understanding of Chrome's actual behaviour. Phase 4's `onInstalled` reason filter
was correct per the task spec but wrong per Chrome — the task assumed `reason === "install"`
fired on developer reload, which it does not. The OpenSpec artifact was only as good as
the mental model that produced it. When the mental model was wrong, the task spec was
quietly wrong too, and I had no way to know until Chrome disagreed.

**What I'd do differently**: For any task that involves a Chrome API with non-obvious
behaviour (`onInstalled`, `executeScript`, `importScripts`), explicitly call out
"verify Chrome's actual behaviour before committing the design" as a named sub-task.
The current workflow does not distinguish "we know this is right" tasks from "we
believe this is right" tasks.

---

## TDD — where it worked and where it was just procedure

TDD produced the cleanest phases in the project, but not uniformly. There were three
distinct modes I worked in:

**Mode 1 — True TDD (phases 2, 6, 9)**: I wrote failing tests before touching
production code. The tests described the contract; the implementation satisfied them.
When Phase 2's twelve tests all passed on the first implementation run, that felt
right — the tests had been the spec, and the code was just evidence that the spec was
satisfiable. Phase 9 (zero bugs) repeated this exactly.

**Mode 2 — Test-after with structure (phases 7, 10, 11)**: The core logic was complex
enough that I needed to understand the shape of the solution before I could write
meaningful tests. I sketched the function shape, then wrote tests, then completed the
implementation. This is not true TDD, but it produced good test coverage because the
test-writing phase still happened before the implementation was considered done.

**Mode 3 — Tests as ritual (phase 3, phase 8 UI layer)**: Some things genuinely cannot
be tested in Node.js. Alpine's DOM interactions, the element picker's visual state,
keyboard capture behaviour in a PA tab — I wrote what tests I could (store logic,
message routing, cleanup coordination) and accepted that the rest would be validated
manually. In these phases, TDD became "write tests for everything testable, then QA
everything else."

The mistake I made in Mode 3 was not always being explicit about which parts were
in which category. If I had written a comment at the top of each phase's test file
listing what was covered by unit tests and what was deferred to manual QA, the review
pass would have been faster and more targeted.

**What I'd do differently**: At the start of each phase, produce a two-column list:
"unit-testable" and "manual-only". This makes the coverage boundary explicit rather
than implicit.

---

## The Chrome injection model — the single hardest concept

I misunderstood Chrome's injection model twice (phases 7 and 10), and both
misunderstandings cost fix commits. They stem from the same root: I thought of
`executeScript` as "run this function in that tab." That is wrong. `executeScript`
serializes the function body as a string using `Function.prototype.toString()` and
evaluates it in the target world. Only the function body crosses the boundary. Module
scope — all the helpers, the imported constants, the shared state — does not.

Phase 7's `importScripts` bug was the same category: I thought paths were resolved
from the extension root. They are resolved from the service worker script's own URL.
The mental model of "the extension is a flat namespace" is wrong; the file system
location of each script is real and matters.

These bugs were not careless — they came from a confident but incorrect model. The
fix was not to be more careful; it was to adopt the correct model and then build on
top of it. The mock-doc pattern (`adoReaderMain(doc = document)`) is the correct
response: if the function must be self-contained at serialization time, design it
to be self-contained from the start. Every helper is an inner function. Every default
is a parameter default. Nothing lives in module scope.

Once I had that model, Phases 9 and 10 (mostly) went cleanly. Phase 10's
`paWriterMain` still shipped with module-scope helpers because the file was written
by analogy with the previous structure rather than re-reading the pattern. The second
time a pattern produces a bug should be the last time.

**What I'd do differently**: Document the self-containment rule as a named
architectural pattern in `CLAUDE.md` before Phase 7, not after Phase 10. The
pattern was derivable from first principles but it needed to be said explicitly to
stick.

---

## Alpine CSP — learned once, applied everywhere (after phase 3)

Phase 3 was expensive: three separate Alpine bugs in one phase, each requiring its
own fix commit. Looking back, none of them were surprising — they were all predictable
consequences of using the CSP build without understanding what the CSP build's parser
actually supported. The standard build uses `new AsyncFunction`; the CSP build uses a
hand-written expression parser with a deliberately limited grammar. That limitation is
not a bug — it is the design — but I did not know what the grammar excluded until
Chrome's error messages told me.

After Phase 3, zero new Alpine CSP errors appeared in the remaining ten phases. The
rules (`no ?.`, `no ??`, `no template literals`, `no $store.x = y` in directives,
always `Alpine.data()` for component registration) are simple once stated. The issue
was that they were not stated before the first load.

The real lesson here is about tooling feedback speed. Alpine CSP errors are parse
errors that only surface at runtime in Chrome. There is no linter, no type checker,
no compile step that catches them. The feedback loop is: write directive → reload
extension → observe error → fix. Three bugs in Phase 3 meant three loops of that.
A checklist committed alongside `lib/alpine.min.js` before Phase 3 would have
collapsed three feedback loops into zero.

**What I'd do differently**: Any constraint that cannot be caught by automated
tooling should live in a `CONSTRAINTS.md` file collocated with the code it constrains.
The Alpine CSP rules belong in a comment block at the top of `app.js`, where the next
developer who opens the file will see them before writing their first directive.

---

## Manual QA as a genuine second test tier

One of the clearest outcomes of this project: PowerApps' DOM is not a unit-testable
surface. The React event handling model, the data-id attribute naming conventions, the
field type variations — all of these were discovered by running the extension against
a real PA form, not by reading PA's documentation (which does not exist for internal
DOM structure).

This is not a failure of the testing strategy; it is a constraint of the target
environment. The correct response, which the project arrived at in Phase 9, is to
build tooling that makes the manual QA surface smaller: the selector tester exists
specifically to validate PA field selectors before a full Paste run, converting a
"try it and see" discovery into a structured per-field test. That was the right call.

What I underestimated was how much each phase's manual QA list needed to be treated
with the same rigour as the unit test list. Phase 8's three QA bugs were each
isolated, reproducible, and fixable — but I had not predicted any of them. I had done
the unit tests, declared the logic correct, and then discovered that the unit tests
were testing the wrong abstraction layer for those specific behaviours.

**What I'd do differently**: Write the manual QA scenarios in the task file before
implementation, not after. Treat them as a second spec, not an afterthought. For any
phase that injects scripts or manipulates DOM state, ask: "what would I do to verify
this manually?" before asking "what would I write as a unit test?"

---

## The review gate — not ceremonial

I was initially skeptical that the reviewer pass would catch anything the unit tests
missed. After Phase 6's 🔴 MUST FIX (success banner shown during save failure) and
Phase 11's secondary line regression (copy_failed rows missing their error text), I
stopped being skeptical.

Both of those bugs were logic errors in paths that the tests did not reach because
the tests did not enumerate error cases explicitly. The unit tests tested the happy
path. The review pass looked at the code against the spec and found the discrepancy.
That is exactly the function the review gate is supposed to serve.

The uncomfortable realisation: I had done TDD, run the full test suite, gotten 185
green tests — and still shipped two significant error-path bugs. The tests were not
wrong; they were incomplete. TDD is only as good as the test author's imagination of
failure modes.

**What changed after Phase 6**: I started treating error paths as first-class
citizens in the task breakdown. If a task said "implement importMappings", I
explicitly listed sub-tasks for "test: save succeeds → success shown", "test: save
fails → error shown, success NOT shown", "test: lastError set → error shown". The
ERROR-PATH.md document that was committed after Phase 11 captures this discipline.

---

## The escalating complexity arc

Looking at the phase sequence as a developer, the complexity curve was intentional
but steep:

- **Phases 1–2**: Zero business logic. Just wire Chrome APIs. Two days in, I
  understood the extension model.
- **Phases 3–5**: Alpine + storage + CRUD. The hard new concept per phase
  was Alpine's CSP constraints. After three phases of Alpine pain, I had the
  rules internalised.
- **Phases 6–7**: Pure function extraction (`validateImportData`, `adoReaderMain`)
  + service worker integration. The right level of complexity for the payoff: clean
  TDD, clean Chrome integration.
- **Phase 8**: The first truly interactive injected feature. Three QA bugs.
  Complexity spike.
- **Phase 9**: Tooling for Phase 10. The investment paid off immediately.
- **Phase 10**: The highest-stakes phase. Two fix commits, but both from the same
  root cause already identified. The pa-writer self-containment rule is now
  documented; a fresh developer would not make that mistake.
- **Phase 11**: The largest single phase (2028-line commit). Should have been two
  phases. The store redesign + UI overhaul + state derivation logic were three
  separable concerns collapsed into one change for delivery speed. The two QA bugs
  that surfaced were a direct consequence of the density.
- **Phases 12–13**: The right size. Focused, surgical, low-risk.

**What I'd do differently on Phase 11**: Split the store architecture redesign
(enabling/fieldUIStates model) from the HTML/CSS UI implementation. The first is
high-risk logic; the second is low-risk presentation. Running them in the same change
meant that a bug in the first was harder to locate because the diff was enormous.

---

## Design docs — the value was not where I expected

I expected design docs to be useful for convincing reviewers. They turned out to be
useful for convincing myself.

Writing `design.md` for Phase 7 forced me to articulate the mock-doc pattern before I
had written a line of code. When I wrote "injectable functions must be fully
self-contained", I almost immediately noticed that this would be a problem for
`adoReaderMain`'s default `doc = document` parameter — the `document` reference would
exist at serialization time but would resolve to the outer window's document, not the
target tab's. The mock-doc parameter approach was the solution, and I found it during
the design doc write, not during debugging.

Phase 10 did not have a design doc before implementation. That is probably why the
self-containment mistake happened again — there was no forcing function to make me
state the constraint before I violated it.

**What I'd do differently**: Treat the design doc as a pre-mortem. Before
implementation, write one paragraph per known risk area describing how things could
go wrong and what the mitigation is. If a risk has no mitigation, that is the signal
to do a spike before committing to implementation.

---

## Patterns that became conventions

Five patterns emerged during implementation and became conventions by the end of the
project. All five were reactive — they came from bugs — but all five held:

1. **Conditional export** (`if (typeof module !== "undefined") module.exports = ...`):
   Established in Phase 2, used in every pure-function module thereafter. Makes
   Node.js unit testing of browser-targeted functions trivial.

2. **Mock-doc pattern** (`function fn(doc = document)`): Established in Phase 7.
   Makes injectable functions unit-testable without Chrome or jsdom.

3. **Store methods for all mutations**: Established in Phase 3. Alpine CSP's parser
   drops `$store.x = y` silently. All mutations go through named store methods.

4. **`saveSucceeded` callback-flag guard**: Established in Phase 6. All
   `SAVE_SETTINGS` callers that surface user feedback use this pattern.

5. **`@vitest-environment node` annotation**: Established in Phase 7. Any test file
   importing a module with browser globals carries this annotation to prevent
   Vitest's environment auto-detection from silently dropping tests.

All five should have been in `CLAUDE.md` from the moment they were established, not
discovered by later developers making the same mistake. By the end of the project,
most of them were in `CLAUDE.md` — but three of the five were still discoveries waiting
to happen for any fresh session that started from the doc state at Phase 3.

---

## What the workflow got right

- **OpenSpec change discipline**: I never worked without a task list. This meant I
  never had to decide in the moment what to build next. Task drift was zero.

- **One logical task per commit**: Small commits made the reviewer's job tractable
  and made my own `git log` readable. The commit messages in this repo are some of
  the most useful I have ever written for myself.

- **No build tooling**: The constraint felt limiting at first. By Phase 10, it felt
  like a feature. No bundler meant no build step, no source maps, no webpack
  configuration drift. The extension directory was always the distributable. Reloading
  Chrome was the only "build" step.

- **Role separation**: Not self-archiving forced a genuine review pass every phase.
  The temptation to declare something done before the reviewer sees it is real; the
  workflow made it structurally impossible.

---

## What I'd change in the next project

| Area | Change |
|---|---|
| Chrome API edge cases | Add an explicit "verify Chrome behaviour" sub-task for any API with non-obvious runtime semantics |
| Injectable functions | Document self-containment as a named pattern in `CLAUDE.md` before Phase 1 |
| Alpine CSP constraints | Commit a constraint card as a comment block in `app.js` before the first Alpine directive is written |
| Manual QA scenarios | Write them before implementation as part of the task spec, not after as a checklist |
| Design docs | Require a pre-mortem risk paragraph per known-risk area before implementation begins |
| Phase sizing | Keep phases under ~500 lines of net-new production code; split at logical concern boundaries |
| Error-path tests | Apply the ERROR-PATH.md checklist to every task breakdown before writing a single test |
| Two-function contracts | Any two functions sharing an output shape get a shared fixture file at spec time, not fix time |

---

## Overall assessment

Three days, thirteen phases, one working Chrome extension. The TDD discipline held
even when it was inconvenient. The architectural invariants (no bundler, no CDN, no
form submission, per-field isolation) held across every phase. The review gate
caught real bugs.

The project was harder than it looked at Phase 1. Chrome's injection model,
Alpine's CSP constraints, PowerApps' undocumented DOM structure, and the multi-phase
store redesign were each genuinely non-trivial. The phases where the workflow broke
down (Phase 3's cascade of CSP bugs, Phase 8's manual QA failures, Phase 11's size)
were the phases where I had the least explicit risk articulation before implementation.

The inverse was also true: the phases where risk was stated upfront (Phase 7's
mock-doc design decision, Phase 9's dual-mode tester spec, Phase 12's extracted
pure-function approach) were the cleanest executions in the project.

The lesson is not that I should have known more before starting. It is that the
design-doc and task-writing stages are the right time to surface what I don't know —
not the fix-commit stage.

---

# Project Retrospective — ADO to PowerApps Copypaster (All Phases)

**Reviewer**: Code Reviewer persona
**Date**: 2026-02-17
**Phases covered**: 1 – 13
**Timeline**: 2026-02-14 → 2026-02-17 (3 days)

---

## By the numbers

| Metric | Value |
|---|---|
| Phases shipped | 13 |
| Total commits | 42 |
| Unit tests at completion | 185 |
| Files in the extension | ~20 |
| Lines changed (net, all phases) | ~8 000+ |
| 🔴 MUST FIX items across all reviews | 3 |
| 🟡 SHOULD FIX items across all reviews | 8 |
| Fix commits required after initial implementation | 14 |
| Phases with zero fix commits | 2 (Phase 2, Phase 9) |
| Phases with 3+ fix commits | 1 (Phase 8) |

---

## What went well

### 1. TDD produced the lowest defect rates

Every phase that opened with failing tests before production code had noticeably fewer QA bugs.
Phase 2 (12 tests, zero bugs), Phase 9 (16 tests, zero bugs), and Phase 10 (56 tests, two
runtime bugs — but both in the serialization layer that tests cannot reach) all followed this
pattern. The cost of writing tests first was paid back immediately at load time. The phases
with the worst defect counts (Phase 3, Phase 8) were the ones where the implementation space
was least amenable to unit testing.

### 2. The mock-doc pattern unlocked testing of injectable scripts

`adoReaderMain` and `paWriterMain` both run inside foreign page contexts injected by Chrome.
The design decision to accept a `doc` parameter (defaulting to `document`) and keep all DOM
work inside the function body made it possible to drive both functions from Node.js with
plain object mocks. When Phase 7's extension integration worked first try and Phase 10's
strategy dispatch was completely covered before the extension was loaded, that pattern proved
its value. It is now a core convention.

### 3. The per-field isolation rule (BR-002) held across all phases

Every field write and every field read is wrapped in its own try/catch. Not once across 13
phases did a broken selector or unexpected PA DOM state abort an entire copy or paste
operation. Users see field-level failures rather than silent full-operation failures. This
was the most important correctness property of the extension and it was never violated.

### 4. Design decisions captured in `design.md` paid off in reviews

Phases that shipped a well-reasoned `design.md` (Phase 7's D-3 mock-doc, Phase 8's D-7
`hasCopiedData` semantics, Phase 10's D-8 extracted handler pattern, Phase 12's D-1/D-2)
gave the reviewer a clear frame for evaluating the implementation. When the code deviated from
design, it was obvious. When the code matched design, it was defensible. Phases without detailed
design docs were harder to review objectively.

### 5. The review / archive gate caught real bugs

Three 🔴 MUST FIX items were raised across all reviews. Every one of them was a real bug:
- Phase 6: `SAVE_SETTINGS` failure silently showed a success banner — a data-loss-adjacent bug.
- Phase 5: `paSelector` → `fieldSchemaName` rename not propagated to an edge-case guard.
- Phase 8: `hasCopiedData` returning true unconditionally when all fields had errored.

None of these would have been caught by the unit tests alone. The independent review pass
was not ceremonial — it found things that mattered.

### 6. The `saveSucceeded` callback-flag pattern became a project convention

First established in Phase 6, then consistently applied in every subsequent phase that called
`SAVE_SETTINGS` with user-facing feedback. Having a named, documented pattern prevented the
same bug class from recurring.

### 7. CSP constraints were learned once and applied everywhere

Phase 3's three Alpine CSP bugs were painful but thoroughly documented. From Phase 4 onward,
no new CSP parser failures were introduced. Every developer session after Phase 3 applied the
rules correctly: no `?.`, no `??`, no template literals in directives; no `$store.x = y` from
directives; always `Alpine.data()` for component registration. Three hours of pain in Phase 3
bought clean execution across the remaining ten phases.

---

## What went wrong (by category)

### A. Chrome runtime serialization — bit us twice

**Phase 7** (`importScripts` path): `importScripts` resolves relative to the service worker
file's own location, not the extension root. A service worker at `background/service-worker.js`
needs `"../scripts/..."` to reach the root. The design doc stated the wrong mental model;
Chrome's error message made the fix obvious in minutes, but the concept was not intuitive.

**Phase 10** (`paWriterMain` self-containment): `executeScript` serializes the function via
`Function.prototype.toString()` — only the function body is transferred. Module-scope variables
(`PASTE_STRATEGIES`, `waitForElement`, etc.) are invisible to the injected code. ReferenceError
at runtime, zero warning at write time. The fix was to move all helpers inside `paWriterMain`
as inner functions — the same pattern `adoReaderMain` already used, which should have been
the template for `paWriterMain` from the start.

**Root cause (both)**: The mental model of "write a function, inject it" does not match Chrome's
actual injection model. The function is serialized as text and evaluated in a different world.
Both failures stem from the same misunderstanding applied to different Chrome APIs.

**Action going forward**: Treat every injectable function as a completely self-contained
document. If it needs a helper, the helper must be inside it. If it uses `importScripts`,
paths are relative to the script file's own location.

---

### B. Alpine CSP build limitations — phase 3 cascade

Three separate bugs in a single phase, all from the same root: the standard Alpine.js build
was used, and when replaced with `@alpinejs/csp`, the CSP parser's limitations with `?.`, `??`,
`$store` assignment, and `Alpine.data()` registration produced four more failures before the
phase was stable. Each bug was well-understood after the fact, but the information was not
available upfront.

**What would have helped**: A one-page Alpine CSP constraints reference committed alongside
the library file, listing what the parser does and does not support. Instead, these constraints
are now scattered across four phase retros. A future project using Alpine in Chrome MV3 should
consolidate this into a `DECISIONS.md` or inline comments in `app.js`.

---

### C. PA DOM behaviour — discovered by manual QA, not tests

The PowerApps DOM produced two surprises that unit tests could not predict:

**Phase 8** (keyboard events): PA's React event handlers call `stopPropagation()` on keydown
events. The element picker's Escape listener was registered in bubbling phase and never fired
inside a PA tab. Fix: `{ capture: true }`. This behaviour is a React internals detail — not
documented anywhere visible, found only by observing that Escape did nothing in the actual
extension.

**Phase 10** (whole-number fields): PA uses a different `data-id` suffix for integer/whole-number
inputs (`whole-number-text-input`) versus plain text inputs (`text-box-text`). Both render
as `<input type="text">` and both use `simulateTyping` — but the selector derivation only
knew about the plain-text suffix. Found when testing the "Planned Year" field.

**Pattern**: PA's DOM is the largest source of unforeseeable bugs in this project. Every
PA-side bug was discovered manually, none by unit tests. The selector-tester (Phase 9) was
built specifically to surface these mismatches early, and it worked — Phase 10's whole-number
discovery happened during Test Field validation, not during an actual Paste failure.

---

### D. Cancel/cleanup coordination — phase 8's hardest bug

Phase 8 introduced an injected overlay script (`element-picker.js`) that registers three event
listeners and sets an inline hover style. Cancelling the picker (via Escape or Cancel button)
must remove the overlay, clear the hover style, and deregister all three listeners. The first
implementation removed only the overlay. The second added a `cleanup()` function inside the
injected script but needed a way for the service worker's cancel function — also injected
via `executeScript`, with no shared scope — to call it. The solution (`overlay._cleanup`)
worked but was non-obvious: the two injected functions share the same extension isolated world
for the tab, so a property attached to the overlay DOM node is visible to both.

This coordination problem is specific to the multi-function injection model. It is not a bug
in Chrome's API; it is a complexity boundary that needs to be respected. Any future feature
that injects multiple scripts that must coordinate state should plan this handoff explicitly
in the design doc.

---

### E. Spec coverage of error cases lagged implementation

Phase 6's test coverage gap (four of six required fields had no individual tests) and Phase 11's
`copy_failed` secondary line regression both stem from the same underlying pattern: the happy
path was specified and tested thoroughly; the error path was specified but not drilled down
in the task breakdown. The Phase 11 regression specifically — `updateAfterCopy` omitting
`readMessage` for error outcomes — came from the fact that `convertFieldResultsToCopiedData`
(the service worker version) and `updateAfterCopy` (the in-memory version) had the same
contract but were implemented independently, and one deviated silently.

**Action**: When two functions share a data contract, the contract should be the test target
— not each function independently. A shared test fixture that both functions run against would
have caught this before QA.

---

## Phase-by-phase notes (phases without existing retros)

### Phase 1 — Project Scaffold

**Date**: 2026-02-14 · **Commits**: `c5283ad` → `5406727`

Clean scaffold. One fix needed: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`
was omitted from the initial commit. Without it, clicking the toolbar icon does nothing in Chrome.
The SPEC did not mention this call explicitly — it lives in Phase 2's description but is needed
even in the skeleton to verify the panel opens. Zero architectural issues. All 15 files created
correctly on the first attempt. Stub structure was a sound foundation for every subsequent phase.

---

### Phase 2 — Tab Detection & Messaging

**Date**: 2026-02-14 · **Commits**: `73657f4` → `7f9cadc`

The cleanest phase of the pre-Phase-9 project. Twelve unit tests were written first; the
implementation passed them all first run; manual Chrome verification confirmed correct
`ado`/`pa`/`unsupported` detection on tab switch and navigation. One trivial cleanup: a debug
`console.log` was left in the initial commit and removed in the verification chore commit.
The conditional-export pattern (`if (typeof module !== 'undefined') module.exports = ...`)
was established here and became a project-wide convention.

---

### Phase 8 — Element Picker

**Date**: 2026-02-16 · **Commits**: `4d705d3` → `3360b89` → `9cff4ff`

The most interaction-complex phase. The initial implementation was correct in structure but
produced three manual QA bugs, requiring two fix commits.

**Bug 1 — Escape ineffective in PA tab**: PA React handlers call `stopPropagation` on all
keyboard events. The picker's `keydown` listener was registered in bubbling phase and was
silenced before it fired. Fix: `document.addEventListener('keydown', onKeyDown, { capture: true })`.

**Bug 2 — Cancel Pick left residue**: `CANCEL_ELEMENT_PICKER`'s injected function called only
`overlay.remove()`. The hover inline style on the last-hovered element remained, and all three
event listeners stayed registered on `document`. Fix: a shared `cleanup()` function exposed
as `overlay._cleanup` so the second injected function could call it.

**Bug 3 — Escape when focus in side panel**: After clicking "Pick from Page," keyboard focus
stays in the side panel — the PA tab never gets keyboard events. Fix: a second Escape handler
in `app.js` monitors `pickerActive` and fires `CANCEL_ELEMENT_PICKER` from the side panel side.

Phase 8 also resolved the Phase 7 review's 🟡 item: `hasCopiedData` was fixed to return `true`
only when at least one field had a non-error result.

---

### Phase 9 — Test Field / ADO Selector Tester

**Date**: 2026-02-16 · **Commits**: `36bb687` → `5aea3d7`

Zero bugs. Sixteen unit tests written first; 65 total tests green before implementation was
complete; all 9 QA tasks passed on first load. The dual-mode `selector-tester.js` (PA mode
derives selectors from schema name + field type; ADO mode uses the raw selector verbatim) was
a clean design. The lookup-field fallback (trying `_selected_tag` when the primary `textInputBox`
selector returns null) was anticipated in the spec and implemented correctly.

This phase demonstrated that the mock-doc TDD pattern, established in Phase 7 and documented
in the retro, could be replicated cleanly by a fresh implementation pass.

---

### Phase 10 — Paste to PowerApps

**Date**: 2026-02-16 · **Commits**: `948d987` → `711892f` → `d1214d9`

The highest-stakes phase: writing to PA fields, with BR-002 (per-field isolation) and BR-003
(no form submission) as hard constraints. Both were respected throughout. Two fix commits were
required.

**Bug 1 — paWriterMain not self-contained**: Module-scope helpers were invisible after
`executeScript` serialization. ReferenceError at runtime: `"PASTE_STRATEGIES is not defined"`.
Fix: all helpers moved inside `paWriterMain` as inner functions. The fix caused the file to
shrink by 376 lines because the module structure was simplified — the helpers needed to exist
in only one place.

**Bug 2 — Whole-number fields used a different data-id suffix**: PA integer inputs use
`fieldControl-whole-number-text-input` instead of `fieldControl-text-box-text`. Both accept
`simulateTyping` and map to field type `text`. Without a fallback selector, Test Field showed
"No element found" for integer fields. Fix: fallback added to both `selector-tester.js` and
`pa-writer.js`; tests updated to cover the new path.

---

### Phase 11 — User Tab UI Overhaul

**Date**: 2026-02-16 · **Commits**: `8ced5b9` → `07471f1`

The largest single phase: 2028-line initial commit, 14 files touched, store architecture
significantly redesigned (replacing `fieldResults[]` / `pasteResults[]` with `enabledMappings[]`
/ `fieldUIStates[]` / `lastPasteResults`). 152 tests were passing at implementation commit.
Two functional bugs were found during manual QA.

**Bug 1 — copy_failed secondary line never showed** (MT-30 regression): `updateAfterCopy()`
built an in-memory `CopiedFieldData[]` but omitted `readMessage` for `error`/`blank` outcomes.
`deriveFieldUIStates()` depends on `readMessage` to produce the message text for `copy_failed`
rows. With `readMessage` absent, `showFieldSecondary()` returned `false` and the error detail
was never rendered. The equivalent service-worker function (`convertFieldResultsToCopiedData`)
got it right; the in-memory version diverged silently. Regression guard added (5 tests).

**Bug 2 — saveMapping reset enabled flag on edit**: `saveMapping()` in edit mode spread only
`formData`, replacing the whole mapping object. Since the form does not include `enabled`, the
flag was reset to `undefined` on every edit. Fix: `{ ...mappings[idx], ...formData }` — existing
mapping first, form fields overlaid. Regression guard added (3 tests).

Phase 11 also received a set of post-QA UX CSS amendments (badge font-size, banner font-size,
padding tweaks, secondary line width) which were applied in the same fix commit.

---

### Phase 12 — Secondary Line Fix (paste_failed / skipped)

**Date**: 2026-02-16 · **Commits**: `576cb88` → `7d2259f`

A focused fix for the Phase 11 review's 🟡 item: `paste_failed` and `skipped` rows were
showing only the error/skip message, omitting the `copiedValue` the user had copied from ADO.
The fix required extracting `getFieldSecondaryText` and `showFieldSecondary` out of the Alpine
store into module-scope pure functions so they could be unit-tested directly without Alpine.
25 new tests, bringing the total to 185.

The second commit (`7d2259f`) was a bonus UX fix added opportunistically: spinners inside
`.action-buttons` caused micro-layout shifts every time they appeared. Moving them into the
context banner rows (fixed-height elements above the button bar) eliminated the shift. Clean
HTML restructure, no JS changes, no test impact.

---

### Phase 13 — UX Polish (CSS-only)

**Date**: 2026-02-17 · **Commits**: `e44d0f7`

The cleanest phase of the project. Three targeted CSS edits, one file, one commit. No bugs,
no QA failures, no review findings. The design decisions (D-1: remove `border-bottom` when
adding `border-radius`; D-2: `> *` not `.btn` for the flex rule; D-3: no tests for CSS-only
changes) were all well-reasoned and correctly applied. The `:first-child`/`:last-child` margin
guards were added proactively — not required by the spec but justified correctly by the
tabpanel's `padding: 12px 14px`.

---

## Cross-cutting lessons

| Lesson | Phases where it surfaced | Recommendation |
|---|---|---|
| Injectable functions must be fully self-contained | 7, 10 | Use inner functions only; treat the function boundary as a serialization boundary |
| Alpine CSP parser: no `?.` `??` template literals, no `$store` assignment from directives | 3, 5 | Keep a constraint card comment at the top of `app.js`; always push logic into store methods |
| `importScripts` paths are SW-relative, not extension-root-relative | 7 | Document this in any design that uses `importScripts` from a non-root SW |
| PA React `stopPropagation` silences bubbling-phase listeners | 8 | Use `{ capture: true }` for any keyboard listener injected into PA tabs |
| Two functions sharing a data contract need shared tests | 11 | Extract the contract as a test fixture and run both functions against it |
| Error paths need the same per-field coverage discipline as happy paths | 6, 11 | List all error variants explicitly in the task breakdown, not just representative ones |
| Manual QA catches PA DOM surprises that unit tests cannot | 8, 10 | The selector-tester (Phase 9) is the right tool to surface these early — use it first |
| Debug `console.log` in service workers is easy to miss | 2 | A review pass specifically checking for `console.log` in committed SW code catches these |

---

## Overall assessment

The project delivered a complete, working Chrome extension in 3 days across 13 phases. The
architectural constraints (MV3, no build, local Alpine, injection model) held throughout — not
once did a phase introduce a bundler, CDN dependency, or manifest drift. BR-002 and BR-003 were
never violated. The review / archive gate was exercised meaningfully: it found real bugs, not
just style issues, and the fix-then-re-verify loop worked as designed.

The highest-risk area — writing to PowerApps forms — landed correctly on the first QA pass,
save for two bugs that were inherently untestable (serialization, DOM suffix discovery). That
outcome is the best realistic result given the constraint that PA's DOM cannot be simulated
in unit tests.

The weakest process area was error-path test discipline. The two most significant bugs in the
project (Phase 6's silent success banner and Phase 11's missing `readMessage`) were both
failures in error paths that the task breakdowns did not enumerate explicitly. This is the
one thing worth fixing in the next project using this workflow.

---

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

---

# Architect Retrospective — ADO to PowerApps Copypaster (All Phases)

**Author**: Architect persona
**Date**: 2026-02-17
**Phases covered**: 1 – 13 (SPEC.md v1.0 → v1.5)
**Timeline**: 2026-02-14 → 2026-02-17 (3 days)

---

## Framing

This retrospective is written from outside the implementation — not an account of what
it felt like to build each phase, but an evaluation of the specification artefact that
preceded every phase. The question I am answering is: how well did the SPEC hold up as
a blueprint? Where did it guide correctly? Where did it mislead? Where was it silent
when it should have spoken?

The SPEC went through five versions over three days. That number is the first
and most important data point of this retro.

---

## What the SPEC got right

### 1. The extension model was correctly chosen and never revisited

MV3 + on-demand injection + no bundler + no CDN was the right call, and it held
across all 13 phases without a single architectural deviation. The decision to treat
the extension directory as the distributable — no build step — simplified every
downstream decision: there was no bundler to configure, no source-map drift, no
`node_modules` in the repo. When a developer needed to test a change, they reloaded
the extension. That is the correct complexity level for a 2–4 user internal tool.

The value of this decision was less visible in Phase 1 (where it just meant fewer
files) and much more visible in Phase 8 onward, when injected scripts needed to be
self-contained by construction. A bundler would have obscured the module boundary
problem; the flat file model made it impossible to ignore.

**Verdict**: Correct. Not revisited. Zero regret.

---

### 2. The two-tab UI model (User + Admin) was stable from day one

The User tab / Admin tab split was never questioned, never restructured, and never
caused a design conflict. Every phase that touched the UI knew exactly which tab it
was working in and what the other tab's responsibilities were. The boundary was clean
enough that Phase 11's large store redesign only needed to touch the User tab's state
model — the Admin tab was unaffected.

This stability came from a deliberate scope decision in Phase 1: Admin owns
configuration (mappings, overwrite mode, export/import, element picker, test field);
User owns the session workflow (copy, paste, field status, clear). The two tabs share
a store but have no overlapping responsibilities. In hindsight, this was the right
decomposition unit for a side panel with limited vertical space and two distinct
user roles (daily user vs. one-time configurer).

**Verdict**: Correct. The boundary was never a source of confusion for the developer
or reviewer.

---

### 3. Per-field isolation (BR-002) was correctly elevated to a non-negotiable invariant

BR-002 was not a suggestion in the SPEC; it was listed under "Non-Negotiable Repo
Guardrails." That language was the right choice. Every field write in `pa-writer.js`
and every field read in `ado-reader.js` ended up inside its own `try/catch`. No phase
ever argued for a different approach, and no phase violated the rule.

The value of making BR-002 a hard invariant (rather than a guideline) was that the
implementation never had to decide whether to catch a field failure or let it
propagate. The decision was made at spec time, not at implementation time. This
removed a whole category of implementation judgement calls.

**Verdict**: Correct framing. Elevating it to a named, non-negotiable rule in
`CLAUDE.md` — not just the SPEC — was the right mechanism.

---

### 4. The storage model was correctly designed around Chrome's session/local split

Using `chrome.storage.local` for mappings (persistent across sessions) and
`chrome.storage.session` for copied ADO data (cleared on browser close) was the right
design. It gave the extension correct persistence semantics without any explicit
cleanup logic: session data could never outlive its relevance because Chrome's own
lifecycle cleared it.

This also meant the CLEAR button in Phase 11 was a convenience, not a correctness
necessity. The data would have been gone on next browser restart regardless. The
spec anticipated this: the reason for providing a Clear button was UX (the user wants
to know the session is clean now, not just eventually), not lifecycle management.

**Verdict**: Correct. The storage model required zero amendments across all five
SPEC versions.

---

### 5. The message contract architecture was stable

Every message name and payload defined in SPEC.md §5 was implemented as specified,
and the contracts were never changed once established. `GET_SETTINGS`,
`SAVE_SETTINGS`, `COPY_INITIATIVE`, `PASTE_INITIATIVE`, `PICK_ELEMENT`,
`ELEMENT_PICKED`, `CANCEL_ELEMENT_PICKER`, `TEST_SELECTOR`, `CLEAR_COPIED_DATA` —
each was defined once, at the right level of specificity, and consumed unchanged by
the implementation.

This matters architecturally because message contracts are the boundaries between the
side panel (UI), the service worker (router/state), and the injected scripts (DOM
actors). Unstable contracts at those boundaries would have produced cascading changes
across multiple files on every amendment. None of that happened.

The one addition was `TEST_ADO_SELECTOR` in SPEC v1.3, added when Phase 9's scope was
expanded to include ADO selector testing. That addition was additive — it did not
change any existing contract.

**Verdict**: The message-contract section was the most stable part of the SPEC. Its
stability was not accidental; it came from the explicit decision to treat message names
as immutable once shipped.

---

## Where the SPEC fell short

### 1. Alpine.js: wrong build, wrong constraints — a preventable miss

SPEC v1.0 specified "Alpine.js v3 (local, no CDN)" with no mention of the CSP build.
The SPEC's rationale was correct (MV3 forbids `unsafe-eval`) but its conclusion was
wrong (it assumed Alpine v3 itself was CSP-compatible, when in fact only
`@alpinejs/csp` is).

This was a spec error, not an implementation error. The developer correctly trusted
the spec and downloaded the standard Alpine build. Phase 3 then produced three
cascading bugs before the CSP build was installed. The fix was straightforward;
the cost was one full fix-commit cycle and a significant chunk of Phase 3's
development time.

SPEC v1.1 amended this — too late for Phase 3. The amendment added `@alpinejs/csp`
explicitly and documented the `$store` mutation constraint. But by then, the developer
had already learned the hard way.

**What I would have done differently**: Before finalising the SPEC, download and
inspect both the standard Alpine build and the `@alpinejs/csp` build. Observe that
the standard build uses `new AsyncFunction`. Note that MV3 blocks this. Conclude that
the CSP build is required. Write this reasoning into the SPEC, not just the
conclusion. The reasoning would have signaled to the developer exactly *why* the CSP
build matters and what the expression-parser limitations imply.

A constraint table in the SPEC — listing Alpine CSP's unsupported syntax (`?.`, `??`,
template literals, `$store` property assignment from directives) — would have
eliminated Phase 3's three bugs before a single directive was written.

---

### 2. PowerApps DOM interaction: the v1.0 spec was substantially wrong

SPEC v1.0 described PowerApps field interaction using `paFieldSelector` (a user-
provided CSS selector) with strategies of "click → trigger lookup → wait → select"
and "click → wait → select." This was reasonable as a first-pass design, but it was
based on assumptions about the PA DOM that turned out to be wrong in three important
ways:

1. **GUID-based IDs are session-specific and change between page loads.** A CSS
   selector built around PA's element IDs would break every time the form was
   reloaded. The stable identifier is the `data-id` attribute, which is derived
   from the field's schema name and is deterministic.

2. **The Fluent UI portal renders option lists outside the main DOM tree.** The
   original spec's "wait for options → click matching result" sequence assumed the
   options would be children of the combobox. They are not; they render in
   `#__fluentPortalMountNode`. A selector-based approach couldn't have anticipated
   this without DOM inspection.

3. **React's synthetic event model requires specific event dispatch sequences.** The
   spec's generic "dispatch input and change events" was correct for text fields
   but wrong for lookup fields, where the React event model requires a specific
   sequence to trigger the lookup-suggestion pipeline.

All three issues were discovered during SPIKE-PA-STRATEGIES.md — a live DOM
inspection of a real PA form conducted between Phases 6 and 7. SPEC v1.2 then
completely rewrote §4.1 (replacing `paSelector` with `fieldSchemaName`) and §6.3
(paste strategies rebuilt from scratch using the real PA DOM contracts).

**What I would have done differently**: The SPIKE should have happened before the
SPEC was written, not after Phase 6. The PowerApps DOM interaction model was the
highest-risk element of the entire extension — it was the part where "will this
actually work?" was most uncertain. The correct place for that uncertainty is a
named spike or a research phase before the spec commits to a strategy.

The lesson: when a major external system's internal DOM structure is part of the
critical implementation path, require a DOM inspection artefact before finalising
the spec section that depends on it. Do not write interaction strategies based on
plausible assumptions about DOM structure you have never observed.

---

### 3. Phase 11 was too large — a scope decision made in the SPEC

ENHANCEMENTS.01.md (the input for SPEC v1.4) landed as a single, contiguous feature
block: always-visible field list, per-field state badges, Clear button, context banner
styling. These were treated as one cohesive UI overhaul, and the SPEC reflected that
by specifying them together in one amendment.

The result was Phase 11's 2028-line commit — the largest single-phase diff of the
project. Two bugs in Phase 11 can be traced directly to the density: the `copy_failed`
secondary line regression (divergent implementations of the same contract) and the
`enabled` flag reset on edit (a case that was harder to see in a large diff).

In hindsight, the SPEC should have broken ENHANCEMENTS.01.md into two separate
amendments:

- **Amendment A** — Store architecture: `enabledMappings`, `fieldUIStates`,
  `lastPasteResults`, `clearCopiedData()`, `deriveFieldUIStates()`. High-risk logic.
- **Amendment B** — HTML/CSS rendering: the field list, badges, banners, button
  styling. Low-risk presentation.

Both amendments would have gone into the SPEC before implementation, but they would
have generated two separate OpenSpec phases. A bug in the store redesign would have
been isolated in a small diff rather than buried in 2000 lines of combined change.

**What I would have done differently**: Apply a phase-sizing rule at the SPEC
amendment level. Any amendment that introduces both (a) new store logic/state model
and (b) new HTML/CSS rendering must be split at that boundary. The two are separable,
and the split makes both reviewable independently.

---

### 4. Chrome API behaviour assumptions were not flagged as risks

Two Chrome API assumptions in the early SPEC turned out to be wrong:

- **`onInstalled` reason filtering** (Phase 4): The SPEC specified that storage
  seeding should guard on `reason === "install"`. Chrome fires `reason === "update"`
  on developer reload of an unpacked extension. The fix was removing the reason guard
  entirely and using the storage state as the guard instead. This was a spec error
  based on an incorrect mental model of Chrome's lifecycle.

- **`importScripts` path resolution** (Phase 7): The SPEC (and the Phase 7 design
  doc) stated that `importScripts` resolves relative to the extension root. It does
  not; it resolves relative to the service worker file's own location. A service
  worker at `background/service-worker.js` needs `"../"` to reach the extension root.

Both of these are non-obvious Chrome API behaviours. Both caused fix commits. Neither
was flagged as a risk in the SPEC.

**What I would have done differently**: Create an explicit "Chrome API behaviour
risks" section in the SPEC, or flag specific API calls with a `[verify]` annotation
indicating that the expected behaviour should be confirmed against Chrome's actual
runtime before implementation is committed. The SPEC should distinguish between
"we know this is how it works" and "we believe this is how it works."

---

### 5. Error-path contracts were underspecified in the initial SPEC

The SPEC defined success-path behaviour precisely: which message to show, which icon
to display, which status to set. Error-path behaviour was defined more loosely:
"show a red indicator" or "show an inline error message." This vagueness manifested
in two real bugs:

- Phase 6: `SAVE_SETTINGS` failure showed a success banner because the error path
  wasn't explicitly described in the task breakdown.
- Phase 11: `copy_failed` rows were missing their error text because the `readMessage`
  field for error outcomes was not explicitly called out in the SPEC's
  `CopiedFieldData` contract.

The SPEC's data model section (§4) defined `CopiedFieldData` with `value`, `status`,
`errorMessage`, and `readMessage` fields — all correct. But §6.2 (the copy flow
implementation note) did not explicitly state that all outcomes, including errors,
must populate `readMessage`. The developer reasonably populated it for success
outcomes and omitted it for error outcomes, because the spec was silent on the
distinction.

**What I would have done differently**: For every data entity with a `status`
discriminant (like `CopiedFieldData.status`), enumerate every valid status value
and specify *all* required fields for each value explicitly. "Status: `error` →
must set `errorMessage` to the caught exception message, `readMessage` to the ADO
field display name" is the right level of specificity. This is not over-engineering;
it is closing the gap that later required a regression fix and five new tests.

---

## The amendment mechanism — assessment

Five spec versions over three days is a higher rate of amendment than I would have
preferred. But it is worth distinguishing between two types of amendments:

**Type 1 — Correction (bad)**: Amendments that fixed a wrong or missing spec
decision that should have been right before implementation started. Examples:
`@alpinejs/csp` in v1.1; `fieldSchemaName` replacing `paSelector` in v1.2; the
`onInstalled` pattern in v1.1. These are spec debts that were paid in full, but they
cost developer time and produced fix commits.

**Type 2 — Extension (acceptable)**: Amendments that incorporated new information
or new requirements that emerged legitimately from working software. Examples:
the Test ADO Selector in v1.3 (a natural extension of the Test Selector feature
once the ADO reader existed); the ENHANCEMENTS.01.md UI overhaul in v1.4 (a clear
enhancement request based on observing the running extension). These amendments are
the spec mechanism working as designed.

Of the five amendments, roughly two were corrections and three were extensions. The
extensions are evidence that the spec-then-implement loop works — working software
generates better requirements than pre-implementation assumptions do. The corrections
are evidence that the spec needed more upfront research in two areas: the Alpine CSP
build choice, and the PA DOM interaction model.

**The amendment discipline that worked**: Every amendment was appended to the top of
the SPEC with a version header and a bulleted change list. This meant the developer
and reviewer always knew what changed and when. No amendment overwrote prior text
silently; all changes were additive or explicitly marked as replacements. This is the
right mechanism. The only improvement would be to reduce Type 1 amendments through
better upfront research.

---

## Decisions that held for all 13 phases

| Decision | Where it appeared | How it held |
|---|---|---|
| MV3, no bundler, no CDN | SPEC §3, CLAUDE.md §4 | Enforced by every phase; zero deviations; simplified injection model throughout |
| Per-field isolation (BR-002) | SPEC §4, CLAUDE.md §4 | Implemented in every field loop; never violated |
| No form submission (BR-003) | SPEC §4, CLAUDE.md §4 | Never violated; named in every pa-writer review |
| Two-tab UI (User / Admin) | SPEC §7 | Never restructured; boundary clean throughout |
| Message contracts immutable after ship | SPEC §5 | No contract changed after publication; one additive contract in v1.3 |
| `chrome.storage.session` for copied data | SPEC §4.3 | Never revisited; correct lifecycle semantics throughout |
| Background service worker as router | SPEC §3.1 | Role never collapsed; no direct tab↔injected-script communication |

---

## Decisions that needed correction

| Decision | Original SPEC | What actually happened | Amendment |
|---|---|---|---|
| Alpine build | "Alpine.js v3, local" (standard build) | Standard build blocked by MV3 CSP | v1.1: replaced with `@alpinejs/csp` |
| PA field identifier | `paFieldSelector` (CSS selector) | GUID-based IDs are session-specific; `data-id` is stable | v1.2: replaced with `fieldSchemaName` |
| PA paste strategies | Generic click/type/wait sequences | PA uses React synthetic events, Fluent UI portal, field-type-specific `data-id` suffixes | v1.2: strategies completely rewritten |
| `onInstalled` guard | `reason === "install"` filter | Chrome fires `"update"` on developer reload | v1.1: replaced with storage state guard |
| `combo-select` field type | Named `combo-select` | Redundant with PA's own terminology; renamed for clarity | v1.2: renamed to `choice` |

---

## What I would specify differently in the next project

| Area | What I'd change |
|---|---|
| Third-party UI libraries in MV3 | Require a working proof-of-concept in a scratch extension before committing to a library choice in the SPEC |
| External DOM surfaces (PA, ADO) | Require a DOM inspection artefact (like SPIKE-PA-STRATEGIES.md) before writing interaction strategies; make it a named pre-spec phase |
| Chrome API non-obvious behaviour | Add a `[verify in Chrome]` annotation to any API call where the runtime behaviour is assumed, not confirmed |
| Error-path data contracts | For every status-discriminated entity, enumerate all status values and specify required fields per value |
| Phase sizing | Apply a hard rule at amendment authoring time: if an amendment introduces both new store logic and new rendering, it must be split |
| Alpine CSP constraints | Commit a constraint comment block into `app.js` as the very first commit of the side panel phase — before any directive is written |
| Risk section | Add a "high-uncertainty assumptions" table to the SPEC that lists every assumption not yet verified against a live system, with a named owner and a verification deadline |

---

## Overall assessment

The SPEC was a solid foundation for a project of this scope and timeline. The
architectural skeleton — MV3 injection model, two-tab UI, message contracts,
per-field isolation, storage model — was correct on the first attempt and held
for all 13 phases. The implementation found no reason to deviate from any of those
decisions.

The SPEC's weaknesses were concentrated in two areas: the Alpine.js build selection
(a tooling research gap) and the PowerApps DOM interaction model (a domain research
gap). Both weaknesses were correctable through amendments, and both produced bugs
before the amendments landed. The lesson is not that the SPEC should have been
longer; it is that the spec authoring phase should have included one more day of
research on the two highest-risk external surfaces before committing to strategies.

The amendment mechanism worked as a correction facility. Five amendments in three
days is sustainable for a small team, provided each amendment is scoped tightly and
versioned clearly. The discipline of not overwriting prior spec text — only appending
and marking changes — gave the developer and reviewer a reliable paper trail for every
design decision.

The role separation model (Architect writes SPEC; Developer implements; Reviewer
verifies; no self-archive) produced a higher-quality artefact than a single-agent
approach would have. Each role asked different questions: the Architect asked "what
should be built?"; the Developer asked "how do I build it?"; the Reviewer asked "was
it built correctly?" Those three questions are genuinely different, and collapsing them
into one role would have produced worse answers to all three.

Three days, five spec versions, thirteen phases, one working extension. The SPEC
earned its keep.
