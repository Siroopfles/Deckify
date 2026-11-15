---
phase: 12-resolve-open-todos-polish
plan: 02
subsystem: ui-audio-polish
tags: [notifications, base64-proxy, hud-autohide, audio-ducking, sliders, non-steam-artwork]

requires:
  - phase: 06-smooth-audio-ducking-voice-ducking
    provides: ducking_mode, ducking_proportional_pct, auto_ducking_volume, fade/hold settings
  - phase: 07-game-specific-soundtracks
    provides: vdf_parser.py Non-Steam game discovery
  - phase: 10-in-game-hud-overlay-2-0-live-synced-lyrics
    provides: DeckifyOverlay autoHide and SettingsTab sliders
provides:
  - toast_sound_enabled setting persisted in common.py/main.py/types.ts and wired to Notification Sound toggle
  - 48x48 base64-proxied album cover in track_metadata toast notifications
  - Hardened DeckifyOverlay autoHide === false guard against brief pause flickers
  - SliderFields for custom ducking attenuation (proportional % / fixed %) and fade/hold durations (0.5-3.0s)
  - Local Steam grid artwork base64 resolution for Non-Steam games in vdf_parser.py
affects: [12-03, verify-work]

actuals:
  tokens: 8304
  tasks: 3
  commits: 3

commits: 3
plan_head_before: 9e3f022cec00d7d8dbaaaeaee98061f91c0f2ed6
plan_head_after: c2317a1edfdaded75a5b5d98ac860b36a69ef665

tech-stack:
  added: []
  patterns:
    - "Use existing fetchWithQueueAndCache / imgMemoryCache (get_image RPC) for track_metadata toast cover proxying"
    - "Bound local Steam grid cover reads to MAX_IMAGE_BYTES (5 MiB) and allowed image extensions (.png, .jpg, .jpeg, .webp)"

key-files:
  created: []
  modified:
    - py_modules/common.py
    - main.py
    - py_modules/vdf_parser.py
    - src/types.ts
    - src/index.tsx
    - src/components/DeckifyOverlay.tsx
    - src/components/tabs/SettingsTab.tsx
    - tests/test_vdf_parser.py
    - tests/test_features.py
    - src/index.test.tsx
    - src/components/DeckifyOverlay.test.tsx
    - src/components/tabs/SettingsTab.test.tsx

key-decisions:
  - "Used existing fetchWithQueueAndCache and imgMemoryCache (backed by get_image RPC) in src/index.tsx instead of introducing a duplicate get_image_base64 callable"
  - "Updated DeckifyOverlay.test.tsx pause grace period tests to pass autoHide: true so permanent autoHide: false behavior is cleanly separated from auto-hide fade behavior"

patterns-established:
  - "Track-change toast artwork resolves via imgMemoryCache/fetchWithQueueAndCache with 48x48 objectFit: 'cover' and FaSpotify fallback"
  - "Ducking attenuation and fade/hold durations use @decky/ui SliderField with localSettings optimistic updates"

requirements-completed:
  - DUCK-01
  - DUCK-02
  - SOUND-01
  - HUD-03

coverage:
  - id: D1
    description: "Track-change notifications proxy artwork via get_image base64 pipeline, render 48x48 cover with objectFit: 'cover', and respect toast_sound_enabled"
    requirement: "HUD-03"
    verification:
      - kind: unit
        ref: "src/index.test.tsx#proxies track_metadata toast cover via get_image at 48x48 and respects toast_sound_enabled"
        status: pass
      - kind: unit
        ref: "tests/test_features.py#test_toast_sound_enabled_setting"
        status: pass
    human_judgment: false
  - id: D2
    description: "In-Game HUD Overlay remains visible when autoHide === false even if isPlaying briefly flickers false"
    requirement: "HUD-03"
    verification:
      - kind: unit
        ref: "src/components/DeckifyOverlay.test.tsx#keeps overlay visible when autoHide={false} even after isPlaying transitions to false and 4000ms elapses"
        status: pass
    human_judgment: false
  - id: D3
    description: "SettingsTab exposes SliderFields for custom ducking attenuation and 0.5-3.0s Fade Down, Fade Up, and Silence Hold Delay"
    requirement: "DUCK-01"
    verification:
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#renders SliderFields for Fade Down Speed, Fade Up Speed, and Attenuation Percentage"
        status: pass
      - kind: unit
        ref: "src/components/tabs/SettingsTab.test.tsx#invokes backendSetSetting when changing Fade Down Speed, Fade Up Speed, and Silence Hold Delay sliders"
        status: pass
    human_judgment: false
  - id: D4
    description: "Non-Steam games resolve local Steam grid artwork into base64 data: URIs bounded by 5 MiB"
    requirement: "SOUND-01"
    verification:
      - kind: unit
        ref: "tests/test_vdf_parser.py#test_non_steam_grid_cover_base64"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-15
status: complete
---

# Phase 12 Plan 02: Notification, HUD, Ducking Sliders & Non-Steam Artwork Summary

**Implemented configurable track-change toast sound & 48x48 base64 cover crop, hardened HUD `autoHide === false` against pause flickers, converted ducking attenuation and fade/hold durations to `SliderField`s, and added base64 local Steam grid cover resolution for Non-Steam games.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-15T20:03:00Z
- **Completed:** 2026-11-15T20:08:56Z
- **Tasks:** 3
- **Files modified:** 12 (+ 6 archived todos)

## Accomplishments
- Added `toast_sound_enabled` (`False` by default) to `DEFAULT_SETTINGS`, `main.py:get_status()` `public_keys`, `main.py:set_setting()`, `EngineSettings`, and `SettingsTab.tsx`, and wired `src/index.tsx` `track_metadata` toasts to pass `sound`/`playSound` and proxy artwork at `48x48` (`objectFit: "cover"`).
- Hardened `DeckifyOverlay.tsx` so `pauseTimerRef` is only scheduled when `autoHide` is truthy, preventing brief `isPlaying` flickers from hiding permanent HUDs.
- Added conditional `Attenuation Percentage` (10–90%) / `Fixed Target Volume (%)` (0–100%) `SliderField`s and converted `Fade Down Speed`, `Fade Up Speed`, and `Silence Hold Delay` to 0.5–3.0s `SliderField`s in `SettingsTab.tsx`.
- Implemented `_resolve_non_steam_grid_cover` in `py_modules/vdf_parser.py` to resolve `<app_id>p.*`, `<app_id>.*`, and `icon` files into `data:{mime};base64,...` URIs bounded by `MAX_IMAGE_BYTES` (5 MiB).
- Added unit tests across Python (`test_vdf_parser.py`, `test_features.py`) and Vitest (`index.test.tsx`, `DeckifyOverlay.test.tsx`, `SettingsTab.test.tsx`), and archived all 6 completed todos to `.planning/todos/done/`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire toast_sound_enabled end-to-end and fix 48x48 base64 notification cover** - `adb8836` (feat)
2. **Task 2: Harden HUD autoHide, convert ducking presets/durations to SliderFields, and add Non-Steam local grid covers** - `fc09a07` (feat)
3. **Task 3: Add tests for all 12-02 changes and archive the 6 todos** - `c2317a1` (test)

## Files Created/Modified
- `py_modules/common.py` - Added `toast_sound_enabled: False` to `DEFAULT_SETTINGS`
- `main.py` - Added `toast_sound_enabled` to `get_status()` `public_keys` and `set_setting()` boolean coercion
- `py_modules/vdf_parser.py` - Added `_read_image_data_uri` and `_resolve_non_steam_grid_cover` for Non-Steam games
- `src/types.ts` - Added `toast_sound_enabled?: boolean` to `EngineSettings`
- `src/index.tsx` - Proxied `track_metadata` toast artwork via `fetchWithQueueAndCache`/`imgMemoryCache` at 48x48 and wired `sound`/`playSound`
- `src/components/DeckifyOverlay.tsx` - Guarded `pauseTimerRef` with `if (autoHide && isVisible)`
- `src/components/tabs/SettingsTab.tsx` - Added Notification Sound toggle, attenuation `SliderField`, and 0.5–3.0s fade/hold `SliderField`s
- `tests/test_vdf_parser.py`, `tests/test_features.py`, `src/index.test.tsx`, `src/components/DeckifyOverlay.test.tsx`, `src/components/tabs/SettingsTab.test.tsx` - Added/updated unit tests
- `.planning/todos/done/*` - Archived 6 completed todo files

## Decisions Made
- Reused `fetchWithQueueAndCache` and `imgMemoryCache` from `src/components/common/imagePipeline.ts` (calling the existing `get_image` RPC) rather than adding a duplicate `get_image_base64` RPC method.
- Updated the two existing `Pause Grace Period & Fade-Out` tests in `DeckifyOverlay.test.tsx` to pass `autoHide: true` so they test the auto-hide grace fade while the new test verifies `autoHide: false` never fades out.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused existing `get_image` RPC via `fetchWithQueueAndCache` instead of `backendGetImageBase64`**
- **Found during:** Task 1
- **Issue:** Plan referenced `backendGetImageBase64`, whereas the codebase's existing image proxy RPC is `get_image` (`backendGetImage` / `fetchWithQueueAndCache` in `src/components/common/imagePipeline.ts`).
- **Fix:** Imported `fetchWithQueueAndCache` and `imgMemoryCache` in `src/index.tsx` to proxy and cache toast artwork through `get_image`.
- **Files modified:** `src/index.tsx`, `src/index.test.tsx`
- **Verification:** `pnpm run typecheck` and `npx vitest run src/index.test.tsx` passed.
- **Committed in:** `adb8836`

**2. [Rule 1 - Bug] Updated existing `DeckifyOverlay.test.tsx` grace-period tests for `autoHide: true`**
- **Found during:** Task 2 pre-commit hook
- **Issue:** Two existing `Pause Grace Period & Fade-Out` tests in `DeckifyOverlay.test.tsx` passed `autoHide: false` while expecting the overlay to fade out after 3500ms, which contradicted the new `autoHide === false` permanent-visibility requirement.
- **Fix:** Set `autoHide: true` on those two tests and added a dedicated `autoHide={false}` flicker-guard test.
- **Files modified:** `src/components/DeckifyOverlay.test.tsx`
- **Verification:** `npx vitest run src/components/DeckifyOverlay.test.tsx` passed (22/22).
- **Committed in:** `fc09a07`

---

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 Rule 1)
**Impact on plan:** Both auto-fixes aligned the implementation with existing codebase RPCs and the new `autoHide === false` requirement without scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 12-02 deliverables are implemented, tested (457 Python tests + 16 Vitest suites), and committed.
- Ready for `12-03-PLAN.md`.

---
*Phase: 12-resolve-open-todos-polish*
*Completed: 2026-11-15*

## Self-Check: PASSED
