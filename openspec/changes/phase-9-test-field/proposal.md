## Why

Phase 8 gave PMs a point-and-click picker to capture PA field schema names, but there is no way to verify that either side of a mapping is correctly configured before saving. Both the **ADO CSS selector** (raw DOM query against the ADO work item page) and the **PA field schema name** (derived to a `data-id`-based selector on the PA form) need live validation. This phase adds two independent "Test" buttons — one per field — so PMs can catch misconfigured mappings against the real pages before saving them.

## What Changes

- **New** `scripts/selector-tester.js` — injected on-demand into ADO or PA tabs; accepts `{ mode, ... }` and either derives the PA `data-id` selector from `fieldSchemaName` + `fieldType` (mode `"pa"`) or tests the raw CSS `adoSelector` directly (mode `"ado"`); highlights the found element with a green outline for 2 seconds; returns `{ found: true, tagName }` or `{ found: false }` / `{ found: false, error }`.
- **Modified** `background/service-worker.js` — adds `TEST_SELECTOR` handler (injects into PA tab, passes `mode: "pa"`) and `TEST_ADO_SELECTOR` handler (injects into ADO tab, passes `mode: "ado"`); both return result to side panel.
- **Modified** `sidepanel/app.js` — wires the "Test Field" button → `TEST_SELECTOR` (disabled when `pageType !== "pa"`); wires the new "Test ADO" button → `TEST_ADO_SELECTOR` (disabled when `pageType !== "ado"` or `adoSelector === "__URL_ID__"`); shows inline results below each respective input.
- **Modified** `sidepanel/index.html` — activates the stubbed "Test Field" button; adds the "Test ADO" button next to the ADO Selector input; adds both inline result display elements.

## Capabilities

### New Capabilities
- `test-field`: End-to-end field validation flow covering the `selector-tester.js` injection script (dual-mode: PA derivation + ADO raw), two background message handlers (`TEST_SELECTOR`, `TEST_ADO_SELECTOR`), and Admin tab UI feedback for both test buttons.

### Modified Capabilities
<!-- No existing spec-level requirements are changing — this is a net-new capability filling a stubbed placeholder. -->

## Impact

- **New file**: `scripts/selector-tester.js`
- **Modified**: `background/service-worker.js` (two new message cases)
- **Modified**: `sidepanel/app.js` (Test Field + Test ADO button logic, result state)
- **Modified**: `sidepanel/index.html` (activate stubbed button, add Test ADO button + two result elements)
- **Storage**: No schema changes
- **Permissions**: No new permissions required (`scripting` + `activeTab` already declared)
- **Message contracts**: Adds `TEST_SELECTOR` and `TEST_ADO_SELECTOR` request/response (documented in SPEC.md §5.1 v1.3)
