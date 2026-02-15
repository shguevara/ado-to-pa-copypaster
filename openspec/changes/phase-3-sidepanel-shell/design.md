# Design: Phase 3 — Side Panel Shell & Navigation

## Context

Phase 1 created a minimal side panel stub (`sidepanel/index.html` with a bare `<div>Hello</div>`
and an Alpine.js script tag pointing at a non-existent file). Phase 2 delivered the background
service worker with tab detection, caching, and message routing — including `TAB_CHANGED` push
notifications and the `GET_PAGE_CONTEXT` request handler. Both are live and tested.

This phase wires those two layers together by building the reactive UI shell: Alpine.js
initialized with the full store, the tab bar rendered, and `pageType` kept live via the service
worker's push messages. Every subsequent phase (Admin tab CRUD, Copy flow, Paste flow) will add
panels and store properties on top of this shell without modifying its structural decisions.

**Constraints:**
- No build step, no bundler, no CDN — Alpine.js must be a local file.
- MV3 Content Security Policy forbids `eval` and inline script execution with `unsafe-eval`;
  Alpine.js v3 must be used (it dropped the `eval`-based expression engine in v3).
- Chrome 114+ only — no transpilation needed; ES2020 syntax is fine everywhere.

## Goals / Non-Goals

**Goals:**
- Provide a loadable, navigable side panel with User and Admin tabs.
- Keep `$store.app.pageType` always in sync with the active browser tab.
- Establish the full Alpine store shape so future phases can add to it without restructuring.
- Keep the HTML template clean and readable; move all logic into `app.js`.

**Non-Goals:**
- Implementing any User Tab or Admin Tab content (buttons, field lists, mapping CRUD) — those are
  Phase 4+.
- Writing unit tests for the side panel (Alpine reactivity and Chrome messaging APIs cannot be
  tested in a Node.js Vitest environment without heavy mocking; manual verification is the
  appropriate strategy for the shell).
- Downloading Alpine.js as part of this change — the developer places the file manually once;
  it is not scripted.

## Decisions

### D-1 — Alpine store registered via `alpine:init`, not inline script

**Choice**: Register `Alpine.store('app', { ... })` inside a
`document.addEventListener('alpine:init', callback)` listener in `app.js`. Import `app.js`
via `<script src="app.js">` *before* `alpine.min.js` in the HTML.

**Why**: Alpine's documentation requires stores to be registered before Alpine initialises the
DOM. The `alpine:init` event fires synchronously during Alpine's own startup, after Alpine is
available but before it walks the DOM. This is the idiomatic, forward-compatible pattern.

**Alternative considered**: Registering the store in a `<script>` block placed *after*
`alpine.min.js` in the HTML. This also works if Alpine hasn't been invoked yet, but couples
logic to HTML ordering and pollutes the template with application code.

---

### D-2 — `GET_PAGE_CONTEXT` called inside `alpine:init` callback

**Choice**: After registering the store, still inside the `alpine:init` callback, call
`chrome.runtime.sendMessage({ action: 'GET_PAGE_CONTEXT' })` and set
`Alpine.store('app').pageType` from the response.

**Why**: Calling it here guarantees the store exists before the response arrives. Calling it
later (e.g. inside an Alpine `x-init`) would introduce a race where the DOM renders once with
the default `"unsupported"` state and then immediately re-renders — a visible flash. The
`alpine:init` approach sets `pageType` before any DOM binding is evaluated.

**Alternative considered**: `x-init` on the root element. Works, but causes the flash described
above and scatters initialisation logic across HTML and JS.

---

### D-3 — `chrome.runtime.onMessage` listener registered in `app.js` at module level

**Choice**: Register the `TAB_CHANGED` message listener at the top level of `app.js` (outside
Alpine, before the `alpine:init` callback), so it is active as soon as the script loads.

**Why**: The listener must be registered before any message can arrive. Registering it outside
Alpine means it does not depend on Alpine's initialisation lifecycle and will never miss an
early-arriving push. The handler simply reads `Alpine.store('app')` and writes to it — Alpine
reactivity takes care of the rest.

**Alternative considered**: Registering inside `alpine:init`. Slightly cleaner but opens a
small window where a `TAB_CHANGED` message sent before Alpine finishes initialising would be
dropped silently.

---

### D-4 — CSS uses a flat stylesheet, no utility framework

**Choice**: A single `sidepanel/styles.css` file with hand-authored class selectors. No
Tailwind, no CSS modules, no PostCSS.

**Why**: The project has no build step. Any utility-class approach would require either a CDN
(forbidden by MV3 CSP for local resources) or a build tool (not allowed). A small flat CSS file
is the most predictable and auditable approach given the constraint.

---

### D-5 — Tab state stored in `$store.app.activeTab`, switched with `x-show`

**Choice**: The two tab panels (`#tab-user`, `#tab-admin`) are always present in the DOM and
toggled with `x-show="$store.app.activeTab === 'user'"`. Tab buttons use
`@click="$store.app.activeTab = 'user'"`.

**Why**: `x-show` toggles CSS `display` — elements stay in the DOM, so their state is
preserved when switching tabs. `x-if` would destroy and re-create panels on every switch,
losing transient UI state (e.g. a partially filled mapping form) and triggering unnecessary
re-initialisation.

**Alternative considered**: `x-if`. Cleaner DOM, but causes state loss on every tab switch.
Not appropriate for the Admin tab which will have inline forms.

## Risks / Trade-offs

**[Risk] Alpine.js file is not present at `lib/alpine.min.js`**
→ The side panel will fail to load with a `net::ERR_FILE_NOT_FOUND` error. Mitigation: the
tasks for this phase include an explicit "download and place Alpine.js" step. The README will
document this as a one-time setup requirement.

**[Risk] `GET_PAGE_CONTEXT` response arrives before `alpine:init` fires**
→ Cannot happen: `chrome.runtime.sendMessage` is async; the response always arrives on a
future microtask/task turn, well after `alpine:init` has fired synchronously during script
evaluation.

**[Risk] `TAB_CHANGED` arrives before the store is registered (D-3 listener fires early)**
→ The handler guards with `const store = Alpine.store('app'); if (!store) return;`. If Alpine
is somehow not yet initialised, the message is safely dropped. The next `TAB_CHANGED` (on any
tab activation or URL change) will re-sync correctly.

**[Trade-off] No unit tests for the shell**
→ Alpine.js store + `chrome.runtime` interaction requires either a real browser or a heavy mock
harness. For this phase (pure wiring, no logic), manual verification against the running
extension is faster and provides equivalent confidence. Future phases that introduce testable
pure logic will add Vitest coverage.

## Open Questions

_(None — all decisions resolved above.)_
