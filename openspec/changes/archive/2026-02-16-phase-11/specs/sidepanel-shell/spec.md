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
