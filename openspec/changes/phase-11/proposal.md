## Why

After Phase 10 delivered the Paste flow, the User Tab still lacks visual feedback: fields only appear after a Copy operation, there is no way to see which fields succeeded or failed, and no mechanism to reset session data. Phase 11 delivers the full User Tab UI overhaul specified in SPEC.md v1.4 (ENHANCEMENTS.01.md), making field state visible at all times and giving users explicit control over session data.

## What Changes

- **Always-visible field list** — the User Tab renders all enabled mappings immediately on open, before any Copy action occurs. Each row shows the mapping label and a status badge defaulting to NOT COPIED.
- **Per-field Copy state badges** — after Copy, each row transitions to COPIED (with the captured value shown) or FAILED (with the error message). All outcomes — including errors — are now persisted to `chrome.storage.session`.
- **Per-field Paste state badges** — after Paste, each row transitions to PASTED (check icon), FAILED (X icon + error), or SKIPPED (forbidden icon + reason). If a copied value is available it is shown under the label for all states.
- **Clear button** — clears `chrome.storage.session` copied data, resets all rows to NOT COPIED, and disables the Paste button.
- **New `CLEAR_COPIED_DATA` message** — service-worker handler for the Clear action.
- **Updated button styling** — Copy (#0078D4), Paste (#742774), disabled (#CCCCCC); height 48 px; font-size 12 px.
- **Updated context banners** — Azure DevOps (blue), PowerApps (purple), Unsupported (grey/white), each with coloured dot, label, and background fill.
- **Alpine store expansion** — `enabledMappings`, `fieldUIStates`, `lastPasteResults` properties; `clearCopiedData()` and `deriveFieldUIStates()` methods.

## Capabilities

### New Capabilities

- `user-tab-field-states`: Always-visible field list with per-field state badges (NOT COPIED / COPIED / FAILED / PASTED / SKIPPED), copied values, error/reason messages, Clear button, and the `CLEAR_COPIED_DATA` message handler. Includes the `FieldUIState` derived entity and the updated Alpine store shape.

### Modified Capabilities

- `sidepanel-shell`: User Tab layout redesigned (always-visible list replaces post-copy list); context banner colours updated to brand-accurate blue/purple/grey palette; button heights, colours, and font-size updated per reference UI.
- `copy-initiative-flow`: Step 7 of the copy flow must now persist ALL field outcomes to session storage (including errors), not only successful values. `CopiedFieldData` entries with `readStatus: "error"` must be stored.

## Impact

- **Modified file**: `sidepanel/index.html` — User Tab markup rewritten: always-visible field list, per-field state badges, Clear button, updated banner and button styles.
- **Modified file**: `sidepanel/app.js` — Alpine store gains `enabledMappings`, `fieldUIStates`, `lastPasteResults`, `clearCopiedData()`, `deriveFieldUIStates()`; paste result rendering moved to per-field state model.
- **Modified file**: `sidepanel/styles.css` — badge styles, button colour overrides, banner colour tokens.
- **Modified file**: `background/service-worker.js` — adds `CLEAR_COPIED_DATA` handler; copy flow updated to persist all outcomes including errors.
- **No changes** to `manifest.json`, injection scripts, or storage schema keys beyond the already-approved `CopiedFieldData` shape expansion.
