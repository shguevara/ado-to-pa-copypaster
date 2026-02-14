// TODO Phase 8: implement generateSelector(el) — defines window.generateSelector (not an ES module)
// See SPEC.md §6.4 for the 7-level priority algorithm (id → data-id → data-field-name →
// name attr → aria-label → class combo → nth-child fallback).
// IMPORTANT: This file must NOT use "export" — it is injected as a classic script before
// element-picker.js and must define window.generateSelector on the global scope.
