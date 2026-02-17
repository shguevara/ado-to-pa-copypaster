# Tasks: Phase 4 — Storage & Settings Foundation

## 1. Defaults Constant

- [x] 1.1 Add a `DEFAULT_SETTINGS` constant near the top of `background/service-worker.js`
  (after the page-type detection section, before the event listeners). The value must
  match SPEC.md §4.3 exactly: `overwriteMode: false` and two `FieldMapping` entries —
  `"default-title"` (`adoSelector: "input[aria-label='Title'], textarea[aria-label='Title']"`,
  `fieldType: "text"`, `enabled: true`, `paSelector: ""`) and `"default-id"`
  (`adoSelector: "__URL_ID__"`, `fieldType: "text"`, `enabled: true`, `paSelector: ""`).
  Declare it as a plain `const` object (not a function) so it is trivially inspectable
  in code review. (SPEC.md §4.3, design D-1)

## 2. First-Install Seed

- [x] 2.1 Inside the `typeof chrome !== "undefined"` guard (to keep the file importable
  by Vitest), add a `chrome.runtime.onInstalled.addListener(async ({ reason }) => { ... })`
  handler. When `reason === "install"`: read `chrome.storage.local.get("settings")`
  and write `DEFAULT_SETTINGS` only if the result is empty (`undefined` or `null`).
  For any other reason (update, browser_update) take no action. Wrap the async storage
  call in try/catch and log any error to `console.error`. (spec req: "Default AppSettings
  seeded on first install", design D-2)

## 3. GET_SETTINGS Message Handler

- [x] 3.1 In the existing `chrome.runtime.onMessage.addListener(...)` handler, add a
  branch for `message.action === "GET_SETTINGS"`. The branch must: (1) call
  `chrome.storage.local.get("settings")` asynchronously, (2) respond with
  `{ settings: result.settings ?? DEFAULT_SETTINGS }` via `sendResponse`, (3) `return true`
  from the branch so Chrome keeps the response channel open while the storage read
  is in flight. Wrap in try/catch; on failure respond with
  `{ settings: DEFAULT_SETTINGS }` and log the error. (spec req: "GET_SETTINGS returns
  current AppSettings", SPEC.md §5.1, design D-3, D-5)

## 4. SAVE_SETTINGS Message Handler

- [x] 4.1 In the same `onMessage` listener, add a branch for
  `message.action === "SAVE_SETTINGS"`. The branch must: (1) call
  `chrome.storage.local.set({ settings: message.settings })`, (2) on success respond
  with `{ success: true }`, (3) on failure respond with `{ success: false, error: e.message }`,
  (4) `return true` so Chrome holds the channel open for the async write. (spec req:
  "SAVE_SETTINGS persists AppSettings", SPEC.md §5.1, design D-3, D-4)

## 5. Verification (Manual)

- [x] 5.1 Simulate a clean install: in Chrome DevTools → Application → Storage →
  `chrome.storage.local`, clear any existing `"settings"` key. Reload the extension
  at `chrome://extensions`. Re-open DevTools storage and confirm the `"settings"` key
  is now present with `overwriteMode: false` and exactly 2 mappings (`"default-title"`
  and `"default-id"`). (spec req: "Clean install writes defaults to storage")

- [x] 5.2 Without clearing storage, reload the extension again. Confirm the `"settings"`
  key is unchanged — the two default mappings are still there and no data was reset.
  (spec req: "Developer reload does not overwrite existing settings", design D-2)

- [x] 5.3 Open the service worker's DevTools console (`chrome://extensions` → "inspect"
  on the service worker). Run:
  `chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, console.log)`.
  Confirm the response is `{ settings: { overwriteMode: false, mappings: [...] } }`
  with the 2 default mappings. (spec req: "GET_SETTINGS returns current AppSettings")

- [x] 5.4 In the same console, run:
  `chrome.runtime.sendMessage({ action: "SAVE_SETTINGS", settings: { mappings: [], overwriteMode: true } }, console.log)`.
  Confirm the response is `{ success: true }`. Then run `GET_SETTINGS` again and
  confirm the response reflects `overwriteMode: true` and an empty `mappings` array.
  Finally, restore the defaults by sending `SAVE_SETTINGS` with the original
  `DEFAULT_SETTINGS` value. (spec req: "SAVE_SETTINGS persists AppSettings",
  "Subsequent GET_SETTINGS returns the newly saved value")
