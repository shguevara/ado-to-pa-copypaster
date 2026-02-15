## Why

The repository currently contains only specification documents — no source files exist. Before any feature work can begin, the extension must be bootstrapped with the correct Manifest V3 structure so that it can be loaded in Chrome, verified not to error on startup, and used as a foundation for all subsequent phases.

## What Changes

- Add `manifest.json` declaring all MV3 permissions, host permissions, background service worker, side panel default path, action icon, and extension icons (per SPEC.md §3.4).
- Add placeholder icon PNGs (`assets/icon-16.png`, `icon-48.png`, `icon-128.png`) — minimal valid images for the manifest to reference.
- Add stub `background/service-worker.js` with a single `console.log("SW started")` so Chrome registers the worker without error.
- Add stub `sidepanel/index.html` with a bare `<div>Hello</div>` and a `<script>` tag importing `../lib/alpine.min.js` so the file is structurally correct from the start.
- Add `lib/alpine.min.js` — download the Alpine.js v3 minified bundle (local copy; no CDN per project constraints).
- Create empty placeholder files for all remaining source paths so the folder structure matches SPEC.md §10 exactly: `sidepanel/app.js`, `sidepanel/styles.css`, `scripts/ado-reader.js`, `scripts/pa-writer.js`, `scripts/element-picker.js`, `scripts/selector-tester.js`, `lib/selector-generator.js`.

## Capabilities

### New Capabilities

- `extension-scaffold`: The complete directory skeleton of the Chrome MV3 extension — manifest, folder layout, placeholder assets, stub entry-point files, and local Alpine.js copy — sufficient to load as an unpacked extension in Chrome with no console errors.

### Modified Capabilities

_(none — no existing specs to modify)_

## Impact

- **New files**: `manifest.json`, `assets/icon-*.png` (×3), `background/service-worker.js`, `sidepanel/index.html`, `sidepanel/app.js`, `sidepanel/styles.css`, `scripts/ado-reader.js`, `scripts/pa-writer.js`, `scripts/element-picker.js`, `scripts/selector-tester.js`, `lib/alpine.min.js`, `lib/selector-generator.js`.
- **No existing code** is modified or deleted (nothing exists yet).
- **External dependency**: Alpine.js v3 minified bundle must be downloaded from the Alpine.js GitHub releases page and saved to `lib/alpine.min.js`.
- **Chrome runtime**: Extension can be loaded via `chrome://extensions` → Developer Mode → Load unpacked. Chrome 114+ required.
- **No tests** are required for this phase — stub files contain no logic. The acceptance criterion is that the extension loads without errors.
