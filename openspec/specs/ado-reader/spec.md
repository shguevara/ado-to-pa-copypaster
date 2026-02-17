## ADDED Requirements

### Requirement: URL ID sentinel extraction
When `mapping.adoSelector === "__URL_ID__"`, the script SHALL extract the numeric work item ID from `window.location.pathname` using the regex `/\/(\d+)(?:[/?#]|$)/` and return it as the field value. It SHALL NOT query the DOM for this sentinel value.

#### Scenario: Sentinel extracts ID from a standard ADO work item URL
- **WHEN** `adoSelector` is `"__URL_ID__"` and the page URL pathname contains `/edit/42`
- **THEN** the result for that field SHALL have `status: "success"` and `value: "42"`

#### Scenario: Sentinel returns error when no numeric ID is found in URL
- **WHEN** `adoSelector` is `"__URL_ID__"` and the URL pathname contains no digit segment matching the pattern
- **THEN** the result SHALL have `status: "error"` and a non-empty `message`

---

### Requirement: DOM field reading via CSS selector
When `adoSelector` is a CSS selector (not the `__URL_ID__` sentinel), the script SHALL call `doc.querySelector(adoSelector)` and extract the value as `el.value || el.textContent?.trim() || ""`.

#### Scenario: Input element with a value property
- **WHEN** `adoSelector` matches an `<input>` element whose `.value` is `"My Initiative Title"`
- **THEN** the result SHALL have `status: "success"` and `value: "My Initiative Title"`

#### Scenario: Element with textContent but no value property
- **WHEN** `adoSelector` matches a `<div>` whose `.value` is `undefined` and whose `.textContent` trims to `"Summary text"`
- **THEN** the result SHALL have `status: "success"` and `value: "Summary text"`

---

### Requirement: HTML stripping from extracted values
The script SHALL strip HTML tags from extracted values before returning them, replacing tag sequences with a single space and collapsing multiple whitespace characters.

#### Scenario: Value containing inline HTML tags is cleaned
- **WHEN** the raw extracted value is `"Hello <b>World</b> test"`
- **THEN** the stored value SHALL be `"Hello World test"` (tags replaced, whitespace normalised)

#### Scenario: Value with no HTML passes through unchanged
- **WHEN** the raw extracted value is `"Plain text"`
- **THEN** the stored value SHALL be `"Plain text"`

---

### Requirement: Blank field detection
When the extracted (and stripped) value is an empty string, the script SHALL return `status: "blank"` with a descriptive message. Blank fields SHALL be included in the result array (not silently skipped).

#### Scenario: Selector matches element with empty value
- **WHEN** `doc.querySelector(adoSelector)` returns an element whose `.value` and `.textContent` both evaluate to `""`
- **THEN** the result SHALL have `status: "blank"` and `message: "Field is blank in ADO"`

---

### Requirement: Element not found
When `doc.querySelector(adoSelector)` returns `null`, the script SHALL return `status: "error"` with a message that includes the selector string.

#### Scenario: Selector matches no element
- **WHEN** `doc.querySelector(adoSelector)` returns `null`
- **THEN** the result SHALL have `status: "error"` and `message` containing the selector value

---

### Requirement: Per-field error isolation (BR-002)
Each field read SHALL be wrapped in an independent `try/catch`. An exception thrown while processing one field SHALL NOT prevent the remaining fields from being processed.

#### Scenario: One field throws during processing, others succeed
- **WHEN** `adoReaderMain` is called with three mappings and the second throws an unexpected error
- **THEN** the first and third fields SHALL have their results populated as if the second had not thrown
- **THEN** the second field's result SHALL have `status: "error"` with the exception message

---

### Requirement: FieldResult[] return contract
The script SHALL return a `FieldResult[]` array with exactly one entry per mapping in the input array, in the same order. Each entry SHALL include `fieldId` (from `mapping.id`) and `label` (from `mapping.label`).

#### Scenario: Output length and order match input mappings
- **WHEN** `adoReaderMain` is called with two mappings in order [A, B]
- **THEN** the result array SHALL have length 2 and `result[0].fieldId === mappingA.id` and `result[1].fieldId === mappingB.id`

#### Scenario: Empty mappings array returns empty result
- **WHEN** `adoReaderMain` is called with `mappings = []`
- **THEN** the result SHALL be an empty array `[]`
