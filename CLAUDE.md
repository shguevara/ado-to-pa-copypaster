# CLAUDE.md

Repository-level runtime map, guardrails, and execution boundaries for Claude Code.

This file defines:
- Architectural invariants
- Repo-specific constraints
- Autonomy boundaries
- Review & archive structure

It does NOT define workflow discipline (see DEVELOPER.md).
It does NOT redefine review mechanics (see REVIEWER.md).

---

# 1. Sources of Truth (Precedence Order)

When instructions conflict, follow this order:

1. Active OpenSpec change artifacts in `openspec/changes/<active-change>/`
2. `SPEC.md`
3. `DEVELOPER.md`
4. `REVIEWER.md`
5. `CLAUDE.md`

OpenSpec artifacts are more granular than `SPEC.md`.

If OpenSpec contradicts `SPEC.md`, stop and ask before proceeding.

---

# 2. Project Overview

`ado-to-pa-copypaster` is a Chrome Extension (Manifest V3).

Purpose:
Copy Initiative work item data from Azure DevOps into a PowerApps model-driven form.

Constraints:
- Chrome 114+
- Loaded as unpacked extension
- No build tooling
- No bundler output
- Alpine.js must be local (no CDN)
- The extension directory is the distributable

---

# 3. Architecture Snapshot

Chrome Browser
├── Side Panel UI → sidepanel/index.html + app.js (Alpine.js v3, local)
├── Background SW → background/service-worker.js
├── ADO reader → scripts/ado-reader.js (on-demand injection)
├── PA writer → scripts/pa-writer.js (on-demand injection)
├── Picker → scripts/element-picker.js (on-demand injection)
├── Selector tester → scripts/selector-tester.js (on-demand injection)
├── chrome.storage.local → AppSettings (mappings + overwriteMode)
└── chrome.storage.session → CopiedFieldData[] (clears on browser close)

Communication:
`chrome.runtime.sendMessage`

Injection:
`chrome.scripting.executeScript`

No persistent `content_scripts`.

---

# 4. Non-Negotiable Repo Guardrails

These invariants must never be violated:

### BR-003 — No Form Submission
`pa-writer.js` must NEVER:
- Call form.submit()
- Trigger submit events
- Click Save buttons

The extension must not submit forms.

### BR-002 — Per-Field Continue-on-Failure
Each field write must:
- Be isolated in try/catch
- Fail independently
- Never abort the entire write operation

### Additional Invariants
- No persistent content scripts
- No architectural drift from MV3 + injection model
- No build tooling
- No CDN dependencies
- No committed `node_modules`

---

# 5. Autonomy Boundaries

Claude may autonomously:
- Modify or create JS, HTML, CSS within existing structure
- Add or refactor unit tests
- Improve error handling while preserving invariants
- Refactor internal implementation without changing external behavior

Claude must ask before:
- Modifying `manifest.json` (especially permissions, host permissions, commands)
- Changing storage schema keys or their meaning
- Changing message names or payload contracts
- Changing injection model or extension architecture
- Adding any new dependency/library
- Modifying `SPEC.md`
- Introducing breaking behavior changes

Default:
Act autonomously unless a boundary is crossed.

---

# 6. Definition of Done (Repository-Level)

A task is complete only if:

- It satisfies the active OpenSpec acceptance criteria
- It respects all BR rules
- No new console errors are introduced in:
  - Sidepanel
  - Service worker
  - ADO page
  - PowerApps page
- No unintended permission changes occurred
- Storage schema remains unchanged unless explicitly approved

Completion does NOT imply archive approval.
See Review & Archive Gate.

---

# 7. High-Risk Areas

Extreme caution required when modifying:

- `manifest.json`
- Chrome permission declarations
- chrome.storage schema
- Message routing contracts
- Injection timing logic
- overwriteMode behavior
- Selector generation logic

These areas require explicit reasoning before change.

---

# 8. Environment Constraints (Windows + Git Bash)

Shell:
`/usr/bin/bash` (Git Bash), not PowerShell.

Rules:
- Use POSIX paths: `/c/Users/...`
- Never use backslashes in paths
- Do not use PowerShell syntax
- Do not assume branch `main` exists
- Verify branch before diffs

Correct pattern:
cd /c/path/to/repo && git status

Avoid:
git -C "C:\path"

---

# 9. Review & Archive Gate (Mandatory)

This repository enforces independent review.

The Developer does NOT self-archive.

Workflow:

1. Developer completes implementation per OpenSpec.
2. Developer commits and signals ready for review.
3. Reviewer (REVIEWER.md role) runs:
   - /opsx:verify
   - Diff analysis
   - SPEC alignment review
4. Reviewer writes `COMMENTS.md`.
5. Developer addresses 🔴 MUST FIX items.
6. Reviewer re-verifies.
7. Reviewer runs /opsx:archive to close the change.

A change is NOT complete until:
- Reviewer has no remaining 🔴 MUST FIX items
- Reviewer executes /opsx:archive

Self-verify + self-archive is forbidden.

---

# 10. Role Separation Model

Roles in this repository:

- ANALYST → requirements shaping
- ARCHITECT → SPEC authoring
- DEVELOPER → implementation
- REVIEWER → verification + archive gate

Responsibilities are strictly separated.

Do not collapse roles.

---

# 11. Architectural Stability Principle

Prefer:
- Minimal surface-area changes
- Deterministic behavior
- Explicit contracts
- Stable injection timing
- Clear separation of concerns

Avoid:
- Speculative refactors
- Premature optimizations
- Expanding scope beyond active OpenSpec change
- Architectural drift
