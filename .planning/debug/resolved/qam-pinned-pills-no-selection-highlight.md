---
status: diagnosed
trigger: "qam-pinned-pills-no-selection-highlight: In the Steam Quick Access Menu (QAM), the user sees the controller selection/focus highlight on the Bind current music to game ButtonItem, but sees NO visible controller selection/focus highlight when navigating across the pinned playlist pills strip in src/index.tsx."
created: 2026-11-14T23:23:16Z
updated: 2026-11-14T23:26:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

bug_class: Bohrbug
hypothesis: "Inline style overrides (background, border, color) on the pinned playlist <DialogButton> elements in src/index.tsx override SteamOS GamepadUI's native .DialogButton.gpfocus CSS rules, and no React focus-state highlight (like Focusable + onGamepadFocus/onFocus + focusHalo) is implemented as a replacement."
test: "Compare pinned playlist <DialogButton> props/styles (src/index.tsx:660-697) against working focusable controls in src/index.tsx (ButtonItem at 385-400, transport DialogButtons at 575-629), @decky/ui DialogButton.d.ts, InteractiveRow/RoundBtn (src/components/common/InteractiveRow.tsx), and commit 4e26edd."
expecting: "Pinned pills are the only DialogButton elements setting inline background/border/color without focus-state tracking."
next_action: "Return ROOT CAUSE FOUND diagnosis to caller (goal: find_root_cause_only)."

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: Navigating with D-pad across the pinned playlist pills in QAM shows a clear, visible controller focus/selection highlight on the focused pill (just like Bind current music to game).
actual: User reported: "Yes werkt ik zie alleen geen selection highlight op de playlists wel op de bind button"
errors: None reported
reproduction: Test 2 in UAT (Phase 09) — open QAM on Steam Deck / Steam Machine with pinned playlists and move D-pad focus onto the pinned playlist pills.
started: Discovered during UAT after Phase 09 Plan 01 edits to src/index.tsx.

## Eliminated
<!-- APPEND only - prevents re-investigating -->

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-14T23:24:00Z
  checked: src/index.tsx lines 382-402 and 570-702
  found: |
    1) `Bind current music to game` uses `<ButtonItem onClick={handleQuickBind}>` (lines 385-400), which renders Steam's native QAM list-row button with built-in focus highlight.
    2) Pinned playlist pills strip (lines 636-702) uses `<Focusable flow-children="horizontal" ...>` containing `<DialogButton key={pill.uri} onClick={() => handleQuickPlayPinned(pill)} style={{ ..., border: isActive ? "1px solid #1db954" : "1px solid rgba(255,255,255,0.12)", background: isActive ? "rgba(29, 185, 84, 0.16)" : "rgba(255, 255, 255, 0.08)", color: isActive ? "#1db954" : "#fff" }}>`.
    3) Unlike transport `DialogButton`s (lines 575-629) which do NOT set `background` or `border` inline (only `minWidth`, `padding`, `color`), the pinned playlist `DialogButton`s override `background` and `border` via inline `style`.
  implication: Inline `background` and `border` on `<DialogButton>` may override Steam GamepadUI's `.gpfocus` CSS rules (which rely on CSS `background-color` / `border` / `outline` specificity), OR `DialogButton` focus styling in QAM is suppressed/invisible when inline `background` is set without `onFocus`/`onBlur` or `.gpfocus` handling. Need to check how `DialogButton` and focus styles work elsewhere in Deckify and `@decky/ui`.

- timestamp: 2026-11-14T23:25:00Z
  checked: src/components/common/InteractiveRow.tsx, node_modules/@decky/ui/dist/components/Dialog.d.ts, and git show 4e26edd
  found: |
    1) Commit 4e26edd ("feat(09-01): reorganize QAM layout, fix Bind focus highlight, and extend QAM tests") fixed the exact same symptom on "Bind current music to game" by replacing its `<DialogButton>` (which had inline borderColor/background overrides) with `@decky/ui` `<ButtonItem>`.
    2) `@decky/ui` `DialogButton` (`DialogButtonSecondary`) renders a div/button that relies on SteamOS GamepadUI CSS `.gpfocus` rules for `background`, `border`, and `color` when focused. `DialogButtonProps` does not declare `onGamepadFocus`/`onGamepadBlur` or `focusClassName`.
    3) `src/components/common/InteractiveRow.tsx` (`InteractiveRow` and `RoundBtn`) establishes the codebase pattern for custom-styled pills/buttons: wrap in `<Focusable noFocusRing onFocus onBlur onGamepadFocus onGamepadBlur>` and apply explicit `focusHalo(focused)` (`boxShadow: "0 0 0 2px #fff, 0 0 12px rgba(29, 185, 84, 0.7)"`, `background` change, `transform: scale(...)`).
    4) Additionally, the pill strip container `<Focusable flow-children="horizontal" style={{ ..., overflowX: "auto", padding: "4px 0" }}>` (src/index.tsx:638-647) has 0px horizontal padding, which would clip a `boxShadow` / `scale` focus ring on the first/last pill if `padding: "4px 4px"` (or similar) is not provided.
  implication: Root cause confirmed (Bohrbug, single-cause in code with CSS specificity in SteamOS GamepadUI environment; AND-gate: no — inline style override on DialogButton alone is sufficient to suppress the native highlight).

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: "In src/index.tsx (lines 660-677), the pinned playlist pills use @decky/ui <DialogButton> with unconditional inline style overrides for `border`, `background`, and `color` (and no focus-state tracking). In SteamOS GamepadUI, DialogButton relies on CSS `.gpfocus` rules (`background`/`border`/`color`) to display controller focus; inline styles have higher CSS specificity and completely mask the native focus highlight, while the user can still D-pad navigate and click the pills. (This is the same mechanism that previously broke `Bind current music to game` before commit 4e26edd.)"
fix: ""
verification: ""
files_changed: ["src/index.tsx"]
