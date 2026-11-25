---
status: diagnosed
trigger: "User-reported bug (G-26-3): Music playing on phone pauses when Steam Machine boots up or turns on/wakes."
created: 2026-11-25T17:56:00Z
updated: 2026-11-25T17:56:00Z
---

## Current Focus

hypothesis: CONFIRMED — Three interacting mechanisms cause Deckify on the Steam Machine to pause or hijack active remote phone playback on boot/wake: (1) MprisBridge exposes remote phone playback as local "Playing" on D-Bus so OS/mpris-proxy Pause/Stop signals pause the phone via Web API, (2) _poll_playback records `was_playing=True` bookmarks for remote phone playback and handle_wake_recovery can hijack playback on wake, and (3) unbound SoundtrackManager pause policy or engine startup can pause/take over remote playback.
bug_class: Bohrbug / Race condition on boot & wake
next_action: return ROOT CAUSE FOUND to orchestrator (find_root_cause_only)

## Symptoms

expected: Booting or waking the Steam Machine while listening to Spotify on a phone leaves phone playback uninterrupted.
actual: "ik heb een bug dat als ik muziek luister op mijn telefoon dat hij dan pauzeert als mijn steam machine opstart. Ook als ik hem aan zet pauzeert hij weer"
errors: None reported
reproduction: Play Spotify on phone, then boot Steam Machine or wake it from sleep.
started: Discovered during Phase 26 UAT

## Evidence

- timestamp: 2026-11-25T17:56:00Z
  checked: main.py L2008-2160 (`_poll_playback`) & py_modules/mpris.py L1285-1463 (`MprisBridge`)
  found: `_poll_playback` polls `GET /v1/me/player` on startup and sets `self._poll_play_state = "playing"` even when `device` is a remote phone (`not resilience.is_device_dict_local(self, device)`). It then calls `self._mpris_bridge.sync_from_plugin()`, which publishes `PlaybackStatus = "Playing"` on local D-Bus `org.mpris.MediaPlayer2.deckify`. When SteamOS / KDE / BlueZ `mpris-proxy` or Gamescope initializes on boot/wake (or audio focus shifts), local OS sends MPRIS `Pause` or `Stop` to `MprisBridge.handle_dbus_command`, which blindly calls `self._plugin.control_playback("pause")` -> `PUT /v1/me/player/pause` -> pauses the user's phone!
  implication: `MprisBridge` must not treat remote-device playback as local `Playing` (or must ignore OS-initiated `Pause`/`Stop` when `!is_local_device_active(self._plugin)`).

- timestamp: 2026-11-25T17:56:00Z
  checked: main.py L2129-2137 & py_modules/resilience.py L214-228, L885-905
  found: `_poll_playback` calls `self._bookmark_manager.snapshot_from_state(..., was_playing=bool(is_playing))` unconditionally, even when playback is on a remote phone (`not is_local_device_active(self)`). Additionally, in `resilience.py` L217, `is_device_dict_local(plugin, device)` returns `True` when `device` is `None` or empty, and in `handle_wake_recovery` L885-895, if `_fetch_current_player` fails transiently on wake (returns `None`), Step 6 proceeds to call `_invoke_play_tracks` on the Steam Machine, hijacking and pausing the phone's playback.
  implication: Bookmarks should only record `was_playing=True` when the local device is active; `handle_wake_recovery` must yield if `_fetch_current_player` fails transiently when a remote device was last known active, or verify before hijacking.

- timestamp: 2026-11-25T17:56:00Z
  checked: py_modules/soundtrack.py L503-516 (`_run_launch`)
  found: If `soundtrack_unbound_policy == "pause"` and Steam reports an active app on startup (`Router.MainRunningApp`), `_run_launch` calls `self._pause()` if `snap.get("is_playing")` is True, without checking whether playback is on the local device or a remote phone.
  implication: Unbound soundtrack pause policy must also guard against pausing a remote Spotify Connect device.

## Resolution

root_cause: |
  1. `MprisBridge` (`py_modules/mpris.py`) publishes `PlaybackStatus = "Playing"` for remote phone playback (`_poll_playback` in `main.py` sets `_poll_play_state = "playing"` regardless of `is_local_device_active`) and forwards local OS/mpris-proxy `Pause`/`Stop` D-Bus calls directly to `control_playback("pause")`, pausing the user's phone on boot/wake.
  2. `_poll_playback` (`main.py:2129-2137`) saves `was_playing=True` session bookmarks even when a remote phone is playing, and `SessionBookmarkManager.handle_wake_recovery` (`py_modules/resilience.py:885-905`) can hijack remote playback on wake if `_fetch_current_player` transiently returns `None` or `device` is missing (`is_device_dict_local` defaults `None` to `True`).
  3. `SoundtrackManager._run_launch` (`py_modules/soundtrack.py:503-516`) can issue `_pause()` on startup/app-launch even when playback is on a remote device.
fix: (not applied — diagnose-only)
verification: (not applied)
files_changed: []
