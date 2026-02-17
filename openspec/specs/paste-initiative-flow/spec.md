## ADDED Requirements

### Requirement: PASTE_INITIATIVE service worker handler
The service worker SHALL handle `{ action: "PASTE_INITIATIVE" }` messages from the side panel. The handler SHALL:
1. Verify `currentPageType === "pa"`. If not, return `{ success: false, error: "Not on a PowerApps page." }`.
2. Load `AppSettings` from `chrome.storage.local`.
3. Read `copiedData` from `chrome.storage.session`.
4. If `copiedData === null`, return `{ success: false, error: "No copied data. Copy an Initiative first." }`.
5. Filter to enabled mappings (`settings.mappings.filter(m => m.enabled)`).
6. Inject `scripts/pa-writer.js` into the active tab via `chrome.scripting.executeScript`, passing `{ copiedData, mappings, overwriteMode: settings.overwriteMode }` as the args array.
7. Return `{ success: true, results: FieldResult[] }` to the caller.

#### Scenario: Successful paste on a PA page
- **WHEN** `currentPageType === "pa"`, `copiedData` is non-null, and `pa-writer.js` injection succeeds
- **THEN** the handler SHALL return `{ success: true, results: FieldResult[] }` with one entry per enabled mapping

#### Scenario: Rejected when not on a PA page
- **WHEN** `currentPageType` is `"ado"` or `"unsupported"` at the time the message is received
- **THEN** the handler SHALL return `{ success: false, error: "Not on a PowerApps page." }`
- **THEN** `chrome.scripting.executeScript` SHALL NOT be called

#### Scenario: Rejected when copiedData is null
- **WHEN** `chrome.storage.session` does not contain a `"copiedData"` key
- **THEN** the handler SHALL return `{ success: false, error: "No copied data. Copy an Initiative first." }`
- **THEN** `chrome.scripting.executeScript` SHALL NOT be called

#### Scenario: Injection failure is caught and returned as an error
- **WHEN** `chrome.scripting.executeScript` throws (e.g., the tab navigated away between the page-type check and injection)
- **THEN** the handler SHALL return `{ success: false, error: <message> }`

---

### Requirement: Paste button wiring in User Tab
The side panel User Tab SHALL wire the "Paste to PowerApps" button so that clicking it sends `{ action: "PASTE_INITIATIVE" }` to the background service worker.

#### Scenario: Button sends PASTE_INITIATIVE on click
- **WHEN** the user clicks the "Paste to PowerApps" button
- **THEN** `chrome.runtime.sendMessage({ action: "PASTE_INITIATIVE" })` SHALL be called

#### Scenario: Paste button disabled when pageType is not "pa"
- **WHEN** `$store.app.pageType` is `"ado"` or `"unsupported"`
- **THEN** the "Paste to PowerApps" button SHALL be visually disabled and non-interactive (consistent with BR-004)

#### Scenario: Paste button disabled when hasCopiedData is false
- **WHEN** `$store.app.hasCopiedData === false` regardless of `pageType`
- **THEN** the "Paste to PowerApps" button SHALL be visually disabled and non-interactive

#### Scenario: Paste button enabled only when both conditions are met
- **WHEN** `$store.app.pageType === "pa"` AND `$store.app.hasCopiedData === true`
- **THEN** the "Paste to PowerApps" button SHALL be interactive and visually enabled

---

### Requirement: Spinner during paste operation
While the `PASTE_INITIATIVE` message is in-flight, the side panel SHALL display a loading spinner and suppress additional button clicks.

#### Scenario: Spinner appears on paste start and disappears on completion
- **WHEN** the user clicks "Paste to PowerApps" and the response has not yet arrived
- **THEN** a spinner SHALL be visible and `$store.app.pasteStatus` SHALL equal `"pasting"`
- **WHEN** the response arrives
- **THEN** the spinner SHALL disappear and `$store.app.pasteStatus` SHALL equal `"done"`

---

### Requirement: Per-field result list in User Tab after paste
After a paste operation completes, the side panel SHALL display a per-field result list showing each field's write outcome with a colour-coded indicator.

#### Scenario: Successful fields show green indicator
- **WHEN** a `FieldResult` has `status: "success"`
- **THEN** that field's row SHALL display a green indicator

#### Scenario: Skipped fields show a neutral indicator
- **WHEN** a `FieldResult` has `status: "skipped"`
- **THEN** that field's row SHALL display a neutral (grey or blue) indicator

#### Scenario: Warning fields show yellow indicator
- **WHEN** a `FieldResult` has `status: "warning"`
- **THEN** that field's row SHALL display a yellow/amber indicator

#### Scenario: Error fields show red indicator
- **WHEN** a `FieldResult` has `status: "error"`
- **THEN** that field's row SHALL display a red indicator

#### Scenario: Field label is displayed in each row
- **WHEN** the paste results list renders
- **THEN** each row SHALL show the `FieldResult.label` value alongside the status indicator

---

### Requirement: Top-level error display for paste failure
When the `PASTE_INITIATIVE` response has `success: false`, the side panel SHALL display the error using the same `FieldResult` sentinel pattern used by the copy flow: a single entry with `fieldId: '__error__'`, `status: 'error'`, and `message` set to the error string. `$store.app.pasteStatus` SHALL be set to `"done"`.

#### Scenario: Error message shown when paste fails
- **WHEN** the `PASTE_INITIATIVE` response is `{ success: false, error: "Not on a PowerApps page." }`
- **THEN** the paste results list SHALL contain exactly one entry with `fieldId: '__error__'`, `status: "error"`, and `message: "Not on a PowerApps page."`
- **THEN** `$store.app.pasteStatus` SHALL equal `"done"`

---

### Requirement: Overwrite Mode badge in User Tab
The User Tab SHALL display the current `overwriteMode` value as a read-only badge. The badge SHALL show `ON` when `overwriteMode === true` and `OFF` when `overwriteMode === false`. The value SHALL be loaded during the same `GET_SETTINGS` call already made at app initialisation and refreshed on each `TAB_CHANGED` event.

#### Scenario: Badge shows ON when overwriteMode is true
- **WHEN** `AppSettings.overwriteMode === true`
- **THEN** a read-only badge in the User Tab SHALL display the text `"ON"` (or a visual equivalent)

#### Scenario: Badge shows OFF when overwriteMode is false
- **WHEN** `AppSettings.overwriteMode === false`
- **THEN** a read-only badge in the User Tab SHALL display the text `"OFF"` (or a visual equivalent)

#### Scenario: Badge is not interactive
- **WHEN** the user clicks or interacts with the Overwrite Mode badge
- **THEN** no action SHALL occur — the badge is display-only (changing overwriteMode is an Admin Tab action)
