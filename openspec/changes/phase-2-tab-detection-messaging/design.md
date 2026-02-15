## Context

Phase 1 left `background/service-worker.js` as a single `console.log` stub. The side panel (also a stub) has no way to know what kind of page the user is viewing, so the Copy and Paste action buttons cannot be correctly enabled or disabled. Phase 2 wires up the service worker as the single source of truth for page-type state.

The Chrome MV3 service worker is ephemeral — it can terminate and restart between events. All state that must survive termination goes in `chrome.storage.*`. Page type, however, is always reconstructable from the current tab URL and doesn't need to be persisted: if the service worker restarts, the next tab event will repopulate the cache.

## Goals / Non-Goals

**Goals:**
- Implement `detectPageType(url)` against the exact URL patterns from SPEC.md §6.1.
- Cache the current page type in a module-level variable inside the service worker.
- Broadcast `TAB_CHANGED` to the side panel on every relevant tab change.
- Respond to `GET_PAGE_CONTEXT` pull requests from the side panel.
- Open the side panel on `chrome.action.onClicked`.

**Non-Goals:**
- Storage reads/writes (Phase 4).
- Side panel rendering or Alpine.js wiring (Phase 3).
- Any script injection (Phase 7+).
- Unit-testing the service worker against real Chrome APIs (manual verification only for this phase).

## Decisions

### D-1: Module-level variable for page-type cache

**Decision**: Cache the current page type in a `let currentPageType = "unsupported"` module-level variable in the service worker.

**Why**: Page type is derived from the active tab's URL — it's always reconstructable from an event and doesn't need to survive service worker termination. Using `chrome.storage` for it would add unnecessary async overhead on every tab event. A module-level variable is reset to `"unsupported"` on service worker restart, which is the correct safe default.

**Alternative considered**: Persist in `chrome.storage.session`. Rejected because page type is inherently transient — it's only meaningful when the extension is actively used, and reconstructing it from the first tab event after restart is both trivial and correct.

---

### D-2: `onUpdated` filter — `changeInfo.status === "complete"` OR `changeInfo.url`

**Decision**: In `chrome.tabs.onUpdated`, re-evaluate page type when `changeInfo.status === "complete"` OR `changeInfo.url` is defined (not waiting for both).

**Why**: `changeInfo.url` fires early in navigation (before the page is loaded) and is needed to detect SPAs that change the URL without a full page reload (ADO work item navigation is SPA-based). `changeInfo.status === "complete"` catches cases where the URL is the same but the page finishes loading. Using OR ensures both patterns are covered. The small risk of a double `TAB_CHANGED` broadcast is acceptable — the side panel is idempotent on repeated identical `pageType` values.

---

### D-3: Broadcast to all side panel contexts via `chrome.runtime.sendMessage`

**Decision**: Push `TAB_CHANGED` using `chrome.runtime.sendMessage` (not `chrome.tabs.sendMessage` or ports).

**Why**: The side panel is a privileged extension page registered via `chrome.runtime`, not a content script. `chrome.runtime.sendMessage` broadcasts to all extension pages. This matches the messaging model established in SPEC.md §5.3 and is consistent with how all other push messages in this extension will work. A persistent port (chrome.runtime.connect) would be more efficient for high-frequency updates but adds unnecessary complexity for this low-frequency use case.

---

### D-4: `chrome.action.onClicked` opens side panel via `chrome.sidePanel.open`

**Decision**: Open the side panel using `chrome.sidePanel.open({ windowId: tab.windowId })`.

**Why**: MV3 requires the side panel to be opened programmatically in response to a user gesture (like a browser action click). This is the only approved pattern in Chrome 114+. `chrome.sidePanel.setOptions` is not needed here since `default_path` is already set in `manifest.json`.

## Risks / Trade-offs

- **[Risk] Double TAB_CHANGED broadcast**: The OR condition on `onUpdated` may occasionally fire twice for a single navigation (once for URL change, once for status=complete). → **Mitigation**: Side panel updates `pageType` via assignment — applying the same value twice is a no-op. No visible effect to the user.

- **[Risk] Service worker termination during tab switch**: If the service worker terminates between `onActivated` and the side panel querying `GET_PAGE_CONTEXT`, the cache will be `"unsupported"`. → **Mitigation**: This is the correct safe default — buttons will be disabled until the next event repopulates the cache. Acceptable for this internal tool.

- **[Risk] `chrome.runtime.sendMessage` fails when side panel is not open**: If no side panel context is open to receive `TAB_CHANGED`, Chrome will throw a "Could not establish connection" error. → **Mitigation**: Wrap `chrome.runtime.sendMessage` in try/catch and swallow the no-receiver error silently (log to `console.error` for debugging only).
