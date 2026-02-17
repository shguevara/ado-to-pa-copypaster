# ADO to PowerApps Copypaster

A Chrome extension that transfers Initiative work item data from **Azure DevOps** into a **PowerApps model-driven form** in two clicks — no manual field-by-field copy-paste.

---

## Who this is for

Project Managers and Product Managers who regularly move Initiative data between Azure DevOps (ADO) work items and PowerApps forms.

---

## What it does

1. **Copy** — Open an ADO Initiative work item. Click **Copy** in the side panel. The extension reads the configured fields from the page.
2. **Paste** — Open the corresponding PowerApps form. Click **Paste**. The extension fills each mapped field automatically.

Every field shows a live status badge so you can see exactly what was copied, what was pasted, and anything that was skipped or failed.

---

## Installation

This extension is distributed as an **unpacked extension** (Developer Mode). It is not on the Chrome Web Store.

1. Download or clone this repository to your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the root folder of this repository (the one containing `manifest.json`).
6. The extension icon appears in your Chrome toolbar.

> The extension will show a warning that it can "read your browsing history". This is required for it to detect whether you are on an ADO or PowerApps page. No browsing data is collected or sent anywhere.

---

## Opening the side panel

Click the **ADO to PA Copypaster** icon in your Chrome toolbar. The side panel opens on the right side of the browser and stays open as you switch tabs.

The side panel has two tabs:
- **User** — your daily-use interface (Copy and Paste)
- **Admin** — configure field mappings

---

## First-time setup: configure mappings (Admin tab)

Before you can copy anything, you need to tell the extension which ADO fields map to which PowerApps fields.

1. Click the **Admin** tab in the side panel.
2. Two default mappings are pre-loaded (Title and Initiative ID). Edit or delete them as needed.
3. To add a new mapping, click **Add Mapping** and fill in the form:

| Field | What to enter |
|---|---|
| **Label** | A friendly name for this field (e.g. "Project Owner") |
| **ADO CSS Selector** | The CSS selector for the field on the ADO work item page (see [Finding ADO selectors](#finding-ado-selectors)) |
| **PA Field Schema Name** | The schema name of the PowerApps field (see [Finding PA field schema names](#finding-pa-field-schema-names)) |
| **Field Type** | `text`, `lookup`, or `choice` — must match the PA field type |
| **Enabled** | Tick to include this field in Copy/Paste operations |

4. Click **Save**.

Repeat for each field you want to transfer.

### Field types

| Type | Use for |
|---|---|
| `text` | Plain text and number inputs |
| `lookup` | Lookup fields (searches and selects a related record) |
| `choice` | Dropdown / option set fields |

---

## Finding ADO selectors

The extension includes a built-in ADO selector tester.

1. Go to an ADO Initiative work item page.
2. Open the **Admin** tab → edit a mapping → find the **ADO CSS Selector** field.
3. Type or paste a CSS selector, then click **Test ADO** to verify it matches the field on the current page.

If you need to identify a selector manually:
1. Right-click the ADO field value on the page → **Inspect**.
2. Look for a stable attribute such as `data-*` or a class that uniquely identifies the element.
3. Construct a CSS selector from that attribute and test it.

---

## Finding PA field schema names

### Option A — Element Picker (recommended)

1. Go to the PowerApps form you want to paste into.
2. Open the **Admin** tab → edit a mapping → click **Pick Element**.
3. The extension enters picker mode — your cursor turns into a crosshair.
4. Click the PowerApps field. The schema name is captured automatically.

### Option B — Test Field (manual)

1. Go to the PowerApps form.
2. Open the **Admin** tab → edit a mapping → enter a schema name manually.
3. Click **Test** next to the PA Schema Name field to verify the extension can find and interact with it.

---

## Daily use: Copy → Paste

### Step 1 — Copy from ADO

1. Navigate to an **Azure DevOps Initiative** work item page.
2. The side panel context banner turns **blue** — "Azure DevOps".
3. Click the **Copy** button.
4. Each field row updates with a status badge:

| Badge | Meaning |
|---|---|
| `NOT COPIED` | Field not yet copied (before Copy is clicked) |
| `COPIED` | Value read successfully — the value is shown below the label |
| `FAILED` | Could not read this field — error reason shown |

### Step 2 — Paste into PowerApps

1. Open the **PowerApps form** you want to fill.
2. The side panel context banner turns **purple** — "PowerApps".
3. Click the **Paste** button.
4. Each field row updates:

| Badge | Meaning |
|---|---|
| `PASTED` | Value written to the PA field successfully |
| `SKIPPED` | Field was skipped (e.g. overwrite mode is off and field already has a value) |
| `FAILED` | Could not write to this field — error reason shown |

Each field is attempted independently — a failure on one field does not stop the others.

> **The extension never submits or saves the PowerApps form.** After pasting, review the values and save the record yourself.

### Step 3 — Clear (start over)

Click **Clear** to reset all field states back to `NOT COPIED` and discard the copied session data. Use this before starting a new Initiative transfer.

---

## Overwrite Mode

Overwrite Mode controls what happens when a PowerApps field already has a value.

| Setting | Behaviour |
|---|---|
| **Off** (default) | Fields that already have a value are **skipped** — existing data is preserved |
| **On** | Existing field values are **overwritten** with the ADO data |

To toggle: **Admin tab** → **Overwrite Mode** switch.

---

## Export and Import mappings

If you want to share your mapping configuration with a colleague or back it up:

- **Export** (Admin tab → **Export**): downloads all mappings as a `mappings.json` file.
- **Import** (Admin tab → **Import**): loads mappings from a `mappings.json` file, **replacing** all existing mappings.

> Import replaces everything. Export a backup first if you want to keep your current mappings.

---

## Tips

- Keep the side panel open as you switch between the ADO tab and the PA tab — it stays in sync automatically.
- If the context banner shows **"This page is not supported"**, the extension does not recognise the current page as ADO or PA. Navigate to the correct page.
- If a field consistently fails to copy or paste, use the **Test ADO** / **Test** buttons in the Admin tab to verify the selector or schema name is still valid. ADO pages occasionally change their DOM structure.
- Copied data is stored for the current browser session only. It is cleared when you close Chrome.

---

## Supported pages

| Page type | Supported URLs |
|---|---|
| Azure DevOps | `dev.azure.com/*`, `*.visualstudio.com/*` |
| PowerApps | `*.powerapps.com/*`, `*.dynamics.com/*` |

---

## Privacy

All data stays in your browser. No information is sent to any server. Copied field values are stored in Chrome's session storage and are automatically deleted when you close the browser.
