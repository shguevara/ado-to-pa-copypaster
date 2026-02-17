## ADDED Requirements

### Requirement: paWriterMain entry point contract
The script SHALL expose a `paWriterMain(copiedData, mappings, overwriteMode)` function as its sole entry point. It SHALL iterate over `mappings` (filtered to `enabled === true`), match each mapping to its corresponding `CopiedFieldData` entry by `fieldId`, and call the appropriate write strategy for each. It SHALL return a `FieldResult[]` array with one entry per enabled mapping.

#### Scenario: Matched field returns strategy result
- **WHEN** `paWriterMain` is called with a single enabled mapping whose `fieldId` matches a `CopiedFieldData` entry with `readStatus: "success"` and `value: "Foo"`
- **THEN** the strategy function for that mapping's `fieldType` SHALL be called with `fieldSchemaName` and `"Foo"`
- **THEN** the returned `FieldResult[]` SHALL contain exactly one entry with `fieldId` matching the mapping `id`

#### Scenario: No copiedData entry for a mapping returns error
- **WHEN** a mapping's `fieldId` has no corresponding entry in `copiedData`
- **THEN** the result for that field SHALL have `status: "error"` and a non-empty `message`

#### Scenario: Disabled mappings are skipped
- **WHEN** a mapping has `enabled: false`
- **THEN** it SHALL NOT appear in the returned `FieldResult[]`

#### Scenario: Empty mappings array returns empty result
- **WHEN** `paWriterMain` is called with `mappings = []`
- **THEN** the result SHALL be an empty array `[]`

---

### Requirement: Overwrite Mode skip (BR-001)
Before writing any field, the script SHALL check whether the PA field already has a value. If `overwriteMode === false` and the field is already populated, the field SHALL be skipped without any DOM modification and a `FieldResult` with `status: "skipped"` SHALL be returned.

For `text` fields: the DOM input element's current `.value` is non-empty.
For `choice` fields: the combobox button's `title` attribute is not `"---"` (or is not empty).
For `lookup` fields: the delete-button element (`[data-id="{prefix}_selected_tag_delete"]`) is present in the DOM.

#### Scenario: text field with existing value is skipped when overwriteMode is false
- **WHEN** `overwriteMode === false` and the text input element has a non-empty `.value`
- **THEN** the strategy SHALL return `{ status: "skipped", message: "Field already has a value (overwrite mode is off)" }`
- **THEN** the input value SHALL remain unchanged

#### Scenario: lookup field with existing value is skipped when overwriteMode is false
- **WHEN** `overwriteMode === false` and `[data-id="{prefix}_selected_tag_delete"]` is present
- **THEN** the strategy SHALL return `{ status: "skipped", message: "Field already has a value (overwrite mode is off)" }`
- **THEN** the delete button SHALL NOT be clicked

#### Scenario: Fields are written when overwriteMode is true regardless of existing value
- **WHEN** `overwriteMode === true` and the field already has a value
- **THEN** the strategy SHALL proceed to overwrite the field

---

### Requirement: Per-field error isolation (BR-002)
Each field write SHALL be wrapped in an independent `try/catch`. An unhandled exception thrown by one field's write strategy SHALL NOT prevent the remaining fields from being processed.

#### Scenario: One field throws, others complete successfully
- **WHEN** `paWriterMain` is called with three enabled mappings and the strategy for the second field throws an unexpected error
- **THEN** the first and third fields SHALL have their strategies called and their results populated
- **THEN** the second field's result SHALL have `status: "error"` and `message` containing the exception message

---

### Requirement: No form submission or save (BR-003)
The script SHALL NEVER call `form.submit()`, dispatch a `"submit"` event, or programmatically click any Save button. All writes are limited to individual field DOM interactions.

#### Scenario: Script completes without triggering form submission
- **WHEN** `paWriterMain` completes writing all fields
- **THEN** no `submit` event SHALL have been dispatched on any form element
- **THEN** no element matching a save-button selector SHALL have been clicked by the script

---

### Requirement: text field write strategy
For a mapping with `fieldType: "text"`, the script SHALL:
1. Query `[data-id="{fieldSchemaName}.fieldControl-text-box-text"]`.
2. If not found, return `status: "error"`.
3. If `overwriteMode === false` and the input has a non-empty `.value`, return `status: "skipped"`.
4. Focus the element, select all existing content, then call `simulateTyping(el, value)`.
5. Return `status: "success"`.

#### Scenario: text input found and written
- **WHEN** the text input element is present and `overwriteMode === true` (or the field is empty)
- **THEN** `simulateTyping` SHALL be called with the element and the field value
- **THEN** the strategy SHALL return `{ status: "success" }`

#### Scenario: text input element not found
- **WHEN** `document.querySelector("[data-id='{fieldSchemaName}.fieldControl-text-box-text']")` returns `null`
- **THEN** the strategy SHALL return `{ status: "error", message }` containing the selector

---

### Requirement: choice field write strategy
For a mapping with `fieldType: "choice"`, the script SHALL:
1. Query `[data-id="{fieldSchemaName}.fieldControl-option-set-select"]`.
2. If not found, return `status: "error"`.
3. If `overwriteMode === false` and the combobox is not showing the default `"---"` value (i.e., `title` is set to a non-placeholder value), return `status: "skipped"`.
4. Click the combobox to open the dropdown.
5. Call `waitForElements('[role="option"]', 3000)` from the document root (Fluent UI renders options in a detached portal — see D-5).
6. If no options appear within 3s, return `status: "error"`.
7. Case-insensitively match the target value against each option's `textContent.trim()`.
8. If no match, return `status: "warning"` with available options listed.
9. Click the matching option element.
10. Return `status: "success"`.

#### Scenario: matching option found and selected
- **WHEN** the combobox is present and options appear with a text match for the target value
- **THEN** the matching option element SHALL be clicked
- **THEN** the strategy SHALL return `{ status: "success" }`

#### Scenario: combobox element not found
- **WHEN** `document.querySelector("[data-id='{fieldSchemaName}.fieldControl-option-set-select']")` returns `null`
- **THEN** the strategy SHALL return `{ status: "error", message }` containing the selector

#### Scenario: options do not appear within timeout
- **WHEN** `waitForElements('[role="option"]', 3000)` resolves with an empty NodeList
- **THEN** the strategy SHALL return `{ status: "error", message: "No options appeared after opening dropdown" }`

#### Scenario: no option text matches the target value
- **WHEN** none of the rendered `[role="option"]` elements have `textContent` matching the target value (case-insensitive)
- **THEN** the strategy SHALL return `{ status: "warning", message }` listing the available option texts

---

### Requirement: lookup field write strategy
For a mapping with `fieldType: "lookup"`, the script SHALL use the selector prefix `"{fieldSchemaName}.fieldControl-LookupResultsDropdown_{fieldSchemaName}"` to derive all sub-selectors. The strategy SHALL:
1. Check for `[data-id="{prefix}_selected_tag_delete"]` to detect whether the field currently has a value.
2. If `overwriteMode === false` and the delete button is present, return `status: "skipped"`.
3. If `overwriteMode === true` and the delete button is present, click it and call `waitForElement("[data-id='{prefix}_textInputBox_with_filter_new']", 3000)`.
4. Query `[data-id="{prefix}_textInputBox_with_filter_new"]`. If not found, return `status: "error"`.
5. Focus and click the text input, then call `simulateTyping(input, value)`.
6. Call `waitForElements("[data-id='{prefix}_resultsContainer']", 5000)`.
7. If no results appear within 5s, return `status: "error"` per BR-005 (clear partial text first).
8. Match results by the primary name: the part of `aria-label` before the first comma, case-insensitively.
9. If no match, return `status: "warning"` per BR-005 (clear partial text first).
10. Click the matching result element.
11. Return `status: "success"`.

#### Scenario: empty lookup field found and populated
- **WHEN** the delete button is absent (field is empty) and search results appear with a match
- **THEN** the text input SHALL be focused and typed into
- **THEN** the matching result element SHALL be clicked
- **THEN** the strategy SHALL return `{ status: "success" }`

#### Scenario: populated lookup field cleared and re-populated when overwriteMode is true
- **WHEN** `overwriteMode === true` and the delete button is present
- **THEN** the delete button SHALL be clicked
- **THEN** the strategy SHALL wait for the text input to reappear before proceeding

#### Scenario: text input not found after clearing
- **WHEN** the delete button was clicked but `waitForElement` resolves to `null` (text input never appears)
- **THEN** the strategy SHALL return `{ status: "error", message: "Text input did not appear after clearing existing value" }`

#### Scenario: no search results appear within timeout (BR-005)
- **WHEN** `waitForElements` resolves with an empty NodeList after 5s
- **THEN** the script SHALL clear the typed value from the input before returning
- **THEN** the strategy SHALL return `{ status: "error", message }` explaining no results were found

#### Scenario: no result matches the search value (BR-005)
- **WHEN** results appear but none have an `aria-label` primary name matching the target value
- **THEN** the script SHALL clear the typed value from the input before returning
- **THEN** the strategy SHALL return `{ status: "warning", message }` listing the available primary names

---

### Requirement: simulateTyping helper
`simulateTyping(inputElement, text)` SHALL fire input events that PowerApps' React synthetic event system detects:
1. Select all existing content in the element.
2. Attempt `document.execCommand('insertText', false, text)`.
3. If the element's value does not equal `text` after execCommand (fallback), use the native HTMLInputElement setter and dispatch bubbling `input` and `change` events.
4. Wait 300ms before resolving (to allow the PA framework time to process the input and initiate any API calls).

#### Scenario: execCommand successfully sets value
- **WHEN** `document.execCommand('insertText', false, text)` sets `inputElement.value` to `text`
- **THEN** the native setter fallback SHALL NOT be invoked
- **THEN** `simulateTyping` SHALL resolve after the 300ms settle delay

#### Scenario: execCommand no-ops, fallback fires native events
- **WHEN** `execCommand` does not change `inputElement.value`
- **THEN** the native HTMLInputElement setter SHALL be called with `text`
- **THEN** a bubbling `input` event and a bubbling `change` event SHALL be dispatched on the element

---

### Requirement: waitForElement helper
`waitForElement(selector, timeoutMs)` SHALL return a `Promise` that resolves to the first matching DOM element, or `null` if the timeout elapses without a match. It SHALL use a `MutationObserver` on `document.body` (not polling) and disconnect the observer before resolving or timing out.

#### Scenario: element already present resolves immediately
- **WHEN** `document.querySelector(selector)` returns a non-null element before the observer is attached
- **THEN** the promise SHALL resolve with that element without observing any mutations

#### Scenario: element appears after a mutation resolves immediately
- **WHEN** the element is absent at call time but is inserted into the DOM while the observer is active
- **THEN** the promise SHALL resolve with the element and the observer SHALL be disconnected

#### Scenario: timeout elapses with no match resolves null
- **WHEN** no element matching the selector appears within `timeoutMs` milliseconds
- **THEN** the promise SHALL resolve with `null` and the observer SHALL be disconnected

---

### Requirement: waitForElements helper
`waitForElements(selector, timeoutMs)` SHALL behave identically to `waitForElement` but return a `NodeList` of all matching elements. It SHALL resolve with a non-empty `NodeList` as soon as at least one match appears, or with an empty `NodeList` (from a final `querySelectorAll` call) when the timeout elapses.

#### Scenario: one or more elements present resolves immediately
- **WHEN** `document.querySelectorAll(selector)` returns a non-empty NodeList at call time
- **THEN** the promise SHALL resolve with that NodeList without observing any mutations

#### Scenario: timeout elapses with no elements resolves empty NodeList
- **WHEN** no elements matching the selector appear within `timeoutMs` milliseconds
- **THEN** the promise SHALL resolve with an empty NodeList and the observer SHALL be disconnected

---

### Requirement: FieldResult[] return contract
`paWriterMain` SHALL return a `FieldResult[]` array with exactly one entry per enabled mapping, in the same iteration order. Each entry SHALL include `fieldId` (from `mapping.id`), `label` (from `mapping.label`), `status`, and an optional `message`.

#### Scenario: output length and order match enabled input mappings
- **WHEN** `paWriterMain` is called with two enabled mappings in order [A, B]
- **THEN** the result array SHALL have length 2 with `result[0].fieldId === mappingA.id` and `result[1].fieldId === mappingB.id`
