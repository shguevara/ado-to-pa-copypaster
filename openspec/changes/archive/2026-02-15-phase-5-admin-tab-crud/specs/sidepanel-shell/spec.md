## ADDED Requirements

### Requirement: AppSettings loaded from storage on Alpine init

`app.js` SHALL send `{ action: "GET_SETTINGS" }` via `chrome.runtime.sendMessage` inside
the `alpine:init` callback, immediately after the `GET_PAGE_CONTEXT` call. On response,
`$store.app.settings` SHALL be set to `response.settings`. This ensures the Admin tab
mapping list is populated from the first frame without a flash of empty state.

If the response is missing or the service worker is unavailable, `$store.app.settings`
SHALL remain `null` (the initial default).

#### Scenario: settings populated before first render
- **WHEN** the side panel finishes loading with existing mappings in storage
- **THEN** `$store.app.settings` is non-null and contains the stored `AppSettings`
  before any user interaction occurs

#### Scenario: settings remains null if service worker unavailable
- **WHEN** `GET_SETTINGS` response is missing (e.g. service worker not yet running)
- **THEN** `$store.app.settings` remains `null` and no error is thrown
