## Why

Phase 8 implements the **Element Picker** — the "Pick from Page" feature in the Admin tab
that lets administrators capture a PA field's `fieldSchemaName` by clicking a live element
on a PowerApps form, rather than manually inspecting `data-id` attributes in DevTools.
This capability is a prerequisite for efficient field mapping setup and unblocks the Phase 9
(Test Field) and Phase 10 (PA Writer) delivery path.

This change also resolves two 🟡 "Should Fix" items surfaced in the Phase 7 COMMENTS.md
review: the `hasCopiedData` edge-case bug and the copy-error-display spec/task artifact
conflict. Both must be addressed before Phase 10 consumes `hasCopiedData` as a gate.

## What Changes

- **NEW**: `scripts/element-picker.js` — full-screen transparent overlay injected on-demand
  into PA tabs; listens for mouseover (hover highlight) and click (schema name extraction +
  ELEMENT_PICKED message); cancellable via Escape key.
- **NEW**: Service worker — three new message handlers: `START_ELEMENT_PICKER` (inject
  element-picker.js), `ELEMENT_PICKED` (forward schema name from injected script to side
  panel), `CANCEL_ELEMENT_PICKER` (execute cleanup in the tab).
- **MODIFIED**: `sidepanel/app.js` — handle `ELEMENT_PICKED` push in the module-level
  `onMessage` listener; add `pickerResult` store property + `setPickerActive()` +
  `setPickerResult()` store methods; fix `hasCopiedData` edge case (🟡 COMMENTS.md item 1).
- **MODIFIED**: `sidepanel/index.html` — wire "Pick from Page" button; "Cancel Pick" mode
  while picker is active; inline warning when picker returns `null`; button disabled when
  `pageType !== "pa"`.
- **MODIFIED**: `adminMappingForm()` (app.js) — add `pickerWarning` draft property; watch
  `$store.app.pickerResult` to auto-populate `fieldSchemaName` or display warning.
- **SPEC UPDATE**: `openspec/specs/copy-initiative-flow/spec.md` — amend the "Top-level
  error display" scenario to formally accept the `__error__`-entry approach (🟡 COMMENTS.md
  item 2). No runtime behaviour change — documentation alignment only.
- **NEW**: `tests/element-picker.test.js` — unit tests for the pure `extractSchemaName`
  function (TDD-first, per SPEC.md §9.2 coverage goals).

## Capabilities

### New Capabilities
- `element-picker`: Point-and-click overlay injected into PA tabs that extracts the
  `fieldSchemaName` from an element's `data-id` attribute (part before the first dot),
  walking up the DOM if necessary, rejecting GUID-formatted values; result sent back to
  the Admin tab mapping form via `ELEMENT_PICKED` message.

### Modified Capabilities
<!-- No spec-level requirement changes to existing capabilities. The copy-initiative-flow
     update is a documentation-only clarification that makes the spec match the
     already-implemented behaviour — no acceptance-criteria change. -->

## Impact

- `scripts/element-picker.js` — new file
- `background/service-worker.js` — 3 new message action cases
- `sidepanel/app.js` — onMessage extension, store property/method additions, hasCopiedData fix
- `sidepanel/index.html` — "Pick from Page" button state management
- `tests/element-picker.test.js` — new test file
- `openspec/specs/copy-initiative-flow/spec.md` — spec clarification (no code change)
- No changes to `manifest.json`, storage schema, or injection architecture
