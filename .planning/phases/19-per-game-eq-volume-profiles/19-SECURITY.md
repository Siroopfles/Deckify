---
phase: "19"
slug: "per-game-eq-volume-profiles"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-19"
---

# Phase 19 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| IPC profile payload -> `SoundtrackManager._sanitize_profile` & `common._load_settings` | User-supplied / persisted `game_audio_profiles` and `active_game_override_snapshot` JSON cross into Python audio state | Profile dicts (`eq_preset`, `eq_custom_bands`, `volume_override`, `ducking_level_override`), crash-recovery snapshot (`app_id`) |
| Python backend -> Host PipeWire/PulseAudio CLI (`pipewire`, `pw-cli`, `pactl`) | Equalizer band parameters, sink names, and sink-input IDs execute in UID 1000 subprocesses | Sink names, 10-band float gains, `eq.pid` integer PID, sink-input IDs |
| `VolumeFader` -> PipeWire `sink-inputs` | Audio attenuation isolates Deckify player streams from SteamOS UI (`steamwebhelper`) and obeys Sleep Timer locks | Sink-input discovery results, local volume percentages (`0..150`), `_sleep_locked` flag |
| Steam CEF Frontend RPC -> `main.py` (`preview_eq_bands`, `set_setting`, `handle_app_lifetime_event`, `save_game_soundtrack_profile`) | Untrusted/corrupted JS payloads enter host Python `Plugin` controller | 10-band float arrays, setting keys/values, `app_id` lifecycle/profile events |
| Plugin restart / crash recovery -> `Plugin._main()` | Persisted `active_game_override_snapshot` and `eq.pid` files drive PipeWire teardown and audio baseline reset on startup | Snapshot `app_id`, stale PID file |
| User controller / pointer input -> `GameEqModal` -> `preview_eq_bands` RPC | Slider drags, +/- steppers, and preset seeds produce 10-band float arrays sent to Python PipeWire preview | 10-band float arrays, `gameName`, active override labels (`app_name`, `eq_preset`) |
| Steam/Spotify external icon URLs & Gamepad input -> `SoundtracksTab.tsx` / `DeckifyExpandedModal.tsx` / QAM `src/index.tsx` | Cover URLs proxy via `<DeckifyImage>` (CSP compliance), modal trigger shortcuts require focus isolation, destructive deletes require confirmation, QAM binds to backend state | Cover image URLs, modal open state, profile delete actions, `DuckingState` events |
| `Router.MainRunningApp?.display_name` & `shortcuts.vdf` / `appmanifest_*.acf` -> `SoundtrackManager._resolve_app_name` -> `SettingsTab` / `GameEqModal` JSX | Untrusted game titles from Steam/Non-Steam metadata or QAM RPC enter Python persistence and React UI rendering | Persisted `app_name` (bounded to `MAX_STR = 200`), QAM `display_name` guarded by `appid` match |
| `GameEqModal` / `SoundtracksTab` FocusNavController & DOM focus (`rAF`) | Unbounded modal width, `DialogButton` `width: 100%` defaults, or unguarded `requestAnimationFrame` focus calls enter SteamOS FocusNavController | Modal container bounds (`overflowX: "hidden"`), `DialogButton` `width: "auto"`, `rAF` cleanup, `useState` slots `0..6` |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-19-01 | Tampering | `SoundtrackManager._sanitize_profile` & `common._load_settings` | high | mitigate | `py_modules/soundtrack.py:_sanitize_profile` enforces `EQ_PRESETS` allowlist, clamps `eq_custom_bands` via `clamp_eq_bands` (`[-12.0, 12.0]`, rejects `NaN`/`Inf`/`bool`), clamps `volume_override` (`0..100`) and `ducking_level_override` (`0..95`) rejecting `bool`; `py_modules/common.py:_load_settings` validates `active_game_override_snapshot` positive non-bool `int` `app_id` (`1..0xFFFFFFFF`). | closed |
| T-19-02 | Tampering | `EqualizerManager` PipeWire subprocesses | high | mitigate | `py_modules/equalizer.py` validates sink names via `_is_valid_sink_name`, executes `list[str]` commands via `_deck_cmd` (`shell=False`, `LD_LIBRARY_PATH` stripped), and validates positive integer PID in `EQ_PID_FILE` (`eq.pid`) before `os.kill(..., 15)`. | closed |
| T-19-03 | Elevation of Privilege | `VolumeFader` sink-input & sleep lock | high | mitigate | `py_modules/volume.py` routes sink-input discovery through `resolve_spotify_sink_input_ids()` (`steamwebhelper`/`Chromium` deny-listed), validates `str(sink_input_id).isdigit()`, clamps sink percent `0..150`, and skips un-ducking/clear fades when `_sleep_locked` is `True`. | closed |
| T-19-04 | Tampering | `main.py` (`_main`, `set_setting`, `get_status`, `preview_eq_bands`) | high | mitigate | `Plugin.set_setting` rejects external writes to `active_game_override_snapshot`; `Plugin.get_status` filters `settings` through `public_keys` omitting `active_game_override_snapshot`; `_validate_eq_bands` rejects non-list, length != 10, `bool`, `NaN`/`Inf`, and clamps `[-12.0, 12.0]`; `handle_app_lifetime_event` / profile handlers validate integer `app_id`. | closed |
| T-19-05 | Denial of Service | `main.py` (`preview_eq_bands`, `handle_app_lifetime_event`) | medium | mitigate | `Plugin.preview_eq_bands` delegates through `EqualizerManager.preview_bands` (`75ms` `pw-cli` coalescing); `Plugin.handle_app_lifetime_event` delegates exclusively to `SoundtrackManager.handle_app_lifecycle` debounces with zero Spotify Web API `set_volume` calls. | closed |
| T-19-06 | Information Disclosure | `GameEqModal.tsx` & `SettingsTab.tsx` | medium | mitigate | `GameEqModal` binds exclusively to `ModalRoot` (`ModalRootCompat`), restores active EQ via `clear_eq_preview` on Discard/Cancel/unmount (and non-running Save), renders text safely as React JSX children (no raw HTML injection or external URLs), and `SettingsTab` renders the `"Active Game EQ Override: ..."` badge + global isolation caption. | closed |
| T-19-07 | Tampering | `EqBandFaders.tsx` & `GameEqModal.tsx` | low | accept | Frontend `normalizeEqBands` clamps gains to `[-12.0, 12.0]` in `0.5` dB steps; authoritative validation/clamping is enforced in `main.py:_validate_eq_bands` (`T-19-04`). | closed |
| T-19-08 | Tampering | `SoundtracksTab.tsx` & `DeckifyExpandedModal.tsx` | medium | mitigate | `SoundtracksTab.tsx` routes all game/playlist artwork strictly through `<DeckifyImage>`, suppresses `useTriggerNavigation` via `onPickerOpenChange(true/false)` while `GameEqModal` or `PlaylistPickerModal` is open, and guards destructive deletes with two-step `Delete Game Profile` -> `Confirm Delete` / `Keep Profile`. | closed |
| T-19-09 | Spoofing | `src/index.tsx` (`QuickAccessMenu`) | low | accept | QAM Volume `SliderField` and `"DUCKED"` / `"GAME VOL"` pills bind directly to backend `get_ducking_state` and `ducking_state_changed` payloads (`effective_volume`, `is_ducked`, `has_game_override`) rather than optimistic client calculations. | closed |
| T-19-10 | Tampering | `py_modules/soundtrack.py` (`_resolve_app_name`, `_resolve_app_name_async`, `save_profile`, `save_profile_async`, `bind_current_music_to_game`, `apply_active_audio_profile`) & `src/index.tsx` (`handleQuickBind`) | medium | mitigate | `py_modules/soundtrack.py` (`MAX_STR = 200`, `_clean_str`, `_sanitize_profile`, `_resolve_app_name` and `_resolve_app_name_async` offloading cold `vdf_parser.get_installed_games()` calls via `run_in_executor` inside `try/except` and skipping VDF on unbound launches, `save_profile`, `save_profile_async`, `apply_active_audio_profile`, `bind_current_music_to_game`); `src/index.tsx:424-430` (`handleQuickBind` checks exact `mainAppId === activeGameAppId` before forwarding trimmed `display_name`, rejecting missing/zero/`NaN` `appid`); `SettingsTab.tsx:536-550`, `GameEqModal.tsx:123-125`, and `SoundtracksTab.tsx:309-321` render names solely as React JSX text nodes with `textOverflow: "ellipsis"` (no raw HTML injection). | closed |
| T-19-11 | Denial of Service | `GameEqModal.tsx` & `SoundtracksTab.tsx` | low | mitigate | `src/components/tabs/GameEqModal.tsx:454-469` (`useBodyInitialFocus` guards `requestAnimationFrame`/`cancelAnimationFrame`, optional-chains `bodyRef.current?.querySelector?.` and `target?.focus?.()`), `506-520` (`overflowX: "hidden"`, `maxWidth: "min(680px, 88vw)"`), `width: "auto"` on `DialogButton`s (`143, 207, 282, 296`); `src/components/tabs/SoundtracksTab.tsx:367, 383, 473, 638, 665, 678` (`width: "auto"` on all 6 compact/inline `DialogButton`s) and `1150-1160` (`useState` slots `0..6` preserved). | closed |
| T-19-SC | Tampering | npm/pip dependencies | low | accept | Zero new packages installed; `git diff 7e3a744c95e8313102827d2eba702d06c2a8b442..HEAD -- package.json pnpm-lock.yaml` is empty. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-19-01 | T-19-07 | Frontend `normalizeEqBands` clamping is UX convenience; authoritative bounds/type checking runs in `main.py:_validate_eq_bands` (`T-19-04`). | Phase 19 plan & audit (`security_asvs_level: 1`) | 2026-11-19 |
| AR-19-02 | T-19-09 | QAM display binds exclusively to backend `get_ducking_state` / `ducking_state_changed` events with no independent security boundary. | Phase 19 plan & audit (`security_asvs_level: 1`) | 2026-11-19 |
| AR-19-03 | T-19-SC | Zero new npm or Python dependencies added during Phase 19 (`package.json` and `pnpm-lock.yaml` unchanged). | Phase 19 plan & audit (`security_asvs_level: 1`) | 2026-11-19 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-19 | 10 | 10 | 0 | execute-phase (ASVS L1 verification) |
| 2026-11-19 | 12 | 12 | 0 | secure-phase (State A post 19-05 ASVS L1 verification) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-19

## Security Audit 2026-11-19

| Metric | Count |
|---|---|
| Threats found | 12 |
| Closed | 12 |
| Open | 0 |
