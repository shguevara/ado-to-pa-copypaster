# PowerApps Model-Driven App: Lookup & Choice Field Paste Strategies

## Technical Specification for Chrome Extension Implementation

> **Context:** This spec was produced by inspecting a live PowerApps model-driven form (Project entity) at `org6216945a.crm.dynamics.com`. It documents the exact DOM structure, selector patterns, and interaction sequences needed for the "ADO to PowerApps Copier" Chrome extension to programmatically paste values into **Lookup** and **Choice (Option-Set)** fields.

---

## Table of Contents

1. [Key Architectural Insight](#1-key-architectural-insight)
2. [Control Type: Choice / Option-Set](#2-control-type-choice--option-set)
3. [Control Type: Lookup](#3-control-type-lookup)
4. [Control Type: Text (Reference)](#4-control-type-text-reference)
5. [Simplified Mapping Configuration](#5-simplified-mapping-configuration)
6. [Implementation: Paste Strategies](#6-implementation-paste-strategies)
7. [Critical Implementation Notes](#7-critical-implementation-notes)
8. [Field Inventory from Inspected Form](#8-field-inventory-from-inspected-form)

---

## 1. Key Architectural Insight

PowerApps model-driven forms generate **predictable \`data-id\` attributes** based on the **field schema name** (e.g., \`shg_solutionfamily\`). Every sub-element of a control follows a deterministic naming pattern derived from this schema name.

**This means the extension mapping config only needs the field schema name — all CSS selectors can be derived automatically at runtime.**

The current extension config asks users to manually find and enter complex selectors like:

\`\`\`
#id-6927649b-946e-4759-8c4f-ed77371c0134-1-shg_solutionfamily...
\`\`\`

These GUID-based IDs are **session-specific and change between page loads**. The \`data-id\` attributes, however, are **stable and predictable**.

---

## 2. Control Type: Choice / Option-Set

**Examples on form:** Initiative stage, Initiative status, Planned Quarter, Roadmap Approval, Product Lifecycle Status, Initiative Type

### 2.1 DOM Structure

#### Closed State (Combobox Button)

\`\`\`html
<button
  type="button"
  role="combobox"
  aria-expanded="false"
  aria-label="Initiative stage"
  data-id="shg_initiativestate.fieldControl-option-set-select"
  title="---"
  class="fui-Dropdown__button ...">
  ---
  <span class="fui-Dropdown__expandIcon ...">
    <svg ...><!-- chevron icon --></svg>
  </span>
</button>
\`\`\`

**Key selector:** \`[data-id="{fieldSchemaName}.fieldControl-option-set-select"]\`

#### Open State (After Click)

When the combobox button is clicked:
- \`aria-expanded\` changes to \`"true"\`
- \`aria-controls\` is set to a Fluent UI listbox ID (e.g., \`"fluent-listbox7"\`)
- A **Fluent UI portal** renders in a separate DOM node (\`<div id="__fluentPortalMountNode">\`)

\`\`\`html
<!-- Portal mount (NOT a child of the combobox!) -->
<div id="__fluentPortalMountNode" role="presentation" class="pa-g flexbox">
  <div role="listbox" id="fluent-listbox7"
       class="fui-Listbox fui-Dropdown__listbox ..."
       data-popper-placement="bottom-start">

    <div><!-- grouping wrapper -->
      <div id="fluent-option13" role="option" aria-selected="true"
           class="fui-Option ...">---</div>
      <div id="fluent-option14" role="option" aria-selected="false"
           class="fui-Option ...">New</div>
      <div id="fluent-option15" role="option" aria-selected="false"
           class="fui-Option ...">Portfolio Planning</div>
      <!-- ... more options ... -->
    </div>

  </div>
</div>
\`\`\`

### 2.2 Selector Pattern

| Element | Selector |
|---------|----------|
| Combobox button | \`[data-id="{fieldSchemaName}.fieldControl-option-set-select"]\` |
| Listbox (when open) | \`[role="listbox"]\` (use \`aria-controls\` from combobox for precision) |
| Individual options | \`[role="option"]\` (match by \`textContent.trim()\`) |

### 2.3 Interaction Sequence

\`\`\`
1. CLICK  -> [data-id="{fieldSchemaName}.fieldControl-option-set-select"]
2. WAIT   -> [role="option"] elements appear in DOM
3. FIND   -> iterate [role="option"], match el.textContent.trim() === targetValue
4. CLICK  -> the matching option element
\`\`\`

---

## 3. Control Type: Lookup

**Examples on form:** Solution Family, Product launch tier, Strategic Theme

### 3.1 DOM Structure — Two States

Lookup fields render differently depending on whether they currently have a value.

#### State A: Empty (No Value Selected)

When the lookup has no value, a **text input** is rendered:

\`\`\`html
<input
  type="text"
  aria-label="Product launch tier, Lookup"
  aria-expanded="false"
  aria-haspopup="tree"
  data-id="shg_productlaunchtier.fieldControl-LookupResultsDropdown_shg_productlaunchtier_textInputBox_with_filter_new"
  placeholder="Look for Product launch tier" />

<button
  type="button"
  aria-label="Search records for Product launch tier, Lookup field"
  aria-expanded="false"
  aria-haspopup="tree"
  data-id="shg_productlaunchtier.fieldControl-LookupResultsDropdown_shg_productlaunchtier_search" />
\`\`\`

#### State B: Has Value (e.g., "Government Solutions")

When the lookup has a value, the text input is **removed from the DOM** and replaced with a selected tag:

\`\`\`html
<!-- Selected value tag -->
<div role="link"
     aria-label="Government Solutions"
     title="Government Solutions"
     data-id="shg_solutionfamily.fieldControl-LookupResultsDropdown_shg_solutionfamily_selected_tag">
  Government Solutions
</div>

<!-- Delete button (X icon) -->
<button
  role="button"
  aria-label="Delete Government Solutions"
  data-id="shg_solutionfamily.fieldControl-LookupResultsDropdown_shg_solutionfamily_selected_tag_delete" />

<!-- Expand button -->
<button
  role="button"
  aria-label="Expand selected records"
  aria-haspopup="tree"
  data-id="shg_solutionfamily.fieldControl-LookupResultsDropdown_shg_solutionfamily_expandCollapse" />

<!-- Search button (magnifying glass) -->
<button
  aria-label="Search records for Solution Family, Lookup field"
  aria-expanded="false"
  aria-haspopup="tree"
  data-id="shg_solutionfamily.fieldControl-LookupResultsDropdown_shg_solutionfamily_search" />
\`\`\`

#### Search Results Flyout (After Typing or Clicking Search)

\`\`\`html
<ul role="tree"
    aria-label="Lookup results"
    data-id="{fieldSchemaName}.fieldControl-LookupResultsDropdown_{fieldSchemaName}_tab">

  <li role="treeitem"
      aria-label="Tier 1 - Strategic Launch, New product or major version release; ..."
      data-id="{fieldSchemaName}.fieldControl-LookupResultsDropdown_{fieldSchemaName}_resultsContainer">
    <span>Tier 1 - Strategic Launch</span>
    <span>New product or major version release; ...</span>
  </li>

  <li role="treeitem"
      aria-label="Tier 2 - New Features, Significant functional upgrade or ..."
      data-id="{fieldSchemaName}.fieldControl-LookupResultsDropdown_{fieldSchemaName}_resultsContainer">
    <span>Tier 2 - New Features</span>
    <span>Significant functional upgrade or ...</span>
  </li>
</ul>
\`\`\`

### 3.2 Selector Pattern

All selectors are derived from a single \`fieldSchemaName\`:

\`\`\`
PREFIX = "{fieldSchemaName}.fieldControl-LookupResultsDropdown_{fieldSchemaName}"
\`\`\`

| Element | Selector |
|---------|----------|
| Text input (empty state) | \`[data-id="{PREFIX}_textInputBox_with_filter_new"]\` |
| Search button | \`[data-id="{PREFIX}_search"]\` |
| Selected tag (has value) | \`[data-id="{PREFIX}_selected_tag"]\` |
| Delete button (clear value) | \`[data-id="{PREFIX}_selected_tag_delete"]\` |
| Result items | \`[data-id="{PREFIX}_resultsContainer"]\` |
| Results tree container | \`[data-id="{PREFIX}_tab"]\` |

### 3.3 Interaction Sequence

\`\`\`
1. CHECK  -> Does [data-id="{PREFIX}_selected_tag_delete"] exist?
   YES -> field has a value, proceed to step 2
   NO  -> field is empty, skip to step 3

2. CLICK  -> [data-id="{PREFIX}_selected_tag_delete"]
   WAIT   -> [data-id="{PREFIX}_textInputBox_with_filter_new"] appears in DOM

3. FOCUS  -> [data-id="{PREFIX}_textInputBox_with_filter_new"]
   CLICK  -> same element (to activate it)

4. TYPE   -> search value using REAL KEYBOARD EVENTS (see implementation notes)

5. WAIT   -> [data-id="{PREFIX}_resultsContainer"] elements appear
            (poll with timeout -- API search takes 500ms-2s)

6. FIND   -> iterate result items, match by:
            - aria-label starts with target value, OR
            - textContent includes target value
            (case-insensitive matching recommended)

7. CLICK  -> the matching result item
\`\`\`

---

## 4. Control Type: Text (Reference)

**Examples on form:** Name, Initiative ID, Netsuite Code, Initiative Assigned To, Project Manager, Product Lead, Engineering Lead, Planned Year

### Selector

\`\`\`
[data-id="{fieldSchemaName}.fieldControl-text-box-text"]
\`\`\`

### Interaction

\`\`\`
1. FOCUS -> input element
2. SELECT ALL -> Ctrl+A
3. TYPE -> new value (replaces existing)
\`\`\`

---

## 5. Simplified Mapping Configuration

### Current Config (Complex — Hard to Map)

\`\`\`json
{
  "label": "Sol Fam",
  "sourceSelector": "input[aria-labelledby=\\"__bolt-Primary-Solution-Family\\"]",
  "targetControlType": "lookup_full_list",
  "openTargetSelector": "id-6927649b-946e-4759-...",
  "openStrategy": "click_then_enter",
  "optionsContainerSelector": "#id-6927649b-946e-4759-...",
  "optionItemSelector": "#id-6927649b-946e-4759-...",
  "optionLabelSelector": ""
}
\`\`\`

**Problems:**
- GUID-based selectors (\`id-6927649b-...\`) are **session-specific** and break across page loads
- User has to manually inspect and find 4-5 different selectors per field
- \`openStrategy\` varies and is error-prone

### Proposed Config (Simplified)

\`\`\`json
{
  "label": "Sol Fam",
  "sourceSelector": "input[aria-labelledby=\\"__bolt-Primary-Solution-Family\\"]",
  "targetControlType": "lookup",
  "fieldSchemaName": "shg_solutionfamily",
  "transformSteps": []
}
\`\`\`

**Benefits:**
- Only **one identifier** needed: the field schema name
- All target selectors derived automatically at runtime
- No GUIDs, no brittle CSS selectors
- Works across sessions, environments, and form layouts

### How to Find the Field Schema Name

Users can find the field schema name by:
1. Going to **Power Apps -> Solutions -> [Your Solution] -> Tables -> [Entity] -> Columns**
2. The "Name" column shows the schema name (e.g., \`shg_solutionfamily\`)
3. Or: inspecting the form and looking at \`data-id\` attributes on field containers

---

## 6. Implementation: Paste Strategies

### 6.1 Strategy Registry

\`\`\`javascript
const PASTE_STRATEGIES = {
  text: pasteText,
  choice: pasteChoice,
  lookup: pasteLookup,
};
\`\`\`

### 6.2 Choice Strategy

\`\`\`javascript
async function pasteChoice(fieldSchemaName, value) {
  // Step 1: Find and click the combobox button
  const comboboxSelector = \`[data-id="\${fieldSchemaName}.fieldControl-option-set-select"]\`;
  const combobox = document.querySelector(comboboxSelector);

  if (!combobox) {
    return { success: false, error: \`Combobox not found: \${comboboxSelector}\` };
  }

  combobox.click();

  // Step 2: Wait for options to render in the Fluent UI portal
  const options = await waitForElements('[role="option"]', 3000);

  if (!options || options.length === 0) {
    return { success: false, error: 'No options appeared after opening dropdown' };
  }

  // Step 3: Find the matching option (case-insensitive)
  const normalizedValue = value.trim().toLowerCase();
  const match = [...options].find(
    (o) => o.textContent.trim().toLowerCase() === normalizedValue
  );

  if (!match) {
    const available = [...options].map((o) => o.textContent.trim());
    return {
      success: false,
      error: \`Option "\${value}" not found. Available: \${available.join(', ')}\`,
    };
  }

  // Step 4: Click the matching option
  match.click();

  return { success: true, selectedValue: match.textContent.trim() };
}
\`\`\`

### 6.3 Lookup Strategy

\`\`\`javascript
async function pasteLookup(fieldSchemaName, value) {
  const prefix = \`\${fieldSchemaName}.fieldControl-LookupResultsDropdown_\${fieldSchemaName}\`;

  // Step 1: Clear existing value if present
  const deleteBtn = document.querySelector(\`[data-id="\${prefix}_selected_tag_delete"]\`);

  if (deleteBtn) {
    deleteBtn.click();

    // Wait for text input to appear after deletion
    const inputAppeared = await waitForElement(
      \`[data-id="\${prefix}_textInputBox_with_filter_new"]\`,
      3000
    );

    if (!inputAppeared) {
      return { success: false, error: 'Text input did not appear after clearing existing value' };
    }
  }

  // Step 2: Focus and click the text input
  const input = document.querySelector(
    \`[data-id="\${prefix}_textInputBox_with_filter_new"]\`
  );

  if (!input) {
    return { success: false, error: 'Lookup text input not found' };
  }

  input.focus();
  input.click();

  // Step 3: Clear any existing text and type the search value
  // IMPORTANT: Must use real keyboard events for React/PowerApps to detect
  input.select(); // Select all existing text
  await simulateTyping(input, value);

  // Step 4: Wait for search results to appear
  const resultSelector = \`[data-id="\${prefix}_resultsContainer"]\`;
  const results = await waitForElements(resultSelector, 5000);

  if (!results || results.length === 0) {
    return { success: false, error: \`No search results found for "\${value}"\` };
  }

  // Step 5: Find the matching result
  const normalizedValue = value.trim().toLowerCase();
  const match = [...results].find((r) => {
    const ariaLabel = r.getAttribute('aria-label') || '';
    const text = r.textContent || '';

    // aria-label format: "RecordName, Description"
    // Match on the primary name (before the comma)
    const primaryName = ariaLabel.split(',')[0].trim().toLowerCase();

    return (
      primaryName === normalizedValue ||
      primaryName.includes(normalizedValue) ||
      text.toLowerCase().includes(normalizedValue)
    );
  });

  if (!match) {
    const available = [...results].map(
      (r) => (r.getAttribute('aria-label') || r.textContent).split(',')[0].trim()
    );
    return {
      success: false,
      error: \`No result matching "\${value}". Found: \${available.join(', ')}\`,
    };
  }

  // Step 6: Click the matching result
  match.click();

  return { success: true, selectedValue: match.getAttribute('aria-label').split(',')[0].trim() };
}
\`\`\`

### 6.4 Utility Functions

\`\`\`javascript
/**
 * Wait for a single element to appear in the DOM.
 */
function waitForElement(selector, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Wait for multiple elements matching a selector.
 */
function waitForElements(selector, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const existing = document.querySelectorAll(selector);
    if (existing.length > 0) return resolve(existing);

    const observer = new MutationObserver(() => {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) {
        observer.disconnect();
        resolve(els);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelectorAll(selector));
    }, timeoutMs);
  });
}

/**
 * Simulate typing into an input field using real keyboard events.
 * PowerApps/React won't detect programmatic value changes (input.value = x).
 * This approach dispatches events that React's synthetic event system recognizes.
 */
async function simulateTyping(inputElement, text) {
  inputElement.focus();

  // Method 1: execCommand (works in most Chromium-based browsers)
  inputElement.select();
  document.execCommand('insertText', false, text);

  // If execCommand didn't work (deprecated in some contexts), fall back:
  if (inputElement.value !== text) {
    // Method 2: Use the native setter + React event dispatch
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    nativeSetter.call(inputElement, text);
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Allow the framework time to process the input and fire API calls
  await new Promise((resolve) => setTimeout(resolve, 300));
}
\`\`\`

---

## 7. Critical Implementation Notes

### 7.1 Typing Must Use Real Keyboard Events

PowerApps uses React under the hood. React doesn't respond to direct \`input.value = 'x'\` assignments because it uses a synthetic event system. You **must** trigger real input events.

**Recommended approach (in order of reliability):**

1. \`document.execCommand('insertText', false, text)\` -- fires proper InputEvent that React detects
2. Native setter + event dispatch (see simulateTyping above)
3. Chrome extension's \`chrome.debugger\` API with \`Input.dispatchKeyEvent\` -- most reliable but requires debugger permission

### 7.2 Fluent UI Options Render in a Portal

Choice dropdown options are **NOT children of the combobox button**. They render in a detached portal:

\`\`\`
<body>
  +-- <div id="shell-container">
  |     +-- ... (form content, combobox button is here)
  +-- <div class="fui-FluentProvider ...">
        +-- <div id="__fluentPortalMountNode" role="presentation">
              +-- <div role="listbox" id="fluent-listbox7">
                    +-- <div role="option">---</div>
                    +-- <div role="option">New</div>
                    +-- ...
\`\`\`

**Always query \`document.querySelectorAll('[role="option"]')\` from the document root**, not from within the field container.

### 7.3 Lookup Results Take Time

Lookup search hits a Dataverse API. Results typically appear in 500ms-2s. Use MutationObserver-based waiting (see utility functions) rather than fixed setTimeout.

### 7.4 aria-label Format on Lookup Results

Each lookup result \`<li role="treeitem">\` has an aria-label in this format:

\`\`\`
"PrimaryName, SecondaryDescription"
\`\`\`

Example: \`"Tier 1 - Strategic Launch, New product or major version release; full cross-functional GTM with external visibility."\`

**Match on the part before the first comma** for reliable results.

### 7.5 Only One Dropdown/Flyout at a Time

PowerApps only renders one dropdown/flyout at a time. If a lookup flyout is open and you click a choice dropdown, the lookup flyout closes. **Always close/complete one field before moving to the next.**

### 7.6 Session-Specific GUIDs in id Attributes

Element id attributes like \`id-6927649b-946e-4759-8c4f-ed77371c0134-1-shg_solutionfamily...\` contain a GUID that **changes between page loads**. Never use these in selectors. Always use \`data-id\` attributes which are stable.

---

## 8. Field Inventory from Inspected Form

### Project Entity (shg_project)

#### Lookup Fields

| Label | Schema Name | Notes |
|-------|-------------|-------|
| Solution Family | shg_solutionfamily | Has value "Government Solutions" |
| Product launch tier | shg_productlaunchtier | Empty, shows text input |
| Strategic Theme | shg_theme | Empty, shows text input |

#### Choice / Option-Set Fields

| Label | Schema Name | Current Value |
|-------|-------------|---------------|
| Initiative stage | shg_initiativestate | --- |
| Initiative status | shg_initiativestatus | --- |
| Planned Quarter | shg_plannedroadmapquarter | Q2 |
| Roadmap Approval | shg_roadmapapproval | Approved |
| Product Lifecycle Status | shg_productlifecyclestatus | --- |
| Initiative Type | shg_initiativetype | --- |

#### Text Fields

| Label | Schema Name |
|-------|-------------|
| Name | shg_name |
| Initiative ID | shg_initiativeid |
| Netsuite Code | shg_netsuitecode |
| Initiative Assigned To | shg_initiativeassignedto |
| Project Manager | shg_projectmanager |
| Product Lead | shg_productlead |
| Engineering Lead | shg_engineeringlead |
| Planned Year | shg_plannedyear |

---

## 9. Admin Config UI Changes

### Proposed New targetControlType Values

Replace the current complex types with three simple ones:

| Type | Description | Required Config |
|------|-------------|-----------------|
| text | Standard text input | fieldSchemaName |
| choice | Option-set / dropdown | fieldSchemaName |
| lookup | Lookup / relationship field | fieldSchemaName |

### Proposed Simplified Edit Mapping Form

\`\`\`
Label:                     [___________________]
Source CSS Selector (ADO):  [___________________]
Target Control Type:        [ text v ]           <-- dropdown: text, choice, lookup
Field Schema Name:          [___________________] <-- e.g., shg_solutionfamily
Transform Steps:            [+ Add Step]
\`\`\`

This eliminates the need for:
- Open Target Selector
- Open Strategy
- Options Container Selector
- Option Item Selector
- Option Label Selector

All of these are now **derived at runtime** from the field schema name using the deterministic data-id patterns documented above.
