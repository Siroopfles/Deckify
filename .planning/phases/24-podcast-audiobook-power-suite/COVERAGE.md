# API Coverage — Spotify Web API & Spotify Client CDP (Phase 24)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.

| capability | decision | reason |
|---|---|---|
| shows/{id}/episodes (market=from_token, resume_point) | INTEGRATE | |
| user-read-playback-position OAuth scope | INTEGRATE | |
| me/player/seek (-15s/+15s smart-skip) | INTEGRATE | |
| Spotify Client CDP PlayerAPI.setSpeed (0.5x-2.0x) | INTEGRATE | |
| librespot playback speed control | OPT-OUT | librespot does not expose a runtime playback speed API; returns unsupported_backend: true cleanly |
| Spotify Web API audiobooks/{id}/chapters | OPT-OUT | not needed — audiobook chapter resume and speed use existing playback state and CDP PlayerAPI.setSpeed |
