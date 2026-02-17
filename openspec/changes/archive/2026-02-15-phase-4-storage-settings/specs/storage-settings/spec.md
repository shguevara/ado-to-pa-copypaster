# Spec: storage-settings

AppSettings persistence layer — first-install seed, GET_SETTINGS, and SAVE_SETTINGS.

---

## ADDED Requirements

### Requirement: Default AppSettings seeded on first install

On `chrome.runtime.onInstalled` with `reason === "install"`, the background service
worker SHALL write the default `AppSettings` to `chrome.storage.local` under the key
`"settings"`. The default value MUST match SPEC.md §4.3 exactly:

```
mappings: [
  {
    id:          "default-title",
    label:       "Title",
    adoSelector: "input[aria-label='Title'], textarea[aria-label='Title']",
    paSelector:  "",
    fieldType:   "text",
    enabled:     true
  },
  {
    id:          "default-id",
    label:       "Initiative ID",
    adoSelector: "__URL_ID__",
    paSelector:  "",
    fieldType:   "text",
    enabled:     true
  }
]
overwriteMode: false
```

The write SHALL be skipped if the `"settings"` key already has a value in
`chrome.storage.local`. This prevents overwriting user-configured data on
extension updates or developer reloads.

#### Scenario: Clean install writes defaults to storage

- **WHEN** the extension is installed for the first time (`reason === "install"`)
- **AND** `chrome.storage.local` has no `"settings"` key
- **THEN** `chrome.storage.local` contains `"settings"` with `overwriteMode: false`
- **AND** `settings.mappings` has exactly 2 entries: `"default-title"` and `"default-id"`

#### Scenario: Extension update does not overwrite existing settings

- **WHEN** `chrome.runtime.onInstalled` fires with `reason === "update"`
- **AND** `chrome.storage.local` already has user-configured mappings under `"settings"`
- **THEN** `chrome.storage.local` is unchanged
- **AND** the user's mappings are preserved

#### Scenario: Developer reload does not overwrite existing settings

- **WHEN** the extension is reloaded from `chrome://extensions` (triggers `onInstalled`
  with `reason === "install"` or `"update"` depending on Chrome's behaviour)
- **AND** `chrome.storage.local` already has a `"settings"` value
- **THEN** `chrome.storage.local` is unchanged

---

### Requirement: GET_SETTINGS returns current AppSettings

The background service worker SHALL handle `{ action: "GET_SETTINGS" }` messages from
the side panel and respond with `{ settings: AppSettings }`. The value returned SHALL
be the `AppSettings` object stored under key `"settings"` in `chrome.storage.local`.
If storage contains no `"settings"` key, the response SHALL return the default
`AppSettings` object (same as the install-time defaults) rather than `null`.

#### Scenario: Settings exist in storage

- **WHEN** the side panel sends `{ action: "GET_SETTINGS" }`
- **AND** `chrome.storage.local` has a `"settings"` value
- **THEN** the service worker responds with `{ settings: <stored AppSettings> }`

#### Scenario: Storage is empty (e.g. before onInstalled completes on first load)

- **WHEN** the side panel sends `{ action: "GET_SETTINGS" }`
- **AND** `chrome.storage.local` has no `"settings"` key
- **THEN** the service worker responds with `{ settings: <DEFAULT_SETTINGS> }`
- **AND** `settings.mappings` contains the 2 default FieldMapping entries
- **AND** `settings.overwriteMode` is `false`

---

### Requirement: SAVE_SETTINGS persists AppSettings

The background service worker SHALL handle `{ action: "SAVE_SETTINGS", settings: AppSettings }`
messages from the side panel. The service worker SHALL write the provided `AppSettings`
object to `chrome.storage.local` under key `"settings"`, replacing any existing value.
On success it SHALL respond with `{ success: true }`. On storage failure it SHALL
respond with `{ success: false, error: <message string> }`.

#### Scenario: Successful settings save

- **WHEN** the side panel sends `{ action: "SAVE_SETTINGS", settings: <AppSettings> }`
- **THEN** `chrome.storage.local` contains the new `AppSettings` under key `"settings"`
- **AND** the service worker responds with `{ success: true }`

#### Scenario: Subsequent GET_SETTINGS returns the newly saved value

- **WHEN** `SAVE_SETTINGS` has been called with a custom `AppSettings`
- **AND** the side panel then sends `{ action: "GET_SETTINGS" }`
- **THEN** the response contains the same `AppSettings` that was written

#### Scenario: Storage write failure returns error response

- **WHEN** the side panel sends `{ action: "SAVE_SETTINGS", settings: <AppSettings> }`
- **AND** `chrome.storage.local.set` throws or rejects (e.g. quota exceeded)
- **THEN** the service worker responds with `{ success: false, error: <message> }`
- **AND** the error message is a non-empty string describing the failure
