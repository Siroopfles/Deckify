---
status: diagnosed
trigger: "Investigate issue: lyrics-xy-shortcuts-footer-mismatch — X and Y controller shortcuts and bottom action bar labels in Lyrics mode are inconsistent and behave as documented"
created: 2026-11-22T19:45:30Z
updated: 2026-11-22T19:46:15Z
---

## Current Focus

bug_class: Bohrbug
hypothesis: In DeckifyExpandedModal.tsx, Phase 23-04 intercepted X and Y in onAction for mode === "lyrics" to nudge lyrics sync offset (-500ms / +500ms), but left hintText grouping mode === "lyrics" with mode === "now_playing" ("L2/R2 Seek · X Like · Y Options · L1/R1 Tabs") and left unreachable modeRef.current === "lyrics" checks in the fallback X/Y branches.
test: Inspected onAction handler (lines 987-1036), hintText computation (lines 1087-1094), controller-hint-bar render (lines 1402-1420), and DeckifyExpandedModal.test.tsx (lines 545-581).
expecting: Confirmed mismatch between onAction behavior and hintText label in lyrics mode.
next_action: Return ROOT CAUSE FOUND diagnosis to caller (goal: find_root_cause_only).

## Symptoms

expected: X and Y controller shortcuts and bottom action bar labels in Lyrics mode are consistent and behave as documented
actual: User reported: Alleen wat bedoel je met sneltoetsen X en Y ik zie ze namelijk in de onderste bar staan als like en options maar als ik ze indruk doen ze andere dingen
errors: None reported
reproduction: Test 12 in UAT (open DeckifyExpandedModal, switch to Lyrics tab, observe bottom bar labels vs pressing X/Y)
started: Discovered during UAT (Phase 23)

## Eliminated

## Evidence

- timestamp: 2026-11-22T19:45:45Z
  checked: src/components/DeckifyExpandedModal.tsx lines 987-1036 (useGamepad / onAction)
  found: Lines 993-998 intercept `modeRef.current === "lyrics" && (action === "X" || action === "Y")` and call `handleNudgeOffset(action === "X" ? -500 : 500)`. Lines 1002 and 1022 in the `else if (action === "Y")` and `else if (action === "X")` branches still contain `modeRef.current === "lyrics"` in `isActiveTrackMode`, which is unreachable because lines 993-998 already matched.
  implication: Pressing X in Lyrics mode nudges lyrics offset -0.5s and pressing Y nudges +0.5s, instead of Like and Options.

- timestamp: 2026-11-22T19:45:45Z
  checked: src/components/DeckifyExpandedModal.tsx lines 1086-1094 and 1402-1420 (hintText and controller-hint-bar)
  found: `hintText` groups `mode === "now_playing" || mode === "lyrics"` together and returns `"L2/R2 Seek · X Like · Y Options · L1/R1 Tabs"`, which is rendered verbatim in `[data-testid="controller-hint-bar"]`.
  implication: The bottom controller hint bar tells the user X is Like and Y is Options while in Lyrics mode, directly contradicting the actual X/Y nudge actions.

- timestamp: 2026-11-22T19:46:05Z
  checked: src/components/DeckifyExpandedModal.test.tsx lines 545-581
  found: The `controller-hint-bar` unit test checks `now_playing`, `playlists`, `engine`, and `show_controller_hints: false`, but does not test `mode === "lyrics"`.
  implication: The stale `hintText` for `lyrics` mode was not caught by automated tests during Phase 23-04.

## Resolution

root_cause: In `src/components/DeckifyExpandedModal.tsx`, Phase 23-04 added an early branch in `onAction` (lines 993-998) that intercepts `X` and `Y` when `modeRef.current === "lyrics"` to call `handleNudgeOffset(-500)` / `handleNudgeOffset(500)`, but `hintText` (lines 1087-1094) still groups `mode === "lyrics"` with `mode === "now_playing"` and displays `"L2/R2 Seek · X Like · Y Options · L1/R1 Tabs"` in `controller-hint-bar` (lines 1402-1420). Additionally, lines 1002 and 1022 still reference `modeRef.current === "lyrics"` in `isActiveTrackMode` as dead/unreachable code.
fix:
verification:
files_changed: []
