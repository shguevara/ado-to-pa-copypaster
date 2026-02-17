# Design — Phase 8: Element Picker

## Summary

Phase 8 wires the Admin tab "Pick from Page" feature end-to-end:
`element-picker.js` (injected into PA tab) → `ELEMENT_PICKED` message (SW forwards) →
side panel `onMessage` listener → `adminMappingForm()` x-data component auto-populates
`fieldSchemaName`.
It also fixes the `hasCopiedData` edge case from COMMENTS.md and addresses the
`copy-initiative-flow` spec clarification (documentation-only).

---

## Decision D-1 — `extractSchemaName` as a module-scope named function with `module.exports` guard

**Choice**: Define `extractSchemaName(el)` as a top-level named function in
`scripts/element-picker.js`, followed by a `typeof module !== "undefined"` guard that
exports it for Vitest (identical pattern to `adoReaderMain` in `ado-reader.js` and
`detectPageType` in `service-worker.js`).

**Why not inline or anonymous?**
A named function at module scope is importable from Node.js without mocking the browser
environment or Chrome APIs.  The guard makes the file a valid CommonJS module in test
contexts while remaining an ordinary script in Chrome's injected-script context.

**Test entry point**: `tests/element-picker.test.js` imports `extractSchemaName` directly
and passes mock DOM nodes (plain JS objects with `getAttribute`, `parentElement`).  No
`jsdom` required — the function only calls `getAttribute('data-id')` and reads
`.parentElement`, both trivially mockable as POJOs.

---

## Decision D-2 — Overlay uses `pointer-events: none`; mouse events go on `document`

**Choice**: The overlay `<div>` has `pointer-events: none` in its inline style.
Hover/click listeners are placed on `document`, not on the overlay.

**Why?**
An overlay with `pointer-events: none` sits visually above the page but does not consume
mouse events — the events pass through to the real page elements underneath.  This lets
us read `e.target` to get the element the user is hovering or clicking, while the overlay
simply provides a z-index boundary that prevents any accidental click from firing native
PA React handlers BEFORE our capture listener runs.

The click listener uses `{ capture: true }` so it fires before React's bubbling
handlers, and calls `e.preventDefault()` + `e.stopPropagation()` to suppress the native
PA interaction.

---

## Decision D-3 — `ELEMENT_PICKED` routing: injected script → SW → side panel

**Choice**: The injected `element-picker.js` calls `chrome.runtime.sendMessage` directly.
The SW's existing `onMessage` handler gains a new `"ELEMENT_PICKED"` case that calls
`chrome.runtime.sendMessage` (no `tabId` — broadcasts to all extension pages) to forward
to the side panel.  The side panel's module-level `onMessage` listener gains a matching
`"ELEMENT_PICKED"` case alongside the existing `"TAB_CHANGED"` case.

**Why not connect directly from injected script to side panel?**
Injected scripts live in the page's isolated world and can only reach the extension via
`chrome.runtime.sendMessage` to the background.  There is no direct channel from an
injected script to the side panel.  This two-hop routing is the same pattern used for all
push notifications in this extension (e.g. `TAB_CHANGED`).

**SW forwarding approach**: `chrome.runtime.sendMessage({ action: "ELEMENT_PICKED",
schemaName })`.  The call may fail if the side panel is closed; wrap in try/catch and
ignore the error (same defensive pattern as the existing `TAB_CHANGED` broadcast).

---

## Decision D-4 — `pickerResult` store property signals picker output to the form component

**Choice**: Add a new `pickerResult: null` property to `Alpine.store("app")`.
When `ELEMENT_PICKED` arrives (in the module-level `onMessage`):
1. `store.pickerActive = false`
2. `store.pickerResult = { schemaName: message.schemaName }` ← always an object, never null

The `adminMappingForm()` x-data component `$watch`es `$store.app.pickerResult`.
Because the property starts as `null` and is always set to a `{ schemaName }` object on
any pick result, the watch fires reliably and the form can unconditionally read
`result.schemaName` (which may itself be `null`).

**Why an object wrapper rather than the raw `schemaName` string?**
`pickerResult` starting as `null` and the pick returning `schemaName: null` would be
indistinguishable if we stored the raw value.  Wrapping in `{ schemaName }` means a
`$watch` change from `null` → `{ schemaName: null }` always represents a freshly
returned pick result, never the initial state.

**Why not put this in the local `adminMappingForm()` state?**
The `ELEMENT_PICKED` message arrives in the module-level `onMessage` listener (outside
Alpine), which can only write to the global store.  The local form component cannot be
reached from there.  Routing through the store is the established pattern in this
codebase.

---

## Decision D-5 — CSP-compliant store methods for picker state mutations

**Choice**: Add two new methods to `Alpine.store("app")`:
- `setPickerActive(value)` — sets `this.pickerActive = value`
- `setPickerResult(obj)` — sets `this.pickerResult = obj`

**Why not direct assignment in directive expressions?**
SPEC.md §3.2 guardrail: the `@alpinejs/csp` build's expression parser silently drops
direct property assignment in directive expressions (`$store.app.pickerActive = true`
does nothing in a `@click`).  All store mutations triggered from HTML directives MUST
go through store methods.  The module-level `onMessage` listener runs in plain JS and
CAN write to store properties directly (Alpine's reactivity is still triggered).

The two new methods follow the same convention as the existing `setTab(tab)` method.

---

## Decision D-6 — `adminMappingForm()` gains `pickerWarning` draft property

**Choice**: Add `pickerWarning: ""` to the `adminMappingForm()` return object.
The existing `$watch("$store.app.showMappingForm", ...)` in `init()` is extended to also
clear `pickerWarning` when the form opens (alongside the existing field resets).

A second `$watch("$store.app.pickerResult", ...)` is added in `init()` to react to
picker results:
```js
this.$watch("$store.app.pickerResult", (result) => {
  if (!result) return;            // initial null — ignore
  if (result.schemaName) {
    this.fieldSchemaName = result.schemaName;
    this.pickerWarning   = "";
  } else {
    this.pickerWarning = "Could not determine field schema name — " +
                         "try clicking directly on the field input or label";
  }
});
```

**Why not set `fieldSchemaName` from the global store directly?**
`fieldSchemaName` is local draft state inside `adminMappingForm()`.  The CSP build's
`x-model` binds to local x-data properties; binding to a store property fails silently
(SPEC.md §3.2).  The draft property remains local; the `$watch` bridge connects the two.

---

## Decision D-7 — `hasCopiedData` fix: `.some(r => r.status !== "error")`

**Choice**: Replace the unconditional `this.hasCopiedData = true` in `copyInitiative()`
with:
```js
this.hasCopiedData = (response.results ?? []).some(r => r.status !== "error");
```

**Why now (Phase 8) rather than Phase 10?**
Phase 10 gates the Paste button on `hasCopiedData`.  Fixing this in Phase 8 ensures the
contract is correct before Phase 10 is built on top of it.  The fix is a one-liner in
`copyInitiative()`; doing it now is lower-risk than retrofitting during Phase 10.

**Why `.some(r => r.status !== "error")` rather than `.some(r => r.status === "success")`?**
`blank` results (field exists in ADO but is empty) are still persisted to session storage
and are meaningful paste targets — the PA field should remain empty.  Filtering to
`!== "error"` correctly includes `blank` results as "data that was copied and is
pasteable" (even if the paste produces a no-op or blank fill).

---

## Decision D-8 — Test strategy for `extractSchemaName`

**Choice**: Vitest, `@vitest-environment node` (same environment as `ado-reader.test.js`).
Mock DOM nodes are plain JS objects:
```js
function mockEl(dataId, parent = null) {
  return { getAttribute: (attr) => attr === "data-id" ? dataId : null, parentElement: parent };
}
```
No `jsdom` required — `extractSchemaName` only reads `el.getAttribute("data-id")` and
`el.parentElement`.  Five scenarios from SPEC.md §9.2 are each tested:
1. Direct `data-id` on clicked element
2. No `data-id` on element, parent has it (walk 1 level)
3. Grandparent has the `data-id` (walk 2 levels)
4. `data-id` starting with GUID pattern — skipped, returns null
5. No `data-id` anywhere — returns null
6. Walk stops at body (parentElement is `document.body`) — returns null

Coverage target: ≥ 90% branch coverage per SPEC.md §9.2.

---

## Files Changed

| File | Change |
|---|---|
| `scripts/element-picker.js` | Replace TODO stub with full implementation |
| `background/service-worker.js` | Add `START_ELEMENT_PICKER`, `ELEMENT_PICKED`, `CANCEL_ELEMENT_PICKER` cases |
| `sidepanel/app.js` | `pickerResult` property, `setPickerActive`, `setPickerResult` methods; `ELEMENT_PICKED` case in module-level listener; `hasCopiedData` fix; `pickerWarning` in `adminMappingForm` |
| `sidepanel/index.html` | "Pick from Page" / "Cancel Pick" button, picker warning element, `:disabled` binding |
| `tests/element-picker.test.js` | New test file for `extractSchemaName` |
| `openspec/specs/copy-initiative-flow/spec.md` | Spec clarification — no code change |
