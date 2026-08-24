// MV3 service worker: the only job is opening the side panel when the
// toolbar icon is clicked (chrome.sidePanel has no declarative
// "default_popup"-style equivalent for this -- it has to be set here).
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[ScanA11y] setPanelBehavior failed:", err));
