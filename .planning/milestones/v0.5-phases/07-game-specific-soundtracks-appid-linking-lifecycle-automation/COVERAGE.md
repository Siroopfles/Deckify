# Phase 07: External API Coverage Matrix

External API surface evaluated for Phase 07 (`Game-Specific Soundtracks (appId Linking & Lifecycle Automation)`).

| capability | decision | reason |
|---|---|---|
| `GET /me/player` (playback state snapshot & active device) | INTEGRATE | |
| `PUT /me/player/play` (start/resume context & `position_ms` seek) | INTEGRATE | |
| `PUT /me/player/pause` (exit `pause` policy) | INTEGRATE | |
| `PUT /me/player/shuffle` (per-game sequential/shuffle mode) | INTEGRATE | |
| `GET /me/playlists`, `/me/albums`, `/search` (PlaylistPickerModal) | INTEGRATE | |
| `GET /me/player/devices` & `PUT /me/player` (Connect device wake-up) | INTEGRATE | |
| `SteamClient.Apps.RegisterForAppLifetimeNotifications` | INTEGRATE | |
| `PUT /me/player/volume` (remote playback volume) | OPT-OUT | Local PipeWire/PulseAudio sink-input volume (`VolumeFader`) is used to avoid Spotify API rate limits and 0ms-latency ducking |
| `POST /me/player/queue` (merging multiple playlists) | OPT-OUT | Spotify cannot merge playlist contexts natively; multi-playlist shuffle mode selects one pool entry at random with shuffle enabled |
