---
phase: 14-gentle-sleep-timer-fade-out
plan: 02
subsystem: sleep-timer-settings-ui
tags: [sleep-timer, settings, react, decky-ui, tdd]
requires:
  - phase: 14-gentle-sleep-timer-fade-out
    provides: sleep_timer_worker fade orchestration and get_sleep_timer_status fading boolean
provides:
  - sleep_timer_fade_enabled and sleep_timer_fade_duration defaults and sanitization in py_modules/common.py
  - get_status public_keys exposure and set_setting validation/clamping in main.py
  - EngineSettings.sleep_timer_fade_enabled, EngineSettings.sleep_timer_fade_duration, and SleepTimerStatus.fading in src/types.ts
  - SettingsTab Gentle Fade Out ToggleField, Fade Out Duration (Seconds) SliderField (5-120s, step 5s), and "Fading out..." status indicator
affects:
  - py_modules/common.py
  - main.py
  - src/types.ts
  - src/components/tabs/SettingsTab.tsx
  - tests/test_features.py
  - src/components/tabs/SettingsTab.test.tsx
tech-stack:
  added: []
  patterns:
    - Dual-boundary validation/clamping (5-120s) in both _load_settings and set_setting
    - Conditional SliderField visibility gated on Gentle Fade Out ToggleField state
key-files:
  created: []
  modified:
    - py_modules/common.py
    - main.py
    - src/types.ts
    - src/components/tabs/SettingsTab.tsx
    - tests/test_features.py
    - src/components/tabs/SettingsTab.test.tsx
decisions:
  - Kept Quick Access Menu (src/index.tsx) compact without sleep timer fade controls per D-03.
requirements-completed: [SLEEP-01]
metrics:
  duration: ~3m
  completed_date: "2026-11-16"
status: complete
commits: 2
plan_head_before: 0690180bffa353deb2fd50d968489f11bfbc6028
plan_head_after: 4fcc5e0c50390761593940b1033f3518b473b5f6
actuals:
  tasks: 2
  commits: 2
---

# Phase 14 Plan 02: Sleep Timer Fade-Out Settings & UI Summary

**Persisted, sanitized, and exposed `sleep_timer_fade_enabled` and `sleep_timer_fade_duration` (`5–120s`, default `30s`) in the backend, and added the Gentle Fade Out toggle, duration slider, and live `"Fading out..."` status indicator to `SettingsTab`.**

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Persist, sanitize, validate, and expose `sleep_timer_fade_enabled` and `sleep_timer_fade_duration` | `594fe69` | `py_modules/common.py`, `main.py`, `tests/test_features.py` |
| 2 | Add Fade Out `ToggleField`, `SliderField` (`5–120s`), and `"Fading out..."` status to `SettingsTab` & `types.ts` | `4fcc5e0` | `src/types.ts`, `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/SettingsTab.test.tsx` |

## What Was Built

1. **Backend Settings Persistence & Validation (`py_modules/common.py`, `main.py`):**
   - Added `"sleep_timer_fade_enabled": True` and `"sleep_timer_fade_duration": 30` to `DEFAULT_SETTINGS` in `py_modules/common.py`.
   - Added boolean coercion (`bool`) and integer clamping (`max(5, min(120, int(...)))` with fallback `30` on `TypeError`/`ValueError`) in `_load_settings`.
   - Exposed `"sleep_timer_fade_enabled"` and `"sleep_timer_fade_duration"` in `Plugin.get_status` `public_keys`.
   - Added validation/clamping in `Plugin.set_setting` for `sleep_timer_fade_enabled` (boolean coercion) and `sleep_timer_fade_duration` (clamped `5–120`, returning `{"ok": False, "error": ...}` on invalid types).

2. **Frontend Types & SettingsTab UI (`src/types.ts`, `src/components/tabs/SettingsTab.tsx`):**
   - Added `sleep_timer_fade_enabled?: boolean` and `sleep_timer_fade_duration?: number` to `EngineSettings`, and `fading?: boolean` to `SleepTimerStatus`.
   - Updated the Backend Sleep Timer card in `SettingsTab.tsx` to display `"Fading out..."` when `status?.sleep_timer?.fading` is `true` instead of `"Remaining: X min"`.
   - Added `@decky/ui` `ToggleField` (`"Gentle Fade Out"`, default `true`) and conditional `SliderField` (`"Fade Out Duration (Seconds)"`, `min={5}`, `max={120}`, `step={5}`, default `30`) persisting via `updateSetting` (`set_setting`).
   - Left `src/index.tsx` (Quick Access Menu) untouched per D-03.

## Verification Results

- `py -3 -m unittest discover -s tests -p "test_features.py"`: **27 tests passed** (including 3 new settings persistence, clamping, and `get_status` exposure tests).
- Full Python suite (pre-commit hook on `594fe69`): **480 tests passed**.
- `pnpm test -- --run src/components/tabs/SettingsTab.test.tsx`: **15 tests passed** (including 3 new tests for `ToggleField`, `SliderField`, `set_setting` calls, and `"Fading out..."` status).
- `pnpm run typecheck`: passed (`tsc --noEmit`).
- `pnpm run lint`: passed (`eslint src/`, 0 errors).
- `pnpm test` (full Vitest suite): **16 test files, 155 tests passed**.
- `rollup -c` (pre-commit hook on `4fcc5e0`): built `dist` cleanly.

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- `py_modules/common.py`: FOUND
- `main.py`: FOUND
- `src/types.ts`: FOUND
- `src/components/tabs/SettingsTab.tsx`: FOUND
- `tests/test_features.py`: FOUND
- `src/components/tabs/SettingsTab.test.tsx`: FOUND
- Commit `594fe69`: FOUND in `HEAD`
- Commit `4fcc5e0`: FOUND in `HEAD`
