---
phase: 05-in-game-hud-overlay-restoration
plan: 01
subsystem: ui-hud
tags: [hud, overlay, in-game, gamescope, auto-hide, progress-bar, qam]
status: complete
requires:
  - HUD-01
  - HUD-02
provides:
  - non-blocking-gamescope-hud-overlay
  - overlay-autohide-6s-engine
  - pause-grace-period-fadeout
  - subtle-2px-progress-bar
  - concurrent-state-polling-wrapper
  - qam-direct-overlay-controls
  - settings-tab-overlay-controls
affects:
  - DeckifyOverlay
  - DeckifyOverlayWrapper
  - QuickAccessMenu
  - SettingsTab
  - Plugin
tech-stack:
  added: []
  patterns:
    - non-blocking-pointer-events-none-gamescope-badge
    - dual-signal-events-plus-concurrent-polling
    - auto-hide-and-pause-grace-timers-with-css-glide
key-files:
  created:
    - src/components/DeckifyOverlay.test.tsx
  modified:
    - py_modules/common.py
    - main.py
    - src/types.ts
    - tests/test_e2e_requirements.py
    - src/components/DeckifyOverlay.tsx
    - src/index.tsx
    - src/components/tabs/SettingsTab.tsx
decisions:
  - "D-01: Configurable Permanent vs 6s Auto-Hide (overlay_autohide)"
  - "D-02: QAM Direct Overlay Controls (Toggle, 4-Corner Dropdown, Auto-Hide, Progress)"
  - "D-03: Configurable Visual Style with Subtle 2px Bottom Progress Bar (overlay_show_progress)"
  - "D-04: 3.5s Pause Grace Period Before Smooth CSS Opacity Fade-Out"
  - "D-05: Concurrent Dual-Signal Polling in DeckifyOverlayWrapper (track, is_playing, settings, position_ms, duration_ms)"
metrics:
  duration: 12m
  completed_date: "2026-11-12"
actuals:
  tokens: 9442
  tasks: 3
  commits: 3
  plan_head_before: 095b1c525c934db024fbd45065e5078f7cc2f033
  plan_head_after: a153eed520fa6ca8ebc6cae29016eafddff35aac
---

# Phase 05 Plan 01: In-Game HUD Overlay Restoration Summary

Floating in-game HUD overlay restored with non-blocking pointer events, 6s auto-hide, 3.5s pause grace fade-out, 2px progress bar, QAM quick controls, and concurrent dual-signal state polling.

## Overview

Plan 05-01 restored and polished the floating Deckify in-game HUD overlay across SteamOS GamepadUI gamescope. Previously, `DeckifyOverlayWrapper`'s fallback loop only refreshed `settings`, leaving `track` and `isPlaying` vulnerable to freezes whenever background push events were missed or alternative backends were active. Additionally, players had no way to toggle or reposition the HUD from the Quick Access Menu (QAM) mid-game, and playback pauses abruptly cut off rather than smoothly fading out.

This plan resolved these issues by:
1. Extending backend settings schema, validation, and RPC serialization with `overlay_autohide` and `overlay_show_progress`.
2. Upgrading `DeckifyOverlay` with strict `pointerEvents: "none"`, 4-corner absolute offsets, 36x36 artwork via `DeckifyImage` with `FaMusic` fallback, 45-character title truncation, a 6-second auto-hide timer (`overlay_autohide`), a 3.5-second pause grace period (`FaPause` indicator before fading out), an optional 2px green bottom progress bar (`overlay_show_progress`), and smooth CSS opacity and glide transitions.
3. Implementing concurrent polling in `DeckifyOverlayWrapper` to synchronize `track`, `is_playing`, `position_ms`, `duration_ms`, and `settings` simultaneously every 4 seconds.
4. Adding direct QAM toggles and position dropdown in `src/index.tsx:Content` for zero-friction mid-game adjustments, and exposing the toggles in `SettingsTab.tsx`.
5. Delivering a comprehensive Vitest unit test suite (`DeckifyOverlay.test.tsx`) covering pointer-events, 4-corner layout, artwork fallback, play/pause states, auto-hide timers, pause delay, and progress bar rendering.

## Changes Implemented

### 1. Backend HUD Settings Schema & E2E Requirements Tests (Task 1 - Tracer)
- **Files:** `py_modules/common.py`, `main.py`, `src/types.ts`, `tests/test_e2e_requirements.py`
- Registered `"overlay_autohide": False` and `"overlay_show_progress": False` in `DEFAULT_SETTINGS` in `py_modules/common.py`.
- Added boolean sanitization in `_load_settings()` in `py_modules/common.py`.
- Added `"overlay_autohide"` and `"overlay_show_progress"` to `public_keys` in `main.py:get_status()` so the public status reflects overlay options.
- Added boolean coercion in `main.py:set_setting()` for both keys.
- Declared `overlay_autohide?: boolean` and `overlay_show_progress?: boolean` in `EngineSettings` in `src/types.ts`.
- Added 5 new E2E tests in `tests/test_e2e_requirements.py` (`test_r7_default_settings_includes_overlay_autohide`, `test_r7_default_settings_includes_overlay_show_progress`, `test_r7_overlay_autohide_setting_persists`, `test_r7_overlay_show_progress_setting_persists`, `test_r7_get_status_includes_all_overlay_settings`).
- Verified all 137 requirements tests passing with zero failures.

### 2. Upgraded DeckifyOverlay Component & Vitest Unit Test Suite (Task 2)
- **Files:** `src/components/DeckifyOverlay.tsx`, `src/components/DeckifyOverlay.test.tsx`
- Enforced `pointerEvents: "none"`, `position: "fixed"`, `zIndex: 9999`, `margin: 16`, and corner offsets (`top-left`, `top-right`, `bottom-left`, `bottom-right`).
- Rendered 36x36 album artwork using `DeckifyImage` (CSP proxy / local cache) with `FaMusic` (#1db954) fallback on `#282828` background.
- Truncated track titles longer than 45 characters with ellipsis `...` and rendered artist name when present.
- Added play indicator (`<FaPlay size={9} color="#1db954" />`) and pause indicator (`<FaPause size={9} color="#888" />`).
- Implemented 6000ms auto-hide timer (`overlay_autohide`) resetting on track change or playback resume.
- Implemented 3500ms pause grace period (`FaPause` indicator remains visible for 3.5s before fading opacity to 0).
- Implemented subtle 2px green (`#1db954`) bottom progress line when `showProgress` is true and `durationMs > 0`.
- Applied smooth CSS opacity and glide transitions: `opacity: isVisible ? 1 : 0`, `transform: isVisible ? "translateY(0)" : isTop ? "translateY(-10px)" : "translateY(10px)"` with cubic-bezier easing.
- Created `src/components/DeckifyOverlay.test.tsx` with 15 Vitest tests asserting pointer-events, 4-corner coordinates, artwork fallback, play/pause icons, 6s auto-hide, 3.5s pause grace, and 2px progress bar.

### 3. Concurrent Polling, QAM Direct Controls & SettingsTab Controls (Task 3)
- **Files:** `src/index.tsx`, `src/components/tabs/SettingsTab.tsx`
- Defined `backendSetSetting` RPC bridge in `src/index.tsx`.
- Updated `DeckifyOverlayWrapper` to maintain `positionMs` and `durationMs` states alongside `track`, `isPlaying`, and `settings`.
- Updated `syncStatus` and 4-second polling loop to synchronize all fields concurrently, preventing HUD freeze when push events are missed.
- Wired event listeners for `track_metadata`, `librespot_event`, and `settings_changed` to update playback position and duration.
- Added QAM direct controls inside `src/index.tsx:Content`:
  - `ToggleField` for "In-Game Overlay (HUD)" (`overlay_enabled`)
  - When enabled: `DropdownItem` for "Overlay Position" (`top-left`, `top-right`, `bottom-left`, `bottom-right`)
  - When enabled: `ToggleField` for "Auto-Hide Overlay (6s)" (`overlay_autohide`)
  - When enabled: `ToggleField` for "Show Progress Bar" (`overlay_show_progress`)
- Updated `SettingsTab.tsx` In-Game Mini Overlay (HUD) card to expose toggles for "Auto-Hide Overlay (6s)" and "Show Progress Bar (2px)".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Auto-fix blocking issues] Missing backendSetSetting definition in src/index.tsx**
- **Found during:** Task 3 verification (`pnpm typecheck`)
- **Issue:** `src/index.tsx` called `backendSetSetting` for QAM controls, but the RPC callable was only defined in `SettingsTab.tsx`.
- **Fix:** Added `const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");` to `src/index.tsx`.

## Verification Results

1. **Frontend Unit Tests:**
   - Command: `cmd.exe /c "pnpm test"`
   - Result: 5 test files, 55 tests passed (including all 15 tests in `DeckifyOverlay.test.tsx`).
2. **TypeScript Compilation:**
   - Command: `cmd.exe /c "pnpm typecheck"`
   - Result: Clean exit (0 errors).
3. **Rollup Production Bundle:**
   - Command: `cmd.exe /c "pnpm build"`
   - Result: `dist/index.js` generated in 4.9s.
4. **Backend E2E Requirements:**
   - Command: `cmd.exe /c "py -3 -m unittest tests.test_e2e_requirements"`
   - Result: 137 tests passed in 4.5s.
5. **Full Backend Suite:**
   - Command: `cmd.exe /c "py -3 -m unittest discover tests -p test_*.py"`
   - Result: 324 tests passed in 15.8s.

## Self-Check: PASSED

1. Created files exist:
   - `src/components/DeckifyOverlay.test.tsx`: FOUND
2. Modified files exist:
   - `py_modules/common.py`: FOUND
   - `main.py`: FOUND
   - `src/types.ts`: FOUND
   - `tests/test_e2e_requirements.py`: FOUND
   - `src/components/DeckifyOverlay.tsx`: FOUND
   - `src/index.tsx`: FOUND
   - `src/components/tabs/SettingsTab.tsx`: FOUND
3. Task Commits exist:
   - `6cdbbc2`: FOUND
   - `46f272f`: FOUND
   - `a153eed`: FOUND
