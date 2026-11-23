---
status: diagnosed
trigger: "24-UAT Test 1 (G-24-4): Nee kan niet want ik kan hem niet focussen of selecteren met de controller. waardoor ik hem niet kan slepen"
created: 2026-11-23T18:43:00Z
updated: 2026-11-23T18:43:00Z
---

## Current Focus

hypothesis: `@decky/ui`'s `<Focusable>` in SteamOS GamepadUI only becomes focusable by the controller's `FocusNavController` when `onActivate` (or `onOKButton`) is provided on `<Focusable>`. Because `ProgressScrubBar` in `src/components/tabs/NowPlayingTab.tsx` omitted `onActivate` on `<Focusable>`, SteamOS treats it as a non-focusable container and skips it during D-pad navigation.
test: Compare `ProgressScrubBar` (`src/components/tabs/NowPlayingTab.tsx:316-326`) against `RoundBtn` and `InteractiveRow` (`src/components/common/InteractiveRow.tsx:58-66, 113-138`).
expecting: `RoundBtn` and `InteractiveRow` both pass `onActivate={onClick}` on `<Focusable>`, whereas `ProgressScrubBar` passes neither `onActivate` nor `onOKButton`.
next_action: Plan and execute gap-closure plan 24-08 to add `onActivate` (controller selection / scrub mode toggle), `onCancelButton`, `onOKActionDescription`, and `return true` in `handleGamepadDirection` on `ProgressScrubBar`'s `<Focusable>`.

## Symptoms

expected: User can navigate with D-pad Up from the `NowPlayingTab` transport row to focus and select `ProgressScrubBar` with the controller, then scrub backward/forward with D-pad Left/Right (and drag via pointer/touch).
actual: User cannot focus or select `ProgressScrubBar` with the controller at all ("ik kan hem niet focussen of selecteren met de controller. waardoor ik hem niet kan slepen").
errors: None in console; controller spatial focus skips `ProgressScrubBar`.
reproduction: Open Deckify Expanded Modal -> Now Playing tab -> try to move controller focus onto the playback scrub bar above the transport row.
started: Phase 24 (`24-06` / `24-07`) when `ProgressScrubBar` was extracted with a raw `<Focusable>` lacking `onActivate`.

## Eliminated

- hypothesis: `ProgressScrubBar` is not rendered when a track is playing.
  evidence: `track?.duration_ms && track.duration_ms > 0` renders `ProgressScrubBar` visibly above the transport row.

## Evidence

- timestamp: 2026-11-23T18:42:30Z
  checked: `src/components/common/InteractiveRow.tsx:58-66, 113-138` and `node_modules/@decky/ui/dist/components/Focusable.d.ts`
  found: Every working controller-focusable element in Deckify (`RoundBtn`, `InteractiveRow`, `VolumeBar`) passes `onActivate` to `<Focusable>`. In SteamOS GamepadUI's `FocusNavNode`, a `<Focusable>` without `onActivate` or `onOKButton` is treated as a layout container rather than a focusable leaf node.
  implication: Adding `onActivate` (which toggles `isScrubbing` controller scrub selection) and returning `true` from `handleGamepadDirection` on `DIR_LEFT`/`DIR_RIGHT` makes `ProgressScrubBar` focusable, selectable, and scrubbable with the controller while preserving the inner native `<div role="slider">` pointer/touch drag hit-target.

## Resolution

root_cause: `ProgressScrubBar` in `src/components/tabs/NowPlayingTab.tsx` renders `<Focusable>` without an `onActivate` (or `onOKButton`) handler, causing SteamOS GamepadUI's `FocusNavController` to treat it as a non-focusable container and skip it during D-pad controller navigation. Additionally, `handleGamepadDirection` did not return `true` to consume `DIR_LEFT`/`DIR_RIGHT` events in GamepadUI.
fix: Pass `onActivate` (toggling `isScrubbing` controller selection state), `onCancelButton` (exiting `isScrubbing` when active), `onOKActionDescription`, and `data-deckify-focused` to `ProgressScrubBar`'s `<Focusable>`, and return `true` from `handleGamepadDirection` on `DIR_LEFT`/`DIR_RIGHT`.
verification: Unit tests in `src/components/tabs/NowPlayingTab.test.tsx`.
files_changed:
  - src/components/tabs/NowPlayingTab.tsx
  - src/components/tabs/NowPlayingTab.test.tsx
