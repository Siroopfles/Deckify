# API Coverage — Spotify Connect / Player API (Phase 22)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

| capability | decision | reason |
|---|---|---|
| `GET /me/player/devices` (Connect device discovery) | INTEGRATE | |
| `PUT /me/player` (Transfer playback to Steam Deck) | INTEGRATE | |
| `PUT /me/player/volume` (Remote Connect device volume) | INTEGRATE | |
| Crossfade sync (Client CDP / `prefs` + `librespot` PipeWire) | INTEGRATE | |
| `GET /me/player/queue` / `POST /me/player/queue` | OPT-OUT | Already implemented in earlier phases; out of scope for Phase 22 Connect Hub 2.0 & Crossfade |
| `PUT /me/player/repeat` / `PUT /me/player/shuffle` | OPT-OUT | Already implemented in earlier phases; out of scope for Phase 22 |
