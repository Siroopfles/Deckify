---
status: diagnosed
trigger: "Investigate issue: progress-scrub-bar-not-draggable — ProgressScrubBar in NowPlayingTab is not draggable via pointer/touch in SteamOS GamepadUI / Steam Deck touchscreen or mouse."
created: 2026-11-22T20:53:26Z
updated: 2026-11-22T20:56:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: ProgressScrubBar cannot be dragged via pointer/touch in SteamOS GamepadUI because (1) pointer-drag handlers (onPointerDown/onPointerMove/onPointerUp/onPointerCancel) and touchAction are attached directly to @decky/ui's <Focusable> wrapper rather than a native <div> hit-target, (2) the hit target is only 12px tall inside an overflowY:auto scroll container (content-pane-focusable), and (3) handlePointerDown does not call e.preventDefault() and relies solely on element-scoped setPointerCapture instead of window-level move/up listeners.
test: Inspected NowPlayingTab.tsx, DeckifyExpandedModal.tsx, EqBandFaders.tsx, @decky/ui Focusable.js, and NowPlayingTab.test.tsx
expecting: Confirmed root cause across code and SteamOS GamepadUI CEF environment interaction
next_action: Return ROOT CAUSE FOUND diagnosis to caller (goal: find_root_cause_only)

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: ProgressScrubBar is draggable via pointer/touch and scrubbable via D-pad Left/Right when focused.
actual: User reported during live UAT on Steam Deck: "alleen de playbackbar niet sleepbaar is dat is het enige" (only the playback bar is not draggable, that's the only thing).
errors: None reported
reproduction: Test 2 in 24-UAT.md (dragging ProgressScrubBar in NowPlayingTab on Steam Deck / GamepadUI).
started: Discovered during Phase 24 UAT re-test after 24-06-PLAN.md.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: Main Body pointerEvents is "none" during NowPlayingTab playback
  evidence: DeckifyExpandedModal.tsx:1211 sets pointerEvents to "none" only when actionTrack || actionCollection is truthy; normal NowPlayingTab interactions and buttons work per UAT ("alleen de playbackbar niet sleepbaar is dat is het enige").
  timestamp: 2026-11-22T20:55:00Z

- hypothesis: usePlaybackClock overwrites dragPositionMs during drag
  evidence: NowPlayingTab.tsx:139 computes effectivePositionMs = dragPositionMs ?? currentPositionMs, so dragPositionMs takes precedence whenever non-null.
  timestamp: 2026-11-22T20:55:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-22T20:54:00Z
  checked: .planning/debug/knowledge-base.md
  found: File does not exist (no prior KB entries).
  implication: Proceed with fresh investigation.

- timestamp: 2026-11-22T20:54:15Z
  checked: src/components/tabs/NowPlayingTab.tsx:176-252 (ProgressScrubBar)
  found: onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick, and touchAction:"none" are all placed directly on @decky/ui's <Focusable> component with height:12 and padding:0. handlePointerDown does not call e.preventDefault() or e.stopPropagation(), relies on element-scoped setPointerCapture + onPointerMove/onPointerUp on <Focusable>, and onClick also calls commitSeek.
  implication: Multiple compounding pointer-drag issues in SteamOS GamepadUI CEF.

- timestamp: 2026-11-22T20:54:30Z
  checked: node_modules/@decky/ui/dist/components/Focusable.js and src/components/common/EqBandFaders.tsx:78-102
  found: @decky/ui Focusable is dynamically resolved from Steam's internal library.js via findModuleExport (not a native <div>); its prop forwarding and pointer/mouse/touch interception are controlled by Valve's GamepadUI component. By contrast, EqBandFaders.tsx (the only other draggable slider in Deckify) attaches onPointerDown/onPointerMove to a native <div role="slider"> with touchAction:"none".
  implication: Attaching pointer-drag lifecycle handlers directly to <Focusable> risks SteamUI intercepting or not forwarding pointer events/capture.

- timestamp: 2026-11-22T20:54:45Z
  checked: src/components/DeckifyExpandedModal.tsx:1230-1242
  found: NowPlayingTab is rendered inside <Focusable data-testid="content-pane-focusable" style={{ overflowY: "auto" }}>. ProgressScrubBar's 12px hit area is smaller than its 16-18px thumb (top: -2/-3) and sits inside a vertically scrollable container.
  implication: Touch/pointer drags on Steam Deck's 7" 800p screen easily miss the 12px strip or trigger scroll/pointercancel in CEF when preventDefault() and a native hit-target wrapper are missing.

- timestamp: 2026-11-22T20:55:25Z
  checked: src/components/tabs/NowPlayingTab.test.tsx:361-400 & vitest run
  found: All 7 tests pass, but NowPlayingTab.test.tsx mocks @decky/ui Focusable as a pass-through object and invokes bar.props.onPointerDown/Move/Up directly with a fake target, never exercising real Focusable or CEF pointer/touch behavior.
  implication: Unit tests gave false confidence that pointer drag works in SteamOS GamepadUI.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: ProgressScrubBar attaches pointer-drag handlers (onPointerDown/onPointerMove/onPointerUp/onPointerCancel) and touchAction:"none" directly onto @decky/ui's <Focusable> (Steam's internal FocusNavNode wrapper) with a 12px-tall hit target inside an overflowY:"auto" scroll container, without calling e.preventDefault() or using a native <div> hit-target with window-level pointermove/pointerup listeners. In SteamOS GamepadUI CEF, <Focusable> pointer/focus handling and/or touch-scroll gesture interception (12px target without preventDefault) prevents pointer-drag from tracking/committing seeks, while unit tests masked this by mocking Focusable and calling props directly.
fix:
verification:
files_changed: []
