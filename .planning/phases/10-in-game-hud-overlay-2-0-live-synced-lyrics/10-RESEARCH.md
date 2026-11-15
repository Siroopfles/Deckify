# Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics) - Research

**Researched:** 2026-11-15
**Domain:** SteamOS GamepadUI / Decky Loader React HUD (`DeckifyOverlay`), discrete `setTimeout` lyric scheduling, and Decky settings/lyrics UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Render the active synced lyric line as a **fixed-height single line with `text-overflow: ellipsis`** so the HUD never resizes or jumps mid-game.
- **D-02:** Place the lyric row **full-width below the artwork + title/artist header (above the 2px progress bar)** with a subtle top divider, crisp `11px` text, and a smooth `200ms` CSS opacity cross-fade transition.
- **D-03:** During instrumental breaks or before the first lyric timestamp, display a **subtle `♪` / `•••` placeholder** inside the fixed-height slot to keep layout height steady.
- **D-04:** Schedule lyric transitions using **discrete `setTimeout` timers** calculated from the next lyric timestamp minus `(currentPositionMs + overlayLyricsOffsetMs)` rather than continuous millisecond clock polling (`HUD-04`).
- **D-05:** Reschedule immediately on track change, seek, play/pause, or latency offset adjustment.
- **D-06:** During the 3.5s pause grace period, **freeze the active lyric line and dim it slightly (e.g. 50% opacity)**, clearing pending `setTimeout` timers until playback resumes.
- **D-07:** When a track has no synced lyrics (only plain lyrics or none returned by LRCLIB/backend), **show a subtle `"No synced lyrics"` indicator** in the lyric slot.
- **D-08:** Respect `overlay_autohide` strictly: when Auto-hide is **ON**, the HUD still hides after the configured duration even when overlay lyrics are enabled (re-appearing on track change); when Auto-hide is **OFF**, the HUD stays visible continuously.
- **D-09:** Add an **In-Game HUD Auto-hide Duration slider** ranging from **3s to 15s (step 1s, default 6s)** in `SettingsTab.tsx`.
- **D-10:** **Hide the In-Game HUD immediately while the Spotify modal (`/deckify`) is open**, and restore it cleanly upon closing the modal (resetting the autohide timer if autohide is enabled).
- **D-11:** Expose the **Overlay Lyrics toggle** in both the **Quick Access Menu (`src/index.tsx`)** under Overlay sub-settings and **`SettingsTab.tsx`**.
- **D-12:** Expose the **Lyrics Latency Offset slider (`-2000ms` to `+2000ms`, step `100ms`, default `0ms`)** in **`SettingsTab.tsx`** (keeping QAM compact).
- **D-13:** In **`LyricsTab.tsx`**, render **clickable source pills/tabs** so users can select any lyrics source directly (while keeping `"Try Next Source"` as a fallback cycle).

### the agent's Discretion
- Exact backend settings keys and defaults in `py_modules/common.py` (`overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`).
- Exact mechanism in `src/index.tsx` / `DeckifyOverlayWrapper` to detect `/deckify` modal open/close state and avoid redundant `get_lyrics` RPCs when `overlay_enabled && overlay_lyrics_enabled` is false.
- Exact CSS/inline styling details for the `200ms` cross-fade and subtle `"No synced lyrics"` / `♪` placeholder.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 10 scope (plus the 4 user-selected folded todos).

### Folded Todos
- **Respect autohide disabled setting in In-Game HUD** (`2026-11-14-ingame-hud-autohide-ignores-setting.md`): Fix `DeckifyOverlay` / `DeckifyOverlayWrapper` so disabling autohide keeps the HUD visible instead of hiding automatically.
- **Hide In-Game HUD while Spotify modal is open** (`2026-11-14-ingame-hud-visible-inside-modal.md`): Suppress `DeckifyOverlay` whenever the `/deckify` expanded modal is open.
- **Add slider for In-Game HUD autohide duration** (`2026-11-14-ingame-hud-autohide-duration-slider.md`): Add a 3s–15s (step 1s, default 6s) autohide duration slider in `SettingsTab.tsx` and wire it to `DeckifyOverlay`.
- **Allow clicking lyrics source directly in Lyrics tab** (`2026-11-14-lyrics-clickable-source-selector.md`): Make lyrics sources directly clickable via source pills/tabs in `LyricsTab.tsx`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HUD-03 | User can enable an active synced lyrics line displayed beneath the artist title in the floating Gamescope HUD overlay. | `overlay_lyrics_enabled` setting in `py_modules/common.py` & `main.py`, QAM & `SettingsTab.tsx` toggles, `DeckifyOverlayWrapper` conditional `get_lyrics` fetch + `parseLrc`, and fixed-height lyric row in `DeckifyOverlay.tsx`. |
| HUD-04 | Overlay lyrics update via discrete event-scheduled timestamps rather than continuous clock polling, preserving 60/90 FPS in games and strictly enforcing `pointerEvents: "none"`. | Discrete `setTimeout` scheduler in `DeckifyOverlay.tsx` anchored to `positionMs` + elapsed time + `overlayLyricsOffsetMs`, GPU-composited `200ms` CSS opacity transition, and `pointerEvents: "none"` on root container. |
</phase_requirements>

## Summary

Phase 10 extends the existing `DeckifyOverlay` (`src/components/DeckifyOverlay.tsx`) and `DeckifyOverlayWrapper` (`src/index.tsx`) to render a single, fixed-height synced lyric line beneath the track/artist header, while folding in four HUD/Lyrics usability fixes. No new external npm or Python dependencies are needed: the codebase already includes `parseLrc` (`src/utils.ts`), the 5-tier `get_lyrics` RPC (`py_modules/rpc_library.py` / `py_modules/spotify.py`), `SliderField` / `ToggleField` / `InteractiveRow` UI primitives, and `settings_changed` event broadcasting (`main.py`).

The core architectural requirement (`HUD-04`) is **zero continuous polling in the overlay**: `DeckifyOverlay` must compute the effective playback position from the latest `positionMs` plus elapsed wall-clock time since that position arrived plus `overlayLyricsOffsetMs`, find the active `SyncedLine` index, and schedule a single `setTimeout` for `nextLine.timeMs - effectivePositionMs`. Between lyric transitions, zero timers fire and zero React state updates occur, preserving 60/90 FPS in Gamescope.

**Primary recommendation:** Implement the discrete `setTimeout` lyric scheduler inside `DeckifyOverlay.tsx` using only `useState`, `useRef`, and `useEffect` (staying compatible with the existing custom React hook test harness in `DeckifyOverlay.test.tsx`), gate `get_lyrics` RPC calls in `DeckifyOverlayWrapper` strictly on `overlay_enabled && overlay_lyrics_enabled` with per-track ref deduplication, and track `/deckify` modal visibility via a `modalOpenListeners` pub/sub alongside `bigOpen` in `src/index.tsx`.

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Never render direct external image URLs (`https://i.scdn.co/`); continue using `DeckifyImage` (`src/components/common/DeckifyImage.tsx`) for cover art.
- **SteamOS GamepadUI Navigation:** Horizontal button/pill groups (such as clickable lyrics source pills in `LyricsTab.tsx`) MUST use `<Focusable flow-children="horizontal">` — never `flow-children="row"`.
- **Decky Overlay Input Safety:** `DeckifyOverlay` root container MUST strictly preserve `pointerEvents: "none"` so gameplay and touchscreen inputs never stall.
- **RPC Resilience:** All backend `set_setting` additions in `main.py` must validate/clamp inputs and return structured `{ "ok": False, "error": ... }` on invalid types rather than raising unhandled exceptions.
- **Code Style:** 2-space indentation, semicolons, TypeScript strictness (`tsc --noEmit` + `eslint src/`), 4-space Python indentation.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Settings persistence & clamping (`overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s`) | API / Backend (`py_modules/common.py`, `main.py`) | Browser / Client (`src/types.ts`) | Backend owns `settings.json` atomic persistence, bounds clamping, and `settings_changed` event emission. |
| Lyrics fetching & 5-tier waterfall caching | API / Backend (`py_modules/spotify.py`, `py_modules/rpc_library.py`) | Browser / Client (`DeckifyOverlayWrapper`, `DeckifyExpandedModal`) | Backend handles LRCLIB/Spotify/NetEase/Musixmatch/Lyrics.ovh HTTP calls and disk cache (`_get_cached_lyrics`). |
| Conditional lyrics RPC & modal-open suppression | Browser / Client (`src/index.tsx` `DeckifyOverlayWrapper`) | — | Global component wrapper observes `settings_changed`, `track_metadata`, `librespot_event`, and `bigOpen` state. |
| Discrete `setTimeout` lyric scheduling & HUD rendering | Browser / Client (`src/components/DeckifyOverlay.tsx`) | — | Pure client-side timer scheduling and fixed-height DOM presentation with `pointerEvents: "none"`. |
| QAM & SettingsTab controls + LyricsTab source pills | Browser / Client (`src/index.tsx`, `SettingsTab.tsx`, `LyricsTab.tsx`) | — | UI controls dispatch `backendSetSetting` and `backendGetLyrics(..., offset)`. |

## Standard Stack

No new packages are introduced in Phase 10. All implementation uses the existing verified workspace stack:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x (`@types/react: 19.2.14`) | Component state & lifecycle (`useState`, `useRef`, `useEffect`) | Decky Loader global UI runtime [VERIFIED: `package.json:32`] |
| `@decky/ui` | `^4.11.1` | `ToggleField`, `SliderField`, `Focusable`, `DropdownItem` | Native SteamOS GamepadUI spatial navigation [VERIFIED: `package.json:29`] |
| `@decky/api` | `^1.1.3` | `callable`, `addEventListener`, `removeEventListener`, `routerHook` | Decky frontend-to-backend RPC & global component mount [VERIFIED: `package.json:46`] |
| `parseLrc` | In-repo (`src/utils.ts:11-33`) | Parses `[mm:ss.xxx]` LRC strings into sorted `SyncedLine[]` | Already used by `DeckifyExpandedModal.tsx` [VERIFIED: `src/utils.ts:11-33`] |

## Architecture Patterns

### System Architecture & Data Flow

```text
[Backend: main.py / spotify.py]
  ├── settings_changed event ──▶ DeckifyOverlayWrapper (src/index.tsx)
  ├── track_metadata / librespot_event / 4s get_status
  └── get_lyrics(title, artist, dur, 0) ◀── called ONLY if overlay_enabled && overlay_lyrics_enabled
                                              (deduplicated by trackKey ref)

[DeckifyOverlayWrapper (src/index.tsx)]
  ├── Tracks modalOpen via modalOpenListeners (synced with bigOpen in openExpandedView / closeModal)
  ├── Passes visible = Boolean(settings.overlay_enabled) && !modalOpen
  ├── Passes autoHideDurationMs = (settings.overlay_autohide_duration_s ?? 6) * 1000
  ├── Passes lyricsEnabled, lyricsOffsetMs, syncedLyrics, lyricsLoaded
  ▼
[DeckifyOverlay (src/components/DeckifyOverlay.tsx)]
  ├── Visibility & Autohide Timer (hideTimerRef: autoHideDurationMs when autoHide && isPlaying;
  │                                pauseTimerRef: 3500ms when !isPlaying)
  └── Discrete Lyric Scheduler (lyricTimerRef: single setTimeout to nextLine.timeMs - effectivePosMs)
        ├── On play/seek/track/offset change: recompute activeLineIndex, clear & reschedule
        └── On pause (!isPlaying): clear lyricTimerRef, freeze activeLineIndex, dim row to 0.5 opacity
```

### Pattern 1: Discrete `setTimeout` Lyric Scheduler (`DeckifyOverlay.tsx`)

To avoid drift when `syncedLyrics` finishes loading *after* `positionMs` arrived (or when `lyricsOffsetMs` changes between 4-second status polls), anchor `positionMs` to `Date.now()` in a ref:

```typescript
// Anchor wall-clock time whenever positionMs or isPlaying updates
const posAnchorRef = useRef<{ posMs: number; atMs: number }>({
  posMs: positionMs,
  atMs: Date.now(),
});

useEffect(() => {
  posAnchorRef.current = { posMs: positionMs, atMs: Date.now() };
}, [positionMs, isPlaying, track?.track_id, track?.id, track?.name]);
```

When scheduling inside `useEffect` (depending on `[lyricsEnabled, syncedLyrics, isPlaying, positionMs, lyricsOffsetMs, track?.track_id, track?.id, track?.name]`):
1. Clear any existing `lyricTimerRef.current`.
2. If `!lyricsEnabled || syncedLyrics.length === 0`, set `activeLineIndex(-1)` and return.
3. Compute `effectivePosMs`:
   - If `isPlaying`: `posAnchorRef.current.posMs + Math.max(0, Date.now() - posAnchorRef.current.atMs) + lyricsOffsetMs`
   - If `!isPlaying`: **freeze** `activeLineIndex` as-is (unless track changed, in which case reset to `-1`) and return without scheduling a timer (D-06).
4. Binary/linear scan `syncedLyrics` to find the last index `idx` where `syncedLyrics[idx].timeMs <= effectivePosMs` (`-1` if before first lyric). Set `activeLineIndex(idx)`.
5. Let `nextIdx = idx + 1`. While `nextIdx < syncedLyrics.length && syncedLyrics[nextIdx].timeMs <= effectivePosMs`, `nextIdx++` (handles duplicate timestamps).
6. If `nextIdx < syncedLyrics.length`, compute `delay = Math.max(16, syncedLyrics[nextIdx].timeMs - effectivePosMs)` and schedule:
   ```typescript
   lyricTimerRef.current = setTimeout(() => {
     setActiveLineIndex(nextIdx);
     // Schedule subsequent line recursively using current wall-clock anchor
   }, delay);
   ```
   Using a self-rescheduling helper `scheduleFrom(nowPosMs)` inside the `useEffect` ensures each line transition triggers **at most one** `setTimeout` for the next line, with **zero** polling intervals.

### Pattern 2: Fixed-Height Single-Line Cross-Fade (`DeckifyOverlay.tsx`)

Per D-01, D-02, D-03, D-07:
- Inject a single lightweight `<style>` keyframe once (or inline `@keyframes deckifyLyricFadeIn { from { opacity: 0; } to { opacity: 1; } }`) so changing the `key` on the inner lyric `<span>` runs a GPU-composited `200ms` fade-in without extra React state updates or `setTimeout` calls.
- Keep the lyric container fixed height (`height: 18, lineHeight: "18px"`, `fontSize: 11`) with `whiteSpace: "nowrap"`, `overflow: "hidden"`, `textOverflow: "ellipsis"`, `borderTop: "1px solid rgba(255, 255, 255, 0.08)"`, `paddingTop: 5`, `marginTop: 2`, and `opacity: isPlaying ? 1 : 0.5`, `transition: "opacity 200ms ease"`.
- Display priority inside the fixed-height slot (only rendered when `lyricsEnabled === true`):
  1. `syncedLyrics.length === 0 && lyricsLoaded`: `"No synced lyrics"` (muted, e.g. `opacity: 0.55`, italic or regular `11px`) (D-07).
  2. `syncedLyrics.length === 0 && !lyricsLoaded` (loading) OR `activeLineIndex < 0`: `"♪ •••"` (muted, e.g. `opacity: 0.55`) (D-03).
  3. `activeLineIndex >= 0`: `syncedLyrics[activeLineIndex].text` (crisp `11px`, `rgba(255, 255, 255, 0.9)`).

### Pattern 3: Modal-Open Detection (`src/index.tsx`)

`src/index.tsx:84-95` already tracks `bigOpen` for `openExpandedView` and `closeModal` (`DeckifyRouteOpener` at `src/index.tsx:822-831` also routes through `openExpandedView`). Adding a listener set (identical to `activeGameListeners` at `src/index.tsx:78-82`):
```typescript
const modalOpenListeners = new Set<(open: boolean) => void>();
const setModalOpenState = (open: boolean) => {
  bigOpen = open;
  modalOpenListeners.forEach((cb) => cb(open));
};
```
- Call `setModalOpenState(true)` in `openExpandedView()`.
- Call `setModalOpenState(false)` in `closeModal` passed to `<DeckifyExpandedModal />`.
- In `DeckifyExpandedModal.tsx`, add a unmount cleanup `useEffect(() => () => { closeModal?.(); }, [])` (using a ref to `closeModal`) so even if SteamOS force-unmounts the modal, `bigOpen` never remains stuck `true`.
- In `DeckifyOverlayWrapper`, subscribe to `modalOpenListeners` and pass `visible={Boolean(settings.overlay_enabled) && !modalOpen}`. When `modalOpen` flips back to `false`, `DeckifyOverlay`'s visibility `useEffect` re-runs, showing the overlay and starting a fresh `hideTimerRef` if `autoHide` is enabled (D-10).

### Pattern 4: Autohide Strict Respect & Configurable Duration (`DeckifyOverlay.tsx`)

In `DeckifyOverlay.tsx:66-86`:
- Replace hardcoded `6000` with `autoHideDurationMs` (default `6000`, derived from `(settings.overlay_autohide_duration_s ?? 6) * 1000`).
- Ensure `useEffect` dependencies include `autoHideDurationMs`: `[isPlaying, track?.name, track?.track_id, track?.id, visible, autoHide, autoHideDurationMs]`.
- When `autoHide` is `false` and `isPlaying` is `true`, `hideTimerRef` is never scheduled and `setIsVisible(true)` keeps the HUD permanently visible. (When `isPlaying` is `false`, `pauseTimerRef` still runs the 3.5s pause grace period per D-06.)

### Pattern 5: Clickable Lyrics Source Pills (`LyricsTab.tsx` & `DeckifyExpandedModal.tsx`)

`py_modules/spotify.py:381-387` defines the 5-tier waterfall in exact `provider_offset` order:
- `0`: `"Spotify"` (CDP)
- `1`: `"LRCLIB"`
- `2`: `"NetEase"`
- `3`: `"Musixmatch"`
- `4`: `"Lyrics.ovh"`

In `LyricsTab.tsx`:
- Add optional props `onSelectLyricsSource?: (offset: number, label: string) => void;` (keeping existing props intact so existing tests don't break).
- Render the 5 source pills inside `<Focusable flow-children="horizontal" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>` using `<InteractiveRow active={lyricsSource === src.label} onClick={() => onSelectLyricsSource?.(src.offset, src.label)}>`.
- Keep `"Try Next Source"` (`InteractiveRow` calling `handleNextLyricsSource`) alongside the pills (D-13). In `DeckifyExpandedModal.tsx`, `handleNextLyricsSource` can wrap `(lyricsOffset + 1) % 5` so cycling never gets stuck past offset 4.

### Anti-Patterns to Avoid
- **Continuous `setInterval` / `requestAnimationFrame` in `DeckifyOverlay`:** Explicitly forbidden by `HUD-04` and `REQUIREMENTS.md` Out of Scope. Use discrete `setTimeout` only.
- **Unconditional `get_lyrics` RPCs in `DeckifyOverlayWrapper`:** Never call `backendGetLyrics` when `overlay_enabled && overlay_lyrics_enabled` is false, and deduplicate by track key ref so 4s `get_status` polls never re-fetch lyrics for the same track.
- **Using `flow-children="row"` on horizontal source pills in `LyricsTab.tsx`:** Causes vertical focus jumps in SteamOS GamepadUI; always use `flow-children="horizontal"`.
- **Adding hooks not mocked in `DeckifyOverlay.test.tsx`:** `DeckifyOverlay.test.tsx:41-83` mocks only `useState`, `useRef`, `useEffect`, `useCallback`, `useMemo` from `"react"`. Do not use `useLayoutEffect` or `useReducer` in `DeckifyOverlay.tsx`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LRC timestamp parsing | Custom regex parser in `DeckifyOverlay` | `parseLrc` from `src/utils.ts:11-33` | Already handles `[mm:ss.xx]`, `[mm:ss:xxx]`, empty lines, and sorting. |
| Multi-provider lyrics fetching & caching | Direct `fetch()` to LRCLIB in frontend | `backendGetLyrics` (`get_lyrics` RPC) | Backend handles 5-tier waterfall, title sanitization, User-Agent, and disk cache. |
| Controller slider & toggle UI | Custom range `<input>` elements | `SliderField` & `ToggleField` from `@decky/ui` | Native GamepadUI D-pad/analog focus and styling. |

## Common Pitfalls

### Pitfall 1: Stale `positionMs` Between 4-Second Status Polls
**What goes wrong:** `DeckifyOverlayWrapper` polls `get_status` every 4000ms. If `syncedLyrics` arrives 1.5s after the last `positionMs` update, scheduling `nextLine.timeMs - positionMs` makes lyrics lag by 1.5s.
**How to avoid:** Record `posAnchorRef.current = { posMs: positionMs, atMs: Date.now() }` whenever `positionMs` updates, and compute `effectivePosMs = posAnchorRef.current.posMs + (Date.now() - posAnchorRef.current.atMs) + lyricsOffsetMs` at schedule time.

### Pitfall 2: `set_setting` Rejecting New Keys as `"unknown setting"`
**What goes wrong:** `main.py:535` checks `if key not in DEFAULT_SETTINGS: return {"ok": False, "error": f"unknown setting: {key}"}`. Adding settings only in the frontend causes silent save failures.
**How to avoid:** Add `overlay_lyrics_enabled` (`False`), `overlay_lyrics_offset_ms` (`0`), and `overlay_autohide_duration_s` (`6`) to `DEFAULT_SETTINGS` AND `_load_settings` in `py_modules/common.py`, AND add validation/clamping branches in `main.py:set_setting`.

### Pitfall 3: `hideTimerRef` Not Resetting When Modal Closes or `autoHideDurationMs` Changes
**What goes wrong:** If `visible` becomes `false` while `/deckify` modal is open and `autoHide` is `true`, closing the modal must restart the autohide countdown rather than leaving the HUD hidden.
**How to avoid:** In `DeckifyOverlay.tsx`, `visible` and `autoHideDurationMs` are in the visibility `useEffect` dependency array; when `visible` transitions `false -> true` while `isPlaying`, `setIsVisible(true)` and a fresh `setTimeout(..., autoHideDurationMs)` are started.

### Pitfall 4: Custom React Hook Mock in `DeckifyOverlay.test.tsx`
**What goes wrong:** `DeckifyOverlay.test.tsx` uses a custom index-based React hook mock (`stateSlots`, `refSlots`, `effectSlots`) and checks `effect.deps` with `Object.is`.
**How to avoid:** Keep hook calls unconditional at the top level of `DeckifyOverlay`, avoid `useLayoutEffect`/`useReducer`, and update `DeckifyOverlay.test.tsx` to cover discrete `setTimeout` scheduling with `vi.useFakeTimers()`.

## Environment Availability

Phase 10 is purely code/config changes using existing project tooling (no new external services or binaries).
- **Frontend Test Runner:** `npx vitest run` verified working (15 test files, 123 tests passing). [VERIFIED: terminal run]
- **Backend Test Runner:** `py -3 -m unittest discover -s tests -p "test_*.py"` available (Python 3.14). [VERIFIED: terminal run]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest 5.1.0 (`npx vitest run`) |
| Backend Framework | Python `unittest` (`py -3 -m unittest discover -s tests -p "test_*.py"`) |
| Typecheck & Lint | `pnpm run typecheck` (`tsc --noEmit`) & `pnpm run lint` (`eslint src/`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HUD-03 | `DeckifyOverlay` renders fixed-height lyric row, `♪ •••` placeholder, `"No synced lyrics"` fallback, pause dimming | unit | `npx vitest run src/components/DeckifyOverlay.test.tsx` | ✅ (extend) |
| HUD-03 | `DEFAULT_SETTINGS` & `set_setting` persist/clamp `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, `overlay_autohide_duration_s` | unit | `py -3 -m unittest tests/test_e2e_requirements.py` | ✅ (extend) |
| HUD-03 | QAM & `SettingsTab` render Overlay Lyrics toggle, Latency Offset slider (-2000..2000), Autohide Duration slider (3..15) | unit | `npx vitest run src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | ✅ (extend) |
| HUD-04 | Discrete `setTimeout` lyric transitions on play/seek/offset/pause without `setInterval`, and `pointerEvents: "none"` preserved | unit | `npx vitest run src/components/DeckifyOverlay.test.tsx` | ✅ (extend) |
| Folded Todos | Autohide disabled stays visible, modal-open hides HUD, clickable source pills in `LyricsTab` | unit | `npx vitest run src/components/DeckifyOverlay.test.tsx src/index.test.tsx` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run src/components/DeckifyOverlay.test.tsx` + `pnpm run typecheck`
- **Per wave merge:** `npx vitest run && py -3 -m unittest discover -s tests -p "test_*.py" && pnpm run lint`
- **Phase gate:** Full frontend + backend suites + `pnpm run build` green before `/gsd-verify-work`

### Wave 0 Gaps
None — existing Vitest and Python `unittest` infrastructure covers all Phase 10 requirements.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Clamp `overlay_lyrics_offset_ms` (`-2000..2000` int) and `overlay_autohide_duration_s` (`3..15` int) in `py_modules/common.py` and `main.py:set_setting`; coerce `overlay_lyrics_enabled` to `bool`. |
| V6 Cryptography | no | — |

### Known Threat Patterns for Decky / React CEF HUD
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Untrusted lyric text XSS in CEF | Tampering | Render lyric strings strictly via React JSX text interpolation (`{displayText}`), never `dangerouslySetInnerHTML`. |
| Out-of-bounds setting values causing negative/infinite timers | Denial of Service | Clamp `overlay_lyrics_offset_ms` to `[-2000, 2000]` and `overlay_autohide_duration_s` to `[3, 15]` on both backend (`set_setting`) and frontend (`DeckifyOverlay` / `SettingsTab`). |

## Sources

### Primary (HIGH confidence)
- `src/components/DeckifyOverlay.tsx` (lines 1-229) — current HUD implementation, `pointerEvents: "none"`, `autoHide`, `3500ms` pause grace
- `src/index.tsx` (lines 84-95, 490-558, 822-906) — `bigOpen`, QAM `renderOverlayControls`, `DeckifyOverlayWrapper`
- `src/components/tabs/SettingsTab.tsx` (lines 581-658, 743-768) — In-Game Overlay settings card & `SliderField` pattern
- `src/components/tabs/LyricsTab.tsx` (lines 1-90) — Lyrics tab UI
- `src/components/DeckifyExpandedModal.tsx` (lines 82, 305-360, 902) — `backendGetLyrics`, `handleNextLyricsSource`, `ModalRootAny`
- `src/utils.ts` (lines 11-33) — `parseLrc`
- `py_modules/common.py` (lines 70-112, 205-258) — `DEFAULT_SETTINGS`, `_load_settings`
- `py_modules/spotify.py` (lines 353-499) — `_fetch_lyrics_sync` 5-tier waterfall (`Spotify`, `LRCLIB`, `NetEase`, `Musixmatch`, `Lyrics.ovh`)
- `main.py` (lines 534-660) — `set_setting` validation and `settings_changed` emit

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 100% existing in-repo libraries and `@decky/ui` primitives
- Architecture: HIGH — all integration points directly verified in source files
- Pitfalls: HIGH — verified against `DeckifyOverlay.test.tsx` hook harness and `main.py:set_setting`

**Research date:** 2026-11-15
**Valid until:** 2026-12-15 (stable internal codebase)
