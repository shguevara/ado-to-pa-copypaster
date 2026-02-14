# Requirements Document: ADO to PowerApps Chrome Extension

## Document Information

- **Version**: 1.0
- **Date**: 2026-02-14
- **Author**: Requirements Analyst AI
- **Stakeholders**: Project Managers / Product Managers (2–4 users)
- **Status**: Draft

---

## Executive Summary

The **ADO to PowerApps Chrome Extension** (`ado-to-pa-copypaster`) is a browser-based tool that enables Project Managers and Product Managers to transfer Initiative work item data from Azure DevOps (ADO) into a PowerApps model-driven application with minimal manual effort.

Today, this transfer is performed entirely by hand — field by field, screen by screen — resulting in unnecessary time spent, risk of transcription errors, and no repeatable process. The extension addresses this by allowing users to "copy" an Initiative's data while viewing it in ADO, then "paste" it into the corresponding PowerApps form — handling field type differences (free-text → lookup, text → combo) automatically, and surfacing clear feedback when automation is not possible.

The extension operates as a Chrome Side Panel, persisting across browser tabs, and requires no backend infrastructure. Configuration (field mappings) is stored locally per device and can be exported and imported as JSON to share across team members.

---

## 1. Business Context

### 1.1 Business Problem

Project Managers must manually copy Initiative metadata from Azure DevOps into a PowerApps model-driven application, field by field, every time a new Initiative is created or updated. This is:

- **Time-consuming**: 9 fields × manual copy-paste × context switching between apps
- **Error-prone**: Free-text mismatches, wrong lookup selections, missed fields
- **Non-repeatable**: No standard process; each person does it differently

### 1.2 Business Objectives

1. Eliminate field-by-field manual data entry for Initiative transfers
2. Reduce copy-paste errors through automated field population and explicit mismatch warnings
3. Establish a repeatable, team-shareable integration pattern (via exportable mappings)
4. Enable semi-technical users to configure the integration without developer support

### 1.3 Success Criteria

| Criterion | Measure |
|-----------|---------|
| Transfer time reduction | Completing a full 9-field Initiative transfer in under 60 seconds |
| Error reduction | Zero missed or incorrectly mapped fields when mappings are correctly configured |
| User independence | A PM can configure a new field mapping without developer assistance |
| Portability | A mapping config exported from one machine can be imported and used on another |

### 1.4 Stakeholders

| Stakeholder | Role | Interest | Influence |
|-------------|------|----------|-----------|
| Project Managers / Product Managers | Primary users | Reduce data entry time and errors | High |
| Development Team | Extension builders | Clear technical spec | High |
| Future users (new PMs) | Secondary users | Ease of onboarding | Medium |

---

## 2. Scope

### 2.1 In Scope

- Chrome extension with a persistent Side Panel UI
- Reading Initiative field data from the Azure DevOps Initiative work item page via DOM scraping
- Populating matching fields on a PowerApps model-driven app form via DOM interaction
- Handling of lookup fields, custom dropdowns, and plain text fields
- Visual per-field status indicators (success, warning, failure) in the sidebar
- Admin tab within the sidebar for field mapping configuration
- Point-and-click element selector (Automa-style) for guided mapping setup
- Advanced mapping mode via manual CSS selector entry
- Export and import of field mapping configuration as a JSON file
- Overwrite mode toggle (admin setting) to control behavior when destination fields are already populated

### 2.2 Out of Scope

- ADO REST API integration (deferred to a future enhancement)
- PowerApps record creation (extension only pastes into an existing open form)
- Auto-saving the PowerApps record after paste
- Audit logging or transfer history
- Multi-Initiative batch transfers
- Backend server, database, or cloud sync
- Support for browsers other than Google Chrome
- Support for PowerApps form types other than model-driven apps

### 2.3 Assumptions

1. The user has Chrome installed and permissions to install unpacked or published extensions
2. The ADO Initiative page is fully rendered in the browser before the user triggers the Copy action
3. The PowerApps model-driven app form is already open and in edit mode when the user triggers the Paste action
4. ADO field selectors may change if Microsoft updates the ADO UI — mapping reconfiguration may be needed after such updates
5. PowerApps custom controls are rendered in the DOM in a way that allows programmatic interaction via JavaScript (click, type, keypress events)
6. Users are responsible for navigating to the correct PowerApps record before pasting
7. The team shares a common Chrome environment (or manually shares the exported JSON config)

### 2.4 Constraints

1. **Browser**: Google Chrome only (Manifest V3)
2. **Storage**: Chrome local storage only (per device, not synced)
3. **No backend**: All logic runs client-side within the extension
4. **DOM scraping**: ADO data must be read from rendered page HTML; no API calls in v1
5. **Small team**: Solution should not require IT deployment or enterprise tooling
6. **Budget**: No external services, APIs, or paid tooling

### 2.5 Dependencies

| Dependency | Type | Impact |
|------------|------|--------|
| Azure DevOps web UI | External (DOM structure) | DOM changes in ADO may break field reading; mappings may need reconfiguration |
| PowerApps model-driven app UI | External (DOM structure) | DOM changes in PA may break field writing; mappings may need reconfiguration |
| Chrome Side Panel API | Platform | Requires Chrome 114 or later |
| Chrome Storage API | Platform | Used for persisting mappings locally |
| Chrome Content Scripts | Platform | Required for DOM interaction on ADO and PA pages |

---

## 3. User Profiles and Use Cases

### 3.1 User Personas

**Persona: The Project/Product Manager (Primary User)**
- **Role**: Owns Initiative records in ADO; responsible for maintaining corresponding records in PowerApps
- **Goals**: Transfer Initiative data quickly and accurately with minimal effort
- **Technical Proficiency**: Semi-technical (comfortable using Chrome, understanding of ADO and PowerApps forms, but not a developer)
- **Key Needs**: Clear UI feedback, easy-to-use copy/paste workflow, guided mapping setup that doesn't require writing CSS

---

### 3.2 Use Cases

---

**UC-001: Copy Initiative Data from ADO**
- **Actor**: Project Manager
- **Preconditions**: User is on an Azure DevOps Initiative work item page; mappings are configured; extension sidebar is open
- **Main Flow**:
  1. User opens an ADO Initiative work item in Chrome
  2. User clicks the extension icon to open the sidebar
  3. User clicks "Copy Initiative" (or equivalent) in the sidebar
  4. Extension reads each mapped ADO field from the page DOM
  5. Sidebar displays per-field read status (green = success, yellow = field missing/blank, red = failed to read)
  6. Data is stored in extension memory (not persisted to disk)
- **Alternative Flows**:
  - If user is not on a supported ADO page, the Copy button is disabled and the sidebar shows an "unsupported page" message
  - If a mapped ADO field is blank, a yellow warning is shown for that field; remaining fields continue to be read
- **Postconditions**: Initiative data is held in the extension's working memory, ready for paste
- **Business Rules**: Only Initiative work item pages are supported; other ADO pages are unsupported

---

**UC-002: Paste Initiative Data into PowerApps**
- **Actor**: Project Manager
- **Preconditions**: User has completed UC-001 (data is in memory); user is on a PowerApps model-driven app form page in edit mode; extension sidebar is open
- **Main Flow**:
  1. User navigates to the PowerApps tab (separate browser tab)
  2. Extension sidebar detects the PA page and enables the "Paste to PowerApps" button
  3. User clicks "Paste to PowerApps"
  4. Extension iterates through each configured field mapping and populates the PA form:
     - For plain text fields: types the value directly
     - For lookup fields: clicks the field, types/triggers the lookup, waits for options, selects matching result
     - For custom combo/select fields: clicks the control, waits for options, selects matching result
  5. Fields already containing values are skipped (unless Overwrite Mode is enabled)
  6. Sidebar displays a per-field paste status summary (green = populated, yellow = warning/no match, red = failed)
- **Alternative Flows**:
  - If a lookup finds no matching value: leave the field blank and show a yellow warning in the sidebar
  - If a field interaction fails (e.g., element not found, interaction rejected): highlight the issue, continue with remaining fields
  - If Overwrite Mode is enabled: replace existing values in destination fields
  - If user is not on a supported PA page: "Paste to PowerApps" button is disabled
- **Postconditions**: Matched fields are populated on the PA form; user reviews and manually saves the record
- **Business Rules**: Extension never auto-saves the PA record; the user is always the final approver

---

**UC-003: Configure Field Mappings (Admin)**
- **Actor**: Project Manager (acting as admin)
- **Preconditions**: Extension is installed; user is on any supported page or the Admin tab is accessible from any page
- **Main Flow**:
  1. User opens the sidebar and navigates to the Admin tab
  2. User creates a new mapping entry for a field pair (ADO field → PA field)
  3. For each mapping, user selects the field type (text, lookup, combo/select)
  4. For the PA destination field, user either:
     - (Guided Mode) Activates the point-and-click element selector, clicks the target field on the PA form, and the selector is captured automatically
     - (Advanced Mode) Types the CSS selector directly into the input field
  5. User saves the mapping
  6. Mappings are saved to Chrome local storage
- **Alternative Flows**:
  - User exports all mappings as a JSON file (Download button)
  - User imports mappings from a JSON file (Upload button), replacing or merging existing configuration
- **Postconditions**: Mappings are saved and available for use in UC-001 and UC-002

---

## 4. Functional Requirements

### 4.1 Core Features

---

**FR-001: Page Detection and Context Awareness**
- **Description**: The extension must detect whether the current active browser tab is a supported page and adjust the sidebar UI accordingly.
- **Priority**: Critical
- **Acceptance Criteria**:
  - [ ] Extension detects ADO Initiative work item pages and enables the "Copy Initiative" button
  - [ ] Extension detects PowerApps model-driven app pages and enables the "Paste to PowerApps" button
  - [ ] On unsupported pages, both action buttons are disabled and a clear "unsupported page" message is shown
  - [ ] Detection updates dynamically when the user switches tabs

---

**FR-002: Read Initiative Data from ADO (DOM Scraping)**
- **Description**: When triggered on an ADO Initiative page, the extension reads the values of all configured fields by interacting with the DOM.
- **Priority**: Critical
- **User Story**: As a PM, I want to click one button to read all Initiative data from the ADO page so I don't have to copy each field manually.
- **Supported Fields**:

| ADO Field | Field Type |
|-----------|------------|
| Title | Free-form text |
| Description | Free-form text (may contain rich text/HTML) |
| Initiative ID | Free-form text (work item ID) |
| Line of Business | Free-form text (custom field) |
| Initiative Owner | User display name (custom field) |
| Engineering Lead | User display name (custom field) |
| T-shirt Size | Select/combo (custom field) |
| Planned Roadmap | Free-form text (custom field) |
| Roadmap Year | Select/combo (custom field) |

- **Acceptance Criteria**:
  - [ ] Extension reads each field listed in the active field mapping configuration
  - [ ] Successfully read fields show a green status indicator in the sidebar
  - [ ] Fields that are blank/missing in ADO show a yellow warning indicator
  - [ ] Fields that fail to read (element not found, DOM error) show a red error indicator
  - [ ] Read data is stored in extension working memory for use during paste

---

**FR-003: Paste Initiative Data into PowerApps**
- **Description**: When triggered on a PowerApps model-driven app form page, the extension populates each mapped destination field using the data read from ADO.
- **Priority**: Critical
- **User Story**: As a PM, I want to click one button to populate the PA form with Initiative data so I don't have to switch back and forth between apps.
- **Acceptance Criteria**:
  - [ ] Extension iterates through all configured field mappings and attempts to populate each destination field
  - [ ] Plain text fields are populated by simulating text input
  - [ ] Lookup fields are populated by: clicking the field, triggering lookup (e.g., pressing Enter), waiting for options to load, selecting the matching option by text value
  - [ ] Custom combo/select fields are populated by: clicking the control, waiting for options to load, selecting the matching option by text value
  - [ ] Fields that already contain a value are skipped by default (unless Overwrite Mode is active)
  - [ ] After paste, sidebar displays a per-field status summary (green = populated, yellow = warning/no match, red = failed)
  - [ ] If a lookup has no match, the field is left blank and a yellow warning is shown
  - [ ] If a field interaction fails, the failure is shown and the extension continues with remaining fields

---

**FR-004: Per-Field Status Indicators**
- **Description**: The sidebar displays visual feedback after both the Copy and Paste operations, indicating the status of each mapped field.
- **Priority**: High
- **Acceptance Criteria**:
  - [ ] After Copy: each field shows green (read successfully), yellow (field was blank/missing), or red (read failed)
  - [ ] After Paste: each field shows green (populated), yellow (warning: no match found / field skipped), or red (failed to interact)
  - [ ] Status indicators are labeled with the field name for clarity
  - [ ] Warnings and errors include a short human-readable reason

---

**FR-005: Field Mapping Configuration (Admin Tab)**
- **Description**: The Admin tab within the sidebar allows users to define, edit, and delete field mappings between ADO and PowerApps fields.
- **Priority**: Critical
- **Acceptance Criteria**:
  - [ ] Admin tab is accessible from the sidebar without leaving the current browser page
  - [ ] User can create a mapping entry that links one ADO field to one PA field
  - [ ] Each mapping includes: ADO field name, PA field selector, field interaction type (text / lookup / combo-select)
  - [ ] User can edit or delete existing mappings
  - [ ] Mappings are saved to Chrome local storage upon confirmation
  - [ ] A list of all configured mappings is visible in the Admin tab

---

**FR-006: Guided Element Selector (Point-and-Click)**
- **Description**: When configuring a PA field mapping, users can activate an element selection mode that lets them click on a field in the PowerApps form to capture its CSS selector automatically.
- **Priority**: High
- **User Story**: As a semi-technical PM, I want to click on a field in PowerApps to capture it so I don't have to write CSS selectors by hand.
- **Acceptance Criteria**:
  - [ ] An "Pick Element" button in the Admin mapping panel activates element capture mode on the current PA page
  - [ ] In capture mode, hovering over elements highlights them visually (e.g., outline or overlay)
  - [ ] Clicking an element captures its selector (preferring ID, data attributes, or stable CSS selector)
  - [ ] The captured selector is populated into the PA field selector input in the Admin tab
  - [ ] Capture mode can be cancelled without saving changes

---

**FR-007: Advanced Selector Input**
- **Description**: As an alternative to guided element selection, users can type a CSS selector directly into the PA field selector input.
- **Priority**: Medium
- **Acceptance Criteria**:
  - [ ] A text input field in the mapping configuration accepts raw CSS selectors
  - [ ] The selector can be tested/validated against the current page (nice-to-have: "Test Selector" button)

---

**FR-008: Export Mapping Configuration**
- **Description**: Users can export the full set of field mappings as a JSON file for backup or sharing.
- **Priority**: High
- **Acceptance Criteria**:
  - [ ] An "Export Mappings" button in the Admin tab downloads a `.json` file containing all mapping definitions
  - [ ] The JSON file is human-readable and well-structured

---

**FR-009: Import Mapping Configuration**
- **Description**: Users can import a previously exported JSON mapping file to restore or share a configuration.
- **Priority**: High
- **Acceptance Criteria**:
  - [ ] An "Import Mappings" button in the Admin tab opens a file picker for `.json` files
  - [ ] Imported mappings replace or merge with existing mappings (behavior to be decided during implementation)
  - [ ] Invalid or malformed JSON files produce a clear error message without corrupting existing mappings

---

**FR-010: Overwrite Mode**
- **Description**: An admin-configurable toggle that controls whether the Paste operation overwrites existing values in PowerApps fields or skips them.
- **Priority**: Medium
- **Acceptance Criteria**:
  - [ ] A toggle/checkbox in the Admin tab enables or disables Overwrite Mode
  - [ ] When Overwrite Mode is OFF (default): fields with existing values are skipped during paste
  - [ ] When Overwrite Mode is ON: fields with existing values are overwritten with the ADO value
  - [ ] The current mode is shown in the User tab during paste so the user is aware

---

**FR-011: Sidebar Persistence Across Tab Switches**
- **Description**: The extension sidebar remains open and retains its state (copied data, field status) when the user switches between the ADO tab and the PowerApps tab.
- **Priority**: Critical
- **Acceptance Criteria**:
  - [ ] Copied ADO data persists in memory when the user switches from the ADO tab to the PA tab
  - [ ] Sidebar state (field statuses, copied values) is not lost during tab navigation
  - [ ] The sidebar correctly re-evaluates the active tab's page type when switching tabs

---

### 4.2 User Workflow (End-to-End)

```
[ADO Tab]
  └─ User opens ADO Initiative work item page
  └─ User clicks extension icon → Sidebar opens (User tab active)
  └─ Sidebar detects ADO page → "Copy Initiative" button enabled
  └─ User clicks "Copy Initiative"
  └─ Extension reads all mapped ADO fields via DOM scraping
  └─ Sidebar shows per-field read status (green / yellow / red)

[User switches to PowerApps Tab]
  └─ Sidebar persists (data still in memory)
  └─ Sidebar detects PA page → "Paste to PowerApps" button enabled
  └─ User navigates to the correct Initiative record in PA (open form, edit mode)
  └─ User clicks "Paste to PowerApps"
  └─ Extension populates each PA field using configured mappings:
      - Text fields: simulated typing
      - Lookup fields: click → trigger → wait → select match
      - Combo/select fields: click → wait → select match
  └─ Sidebar shows per-field paste status summary (green / yellow / red)
  └─ User reviews the form and manually saves the PA record
```

---

### 4.3 Business Rules

**BR-001: Skip Populated Fields by Default**
- The Paste operation must not overwrite existing values in PA fields unless Overwrite Mode is explicitly enabled by the user.

**BR-002: Continue on Field Failure**
- If a single field interaction fails (cannot find element, lookup match fails, interaction error), the extension must continue processing the remaining fields and report the failure in the sidebar status.

**BR-003: Never Auto-Save**
- The extension must never trigger a save action on the PowerApps form. The user must always manually save the record.

**BR-004: Supported Pages Only**
- Action buttons (Copy, Paste) must be disabled and the sidebar must show a contextual message when the user is on an unsupported page.

**BR-005: Lookup No-Match Behavior**
- If a lookup field interaction finds no matching option, the field must be left blank (not partially typed) and a yellow warning must be shown in the sidebar.

---

## 5. Non-Functional Requirements

### 5.1 Performance

- **Copy operation**: Must complete all field reads within 3 seconds on a fully-loaded ADO page
- **Paste operation**: Each field interaction should not wait more than 3 seconds for a DOM response (e.g., lookup options loading) before timing out and marking as failed
- **Sidebar rendering**: Sidebar should open and render within 500ms of clicking the extension icon

### 5.2 Reliability

- DOM interaction failures must be caught gracefully; the extension must never crash the host page
- The extension must handle cases where DOM elements are not yet rendered (e.g., lazy-loaded fields) with a configurable wait/retry mechanism

### 5.3 Maintainability

- Field mappings use CSS selectors, which may need updating if ADO or PA UI changes
- The mapping system must be fully user-configurable (no code changes needed to update selectors)
- The JSON export/import mechanism provides a recovery path if local storage is cleared

### 5.4 Usability

- All sidebar states (idle, copying, pasting, error) must be visually distinct
- Color indicators (green/yellow/red) must be accompanied by text labels for accessibility
- The Admin tab must be usable by a semi-technical user without reading documentation

### 5.5 Security

- The extension must not transmit any data to external servers
- No credentials, tokens, or user data leave the browser
- The extension should request only the minimum required Chrome permissions (activeTab, storage, scripting, sidePanel)

### 5.6 Compatibility

- **Browser**: Google Chrome 114 or later (required for Chrome Side Panel API)
- **ADO**: Azure DevOps web (dev.azure.com)
- **PowerApps**: PowerApps model-driven apps (make.powerapps.com or custom domains)

---

## 6. Data Requirements

### 6.1 Data Handled

| Data Item | Source | Destination | Storage |
|-----------|--------|-------------|---------|
| Initiative field values (9 fields) | ADO DOM | PA DOM | In-memory only (cleared after paste or tab close) |
| Field mapping configuration | Admin tab UI | Chrome local storage | Persisted locally |
| Exported mapping config | Chrome local storage | JSON file (download) | User filesystem |

### 6.2 Field Mapping Data Model

Each mapping entry contains:

```json
{
  "id": "uuid",
  "adoFieldName": "Line of Business",
  "paFieldSelector": "#field_line_of_business",
  "fieldType": "lookup",
  "enabled": true
}
```

**Field types**: `"text"` | `"lookup"` | `"combo-select"`

### 6.3 Data Privacy

- No PII is stored persistently; field values are held only in extension memory during a session
- The extension does not log, transmit, or cache Initiative data between sessions
- Mapping configuration contains only CSS selectors and field names — no sensitive data

---

## 7. Integration Requirements

### 7.1 Azure DevOps (Source)

**INT-001: ADO Initiative Page — DOM Scraping**
- **Integration Type**: DOM scraping via Chrome Content Script
- **Target**: Azure DevOps Initiative work item page (`dev.azure.com/*/workitems/*`)
- **Data Flow**: Read-only (extension reads from ADO DOM, does not write)
- **Authentication**: None required (uses existing browser session)
- **Field Discovery**: CSS selectors configured by the user in the Admin tab
- **Future Enhancement**: Replace DOM scraping with ADO REST API calls (v2 scope)

### 7.2 PowerApps (Destination)

**INT-002: PowerApps Model-Driven App Form — DOM Interaction**
- **Integration Type**: DOM manipulation via Chrome Content Script
- **Target**: PowerApps model-driven app form pages
- **Data Flow**: Write-only (extension writes to PA form, does not read)
- **Authentication**: None required (uses existing browser session)
- **Interaction Strategy**:
  - Text fields: `element.value = value`, dispatch `input` and `change` events
  - Lookup fields: click → type/trigger → wait for results → click matching result
  - Custom combo/select: click → wait for options → click matching option

---

## 8. User Interface Requirements

### 8.1 Sidebar Structure

The extension opens as a Chrome Side Panel with two tabs:

**Tab 1 — User Tab (default)**
- Page context indicator (supported/unsupported, current page type)
- "Copy Initiative" button (enabled on ADO Initiative pages only)
- "Paste to PowerApps" button (enabled on PA pages only, and only when data has been copied)
- Overwrite Mode status indicator (read-only display of current setting)
- Field status list — after Copy or Paste, shows each mapped field with status icon and label

**Tab 2 — Admin Tab**
- Mapping list (table of all configured field mappings)
- Add/Edit/Delete mapping controls
  - ADO field name (text input or predefined dropdown)
  - PA field selector (text input for CSS selector)
  - "Pick Element" button (activates guided element selector on the current PA page)
  - Field type selector (text / lookup / combo-select)
- Overwrite Mode toggle
- Export Mappings button (downloads JSON)
- Import Mappings button (uploads JSON)

### 8.2 Visual Feedback States

| State | Indicator |
|-------|-----------|
| Field read successfully | Green icon + field name |
| Field blank/missing in ADO | Yellow warning icon + field name + "Field is blank in ADO" |
| Field failed to read | Red error icon + field name + short error reason |
| Field pasted successfully | Green icon + field name |
| Lookup — no match found | Yellow warning icon + field name + "No matching option found" |
| Field interaction failed | Red error icon + field name + short error reason |
| Field skipped (already has value) | Grey icon + field name + "Skipped (field has existing value)" |

### 8.3 Page Detection Messages

| Scenario | Sidebar Message |
|----------|----------------|
| On an ADO Initiative page | "Azure DevOps Initiative detected. Ready to copy." |
| On a PowerApps model-driven app page | "PowerApps form detected. Ready to paste." |
| On an unsupported page | "This page is not supported. Navigate to an ADO Initiative or PowerApps form." |

### 8.4 Responsive Behavior

- The sidebar is fixed-width (Chrome Side Panel default, ~400px)
- Content should scroll vertically if the field list exceeds the sidebar height

---

## 9. Technical Requirements

### 9.1 Technology Stack

- **Extension Framework**: Chrome Extension Manifest V3
- **UI**: HTML + CSS + vanilla JavaScript (or lightweight framework; no heavy dependencies preferred for a small-team tool)
- **Side Panel**: Chrome Side Panel API (`chrome.sidePanel`)
- **Storage**: Chrome Storage API (`chrome.storage.local`)
- **Content Scripts**: JavaScript injected into ADO and PA pages for DOM interaction
- **Background Service Worker**: Manages cross-tab state, messaging between sidebar and content scripts

### 9.2 Chrome Permissions Required

```json
{
  "permissions": [
    "activeTab",
    "storage",
    "scripting",
    "sidePanel"
  ],
  "host_permissions": [
    "https://dev.azure.com/*",
    "https://*.powerapps.com/*",
    "https://*.dynamics.com/*"
  ]
}
```

> Note: `host_permissions` may need to include custom PowerApps domains if the organization uses them.

### 9.3 Architecture Overview

```
┌─────────────────────────────────────────┐
│              Chrome Browser             │
│                                         │
│  ┌───────────────┐  ┌────────────────┐  │
│  │   ADO Tab     │  │  PowerApps Tab │  │
│  │               │  │                │  │
│  │ Content Script│  │ Content Script │  │
│  │ (DOM Reader)  │  │ (DOM Writer)   │  │
│  └───────┬───────┘  └───────┬────────┘  │
│          │  Chrome Messaging │           │
│  ┌───────▼──────────────────▼────────┐  │
│  │       Background Service Worker   │  │
│  │    (State Manager / Router)       │  │
│  └───────────────────┬───────────────┘  │
│                      │ Chrome Messaging  │
│  ┌───────────────────▼───────────────┐  │
│  │          Side Panel UI            │  │
│  │   [User Tab]    [Admin Tab]       │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ┌─────────────────────────────────┐    │
│  │      Chrome Local Storage       │    │
│  │    (Field Mapping Config)       │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### 9.4 Cross-Tab State Management

- The Background Service Worker holds the copied ADO Initiative data in memory
- When the user switches to the PA tab, the sidebar retrieves the in-memory data from the background worker via Chrome Messaging
- State is cleared when the extension is reloaded or the browser session ends

### 9.5 Element Selector Capture Mechanism

- When "Pick Element" is activated, the background worker injects a capture-mode overlay script into the active PA tab
- The overlay listens for `mouseover` events and highlights hovered elements with a visual outline
- On `click`, the overlay computes a stable selector (preference order: `id` → `data-*` attributes → unique CSS path) and messages it back to the sidebar Admin tab
- The overlay is removed after capture or cancellation

---

## 10. Testing Requirements

### 10.1 Testing Scope

- **Manual Testing**: Primary testing approach given the small team and UI-heavy nature
- **Unit Testing**: Core logic functions (selector generation, field status computation, JSON import validation)
- **Integration Testing**: End-to-end test of Copy → Paste flow using a real ADO Initiative and PA form (or test environments)

### 10.2 Key Test Scenarios

| Scenario | Expected Outcome |
|----------|-----------------|
| Copy on a fully populated ADO Initiative | All 9 fields show green |
| Copy on an ADO Initiative with blank fields | Blank fields show yellow warning |
| Paste all text fields successfully | All text fields populated, green |
| Paste to lookup field with exact match | Lookup field populated, green |
| Paste to lookup field with no match | Field left blank, yellow warning |
| Paste when PA field already has a value (Overwrite OFF) | Field skipped, grey indicator |
| Paste when PA field already has a value (Overwrite ON) | Field overwritten, green |
| Trigger Copy on unsupported page | Copy button disabled |
| Trigger Paste with no copied data | Paste button disabled |
| Import valid JSON mapping | Mappings loaded, no error |
| Import invalid JSON file | Error message, existing mappings unchanged |
| Export mappings | Valid JSON file downloaded |
| Point-and-click element capture | Correct selector captured and populated |

---

## 11. Operational Requirements

### 11.1 Distribution

- Initially distributed as an unpacked extension (load via `chrome://extensions` in Developer Mode)
- Future: optionally publish to Chrome Web Store for easier team distribution

### 11.2 Updates

- Extension updates are manual (re-download and reload) for unpacked distribution
- Mapping configurations in local storage persist across extension updates

### 11.3 Documentation

- README with installation steps and usage guide
- Admin guide for configuring field mappings (with screenshots)
- JSON mapping schema documentation for manual editing

---

## 12. Risk Assessment

### 12.1 Identified Risks

| Risk ID | Risk Description | Likelihood | Impact | Mitigation Strategy |
|---------|------------------|------------|--------|---------------------|
| R-001 | ADO UI changes break DOM selectors for reading fields | High | High | User-configurable selectors; export/import makes re-mapping easy |
| R-002 | PowerApps custom controls resist programmatic interaction | Medium | High | Test during development; document known-good interaction patterns; graceful failure with clear error |
| R-003 | Chrome Side Panel API behavior changes between Chrome versions | Low | Medium | Pin minimum Chrome version; monitor Chrome release notes |
| R-004 | Lookup field auto-selection fails due to timing (slow load) | Medium | Medium | Configurable wait/retry timeout; clear failure feedback to user |
| R-005 | Mapping config lost if Chrome local storage is cleared | Low | Medium | Export/import JSON provides a manual backup path |
| R-006 | Team grows and per-device config becomes a maintenance burden | Low | Low | Import/export JSON solves this; future cloud sync could be added |

---

## 13. Future Enhancements (Out of Scope for v1)

These items were explicitly identified as potential future work:

| ID | Enhancement |
|----|-------------|
| FE-001 | ADO REST API integration to replace DOM scraping (more robust field reading) |
| FE-002 | Chrome Storage Sync to share config across devices via Google account |
| FE-003 | Chrome Web Store publication for easier team distribution |
| FE-004 | Bulk/batch transfer of multiple Initiatives |
| FE-005 | Transfer history / audit log |
| FE-006 | PowerApps new record creation (not just paste into existing) |

---

## 14. Acceptance Criteria (Definition of Done)

### 14.1 Feature Complete

- [ ] All FR-001 through FR-011 requirements are implemented and passing their acceptance criteria
- [ ] Both ADO and PowerApps pages are correctly detected
- [ ] All 9 Initiative fields can be read from ADO and written to PA
- [ ] Lookup and combo-select field interactions work end-to-end
- [ ] Admin tab allows full mapping CRUD, export, import, and element capture
- [ ] Overwrite Mode functions correctly

### 14.2 Quality Gates

- [ ] Extension loads without errors in Chrome 114+
- [ ] No unhandled JavaScript exceptions thrown during normal use
- [ ] Extension does not modify or break the host page (ADO or PA)
- [ ] All error states show user-friendly messages (no raw error objects in the UI)
- [ ] JSON export produces valid, re-importable files

### 14.3 User Acceptance

- [ ] A PM can complete a full 9-field transfer (copy + paste) in under 60 seconds with configured mappings
- [ ] A PM can configure a new field mapping using the point-and-click selector without developer assistance
- [ ] The sidebar correctly shows which fields succeeded and which need manual attention after paste

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| ADO | Azure DevOps — Microsoft's project management and source control platform |
| PA | Power Apps — Microsoft's low-code application platform |
| Initiative | A custom Azure DevOps work item type representing a large, strategic piece of work |
| Model-driven app | A type of Power Apps application driven by data model/entity definitions |
| DOM Scraping | Reading data from a web page's Document Object Model (rendered HTML) |
| Content Script | A JavaScript file injected by a Chrome extension into a host web page |
| Side Panel | A Chrome extension UI panel that appears on the side of the browser window |
| Lookup field | A form field that links to another record in the data model (requires selection from a list) |
| Combo/select field | A dropdown field presenting a fixed list of options |
| CSS Selector | A pattern used to identify HTML elements (e.g., `#field-id`, `.class-name`) |
| Overwrite Mode | Extension setting that controls whether existing PA field values are replaced during paste |

---

## Appendix B: References

- [Automa Chrome Extension](https://github.com/AutomaApp/automa) — reference for point-and-click element selector UX pattern
- [Chrome Extension Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/sidePanel/)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)

---

## Document Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-14 | Requirements Analyst AI | Initial draft based on stakeholder interview |
