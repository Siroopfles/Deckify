# Phase 24: Podcast & Audiobook Power Suite - Research

**Researched:** 2026-11-22
**Domain:** Spotify Web API / Official Client CDP playback speed control, monotonic clock scaling, controller transport & trigger adaptation, and podcast episode resume/filtering UI
**Confidence:** HIGH

## Summary

Phase 24 delivers the Podcast & Audiobook Power Suite (`POD-01`, `POD-02`) across the Python backend (`main.py`, `py_modules/common.py`, `py_modules/engine.py`, `py_modules/rpc_playback.py`, `py_modules/rpc_library.py`) and React/Decky frontend (`src/types.ts`, `src/hooks/usePlaybackClock.ts`, `src/components/tabs/NowPlayingTab.tsx`, `src/components/tabs/PodcastsTab.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/index.tsx`).

The existing codebase already polls `GET /me/player` with `{"additional_types": "episode"}` (`main.py:1921`), extracts `resume_position_ms` and `fully_played` in `get_saved_episodes` (`py_modules/rpc_library.py:581-595`) and `_cdp_get_saved_episodes` (`py_modules/engine.py:883-898`), and routes `L2`/`R2` seeks through `useTriggerNavigation` + `usePlaybackClock` (`src/components/DeckifyExpandedModal.tsx:872-914`). However, five key gaps must be closed: (1) `main.py` does not yet propagate `media_type` (`episode` / `chapter` / `track`) on `track_metadata`, nor track `playback_speed` / `preferred_podcast_speed` with auto-reset to `1.0x` on music; (2) `py_modules/engine.py` needs a CDP `PlayerAPI.setSpeed(speed)` helper for `spotify_client` paired with a clean `unsupported_backend` fallback on `librespot` (which lacks native time-stretching); (3) `usePlaybackClock` interpolates at fixed `1.0x` wall-clock rate and must scale elapsed time by `playbackSpeed` to prevent drift rubberbanding at `0.5x`–`2.0x`; (4) `PodcastsTab.tsx` needs show drill-down (`get_show_episodes` RPC), bottom resume progress bars, `"Played"` / `"Xm left"` badges, and *All* / *Unplayed* / *In Progress* filter pills; and (5) `SPOTIFY_SCOPES` (`py_modules/common.py:184-190`) lacks `user-read-playback-position` needed by Spotify Web API to populate `resume_point` on `GET /me/episodes` and `GET /shows/{id}/episodes`.

**Primary recommendation:** Implement `PlayerAPI.setSpeed(speed)` via CDP for `spotify_client` with explicit `librespot` unsupported-backend feedback, scale `usePlaybackClock` by `playbackSpeed`, promote `-15s`/`+15s` into `NowPlayingTab` transport and `L2`/`R2` triggers during spoken-word playback, and add `get_show_episodes` + `user-read-playback-position` scope for full `PodcastsTab` progress bars, badges, and filtering.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Supported playback speed options are `0.5x`, `0.75x`, `1.0x`, `1.25x`, `1.5x`, `1.75x`, and `2.0x` (explicitly including `0.5x` alongside `0.75x`–`2.0x`).
- **D-02:** In `NowPlayingTab`, expose playback speed via a controller-friendly `@decky/ui` `Dropdown` selector (listing `0.5x` through `2.0x`) when a podcast episode or audiobook is playing.
- **D-03:** In the Quick Access Menu (QAM), expose a compact single-button cycle pill/control (`1.0x` → `1.25x` → `1.5x` → `1.75x` → `2.0x` → `0.5x` → `0.75x` → `1.0x`) when a podcast episode or audiobook is playing.
- **D-04:** Remember the user's last selected podcast/audiobook playback speed across episodes so the next podcast episode continues at the chosen speed.
- **D-05:** Automatically reset active playback speed to `1.0x` whenever a standard music track starts playing, while preserving the user's preferred podcast speed so it is restored automatically the next time a podcast episode or audiobook plays.
- **D-06:** When a podcast episode or audiobook is playing, `NowPlayingTab` replaces the Previous Track / Next Track transport buttons with dedicated `-15s` / `+15s` smart-skip buttons.
- **D-07:** In `DeckifyExpandedModal`, `L2` and `R2` controller triggers adapt during podcast/audiobook playback to perform `-15s` / `+15s` smart-skip seeks (instead of standard ±10s music seeking), with monotonic clock progression (`usePlaybackClock`) staying synchronized.
- **D-08:** Render a thin green resume progress bar at the bottom of each episode row based on `resume_point` / `duration_ms`, paired with a `"Played"` badge when fully played or a remaining-time badge (e.g., `"12m left"`) when in progress.
- **D-09:** Provide *All*, *Unplayed*, and *In Progress* filter pills in `PodcastsTab` for **both** opened podcast shows and the *Saved Episodes* list.

### the agent's Discretion
- Exact backend mechanism for applying playback speed (`spotify_client` CDP vs `librespot` / engine capability & graceful fallback).
- Exact visual styling of the thin green progress bar, `"Played"` / `"Xm left"` badge, and filter pills within `PodcastsTab.tsx` (following existing `@decky/ui` / `InteractiveRow` conventions).
- Exact QAM placement of the compact speed cycle control when podcast/audiobook playback is active.

### Deferred Ideas (OUT OF SCOPE)
None — all discussion stayed within Phase 24 scope.
</user_constraints>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`); all episode/show artwork must continue using `DeckifyImage` (`get_image` base64 proxy).
- **SteamOS GamepadUI Navigation:** Horizontal pill/filter bars and transport rows MUST use `<Focusable flow-children="horizontal">` (never `flow-children="row"`). Compact inline `DialogButton` controls in QAM/modals must set `minWidth: "auto"` (and `width: "auto"` where needed) to override SteamOS 100% button width.
- **RPC Error Handling:** All backend RPC methods must wrap external network/CDP calls in `try/except`, offload blocking I/O via `_exec()`, and return structured `{ "ok": bool, ... }` dictionaries without crashing the event loop.
- **Frontend Hook & ESLint Discipline:** `QuickAccessMenu` (`src/index.tsx`) and tab components must never reorder existing top-level `useState` hook slots. New/modified functions should stay under ESLint's 80-line `max-lines-per-function` and 15 `complexity` thresholds with zero `@typescript-eslint/no-explicit-any` warnings.
- **Decky Sandbox & Subprocess Isolation:** Zero new npm/pip dependencies; pure-Python stdlib + existing `@decky/ui` / `react-icons` primitives only.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| POD-01 | When a podcast episode or audiobook is playing, `NowPlayingTab` and QAM expose playback speed controls (`0.5x`–`2.0x` per D-01, automatically resetting to `1.0x` on music tracks) and dedicated `-15s` / `+15s` smart-skip transport actions (plus L2/R2 trigger adaptation). | `main.py` media-type detection + auto-reset/restore; `_cdp_set_playback_speed` via `PlayerAPI.setSpeed` in `py_modules/engine.py`; `set_playback_speed` RPC in `py_modules/rpc_playback.py`; `usePlaybackClock` `playbackSpeed` scaling; `NowPlayingTab` `Dropdown` & `-15s`/`+15s` transport; QAM cycle button in `src/index.tsx`; `L2`/`R2` 15s step in `DeckifyExpandedModal.tsx`. |
| POD-02 | User can view per-episode resume progress bars and *"Played"* badges (`resume_point`) in `PodcastsTab` and filter episodes by *All*, *Unplayed*, or *In Progress*. | `user-read-playback-position` scope in `py_modules/common.py`; `get_show_episodes` RPC in `py_modules/rpc_library.py` & `main.py`; `ShowItem` / `EpisodeFilter` types in `src/types.ts`; show drill-down, bottom progress bar, `"Played"` / `"Xm left"` badges, and `<Focusable flow-children="horizontal">` filter pills in `PodcastsTab.tsx`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Spoken-content detection (`media_type`) & music auto-reset | API / Backend (`main.py`) | Browser / Client (`src/utils/playback.ts`) | Backend owns `/me/player` polling and `librespot`/CDP lifecycle so speed resets atomically on track transitions even when UI is closed. |
| Playback speed execution (`0.5x`–`2.0x`) | API / Backend (`py_modules/engine.py`, `py_modules/rpc_playback.py`) | Browser / Client (`NowPlayingTab`, `QuickAccessMenu`) | Only backend can invoke Official Spotify Client CDP `PlayerAPI.setSpeed` and persist `preferred_podcast_speed` in settings. |
| Monotonic clock interpolation at non-1.0x speed | Browser / Client (`src/hooks/usePlaybackClock.ts`) | — | 250ms UI ticker runs locally in CEF; multiplying elapsed wall-clock time by `playbackSpeed` prevents 1200ms drift rubberbanding. |
| `-15s` / `+15s` smart-skip transport & `L2`/`R2` triggers | Browser / Client (`NowPlayingTab`, `DeckifyExpandedModal`) | API / Backend (`seek_playback`) | `useTriggerNavigation` and `SEEK_ACCUMULATION_WINDOW_MS` live in modal client state before committing debounced `seek_playback`. |
| Show episodes drill-down, resume progress & filtering | Browser / Client (`PodcastsTab.tsx`) | API / Backend (`py_modules/rpc_library.py`) | Backend fetches `GET /shows/{id}/episodes` and `GET /me/episodes` with `resume_point`; client filters *All*/*Unplayed*/*In Progress* instantaneously without extra API calls. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x (`@types/react` 19.2.14) | Frontend UI components | Decky Loader global runtime `[VERIFIED: package.json:32]` |
| `@decky/ui` | 4.11.1 | `Dropdown`, `Focusable`, `DialogButton` | Official SteamOS GamepadUI primitives `[VERIFIED: package.json:29]` |
| `@decky/api` | 1.1.3 | Typed `callable` RPC bridge | Existing frontend-to-backend transport `[VERIFIED: package.json:46]` |
| `react-icons` | 5.5.0 | Transport & podcast icons (`FaPodcast`, `FaUndo`, `FaRedo`, `FaCheck`) | Already bundled in project `[VERIFIED: package.json:48]` |
| Python stdlib | 3.11+ / 3.14 | `urllib`, `asyncio`, `json` for Spotify Web API & CDP | Zero external pip dependencies `[VERIFIED: GEMINI.md]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `PlayerAPI.setSpeed(speed)` via CDP | PipeWire / `rubberband` DSP filter | `librespot` outputs fixed 44.1 kHz PCM; external time-stretching desyncs Spotify Connect position reporting `[CITED: spotifast.rocks]`. Use CDP `PlayerAPI.setSpeed` on `spotify_client` and surface a clear unsupported-backend message on `librespot`. |
| Client-side episode filtering (*All*/*Unplayed*/*In Progress*) | Re-fetching Spotify API per filter click | Filtering the loaded `savedEpisodes` / `showEpisodes` array in React is instant, avoids HTTP 429 rate limits, and preserves scroll/focus state. |

**Installation:** No new packages required (`package.json` and Python stdlib cover all needs).

## Architecture Patterns

### System Data Flow (Playback Speed & Smart-Skip)

```
GET /me/player?additional_types=episode (main.py)
  ├─► item.type / uri -> is_spoken (episode | chapter | audiobook)
  ├─► Transition to music track? -> reset playback_speed = 1.0 (keep preferred_podcast_speed)
  ├─► Transition to spoken content? -> restore preferred_podcast_speed
  └─► emit track_metadata + playback_speed_changed
        │
        ▼
Frontend (NowPlayingTab / QAM / DeckifyExpandedModal)
  ├─► isSpokenContent(track) == true:
  │     ├─► usePlaybackClock({ ..., playbackSpeed }) scales elapsed * playbackSpeed
  │     ├─► NowPlayingTab: Dropdown (0.5x..2.0x) + [-15s] [Play/Pause] [+15s]
  │     ├─► QAM: [-15s] [Speed Cycle Pill] [+15s]
  │     └─► L2/R2 Triggers: 15s step (overrides trigger_seek_seconds)
  └─► User selects speed -> set_playback_speed(speed) RPC
        ├─► audio_backend == "spotify_client": CDP PlayerAPI.setSpeed(speed)
        └─► audio_backend == "librespot": return { ok: false, unsupported_backend: true }
```

### Pattern 1: Spoken Content Detection (`isSpokenContent`)
**What:** Reliable detection of podcast episodes and audiobook chapters across Spotify Web API metadata, URIs, and legacy fallback.
**When to use:** In `NowPlayingTab`, `QuickAccessMenu`, `DeckifyExpandedModal` (`L2`/`R2` trigger handler), and `main.py` (`_poll_player`).
**Verified current behavior:**
- `src/index.tsx:1263` currently uses `const isPodcast = trackMeta?.album === "" || trackMeta?.uri?.includes(":episode:");` `[VERIFIED: src/index.tsx:1263]`.
- `main.py:1998-2011` builds `meta` without `media_type` `[VERIFIED: main.py:1998-2011]`.
**Recommended pattern:**
- Backend adds `"media_type": item.get("type") or data.get("currently_playing_type") or "track"` to `meta` in `main.py:_poll_player`.
- Frontend helper `isSpokenContent(track?: TrackMeta | null): boolean`:
  - Returns `true` if `track.media_type === "episode" || track.media_type === "chapter" || track.media_type === "audiobook"`.
  - Returns `true` if `track.uri?.includes(":episode:") || track.uri?.includes(":chapter:")`.
  - Falls back to `track.album === "" && Boolean(track.name)` only when `track.media_type` is undefined (avoiding false positives on singles/local tracks explicitly tagged `media_type: "track"`).

### Pattern 2: `@decky/ui` `Dropdown` for NowPlayingTab Speed Selector (D-02)
**What:** Use `Dropdown` from `@decky/ui` with `rgOptions` typed as `SingleDropdownOption[]`.
**Verified signature** `[VERIFIED: node_modules/@decky/ui/dist/components/Dropdown.d.ts:4-28]`:
```typescript
export interface SingleDropdownOption {
    data: any;
    label: ReactNode;
    options?: never;
}
export interface DropdownProps {
    rgOptions: DropdownOption[];
    selectedOption: any;
    disabled?: boolean;
    onChange?(data: SingleDropdownOption): void;
    strDefaultLabel?: string;
    menuLabel?: string;
    focusable?: boolean;
}
```
Define `PLAYBACK_SPEED_OPTIONS` with explicit string labels (`"0.5x"`, `"0.75x"`, `"1.0x"`, `"1.25x"`, `"1.5x"`, `"1.75x"`, `"2.0x"`) so `"1.0x"` and `"2.0x"` never collapse to `"1x"` / `"2x"`.

### Pattern 3: QAM Speed Cycle Order (D-03)
**What:** Single compact `DialogButton` (`minWidth: "auto"`, `padding: "4px 10px"`, `fontSize: 11`) in QAM's existing horizontal row (`src/index.tsx:1552-1559`) cycling through:
`[1.0, 1.25, 1.5, 1.75, 2.0, 0.5, 0.75]` -> wrapping back to `1.0`.
```typescript
export const QAM_SPEED_CYCLE = [1.0, 1.25, 1.5, 1.75, 2.0, 0.5, 0.75] as const;
export function getNextCycleSpeed(current: number): number {
  const idx = QAM_SPEED_CYCLE.findIndex((s) => Math.abs(s - current) < 0.01);
  return QAM_SPEED_CYCLE[(idx + 1) % QAM_SPEED_CYCLE.length];
}
```

### Pattern 4: `PodcastsTab` Show Drill-Down, Progress Bar & Filtering (D-08, D-09)
**What:**
- Clicking a show in `PodcastsTab` opens `activeShow` (loading `get_show_episodes(show.id, 0)`), matching `AlbumsTab` / `handleOpenAlbum` (`src/components/DeckifyExpandedModal.tsx:321-331`).
- Both `activeShow` view and `Saved Episodes` section render a `<Focusable flow-children="horizontal">` filter bar with `"All"`, `"Unplayed"`, and `"In Progress"` `DialogButton` pills (`minWidth: "auto"`).
- Episode filtering predicate:
  - `unplayed`: `!ep.fully_played && (ep.resume_position_ms ?? 0) === 0`
  - `in_progress`: `!ep.fully_played && (ep.resume_position_ms ?? 0) > 0`
  - `all`: all episodes
- Each episode row renders:
  - Remaining-time badge (`"12m left"`, or `"<1m left"` if `< 60s`) when `!ep.fully_played && resumeMs > 0 && durationMs > resumeMs`, OR `"Played"` badge when `ep.fully_played`.
  - Thin green progress bar (`height: 3`, `background: "var(--deckify-accent, #1DB954)"`) pinned to the bottom of the episode row (`100%` when `fully_played`, `Math.round((resumeMs / durationMs) * 100)%` when `resumeMs > 0`).

### Anti-Patterns to Avoid
- **Using `flow-children="row"` on filter pills or transport rows:** Breaks SteamOS GamepadUI D-pad horizontal navigation; always use `flow-children="horizontal"`.
- **Scaling `usePlaybackClock` without re-anchoring on speed change:** Changing `playbackSpeed` mid-playback without updating `basePositionRef` and `syncTimeRef` causes the displayed timestamp to jump instantaneously.
- **Overwriting `preferred_podcast_speed` on music auto-reset:** D-05 explicitly requires resetting *active* speed to `1.0x` on music tracks while *preserving* `preferred_podcast_speed` for the next podcast/audiobook.
- **Silent `0ms` speed failure on `librespot`:** `librespot` cannot time-stretch audio; always surface `unsupported_backend: true` and inform the user via disabled state / toast.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speed selection menu in GamepadUI | Custom focus-trapped popup | `@decky/ui` `Dropdown` | Native SteamOS modal focus, B-button dismissal, and scroll handling `[VERIFIED: node_modules/@decky/ui/dist/components/Dropdown.d.ts:28]` |
| Controller L2/R2 seek accumulation | New keydown/gamepad listener | Existing `useTriggerNavigation` + `SEEK_ACCUMULATION_WINDOW_MS` (`600ms`) | Already handles analog trigger thresholds, debounce, and virtual focus `[VERIFIED: src/components/DeckifyExpandedModal.tsx:50,872-914]` |
| Time-stretching audio in Python | Custom PipeWire/PCM resampler | Official Spotify Client CDP `PlayerAPI.setSpeed` | Custom audio resampling desyncs Spotify Connect server position and adds latency `[CITED: spicetify.app]` |

## Common Pitfalls

### Pitfall 1: Missing `user-read-playback-position` Scope for `resume_point`
**What goes wrong:** Spotify Web API `GET /me/episodes` and `GET /shows/{id}/episodes` omit `resume_point` if the OAuth token lacks `user-read-playback-position`, causing all episodes to appear unplayed (`resume_position_ms: 0, fully_played: false`).
**Why it happens:** `SPOTIFY_SCOPES` in `py_modules/common.py:184-190` currently has `CURRENT_SCOPES_VERSION = 7` and does not include `user-read-playback-position` `[VERIFIED: py_modules/common.py:184-190]`.
**How to avoid:** Add `user-read-playback-position` to `SPOTIFY_SCOPES`, bump `CURRENT_SCOPES_VERSION` to `8`, and update the version assertion in `tests/test_discovery.py:99` (`[VERIFIED: tests/test_discovery.py:99]`). Keep `_cdp_get_saved_episodes` as a fallback when `spotify_client` is active.

### Pitfall 2: `usePlaybackClock` Drift Rubberbanding at `0.5x` or `2.0x`
**What goes wrong:** At `2.0x`, Spotify's server position advances 2000ms per 1000ms wall time; at `1.0x` interpolation, drift exceeds `driftThresholdMs` (`1200ms`) every ~1.2s, causing visible progress bar snapping.
**Why it happens:** `usePlaybackClock.ts:87,252` hardcodes `elapsed = isPlaying ? Math.max(0, now - syncTime) : 0` `[VERIFIED: src/hooks/usePlaybackClock.ts:87,252]`.
**How to avoid:** Pass `playbackSpeed` to `usePlaybackClock` and `PlaybackClockController`, multiply `elapsed` by `playbackSpeed`, and re-anchor `(basePosition, syncTime)` whenever `playbackSpeed` changes.

### Pitfall 3: Stale Closures in `DeckifyExpandedModal` `useTriggerNavigation`
**What goes wrong:** If `onTrigger` reads `track` or `isSpoken` from a stale closure or doesn't include updated refs, `L2`/`R2` could use `trigger_seek_seconds` (`10s`) instead of `15s` when switching from a music track to a podcast.
**How to avoid:** Read `isSpokenContent(track)` from a ref (`isSpokenRef.current`) updated on every render alongside `currentPositionMsRef`, just as `DeckifyExpandedModal.tsx:888` already does for `currentPositionMsRef`.

### Pitfall 4: ESLint Function Length & Hook Slot Order
**What goes wrong:** `NowPlayingTab.tsx` (249 lines) and `PodcastsTab.tsx` (94 lines) already trigger `max-lines-per-function` (limit 80) warnings `[VERIFIED: eslint output]`. Adding inline JSX directly into `NowPlayingTab` or `PodcastsTab` will increase complexity above 15, and inserting `useState` before existing hooks in `src/index.tsx` shifts hook indices.
**How to avoid:** Extract `EpisodeRow`, `EpisodeFilterBar`, `ShowEpisodesView`, and `SpeedDropdownControl` into focused helper components/functions, and append any new `useState` hooks at the end of `QuickAccessMenu`'s existing `useState` block.

## Code Examples

### CDP `PlayerAPI.setSpeed` (`py_modules/engine.py`)
```python
# Source pattern: py_modules/engine.py:833-857 + py_modules/rpc_library.py:388 + Spicetify PlayerAPI.setSpeed
def _cdp_set_playback_speed(speed: float, port: int = SPOTIFY_CDP_PORT) -> dict:
    safe_speed = float(speed)
    expr = f"""
    (async () => {{
      try {{
        const el = document.querySelector('#main');
        if (!el) return {{ ok: false, error: 'Spotify UI root not found' }};
        const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
        if (!fk) return {{ ok: false, error: 'React fiber root not found' }};
        const queue = [el[fk]];
        const visited = new Set();
        let registry = null;
        while (queue.length > 0 && !registry && visited.size < 5000) {{
          const n = queue.shift();
          if (!n || visited.has(n)) continue;
          visited.add(n);
          const val = n.memoizedProps?.value;
          if (val && val._map instanceof Map) {{ registry = val; break; }}
          if (val && typeof val.getRegistry === 'function') {{ registry = val.getRegistry(); break; }}
          if (n.child) queue.push(n.child);
          if (n.sibling) queue.push(n.sibling);
        }}
        if (!registry || !(registry._map instanceof Map)) return {{ ok: false, error: 'Platform registry not found' }};
        let playerApi = null;
        for (const [k, v] of registry._map.entries()) {{
          const d = k?.description || String(k);
          if (d === 'PlayerAPI') {{ playerApi = v?.instance || v; break; }}
        }}
        if (!playerApi) return {{ ok: false, error: 'PlayerAPI unavailable' }};
        if (typeof playerApi.setSpeed === 'function') {{
          await playerApi.setSpeed({safe_speed});
          return {{ ok: true, speed: {safe_speed} }};
        }}
        return {{ ok: false, error: 'PlayerAPI.setSpeed unavailable' }};
      }} catch (e) {{
        return {{ ok: false, error: String(e?.message || e) }};
      }}
    }})()
    """
    res = _cdp_evaluate(expr, port=port, timeout=5.0)
    return res if isinstance(res, dict) else {"ok": False, "error": "CDP setSpeed returned no result"}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python (`py -3`) | Backend unit tests (`unittest`) | ✓ | 3.14.0 | — |
| Node.js | Vitest, TypeScript, Rollup | ✓ | v25.1.0 | — |
| pnpm | Frontend test & typecheck runner | ✓ | 10.28.0 | — |
| Official Spotify Client (CDP port) | Live `PlayerAPI.setSpeed` verification on Steam Deck | ✗ (Windows dev env) | — | Unit-tested via mocked `_cdp_evaluate` / `_exec`; manual UAT on Steam Deck |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Python Framework | `unittest` (Python 3.14.0 stdlib) |
| TypeScript Framework | `vitest` 5.1.0 + `tsc --noEmit` + `eslint` 10.0.1 |
| Config files | `package.json`, `tsconfig.json`, `eslint.config.js` |
| Python quick run | `py -3 -m unittest discover -s tests -p "test_podcast_suite.py" -q` |
| Python full suite | `py -3 -m unittest discover -s tests -p "test_*.py" -q` (baseline: 655 tests OK) |
| Frontend quick run | `pnpm test -- --run src/hooks/usePlaybackClock.test.ts src/components/tabs/PodcastsTab.test.tsx src/components/tabs/NowPlayingTab.test.tsx` |
| Frontend full suite | `pnpm test -- --run` (baseline: 24 files, 295 tests passed) |
| Typecheck & Lint | `pnpm typecheck && pnpm exec eslint src/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| POD-01 | `set_playback_speed` validation, `spotify_client` CDP `setSpeed`, `librespot` unsupported fallback, music auto-reset & podcast speed restore | unit (Python) | `py -3 -m unittest discover -s tests -p "test_podcast_suite.py" -q` | ❌ Wave 0 |
| POD-01 | `usePlaybackClock` `playbackSpeed` scaling & re-anchor on speed change | unit (TS) | `pnpm test -- --run src/hooks/usePlaybackClock.test.ts` | ✅ (extend) |
| POD-01 | `NowPlayingTab` speed `Dropdown` (`0.5x`–`2.0x`) & `-15s`/`+15s` transport replacement, `DeckifyExpandedModal` L2/R2 15s smart-skip, QAM cycle pill | unit (TS) | `pnpm test -- --run src/components/tabs/NowPlayingTab.test.tsx src/components/DeckifyExpandedModal.test.tsx src/index.test.tsx` | ✅ / ❌ Wave 0 (`NowPlayingTab.test.tsx`) |
| POD-02 | `get_show_episodes` RPC normalization (`resume_point`), `SPOTIFY_SCOPES` `user-read-playback-position` | unit (Python) | `py -3 -m unittest discover -s tests -p "test_podcast_suite.py" -q` | ❌ Wave 0 |
| POD-02 | `PodcastsTab` show drill-down, bottom green progress bar, `"Played"` / `"Xm left"` badges, *All*/*Unplayed*/*In Progress* filter pills | unit (TS) | `pnpm test -- --run src/components/tabs/PodcastsTab.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** Targeted Python (`test_podcast_suite.py`) or Vitest file + `pnpm typecheck` + `pnpm exec eslint <modified files>`
- **Per wave merge:** `py -3 -m unittest discover -s tests -p "test_*.py" -q` and `pnpm test -- --run`
- **Phase gate:** Full Python suite + full Vitest suite + `pnpm typecheck` + `pnpm exec eslint src/` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_podcast_suite.py` — covers `set_playback_speed`, CDP `PlayerAPI.setSpeed`, `librespot` fallback, music auto-reset/restore, `get_show_episodes`, and `SPOTIFY_SCOPES`
- [ ] `src/components/tabs/NowPlayingTab.test.tsx` — covers speed `Dropdown` (`0.5x`–`2.0x`) and `-15s`/`+15s` transport replacement
- [ ] `src/components/tabs/PodcastsTab.test.tsx` — covers show drill-down, progress bars, `"Played"` / `"Xm left"` badges, and *All*/*Unplayed*/*In Progress* filtering

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | OAuth PKCE `user-read-playback-position` scope bump (`CURRENT_SCOPES_VERSION = 8`) |
| V3 Session Management | no | Existing token lifecycle unchanged |
| V4 Access Control | no | Local Decky RPC only |
| V5 Input Validation | yes | Whitelist `speed` in `{0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0}` and validate `show_id` / `offset` before interpolating into Spotify API paths or CDP expressions |
| V6 Cryptography | no | — |

### Known Threat Patterns for Python + CDP + React
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CDP JS injection via unsanitized `speed` or `show_id` | Tampering | Strictly validate `speed` against numeric allowlist (`float(speed) in ALLOWED_PLAYBACK_SPEEDS`) and sanitize `show_id` with `urllib.parse.quote` before any API/CDP call |

## Sources

### Primary (HIGH confidence)
- In-repo files read this session: `main.py`, `py_modules/common.py`, `py_modules/engine.py`, `py_modules/rpc_library.py`, `py_modules/rpc_playback.py`, `src/types.ts`, `src/hooks/usePlaybackClock.ts`, `src/components/tabs/PodcastsTab.tsx`, `src/components/tabs/NowPlayingTab.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/index.tsx`, `node_modules/@decky/ui/dist/components/Dropdown.d.ts`, `tests/test_discovery.py`

### Secondary (MEDIUM confidence)
- [Spicetify PlayerAPI.setSpeed](https://spicetify.app/) — Spotify Desktop `PlayerAPI.setSpeed(speed)` method signature
- [librespot playback speed limitation](https://spotifast.rocks/) — Confirms `librespot` outputs fixed-rate PCM without variable playback speed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 100% existing in-repo dependencies and verified `@decky/ui` types
- Architecture: HIGH — All integration points (`_poll_player`, `PlayerAPI`, `usePlaybackClock`, `useTriggerNavigation`, `PodcastsTab`) directly inspected
- Pitfalls: HIGH — Verified `CURRENT_SCOPES_VERSION = 7` missing `user-read-playback-position`, `usePlaybackClock` fixed 1.0x interpolation, and ESLint baseline warnings

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (30 days — stable internal architecture)
