# Phase 7: Game-Specific Soundtracks (appId Linking & Lifecycle Automation) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.  
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-12  
**Phase:** 07-game-specific-soundtracks-appid-linking-lifecycle-automation  
**Areas discussed:** Profile Creation & Game Binding UX, Launch Playback Mode, Game Exit & Restore Policy, Unbound Game Behavior  

---

## Profile Creation & Game Binding UX

| Option | Description | Selected |
|--------|-------------|:--------:|
| Dual approach: QAM + Settings | 1-Click button ('Set current playlist for active game') in QAM/Modal plus a Game Soundtrack manager in SettingsTab | |
| Dedicated Settings Manager only | Pick from installed Steam games list and assign a Spotify playlist/album from your library | |
| Quick Access Menu only | A lightweight binding toggle directly in the QAM mini-player while a game is actively running | |
| Custom / Dedicated Tab & Actions | Separate dedicated tab for installed Steam & Non-Steam games + multiple playlists support, QAM 1-click button, and Decky game options context menu integration | ✓ |

**User's choice:** Een speciale tab voor het beheren van installed steam games (+non steam games) een manier om playlisten daar aan de game toetevoegen ook meerdere playlisten. ook een simpele button in QAM voor set current playlist for active game. Apart van settingstab. En een optie in SteamOS via Decky om een playlist aan een game toe te voegen via het menu van options bij game.  
**Notes:** Explicit requirement for multiple playlists per game profile and dedicated top-level navigation tab.

---

### Multiple Playlists Handling

| Option | Description | Selected |
|--------|-------------|:--------:|
| Multi-playlist Shuffle | Combine all tracks from assigned playlists into a shuffled pool on launch | ✓ |
| Random Playlist Picker | Randomly select one of the assigned playlists each time the game launches | ✓ |
| Sequential / Playlist Rotation | Remember which playlist played last and rotate to the next assigned playlist | ✓ |

**User's choice:** Instelbaar wat je wilt maar al deze opties sowieso (All three options supported and configurable per game profile).  

---

### Game Discovery & Ordering

| Option | Description | Selected |
|--------|-------------|:--------:|
| Prioritize Active / Recent | Prioritize active/recently played games at top with a search bar and list of all installed Steam + Non-Steam titles | ✓ |
| Alphabetical Grid/List | Alphabetical grid/list of all installed games with game art and badges | |
| Agent Discretion | Automatic sort by most played / recent with quick filter | |

**User's choice:** Prioriteer actieve/recent gespeelde games bovenaan met een zoekbalk en lijst van alle geïnstalleerde Steam + Non-Steam titels.  

---

### SteamOS Context Menu Integration

| Option | Description | Selected |
|--------|-------------|:--------:|
| Decky Action / Context Menu with fallback | Attempt Decky Action/Game Context Menu registration ('Link Spotify playlist'); gracefully fall back to QAM and dedicated tab if Decky API restricts it | ✓ |
| Dedicated tab + QAM only | Focus strictly on tab and QAM button | |

**User's choice:** Probeer Decky Action/Game Context Menu te registreren ('Koppel Spotify afspeellijst'); val soepel terug op QAM en de dedicated tab als Decky API dit beperkt.  

---

### Playlist Picker Modal

| Option | Description | Selected |
|--------|-------------|:--------:|
| Tabbed Modal Picker | Tabs for 'My Playlists', 'My Albums', and a Spotify search bar to directly search and find any playlist/album | ✓ |
| Library Playlists Only | Show only followed/saved Spotify playlists | |
| Manual URI input | Text input with preview | |

**User's choice:** Toon een modal picker met tabbladen: 'Mijn Playlists', 'Mijn Albums', en een Spotify zoekbalk om elke afspeellijst direct te vinden.  

---

### Per-Game Volume Override & Ducking

| Option | Description | Selected |
|--------|-------------|:--------:|
| Custom volume & ducking toggle per game | Optional override per game: custom volume slider and toggle to disable/enable ducking for this game | ✓ |
| Global settings only | Always use global Deckify volume and ducking | |

**User's choice:** Ja, optionele override per game: 'Use custom volume' slider en optie om ducking voor deze game uit te zetten.  

---

### Non-Steam Shortcuts

| Option | Description | Selected |
|--------|-------------|:--------:|
| Automatic Detection with Badge | Auto-detect via Steam shortcuts.vdf with banner/icon and clear 'Non-Steam' badge | ✓ |
| Identical to Steam games | Show without distinguishing badge | |

**User's choice:** Automatisch detecteren via Steam shortcuts.vdf met hun eigen banner/icon en duidelijke 'Non-Steam' badge.  

---

### Bound Playlist Item Management

| Option | Description | Selected |
|--------|-------------|:--------:|
| Direct List with Covers and Remove X | Direct list of bound playlists with cover thumbnail, title, remove button (X), and 'Add playlist' button | ✓ |
| Compact badge-tags | Compact tags with quick remove | |

**User's choice:** Directe lijst van gekoppelde playlists met cover-thumbnail, titel, verwijder-knop (X) en 'Voeg afspeellijst toe' knop.  

---

## Launch Playback Mode

| Option | Description | Selected |
|--------|-------------|:--------:|
| 3-4s Debounce | 3 to 4 seconds debounce (allows Proton/splash screens to load cleanly and avoids audio stutter) | ✓ |
| Instant (0-1s) | Immediate playback trigger | |
| Configurable Delay | 1s to 10s configurable delay slider | |

**User's choice:** 3 tot 4 seconden debounce.  

---

### Resume vs Fresh Start

| Option | Description | Selected |
|--------|-------------|:--------:|
| Configurable Resume Mode | Configurable per game: 'Remember position' (resume where left off) OR 'Fresh start / Shuffle'. Default = Remember position | ✓ |
| Always Fresh Shuffle | Fresh random track every launch | |
| Always Track 1 | Start from track 1 | |

**User's choice:** Instelbaar per game: 'Onthoud positie' OF 'Altijd opnieuw beginnen / Fresh Shuffle'. Standaard = Onthoud positie.  

---

### Pre-Existing Music at Launch

| Option | Description | Selected |
|--------|-------------|:--------:|
| Toast Notification with Switch Option | Show a Steam toast notification with option to switch over, unless 'Always auto-start' is enabled in game profile | ✓ |
| Auto-switch immediately | Always switch to soundtrack directly | |
| Keep playing current music | Do not interrupt active music | |

**User's choice:** Toon een Steam toast notificatie met de optie om over te schakelen, tenzij 'Altijd auto-start' is aangevinkt in het gameprofiel.  

---

### Idle Spotify at Launch

| Option | Description | Selected |
|--------|-------------|:--------:|
| Auto-wake Connect Engine | If auto-play enabled for this game: activate Deckify Spotify Connect device and start playback | ✓ |
| Only start if already active | Do not wake Connect device if paused | |

**User's choice:** Ja, mits 'Auto-play on game launch' aan staat voor deze game: activeer het Deckify Spotify Connect device en start de muziek.  

---

## Game Exit & Restore Policy

| Option | Description | Selected |
|--------|-------------|:--------:|
| Restore Pre-Game Snapshot | Restore pre-game snapshot (resume song & position if music was playing prior to launch; cleanly pause if idle); configurable with other options | ✓ |
| Always pause | Stop all music on game exit | |
| Keep soundtrack playing | Continue soundtrack playback in Steam GamepadUI | |

**User's choice:** Recommended (restore snapshot) maar wel instelbaar en evt de andere opties.  

---

### Manual Pause During Gameplay

| Option | Description | Selected |
|--------|-------------|:--------:|
| Respect Manual Pause | Respect manual pause (remain paused on game exit); configurable with auto-restore or toast prompt options | ✓ |
| Always restore | Auto-restore pre-game music regardless | |
| Toast prompt | Prompt whether to resume | |

**User's choice:** Recommended (respect manual pause) maar ook instelbare toast en andere optie.  

---

### Exit Debounce Duration

| Option | Description | Selected |
|--------|-------------|:--------:|
| 3.0s Exit Debounce | Proven reliable in Phase 6 ducking, prevents flapping during resolution switches or launchers | ✓ |
| 5.0s Exit Debounce | Extra safety for heavy games | |
| Configurable slider | 1s to 10s slider | |

**User's choice:** 3.0 seconden exit debounce.  

---

### Saving Playback Position on Exit

| Option | Description | Selected |
|--------|-------------|:--------:|
| Automatic Save URI + ms | Save track URI + ms position automatically, configurable per profile | ✓ |
| Only if resume active | Save only when resume mode enabled | |
| Track index only | Save index without ms precision | |

**User's choice:** Recommended maar ook instelbaar.  

---

## Unbound Game Behavior

| Option | Description | Selected |
|--------|-------------|:--------:|
| Configurable Global Option | Configurable global option: 'Unbound games: Keep Playing (with ducking) vs Auto-pause'. Default = Keep Playing | ✓ |
| Always Keep Playing | Keep playing existing music with ducking | |
| Always Auto-pause | Automatically pause on unbound game launch | |

**User's choice:** Instelbare globale optie: 'Unbound games: Keep Playing (met ducking) vs Auto-pause'. Standaard = Keep Playing.  

---

### Binding Prompt for Unbound Games

| Option | Description | Selected |
|--------|-------------|:--------:|
| Subtle QAM indicator only | Subtle button/indicator in QAM mini-player ('Bind current playlist to this game'), no intrusive toasts | ✓ |
| Steam Toast notification | Toast popup when unbound game starts | |
| No prompts | Manual configuration only | |

**User's choice:** Alleen een subtiele indicator/knop in de QAM mini-player ('Koppel huidige playlist aan deze game'), geen storende toast pop-ups tijdens het gamen.  

---

### Fallback Game Soundtrack

| Option | Description | Selected |
|--------|-------------|:--------:|
| Fallback Soundtrack Setting | Optional 'Default / Fallback Game Soundtrack' toggle in settings to play a designated playlist for unbound games | ✓ |
| No fallback | Only explicitly linked games receive soundtracks | |

**User's choice:** Optionele 'Default / Fallback Game Soundtrack' toggle in instellingen: speel een vaste playlist af voor alle games zonder specifiek profiel.  

---

### Custom Ducking for Unbound Games

| Option | Description | Selected |
|--------|-------------|:--------:|
| Ducking-only profiles | Yes: game profiles can specify custom audio ducking levels even without an assigned soundtrack | ✓ |
| Strictly separated | Ducking always uses global settings | |

**User's choice:** Ja: een gameprofiel kan zowel een soundtrack als een specifieke audio-ducking instelling bevatten (zelfs zonder soundtrack).  

---

## the agent's Discretion

- Visual styling of the Soundtracks tab matching SteamOS GamepadUI aesthetic and responsive focus handling.
- Internal caching of installed game metadata in memory to avoid repeated disk reads.
- Snapshot state machine resilience against network dropouts and headless test runs.

## Deferred Ideas

- None — all decisions and features requested remained within Phase 7 scope.
