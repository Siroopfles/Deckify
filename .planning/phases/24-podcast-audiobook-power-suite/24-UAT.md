---
status: diagnosed
phase: 24-podcast-audiobook-power-suite
source: [24-VERIFICATION.md]
started: 2026-11-23T17:57:30Z
updated: 2026-11-23T18:43:00Z
---

## Current Test

[testing complete]

## Tests

### 1. SteamOS GamepadUI Touchscreen / Mouse Drag on ProgressScrubBar (Re-test G-24-3)
expected: Drag the ProgressScrubBar in NowPlayingTab via touchscreen or mouse pointer on Steam Deck during music and podcast playback, and scrub Left/Right via D-pad when focused. The progress bar tracks finger/cursor smoothly without scroll-hijacking or focus capture blockage from @decky/ui Focusable, commits a single seek on release without duplicate synthetic click seeks, and still steps Left/Right with D-pad when focused.
result: issue
reported: "Nee kan niet want ik kan hem niet focussen of selecteren met de controller. waardoor ik hem niet kan slepen"
severity: major

## Summary

total: 1
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-24-4
  truth: "ProgressScrubBar in NowPlayingTab can be focused and selected with the Steam Deck controller (D-pad Up from transport row / A button) and scrubbed Left/Right with D-pad (as well as pointer/touch drag)"
  status: failed
  reason: "User reported: Nee kan niet want ik kan hem niet focussen of selecteren met de controller. waardoor ik hem niet kan slepen"
  severity: major
  test: 1
  root_cause: "In SteamOS GamepadUI (@decky/ui), a <Focusable> component is only registered as a focusable leaf node in Valve's FocusNavController when onActivate (or onOKButton) is provided on <Focusable>. In ProgressScrubBar (src/components/tabs/NowPlayingTab.tsx:316-326), <Focusable> has no onActivate or onOKButton prop (unlike RoundBtn and InteractiveRow which pass onActivate={onClick}), so SteamOS spatial navigation treats ProgressScrubBar as a non-focusable container with 0 focusable children and completely skips it when pressing D-pad Up from the transport row. Additionally, handleGamepadDirection did not return true or support A-button select/scrub toggle (onActivate / onCancelButton)."
  artifacts:
    - path: "src/components/tabs/NowPlayingTab.tsx"
      issue: "ProgressScrubBar <Focusable> is missing onActivate (and onCancelButton / onOKActionDescription) so SteamOS FocusNavController never focuses it with the controller, and handleGamepadDirection does not return true to consume DIR_LEFT/DIR_RIGHT."
    - path: "src/components/tabs/NowPlayingTab.test.tsx"
      issue: "Unit tests do not assert that ProgressScrubBar's <Focusable> defines onActivate (required for SteamOS controller focus/selection) and returns true from onGamepadDirection on DIR_LEFT/DIR_RIGHT."
  missing:
    - "Pass onActivate (toggling active controller scrub/selection state isScrubbing) and onCancelButton (exiting active scrub state when isScrubbing is true) plus data-deckify-focused and onOKActionDescription to ProgressScrubBar's <Focusable> so SteamOS FocusNavController can focus and select it with the controller."
    - "Return true from handleGamepadDirection on DIR_LEFT/DIR_RIGHT (alongside e.preventDefault() and e.stopPropagation()) so SteamOS spatial navigation does not jump focus to the left Sidebar while scrubbing."
    - "Update NowPlayingTab.test.tsx to verify ProgressScrubBar <Focusable> has onActivate, toggles controller scrub selection, and returns true from onGamepadDirection for DIR_LEFT/DIR_RIGHT."
  debug_session: .planning/debug/progress-scrub-bar-not-focusable.md
