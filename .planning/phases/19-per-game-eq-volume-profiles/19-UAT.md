---
status: diagnosed
phase: 19-per-game-eq-volume-profiles
source: [19-VERIFICATION.md]
started: 2026-11-19T08:35:00Z
updated: 2026-11-19T16:33:15Z
---

## Current Test

[testing complete]

## Tests

### 1. Live PipeWire Filter-Chain & Sink-Input Hardware Audio (Non-Inferable Backstop)
expected: Launching and exiting Steam/Non-Steam games (including rapid game switches and mid-game GameEqModal pw-cli previews) transitions deckify_eq_sink and pactl set-sink-input-volume smoothly with no audible clicks, pops, or steamwebhelper/Chromium UI sound interference.
result: pass

### 2. SteamOS GamepadUI Navigation, Layout & Visual Verification (1280x800)
expected: Controller D-pad navigation traverses horizontal rows (flow-children='horizontal') without focus traps; Edit Game EQ modal renders all 10 ISO faders within 82vh; SettingsTab shows truncated Active Game EQ Override badge while keeping edits bound to global baseline; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly.
result: issue
reported: "1.1 Missing explicit on/off toggle to enable/disable Volume Override slider and Ducking Attenuation Override slider. 1.3 Moving slider makes Reset button appear inline, causing layout jump and slider label text to wrap vertically/stack letters. 2.1 GameEqModal close button causes rightward scroll, pressing D-pad down moves focus left, and modal color mismatches inner content. 4.1 SettingsTab Active Game EQ Override badge shows 'App <many digits>...' instead of game name, truncating the rest."
severity: major

### 3. Mid-Game Crash Recovery & Sleep Timer _sleep_locked Priority on Hardware
expected: Killing/restarting Decky Loader mid-game cleans orphan pipewire -c via eq.pid and restores global EQ (including tearing down deckify_eq_sink when global is flat) and un-ducked baseline on Plugin._main(); exiting a game while a Sleep Timer fade is active restores global EQ and clears snapshot without un-ducking or resuming pre-game playback.
result: pass

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-19-2
  truth: "Controller D-pad navigation traverses horizontal rows (flow-children='horizontal') without focus traps; Edit Game EQ modal renders all 10 ISO faders within 82vh; SettingsTab shows truncated Active Game EQ Override badge while keeping edits bound to global baseline; QAM displays GAME VOL / DUCKED pills and live effective_volume; two-step Delete Game Profile confirmation works cleanly."
  status: failed
  reason: "User reported: (1) SoundtracksTab lacks on/off toggles for Volume Override and Ducking Attenuation Override sliders, and inline Reset button appearing causes layout jump and vertical letter stacking on slider labels; (2) GameEqModal close button causes slight horizontal scroll right, D-pad down moves focus left, and modal color mismatches inner content; (3) SettingsTab Active Game EQ Override badge displays 'App <many digits>...' instead of game name and hides remaining badge text."
  severity: major
  test: 2
  root_cause: "Four verified code, SteamOS CSS/focus, and app_name persistence defects: (1) SoundtracksTab.tsx:500-599 lacks explicit ToggleField enable/disable controls for volume_override and ducking_level_override; (2) SteamOS .DialogButton defaults to width: 100%, so mounting conditional Reset DialogButtons with flexShrink: 0 and no width: 'auto' inline beside flex: 1, minWidth: 0 SliderFields crushes the sliders and stacks label letters vertically; (3) GameEqModal.tsx Close DialogButton lacks width: 'auto' and takes initial DOM focus inside an overflowX: auto container (scrolling right), wrapped 8-item preset row + FIRST entry defaults move D-pad Down focus left, and background: '#121212' clashes with ModalRoot; (4) non-Steam shortcut profile '2429414104' has empty app_name (QAM bind omits Router.MainRunningApp.display_name, SoundtrackManager lacks vdf_parser fallback, SoundtracksTab preserves ''), while SettingsTab.tsx:486-538 squeezes the badge into ~286px on a maxWidth: 640 header row, cutting off the game name and preset."
  artifacts:
    - path: "src/components/tabs/SoundtracksTab.tsx"
      issue: "Missing on/off ToggleFields for Volume Override and Ducking Attenuation Override; inline DialogButtons missing width: 'auto' crush flex: 1 SliderFields; preserves empty existingProfile.app_name"
    - path: "src/components/tabs/GameEqModal.tsx"
      issue: "Close DialogButton lacks width: 'auto' + initial focus causes rightward scroll; wrapped flow-children='horizontal' preset row + missing NavEntryPositionPreferences move D-pad Down focus left; inner background: '#121212' clashes with ModalRoot"
    - path: "src/components/tabs/SettingsTab.tsx"
      issue: "Active Game EQ Override badge squeezed into single ~612px header row between two flexShrink: 0 siblings (~286px remaining), truncating 'App <digits>...' and hiding preset label"
    - path: "py_modules/soundtrack.py"
      issue: "save_profile, bind_current_music_to_game, and apply_active_audio_profile do not fall back to vdf_parser.get_installed_games() when app_name is empty"
    - path: "src/index.tsx"
      issue: "QAM handleQuickBind calls backendBindCurrentMusicToGame(activeGameAppId) without passing Router.MainRunningApp?.display_name"
  missing:
    - "Replace inline reset DialogButtons in SoundtracksTab Volume Override and Ducking Attenuation Override with explicit full-width ToggleFields gating own-row full-width SliderFields (preserving useState hook slots 0-6), and set width: 'auto' on compact inline DialogButtons"
    - "Fix GameEqModal Close button width: 'auto'/no flexShrink: 0, add overflowX: 'hidden', remove #121212 inner background to match ModalRoot, split preset pills + Reset to Flat into two non-wrapping 4-item flow-children='horizontal' rows with MAINTAIN_X / initial body focus"
    - "Pass Router.MainRunningApp?.display_name from QAM bind, backfill empty app_name via vdf_parser.get_installed_games() in SoundtrackManager & game.name in SoundtracksTab, and render SettingsTab Active Game EQ Override badge on its own dedicated full-width banner row"
  debug_session: .planning/debug/phase-19-uat-ui-layout-navigation.md
