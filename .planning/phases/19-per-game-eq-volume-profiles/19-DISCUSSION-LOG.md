# Phase 19: Per-Game EQ & Volume Profiles - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-18
**Phase:** 19-per-game-eq-volume-profiles
**Areas discussed:** Per-Game EQ Selector & Custom Curve Scope, Volume & Ducking Override Semantics, Audio-Only Profiles & Launch Timing, Exit Restoration, Crash Recovery & Sleep Lock

---

## Per-Game EQ Selector & Custom Curve Scope

### Q1: How should per-game EQ presets and custom curves be configured in SoundtracksTab?
| Option | Description | Selected |
|--------|-------------|----------|
| Preset dropdown only (Use Global + the 7 EQ presets) | Uses a compact DropdownItem in SoundtracksTab to avoid 10-slider focus bloat inside game cards | |
| Preset dropdown + per-game custom 10-band modal editor | Adds an 'Edit Game EQ' button next to the dropdown when 'Custom' is selected, opening a dedicated modal to store a per-game 10-band curve on the game profile | ✓ |
| Preset dropdown + inline 10-band sliders inside the game card | Expands 10 SliderField controls directly inside the game card when 'Custom' is chosen | |

**User's choice:** Preset dropdown + per-game custom 10-band modal editor

### Q2: How should the per-game 10-band EQ modal initialize its curve and handle live audio preview while editing?
| Option | Description | Selected |
|--------|-------------|----------|
| Seed from current active/global curve + live pw-cli audio preview while modal is open | Initializes new per-game custom curves from the user's current global curve (plus a 'Copy from Preset / Reset Flat' helper) and previews slider changes live via pw-cli while open, restoring active EQ on close if the game isn't running | ✓ |
| Seed from Flat (0 dB) + live pw-cli audio preview only when the game is currently running | Starts new per-game custom curves at all 0.0 dB and only sends live pw-cli updates if that game is actively running | |
| Seed from Flat (0 dB) + save-only (no live audio preview while editing) | Editing in the modal only writes eq_custom_bands to the game profile without touching PipeWire until launch | |

**User's choice:** Seed from current active/global curve + live pw-cli audio preview while modal is open

### Q3: How should the global Equalizer card in SettingsTab behave while a per-game EQ override is actively running?
| Option | Description | Selected |
|--------|-------------|----------|
| Show an 'Active Game EQ Override' badge in SettingsTab; edits update the global baseline without breaking the active game override | Keeps the global baseline intact while clearly indicating which game's EQ is currently overriding PipeWire | ✓ |
| Edits in SettingsTab immediately supersede the running game's EQ override for this session AND save as the new global baseline | Lets the user override the game's EQ on the fly from SettingsTab, still restoring to that new global baseline on game exit | |
| Edits in SettingsTab automatically save into the running game's profile instead of the global baseline while a game is active | Redirects SettingsTab EQ changes to the active game profile | |

**User's choice:** Show an 'Active Game EQ Override' badge in SettingsTab; edits update the global baseline without breaking the active game override

### Q4: When a user edits the currently running game's EQ preset in SoundtracksTab, should it apply immediately?
| Option | Description | Selected |
|--------|-------------|----------|
| Live hot-apply to the active game session | Changing the running game's EQ preset (including switching back to 'Use Global') or adjusting its custom curve in SoundtracksTab updates EqualizerManager's ephemeral override immediately | ✓ |
| Apply on next game launch only | Persists the updated EQ preset/curve to the game profile on disk, taking effect the next time the game launches | |

**User's choice:** Live hot-apply to the active game session

---

## Volume & Ducking Override Semantics

### Q1: Should per-game volume and ducking overrides execute 100% locally via PipeWire VolumeFader?
| Option | Description | Selected |
|--------|-------------|----------|
| 100% Local PipeWire VolumeFader override | Route per-game target volume and ducking levels strictly through local PipeWire sink-input scaling in VolumeFader (cosine-eased, zero Spotify Web API calls, zero double-attenuation) | ✓ |
| Hybrid Cloud + Local PipeWire | Set Spotify Web API cloud volume for base volume_override and apply local PipeWire attenuation on top for ducking | |

**User's choice:** 100% Local PipeWire VolumeFader override

### Q2: How should the per-game volume and ducking controls in SoundtracksTab map to VolumeFader?
| Option | Description | Selected |
|--------|-------------|----------|
| Keep the single Volume Override slider + Ducking Override toggle | When Volume Override is set (0–100%), VolumeFader scales the local PipeWire sink-input directly to that target; when Disabled, uses global ducking or 100% baseline | |
| Add a second separate 'Ducking Attenuation (%)' slider per game card | Exposes two sliders per game card in SoundtracksTab: one for un-ducked in-game base volume and a second for per-game ducking attenuation % | ✓ |

**User's choice:** Add a second separate 'Ducking Attenuation (%)' slider per game card

### Q3: How should the Volume Override slider and the Ducking Attenuation Override slider interact during gameplay?
| Option | Description | Selected |
|--------|-------------|----------|
| Volume Override sets the game's base ceiling (0–100%), and Ducking Level Override sets the custom game-ducking attenuation % when Ducking Override is ON | Scales the game's base ceiling down by the ducking attenuation % (and dips for voice chat if lower); if Ducking Override is OFF, stays at the Volume Override ceiling | ✓ |
| Volume Override sets normal gameplay volume, and the second slider only applies when Discord/Steamcord Voice Chat ('voice') is active | Game launch uses Volume Override directly, and the second slider only attenuates when microphone voice activity is detected | |

**User's choice:** Volume Override sets the game's base ceiling (0–100%), and Ducking Level Override sets the custom game-ducking attenuation % when Ducking Override is ON

### Q4: How should VolumeFader respond when the user edits the running game's volume or ducking sliders mid-game?
| Option | Description | Selected |
|--------|-------------|----------|
| Live cosine-eased update in VolumeFader + live QAM effective_volume sync | Changing the active game's volume or ducking overrides in SoundtracksTab immediately recalculates VolumeFader's target sink volume, smoothly fades, and emits ducking_state_changed | ✓ |
| Save to profile and apply on next game launch | Only applies volume/ducking overrides when handle_app_lifecycle triggers on game launch | |

**User's choice:** Live cosine-eased update in VolumeFader + live QAM effective_volume sync

---

## Audio-Only Profiles & Launch Timing

### Q1: Should per-game EQ and volume/ducking overrides apply even when no playlist is linked or auto-started?
| Option | Description | Selected |
|--------|-------------|----------|
| Always activate per-game EQ & volume/ducking overrides on game launch | Even if a game profile has 0 playlists linked (audio-only profile) or triggers soundtrack_prompt_switch without auto-starting its playlist, apply the game's EQ and volume/ducking overrides | ✓ |
| Only activate EQ & volume/ducking overrides when the game's linked soundtrack playlist actually starts playing | Skip EQ/volume overrides if no playlist is linked or if the user declines switching playlists | |

**User's choice:** Always activate per-game EQ & volume/ducking overrides on game launch

### Q2: When should the per-game EQ preset and volume/ducking override activate on game launch?
| Option | Description | Selected |
|--------|-------------|----------|
| Sequenced atomic transition after launch debounce | Wait for the launch debounce window, apply the per-game EQ preset first, invalidate VolumeFader's cached sink-input ID, and then smoothly fade to the game's volume/ducking target | ✓ |
| Immediate at t=0s before launch debounce | Switch PipeWire EQ and fade volume immediately when RegisterForAppLifetimeNotifications fires bRunning=true, while only debouncing Spotify playlist playback by 3.5s | |

**User's choice:** Sequenced atomic transition after launch debounce

### Q3: How should game cards in SoundtracksTab indicate configured per-game EQ and volume/ducking overrides?
| Option | Description | Selected |
|--------|-------------|----------|
| Show concise audio override summary chips/text in the game row subtitle | E.g., '2 linked soundtracks • EQ: Gaming • Vol: 65% • Duck: 40%' (or 'Audio profile only • EQ: Bass Boost • Vol: 70%' when 0 playlists are linked) | ✓ |
| Keep subtitle strictly for soundtrack counts only | Keep 'No soundtrack configured' when 0 playlists are linked and only show EQ/volume settings inside the expanded card body | |

**User's choice:** Show concise audio override summary chips/text in the game row subtitle

### Q4: How should back-to-back game switches handle the global baseline snapshot and ephemeral overrides?
| Option | Description | Selected |
|--------|-------------|----------|
| Preserve the original pre-game global baseline snapshot across back-to-back game switches | Never overwrite the saved global baseline with Game A's ephemeral EQ/volume override; immediately transition from Game A's profile to Game B's profile | ✓ |
| Treat Game A's active override as the new baseline when Game B launches during the 3s debounce | Snapshot whatever EQ/volume is currently active at the moment Game B starts | |

**User's choice:** Preserve the original pre-game global baseline snapshot across back-to-back game switches

---

## Exit Restoration, Crash Recovery & Sleep Lock

### Q1: When a game exits, should per-game EQ and volume/ducking overrides always restore to the global baseline?
| Option | Description | Selected |
|--------|-------------|----------|
| Always restore global EQ and volume/ducking baseline on game exit | Regardless of whether exit_policy is 'restore_snapshot', 'pause', or 'keep_playing' (or manual pause in-game), exiting always clears the ephemeral override and restores global baseline | ✓ |
| Keep the game's EQ override active after game exit when exit_policy is 'keep_playing' | Leave the game's EQ preset running in SteamOS GamepadUI until another playlist or game starts | |

**User's choice:** Always restore global EQ and volume/ducking baseline on game exit

### Q2: How should crash recovery handle active_game_override_snapshot on plugin startup?
| Option | Description | Selected |
|--------|-------------|----------|
| Restore global EQ & volume baseline on boot unless the frontend immediately reports that same game app_id is still running | Clear stale active_game_override_snapshot on _main() boot and apply the global eq_preset / eq_custom_bands (plus un-duck VolumeFader) | ✓ |
| Keep the snapshot active on boot until the user manually opens SoundtracksTab or launches/exits another game | Leave whatever EQ was running before the crash active until a new AppLifetime event arrives | |

**User's choice:** Restore global EQ & volume baseline on boot unless the frontend immediately reports that same game app_id is still running

### Q3: How should game exit restoration behave when the Sleep Timer priority lock (_sleep_locked) is active?
| Option | Description | Selected |
|--------|-------------|----------|
| Respect _sleep_locked strictly for volume/playback, while still restoring global EQ & clearing the game snapshot | Skip VolumeFader un-ducking and skip pre-game playback restoration/play_tracks so Sleep Timer never gets interrupted or blasted, while still clearing active_game_override_snapshot and restoring global EQ | ✓ |
| Defer all game exit restoration (EQ, volume, and playback) until Sleep Timer completes or is cancelled | Hold the game exit restore until release_sleep_lock() runs | |

**User's choice:** Respect _sleep_locked strictly for volume/playback, while still restoring global EQ & clearing the game snapshot

### Q4: In what order should global EQ restoration and VolumeFader un-ducking execute on game exit?
| Option | Description | Selected |
|--------|-------------|----------|
| Restore EQ first (moving stream cleanly before tearing down deckify_eq_sink), invalidate VolumeFader's cached sink-input ID, then smoothly fade VolumeFader back to the global baseline | Mirrors the launch sequence in reverse so PipeWire never corks playback or targets a stale sink-input ID during un-ducking | ✓ |
| Un-duck VolumeFader first, then restore global EQ | Fade volume up on deckify_eq_sink before tearing down or switching EQ | |

**User's choice:** Restore EQ first, invalidate VolumeFader's cached sink-input ID, then smoothly fade VolumeFader back to the global baseline

---

## the agent's Discretion
- Exact modal layout and button styling for the Edit Game EQ modal
- Exact ephemeral state representation inside EqualizerManager and helper RPC signatures for live modal preview
- Exact active_game_override_snapshot JSON structure in py_modules/common.py and settings.json

## Deferred Ideas
None — discussion stayed within Phase 19 scope (`GAME-01`).
