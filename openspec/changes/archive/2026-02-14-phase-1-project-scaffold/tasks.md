## 1. Manifest

- [x] 1.1 Create `manifest.json` at the project root with all fields from SPEC.md §3.4: `manifest_version: 3`, `name`, `version`, `description`, `permissions` (activeTab, storage, scripting, sidePanel, tabs), `host_permissions` (4 entries), `background.service_worker`, `side_panel.default_path`, `action` with icon paths, and top-level `icons` key.
- [x] 1.2 Verify that the JSON is valid (no trailing commas, correct bracket matching) and that all referenced file paths (`background/service-worker.js`, `sidepanel/index.html`, `assets/icon-*.png`) will exist after the remaining tasks are complete.

## 2. Placeholder Icons

- [x] 2.1 Create `assets/` directory and add `assets/icon-16.png` (16×16 px valid PNG) — may be a solid-colour square; must not be zero bytes (SPEC.md §10, spec: *Icon assets are valid PNGs at required dimensions*).
- [x] 2.2 Create `assets/icon-48.png` (48×48 px valid PNG) following the same constraint as 2.1.
- [x] 2.3 Create `assets/icon-128.png` (128×128 px valid PNG) following the same constraint as 2.1.

## 3. Alpine.js Local Copy

- [x] 3.1 Download the Alpine.js v3 latest stable minified bundle (`alpine.min.js`) from the official Alpine.js GitHub releases page (https://github.com/alpinejs/alpine/releases). Save it to `lib/alpine.min.js` (SPEC.md §3.3, design decision 1).
- [x] 3.2 Add a comment block at the very top of `lib/alpine.min.js` recording the exact version and source URL (e.g., `// Alpine.js v3.x.x — https://github.com/alpinejs/alpine/releases/tag/v3.x.x`). This preserves upgrade traceability without a `package.json`.

## 4. Background Service Worker Stub

- [x] 4.1 Create `background/` directory and add `background/service-worker.js` containing only `console.log("SW started");` followed by a `// TODO Phase 2: implement tab detection and message routing` comment (SPEC.md §11 Phase 1, spec: *Side panel shell renders without runtime errors*).

## 5. Side Panel Files

- [x] 5.1 Create `sidepanel/index.html` as a valid HTML5 document that: (a) loads `../lib/alpine.min.js` via `<script defer src="../lib/alpine.min.js"></script>`, (b) loads `./app.js` via `<script defer src="./app.js"></script>`, and (c) contains a visible placeholder element such as `<div>Hello</div>` (SPEC.md §11 Phase 1, design decision 4).
- [x] 5.2 Create `sidepanel/app.js` stub containing only a `// TODO Phase 3: register Alpine.store("app", {...}) and message listeners` comment.
- [x] 5.3 Create `sidepanel/styles.css` stub containing only a `// TODO Phase 3: implement tab layout, status indicators, form controls` comment.

## 6. Injected Script Stubs

- [x] 6.1 Create `scripts/ado-reader.js` stub with comment: `// TODO Phase 7: implement ADO DOM reader — returns FieldResult[]`.
- [x] 6.2 Create `scripts/pa-writer.js` stub with comment: `// TODO Phase 10: implement PA form writer — returns FieldResult[] — NEVER call form.submit() (BR-003)`.
- [x] 6.3 Create `scripts/element-picker.js` stub with comment: `// TODO Phase 8: implement point-and-click element picker overlay`.
- [x] 6.4 Create `scripts/selector-tester.js` stub with comment: `// TODO Phase 9: implement CSS selector tester — highlights matched element`.

## 7. Lib Stubs

- [x] 7.1 Create `lib/selector-generator.js` stub with comment: `// TODO Phase 8: implement generateSelector(el) — defines window.generateSelector (not an ES module)`.

## 8. Verification

- [x] 8.1 Open `chrome://extensions`, enable Developer Mode, click "Load unpacked", and select the project directory. Confirm that Chrome accepts the extension with no error banner (SPEC.md §11 Phase 1, spec: *Extension loads in Chrome without manifest errors*).
- [x] 8.2 Click the extension action icon in the Chrome toolbar. Confirm the Side Panel opens and displays the "Hello" placeholder text without any JavaScript errors in the DevTools console (spec: *Side panel displays placeholder content*).
- [x] 8.3 Open the service worker DevTools console (from `chrome://extensions` → "Service Worker" link). Confirm `"SW started"` is logged (spec: *Service worker logs startup message*).
- [x] 8.4 Confirm the extension icon is visible (not broken/missing) in the Chrome toolbar (spec: *Extension icon appears in Chrome toolbar*).
