## Context

Phase 4 delivered the storage layer: `GET_SETTINGS`, `SAVE_SETTINGS`, and default-seed on install. The Alpine store already declares all admin-state properties (`settings`, `editingMapping`, `showMappingForm`, etc.) but `app.js` never calls `GET_SETTINGS` and `index.html` has no admin UI. This phase wires them together.

Key constraints coming in:
- **`@alpinejs/csp` build** — the CSP expression parser silently drops assignments from directive expressions (e.g. `$store.app.x = y` in `@click` does nothing). All store mutations triggered from directives must go through explicit store methods.
- **No build step, no bundler** — everything must run natively in Chrome 114+ as loaded files.
- **Side panel width ~400px** — inline UI preferred over modals.
- **`service-worker.js` header is stale** — COMMENTS.md 🟡 item; must be fixed in this phase before new code is added to that file.

---

## Goals / Non-Goals

**Goals:**
- Render the Admin tab mapping list with label, fieldType badge, enabled toggle, Edit/Delete buttons.
- Add Mapping and Edit Mapping forms (Label, ADO Selector, Field Schema Name, Field Type) with inline validation.
- Delete with `window.confirm` confirmation.
- Overwrite Mode checkbox — saves immediately on change.
- Load `AppSettings` from storage on Alpine init so the list is populated from the first frame.
- All store mutations from directive expressions go through named store methods.
- Fix the stale `service-worker.js` file header comment (🟡 COMMENTS.md).

**Non-Goals:**
- "Pick from Page" button (Phase 8) — button is present in HTML but disabled/no-op.
- "Test Field" button (Phase 9) — same, present but disabled/no-op.
- Export / Import (Phase 6) — buttons present but non-functional.
- Any logic changes to `service-worker.js` beyond the header comment update.
- Unit tests — see D-6.

---

## Decisions

### D-1 — Form data lives in local `x-data`, not in the Alpine store

**Choice**: The mapping form uses a local `x-data` component with its own `label`, `adoSelector`, `fieldSchemaName`, `fieldType`, and `formError` properties. When the form opens, an `init()` method (called once) sets up a `$watch` on `$store.app.showMappingForm`; each time it becomes `true`, the form fields are reset from `$store.app.editingMapping` (or blanked for "add" mode). `x-model` binds the inputs to local data.

**Why**: `x-model` on a `$store` property (e.g. `x-model="$store.app.editingMapping.label"`) would silently fail to update the store on input because the CSP build drops write expressions. Local `x-data` properties are first-class Alpine reactive data — `x-model` works correctly against them with no workarounds. The store only needs to hold the *committed* state (the saved mapping), not the *draft* state while the user is typing.

**Alternative considered**: Keeping all form state in the store and using store methods for each keystroke. Rejected — overly verbose (a `setFormLabel(v)` store method for every field), and dirtier than the natural separation of "draft data in the form" vs "committed data in the store".

---

### D-2 — Settings loaded on Alpine `init`, alongside `GET_PAGE_CONTEXT`

**Choice**: In the `alpine:init` callback in `app.js`, send `GET_SETTINGS` immediately after `GET_PAGE_CONTEXT`. On response, set `Alpine.store('app').settings = response.settings`.

**Why**: Loading eagerly means the Admin tab is correctly populated from the first frame — no flash of "no mappings" if the user's default tab is Admin. The payload is tiny (a few KB at most). Loading lazily (e.g., on first Admin tab show) would require extra `x-init` / `x-effect` wiring and introduces a render delay when switching tabs.

**Alternative considered**: Lazy-load on first Admin tab show using `x-effect` or a `$watch` on `activeTab`. Rejected — more complex, visibly slower.

---

### D-3 — Store methods for all CRUD operations (CSP constraint)

**Choice**: Add the following methods to `Alpine.store("app", { ... })` in `app.js`:

| Method | Triggered by |
|---|---|
| `openAddForm()` | "+ Add Mapping" button |
| `openEditForm(id)` | "Edit" button on a mapping row |
| `closeForm()` | "Cancel" button in form |
| `saveMapping(formData)` | "Save" button in form |
| `deleteMapping(id)` | "Delete" button on a mapping row |
| `toggleEnabled(id)` | Enabled checkbox on a mapping row |
| `setOverwriteMode(value)` | Overwrite Mode checkbox |

**Why**: Every mutation that originates from a directive expression (e.g. `@click`, `@change`) must go through a method call — the CSP build only silently drops assignment expressions, not method invocations. Using methods also centralises all persistence calls (`SAVE_SETTINGS`) in one place rather than scattering `chrome.runtime.sendMessage` calls across HTML.

**Shallow copy on `openEditForm(id)`**: Must do `this.editingMapping = { ...mapping }` (copy) not `this.editingMapping = mapping` (reference). If the user edits fields and then cancels, we must not have mutated the original mapping object in `settings.mappings`.

---

### D-4 — UUID generation via `crypto.randomUUID()`

**Choice**: New mapping IDs are generated with `crypto.randomUUID()`.

**Why**: Available in Chrome 92+ (well within the Chrome 114+ minimum). Zero dependencies, no library needed. Returns RFC 4122 v4 UUIDs. The alternative (Math.random-based home-grown UUID) is weaker and unnecessary.

---

### D-5 — Validation in the form's local `x-data`, not the store method

**Choice**: The form's local component validates all required fields before calling `$store.app.saveMapping(formData)`. The form's `save()` method:
1. Sets `formError = ''`.
2. Checks that `label`, `adoSelector`, and `fieldSchemaName` are non-empty strings; `fieldType` is one of `["text", "lookup", "choice"]`.
3. If any check fails: sets `formError = "<message>"`, does NOT call `saveMapping`.
4. If all pass: calls `$store.app.saveMapping(formData)`.

The store's `saveMapping` method still validates as a safety net (returns early on invalid input) but doesn't need to report field-level errors back to the form.

**Why**: Validation is about the current draft — local form state. Putting it in the store method creates a coupling between the store and form-display concerns (the store would need to set form-display error properties). Keeping validation local to the form is the simpler separation.

---

### D-6 — No unit tests for Admin CRUD (manual verification)

**Choice**: No Vitest unit tests are written for this phase. Manual verification against Chrome is the testing strategy.

**Why**: The admin CRUD logic is entirely UI-driven:
- Store methods are thin wrappers around array operations + `chrome.runtime.sendMessage` calls — none of them contain extractable pure logic functions.
- Form validation is 3 non-empty checks — too trivial to warrant a test harness, and the validator is impossible to exercise without Alpine context.
- Integration with `GET_SETTINGS` / `SAVE_SETTINGS` cannot be meaningfully tested without a Chrome extension environment.

Same rationale as Phase 3 (Alpine store wiring) and Phase 4 (storage handlers). Manual test scenarios cover all paths.

---

### D-7 — `service-worker.js` header update is an isolated non-functional change

**Choice**: Update only the JSDoc block at lines 1–15 to reflect all 8 current responsibilities and correct the stale "Phase 4+" forward reference. No logic changes.

**Why**: Addresses 🟡 COMMENTS.md from Phase 4 review. Must be fixed before new code makes the header even more out-of-date. A reviewer reading the file header should get an accurate contract for the module.

---

## Risks / Trade-offs

**`$watch` fires on every `showMappingForm` toggle** → The form re-initialises every time it opens. Minor cost: a shallow copy of a small object. No concern.

**`window.confirm` is synchronous and blocks the browser tab** → Acceptable for an internal tool used by 2–4 people. An inline confirmation (click "Delete" → row expands with "Are you sure?" + "Confirm" / "Cancel") would be better UX but adds state complexity. Deferred to a future polish phase.

**`settings` in store could be `null` while `GET_SETTINGS` is in flight** → Alpine directives that render `settings.mappings` must guard with `$store.app.settings?.mappings` or use `x-if` / `x-show` conditional. This is an existing concern from the Phase 3 store shape; addressed by always defaulting the template with a null-guard.

**Saving on every mutation means many small writes to `chrome.storage.local`** → Acceptable. Each write is a few KB. Chrome's storage write throughput far exceeds this usage.

---

## Migration Plan

No migration needed. No schema changes. Existing `settings` in `chrome.storage.local` (from Phase 4 defaults or any existing data) is forward-compatible with all Phase 5 operations.

---

## Open Questions

None. SPEC.md §11 Phase 5 is unambiguous; all UI shape is specified in §7.3; store shape is fully specified in §7.4.
