// TODO Phase 2: implement tab detection and message routing

// This log confirms the service worker was registered and executed by Chrome.
// It is removed in Phase 11 (console hygiene pass).
console.log("SW started");

// Tell Chrome to open the side panel automatically whenever the action icon
// is clicked. This is the simplest way to wire up the panel without a full
// chrome.action.onClicked handler (which is added in Phase 2).
// We call it here at module scope so it runs every time the SW starts.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
