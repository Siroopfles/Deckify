---
status: diagnosed
trigger: "Investigate issue: g-22-3-librespot-crossfade-behavior — Setting Crossfade (0–12s) in SettingsTab updates Official Spotify Client via CDP port 9229 and either provides true/non-jarring crossfade on librespot or clearly disables/scopes the setting to Official Spotify Client."
created: 2026-11-22T15:34:27Z
updated: 2026-11-22T15:36:00Z
---

## Current Focus

hypothesis: Confirmed root cause across librespot engine architecture, _poll_playback 20s interval, PipeWire single-sink volume dip, and unscoped SettingsTab UI
test: Complete — all relevant files inspected
expecting: N/A (diagnosis complete)
next_action: Return ROOT CAUSE FOUND to caller

## Symptoms

expected: Setting `Crossfade` (`0–12s`) in `SettingsTab` updates Official Spotify Client via CDP port `9229` and drives smooth `librespot` PipeWire boundary fades without overriding Sleep Timer lock or per-game ducking.
actual: User reported: "Ja bij official werkt die maar bij libre heb ik het idee van niet want die kan vgm maar 1 nummer tegelijk streamen kunnen we dat fixen op een manier of helemaal niet het moet namelijk niet gek gaan klinken en anders setting uitzetten voor libre misschien"
errors: None reported
reproduction: Test 4 in UAT (22-UAT.md)
started: Discovered during UAT

## Eliminated

## Evidence

- timestamp: 2026-11-22T15:35:00Z
  checked: `.planning/debug/knowledge-base.md`
  found: File does not exist yet
  implication: No prior KB pattern match; proceed with direct investigation

- timestamp: 2026-11-22T15:35:15Z
  checked: `main.py:602-655` (`start_librespot`)
  found: `librespot` is launched as a single process (`LIBRESPOT_BIN`) with `--backend pulseaudio` and no crossfade CLI flag (standard `librespot` decodes and outputs one stream at a time and has no native crossfade mixer).
  implication: True overlapping crossfade (Track A fading out while Track B simultaneously fades in) is impossible in `librespot` without modifying/replacing `librespot` itself.

- timestamp: 2026-11-22T15:35:25Z
  checked: `main.py:1843-1881` (`_maybe_trigger_local_crossfade`), `main.py:2006-2008`, `py_modules/volume.py:467-480` (`trigger_crossfade_out`, `trigger_crossfade_in`)
  found: For `librespot`, Deckify attempts a single-sink PipeWire volume dip: `trigger_crossfade_out` fades the single sink-input to `0.0` when `0 < remaining_ms <= cf_sec * 1000`, and `trigger_crossfade_in` fades back up after `track_id` changes.
  implication: Even when triggered, this produces a jarring dip to silence followed by a late fade-in of the next track's intro, rather than a true crossfade.

- timestamp: 2026-11-22T15:35:35Z
  checked: `main.py:2149-2168` (`_poll_api_loop`) and `py_modules/resilience.py:20-21, 377-406, 451-455`
  found: `_maybe_trigger_local_crossfade` is only called inside `_poll_playback()`. When `librespot --onevent` is healthy, `get_poll_interval` returns `POLL_INTERVAL_RELAXED_S = 20.0` seconds, and `--onevent` only triggers debounced `_poll_playback()` (400ms delay) on `track_changed`/`playing` events.
  implication: During normal `librespot` playback, `_poll_playback()` runs only every 20s and routinely misses the `0 < remaining_ms <= cf_sec * 1000` (1–12s) end-of-track window completely, so `trigger_crossfade_out` often never fires at all; when it does fire, `trigger_crossfade_in` is delayed by the 400ms+ debounce after `track_changed`.

- timestamp: 2026-11-22T15:35:45Z
  checked: `src/components/tabs/SettingsTab.tsx:241-296, 809-813` (`CrossfadeSettingRow`)
  found: `CrossfadeSettingRow` is unconditionally rendered and enabled in `SettingsTab` regardless of `audio_backend` (`librespot` vs `spotify_client`), with description claiming it provides a local PipeWire transition fallback for `librespot`.
  implication: Users on `librespot` are presented with an active 0–12s Crossfade slider that cannot perform true crossfade and either does nothing (missed 20s poll) or dips audio to silence.

## Resolution

root_cause: "AND-gate / multi-factor root cause: (1) Engine architecture (`code/environment`): `librespot` is a single-stream Spotify Connect player with no native crossfade mixer or dual-track overlap capability, so true overlapping crossfade is impossible on `librespot`. (2) Broken fallback mechanism (`code`): Deckify's PipeWire fallback (`_maybe_trigger_local_crossfade` in `main.py` + `VolumeFader.trigger_crossfade_out/in` in `py_modules/volume.py`) only dips a single sink-input to silence and fades back in late, AND is only evaluated inside `_poll_playback()` which runs on a 20s relaxed interval when `librespot --onevent` is healthy (`py_modules/resilience.py`), missing the 1–12s end-of-track window. (3) Unscoped UI (`code`): `CrossfadeSettingRow` in `src/components/tabs/SettingsTab.tsx` is always enabled regardless of `audio_backend`, exposing a broken/non-functional control to `librespot` users instead of scoping/disabling it for `spotify_client` only."
fix:
verification:
files_changed: []
