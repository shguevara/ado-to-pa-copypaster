## ADDED Requirements

### Requirement: Manifest declares all required MV3 fields
The extension SHALL include a `manifest.json` at the project root that conforms exactly to the structure defined in SPEC.md §3.4. It MUST declare `"manifest_version": 3`, the `permissions` array (`activeTab`, `storage`, `scripting`, `sidePanel`, `tabs`), all four `host_permissions` entries (`https://dev.azure.com/*`, `https://*.visualstudio.com/*`, `https://*.powerapps.com/*`, `https://*.dynamics.com/*`), a `background.service_worker` pointing to `background/service-worker.js`, a `side_panel.default_path` pointing to `sidepanel/index.html`, and `action` / `icons` keys referencing the three PNG assets.

#### Scenario: Extension loads in Chrome without manifest errors
- **WHEN** the extension directory is loaded via `chrome://extensions` → Load unpacked
- **THEN** Chrome accepts the extension with no error banner and no console errors in the service worker

#### Scenario: Side panel opens from action icon click
- **WHEN** the user clicks the extension action icon in the Chrome toolbar
- **THEN** the Chrome Side Panel opens and displays the side panel content

#### Scenario: Correct permissions are declared
- **WHEN** the extension is installed
- **THEN** Chrome shows the expected permissions prompt (or none for permissions that require no prompt) and no undeclared host access is present

---

### Requirement: Directory structure matches the specification
The project root SHALL contain every file and folder defined in SPEC.md §10. Files that are not yet implemented MUST exist as stubs so that later phases can fill them in without renaming or relocating paths.

Required paths:
- `manifest.json`
- `background/service-worker.js`
- `sidepanel/index.html`, `sidepanel/app.js`, `sidepanel/styles.css`
- `scripts/ado-reader.js`, `scripts/pa-writer.js`, `scripts/element-picker.js`, `scripts/selector-tester.js`
- `lib/alpine.min.js`, `lib/selector-generator.js`
- `assets/icon-16.png`, `assets/icon-48.png`, `assets/icon-128.png`

#### Scenario: All specified paths exist after scaffold
- **WHEN** the scaffold phase is complete
- **THEN** every path listed above exists on disk and `git status` shows all files tracked

#### Scenario: Stub files are identifiable as not-yet-implemented
- **WHEN** a developer opens any stub JS or CSS file
- **THEN** the file contains a `// TODO Phase N: implement <description>` comment at the top so its pending status is immediately visible

---

### Requirement: Alpine.js v3 is available as a local file
The `lib/alpine.min.js` file SHALL be a valid, complete minified build of Alpine.js version 3.x sourced from the official Alpine.js GitHub releases. It MUST NOT be fetched from a CDN at runtime. The exact version and source URL SHALL be noted in a comment at the top of the file or in an adjacent `lib/README.md`.

#### Scenario: Side panel HTML imports Alpine from local path
- **WHEN** `sidepanel/index.html` is loaded by Chrome
- **THEN** it loads Alpine.js via `<script defer src="../lib/alpine.min.js">` (relative path, no external URL)

#### Scenario: Alpine initialises without CSP errors
- **WHEN** the side panel is opened in Chrome
- **THEN** no Content Security Policy violations appear in the DevTools console related to Alpine.js

---

### Requirement: Side panel shell renders without runtime errors
The `sidepanel/index.html` stub SHALL be a valid HTML5 document that loads `lib/alpine.min.js` and `sidepanel/app.js` using `<script defer>` tags. It MUST render at least a visible placeholder element (e.g., `<div>Hello</div>`) so that a developer can confirm the panel opened successfully.

#### Scenario: Side panel displays placeholder content
- **WHEN** the extension is loaded and the side panel is opened
- **THEN** the panel shows a visible text element (not a blank white page) and the browser console shows no JavaScript errors

#### Scenario: Service worker logs startup message
- **WHEN** the extension is loaded or the service worker starts
- **THEN** `background/service-worker.js` logs `"SW started"` to the service worker console confirming the background worker was registered and executed

---

### Requirement: Icon assets are valid PNGs at required dimensions
The `assets/` directory SHALL contain `icon-16.png` (16×16 px), `icon-48.png` (48×48 px), and `icon-128.png` (128×128 px). Each MUST be a valid PNG file. These are placeholder images and MAY be simple solid-colour squares. They MUST NOT be empty files (zero bytes), as Chrome rejects zero-byte icons.

#### Scenario: Extension icon appears in Chrome toolbar
- **WHEN** the extension is loaded unpacked
- **THEN** an icon (even if a placeholder colour square) is visible in the Chrome extensions area of the toolbar rather than a broken-image or missing icon
