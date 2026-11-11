# Phase 3: Live Playback Ticker & Gamepad Seekbar Scrubbing - Research
**Researched:** 2026-11-11  
**Domain:** SteamOS GamepadUI, React Playback Clock Interpolation, Spatial Navigation & Debounced RPC Seeking  
**Confidence:** HIGH  

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Drift Threshold Resync):** Use local monotonic clock interpolation: `localPos = serverPos + (now - syncTime)`. When a background status poll resolves, only overwrite `localPos` if the drift between local and server position exceeds 1200ms, or upon explicit state transitions (is_playing toggled, track changed, or seek action). This prevents network latency and poll intervals from causing the visible second counter to jitter or jump backwards.
  - *Reversibility:* reversible
- **D-02 (Styled Bar with Direct Scrubber Movement):** Maintain Deckify's styled progress bar aesthetic with prominent Steam Deck GamepadUI focus styling (`@decky/ui` spatial navigation). When the user navigates focus onto the seek bar, pressing D-pad Left or Right directly moves the scrubber position and time counter along the bar.
  - *Reversibility:* reversible
- **D-03 (Scrub Step Size):** When tapping or holding D-pad Left/Right on the focused seekbar, step by 5 or 10 seconds per tick (proportional to track duration if track > 10 min, default 10s for standard songs). Retain optional compact `-15s / +15s` quick buttons alongside the bar for rapid skips.
  - *Reversibility:* reversible
- **D-04 (Optimistic Scrubber with 300ms Debounced RPC):** While the user scrubs on the progress bar, update the local visual fill width and elapsed time display immediately without waiting for network responses. After 300ms of user input silence, commit the target position to backend via `backendSeekPlayback(targetMs)`.
  - *Reversibility:* reversible
- **D-05 (Seek Race Condition Suppression Window):** Following an active seek commit, suppress background server position updates for 1200-1500ms to allow librespot and Spotify Connect backend audio engines to adjust without prematurely resetting the client scrubber to stale timestamps.
  - *Reversibility:* reversible
- **D-06 (Unified Hook):** Centralize playback clock interpolation, drift filtering, and seek handlers into a dedicated hook in `src/hooks/` (e.g. `usePlaybackClock.ts` or expanded `usePlaybackStatus.ts`). Both `DeckifyExpandedModal` (via `NowPlayingTab`) and the Quick Access Menu (`src/index.tsx`) must consume this shared hook, ensuring identical timing and scrubbing behavior across the entire plugin.
  - *Reversibility:* costly — touches both primary UI entrypoints and several tab components.

### the agent's Discretion
- Step size curve for very short podcasts/tracks vs long mixes (e.g. 5s for < 5min tracks, 10s for 5-30min, 30s for > 30min).
- Exact CSS focus glow / border styling for the seek bar to match SteamOS CEF gamepad guidelines.

### Deferred Ideas (OUT OF SCOPE)
- Queue track switching and queue reordering (deferred to Phase 4).
- In-game HUD overlay window mounting and floating lyrics (deferred to Phase 5).
- Volume slider scrubbing redesign (focus remains strictly on playback progress and seek scrubbing).
</user_constraints>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy**: Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`), requiring internal proxying/base64 encoding.
- **SteamOS GamepadUI Navigation**: Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); focus traps or navigation loss degrade user experience.
- **D-Pad Spatial Navigation Syntax**: Containers with horizontal buttons MUST use `flow-children="horizontal"`; using `flow-children="row"` causes vertical focus jumps in SteamOS CEF [VERIFIED: GEMINI.md:154-156].
- **Rate Limiting**: Spotify Web API aggressively returns HTTP 429 when polled frequently. Continuous polling of heavy endpoints must be avoided; polling is strictly restricted to current playback state [VERIFIED: GEMINI.md:159-161].
- **Error Handling**: RPC methods must never crash the main event loop. All external network operations and system calls are wrapped in `try/except` blocks returning structured `{ "ok": False, "error": str(e) }` [VERIFIED: GEMINI.md:82-88].

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAY-01 | Implement smooth real-time Now Playing elapsed time ticker interpolated with local clock timestamps (`Date.now()`) so progress counts up seamlessly every second without freezing or jitter. | Addressed by monotonic clock interpolation hook `usePlaybackClock` with `localPos = serverPos + (Date.now() - syncTime)` and drift threshold resynchronization (1200ms) to eliminate rubberbanding. |
| PLAY-02 | Enable gamepad D-pad and controller scrubbing on the Now Playing seek bar using `@decky/ui` focusable controls, allowing stepping forward/backward in track position. | Addressed by styled, focusable seek bar in `NowPlayingTab` responding to `ArrowLeft`/`ArrowRight` with `e.preventDefault()`, variable step size (5s/10s/30s), visible scrubber handle and focus halo, optimistic visual update, and 300ms debounced RPC commit. |
| PLAY-03 | Bind Now Playing progress bar and time labels to the live interpolated position state rather than stale backend polling snapshots. | Addressed by eliminating the `status?.position_ms || currentPositionMs` short-circuit in `NowPlayingTab.tsx` (lines 122 and 135) and binding both label and bar fill directly to the live interpolated `currentPositionMs`. |
</phase_requirements>

## Summary

Phase 03 eliminates playback jitter and enables intuitive controller scrubbing on Steam Deck. Currently, Deckify exhibits two major UI defects:
1. **Rubberbanding second ticker**: In `src/hooks/usePlaybackStatus.ts` (lines 18-34), local elapsed time is stepped up by `+1000ms` via `setInterval`, but every 1500ms `refreshStatus()` resolves a server poll snapshot. Because Spotify Connect / librespot reports the position at the instant of polling minus network latency, overwriting `currentPositionMs` with `status.position_ms` frequently jerks the clock backwards by 200–600ms every 1.5 seconds. In addition, in `NowPlayingTab.tsx` (lines 122 & 135), the progress bar evaluated `formatMs(status?.position_ms || currentPositionMs || 0)` — whenever `status.position_ms` was non-zero, it completely bypassed the local ticker.
2. **Unresponsive / unthrottled seek scrubbing**: In `NowPlayingTab.tsx` (lines 127-130), D-pad Left/Right presses directly invoked `handleSeekDelta`, firing an immediate unthrottled network RPC to `backendSeekPlayback` on every keypress. When seeking completed, immediate background polling overwrote the newly sought position with stale audio engine timestamps before Spotify Connect settled, causing the seekbar to snap back to the previous position.

The solution consists of:
1. A pure, testable clock interpolation hook `usePlaybackClock.ts` maintaining local monotonic timing (`localPos = serverPos + (now - syncTime)`), drift tolerance (ignoring server drift <= 1200ms), 300ms debounced RPC commits, and a 1500ms post-seek server suppression window.
2. Connecting `usePlaybackClock` into `usePlaybackStatus.ts` and consuming it across both `DeckifyExpandedModal` (via `NowPlayingTab`) and the Quick Access Menu (`src/index.tsx`), replacing ~80 lines of duplicate polling and intervals.
3. Upgrading `NowPlayingTab.tsx` to bind directly to `currentPositionMs`, adding visible scrubber handle and focus halo styling, and consuming D-pad Left/Right events with `e.preventDefault()` to prevent horizontal focus escape in SteamOS GamepadUI.

**Primary recommendation:** Build `src/hooks/usePlaybackClock.ts` as a standalone, framework-agnostic timing and debounce controller with 100% Vitest unit test coverage; wire it through `usePlaybackStatus.ts` to power both `DeckifyExpandedModal` and `src/index.tsx`; and upgrade `NowPlayingTab.tsx` with optimistic visual scrubbing and GamepadUI spatial focus styling.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Monotonic Time Interpolation | Browser / Client (`usePlaybackClock.ts`) | — | Client owns high-frequency (250ms) display updates using `Date.now() - syncTime`; RPC polling cannot provide smooth 1s transitions over IPC. |
| Drift Filtering & Re-anchoring | Browser / Client (`usePlaybackClock.ts`) | — | Client detects if background server responses diverge by > 1200ms; suppresses jitter within normal network/polling variance. |
| Optimistic Scrubber State | Browser / Client (`NowPlayingTab.tsx`) | — | Immediate visual feedback (0ms latency) during D-pad Left/Right scrubbing without waiting for IPC or network round-trips. |
| Seek Debouncing (300ms) | Browser / Client (`usePlaybackClock.ts`) | — | Prevents rapid D-pad taps or holds from flooding Spotify Web API with HTTP 429 rate-limiting requests. |
| Post-Seek Suppression Window | Browser / Client & API / Backend | API / Backend (`rpc_playback.py`) | Client suppresses server updates for 1500ms; backend records `_last_seek_time` to prevent overwriting `_last_event["position_ms"]` with stale engine state. |
| Playback Seek RPC Execution | API / Backend (`rpc_playback.py`) | Spotify Web API (`me/player/seek`) | Authenticated PUT request to Spotify API with target `position_ms`. |
| Spatial Controller Navigation | Browser / Client (`@decky/ui`) | — | SteamOS CEF spatial navigation maps D-pad and analog inputs to focusable elements with `flow-children="horizontal"`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react` | 19.x (peer via Decky) | Component UI & Hook lifecycle | Core framework of Deckify; standard React 19 hooks (`useState`, `useRef`, `useCallback`, `useEffect`). |
| `@decky/ui` | 4.11.1 [VERIFIED: package.json:29] | GamepadUI primitives (`Focusable`, `SliderField`, `DialogButton`) | Official Valve/Decky Loader component library providing D-pad spatial navigation and focus management. |
| `@decky/api` | 1.1.3 [VERIFIED: package.json:46] | IPC bridge (`callable`) | Type-safe RPC invocation between React and Python backend (`backendSeekPlayback`, `backendGetStatus`). |
| `vitest` | 5.1.0 [VERIFIED: package.json:43] | Frontend unit testing runner | Fast, ESM-native test runner already configured in Deckify running under 600ms [VERIFIED: test run]. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `react-icons/fa` | 5.5.0 [VERIFIED: package.json:48] | FontAwesome SVG icons | Transport controls, volume icons, shuffle, repeat, and scrubber indicators. |
| `python unittest` | 3.11+ / 3.14 (built-in) | Backend regression test suite | Validates `seek_playback` and player state polling across 318 backend unit tests. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Monotonic clock hook (`usePlaybackClock`) | Relying solely on Spotify Web API polling | Unusable on Steam Deck: polling faster than 1s triggers HTTP 429 rate limits, and network latency causes constant rubberbanding. |
| Debounced RPC (300ms) | Seek on every D-pad tick | Terrible performance: holding D-pad fires 10+ HTTP PUT requests per second, overwhelming local network and Spotify API. |
| Custom HTML `<input type="range">` | `@decky/ui` `<Focusable>` custom bar | Standard HTML range inputs do not integrate with SteamOS GamepadUI spatial navigation rings or Steam Deck D-pad focus traversal. |

**Installation:**
No new external packages are required for this phase.

## Package Legitimacy Audit

> **Required** whenever this phase installs external packages.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| None (0 new packages) | — | — | — | — | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none  
*All capabilities in Phase 03 are implemented using existing core libraries (`@decky/ui`, `@decky/api`, React, and Vitest).*

## Architecture Patterns

### System Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                    SteamOS GamepadUI (CEF)                                         |
|                                                                                                    |
|   +------------------------------------+          +--------------------------------------------+   |
|   |   DeckifyExpandedModal             |          |   Deckify Quick Access Menu (QAM)          |   |
|   |   (NowPlayingTab)                  |          |   (src/index.tsx)                          |   |
|   |                                    |          |                                            |   |
|   |   - Interactive Seekbar            |          |   - SliderField (0..durationSec)           |   |
|   |   - -15s / +15s quick buttons      |          |   - -15s / +15s quick buttons              |   |
|   +-----------------+------------------+          +---------------------+----------------------+   |
|                     |                                                   |                          |
|                     +-------------------------+-------------------------+                          |
|                                               |                                                    |
|                                               v                                                    |
|                              +---------------------------------+                                   |
|                              |   usePlaybackStatus Hook        |                                   |
|                              |   (src/hooks/usePlaybackStatus) |                                   |
|                              +----------------+----------------+                                   |
|                                               |                                                    |
|                                               v                                                    |
|                              +---------------------------------+                                   |
|                              |   usePlaybackClock Hook         |                                   |
|                              |   (src/hooks/usePlaybackClock)  |                                   |
|                              |                                 |                                   |
|                              |   * localPos = base + (now-sync)|                                   |
|                              |   * drift check (drift > 1200ms)|                                   |
|                              |   * optimistic scrub position   |                                   |
|                              |   * 300ms debounce RPC timer    |                                   |
|                              |   * 1500ms post-seek suppression|                                   |
|                              +----------------+----------------+                                   |
|                                               |                                                    |
+-----------------------------------------------|----------------------------------------------------+
                                                | Decky IPC (backendSeekPlayback, backendGetStatus)
                                                v
+----------------------------------------------------------------------------------------------------+
|                                    Deckify Python Backend                                          |
|                                                                                                    |
|   +-----------------------------+              +-----------------------------------------------+   |
|   |   py_modules/rpc_playback   |              |   main.py (Plugin)                            |   |
|   |                             |              |                                               |   |
|   |   seek_playback(pos_ms)     |              |   get_status() -> memory snapshot             |   |
|   |   - sets plugin._last_seek  |              |   _poll_playback() -> 3s background poll      |   |
|   |   - updates _last_event     |              |   - respects _last_seek suppression window    |   |
|   +--------------+--------------+              +-----------------------+-----------------------+   |
|                  |                                                     |                           |
+------------------|-----------------------------------------------------|---------------------------+
                   |                                                     |
                   v                                                     v
   +---------------------------------------------------------------------------------------------+
   |                             Spotify Web API (me/player/seek, me/player)                     |
   +---------------------------------------------------------------------------------------------+
```

### Recommended Project Structure
```
src/
├── hooks/
│   ├── usePlaybackClock.ts       # NEW: Pure monotonic clock interpolation, drift check, debounce, suppression
│   ├── usePlaybackClock.test.ts  # NEW: Comprehensive Vitest suite for timing, drift, debounce & suppression
│   └── usePlaybackStatus.ts      # ENHANCED: Consolidated status polling + clock hook integration
├── components/
│   ├── common/
│   │   └── InteractiveRow.tsx    # Focus halo helper and interactive base components
│   └── tabs/
│       └── NowPlayingTab.tsx     # ENHANCED: Direct D-pad seekbar scrubbing, visible thumb, focus halo, formatMs
├── index.tsx                     # ENHANCED: Refactored QAM mini-player using usePlaybackStatus & SliderField
└── types.ts                      # Extended status/seek types if needed
```

### Pattern 1: Monotonic Clock Interpolation with Drift Gating (D-01)
**What:** The client computes elapsed position locally as `localPos = basePositionMs + (Date.now() - syncTime) * (isPlaying ? 1 : 0)`. When periodic status polling returns a server snapshot `serverPos`, the client calculates `drift = Math.abs(localPos - serverPos)`. If `drift <= 1200ms`, the server update is silently discarded, preserving continuous forward progression. If `drift > 1200ms` or if `track_id` / `is_playing` changes, the client re-anchors `basePositionMs = serverPos; syncTime = Date.now();`.
**When to use:** In any networked media player where status polling latency fluctuates (150–500ms) and audio engine timestamps jitter.

### Pattern 2: Optimistic Scrubber with Debounced RPC & Suppression Window (D-04, D-05)
**What:** While the user interacts with the progress bar via D-pad Left/Right or slider scrubbing:
1. Local visual state (`scrubPositionMs`, `isScrubbing = true`) updates immediately on every input tick (0ms UI latency).
2. Any pending debounced seek timer is reset.
3. A 300ms debounce timer starts. When 300ms of user input silence elapses:
   - Call `backendSeekPlayback(targetMs, "")`.
   - Re-anchor clock base position to `targetMs`, `syncTime = Date.now()`.
   - Activate post-seek suppression: `suppressServerUntil = Date.now() + 1500`.
   - Set `isScrubbing = false`.
4. While `Date.now() < suppressServerUntil`, any incoming status polling snapshots are ignored, preventing the scrubber from snapping back to stale timestamps while Spotify Connect adjusts.

### Pattern 3: SteamOS Spatial Navigation Prevention on Interactive Sliders (D-02)
**What:** In SteamOS GamepadUI, pressing D-pad Left or Right normally causes spatial navigation to jump focus to an adjacent horizontal element. When an element is designed to handle internal horizontal adjustments (like a seek bar or volume slider), its `onKeyDown` handler must call `e.preventDefault?.()` and `e.stopPropagation?.()` for `ArrowLeft` and `ArrowRight`. This locks focus on the bar during scrubbing.
**When to use:** Any `@decky/ui` `<Focusable>` element that consumes horizontal D-pad ticks for value changes.

### Anti-Patterns to Avoid
- **Evaluating `status?.position_ms` before local interpolated position:** As seen in `NowPlayingTab.tsx:122` (`formatMs(status?.position_ms || currentPositionMs || 0)`), this causes the local clock to be completely ignored whenever `status?.position_ms` is non-zero [VERIFIED: src/components/tabs/NowPlayingTab.tsx:122].
- **Unthrottled RPC on D-pad keydown:** Calling `await backendSeekPlayback()` on every keypress causes network flooding, UI freezes, and Spotify HTTP 429 rate-limiting [VERIFIED: src/components/tabs/NowPlayingTab.tsx:128-129].
- **Using `flow-children="row"` for horizontal control groups:** Line 355 of `src/index.tsx` uses `flow-children="row"` for `-15s / +15s` buttons, which causes vertical focus jumps in SteamOS CEF [VERIFIED: GEMINI.md:154-156]. Must use `flow-children="horizontal"`.
- **Duplicate polling loops across QAM and Modal:** Having `src/index.tsx` poll every 3000ms and run its own interval while `usePlaybackStatus` polls every 1500ms causes desynchronized state when opening/closing views.

## In-Repo Discrete Value Evidence

The following claims about in-repo discrete values and definitions were verified by reading source files in this session:

1. **Flawed position fallback in `NowPlayingTab.tsx`:**
   > Line 122: `<span>{formatMs(status?.position_ms || currentPositionMs || 0)}</span>`
   > Line 135: `width: `${Math.min(100, (((status?.position_ms || currentPositionMs || 0)) / track.duration_ms) * 100)}%`,`
   [VERIFIED: src/components/tabs/NowPlayingTab.tsx:121-140]

2. **Unthrottled D-pad seek handler in `NowPlayingTab.tsx`:**
   > Lines 127-130:
   ```tsx
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") handleSeekDelta(-10);
              if (e.key === "ArrowRight") handleSeekDelta(10);
            }}
   ```
   [VERIFIED: src/components/tabs/NowPlayingTab.tsx:127-130]

3. **Current interval-based status hook in `usePlaybackStatus.ts`:**
   > Lines 18-34:
   ```ts
   useEffect(() => {
     if (status?.position_ms !== undefined) {
       setCurrentPositionMs(status.position_ms);
     }
   }, [status?.position_ms]);

   useEffect(() => {
     if (!status?.is_playing) return;
     const interval = setInterval(() => {
       setCurrentPositionMs((prev) => {
         const duration = (status?.track || status?.track_meta)?.duration_ms || 0;
         if (duration > 0 && prev >= duration) return prev;
         return prev + 1000;
       });
     }, 1000);
     return () => clearInterval(interval);
   }, [status?.is_playing, status?.track, status?.track_meta]);
   ```
   [VERIFIED: src/hooks/usePlaybackStatus.ts:18-34]

4. **Focus halo styling helper in `InteractiveRow.tsx`:**
   > Lines 4-15:
   ```ts
   export function focusHalo(focused: boolean) {
     return {
       boxShadow: focused
         ? "0 0 0 2px #fff, 0 0 12px rgba(29, 185, 84, 0.7)"
         : "none",
       transform: focused ? "scale(1.02)" : "scale(1)",
       transition: "box-shadow 0.1s ease, transform 0.1s ease",
       position: "relative" as const,
       zIndex: focused ? 2 : 0,
       outline: "none",
     };
   }
   ```
   [VERIFIED: src/components/common/InteractiveRow.tsx:4-15]

5. **`flow-children="row"` anti-pattern in `src/index.tsx`:**
   > Line 355: `<Focusable flow-children="row" style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 4 }}>`
   [VERIFIED: src/index.tsx:355]

6. **Backend seek method signature in `py_modules/rpc_playback.py`:**
   > Line 80: `async def seek_playback(plugin, position_ms: int, device_id: str = "") -> dict:`
   > Line 90: `await _exec(_spotify_api_request, "me/player/seek", token, "PUT", params)`
   [VERIFIED: py_modules/rpc_playback.py:80-90]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Gamepad spatial focus | Custom focus tracker using global keyboard listeners | `@decky/ui` `<Focusable>` component | `@decky/ui` interfaces directly with SteamOS GamepadUI compositor and input manager; custom focus maps desynchronize on modal open/close. |
| Time duration formatting | Inconsistent ad-hoc string formatting functions | Consolidated `formatMs(ms)` in `src/components/common/InteractiveRow.tsx` | Multiple formats (`formatDuration` vs `formatMs`) cause visual discrepancy between QAM and Modal. |
| Debounce timers | Complex custom timer classes | React `useRef` + `setTimeout` / `clearTimeout` | Simple, memory-leak safe, cleans up automatically on unmount. |

**Key insight:** Clock interpolation is purely mathematical: elapsed time is elapsed time. Trying to solve jitter by increasing polling frequency makes it worse by causing HTTP 429 rate limits and threadpool starvation. The only robust solution is monotonic client-side extrapolation with drift gating.

## Common Pitfalls

### Pitfall 1: Server Poll Overriding Optimistic Scrub State
**What goes wrong:** A user is holding D-pad Right to scrub from 1:00 to 2:30. At 1:45, a background `backendGetStatus()` poll resolves with `position_ms = 60000`, snapping the scrubber all the way back to 1:00 mid-scrub.
**Why it happens:** The polling callback does not check whether `isScrubbing` is true.
**How to avoid:** In `usePlaybackClock.ts`, check `if (isScrubbing) return;` inside the server position synchronization effect.

### Pitfall 2: Spotify Connect Post-Seek Stale Timestamp Race
**What goes wrong:** User seeks to 2:00. The debounced RPC fires and completes in 120ms. At 250ms, a scheduled background status poll executes. Spotify's API has not yet processed the seek on the Connect daemon, returning `position_ms = 62000`. The seekbar snaps back to 1:02, and only jumps to 2:02 three seconds later.
**Why it happens:** Web API updates are asynchronous and propagate with a 500–1200ms delay to Spotify Connect endpoints.
**How to avoid:** Establish a suppression window (`suppressServerUntil = Date.now() + 1500`). Any server position updates received within 1500ms of a committed seek are dropped (D-05).

### Pitfall 3: SteamOS Focus Loss During Horizontal D-pad Scrubbing
**What goes wrong:** User focuses the seekbar and presses D-pad Right. Instead of scrubbing, focus jumps to the shuffle button or lyrics tab.
**Why it happens:** `@decky/ui` spatial navigation interprets unhandled `ArrowRight` key events as navigation requests to the next spatial neighbor.
**How to avoid:** In the seekbar's `onKeyDown` handler, call `e.preventDefault?.()` and `e.stopPropagation?.()` when `e.key === "ArrowLeft"` or `e.key === "ArrowRight"`.

### Pitfall 4: Drift Threshold Too Small vs Too Large
**What goes wrong:** If drift threshold is too small (e.g. 200ms), normal network jitter triggers constant resyncs, re-introducing rubberbanding. If threshold is too large (e.g. 5000ms), pausing/resuming or scrubbing on another device (e.g. phone) takes 5 seconds to reflect on the Deck.
**Why it happens:** Balancing network variance against remote state changes.
**How to avoid:** Set threshold to 1200ms per D-01. Any jump > 1.2s represents a deliberate state change or significant lag, while < 1.2s is absorbed by smooth interpolation.

## Code Examples

### 1. `usePlaybackClock.ts` (Core Monotonic Clock Hook)

```typescript
import { useCallback, useEffect, useRef, useState } from "react";

export interface PlaybackClockOptions {
  serverPositionMs: number;
  isPlaying: boolean;
  durationMs: number;
  trackId?: string;
  driftThresholdMs?: number; // default: 1200ms (D-01)
  suppressServerWindowMs?: number; // default: 1500ms (D-05)
  debounceSeekMs?: number; // default: 300ms (D-04)
  tickIntervalMs?: number; // default: 250ms for smooth display
  onSeekCommit?: (targetMs: number) => Promise<any> | void;
}

export function usePlaybackClock({
  serverPositionMs,
  isPlaying,
  durationMs,
  trackId,
  driftThresholdMs = 1200,
  suppressServerWindowMs = 1500,
  debounceSeekMs = 300,
  tickIntervalMs = 250,
  onSeekCommit,
}: PlaybackClockOptions) {
  // Clock anchors
  const basePositionRef = useRef<number>(serverPositionMs);
  const syncTimeRef = useRef<number>(Date.now());
  const prevTrackIdRef = useRef<string | undefined>(trackId);
  const prevIsPlayingRef = useRef<boolean>(isPlaying);
  const lastSeekTimeRef = useRef<number>(0);

  // Scrubbing state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubPositionMs, setScrubPositionMs] = useState(serverPositionMs);
  const debounceTimerRef = useRef<any>(null);

  // Live display position
  const [displayPositionMs, setDisplayPositionMs] = useState(serverPositionMs);

  // Compute current interpolated position
  const getInterpolatedPosition = useCallback(() => {
    if (!prevIsPlayingRef.current) return basePositionRef.current;
    const elapsed = Date.now() - syncTimeRef.current;
    const current = basePositionRef.current + elapsed;
    return durationMs > 0 ? Math.min(durationMs, Math.max(0, current)) : Math.max(0, current);
  }, [durationMs]);

  // Handle incoming server updates
  useEffect(() => {
    const now = Date.now();
    // 1. Post-seek suppression window (D-05)
    if (now - lastSeekTimeRef.current < suppressServerWindowMs) return;

    // 2. Active scrubbing suppression
    if (isScrubbing) return;

    // 3. Track changed -> immediately re-anchor
    if (trackId !== prevTrackIdRef.current) {
      prevTrackIdRef.current = trackId;
      basePositionRef.current = serverPositionMs;
      syncTimeRef.current = now;
      setDisplayPositionMs(serverPositionMs);
      return;
    }

    // 4. Play/pause state changed -> re-anchor
    if (isPlaying !== prevIsPlayingRef.current) {
      prevIsPlayingRef.current = isPlaying;
      basePositionRef.current = serverPositionMs;
      syncTimeRef.current = now;
      setDisplayPositionMs(serverPositionMs);
      return;
    }

    // 5. Gated drift check (D-01)
    if (isPlaying) {
      const localPos = getInterpolatedPosition();
      const drift = Math.abs(localPos - serverPositionMs);
      if (drift > driftThresholdMs) {
        // Significant divergence -> resync anchor
        basePositionRef.current = serverPositionMs;
        syncTimeRef.current = now;
      }
      // If drift <= 1200ms, ignore server position to prevent rubberbanding!
    } else {
      basePositionRef.current = serverPositionMs;
      syncTimeRef.current = now;
      setDisplayPositionMs(serverPositionMs);
    }
  }, [serverPositionMs, isPlaying, trackId, isScrubbing, suppressServerWindowMs, driftThresholdMs, getInterpolatedPosition]);

  // High-frequency UI tick interval (250ms)
  useEffect(() => {
    if (!isPlaying || isScrubbing) return;
    const id = setInterval(() => {
      setDisplayPositionMs(getInterpolatedPosition());
    }, tickIntervalMs);
    return () => clearInterval(id);
  }, [isPlaying, isScrubbing, tickIntervalMs, getInterpolatedPosition]);

  // Scrubbing actions
  const scrubTo = useCallback((targetMs: number) => {
    const clamped = durationMs > 0 ? Math.min(durationMs, Math.max(0, targetMs)) : Math.max(0, targetMs);
    setIsScrubbing(true);
    setScrubPositionMs(clamped);
    setDisplayPositionMs(clamped);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      lastSeekTimeRef.current = Date.now();
      basePositionRef.current = clamped;
      syncTimeRef.current = Date.now();
      setIsScrubbing(false);
      onSeekCommit?.(clamped);
    }, debounceSeekMs);
  }, [durationMs, debounceSeekMs, onSeekCommit]);

  const scrubDelta = useCallback((deltaMs: number) => {
    const current = isScrubbing ? scrubPositionMs : displayPositionMs;
    scrubTo(current + deltaMs);
  }, [isScrubbing, scrubPositionMs, displayPositionMs, scrubTo]);

  const seekImmediate = useCallback((targetMs: number) => {
    const clamped = durationMs > 0 ? Math.min(durationMs, Math.max(0, targetMs)) : Math.max(0, targetMs);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    lastSeekTimeRef.current = Date.now();
    basePositionRef.current = clamped;
    syncTimeRef.current = Date.now();
    setIsScrubbing(false);
    setScrubPositionMs(clamped);
    setDisplayPositionMs(clamped);
    onSeekCommit?.(clamped);
  }, [durationMs, onSeekCommit]);

  return {
    positionMs: isScrubbing ? scrubPositionMs : displayPositionMs,
    isScrubbing,
    scrubTo,
    scrubDelta,
    seekImmediate,
  };
}
```

### 2. Variable Scrub Step Sizing (D-03 Discretion)

```typescript
export function getScrubStepMs(durationMs: number): number {
  const durationSec = durationMs / 1000;
  if (durationSec < 300) return 5000;   // < 5 min -> 5s per tick
  if (durationSec > 1800) return 30000; // > 30 min -> 30s per tick
  return 10000;                         // 5-30 min -> 10s per tick
}
```

### 3. Focusable Interactive Progress Bar (`NowPlayingTab.tsx`)

```tsx
// Inside NowPlayingTab:
const duration = track?.duration_ms || 0;
const stepMs = getScrubStepMs(duration);
const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentPositionMs / duration) * 100)) : 0;

<div style={{ width: "100%", marginBottom: 16 }}>
  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, opacity: 0.6, marginBottom: 6 }}>
    <span style={{ color: isScrubbing ? "#1db954" : "#fff", fontWeight: isScrubbing ? 700 : 400 }}>
      {formatMs(currentPositionMs)}
    </span>
    <span>{formatMs(duration)}</span>
  </div>

  <Focusable
    noFocusRing
    tabIndex={0}
    onKeyDown={(e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault?.();
        e.stopPropagation?.();
        handleSeekDelta(-stepMs);
      } else if (e.key === "ArrowRight") {
        e.preventDefault?.();
        e.stopPropagation?.();
        handleSeekDelta(stepMs);
      }
    }}
    onClick={(e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = (e as React.MouseEvent).clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      handleSeekImmediate(pct * duration);
    }}
    style={{
      width: "100%",
      height: 12,
      background: "rgba(255,255,255,0.15)",
      borderRadius: 6,
      position: "relative",
      cursor: "pointer",
      padding: 0,
      overflow: "visible",
    }}
  >
    {/* Fill bar */}
    <div
      style={{
        width: `${progressPercent}%`,
        height: "100%",
        background: "#1db954",
        borderRadius: 6,
        position: "relative",
      }}
    >
      {/* Scrubber thumb handle */}
      <div
        style={{
          position: "absolute",
          right: -6,
          top: -2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.6)",
        }}
      />
    </div>
  </Focusable>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Naive `setInterval(..., 1000)` with direct `status.position_ms` overwrite | Local monotonic clock (`base + now - sync`) with 1200ms drift threshold | Deckify Phase 3 | Eliminates backwards rubberbanding and timer stutter completely. |
| Unthrottled RPC per D-pad tick | Optimistic scrubber display + 300ms debounced RPC | Deckify Phase 3 | Prevents UI freezing, network lag, and Spotify HTTP 429 rate limits. |
| Immediate background status poll after seek | 1500ms post-seek suppression window | Deckify Phase 3 | Prevents Spotify Connect race condition where stale position snaps seekbar backward. |
| Duplicate polling & intervals in `src/index.tsx` | Shared `usePlaybackStatus` & `usePlaybackClock` | Deckify Phase 3 | Guarantees identical timing, scrubbing, and drift behavior across Modal and QAM. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Steam Deck GamepadUI delivers D-pad Left/Right on focused elements as standard KeyboardEvent `ArrowLeft` and `ArrowRight`. | Architecture Patterns | Low; `@decky/ui` spatial navigation maps D-pad to arrow keys across all SteamOS versions. |
| A2 | Spotify Web API `me/player/seek` propagation delay to Connect engines does not exceed 1500ms under standard network conditions. | Common Pitfalls | Low; 1500ms suppression window provides ample headroom for librespot and Spotify Connect sync. |

## Open Questions

1. **Should the seekbar thumb be permanently visible or only show when focused/hovered?**
   - *Recommendation:* Keep a subtle 12px thumb permanently visible so users understand it is an interactive slider, expanding to 16px with white focus halo when focused.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm | Frontend build & test | ✓ | Node v25.1.0, pnpm | — |
| Vitest | Frontend automated testing | ✓ | 5.1.0 | — |
| Python (`py -3`) | Backend tests & Decky runtime | ✓ | 3.14.0 | — |

**Missing dependencies with no fallback:** None.  
**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (frontend) & Python unittest (backend) [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (or standard vite config) / built-in unittest |
| Quick run command | `pnpm test` (executes Vitest in < 600ms) |
| Full suite command | `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLAY-01 | Smooth real-time elapsed time calculation with drift gating (<=1200ms ignored, >1200ms resyncs) | unit | `pnpm test src/hooks/usePlaybackClock.test.ts` | ❌ Wave 0 |
| PLAY-02 | Gamepad scrubbing: optimistic UI update, 300ms debounced RPC commit, variable step size | unit | `pnpm test src/hooks/usePlaybackClock.test.ts` | ❌ Wave 0 |
| PLAY-03 | Now Playing progress bar and time labels bound to live interpolated position state | unit | `pnpm test src/hooks/usePlaybackClock.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full test suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/hooks/usePlaybackClock.test.ts` — covers PLAY-01, PLAY-02, PLAY-03, D-01, D-04, D-05 using Vitest fake timers (`vi.useFakeTimers()`).

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Handled in existing OAuth PKCE modules (`py_modules/spotify.py`). |
| V3 Session Management | no | Handled in backend token manager. |
| V4 Access Control | no | Local plugin execution in `deck` user space. |
| V5 Input Validation | yes | Sanitize and clamp all seek target values to `[0, duration_ms]` before sending to `backendSeekPlayback` [VERIFIED: py_modules/rpc_playback.py:85]. |
| V6 Cryptography | no | No cryptographic changes in this phase. |

### Known Threat Patterns for Playback Seeking

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Negative or unbounded seek timestamps | Denial of Service | Backend clamps `position_ms = max(0, int(position_ms))` [VERIFIED: py_modules/rpc_playback.py:85]; frontend clamps to `[0, durationMs]`. |
| Rapid D-pad scrubbing flooding Spotify API | Denial of Service (HTTP 429) | 300ms debounce window ensures at most one seek request per scrubbing gesture (D-04). |

## Sources

### Primary (HIGH confidence)
- Codebase audit: `src/hooks/usePlaybackStatus.ts` (lines 18-34: existing interval & poll overwrite defect)
- Codebase audit: `src/components/tabs/NowPlayingTab.tsx` (lines 121-140: `status?.position_ms` fallback and unthrottled keydown)
- Codebase audit: `src/index.tsx` (lines 83-220 & 345-365: duplicate polling and `SliderField`)
- Codebase audit: `py_modules/rpc_playback.py` (lines 80-101: `seek_playback` implementation)
- Codebase audit: `main.py` (lines 459-495 & 1265-1305: `get_status` and playback polling schedule)
- User decisions: `.planning/phases/03-live-playback-ticker-gamepad-seekbar-scrubbing/03-CONTEXT.md` (Decisions D-01 through D-06)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Built upon existing React 19, `@decky/ui`, and Vitest stack.
- Architecture: HIGH - Fully models the monotonic clock interpolation, drift gating, debouncing, and suppression window.
- Pitfalls: HIGH - Directly observed in code audits of existing rubberbanding and race conditions.

**Research date:** 2026-11-11  
**Valid until:** 2026-12-11 (stable core architecture)
