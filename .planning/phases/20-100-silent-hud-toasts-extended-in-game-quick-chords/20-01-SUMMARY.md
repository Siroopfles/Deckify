---
phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords
plan: 01
subsystem: ui
tags: [react, typescript, python, steam-deck, hud, silent-banner, gamepad-chords, settings]

# Dependency graph
requires:
  - phase: 10-in-game-overlay-2-0
    provides: DeckifyOverlayWrapper and discrete HUD visibility/modal suppression gating
  - phase: 19-per-game-eq-volume-profiles
    provides: SteamOS UI-SPEC tokens and atomic settings persistence conventions
provides:
  - Module-level pub/sub bannerBus (emitBanner, subscribeBanner, resetBannerBusForTests)
  - Non-interactive 3.5s fixed corner SilentBanner component with 140px HUD collision clearance
  - Always-mounted DeckifyOverlayWrapper hosting SilentBanner outside overlay_enabled/modalOpen gates
  - Unified silent track_metadata and notifyMessage routing bypassing Steam toaster.toast chime
  - Synchronized TypeScript and Python settings schema, validation, deep-copy defaults, and RPC persistence for silent_banner_enabled and gamepad_chord_bindings
affects: [20-02-quick-chords, 20-03-settings-chord-ui, phase-20-uat]

# Actuals (#2632)
actuals:
  tokens: 63592
  tasks: 3
  commits: 3

commits: 3
plan_head_before: 2c0a7c9eeb375b80c547cc2c27136c0f044c4bf5
plan_head_after: ef6d543f9ffc0d1cf744e384df1c4ac25eb6e5be

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level pub/sub bannerBus with monotonic id latest-wins dismissal in SilentBanner"
    - "Single-default Rollup entry invariant in src/index.tsx (all named runtime helpers kept module-internal)"
    - "ASVS V5 chord binding normalization (28->27, bool exclusion, 0..28 bounds, Valve reserved block, cross-action uniqueness) and copy.deepcopy defaults in py_modules/common.py"

key-files:
  created:
    - src/bannerBus.ts
    - src/components/SilentBanner.tsx
    - src/components/SilentBanner.test.tsx
    - tests/test_chord_settings.py
  modified:
    - src/types.ts
    - src/index.tsx
    - src/index.test.tsx
    - py_modules/common.py
    - main.py

key-decisions:
  - "Keep notifyMessage, resetModuleRuntimeState, and syncNotificationSettings module-internal inside src/index.tsx and route legacy inline chord toasts through notifyMessage so @decky/rollup's output.exports='default' constraint passes cleanly without exporting non-default symbols"
  - "Combine banner payload and fade state into one atomic ActiveBannerState object keyed by monotonic banner id to avoid two-pass state transitions and stale timer races"
  - "Apply copy.deepcopy(default_settings) in both _load_settings merge and fallback paths so nested defaults (gamepad_chord_bindings, eq_custom_bands, pinned_playlists) never alias shared module dicts"

patterns-established:
  - "SilentBanner renders strictly non-interactive React text nodes (pointerEvents: 'none', zIndex: 10000, zero Focusable/tabIndex) with synchronous cached-only cover art lookup"
  - "DeckifyOverlayWrapper stays mounted in a Fragment outside overlay_enabled and modalOpen gates while track_metadata independently enforces toast_enabled !== false"

requirements-completed:
  - TOAST-01
  - CHORD-01

coverage:
  - id: D1
    description: "Module-level bannerBus pub/sub and non-interactive SilentBanner 3.5s fixed corner component with 140px HUD collision offset, latest-wins replacement, 4-corner underscore normalization, and Steam CEF CSP cover safety"
    requirement: "TOAST-01"
    verification:
      - kind: unit
        ref: "src/components/SilentBanner.test.tsx#SilentBanner and bannerBus"
        status: pass
    human_judgment: false
  - id: D2
    description: "Always-mounted DeckifyOverlayWrapper fragment rendering SilentBanner outside overlay_enabled/modalOpen gates and silent track_metadata routing without Steam toaster.toast chime"
    requirement: "TOAST-01"
    verification:
      - kind: integration
        ref: "src/index.test.tsx#always mounts SilentBanner even when overlay_enabled is false while omitting Overlay (TOAST-01, D-01, D-05)"
        status: pass
      - kind: integration
        ref: "src/index.test.tsx#emits silent banner on track_metadata without awaiting get_image or calling toaster.toast when toast_sound_enabled is false (TOAST-01, D-04)"
        status: pass
      - kind: integration
        ref: "src/index.test.tsx#keeps SilentBanner mounted for D-11 chord confirmations when toast_enabled is false while suppressing track_metadata notifications (D-01, D-11)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Synchronized TypeScript and Python settings schema, validation, deep-copy defaults, disk recovery, and Decky RPC persistence for silent_banner_enabled and gamepad_chord_bindings"
    requirement: "CHORD-01"
    verification:
      - kind: unit
        ref: "tests/test_chord_settings.py#TestChordSettings"
        status: pass
      - kind: integration
        ref: "tests/test_features.py#DeckifyFeatureTests"
        status: pass
      - kind: integration
        ref: "tests/test_pinned_playlists.py#TestPinnedPlaylists"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live visual layering over active Vulkan/Gamescope game windows and audible silence of Steam's toast pipeline on physical Steam Deck hardware"
    requirement: "TOAST-01"
    verification: []
    human_judgment: true
    rationale: "Vitest unit and integration tests verify SilentBanner CSS positioning, timer lifecycle, and non-invocation of toaster.toast, while live Gamescope compositor layering and Steam Deck audio silence require on-device UAT."

# Metrics
duration: 12 min
completed: 2026-11-21
status: complete
---

# Phase 20 Plan 01: 100% Silent HUD Toasts & Extended In-Game Quick-Chords Summary

**Silent 3.5s `SilentBanner` track-change HUD tracer slice via `bannerBus` plus synchronized TypeScript/Python validation and persistence for `silent_banner_enabled` and `gamepad_chord_bindings`.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-21T11:16:20Z
- **Completed:** 2026-11-21T11:28:52Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Implemented dependency-free `src/bannerBus.ts` (`emitBanner`, `subscribeBanner`, `resetBannerBusForTests`) and non-interactive fixed corner `src/components/SilentBanner.tsx` (`zIndex: 10000`, `pointerEvents: "none"`, `3250ms` fade / `3500ms` dismiss, latest-wins id replacement, 4-corner underscore normalization, `140px` HUD collision offset, and synchronous `data:`/`127.0.0.1` cover CSP filtering).
- Kept `DeckifyOverlayWrapper` in `src/index.tsx` always mounted via React Fragment outside `overlay_enabled`/`modalOpen` gates, routed silent `track_metadata` notifications to `emitBanner` without calling `toaster.toast` or awaiting `get_image`, preserved `toast_sound_enabled: true` chime + 48x48 cover art behavior, and added `resetModuleRuntimeState()` and `notifyMessage()`.
- Added comprehensive Vitest coverage in `src/components/SilentBanner.test.tsx` (11 tests) and `src/index.test.tsx` (20 tests passing), plus backend validation/sanitization and deep-copy disk persistence for `silent_banner_enabled` and `gamepad_chord_bindings` in `py_modules/common.py`, `main.py`, and `tests/test_chord_settings.py` (7 tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end Silent Track-Change Banner tracer slice** - `fb891c0` (feat)
2. **Task 2: Comprehensive SilentBanner unit, fake-timer, positioning, and CSP safety tests** - `cf71429` (test)
3. **Task 3: Persist and validate silent_banner_enabled and gamepad_chord_bindings in Python backend** - `ef6d543` (feat)

## Files Created/Modified
- `src/types.ts` - Exported `ChordActionId`, `ChordBindingsMap`, `silent_banner_enabled`, and `gamepad_chord_bindings` on `EngineSettings`.
- `src/bannerBus.ts` - Created module-level pub/sub bus (`emitBanner`, `subscribeBanner`, `resetBannerBusForTests`) with zero React/`@decky/*` imports.
- `src/components/SilentBanner.tsx` - Created non-blocking 3.5s fixed corner banner component (`BANNER_DURATION_MS = 3500`, `BANNER_FADE_START_MS = 3250`, `HUD_CLEARANCE_OFFSET_PX = 140`).
- `src/components/SilentBanner.test.tsx` - Added 11 Vitest tests covering fake-timer auto-dismiss, latest-wins replacement, 4-corner/140px HUD offset, tones, CSP cover safety, and unmount cleanup.
- `src/index.tsx` - Always-mounted `DeckifyOverlayWrapper` hosting `<SilentBanner>`, unified `notifyMessage()` and silent `track_metadata` routing, and `resetModuleRuntimeState()`.
- `src/index.test.tsx` - Updated `DeckifyOverlayWrapper` tests for Fragment structure and added `TOAST-01` / `D-11` tests using real `bannerBus`.
- `py_modules/common.py` - Added `CHORD_ACTION_IDS`, `DEFAULT_CHORD_BINDINGS`, `_normalize_chord_buttons`, `_sanitize_chord_bindings`, `_validate_chord_bindings`, and deep-copy `_load_settings` merging/fallback.
- `main.py` - Exposed `silent_banner_enabled` and `gamepad_chord_bindings` in `get_status()` `public_keys` and validated both in `set_setting()`.
- `tests/test_chord_settings.py` - Added 7 `unittest` test methods verifying defaults, deep-copy isolation, `get_status`/`set_setting` validation/rejection, and corrupt disk JSON recovery.

## Decisions Made
- Kept `notifyMessage`, `resetModuleRuntimeState`, and `syncNotificationSettings` non-exported inside `src/index.tsx` and routed legacy inline Section #4 chord confirmations through `notifyMessage` so `@decky/rollup` (`output.exports: "default"`) builds cleanly without named-export bundle failures.
- Combined banner payload and fade state into a single `ActiveBannerState` object keyed on monotonic banner `id` so latest-wins transitions render atomically in one pass and stale timers cannot dismiss newer banners.
- Applied `copy.deepcopy(default_settings)` in both `_load_settings()` merge and `except Exception:` fallback paths to prevent shared nested list/dict mutation across settings loads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed named exports from `src/index.tsx` to satisfy `@decky/rollup` single-default export mode**
- **Found during:** Task 1 (`git commit` pre-commit `pnpm run build`)
- **Issue:** Exporting `notifyMessage`, `resetModuleRuntimeState`, and `getCachedTrackMeta` from `src/index.tsx` caused `rollup -c` to fail because `@decky/rollup` enforces `output.exports: "default"` on the plugin entry module.
- **Fix:** Made `notifyMessage` and `resetModuleRuntimeState` module-internal inside `src/index.tsx`, routed the existing legacy chord listener's `toaster.toast` calls through `notifyMessage`, read `cachedTrackMeta?.track_id` inside `track_metadata` deduplication, and exercised `notifyMessage` in `src/index.test.tsx` via the registered gamepad input listener.
- **Files modified:** `src/index.tsx`, `src/index.test.tsx`
- **Verification:** `pnpm test -- --run src/index.test.tsx`, `pnpm run typecheck`, `pnpm run build`, and full pre-commit hook (17 Vitest files, 215 tests) passed cleanly.
- **Committed in:** `fb891c0` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for `@decky/rollup` bundle compatibility; legacy inline chords also gained immediate silent banner routing while Plan 20-02 will replace Section #4 with `createChordMatcher`.

## Issues Encountered
- Initial `SilentBanner` component arrow function exceeded ESLint's `max-lines-per-function` 80-line limit (107 lines); extracted `clearTimerRef` and `renderBannerContent` helpers so `SilentBanner.tsx` passes `eslint --max-warnings=0` with zero warnings.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `bannerBus`, `SilentBanner`, `notifyMessage`, and validated `silent_banner_enabled` / `gamepad_chord_bindings` persistence are complete and verified.
- Ready for Plan `20-02` (`src/chords.ts` matcher/validator + `src/index.tsx` full 8-action configurable quick-chord wiring) and Plan `20-03` (`ChordBindingsCard` Settings UI).
- Unresolved on-device check tracked in `coverage:` (`D4`, `human_judgment: true`): physical Steam Deck Gamescope compositor layering and audible silence over Vulkan games await Phase 20 hardware UAT.

## Self-Check: PASSED

- Verified all 9 created/modified files exist on disk (`src/types.ts`, `src/bannerBus.ts`, `src/components/SilentBanner.tsx`, `src/components/SilentBanner.test.tsx`, `src/index.tsx`, `src/index.test.tsx`, `py_modules/common.py`, `main.py`, `tests/test_chord_settings.py`).
- Verified all 3 task commits (`fb891c0`, `cf71429`, `ef6d543`) are ancestors of `HEAD`.
- Verified `pnpm test -- --run src/index.test.tsx src/components/SilentBanner.test.tsx` (31 tests), `pnpm run typecheck`, `pnpm exec eslint --max-warnings=0 src/types.ts src/bannerBus.ts src/components/SilentBanner.tsx`, `py -3 -m unittest discover -s tests -p "test_chord_settings.py"` (7 tests), and `py -3 -m unittest discover -s tests -p "test_features.py"` (28 tests) all pass after final edits.

---
*Phase: 20-100-silent-hud-toasts-extended-in-game-quick-chords*
*Completed: 2026-11-21*
