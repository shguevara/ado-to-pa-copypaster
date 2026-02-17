# Spec: test-field

Capability added in phase-9-test-field.

---

### Requirement: Selector tester script dual-mode operation
`scripts/selector-tester.js` SHALL accept a single argument object with a `mode` property (`"pa"` | `"ado"`) and mode-specific fields. It SHALL wrap all logic in a top-level try/catch and return a structured result object — never throw to the host page.

- **`mode: "pa"`** — accepts `{ mode, fieldSchemaName, fieldType }`. Derives the primary `data-id` selector for the given type:
  - `text` → `[data-id="{schema}.fieldControl-text-box-text"]`
  - `choice` → `[data-id="{schema}.fieldControl-option-set-select"]`
  - `lookup` → tries `[data-id="{schema}.fieldControl-LookupResultsDropdown_{schema}_textInputBox_with_filter_new"]` first; if not found, falls back to `[data-id="{schema}.fieldControl-LookupResultsDropdown_{schema}_selected_tag"]`
- **`mode: "ado"`** — accepts `{ mode, adoSelector }`. Uses `adoSelector` as-is; no derivation.

In both modes the script SHALL:
1. Run `document.querySelector(derivedSelector)`.
2. If found: add `outline: 3px solid #22c55e` to the element, remove it after 2000 ms. Return `{ found: true, tagName: el.tagName }`.
3. If not found: return `{ found: false }`.
4. On any exception: return `{ found: false, error: e.message }`.

#### Scenario: PA text field found
- **WHEN** script is called with `{ mode: "pa", fieldSchemaName: "shg_title", fieldType: "text" }` on a PA page containing `[data-id="shg_title.fieldControl-text-box-text"]`
- **THEN** the element is outlined green for 2 seconds and the script returns `{ found: true, tagName: "INPUT" }`

#### Scenario: PA lookup field found in empty state
- **WHEN** script is called with `{ mode: "pa", fieldSchemaName: "shg_owner", fieldType: "lookup" }` and the text-input selector matches
- **THEN** the text-input element is highlighted and `{ found: true, tagName: "INPUT" }` is returned

#### Scenario: PA lookup field found in filled state (fallback)
- **WHEN** script is called with `{ mode: "pa", fieldSchemaName: "shg_owner", fieldType: "lookup" }`, the text-input selector finds nothing, but the selected-tag selector matches
- **THEN** the selected-tag element is highlighted and `{ found: true, tagName: "BUTTON" }` (or actual tag) is returned

#### Scenario: PA schema name not found
- **WHEN** script is called with `{ mode: "pa", fieldSchemaName: "shg_nonexistent", fieldType: "text" }` and no matching element exists
- **THEN** the script returns `{ found: false }` with no exception thrown

#### Scenario: ADO raw selector found
- **WHEN** script is called with `{ mode: "ado", adoSelector: "input[aria-label='Title']" }` on an ADO page containing that element
- **THEN** the element is outlined green for 2 seconds and `{ found: true, tagName: "INPUT" }` is returned

#### Scenario: ADO raw selector not found
- **WHEN** script is called with `{ mode: "ado", adoSelector: ".shg-nonexistent" }` and no matching element exists
- **THEN** the script returns `{ found: false }` with no exception thrown

#### Scenario: Script exception is caught
- **WHEN** the querySelector call throws (e.g. due to a malformed selector string)
- **THEN** the script returns `{ found: false, error: "<exception message>" }` without propagating the exception

---

### Requirement: TEST_SELECTOR background message handler
The service worker SHALL handle `{ action: "TEST_SELECTOR", fieldSchemaName, fieldType }`. It SHALL:
1. Verify the currently active tab has `pageType === "pa"`. If not, return `{ found: false, error: "Not on a PA page" }` immediately.
2. Inject `scripts/selector-tester.js` into the active tab with args `[{ mode: "pa", fieldSchemaName, fieldType }]`.
3. Return the `{ found, tagName?, error? }` result from the script to the side panel.
4. On injection failure (e.g. tab navigated), catch the error and return `{ found: false, error: e.message }`.

#### Scenario: Successful PA test dispatch
- **WHEN** `TEST_SELECTOR` is received while `pageType === "pa"`
- **THEN** `selector-tester.js` is injected with `mode: "pa"` args and the script result is forwarded to the caller

#### Scenario: PA test on wrong page type
- **WHEN** `TEST_SELECTOR` is received while `pageType !== "pa"` (e.g. ADO page or unsupported)
- **THEN** the handler returns `{ found: false, error: "Not on a PA page" }` without attempting injection

---

### Requirement: TEST_ADO_SELECTOR background message handler
The service worker SHALL handle `{ action: "TEST_ADO_SELECTOR", adoSelector }`. It SHALL:
1. Verify the currently active tab has `pageType === "ado"`. If not, return `{ found: false, error: "Not on an ADO page" }` immediately.
2. Inject `scripts/selector-tester.js` into the active tab with args `[{ mode: "ado", adoSelector }]`.
3. Return the `{ found, tagName?, error? }` result from the script to the side panel.
4. On injection failure, catch the error and return `{ found: false, error: e.message }`.

#### Scenario: Successful ADO test dispatch
- **WHEN** `TEST_ADO_SELECTOR` is received while `pageType === "ado"`
- **THEN** `selector-tester.js` is injected with `mode: "ado"` args and the script result is forwarded to the caller

#### Scenario: ADO test on wrong page type
- **WHEN** `TEST_ADO_SELECTOR` is received while `pageType !== "ado"`
- **THEN** the handler returns `{ found: false, error: "Not on an ADO page" }` without attempting injection

---

### Requirement: Test Field button (PA) enable/disable and loading state
The "Test Field" button in the Admin mapping form SHALL be:
- **Disabled** when `$store.app.pageType !== "pa"` or while a PA test is in progress (`paTestRunning === true`)
- **Enabled** when `$store.app.pageType === "pa"` and no PA test is in progress
- While running: button label changes to "Testing…" and the button is disabled
- On response: button label reverts and button re-enables

#### Scenario: Button disabled on non-PA page
- **WHEN** the mapping form is open and `pageType` is `"ado"` or `"unsupported"`
- **THEN** the "Test Field" button is disabled and cannot be clicked

#### Scenario: Button shows loading state
- **WHEN** user clicks "Test Field" while on a PA page
- **THEN** the button immediately shows "Testing…" and is disabled until the response arrives

---

### Requirement: Test ADO button enable/disable and loading state
The "Test ADO" button in the Admin mapping form SHALL be:
- **Disabled** when `$store.app.pageType !== "ado"`, OR when `form.adoSelector === "__URL_ID__"`, OR while an ADO test is in progress (`adoTestRunning === true`)
- **Enabled** only when `pageType === "ado"` AND `adoSelector !== "__URL_ID__"` AND no ADO test is running
- While running: button label changes to "Testing…" and the button is disabled
- On response: button label reverts and button re-enables

#### Scenario: Button disabled on non-ADO page
- **WHEN** the mapping form is open and `pageType` is `"pa"` or `"unsupported"`
- **THEN** the "Test ADO" button is disabled

#### Scenario: Button disabled for __URL_ID__ sentinel
- **WHEN** the `adoSelector` input contains exactly `__URL_ID__`
- **THEN** the "Test ADO" button is disabled regardless of page type

#### Scenario: Button enabled on ADO page with real selector
- **WHEN** `pageType === "ado"` and `adoSelector` is a non-empty string that is not `__URL_ID__`
- **THEN** the "Test ADO" button is enabled

#### Scenario: Button shows loading state
- **WHEN** user clicks "Test ADO" while on an ADO page with a real selector
- **THEN** the button immediately shows "Testing…" and is disabled until the response arrives

---

### Requirement: Inline test result display
After each test completes, the side panel SHALL display an inline result message immediately below the corresponding input:

- **PA test result** — shown below the Field Schema Name input:
  - Found: `✅ Found: <TAGNAME> element` (green)
  - Not found: `❌ No element found — check schema name and field type` (red)
  - Error: `❌ Error: <message>` (red)

- **ADO test result** — shown below the ADO Selector input:
  - Found: `✅ Found: <TAGNAME> element` (green)
  - Not found: `❌ No element found — check the CSS selector` (red)
  - Error: `❌ Error: <message>` (red)

Results are stored in local `x-data` properties (`paTestResult`, `adoTestResult`) — not in the global Alpine store.

#### Scenario: PA found result displayed
- **WHEN** `TEST_SELECTOR` returns `{ found: true, tagName: "INPUT" }`
- **THEN** green text "✅ Found: INPUT element" is shown below the Field Schema Name input

#### Scenario: PA not-found result displayed
- **WHEN** `TEST_SELECTOR` returns `{ found: false }`
- **THEN** red text "❌ No element found — check schema name and field type" is shown below the Field Schema Name input

#### Scenario: ADO found result displayed
- **WHEN** `TEST_ADO_SELECTOR` returns `{ found: true, tagName: "SPAN" }`
- **THEN** green text "✅ Found: SPAN element" is shown below the ADO Selector input

#### Scenario: ADO error result displayed
- **WHEN** `TEST_ADO_SELECTOR` returns `{ found: false, error: "Unexpected token" }`
- **THEN** red text "❌ Error: Unexpected token" is shown below the ADO Selector input

---

### Requirement: Test result clearing on input change and form reset
To prevent stale results from misleading the user, test results SHALL be cleared:

1. **On input change**: `paTestResult` is cleared whenever the Field Schema Name or Field Type inputs change. `adoTestResult` is cleared whenever the ADO Selector input changes.
2. **On form open/reset**: Both `paTestResult` and `adoTestResult` are reset to `null` when the mapping form is opened (both Add and Edit modes).

#### Scenario: PA result cleared after schema name edit
- **WHEN** a PA test result is displayed and the user modifies the Field Schema Name input
- **THEN** the PA test result message is immediately removed

#### Scenario: ADO result cleared after selector edit
- **WHEN** an ADO test result is displayed and the user modifies the ADO Selector input
- **THEN** the ADO test result message is immediately removed

#### Scenario: Both results cleared on form open
- **WHEN** the user opens the mapping form (Add or Edit)
- **THEN** both `paTestResult` and `adoTestResult` are null — no result message is shown
