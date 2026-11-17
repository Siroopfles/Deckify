# Phase 17: Event-Driven librespot & Suspend/Wi-Fi Resilience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-17
**Phase:** 17-Event-Driven librespot & Suspend/Wi-Fi Resilience
**Areas discussed:** Suspend & Wi-Fi resume policy, Fallback polling & remote devices, Bookmark staleness & conflict handling, Resilience UI & notifications

---

## Suspend & Wi-Fi resume policy

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-resume only if playing before sleep/drop (Recommended) | Restore track & position and resume playback only when it was actively playing; if paused, keep paused. | ✓ |
| Restore bookmark paused | Re-cue the track & position after wake/reconnect, but let the user press Play manually. | |
| Auto-resume on Wi-Fi drop, stay paused on Sleep | Resume automatically after transient Wi-Fi drops, but stay paused after Steam Deck sleep. | |
| You decide | Use your best judgment for Steam Deck handheld ergonomics. | |

**User's choice:** Auto-resume only if playing before sleep/drop (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Short grace window (e.g., 3–5s) before bookmarking/restoring (Recommended) | Ignore sub-second AP roaming blips; only trigger full bookmark restore if connectivity actually drops and recovers. | ✓ |
| Immediate bookmark on any network drop | Snapshot and trigger recovery as soon as a DNS/socket/API failure or NetworkManager offline event occurs. | |
| You decide | Handle debounce/grace tuning automatically. | |

**User's choice:** Recommended + buffer-aware handling ("Houd rekening met buffer die spotify heeft omdat hij het streamt en ondertussen download vgm of zoek uit hoe dat precies werkt ook maar dat met de recommended van deze")
**Notes:** User requested accounting for `librespot`'s streaming/download buffer so brief Wi-Fi drops that play through the buffer are not interrupted unnecessarily, and having research verify `librespot`'s exact buffering behavior.

---

## Fallback polling & remote devices

| Option | Description | Selected |
|--------|-------------|----------|
| Relax to ~15–30s when --onevent is healthy (Recommended) | Cuts Web API calls by 5–10x while still catching external phone/PC Spotify Connect changes and metadata/like state reasonably fast. | ✓ |
| Relax to ~60s when --onevent is healthy | Maximum HTTP 429 protection; remote device changes take up to a minute to reflect when Deckify modal isn't actively open. | |
| Adaptive: ~30s idle / ~10s when modal or QAM is open | Stay ultra-quiet in-game, slightly fresher when browsing Deckify UI. | |
| You decide | Pick the best balance between 429 protection and remote sync. | |

**User's choice:** Relax to ~15–30s when --onevent is healthy (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-revert to 3s when remote device or spotify_client is active (Recommended) | Only relax polling when librespot is the active Connect device and --onevent is healthy; keep responsive 3s polling otherwise. | ✓ |
| Keep relaxed polling always unless user opens the modal | Prioritize minimal API usage even when playing on another device. | |
| You decide | Handle fallback cadence switching automatically. | |

**User's choice:** Auto-revert to 3s when remote device or spotify_client is active (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate UI state from --onevent + debounced Web API enrichment (Recommended) | Show track/play/pause/seek in UI immediately (<50ms), and debounce liked-status/Web API enrichment (~300–500ms) so rapid skipping never spams API calls. | ✓ |
| Immediate UI state + immediate Web API fetch per track | Fetch liked status & full metadata on every skip without debouncing. | |
| You decide | Optimize rapid-skip handling to avoid stutters and 429s. | |

**User's choice:** Immediate UI state from --onevent + debounced Web API enrichment (Recommended)

---

## Bookmark staleness & conflict handling

| Option | Description | Selected |
|--------|-------------|----------|
| Yield if another device is actively playing on wake (Recommended) | Before restoring the bookmark, check me/player: if another Spotify Connect device (e.g., phone/PC) is already playing, don't hijack playback back to Steam Deck. | ✓ |
| Always restore to Steam Deck if it was playing before sleep | Even if you started listening on your phone while the Deck slept, waking the Deck reclaims playback. | |
| You decide | Pick the safest conflict resolution. | |

**User's choice:** Yield if another device is actively playing on wake (Recommended), with configurable notification/restore prompt ("Recommended maar misschien notificatie of pop up instelbaar voor herstellen")

| Option | Description | Selected |
|--------|-------------|----------|
| Expire auto-resume after long sleep (e.g., 4–8 hours) (Recommended) | If the Deck slept overnight/all day, don't surprise-blast music on wake (or only keep bookmark available without auto-playing). | ✓ |
| Never expire | Always auto-resume the bookmarked session regardless of how long the Deck was asleep. | |
| You decide | Pick a sensible staleness threshold. | |

**User's choice:** Configurable ("Instelbaar graag")

---

## Resilience UI & notifications

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated "Playback Resilience" card in SettingsTab.tsx (Recommended) | Toggle auto-resume on wake/Wi-Fi, configurable bookmark expiry slider/dropdown, configurable restore toast/prompt, and live --onevent / polling status indicator. | ✓ |
| Minimal: only 1–2 toggles inside existing Engine/Playback card | Keep SettingsTab compact without a dedicated card or status badge. | |
| You decide | Follow SettingsTab patterns from Phases 14–16. | |

**User's choice:** Dedicated "Playback Resilience" card in SettingsTab.tsx (Recommended)

| Option | Description | Selected |
|--------|-------------|----------|
| Brief Decky toast on restore (default on, toggleable) (Recommended) | Show a quick toast ("Resumed playback after wake/Wi-Fi recovery" or "Bookmark held — playing on another device") controlled by a toggle in Playback Resilience. | ✓ |
| Silent by default, toast optional | Off by default; user can opt in to restore notifications in SettingsTab. | |
| Interactive restore prompt when yielded/expired | Show a brief toast/button in QAM/SettingsTab when a bookmark was held due to another device or expiry. | ✓ |
| You decide | Pick the cleanest non-intrusive notification pattern for GamepadUI. | |

**User's choice:** Both (1) toggleable restore toast and (3) held-bookmark manual restore prompt, configurable ("1 en 3 instelbaar")

| Option | Description | Selected |
|--------|-------------|----------|
| Preset pills / dropdown (1h, 4h, 8h, 24h, Never) (Recommended) | Fast D-pad selection without tedious slider scrubbing. | |
| SliderField (1h–24h in 1h steps + Never toggle) | Fine-grained control matching Sleep Timer fade duration style. | ✓ |
| You decide | Pick the cleanest controller-friendly control. | |

**User's choice:** SliderField (1h–24h in 1h steps + Never toggle)

---

## the agent's Discretion

- Exact Unix socket path, lightweight `<5ms` emitter, and `--onevent` event schema
- Exact unified wake-lock coordination between `SuspendResumeMonitor`, Wi-Fi watchdog, and `_monitor_loop`
- Exact `settings.json` keys and `src/types.ts` definitions

## Deferred Ideas

None — discussion stayed within phase scope.
