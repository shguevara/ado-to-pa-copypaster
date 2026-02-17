# Spec: sidepanel-shell

Side panel UI shell — Alpine.js store, tab navigation, and live page-context state.

---

## ADDED Requirements

### Requirement: Alpine.js store initialised with full shape

`sidepanel/app.js` SHALL register `Alpine.store('app', { ... })` inside a
`document.addEventListener('alpine:init', ...)` callback. The initial store shape
MUST match SPEC.md §7.4 exactly:

```
activeTab:           "user"
pageType:            "unsupported"
copyStatus:          "idle"
pasteStatus:         "idle"
hasCopiedData:       false
lastOperation:       null
fieldResults:        []
settings:            null
editingMapping:      null
showMappingForm:     false
pickerActive:        false
testSelectorResult:  null
testSelectorLoading: false
importMessage:       null
```

All properties must be present at init time so later phases can bind to them without
registering them again.

#### Scenario: Store is accessible immediately after Alpine initialises
- **WHEN** the side panel HTML finishes loading
- **THEN** `Alpine.store('app')` returns an object with all properties listed above at their
  default values

---

### Requirement: Tab navigation renders and switches correctly

`sidepanel/index.html` SHALL render a tab bar with exactly two buttons: "User" and "Admin".
Clicking a tab button SHALL set `$store.app.activeTab` to `"user"` or `"admin"` respectively.
The corresponding tab panel SHALL become visible and the other panel SHALL be hidden.
Tab panels MUST use `x-show` (not `x-if`) so panel DOM state is preserved across switches.

#### Scenario: Default tab is User
- **WHEN** the side panel opens for the first time
- **THEN** the "User" tab is visually active and the User tab panel is visible
- **AND** the Admin tab panel is hidden

#### Scenario: Clicking Admin tab shows Admin panel
- **WHEN** the user clicks the "Admin" tab button
- **THEN** `$store.app.activeTab` equals `"admin"`
- **AND** the Admin tab panel is visible
- **AND** the User tab panel is hidden

#### Scenario: Clicking User tab returns to User panel
- **WHEN** the user is on the Admin tab and clicks the "User" tab button
- **THEN** `$store.app.activeTab` equals `"user"`
- **AND** the User tab panel is visible

---

### Requirement: pageType hydrated from background service worker on load

On Alpine initialisation, `app.js` SHALL send `{ action: "GET_PAGE_CONTEXT" }` via
`chrome.runtime.sendMessage` and SHALL update `$store.app.pageType` with the returned
`pageType` value. This ensures the UI reflects the actual active tab state before the first
user interaction.

#### Scenario: pageType set from GET_PAGE_CONTEXT response
- **WHEN** the side panel finishes initialising
- **THEN** `$store.app.pageType` reflects the page type of the currently active browser tab
  (`"ado"`, `"pa"`, or `"unsupported"`)

#### Scenario: pageType defaults to "unsupported" if response is delayed or missing
- **WHEN** `GET_PAGE_CONTEXT` response has not yet arrived
- **THEN** `$store.app.pageType` is `"unsupported"` (the initial default)

---

### Requirement: pageType updated reactively on TAB_CHANGED push

`app.js` SHALL register a `chrome.runtime.onMessage` listener that handles
`{ action: "TAB_CHANGED", pageType }` messages from the background service worker.
On receipt, it SHALL update `$store.app.pageType` to the new value.

#### Scenario: Switching to an ADO tab updates pageType
- **WHEN** the user activates a browser tab with an ADO work item URL
- **THEN** `$store.app.pageType` becomes `"ado"` within one event loop cycle of the message
  arriving

#### Scenario: Switching to a PA tab updates pageType
- **WHEN** the user activates a browser tab with a PowerApps URL
- **THEN** `$store.app.pageType` becomes `"pa"`

#### Scenario: Switching to an unsupported tab updates pageType
- **WHEN** the user activates a browser tab with any other URL
- **THEN** `$store.app.pageType` becomes `"unsupported"`

---

### Requirement: Page context banner reflects current pageType

The User tab panel SHALL render a page context banner whose content changes reactively based
on `$store.app.pageType` (see SPEC.md §7.2):

| pageType        | Icon | Message                                                               |
|-----------------|------|-----------------------------------------------------------------------|
| `"ado"`         | 🔵   | "Azure DevOps Initiative detected. Ready to copy."                   |
| `"pa"`          | 🟢   | "PowerApps form detected. Ready to paste."                           |
| `"unsupported"` | ⚪   | "This page is not supported. Navigate to an ADO Initiative or a PowerApps form." |

#### Scenario: Banner shows ADO message on ADO page
- **WHEN** `$store.app.pageType` is `"ado"`
- **THEN** the banner displays the blue dot icon and ADO message text

#### Scenario: Banner shows PA message on PA page
- **WHEN** `$store.app.pageType` is `"pa"`
- **THEN** the banner displays the green dot icon and PA message text

#### Scenario: Banner shows unsupported message on other pages
- **WHEN** `$store.app.pageType` is `"unsupported"`
- **THEN** the banner displays the grey dot icon and unsupported message text

---

### Requirement: Side panel loads without console errors

The fully wired side panel (Alpine.js present, `app.js` loaded, service worker running) SHALL
produce no `console.error` output during normal load on any page type.

#### Scenario: Clean load on unsupported page
- **WHEN** the side panel is opened while the active tab is on an unsupported page
- **THEN** no errors appear in the side panel DevTools console

#### Scenario: Clean load on ADO page
- **WHEN** the side panel is opened while the active tab is on an ADO work item page
- **THEN** no errors appear in the side panel DevTools console
