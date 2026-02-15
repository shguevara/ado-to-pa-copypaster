## Context

No source files exist in the repository yet. The specification (`SPEC.md` v1.0) is approved and defines the full file structure (§10), the exact `manifest.json` contents (§3.4), and the Chrome MV3 permission set. Phase 1's only goal is to stand up the skeleton that Chrome can load — no logic is implemented.

The extension will be distributed as an **unpacked extension** loaded via Developer Mode, so there is no build step, no CI publish gate, and no bundler. The directory itself is the distributable.

## Goals / Non-Goals

**Goals:**
- Produce a directory that Chrome 114+ accepts as a valid MV3 extension (no load errors).
- Create every file path that later phases will fill in, so those phases can `git diff` cleanly without renaming/moving files.
- Establish the Alpine.js v3 local dependency so the CSP-safe import is already wired up.
- Provide a minimal stub for `sidepanel/index.html` that references `lib/alpine.min.js` in a `<script defer>` tag (non-module, satisfying MV3 CSP).

**Non-Goals:**
- Any runtime functionality (tab detection, storage, copy/paste logic).
- Pixel-perfect icons — placeholder PNGs of the correct dimensions are sufficient.
- Vitest or `package.json` setup — that belongs to the first phase that introduces testable logic.

## Decisions

### 1. Alpine.js as a local file, not a CDN import

**Decision**: Download `alpine.min.js` from the Alpine.js v3 GitHub releases and commit it to `lib/`.

**Why**: Chrome MV3's default Content Security Policy blocks scripts loaded from external origins unless a `content_security_policy` override is added to `manifest.json`. Shipping Alpine locally avoids the CSP override, keeps the extension self-contained, and removes a runtime network dependency. The file is ~40 KB minified — acceptable for a local team tool.

**Alternative considered**: Use an `importmap` or ES module CDN import → rejected because injected content scripts cannot use importmaps, and keeping one pattern (classic scripts) across all files is simpler for less-experienced maintainers.

### 2. Placeholder icon PNGs via programmatic generation, not design assets

**Decision**: Generate minimal valid PNG files (solid color squares) at the three required sizes (16×16, 48×48, 128×128) using a small Node.js or Python one-liner, or source them from a free icon set.

**Why**: Chrome requires the `action.default_icon` and `icons` keys to reference real PNG files that exist on disk; referencing non-existent paths causes a load error. The actual icon artwork can be replaced in a later polish phase without touching any other file.

**Alternative considered**: SVG icons → rejected because `manifest.json` icon fields require PNG/BMP/WebP in most Chrome versions; SVG is not guaranteed to render correctly in the extensions page.

### 3. Stub source files as empty (or minimal comment) placeholders

**Decision**: Create all source files listed in SPEC.md §10 with either empty content or a single-line comment (`// Phase N — to be implemented`).

**Why**: Establishing the full file tree now means every subsequent phase is purely additive (`git add -p` shows only logical changes). It also ensures no phase accidentally creates a file at a wrong path that later has to be moved.

**Alternative considered**: Create only the files strictly required for Chrome to load (`manifest.json`, `background/service-worker.js`, `sidepanel/index.html`) → rejected because it would cause out-of-order file creation across phases and make diffs harder to review.

### 4. `sidepanel/index.html` loads Alpine.js with `defer`, not `type="module"`

**Decision**: Use `<script defer src="../lib/alpine.min.js"></script>` followed by `<script defer src="app.js"></script>` in `index.html`.

**Why**: Alpine.js v3's minified build is a classic (IIFE) script, not an ES module. Loading it as `type="module"` would change its scoping and break `Alpine.store` and `Alpine.data` registrations that `app.js` depends on. Using `defer` (not `async`) guarantees that `alpine.min.js` initialises before `app.js` runs, and that both run after the DOM is parsed — exactly what Alpine's documentation requires. MV3 CSP allows inline scripts only if a `content_security_policy` override is declared; using external file references keeps CSP at its default.

### 5. No `package.json` in Phase 1

**Decision**: Do not create `package.json`, `vitest.config.js`, or any dev-tooling files in this phase.

**Why**: The spec (§9) ties unit tests to `lib/selector-generator.js` and import-validation logic, neither of which exists yet. Introducing a `package.json` now would either be empty (confusing) or pre-declare dependencies not yet needed. It will be added in the first phase that requires Vitest (Phase 8 or whichever introduces `generateSelector`).

## Risks / Trade-offs

- **Icon placeholder confusion** → If a contributor loads the extension and sees a blank or generic icon, they may assume something is broken. Mitigation: add a comment in `manifest.json` and a note in the commit message that icons are placeholders.

- **Alpine.js version lock** → Committing a specific `alpine.min.js` file means the version is locked until someone manually updates it. Mitigation: record the exact version and source URL in a comment at the top of `lib/alpine.min.js` or in `CLAUDE.md` so it is easy to update when needed.

- **Stub files masking missing implementations** → Empty placeholder files will not cause Chrome load errors, but they could mask the fact that a phase's implementation was forgotten. Mitigation: each stub file begins with `// TODO Phase N: implement <description>` so it is visually obvious during review.
