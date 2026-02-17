# Error-Path Coverage Guidance

Drawn from the ADO to PowerApps Copypaster project (13 phases, 2026-02-14 → 2026-02-17).

The two most significant bugs in the project were both silent failures on error paths:
- **Phase 6**: `SAVE_SETTINGS` failure displayed a success banner (data silently not saved)
- **Phase 11**: `copy_failed` rows never showed their secondary error line (`readMessage` omitted)

Neither was caught by the unit tests that existed at the time. Both were caught by the review
pass or manual QA. Both were preventable.

---

## The core problem

When writing tasks and tests, it is natural to focus on the happy path: the input is valid,
the API call succeeds, the DOM element is found. Error paths get a single representative test
at best — "what if it fails?" — and the specifics are not enumerated.

This is the wrong default. Error paths need the same enumeration discipline as happy paths.

---

## Rule 1 — Enumerate, don't sample

When a function handles a fixed set of error cases, write one test per case — not one
"representative" test.

**Bad (Phase 6 pattern):**
```
Task: Test that validateImportData rejects missing required fields.
Test 1.5 — fieldSchemaName missing → invalid
Test 1.6 — label missing → invalid
// "The loop handles the rest the same way"
```

**Good:**
```
Task: Test that validateImportData rejects every required field when absent.
Test 1.5 — id missing → invalid
Test 1.6 — label missing → invalid
Test 1.7 — adoSelector missing → invalid
Test 1.8 — fieldSchemaName missing → invalid
Test 1.9 — fieldType missing → invalid
Test 1.10 — enabled missing → invalid
```

The tests prove the *array is complete*, not just that the loop fires. If a future refactor
accidentally removes a field from `REQUIRED_FIELDS`, test 1.7 fails — test 1.6 would not.

**Rule**: If the code under test iterates a fixed collection (a list of required fields, a
set of message types, a strategy registry), write one test per element in the collection.

---

## Rule 2 — Test both branches of every user-visible feedback path

Any code path that surfaces a message to the user has exactly two branches: success and
failure. Both must be tested.

**Bad (Phase 6 pattern):**
```js
// test: import succeeds → success banner shown
// (failure case not tested)

async function importMappings() {
  await saveSettings(newMappings);
  this.importMessage = { type: "success", text: "Mappings imported successfully." }; // ← always runs
}
```

**Good:**
```js
// test: import succeeds → success banner shown
// test: SAVE_SETTINGS fails → error banner shown, success banner NOT shown
// test: chrome.runtime.lastError during save → error banner shown

async function importMappings() {
  const saved = await saveSettings(newMappings);
  if (!saved) {
    this.importMessage = { type: "error", text: "Save failed." };
    return;
  }
  this.importMessage = { type: "success", text: "Mappings imported successfully." };
}
```

**Rule**: For every function that shows a success state, there must be at least one test
that exercises the failure branch and asserts the failure state is shown (and the success
state is NOT shown).

---

## Rule 3 — Two functions sharing a contract need shared tests

When two functions produce the same output shape from the same input shape, they will
eventually diverge. The only reliable guard is a shared test fixture that both functions
run against.

**The Phase 11 failure:**

`convertFieldResultsToCopiedData` (service worker) and `updateAfterCopy` (app.js) both
converted `FieldResult[]` → `CopiedFieldData[]`. They were implemented independently.
`convertFieldResultsToCopiedData` included `readMessage` for error outcomes.
`updateAfterCopy` did not. The omission was silent — no type errors, no test failures,
just a missing secondary line on `copy_failed` rows in the UI.

**The fix pattern:**

```js
// shared-contract.test.js
const FIXTURE_INPUTS = [
  { status: "success", value: "foo" },
  { status: "error",   value: null,  readMessage: "Element not found" },
  { status: "blank",   value: "",    readMessage: "Field was empty" },
];

const EXPECTED_CONTRACT = [
  { status: "copied",      copiedValue: "foo",  readMessage: undefined },
  { status: "copy_failed", copiedValue: null,   readMessage: "Element not found" },
  { status: "copy_failed", copiedValue: null,   readMessage: "Field was empty" },
];

test("convertFieldResultsToCopiedData matches contract", () => {
  expect(convertFieldResultsToCopiedData(FIXTURE_INPUTS)).toEqual(EXPECTED_CONTRACT);
});

test("updateAfterCopy in-memory version matches contract", () => {
  expect(buildCopiedDataFromResults(FIXTURE_INPUTS)).toEqual(EXPECTED_CONTRACT);
});
```

If `updateAfterCopy` forgets `readMessage`, the second test fails immediately.

**Rule**: If two functions share an output contract, define the contract as a named
fixture and run both functions against it in the same test file.

---

## Rule 4 — "Non-empty string" fields need an empty-string test

`== null` catches `null` and `undefined`. It does not catch `""`.

When a spec says a field is a "required non-empty string", the test suite needs three cases:

```js
test("rejects null label",      () => expect(validate({ label: null  })).toBe(false));
test("rejects undefined label", () => expect(validate({ label: undefined })).toBe(false));
test("rejects empty label",     () => expect(validate({ label: "" })).toBe(false));
test("accepts non-empty label", () => expect(validate({ label: "x" })).toBe(true));
```

And the implementation needs:
```js
if (value == null || value === "") return false;
```

**Rule**: Whenever a spec field is described as "non-empty string", add `=== ""` to the
validation guard and add an empty-string test case. These are separate from the null/undefined
checks.

---

## Rule 5 — Test the error content, not just the error presence

It is common to test that an error is shown but not what it says. The content matters.

**Weak:**
```js
test("shows error on copy failure", () => {
  expect(state.errorVisible).toBe(true);
});
```

**Strong:**
```js
test("shows error on copy failure", () => {
  expect(state.errorVisible).toBe(true);
  expect(state.errorText).toBe("Element not found"); // the actual message from the result
  expect(state.successVisible).toBe(false);          // success state is NOT shown
});
```

The weak version passes even if the error message is blank or the success banner is also
showing. The strong version catches the Phase 6 bug (success shown during failure) and the
Phase 11 bug (message text absent).

**Rule**: For every error state assertion, also assert:
1. The error *content* (message text, not just a boolean flag)
2. That the *success state is not simultaneously shown*

---

## Task-writing checklist

Before writing implementation tasks for any function that handles errors, answer these
questions. If the answer to any is "no", add the missing task.

- [ ] Have I listed every error *case* individually (not just "test error handling")?
- [ ] Does each user-visible feedback path have a test for both its success and failure branch?
- [ ] If two functions share a contract, is there a shared fixture that both run against?
- [ ] Are "non-empty string" fields tested for null, undefined, AND empty string?
- [ ] Do error state assertions also assert that the success state is NOT shown?
- [ ] Does the task breakdown enumerate all values in any fixed collection the code iterates?

---

## Quick reference

| Pattern | Test to add |
|---|---|
| Loop over `REQUIRED_FIELDS` array | One test per field in the array |
| User-visible success/failure feedback | Test both branches; assert success ≠ shown during failure |
| Two functions, same output contract | Shared fixture; both functions run against it |
| `non-empty string` spec field | Test null, undefined, and `""` separately |
| Error message display | Assert message *content*, not just that something is shown |
| Async operation with callback | Test the callback's error branch explicitly (`lastError` set, `response.success === false`) |
