---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
plan: 02
subsystem: ui
tags: [typescript, react, vitest, steam-deck, gamepad-chords, silent-banner]

# Dependency graph
requires:
  - phase: 20-01
    provides: bannerBus (emitBanner, subscribeBanner), SilentBanner, notifyMessage, resetModuleRuntimeState, and validated silent_banner_enabled / gamepad_chord_bindings schema
provides:
  - Pure gamepad chord schema, button normalization (28->27), Valve reserved/duplicate validator, and 4s guideHeld ChordMatcher in src/chords.ts
  - Module-level recording suppression flag (setChordRecordingActive, isChordRecordingActive) for Settings UI capture
  - Wired 8-action configurable quick-chord runtime in src/index.tsx with D-10 modal/recording gates, D-11 unified silent/toaster routing, D-12 pinned wrap cycling, D-13 optimistic Like rollback, D-14 persistent Lyrics HUD toggle, and dismount cleanup
affects: [20-03-settings-chord-ui, phase-20-uat]

# Actuals (#2632)
actuals:
  tokens: 37472
  tasks: 2
  commits: 2

commits: 2
plan_head_before: 4fee4d01d113ee51d622c85832bbebafd7682617
plan_head_after: 61d72752f5e81df581a8756252e3570337e1b73e

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure TypeScript chord state machine in src/chords.ts with zero React/@decky/* runtime imports and injectable getNow clock"
    - "Longest-matching super-chord priority with subset disarming and dual 4000ms timer + lazy timestamp guideHeld expiry"
    - "Single-default Rollup entry invariant in src/index.tsx preserved by keeping all chord runtime helpers module-internal"

key-files:
  created:
    - src/chords.ts
    - src/chords.test.ts
  modified:
    - src/index.tsx
    - src/index.test.tsx

key-decisions:
  - "Normalized GAMEPAD_BUTTON.STEAM_QUICK_MENU (28) to CANONICAL_GUIDE_ID (27) and corrected default play_pause to GAMEPAD_BUTTON.OK (1) while preserving legacy guide IDs 13/14 inside GUIDE_BUTTON_IDS for backward compatibility"
  - "Extracted handleMatcherButtonDown/Up and forceExpireMatcherGuide in src/chords.ts and safeRpc / handleTrackMetadataNotification in src/index.tsx to satisfy ESLint complexity, max-lines-per-function, and no-useless-assignment checks with zero warnings on new files"
  - "Kept executeChordAction, handleLikeChord, handlePinnedCycleChord, handleToggleLyricsChord, handleVolumeChord, syncRuntimeStatus, resetModuleRuntimeState, and getInputSource module-internal inside src/index.tsx so @decky/rollup single-default export mode builds cleanly"

patterns-established:
  - "Chord action handlers synchronize module caches across startup get_status, settings_changed, librespot_event, QAM controls, and pre-dedup track_metadata re-emits while guarding optimistic rollbacks with monotonic sequence tokens"

requirements-completed:
  - CHORD-01

coverage:
  - id: D1
    description: "Pure chord schema (GAMEPAD_BUTTON 0..28, 8 ordered CHORD_ACTIONS, D-08 DEFAULT_CHORD_BINDINGS), button normalization (28->27), and human-readable label/chip formatting"
    requirement: "CHORD-01"
    verification:
      - kind: unit
        ref: "src/chords.test.ts#chords schema and defaults"
        status: pass
      - kind: unit
        ref: "src/chords.test.ts#normalizeChord and button formatting"
        status: pass
    human_judgment: false
  - id: D2
    description: "Chord validation rejecting Valve reserved combos (STEAM/QAM + X/L1/R1 across IDs 27, 28, 13, 14), duplicates across actions, and >4 buttons while permitting 1-4 custom buttons and same-action re-save"
    requirement: "CHORD-01"
    verification:
      - kind: unit
        ref: "src/chords.test.ts#validateChordBinding"
        status: pass
    human_judgment: false
  - id: D3
    description: "Stateful ChordMatcher with last-button-down single-fire idempotency, release re-arming, longest-subset priority, 4000ms timer + timestamp guideHeld expiry, and suppression/dispose lifecycle"
    requirement: "CHORD-01"
    verification:
      - kind: unit
        ref: "src/chords.test.ts#createChordMatcher core matching"
        status: pass
      - kind: unit
        ref: "src/chords.test.ts#createChordMatcher longest-subset priority"
        status: pass
      - kind: unit
        ref: "src/chords.test.ts#createChordMatcher guideHeld expiry"
        status: pass
      - kind: unit
        ref: "src/chords.test.ts#createChordMatcher suppression and lifecycle"
        status: pass
    human_judgment: false
  - id: D4
    description: "In-game 8-action quick-chord wiring in src/index.tsx with D-10 modal/recording suppression, QAM active retention, D-11 silent/toaster routing, D-12 pinned wrap cycling, D-13 optimistic Like rollback + track_metadata sync, D-14 persistent Lyrics HUD toggle, and dismount handle unregistration"
    requirement: "CHORD-01"
    verification:
      - kind: integration
        ref: "src/index.test.tsx#Phase 20: Configurable Quick-Chords & Silent Confirmations (CHORD-01)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Physical Steam Deck controller hardware button index parity (FocusNavController source[0] STEAM=27, QAM=28, A=1, L4..R5=23..26) and OS-level STEAM/QAM reserved chord interception during live gameplay"
    requirement: "CHORD-01"
    verification: []
    human_judgment: true
    rationale: "Vitest unit and integration tests exercise verified @decky/ui FooterLegend button indices and mocked FocusNavController input sources, while real SteamOS Gamescope button emission and system shortcut interception require physical Steam Deck hardware UAT."

# Metrics
duration: 17 min
completed: 2026-11-21
status: complete
---

# Phase 20 Plan 02: Pure Quick-Chord Matcher & In-Game Action Wiring Summary

**Pure 1–4 button `ChordMatcher` with Valve-reserved/duplicate validation and 4s `guideHeld` expiry (`src/chords.ts`), wired across all 8 in-game controller actions in `src/index.tsx` with modal/recording isolation, optimistic Like rollback, Pinned Playlist cycling, and Lyrics HUD persistence.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-11-21T11:32:20Z
- **Completed:** 2026-11-21T11:49:28Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Built dependency-free `src/chords.ts` defining verified `@decky/ui` `GAMEPAD_BUTTON` constants (`0..28`, `OK=1`, `SECONDARY=3`, `BUMPER_LEFT=5`, `BUMPER_RIGHT=6`, `REAR_LEFT_UPPER=23`..`REAR_RIGHT_LOWER=26`, `STEAM_GUIDE=27`, `STEAM_QUICK_MENU=28`), 8 ordered `CHORD_ACTIONS`, `DEFAULT_CHORD_BINDINGS` (5 legacy defaults + 3 unbound new actions), `normalizeChord`, `isValveReservedChord`, `validateChordBinding`, `formatButtonName`, `formatChordChips`, `setChordRecordingActive`/`isChordRecordingActive`, and `createChordMatcher` with longest-subset priority, single-fire idempotency, release re-arming, and dual `4000ms` timer + lazy timestamp `guideHeld` expiry.
- Replaced the hardcoded inline `guideHeld` listener in `src/index.tsx` with `setupChordListener()` backed by `createChordMatcher`, `bigOpen` modal suppression, `isChordRecordingActive()` capture suppression, live `settings_changed` / `librespot_event` / startup `get_status()` cache synchronization, early `track_metadata` `cachedIsLiked` sync before dedup, full `Down`/`Up` unregister + timer cleanup in `onDismount()`, and `resetModuleRuntimeState()` across mount and unmount.
- Implemented all 8 chord action handlers routed uniformly through `notifyMessage()` (`SilentBanner` when `silent_banner_enabled` is true even if `toast_enabled` is false; `toaster.toast` fallback when `silent_banner_enabled` is false), including monotonic sequence-guarded optimistic `toggle_like` rollback, modulo `1..4` `cycle_pinned` wrapping + rollback, and persistent `toggle_lyrics` (`overlay_lyrics_enabled`) across both `{ ok: false }` and rejected RPC promises.
- Added 7 TDD unit tests in `src/chords.test.ts` and 7 integration tests in `src/index.test.tsx`, passing all 34 targeted tests (240/240 across all 19 Vitest files), `tsc --noEmit`, `eslint --max-warnings=0` on `src/chords.ts` / `src/chords.test.ts`, repo-wide `pnpm run lint` (0 errors), and `rollup -c` production bundling.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED -> GREEN): Build pure `src/chords.ts` schema, validator, and 4s `guideHeld` `ChordMatcher` with TDD tests** - `2e67a5a` (feat)
2. **Task 2: Wire `ChordMatcher`, modal/recording guards, and extended Like/Pinned/Lyrics actions into `src/index.tsx` and `src/index.test.tsx`** - `61d7275` (feat)

### TDD RED -> GREEN Cycle Evidence (Task 1)
- **RED:** Created compiling minimal stub exports in `src/chords.ts` and the 7-test suite in `src/chords.test.ts`; verified `tsc --noEmit` and `eslint --max-warnings=0 src/chords.ts src/chords.test.ts` passed with 0 errors/warnings. Ran `pnpm exec vitest run --reporter=junit --outputFile=.tdd-red-report.tmp.xml src/chords.test.ts` (`exit_code: 1`, 7/7 tests failed on `AssertionError`), and validated via `gsd-tools.cjs check tdd-red-evidence` -> **`RED_EVIDENCE_OK`** (`reason: target_test_failed`).
- **Semantic RED Assessment:** All 7 tests in `src/chords.test.ts` executed cleanly against compiling stubs (zero syntax, module-load, or fixture errors) and failed strictly on planned behavioral assertions (`expected -1 to be +0`, `expected [] to deeply equal [ 11, 27 ]`, `expected false to be true`, `expected null to be 'toggle_like'`).
- **Hook Accommodation (Option B):** Attempting the separate failing RED commit without `--no-verify` failed in `.husky/pre-commit` (`pnpm test` runs the entire `vitest run` suite whenever `src/` files are staged, blocking intentionally failing RED tests). Per orchestrator-authorized Option B (keeping `.husky/pre-commit` active without `--no-verify` since `workflow.tdd_mode` is unset), proceeded directly to GREEN and committed `src/chords.ts` + `src/chords.test.ts` together in `2e67a5a` after full pre-commit verification.
- **GREEN & Refactor:** Implemented `src/chords.ts`, extracted `handleMatcherButtonDown` / `handleMatcherButtonUp` / `forceExpireMatcherGuide` to satisfy `eslint --max-warnings=0`, and verified 7/7 tests in `src/chords.test.ts` + 233/233 full suite + Rollup build pass cleanly.

## Files Created/Modified
- `src/chords.ts` - Created pure gamepad button map (`GAMEPAD_BUTTON`), `CHORD_ACTIONS`, `DEFAULT_CHORD_BINDINGS`, `normalizeChord`, `isValveReservedChord`, `validateChordBinding`, `formatButtonName`, `formatChordChips`, recording suppression state, and `createChordMatcher`.
- `src/chords.test.ts` - Created 7 Vitest unit tests covering defaults, normalization, Valve reserved & duplicate validation, last-button-down single-fire, longest-subset priority, 4s timer/timestamp `guideHeld` expiry, and suppression/reset/dispose lifecycle.
- `src/index.tsx` - Replaced legacy `guideHeld` block with `setupChordListener()`, added modular chord handlers (`executeChordAction`, `handleLikeChord`, `handlePinnedCycleChord`, `handleToggleLyricsChord`, `handleVolumeChord`, `safeRpc`), synchronized caches across mount/status/events/`track_metadata`, and added full dismount cleanup.
- `src/index.test.tsx` - Added `mockControlPlayback`, `mockSetVolume`, `mockToggleLike` mocks and 7 `CHORD-01` integration tests covering all 8 actions, silent/toaster routing, optimistic Like/Pinned/Lyrics error & rejected-promise rollbacks, 4s expiry, modal/recording gating, live `settings_changed`, and dismount listener unregistration.

## Decisions Made
- Normalized `GAMEPAD_BUTTON.STEAM_QUICK_MENU` (`28`) to `CANONICAL_GUIDE_ID` (`27`) and aligned `DEFAULT_CHORD_BINDINGS.play_pause` with `@decky/ui` `GAMEPAD_BUTTON.OK` (`1`) while retaining legacy `13`/`14` compatibility inside `GUIDE_BUTTON_IDS`.
- Kept all new runtime helpers in `src/index.tsx` module-internal (`export default definePlugin(...)` only) to satisfy `@decky/rollup`'s `output.exports: "default"` constraint.
- Extracted `safeRpc` and `handleTrackMetadataNotification` in `src/index.tsx` to eliminate ESLint 10 `no-useless-assignment` errors and keep cyclomatic complexity cleanly bounded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Combined Task 1 RED and GREEN into a single pre-commit-verified commit (`2e67a5a`) per orchestrator Option B**
- **Found during:** Task 1 (TDD RED commit attempt)
- **Issue:** `.husky/pre-commit` runs `pnpm test` (`vitest run` across all frontend suites) whenever any `src/` file is staged, rejecting an intentionally failing RED commit while `--no-verify` is prohibited.
- **Fix:** Verified `RED_EVIDENCE_OK` (`7/7` intentional `AssertionError`s via `gsd-tools.cjs check tdd-red-evidence`), obtained orchestrator authorization for Option B (keeping `.husky/pre-commit` enforced), and proceeded to GREEN implementation + atomic Task 1 commit `2e67a5a`.
- **Files modified:** `src/chords.ts`, `src/chords.test.ts`
- **Verification:** `pnpm test -- --run src/chords.test.ts` (`7/7` passed), `pnpm run typecheck`, `pnpm exec eslint --max-warnings=0 src/chords.ts src/chords.test.ts`, and `.husky/pre-commit` (`233/233` Vitest tests + `rollup -c`) all passed.
- **Committed in:** `2e67a5a` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking hook constraint)
**Impact on plan:** Strict TDD RED -> GREEN sequence was executed and machine-verified via `tdd-red-evidence` prior to GREEN edits while keeping repository pre-commit hooks 100% intact.

## Issues Encountered
- ESLint `max-lines-per-function` (80 lines) initially flagged `createChordMatcher` (89 lines) and `src/chords.test.ts` single `describe` wrapper (235 lines); split `src/chords.test.ts` into focused `describe` blocks and extracted `handleMatcherButtonDown`/`Up` + `forceExpireMatcherGuide` in `src/chords.ts` for zero warnings.
- ESLint 10 `no-useless-assignment` flagged redundant `let res = null; try { res = ... } catch { res = null; }` in `src/index.tsx` chord handlers; replaced with shared `safeRpc()` helper.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `src/chords.ts` (`CHORD_ACTIONS`, `DEFAULT_CHORD_BINDINGS`, `validateChordBinding`, `formatChordChips`, `setChordRecordingActive`, `GAMEPAD_BUTTON`) and `src/index.tsx` live `settings_changed` binding synchronization are ready for Plan `20-03` (`ChordBindingsCard.tsx` and `SettingsTab.tsx`).
- Physical Steam Deck controller hardware UAT (`D5` in `coverage:`) remains deferred to end-of-phase hardware verification.

## Self-Check: PASSED

- Verified all 4 created/modified files exist on disk (`src/chords.ts`, `src/chords.test.ts`, `src/index.tsx`, `src/index.test.tsx`).
- Verified both task commits (`2e67a5a`, `61d7275`) are ancestors of `HEAD`.
- Verified post-commit runs of `pnpm test -- --run src/chords.test.ts src/index.test.tsx` (34/34 passed), `pnpm run typecheck` (0 errors), `pnpm exec eslint --max-warnings=0 src/chords.ts src/chords.test.ts` (0 errors, 0 warnings), `pnpm run lint` (0 errors), and `pnpm run build` (clean `dist/` bundle) all pass after final edits.

---
*Phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords*
*Completed: 2026-11-21*
