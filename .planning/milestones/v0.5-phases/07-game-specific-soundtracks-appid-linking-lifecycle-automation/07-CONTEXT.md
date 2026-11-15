# Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation) - Context

**Gathered:** 2026-11-12  
**Status:** Ready for planning  

<domain>
## Phase Boundary

Phase 7 delivers game-specific soundtrack automation. It enables users to link Steam games and Non-Steam shortcuts by `appId` to one or more Spotify playlists/albums, automatically orchestrates playback transitions upon game launch and exit with launcher debounce and state restoration, and provides a dedicated Soundtracks management tab alongside quick in-game actions in the Quick Access Menu.

</domain>

<decisions>
## Implementation Decisions

### Profile Creation & Game Binding UX
- **D-01 (Dedicated Soundtracks Tab & Navigation):** Create a dedicated "Soundtracks" / "Games" tab in the Expanded Modal (`DeckifyExpandedModal.tsx`) specifically for managing installed Steam & Non-Steam games and their assigned music, kept separate from `SettingsTab.tsx`. — **Reversibility:** costly — introduces a new primary navigation tab and component architecture.
- **D-02 (Multi-Playlist Support Per Game):** Allow linking multiple playlists or albums to a single game profile. Users can configure how multiple playlists are handled: Multi-playlist Shuffle (combined track pool), Random Playlist Picker (selects one playlist at launch), or Sequential Rotation (cycles to next playlist on each launch). — **Reversibility:** costly — data schema in `game_audio_profiles` must store an array of playlists and playback mode.
- **D-03 (Installed Games Discovery & Display):** The Soundtracks tab discovers installed games via SteamClient APIs / shortcuts, prioritizing actively running and recently played games at the top, equipped with an instant search/filter bar and cover artwork. — **Reversibility:** reversible
- **D-04 (Quick Access Menu & Game Context Menu Shortcuts):** Provide a quick 1-click "Set current playlist for active game" button in the QAM mini-player while a game is running. Attempt registering a SteamOS Game Context Menu action ("Link Spotify playlist") via Decky loader, with seamless fallback to QAM and the Soundtracks tab. — **Reversibility:** reversible
- **D-05 (Modal Playlist & Album Picker):** When assigning music in the Soundtracks tab, display a modal picker with tabs for "My Playlists", "My Albums", and a direct Spotify search bar. — **Reversibility:** reversible
- **D-06 (Per-Game Volume & Ducking Override):** Each game profile can optionally specify a custom volume slider override and a toggle to enable/disable audio ducking specifically for that game. — **Reversibility:** reversible
- **D-07 (Non-Steam Shortcut Detection):** Parse Steam `shortcuts.vdf` to detect Non-Steam games (emulators, Heroic, Lutris), compute normalized unsigned 32-bit CRC appIds, and render them with a distinct "Non-Steam" badge. — **Reversibility:** costly — CRC32 normalization and non-Steam shortcut parsing.
- **D-08 (Profile Playlist Management):** Game cards show a direct list of assigned playlists with cover thumbnails, title, remove button (X), and an "Add playlist" button. — **Reversibility:** reversible

### Launch Playback Mode
- **D-09 (Launch Debounce Window):** Enforce a 3.0 to 4.0 second debounce window after `SteamClient.Apps.RegisterForAppLifetimeNotifications` signals `bRunning: true` before starting soundtrack playback, allowing Proton, shaders, and splash screens to initialize without audio stuttering or process flapping. — **Reversibility:** reversible
- **D-10 (Track Position & Resume Mode):** Configurable per game profile: "Remember position" (saves and resumes exact track URI and millisecond seek position) vs "Fresh start / Shuffle". Default is "Remember position". — **Reversibility:** reversible
- **D-11 (Pre-Game Playback Interruption Notification):** If music is already playing when a game with a soundtrack launches, display a Steam toast notification with an option to switch over to the game soundtrack, unless "Always auto-start" is enabled in that game's profile. Pre-game state is captured in a snapshot. — **Reversibility:** reversible
- **D-12 (Connect Engine Activation):** If Spotify is paused or idle at game launch, Deckify wakes up the local Spotify Connect device (`librespot` / `spotifyd`) and begins soundtrack playback (when auto-play is enabled). — **Reversibility:** reversible

### Game Exit & Restore Policy
- **D-13 (Pre-Game Snapshot Restoration Default):** Upon game exit, default to restoring the pre-game playback snapshot (resumes pre-game track and seek position if music was playing prior to launch; pauses cleanly if idle). Configurable per profile or globally (options: restore snapshot, always pause, or keep soundtrack playing). — **Reversibility:** reversible
- **D-14 (Respect Manual In-Game Pause):** If the user manually pauses Spotify during gameplay, Deckify respects this and remains paused upon game exit (no unexpected music blast), with configurable options for auto-restore anyway or a toast prompt ("Resume pre-game music?"). — **Reversibility:** reversible
- **D-15 (3.0s Exit Debounce):** Use a 3.0s debounce timer on game exit before triggering state restore, matching Phase 6's tested behavior to prevent false exits during resolution changes or launcher shutdowns. — **Reversibility:** reversible
- **D-16 (Save Track URI & Milliseconds on Exit):** Automatically record the current track URI and playback position in milliseconds into the game's profile state in `settings.json` on exit so the next session can resume seamlessly. — **Reversibility:** reversible

### Unbound Game Behavior
- **D-17 (Unbound Games Global Policy):** Configurable global setting: "Unbound games: Keep Playing (with ducking) vs Auto-pause". Default is "Keep Playing" to preserve existing user experience. — **Reversibility:** reversible
- **D-18 (Subtle QAM Binding Indicator):** When an unbound game is active, display a subtle indicator/button in the QAM mini-player ("Bind current music to this game"), avoiding intrusive toast popups during gameplay. — **Reversibility:** reversible
- **D-19 (Default / Fallback Soundtrack Option):** Provide an optional "Default / Fallback Game Soundtrack" toggle in settings to automatically play a designated playlist for any game that lacks a specific profile. — **Reversibility:** reversible
- **D-20 (Ducking-Only Game Profiles):** Allow game profiles to define custom ducking volumes even when no soundtrack playlist is assigned (e.g. duck music by 70% during Cyberpunk). — **Reversibility:** reversible

### the agent's Discretion
- Exact layout styling and transitions of the Soundtracks tab matching SteamOS GamepadUI design guidelines.
- Internal caching of installed game metadata in memory to avoid repeated disk reads of `shortcuts.vdf`.
- Snapshot storage mechanism in `Plugin` backend runtime memory with fallback serialization in `settings.json`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing:**

### GamepadUI & Steam Client Lifecycle
- `src/index.tsx` — Lines 766–797: Existing `SteamClient.Apps.RegisterForAppLifetimeNotifications` hook, exit debounce timer, and QAM content mounts.
- `src/components/DeckifyExpandedModal.tsx` — Tab navigation bar, tab switching logic, and modal container layout.
- `src/types.ts` — `EngineSettings`, `TabType`, and `PlaybackState` interface definitions.

### Backend Playback & Settings
- `py_modules/common.py` — `DEFAULT_SETTINGS` dictionary, `game_audio_profiles` definition, and `_save_settings`.
- `py_modules/rpc_playback.py` — `play_tracks` (context URI, offset, URI lists), `get_player_state`, and `control_playback`.
- `py_modules/volume.py` — `VolumeFader` class, audio ducking triggers, and PipeWire sink-input volume control.
- `main.py` — RPC methods (`trigger_ducking`, `save_setting`, `control_playback`).

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` — SOUND-01, SOUND-02, SOUND-03.
- `.planning/ROADMAP.md` — Phase 7 success criteria and dependency chain.
- `.planning/phases/06-smooth-audio-ducking-engine-pipewire-fader/06-CONTEXT.md` — Preceding audio ducking decisions and `RegisterForAppLifetimeNotifications` integration.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SteamClient.Apps.RegisterForAppLifetimeNotifications`: Already active in `src/index.tsx` for audio ducking; can be extended or unified to emit game lifecycle events to the soundtrack manager.
- `play_tracks` in `py_modules/rpc_playback.py`: Supports `context_uri`, `uris`, and `position` offset. Can execute both playlist context play and direct URI sequence play.
- `game_audio_profiles` in `py_modules/common.py`: Existing settings dictionary structure ready to store per-game soundtrack bindings and volume/ducking overrides.
- `backendTriggerDucking` in `src/index.tsx`: RPC bridge to Python backend for game state changes.

### Established Patterns
- Steam CEF CSP compliant base64 image proxy (`py_modules/images.py` and `fetchImageAsBase64`).
- Atomic settings persistence in `py_modules/common.py` via `_save_settings`.
- 3000ms debounce pattern for game exit to prevent flapping during resolution changes or Proton launcher shutdowns.

### Integration Points
- `src/components/tabs/SoundtracksTab.tsx` (new): Dedicated tab in Expanded Modal for game soundtrack management.
- `src/components/DeckifyExpandedModal.tsx`: Add "Soundtracks" tab button to navigation bar.
- `py_modules/soundtrack.py` (new or integrated): Backend snapshot/restore engine and profile coordinator.
- `src/index.tsx`: QAM mini-player button ("Bind Current Music to Game") and AppLifetime dispatch.

</code_context>

<specifics>
## Specific Ideas

- **Multiple Playlists Support:** A user can assign e.g. "Synthwave Radio" and "Cyberpunk 2077 Official Soundtrack" to Cyberpunk 2077, with a mode selector (Shuffle Pool, Random Pick, or Rotation).
- **Proton Debounce:** 3-4s debounce window to let game splash screens load before starting music.
- **Pre-Game State Snapshot:** Capture `{ context_uri, track_uri, position_ms, is_playing, volume }` before launching soundtrack, allowing flawless restoration when returning to SteamOS GamepadUI.

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed strictly within the phase scope of game soundtracks, lifecycle automation, and binding UX.

</deferred>

---

*Phase: 07-Game-Specific Soundtracks (appId Linking & Lifecycle Automation)*  
*Context gathered: 2026-11-12*
