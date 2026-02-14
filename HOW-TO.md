# HOW-TO: Developer / Reviewer Workflow from Scratch

This guide picks up **after `SPEC.md` has been produced by the Architect**. It walks through every step needed to install tooling, initialise the repository, and run the Developer → Reviewer cycle to completion.

---

## What Should Already Exist

Before following this guide, your project directory must contain:

```
SPEC.md          ← the approved specification (source of truth)
CLAUDE.md        ← project context for Claude Code
DEVELOPER.md     ← developer persona system prompt
REVIEWER.md      ← reviewer persona system prompt
ANALYST.md       ← (reference only, not needed for dev cycle)
ARCHITECT.md     ← (reference only, not needed for dev cycle)
```

---

## Prerequisites

Install these tools before starting:

| Tool | Purpose | Install |
|---|---|---|
| [Claude Code](https://claude.ai/code) | AI coding agent CLI | `npm install -g @anthropic-ai/claude-code` |
| [OpenSpec](https://openspec.dev) | Change artifact manager | `npm install -g openspec` |
| [Git](https://git-scm.com) | Version control | OS package manager |
| [Node.js](https://nodejs.org) (v18+) | Required by Claude Code and OpenSpec | [nodejs.org](https://nodejs.org) |

Verify everything is available:

```bash
claude --version
openspec --version
git --version
node --version
```

---

## Part 1 — One-Time Project Setup

Do this once at the start of the project.

---

### Step 1 — Initialise OpenSpec

In your project directory, run:

```bash
openspec init
```

This command will:
1. Ask you to select your AI assistant (choose **Claude Code**)
2. Generate the boilerplate folder structure and config files:

```
openspec/
├── changes/
│   └── archive/
├── specs/
└── config.yaml
```

---

### Step 2 — Configure `openspec/config.yaml`

`openspec init` generates a starter `config.yaml`. Open it and fill in the `context:` block — this is injected into every OpenSpec artifact, so the richer it is, the better the generated proposals and task lists will be.

```yaml
schema: spec-driven

context: |
  ## Project
  <one-line description of what the project does>
  Full spec: SPEC.md (approved). Implementation plan: SPEC.md §11.

  ## Tech Stack
  <list your languages, frameworks, build approach>

  ## File Structure
  <key files and their purpose>

  ## Key Data Types
  <your core types / data shapes>

  ## Critical Business Rules
  <the rules that must never be violated — reference SPEC.md sections>

  ## Conventions
  <naming, commenting style, testing approach, etc.>

rules:
  all:
    - Read SPEC.md in full before creating any artifact.
  proposal:
    - Scope to one implementation phase from SPEC.md at a time.
    - Reference the phase number and goal in the proposal title.
  tasks:
    - Each task must have a clear, independently verifiable done condition.
    - Reference the relevant SPEC.md section in each task description.
```

> **Tip**: The richer you make `context:`, the better OpenSpec's generated artifacts will be. Copy the key facts from `SPEC.md` — tech stack, data types, business rules.

---

### Step 3 — Initialise Git

```bash
git init
git add .
git commit -m "Initial commit: specification, workflow files, and openspec config"
```

Your `main` branch now holds the approved baseline. All implementation work will happen on feature branches.

---

## Part 2 — The Development Cycle

Repeat Steps 4–9 for **each phase** of your `SPEC.md` implementation plan. A complete project typically has 10–12 phases.

---

### Step 4 — Create a Change for the Next Phase

Run this in **any Claude Code session** (no persona needed):

```
/opsx:new
```

When prompted, scope the change to **one phase** from `SPEC.md §11`. Give it a clear title that references the phase, e.g.:

> *"Phase 1 — Project Scaffold: loadable extension skeleton"*

OpenSpec will guide you through creating the change artifacts:
1. **Proposal** — what will be built and why
2. **Spec** — detailed requirements for this increment
3. **Tasks** — ordered, verifiable implementation steps

When done, a new directory appears under `openspec/changes/`. Commit it:

```bash
git add openspec/changes/
git commit -m "chore: add OpenSpec change for Phase 1"
```

---

### Step 5 — Create a Feature Branch

Before the developer starts work, create a branch for this phase:

```bash
git checkout -b phase-1-scaffold
```

Use a consistent naming convention: `phase-<n>-<short-description>`.

---

### Step 6 — Start the Developer Persona

Open a **new Claude Code session** with the developer system prompt:

```bash
claude --system-prompt-file DEVELOPER.md
```

#### First command (every developer session):

```
/opsx:apply
```

This loads the task list from the OpenSpec change and presents the ordered steps. The developer agent will:

1. Read `SPEC.md` in full
2. Check `COMMENTS.md` for any outstanding reviewer feedback
3. Work through tasks one at a time, committing after each

> **The developer does not run `/opsx:verify` or `/opsx:archive`.** Those belong to the Reviewer. If the agent tries to run them, stop it.

#### What the developer does for each task:

```
a. Confirm the task against SPEC.md
b. Write a failing test (TDD) — or justify why TDD is impractical
c. Implement the code
d. Run tests — all must pass before committing
e. Commit with a clear message explaining what and why
f. Move to the next task
```

---

### Step 7 — Signal Completion

When all tasks are done and all tests pass, the developer signals readiness for review. There is no special command — simply tell the reviewer (or note in your team channel) that the branch is ready:

```
Branch phase-1-scaffold is ready for review.
```

> The developer's last action is a clean commit with all tests green. Nothing else.

---

### Step 8 — Start the Reviewer Persona

Open a **new Claude Code session** with the reviewer system prompt:

```bash
claude --system-prompt-file REVIEWER.md
```

Make sure you are on (or can see) the feature branch:

```bash
git checkout phase-1-scaffold
```

#### First command (every reviewer session):

```
/opsx:verify
```

This checks the implementation against the OpenSpec change artifacts and surfaces any gaps. The output becomes the `## OpenSpec Verify` section of `COMMENTS.md`.

#### The reviewer then:

1. Reads the change artifacts in `openspec/changes/<change-dir>/`
2. Reads `SPEC.md` to cross-check correctness
3. Runs `git diff main...HEAD` to analyse what changed
4. Writes `COMMENTS.md` with findings classified by severity:
   - 🔴 **MUST FIX** — bugs, spec violations, broken business rules — blocks archive
   - 🟡 **SHOULD FIX** — code smells, weak tests — strong recommendation
   - 🟢 **NICE TO HAVE** — optional style/docs improvements
   - ⚪ **OUT OF SCOPE** — valid but belongs in a future change, not a blocker

---

### Step 9 — Developer / Reviewer Feedback Loop

If `COMMENTS.md` contains 🔴 items:

1. **Developer** re-opens their session (`claude --system-prompt-file DEVELOPER.md`) and addresses every 🔴 item, committing each fix.
2. **Reviewer** re-opens their session (`claude --system-prompt-file REVIEWER.md`), re-reads the updated diff, and confirms each fix is adequate.
3. Repeat until no 🔴 items remain.

🟡 and 🟢 items do not block the cycle — the developer may address them at their discretion.

---

### Step 10 — Archive and Merge

Once all 🔴 items are resolved, the **reviewer** (not the developer) runs:

```
/opsx:archive
```

This closes the change and moves its artifacts to `openspec/changes/archive/`. Then merge the feature branch:

```bash
git checkout main
git merge phase-1-scaffold
git push origin main         # if using a remote
git branch -d phase-1-scaffold
```

Commit the archive:

```bash
git add openspec/changes/archive/
git commit -m "chore: archive Phase 1 change after review sign-off"
```

---

### Step 11 — Repeat for the Next Phase

Go back to **Step 4** and create a change for the next phase. Continue until all phases in `SPEC.md §11` are complete.

---

## Quick Reference

### Commands by Role

| When | Who | Command |
|---|---|---|
| Before dev starts | Anyone | `/opsx:new` — create change for next phase |
| Start of dev session | Developer | `/opsx:apply` — load task list |
| Start of review session | Reviewer | `/opsx:verify` — check against change artifacts |
| After all 🔴 fixed | Reviewer | `/opsx:archive` — close the change |

### Session Startup

```bash
# Developer
claude --system-prompt-file DEVELOPER.md

# Reviewer
claude --system-prompt-file REVIEWER.md
```

### Cycle at a Glance

```
/opsx:new  (scoped to one SPEC.md phase)
    ↓
git checkout -b phase-N-<name>
    ↓
Developer:  claude --system-prompt-file DEVELOPER.md  →  /opsx:apply  →  implement  →  commit
    ↓
Reviewer:   claude --system-prompt-file REVIEWER.md   →  /opsx:verify  →  COMMENTS.md
    ↓
[loop: developer fixes 🔴 items → reviewer re-checks]
    ↓
Reviewer:   /opsx:archive
    ↓
git merge phase-N-<name> → main
    ↓
Repeat for next phase
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `/opsx:new` not recognised | OpenSpec not initialised — run `openspec init` in the project directory first |
| Developer runs `/opsx:archive` by mistake | Only the reviewer should run this. Retrieve the archived change from `openspec/changes/archive/` and restore it to `openspec/changes/` to resume the cycle |
| Reviewer flags an item as 🔴 but it's a future phase | Move it to ⚪ OUT OF SCOPE in `COMMENTS.md` — it should not block the current archive |
| Tests fail before commit | Never commit with failing tests. Fix the test or the implementation before signalling done |
| `COMMENTS.md` has no 🔴 items but verify failed | Treat verify failures as 🔴 — they represent gaps between the agreed spec and the implementation |
