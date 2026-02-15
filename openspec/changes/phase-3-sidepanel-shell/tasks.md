# Tasks: Phase 3 — Side Panel Shell & Navigation

## 1. Prerequisites

- [x] 1.1 Download the Alpine.js v3 latest stable minified build and save it as `lib/alpine.min.js`. Verify the file is present and well-formed (open the side panel after adding it to confirm no load error). No CDN — local file only (SPEC.md §3.2, §10).

## 2. Alpine Store — sidepanel/app.js

- [x] 2.1 Create `sidepanel/app.js`. Inside a `document.addEventListener('alpine:init', ...)` callback register `Alpine.store('app', { ... })` with all 13 properties from SPEC.md §7.4 set to their documented defaults (`activeTab: "user"`, `pageType: "unsupported"`, `copyStatus: "idle"`, `pasteStatus: "idle"`, `hasCopiedData: false`, `lastOperation: null`, `fieldResults: []`, `settings: null`, `editingMapping: null`, `showMappingForm: false`, `pickerActive: false`, `testSelectorResult: null`, `testSelectorLoading: false`, `importMessage: null`). Store must be registered before Alpine walks the DOM (design D-1).

- [x] 2.2 Still inside the `alpine:init` callback (after store registration), call `chrome.runtime.sendMessage({ action: 'GET_PAGE_CONTEXT' })`. In the response callback, set `Alpine.store('app').pageType = response.pageType`. This hydrates `pageType` before the first render (SPEC.md §7.2, spec req: "pageType hydrated from background service worker on load", design D-2).

- [x] 2.3 Before the `alpine:init` listener (at the top level of `app.js`), register `chrome.runtime.onMessage.addListener((message) => { ... })`. When `message.action === 'TAB_CHANGED'`, write `message.pageType` into `Alpine.store('app').pageType`. Guard with an early `if (!Alpine.store('app')) return` to safely drop messages that arrive before Alpine initialises (spec req: "pageType updated reactively on TAB_CHANGED push", design D-3).

## 3. HTML Shell — sidepanel/index.html

- [x] 3.1 Replace the existing stub `sidepanel/index.html`. Add `<link rel="stylesheet" href="styles.css">` in `<head>`. In `<body>`, load `<script src="app.js">` first (so the `alpine:init` listener is registered before Alpine runs), then `<script src="../lib/alpine.min.js" defer>`. Root element should carry the Alpine initialization (SPEC.md §7.1).

- [x] 3.2 Add the tab bar: two `<button>` elements labelled "User" and "Admin". Each button sets `$store.app.activeTab` on click and applies an active CSS class when `$store.app.activeTab` equals its value. Implements SPEC.md §7.1 tab navigation (spec req: "Tab navigation renders and switches correctly", design D-5).

- [x] 3.3 Add the User tab panel: `<div x-show="$store.app.activeTab === 'user'">`. Inside, render the page context banner (SPEC.md §7.2): one of three coloured-dot + message combinations driven by `$store.app.pageType` using Alpine's `x-show` or a ternary expression. Stub out empty sections for the Copy/Paste buttons and field status list — these will be filled in Phase 7/10 (spec req: "Page context banner reflects current pageType").

- [x] 3.4 Add the Admin tab panel: `<div x-show="$store.app.activeTab === 'admin'">` with placeholder content (e.g. `<p>⚙ Admin settings coming soon.</p>`). Uses `x-show` so DOM state is preserved on tab switch (SPEC.md §7.3, design D-5).

## 4. Styles — sidepanel/styles.css

- [x] 4.1 Create `sidepanel/styles.css`. Include: a minimal CSS reset for the panel, tab bar flex layout with an active-tab underline or highlight, tab panel container sizing, and page context banner styles (dot icon sized and coloured per page type, message text). Add clearly commented placeholder blocks for status-indicator colours and form controls that later phases will fill in. Keep the stylesheet readable — no minification, no utility classes (design D-4).

## 5. Verification (Manual)

- [ ] 5.1 Reload the extension at `chrome://extensions` → "Load unpacked". Open the side panel. Confirm zero `console.error` entries in both the side panel's DevTools console and the service worker's DevTools console (spec req: "Side panel loads without console errors").

- [ ] 5.2 Verify the "User" tab is active by default. Click "Admin" — confirm the Admin panel appears and User panel disappears. Click "User" — confirm the reverse. No page reload required between switches (spec req: "Tab navigation renders and switches correctly").

- [ ] 5.3 Open the side panel while on an ADO work item page (`dev.azure.com/.../workitems/...`). Confirm the banner shows the blue dot and "Azure DevOps Initiative detected. Ready to copy." Repeat on a PowerApps page (green dot + PA message) and on `google.com` (grey dot + unsupported message) (spec req: "Page context banner reflects current pageType", SPEC.md §7.2).

- [ ] 5.4 With the side panel open, switch between an ADO tab, a PA tab, and an unrelated tab. Confirm the banner updates for each switch without requiring the side panel to be closed and reopened (spec req: "pageType updated reactively on TAB_CHANGED push", SPEC.md §6.1).
