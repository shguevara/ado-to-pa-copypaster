## MODIFIED Requirements

### Requirement: COPY_INITIATIVE service worker handler
The service worker SHALL handle `{ action: "COPY_INITIATIVE" }` messages from the side panel. The handler SHALL:
1. Verify `currentPageType === "ado"`. If not, return `{ success: false, error: "Not on an ADO work item page." }`.
2. Load `AppSettings` from `chrome.storage.local`.
3. Filter to enabled mappings (`settings.mappings.filter(m => m.enabled)`).
4. Inject `scripts/ado-reader.js` into the active tab via `chrome.scripting.executeScript`, passing enabled mappings as the argument.
5. Construct `CopiedFieldData[]` from **ALL** results — including `error` entries. Error entries MUST be stored with `value: ""` and `readMessage` set to the error text.
6. Write `CopiedFieldData[]` to `chrome.storage.session` under key `"copiedData"`.
7. Return `{ success: true, results: FieldResult[] }` to the caller.

**Changed from previous**: Step 5 previously excluded `error` entries. All outcomes are now persisted so the UI can display `FAILED` badges for unread fields without re-running Copy.

#### Scenario: Successful copy on an ADO work item page
- **WHEN** the active tab is classified as `"ado"`, one mapping is enabled, and `adoReaderMain` returns `[{ fieldId: "x", label: "Title", status: "success", value: "My Title" }]`
- **THEN** the handler SHALL write `[{ fieldId: "x", label: "Title", value: "My Title", readStatus: "success" }]` to `chrome.storage.session` under key `"copiedData"`
- **THEN** the handler SHALL return `{ success: true, results: [{ ... status: "success" ... }] }`

#### Scenario: Rejected when not on an ADO page
- **WHEN** `currentPageType` is `"pa"` or `"unsupported"` at the time the message is received
- **THEN** the handler SHALL return `{ success: false, error: "Not on an ADO work item page." }`
- **THEN** `chrome.storage.session` SHALL NOT be written

#### Scenario: Error fields ARE included in session storage
- **WHEN** `adoReaderMain` returns two results: one `success` and one `error` with `message: "Selector not found"`
- **THEN** BOTH entries SHALL be written to `chrome.storage.session`
- **AND** the error entry SHALL have `readStatus: "error"`, `value: ""`, `readMessage: "Selector not found"`
- **AND** both entries SHALL appear in the `results` array of the response

#### Scenario: Injection failure is caught and returned as an error
- **WHEN** `chrome.scripting.executeScript` throws (e.g., the tab navigated away between the page-type check and injection)
- **THEN** the handler SHALL return `{ success: false, error: <message> }`
- **THEN** no write to `chrome.storage.session` SHALL occur

---

## REMOVED Requirements

### Requirement: Per-field status list in User Tab
**Reason**: Superseded by the `user-tab-field-states` capability (Phase 11). The always-visible field list driven by `FieldUIState` replaces the post-copy-only results list. Field states are now rendered using `fieldUIStates` (derived from `copiedData` + `lastPasteResults`), not a separate `fieldResults[]` array.
**Migration**: See `user-tab-field-states` spec — "Always-visible field list in User Tab" and "Field row structure and per-state visual rendering" requirements.

---

## ADDED Requirements

### Requirement: CLEAR_COPIED_DATA service worker handler
The service worker SHALL handle `{ action: "CLEAR_COPIED_DATA" }` messages from the side panel. The handler SHALL write `{ copiedData: null }` to `chrome.storage.session` and return `{ success: boolean, error?: string }`.

#### Scenario: Clear wipes session storage
- **WHEN** the handler receives `{ action: "CLEAR_COPIED_DATA" }`
- **THEN** `chrome.storage.session` SHALL be updated to `{ copiedData: null }`
- **AND** the handler SHALL return `{ success: true }`

#### Scenario: Storage error is reported
- **WHEN** `chrome.storage.session.set` fails with a runtime error
- **THEN** the handler SHALL return `{ success: false, error: <message> }`
