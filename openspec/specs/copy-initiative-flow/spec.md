## ADDED Requirements

### Requirement: COPY_INITIATIVE service worker handler
The service worker SHALL handle `{ action: "COPY_INITIATIVE" }` messages from the side panel. The handler SHALL:
1. Verify `currentPageType === "ado"`. If not, return `{ success: false, error: "Not on an ADO work item page." }`.
2. Load `AppSettings` from `chrome.storage.local`.
3. Filter to enabled mappings (`settings.mappings.filter(m => m.enabled)`).
4. Inject `scripts/ado-reader.js` into the active tab via `chrome.scripting.executeScript`, passing enabled mappings as the argument.
5. Construct `CopiedFieldData[]` from the results (keeping only `success` and `blank` entries).
6. Write `CopiedFieldData[]` to `chrome.storage.session` under key `"copiedData"`.
7. Return `{ success: true, results: FieldResult[] }` to the caller.

#### Scenario: Successful copy on an ADO work item page
- **WHEN** the active tab is classified as `"ado"`, one mapping is enabled, and `adoReaderMain` returns `[{ fieldId: "x", label: "Title", status: "success", value: "My Title" }]`
- **THEN** the handler SHALL write `[{ fieldId: "x", label: "Title", value: "My Title", readStatus: "success" }]` to `chrome.storage.session` under key `"copiedData"`
- **THEN** the handler SHALL return `{ success: true, results: [{ ... status: "success" ... }] }`

#### Scenario: Rejected when not on an ADO page
- **WHEN** `currentPageType` is `"pa"` or `"unsupported"` at the time the message is received
- **THEN** the handler SHALL return `{ success: false, error: "Not on an ADO work item page." }`
- **THEN** `chrome.storage.session` SHALL NOT be written

#### Scenario: Error fields are excluded from session storage but included in results
- **WHEN** `adoReaderMain` returns two results: one `success` and one `error`
- **THEN** only the `success` entry SHALL be written to `chrome.storage.session`
- **THEN** both entries SHALL appear in the `results` array of the response

#### Scenario: Injection failure is caught and returned as an error
- **WHEN** `chrome.scripting.executeScript` throws (e.g., the tab navigated away between the page-type check and injection)
- **THEN** the handler SHALL return `{ success: false, error: <message> }`
- **THEN** no write to `chrome.storage.session` SHALL occur

---

### Requirement: GET_COPIED_DATA service worker handler
The service worker SHALL handle `{ action: "GET_COPIED_DATA" }` messages by reading `chrome.storage.session` and returning the stored `CopiedFieldData[]`.

#### Scenario: Data exists in session storage
- **WHEN** `chrome.storage.session` contains a `"copiedData"` key with a `CopiedFieldData[]` array
- **THEN** the handler SHALL return `{ data: <the array> }`

#### Scenario: No data in session storage
- **WHEN** `chrome.storage.session` does not contain a `"copiedData"` key (e.g., first load or after browser restart)
- **THEN** the handler SHALL return `{ data: null }`

---

### Requirement: Copy button wiring in User Tab
The side panel User Tab SHALL wire the "Copy Initiative" button so that clicking it sends `{ action: "COPY_INITIATIVE" }` to the background service worker.

#### Scenario: Button sends COPY_INITIATIVE on click
- **WHEN** the user clicks the "Copy Initiative" button
- **THEN** `chrome.runtime.sendMessage({ action: "COPY_INITIATIVE" })` SHALL be called

#### Scenario: Button is disabled when pageType is not "ado"
- **WHEN** `$store.app.pageType` is `"pa"` or `"unsupported"`
- **THEN** the "Copy Initiative" button SHALL be visually disabled and non-interactive (consistent with BR-004)

---

### Requirement: Spinner during copy operation
While the `COPY_INITIATIVE` message is in-flight, the side panel SHALL display a loading spinner and suppress additional button clicks.

#### Scenario: Spinner appears on copy start and disappears on completion
- **WHEN** the user clicks "Copy Initiative" and the response has not yet arrived
- **THEN** a spinner SHALL be visible and `$store.app.copyStatus` SHALL equal `"copying"`
- **WHEN** the response arrives
- **THEN** the spinner SHALL disappear and `$store.app.copyStatus` SHALL equal `"done"`

---

### Requirement: Per-field status list in User Tab
After a copy operation completes, the side panel SHALL display a per-field result list showing each field's status with a colour-coded indicator.

#### Scenario: Successful fields show green indicator
- **WHEN** a `FieldResult` has `status: "success"`
- **THEN** that field's row SHALL display a green indicator

#### Scenario: Blank fields show yellow indicator
- **WHEN** a `FieldResult` has `status: "blank"`
- **THEN** that field's row SHALL display a yellow/amber indicator

#### Scenario: Error fields show red indicator
- **WHEN** a `FieldResult` has `status: "error"`
- **THEN** that field's row SHALL display a red indicator

#### Scenario: Field label is displayed in each row
- **WHEN** the results list renders
- **THEN** each row SHALL show the `FieldResult.label` value alongside the status indicator

---

### Requirement: hasCopiedData flag updated after successful copy
After a successful `COPY_INITIATIVE` response, `$store.app.hasCopiedData` SHALL be set to `true`. This flag is used by downstream phases to enable the Paste button.

#### Scenario: Flag is set on successful copy response
- **WHEN** the `COPY_INITIATIVE` response has `success: true`
- **THEN** `$store.app.hasCopiedData` SHALL be `true`

#### Scenario: Flag is not set on failed copy response
- **WHEN** the `COPY_INITIATIVE` response has `success: false`
- **THEN** `$store.app.hasCopiedData` SHALL remain `false`

---

### Requirement: Top-level error display for copy failure
When the `COPY_INITIATIVE` response has `success: false`, the side panel SHALL display the error message in the User Tab and SHALL NOT show a field results list.

#### Scenario: Error message shown when copy fails
- **WHEN** the `COPY_INITIATIVE` response is `{ success: false, error: "Not on an ADO work item page." }`
- **THEN** that error message SHALL be visible in the User Tab
- **THEN** the field results list SHALL be empty or hidden

---

## MODIFIED Requirements

### Requirement: Top-level error display for copy failure (clarification)

The original ADDED requirement above described the error display intent without
specifying the exact data structure used. This MODIFIED block formally documents
the implementation approach, which is already shipped and consistent with the
`FieldResult[]` contract used throughout the copy flow.

#### Scenario: Error message shown when copy fails (REVISED)
- **WHEN** the `COPY_INITIATIVE` response has `success: false`
- **THEN** the field results list SHALL contain a single entry with
  `fieldId: '__error__'`, `status: 'error'`, and `message` set to the error string
- **THEN** the User Tab SHALL display this entry using the standard `.status-error`
  row (red indicator), making the failure visible inline in the results list
- **THEN** `$store.app.hasCopiedData` SHALL remain `false`

**Rationale**: Routing the top-level error through the same `fieldResults[]` array
and `FieldResult` shape keeps the rendering path consistent — the same `x-for`
template handles both normal field results and the top-level error without a
separate error display element. The sentinel `fieldId: '__error__'` makes the
top-level error entry unambiguously distinguishable from real field results.
(design D-7; COMMENTS.md Phase 7 🟡 item 2)


---

<\!-- Phase 11 amendments -->

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
