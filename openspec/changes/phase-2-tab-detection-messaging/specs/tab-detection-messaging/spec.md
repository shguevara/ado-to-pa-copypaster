## ADDED Requirements

### Requirement: Page type is classified from the active tab URL

The service worker SHALL classify the active tab as `"ado"`, `"pa"`, or `"unsupported"` using URL pattern matching.

Rules (from SPEC.md §6.1):
- URL hostname is `dev.azure.com` AND pathname matches `/_workitems/` → `"ado"`
- URL hostname ends with `.visualstudio.com` AND pathname matches `/_workitems/` → `"ado"`
- URL hostname ends with `.powerapps.com` → `"pa"`
- URL hostname ends with `.dynamics.com` → `"pa"`
- Anything else → `"unsupported"`

#### Scenario: ADO work item URL is classified as ado
- **WHEN** the active tab URL is `https://dev.azure.com/org/project/_workitems/edit/123`
- **THEN** `detectPageType` SHALL return `"ado"`

#### Scenario: VisualStudio work item URL is classified as ado
- **WHEN** the active tab URL is `https://contoso.visualstudio.com/project/_workitems/edit/456`
- **THEN** `detectPageType` SHALL return `"ado"`

#### Scenario: PowerApps URL is classified as pa
- **WHEN** the active tab URL is `https://myorg.crm.dynamics.com/main.aspx?app=...`
- **THEN** `detectPageType` SHALL return `"pa"`

#### Scenario: PowerApps make URL is classified as pa
- **WHEN** the active tab URL is `https://make.powerapps.com/...`
- **THEN** `detectPageType` SHALL return `"pa"`

#### Scenario: Any other URL is unsupported
- **WHEN** the active tab URL is `https://google.com`
- **THEN** `detectPageType` SHALL return `"unsupported"`

#### Scenario: ADO URL without workitems path is unsupported
- **WHEN** the active tab URL is `https://dev.azure.com/org/project/_boards/board`
- **THEN** `detectPageType` SHALL return `"unsupported"`

---

### Requirement: Service worker caches and broadcasts page type on tab changes

The service worker SHALL re-evaluate and cache the page type whenever the active tab changes or its URL changes, and SHALL push a `TAB_CHANGED` message to the side panel with the new page type.

#### Scenario: Page type cache updates when user switches tabs
- **WHEN** the user activates a different browser tab
- **THEN** the service worker SHALL re-evaluate `detectPageType` for the new tab's URL, update its cached value, and send `{ action: "TAB_CHANGED", pageType: <new-type> }` via `chrome.runtime.sendMessage`

#### Scenario: Page type cache updates on navigation within a tab
- **WHEN** the active tab navigates to a new URL (`changeInfo.url` set or `changeInfo.status === "complete"`)
- **THEN** the service worker SHALL re-evaluate `detectPageType`, update its cache, and broadcast `TAB_CHANGED`

#### Scenario: No error is thrown when side panel is not open
- **WHEN** the service worker attempts to send `TAB_CHANGED` but no side panel context is open
- **THEN** the error SHALL be caught silently (logged to console.error only); no uncaught exception occurs

---

### Requirement: Side panel can pull current page type on demand

The service worker SHALL respond to a `GET_PAGE_CONTEXT` message with `{ pageType }` from its cached value.

#### Scenario: Side panel requests page context on load
- **WHEN** the side panel sends `{ action: "GET_PAGE_CONTEXT" }`
- **THEN** the service worker SHALL respond with `{ pageType: "ado" | "pa" | "unsupported" }`

#### Scenario: Cache defaults to unsupported before any tab event
- **WHEN** the service worker has just started and no tab event has fired yet
- **THEN** `GET_PAGE_CONTEXT` SHALL return `{ pageType: "unsupported" }`

---

### Requirement: Browser action click opens the side panel

The service worker SHALL open the Chrome Side Panel for the current window when the extension's toolbar icon is clicked.

#### Scenario: User clicks extension icon
- **WHEN** the user clicks the extension's action icon in the Chrome toolbar
- **THEN** `chrome.sidePanel.open({ windowId: tab.windowId })` SHALL be called, causing the side panel to appear
