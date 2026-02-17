# Spec: sidepanel-shell

Side panel UI shell — Alpine.js store, tab navigation, and live page-context state.

---

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

---

### Requirement: AppSettings loaded from storage on Alpine init

`app.js` SHALL send `{ action: "GET_SETTINGS" }` via `chrome.runtime.sendMessage` inside
the `alpine:init` callback, immediately after the `GET_PAGE_CONTEXT` call. On response,
`$store.app.settings` SHALL be set to `response.settings`. This ensures the Admin tab
mapping list is populated from the first frame without a flash of empty state.

If the response is missing or the service worker is unavailable, `$store.app.settings`
SHALL remain `null` (the initial default).

#### Scenario: settings populated before first render
- **WHEN** the side panel finishes loading with existing mappings in storage
- **THEN** `$store.app.settings` is non-null and contains the stored `AppSettings`
  before any user interaction occurs

#### Scenario: settings remains null if service worker unavailable
- **WHEN** `GET_SETTINGS` response is missing (e.g. service worker not yet running)
- **THEN** `$store.app.settings` remains `null` and no error is thrown


---

<\!-- Phase 11 amendments -->

## MODIFIED Requirements

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
enabledMappings:     []
fieldUIStates:       []
lastPasteResults:    null
settings:            null
editingMapping:      null
showMappingForm:     false
pickerActive:        false
testSelectorResult:  null
testSelectorLoading: false
importMessage:       null
```

The previous `fieldResults: []` property is removed. `enabledMappings`, `fieldUIStates`, and `lastPasteResults` replace it. All properties must be present at init time so later phases can bind to them without registering them again.

#### Scenario: Store is accessible immediately after Alpine initialises
- **WHEN** the side panel HTML finishes loading
- **THEN** `Alpine.store('app')` returns an object with all properties listed above at their default values
- **AND** the store SHALL NOT contain a `fieldResults` property

---

### Requirement: Page context banner reflects current pageType
The User tab panel SHALL render a page context banner whose content changes reactively based on `$store.app.pageType`. The banner uses a CSS-styled dot element (not emoji) for the colour indicator.

| pageType | Background | Border | Dot colour | Label text | Text colour |
|---|---|---|---|---|---|
| `"ado"` | `#E3F2FD` | `1px solid #90CAF9` | `#1565C0` | `"Azure DevOps"` | `#1565C0` |
| `"pa"` | `#F3E5F5` | `1px solid #CE93D8` | `#7B1FA2` | `"PowerApps"` | `#7B1FA2` |
| `"unsupported"` | `#FFFFFF` | `1px solid #E0E0E0` | `#9CA3AF` | `"This page is not supported."` | `#616161` |

The dot MUST be rendered as a CSS `<span>` element (`width: 10px`, `height: 10px`, `border-radius: 50%`, `background-color` per the table above) — not a Unicode emoji character.

#### Scenario: Banner shows ADO styling on ADO page
- **WHEN** `$store.app.pageType` is `"ado"`
- **THEN** the banner background is `#E3F2FD`, border is `1px solid #90CAF9`
- **AND** the dot element has `background-color: #1565C0` and the text `"Azure DevOps"` is shown in `#1565C0`

#### Scenario: Banner shows PA styling on PA page
- **WHEN** `$store.app.pageType` is `"pa"`
- **THEN** the banner background is `#F3E5F5`, border is `1px solid #CE93D8`
- **AND** the dot element has `background-color: #7B1FA2` and the text `"PowerApps"` is shown in `#7B1FA2`

#### Scenario: Banner shows unsupported styling on other pages
- **WHEN** `$store.app.pageType` is `"unsupported"`
- **THEN** the banner background is `#FFFFFF`, border is `1px solid #E0E0E0`
- **AND** the dot element has `background-color: #9CA3AF` and the text `"This page is not supported."` is shown in `#616161`

---

## ADDED Requirements

### Requirement: Action button styling in User Tab
The three action buttons (Copy, Paste, Clear) in the User Tab SHALL conform to the following styling requirements:

- **Height**: `48px` for all buttons
- **Font-size**: `12px` for all buttons
- **Copy button**: background `#0078D4`, text `#FFFFFF`
- **Paste button**: background `#742774`, text `#FFFFFF`
- **Clear button**: background `#F3F4F6`, text `#374151`
- **Disabled state** (all buttons): background `#CCCCCC`, text `#888888`, `cursor: not-allowed`

Button text may wrap to two lines when the panel is narrow.

#### Scenario: Copy button uses correct colour
- **WHEN** the Copy button is enabled
- **THEN** it SHALL have background `#0078D4` and white text

#### Scenario: Paste button uses correct colour
- **WHEN** the Paste button is enabled
- **THEN** it SHALL have background `#742774` and white text

#### Scenario: All buttons are 48px tall with 12px font
- **WHEN** any action button renders in the User Tab
- **THEN** it SHALL have a height of `48px` and font-size of `12px`

---

<!-- Phase 13 amendments -->

## MODIFIED Requirements

### Requirement: Tab panel visual styling
`sidepanel/styles.css` SHALL apply a subtle background tint to `[role="tabpanel"]`
so that white field-row cards are visually distinct from the panel backdrop.

The `[role="tabpanel"]` rule SHALL include `background: #6b728008` in addition to
the existing layout properties (`flex: 1`, `overflow-y: auto`, `padding: 12px 14px`).

#### Scenario: Tab panel has tinted background
- **WHEN** either the User tab or Admin tab panel is visible
- **THEN** the panel area SHALL render with the `#6b728008` background tint

---

### Requirement: Field row card visual style
Each `.field-row` element SHALL render as a distinct white card with rounded corners
and vertical spacing between cards, replacing the previous flat-list separator style.

The `.field-row` rule SHALL include:
- `background: #ffffff`
- `margin: 10px 0`
- `border-radius: 10px`

The `.field-row` rule SHALL NOT include `border-bottom` (removed — the margin gap
between cards provides the visual separation previously served by the border).

#### Scenario: Field rows render as rounded cards
- **WHEN** the User Tab displays field rows
- **THEN** each row SHALL appear as a white card with rounded corners (`border-radius: 10px`)
- **AND** consecutive rows SHALL be separated by vertical space (`margin: 10px 0`)
- **AND** no horizontal separator line SHALL appear at the bottom of each row

#### Scenario: First and last cards do not double-margin against panel padding
- **WHEN** the field list is visible
- **THEN** the top of the first card and the bottom of the last card SHALL sit flush
  against the panel's existing `padding: 12px 14px` without excessive whitespace
  (add `:first-child { margin-top: 0 }` / `:last-child { margin-bottom: 0 }` guards
  if visual bleed is observed during manual QA)

---

### Requirement: Action buttons equal-width distribution
All direct children of `.action-buttons` SHALL share the available row width equally.

A new rule `.action-buttons > * { flex: 1 1 0; }` SHALL be added immediately after
the `.action-buttons { ... }` block. This ensures the Copy, Paste, and Clear buttons
each occupy one-third of the button bar regardless of label length.

#### Scenario: Copy, Paste, and Clear buttons have equal width
- **WHEN** the User Tab action button bar is visible with all three buttons enabled or disabled
- **THEN** each button SHALL occupy the same horizontal space in the bar

#### Scenario: Spinner elements inside context banners are unaffected
- **WHEN** the Copy or Paste spinner is visible
- **THEN** the spinner SHALL NOT be resized by the `.action-buttons > *` rule
  (spinners are inside `.context-banner` rows, not direct children of `.action-buttons`)
