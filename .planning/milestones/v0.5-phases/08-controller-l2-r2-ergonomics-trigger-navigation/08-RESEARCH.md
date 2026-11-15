# Phase 8: Controller L2/R2 Ergonomics & Trigger Navigation - Research

**Researched:** 2026-11-14
**Domain:** SteamOS GamepadUI Controller Input, Analog Trigger Hysteresis, Spatial Focus Navigation (`@decky/ui`), React/TypeScript
**Confidence:** HIGH (codebase and `@decky/ui` types verified directly; SteamOS analog Gamepad API behavior noted with fallback architecture)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Accumulate & Debounce):** Rapid consecutive L2/R2 trigger pulls in `NowPlayingTab` and `LyricsTab` accumulate into a single pending delta and debounce for `~250ms` before dispatching one seek RPC, preventing Spotify Web API 429 rate limits and seekbar rubberbanding.
- **D-02 (Floating Seek-Delta Pill + Live Preview):** While seeking, display a subtle floating seek-delta pill (e.g. `+20s` / `-10s`) in the modal and immediately update the seekbar preview position before the RPC resolves.
- **D-03 (Boundary Clamping):** Seeking past track boundaries clamps at `0s` (start) and `duration_ms - 1000` (end), preventing accidental track skips when spamming L2 or R2.
- **D-04 (Configurable Seek Step Slider):** Expose the L2/R2 seek step size as a `SliderField` in `SettingsTab.tsx` (e.g. `5s`–`30s`, default `10s`). **Global convention:** ALL time/seconds-based settings in `SettingsTab.tsx` MUST use sliders (`SliderField`), never steppers/dropdowns.
- **D-05 (Smart Paging: ±N Items or Alphabetical Anchors):** L2/R2 jumps by a configurable item step (default `±15` items) in standard/chronological lists, and jumps across alphabetical letter anchors (`A → B → C`) when the active list is sorted A–Z.
- **D-06 (Scroll + Focus Transfer):** After jumping in a list, both scroll the target row into view AND transfer D-pad controller focus to that item so subsequent D-pad navigation continues from the new position instead of snapping back.
- **D-07 (All List Tabs Covered):** L2/R2 fast-paging applies uniformly across all list-based tabs (`LikedSongsTab`, `PlaylistsTab`, `AlbumsTab`, `ArtistsTab`, `QueueTab`, `RecentTab`, `PodcastsTab`, `SoundtracksTab`), `SearchTab` results (when focus is outside the text input), and Playlist/Album/Artist detail tracklists.
- **D-08 (Boundary Clamp + Auto Load More & Short-List Shortcut):** At list boundaries, clamp to the first/last item rather than wrapping around. If R2 is pulled at the end of a paginated list that has more items (`onLoadMore`), trigger loading more items. In short lists (fewer items than the jump step), L2 jumps to the first item and R2 jumps to the last item.
- **D-09 (Floating List Position Pill):** Display the same subtle floating indicator pill when fast-paging in lists (e.g. `16 / 120` or letter `M`) briefly after each jump.
- **D-10 (Content-Focus Guard):** Only trigger list fast-paging when D-pad focus is inside the right-hand content pane; ignore L2/R2 list jumps while focus is in the left `Sidebar`.
- **D-11 (Configurable List Jump Slider):** Expose the library jump step size (`5`–`50` items, default `15`) as a `SliderField` in `SettingsTab.tsx`.
- **D-12 (Schmidt Hysteresis + Auto-Repeat):** Analog trigger input enforces Schmidt hysteresis (`0.75` press threshold / `0.25` release reset) and `300ms` software debounce, with hold-to-repeat enabled (holding past `500ms` repeats every `300ms`). Strictly scoped to when `DeckifyExpandedModal` is open. — **Reversibility:** costly — core input hook architecture across `FocusNavController` / `SteamClient.Input`.
- **D-13 (Master Toggle & Context-Aware Hint Bar):** Add a master `L2/R2 Trigger Navigation` toggle (default ON) in `SettingsTab.tsx`, plus a subtle context-aware controller hint bar in the modal footer/header (showing e.g. `L2/R2 Seek` in Now Playing/Lyrics vs `L2/R2 Page` in lists, alongside `X Like · Y Options`) with a `SettingsTab.tsx` toggle to hide/disable the hint bar.
- **D-14 (Sub-Modal & Input Suppression):** Pause/suppress L2/R2 trigger actions whenever `ActionMenu`, `PlaylistPickerModal`, or any text `INPUT`/`TEXTAREA` has focus.
- **Folded Todo — Fix controller actions (Y options, X like, triggers) in modal:** Replace/supplement unreliable `window.addEventListener("vgp_onbuttondown", ...)` in `DeckifyExpandedModal.tsx` with reliable SteamOS GamepadUI controller input handling so `Y` (open `ActionMenu`), `X` (toggle like), and `L2`/`R2` triggers work consistently on focused list rows AND on the current track in `NowPlayingTab` / `LyricsTab`.
- **Folded Todo — Fix Back to Steam focus navigation in modal sidebar:** Pin `Back to Steam` as a fixed footer outside the scrollable sidebar tab list in `Sidebar.tsx` / `DeckifyExpandedModal.tsx` so it is always reachable via D-pad Down and D-pad Up reliably returns focus to the tab list.

### the agent's Discretion
- Exact styling, positioning, and fade-out timing (`~800ms–1200ms`) of the floating seek/page indicator pill and context-aware hint bar.
- Exact SteamOS GamepadUI analog trigger event subscription mechanism (`FocusNavController.m_rgGamepadInputSources` / `RegisterForControllerInputMessages` / `GamepadButton` fallback) verified against existing `src/index.tsx` patterns.
- Whether `DeckifyExpandedModal` exposes a shared `jumpToIndex` / ref registry or callback context for tabs to register their scrollable list containers.

### Deferred Ideas (OUT OF SCOPE)
- `2026-11-14-ingame-hud-visible-inside-modal.md`
- `2026-11-14-lyrics-clickable-source-selector.md`
- `2026-11-14-now-playing-quick-add-to-playlist.md`
- `2026-11-14-qam-bind-button-focus-highlight.md`
- `2026-11-14-ingame-hud-autohide-duration-slider.md`
- `2026-11-14-ingame-hud-autohide-ignores-setting.md`
- `2026-11-14-smooth-ducking-attenuation-customizable.md`
- `2026-11-14-playlist-play-button-unreliable.md`
- `2026-11-14-sidebar-now-playing-like-and-add-to-playlist.md`
- `2026-11-14-followed-playlist-tracks-not-loading.md`
- `2026-11-14-non-steam-local-grid-covers.md`
- `2026-11-14-recently-played-realtime-update.md`
- `2026-11-14-settings-time-options-to-sliders.md`
- `2026-11-14-track-notification-album-cover-crop.md`
- `2026-11-14-track-notification-sound-toggle.md`
- `2026-11-14-enable-mix-missing-playlist-id.md`
- `2026-11-14-playlist-track-click-stops-after-song.md`
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CTRL-01 | User can pull L2 or R2 triggers in playback views (`NowPlayingTab`, `LyricsTab`) to execute blind -10s or +10s seeking without losing D-pad controller focus. | Pure `TriggerController` + accumulated `250ms` debounced seek wired to `clock.scrubTo(clamped)` with `[0, duration_ms - 1000]` clamping, floating delta pill, and zero focus mutation. |
| CTRL-02 | User can pull L2 or R2 triggers in library lists (`LikedSongsTab`, `PlaylistsTab`, `AlbumsTab`, `ArtistsTab`, plus `QueueTab`, `RecentTab`, `PodcastsTab`, `SoundtracksTab`, `SearchTab`, detail tracklists) to jump ±15 items or alphabet sections. | DOM-queryable `[data-deckify-list-item]` + `[data-deckify-sort-key]` inside `contentPaneRef` with alphabetical-anchor detection, `scrollIntoView({ block: "nearest" })`, `.focus()`, `onLoadMore` boundary hook, and floating position pill. |
| CTRL-03 | Triggers enforce Schmidt hysteresis (0.75 activate, 0.25 reset) and are strictly scoped to the open modal to prevent in-game input conflicts. | `TriggerController` state machine (`>= 0.75` activate, `<= 0.25` reset, `300ms` debounce, `500ms`/`300ms` hold-repeat) fed by modal-mounted `rAF` `navigator.getGamepads()` + `FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown/Up` + `vgp_onbuttondown`, all cleaned up on modal unmount. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** No direct external image URLs (`https://i.scdn.co/`); Phase 8 introduces no new images.
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); containers with horizontal buttons MUST use `flow-children="horizontal"` (not `"row"`). Focus traps or navigation loss degrade user experience.
- **TypeScript & Code Conventions:** Strict TypeScript (`tsconfig.json` has `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`), 2-space indentation, semicolons, ESLint 10 flat config (`pnpm lint`), Vitest unit tests (`*.test.ts(x)`), Python `unittest` (`tests/test_*.py`).
- **Error Handling:** Backend RPC calls must be wrapped in `try/catch` and surface user-friendly Decky toasts on failure; frontend must never crash on null/empty track or list states.

## Summary

Phase 8 upgrades controller ergonomics inside `DeckifyExpandedModal` without adding any external dependencies. Inspection of the codebase reveals why existing `Y`/`X` modal actions and `Back to Steam (B)` sidebar navigation are unreliable, and how L2/R2 trigger navigation should be layered onto the existing `usePlaybackClock` and `FocusNavController` architecture.

First, `DeckifyExpandedModal.tsx:635-645` currently listens only to `window.addEventListener("vgp_onbuttondown", ...)` and `keydown`. In SteamOS GamepadUI CEF, `vgp_onbuttondown` is a DOM event that can be consumed by `ModalRoot` or child `Focusable` nodes before reaching `window`, whereas `src/index.tsx:759-800` proves that `window.FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown` reliably receives numeric `GamepadButton` codes (`3` = `SECONDARY`/X, `4` = `OPTIONS`/Y, `5` = `BUMPER_LEFT`/L1, `6` = `BUMPER_RIGHT`/R1, `7` = `TRIGGER_LEFT`/L2, `8` = `TRIGGER_RIGHT`/R2 per `@decky/ui`'s `FooterLegend.d.ts:2-15`). Subscribing to `FocusNavController` inside `DeckifyExpandedModal`'s mount `useEffect` (with timestamp deduplication against `vgp_onbuttondown` and strict unmount cleanup) fixes `Y` (ActionMenu) and `X` (Like) across both list rows and `NowPlayingTab`/`LyricsTab`.

Second, for analog L2/R2 triggers (`0.0`–`1.0`), a pure `TriggerController` state machine (`src/utils/triggerController.ts`) should enforce Schmidt hysteresis (`>= 0.75` activate, `<= 0.25` reset), `300ms` software debounce, and `500ms` initial / `300ms` repeat hold-to-repeat. While `DeckifyExpandedModal` is mounted, a `requestAnimationFrame` loop can read `navigator.getGamepads()` (`buttons[6].value` / `buttons[7].value`) when available, while `FocusNavController` `TRIGGER_LEFT (7)` / `TRIGGER_RIGHT (8)` down/up events feed `1.0`/`0.0` into the same state machine as a guaranteed digital fallback. Both paths are strictly scoped to the modal's mount lifecycle.

Third, `Sidebar.tsx` (`src/components/common/Sidebar.tsx:88-175` — note `08-CONTEXT.md` refers to `src/components/Sidebar.tsx`, actual path is `src/components/common/Sidebar.tsx`) currently puts `overflowY: "auto"` on the outer `<div>` and places `Back to Steam (B)` outside the navigation `<Focusable flow-children="column">`. Separating the scrollable tab list (`flex: 1, minHeight: 0, overflowY: "auto"`) from a pinned footer (`flexShrink: 0`) inside a parent `<Focusable flow-children="column">` makes `Back to Steam (B)` always visible and reachable via D-pad Down/Up.

**Primary recommendation:** Build a pure, unit-tested `TriggerController` + `listNavigation` utility module, wire them in `DeckifyExpandedModal.tsx` via a `useTriggerNavigation` hook scoped strictly to modal mount, mark list rows with `data-deckify-list-item` for zero-refactor scroll+focus transfer across all 9 list tabs, and pin `Sidebar`'s `Back to Steam (B)` footer inside a parent `<Focusable flow-children="column">`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Analog trigger Schmidt hysteresis, debounce & auto-repeat | Browser / Client (`src/utils/triggerController.ts`, `DeckifyExpandedModal.tsx`) | — | Input polling and modal-scoped lifecycle live strictly in the React modal DOM/CEF layer; zero backend involvement. |
| Accumulated 250ms seek & `[0, duration_ms - 1000]` clamping | Browser / Client (`DeckifyExpandedModal.tsx`, `usePlaybackClock.ts`) | API / Backend (`seek_playback`) | Frontend accumulates rapid pulls and updates seekbar preview immediately; dispatches single debounced RPC to avoid Spotify 429s. |
| List fast-page jump, alphabetical anchor detection & focus transfer | Browser / Client (`DeckifyExpandedModal.tsx`, `InteractiveRow.tsx`) | — | DOM scroll (`scrollIntoView`) and `@decky/ui` focus transfer (`el.focus()`) are pure client spatial-navigation concerns. |
| Modal controller actions (`Y` options, `X` like, `L1`/`R1`) & `Sidebar` footer | Browser / Client (`DeckifyExpandedModal.tsx`, `Sidebar.tsx`) | — | `FocusNavController` input routing and `<Focusable flow-children="column">` layout are GamepadUI CEF responsibilities. |
| Persistent trigger settings (`trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, `show_controller_hints`) | Database / Storage (`py_modules/common.py`) | Browser / Client (`SettingsTab.tsx`, `src/types.ts`) | `DEFAULT_SETTINGS` and `settings.json` persistence live in Python `common.py`; UI sliders/toggles in `SettingsTab.tsx`. |

## Standard Stack

No new external packages are required for Phase 8. All functionality uses the existing project stack:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@decky/ui` | `^4.11.1` [VERIFIED: `package.json:29`] | `Focusable`, `ModalRoot`, `SliderField`, `ToggleField`, `GamepadButton` enum | Official SteamOS GamepadUI component & spatial navigation library. |
| `@decky/api` | `^1.1.3` [VERIFIED: `package.json:46`] | `callable` RPC bridge (`seek_playback`, `set_setting`) | Official Decky frontend-to-backend RPC layer. |
| `react` | `19.x` [VERIFIED: `package.json:32`] | Hooks (`useState`, `useEffect`, `useRef`, `useCallback`) | Decky Loader global React runtime. |
| `typescript` | `^5.9.3` [VERIFIED: `package.json:41`] | Strict type checking (`tsc --noEmit`) | Project language standard. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | `^5.1.0` [VERIFIED: `package.json:43`] | Frontend unit & component tests | Testing `TriggerController`, list jump logic, `SettingsTab`, `Sidebar`, `DeckifyExpandedModal`. |
| Python `unittest` | stdlib (Python 3.14) [VERIFIED: test run] | Backend settings defaults tests | Verifying `DEFAULT_SETTINGS` in `py_modules/common.py`. |

**Installation:** None required (`pnpm install` already satisfied).

## Package Legitimacy Audit

No external packages are installed or added in Phase 8.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| None added | — | — | — | — | — | No new external dependencies |

## Architecture Patterns

### System Architecture Diagram

```text
  [SteamOS GamepadUI / Controller]
       │
       ├──► navigator.getGamepads() (rAF loop, modal-scoped) ──┐
       ├──► FocusNavController.m_rgGamepadInputSources[0]       ├──► [TriggerController]
       │      (GamepadButton: 3=X, 4=Y, 5=L1, 6=R1, 7=L2, 8=R2) │     - Schmidt: >=0.75 / <=0.25
       └──► window "vgp_onbuttondown" / "keydown" (fallback) ───┘     - 300ms debounce
                                                                      - 500ms hold / 300ms repeat
                                                                               │
       ┌───────────────────────────────────────────────────────────────────────┘
       ▼
  [Suppression & Focus Guards]
   - trigger_nav_enabled === false? ──► ignore L2/R2
   - actionTrack || showAddToPlaylistModal || INPUT/TEXTAREA? ──► ignore L2/R2
   - mode in ["now_playing", "lyrics"]? ──► [Seek Accumulator (250ms)]
       │                                      ├──► immediate clock.scrubTo(clamped [0, dur-1000])
       │                                      ├──► floating pill ("+20s" / "-10s", ~1000ms fade)
       │                                      └──► single backendSeekPlayback RPC + error toast
   - mode in LIST_MODES?
       ├──► focus inside Sidebar (not contentPaneRef)? ──► ignore L2/R2 (D-10)
       └──► focus inside contentPaneRef ──► [List Fast-Page Helper]
                                              ├──► detect A-Z sorted vs ±pageSize
                                              ├──► boundary clamp / onLoadMore() on R2 at end
                                              ├──► scrollIntoView({ block: "nearest" }) + el.focus()
                                              └──► floating pill ("16 / 120" or "M", ~1000ms fade)
```

### Recommended Project Structure
```text
src/
├── utils/
│   ├── triggerController.ts      # Pure Schmidt hysteresis + debounce + repeat state machine
│   ├── triggerController.test.ts # Unit tests for hysteresis, chatter rejection, repeat, reset
│   ├── listNavigation.ts         # Pure list jump calculation (±N, A-Z anchor, boundary/short-list)
│   └── listNavigation.test.ts    # Unit tests for paging, A-Z anchors, boundaries
├── hooks/
│   └── useTriggerNavigation.ts   # Modal-scoped hook wiring FocusNavController + rAF + vgp fallback
├── components/
│   ├── DeckifyExpandedModal.tsx  # Hosts useTriggerNavigation, floating pill, hint bar, contentPaneRef
│   ├── common/
│   │   ├── Sidebar.tsx           # Pinned Back to Steam (B) footer outside scrollable tab list
│   │   └── InteractiveRow.tsx    # Supports optional data-deckify-* / ref forwarding if needed
│   └── tabs/
│       └── SettingsTab.tsx       # "Controller & Trigger Navigation" card (2 toggles, 2 SliderFields)
```

### Pattern 1: Pure `TriggerController` State Machine (D-12)
**What:** Isolate Schmidt hysteresis (`0.75` activate / `0.25` release), `300ms` debounce, and `500ms`/`300ms` hold-to-repeat in a framework-agnostic TypeScript class with injected `now` timestamps for deterministic Vitest testing.
**When to use:** Both `navigator.getGamepads()` analog values (`0.0`–`1.0`) and digital `GamepadButton.TRIGGER_LEFT (7)` / `TRIGGER_RIGHT (8)` down/up events feed into `processTrigger(side, value, now)`.
**Example:**
```typescript
export interface TriggerChannelState {
  armed: boolean;
  heldSince: number | null;
  lastFireAt: number;
}

export const TRIGGER_PRESS_THRESHOLD = 0.75;
export const TRIGGER_RELEASE_THRESHOLD = 0.25;
export const TRIGGER_DEBOUNCE_MS = 300;
export const TRIGGER_REPEAT_DELAY_MS = 500;
export const TRIGGER_REPEAT_INTERVAL_MS = 300;
```
- **Chatter rejection:** Value oscillates `0.74 -> 0.76 (fires) -> 0.73 -> 0.78`: because `armed` became `false` at `0.76` and never dropped `<= 0.25`, `0.78` does NOT re-trigger.
- **Release reset:** Value drops `<= 0.25` -> `armed = true`, `heldSince = null`.
- **Hold-to-repeat:** While `!armed` (`value > 0.25`), if `heldSince !== null && now - heldSince >= 500 && now - lastFireAt >= 300`, fire repeat and update `lastFireAt = now`.

### Pattern 2: Hybrid SteamOS Modal Input Subscription (Folded Todo + CTRL-03)
**What:** Subscribe to `window.FocusNavController?.m_rgGamepadInputSources?.[0]?.RegisterForGamepadButtonDown` (and `RegisterForGamepadButtonUp`) inside `DeckifyExpandedModal`'s `useEffect`, alongside `vgp_onbuttondown` and `keydown` fallbacks, with an `isMounted` guard and `80ms` per-action deduplication so a button press never double-fires if both `FocusNavController` and `vgp_onbuttondown` emit.
**Verified constants from `node_modules/@decky/ui/dist/components/FooterLegend.d.ts:2-15`:**
```typescript
// Verbatim from node_modules/@decky/ui/dist/components/FooterLegend.d.ts:2-15
export declare enum GamepadButton {
    INVALID = 0,
    OK = 1,
    CANCEL = 2,
    SECONDARY = 3,
    OPTIONS = 4,
    BUMPER_LEFT = 5,
    BUMPER_RIGHT = 6,
    TRIGGER_LEFT = 7,
    TRIGGER_RIGHT = 8,
    DIR_UP = 9,
    DIR_DOWN = 10,
    DIR_LEFT = 11,
    DIR_RIGHT = 12,
    ...
}
```
**Unregistration safety:** `RegisterForGamepadButtonDown` in SteamOS returns either `{ Unregister(): void }` or a cleanup function (or void in mocks). Call `unsub?.Unregister?.()` / `typeof unsub === "function" && unsub()` AND set `let active = true` -> `active = false` in the `useEffect` cleanup so stale listeners become immediate no-ops on modal close.

### Pattern 3: Zero-Refactor List Fast-Paging via `contentPaneRef` + DOM Attributes (D-05, D-06, D-07, D-08, D-10)
**What:** Tag list rows across `TrackRowItem` and tab `InteractiveRow` lists with `data-deckify-list-item="true"` (and optional `data-deckify-label={item.name}` for A–Z anchor lists like `ArtistsTab` / `SoundtracksTab`).
**How it works:**
1. **Content-Focus Guard (D-10):** Check `contentPaneRef.current?.contains(document.activeElement)`. If `false` (e.g., focus is in `Sidebar`), ignore L2/R2 list jumps.
2. **Row Discovery:** Query `Array.from(contentPaneRef.current.querySelectorAll<HTMLElement>('[data-deckify-list-item="true"]'))`.
3. **Current Index:** Find index of `document.activeElement` (or `rows.findIndex(r => r.contains(document.activeElement))`), defaulting to `0` if focus is on a tab header/control inside `contentPaneRef`.
4. **Target Index Calculation (`listNavigation.ts`):**
   - If `rows.length === 0`: no-op (no pill, no error).
   - If `rows.length <= pageSize`: L2 -> `0`, R2 -> `rows.length - 1` (D-08 short-list shortcut).
   - If list is marked A–Z sorted (`data-deckify-sorted="az"` on container or tab): find the next/previous row whose first alphanumeric character differs from the current row's anchor letter, and return `{ targetIndex, badge: anchorChar }`.
   - Otherwise: `clamp(currentIndex + direction * pageSize, 0, rows.length - 1)`, and return `{ targetIndex, badge: "${targetIndex + 1} / ${rows.length}" }`.
   - **Boundary Load More (D-08):** If `direction === 1 && currentIndex === rows.length - 1` and the active tab has a `Load More` action (e.g., `LikedSongsTab` when `likedTotal > likedTracks.length`), invoke `onLoadMore()`.
5. **Scroll + Focus Transfer (D-06):**
   ```typescript
   const targetEl = rows[targetIndex];
   targetEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
   targetEl.focus();
   ```
   Because `InteractiveRow` renders `<Focusable noFocusRing onFocus={...} onGamepadFocus={...}>`, calling `targetEl.focus()` updates `focusedTrackRef.current` (via `onFocus`), applies `focusHalo`, and moves SteamOS spatial focus to the new row!

### Pattern 4: Accumulated 250ms Seek + Boundary Clamping (D-01, D-02, D-03)
**What:** In `NowPlayingTab` and `LyricsTab`, consecutive L2/R2 pulls within `250ms` accumulate `pendingSeekDeltaSecRef` (e.g., `+10s` + `+10s` = `+20s`) and immediately update the seekbar preview via `clock.scrubTo(clampedTargetMs)` without shifting focus.
**Critical detail in `usePlaybackClock.ts:336-340`:**
`usePlaybackClock.scrubTo` currently clamps to `[0, durationMs]`, whereas D-03 requires `[0, Math.max(0, durationMs - 1000)]` so spamming R2 near the end of a song never triggers an accidental track skip. Compute `const maxSeekMs = Math.max(0, durationMs - 1000);` before passing `clampedTarget` to `clock.scrubTo(clampedTarget)`.
**Error toast:** `usePlaybackStatus.ts:32-36` currently ignores `backendSeekPlayback` failures. Update `onSeekCommit` (or trigger seek commit) to check `if (res && res.ok === false)` / `catch` and display the `08-UI-SPEC.md` error toast: `"Playback seek failed — Spotify did not respond. Try again or check your active device."`.

### Pattern 5: Pinned `Sidebar` Footer (`Back to Steam (B)`)
**What:** Refactor `src/components/common/Sidebar.tsx:88-175` so the outer container is `<Focusable flow-children="column" style={{ width: 220, display: "flex", flexDirection: "column", padding: 16, flexShrink: 0, overflow: "hidden" }}>`.
- Brand header: `flexShrink: 0`
- Navigation Menu wrapper: `<div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}><Focusable flow-children="column">...</Focusable></div>`
- Now Playing Widget: `flexShrink: 0`
- Pinned Footer: `<div style={{ flexShrink: 0, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 8, marginTop: 8 }}><InteractiveRow onClick={() => closeModal?.()} ...><span>Back to Steam (B)</span></InteractiveRow></div>`

### Anti-Patterns to Avoid
- **Global `index.tsx` trigger listeners:** Never register L2/R2 listeners in `src/index.tsx`! They would fire during active gameplay and break aiming/shooting (CTRL-03, Success Criterion 4).
- **Direct `clock.scrubDelta()` without `[0, duration_ms - 1000]` clamping:** `usePlaybackClock.scrubDelta` clamps to `durationMs`, which can cause Spotify to immediately skip to the next track when seeking to `100%`.
- **Wrapping `SliderField` without `vgp_oncancel` bubble-phase handling:** Already solved in `DeckifyExpandedModal.tsx:653` (bubble phase `false`), must be preserved!
- **Using `flow-children="row"`:** Always use `flow-children="horizontal"` or `flow-children="column"` per `GEMINI.md`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Monotonic playback interpolation & post-seek drift suppression | Custom `setInterval` position tracker | Existing `usePlaybackClock` (`clock.scrubTo`) | Already handles `1500ms` post-seek suppression and `1200ms` drift gating (`src/hooks/usePlaybackClock.ts`). |
| Settings sliders & toggles | Custom range `<input>` or button steppers | `@decky/ui` `SliderField` & `ToggleField` (as in `SoundtracksTab.tsx:424-463`) | Enforced by D-04 and `08-UI-SPEC.md`; native GamepadUI D-pad Left/Right scrubbing support. |
| Focus ring styling on list rows | Custom CSS `:focus` rules | Existing `InteractiveRow` + `focusHalo` (`src/components/common/InteractiveRow.tsx`) | Already handles `onFocus`/`onGamepadFocus` and `#fff` + `#1db954` halo. |

## Common Pitfalls

### Pitfall 1: Double-Firing When Both `FocusNavController` and `vgp_onbuttondown` Are Active
**What goes wrong:** Pressing `Y`, `X`, `L1`, `R1`, or `L2`/`R2` triggers the handler twice (e.g., `X` toggles like ON then immediately OFF, or `L1` skips two tabs).
**Why it happens:** In SteamOS CEF, `FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown` fires at the input source level, and Steam may *also* dispatch `vgp_onbuttondown` to the focused DOM node.
**How to avoid:** Maintain a `lastActionTimeRef` map per action (`"X"`, `"Y"`, `"L1"`, `"R1"`, `"L2"`, `"R2"`) with an `~80ms` dedup window (for digital buttons) and route `L2`/`R2` through `TriggerController` which already enforces `300ms` debounce.
**Warning signs:** Pressing `X` in tests or on Deck does not change like state (toggled twice).

### Pitfall 2: `navigator.getGamepads()` Returning `null` Entries or Unconnected Slots
**What goes wrong:** `navigator.getGamepads()` returns `[null, Gamepad, null, null]` or throws in restricted/test environments.
**Why it happens:** Gamepad indices are sparse in Chromium, and `vitest` / Node environments may not define `navigator.getGamepads`.
**How to avoid:** Guard with `typeof navigator !== "undefined" && typeof navigator.getGamepads === "function"`, iterate `for (const gp of navigator.getGamepads())`, skip `!gp || !gp.connected`, and safely read `gp.buttons?.[6]?.value ?? 0` and `gp.buttons?.[7]?.value ?? 0`.
**Warning signs:** `TypeError: navigator.getGamepads is not a function` in Vitest or `Cannot read properties of null` in CEF.

### Pitfall 3: `Sidebar` `Back to Steam (B)` Trapped Outside `<Focusable>`
**What goes wrong:** User presses D-pad Down on the last tab (`Settings`) and focus refuses to move to `Back to Steam (B)`, or `Back to Steam (B)` is scrolled out of view.
**Why it happens:** `Sidebar.tsx` currently puts `overflowY: "auto"` on the root `<div>` and places `Back to Steam (B)` outside the Navigation Menu `<Focusable>`.
**How to avoid:** Wrap the entire `Sidebar` in a root `<Focusable flow-children="column">` and isolate `overflowY: "auto"` to the inner tab-list wrapper `<div>` with `flex: 1, minHeight: 0`.

### Pitfall 4: `SettingsTab.test.tsx` Mock Missing `SliderField` and `ToggleField`
**What goes wrong:** Adding `SliderField` and `ToggleField` to `SettingsTab.tsx` breaks `SettingsTab.test.tsx` at runtime because `SettingsTab.test.tsx:14-19` only mocks `Focusable` from `@decky/ui`.
**Why it happens:** `SettingsTab.test.tsx` uses `vi.mock("@decky/ui", ...)` with an explicit object.
**How to avoid:** Update `SettingsTab.test.tsx` `@decky/ui` mock to include `SliderField` and `ToggleField` (matching `SoundtracksTab.test.tsx:24-25`).

## Code Examples

### Reading Analog Triggers Safely in `useTriggerNavigation.ts`
```typescript
// Guarded rAF loop (only active while DeckifyExpandedModal is mounted)
if (typeof navigator !== "undefined" && typeof navigator.getGamepads === "function") {
  const gamepads = navigator.getGamepads();
  let maxL2 = 0;
  let maxR2 = 0;
  for (const gp of gamepads) {
    if (!gp || !gp.connected) continue;
    const l2 = gp.buttons?.[6]?.value ?? 0;
    const r2 = gp.buttons?.[7]?.value ?? 0;
    if (l2 > maxL2) maxL2 = l2;
    if (r2 > maxR2) maxR2 = r2;
  }
  // Feed into TriggerController state machine
}
```

### `SliderField` & `ToggleField` in `SettingsTab.tsx` (matching `SoundtracksTab.tsx:424-463`)
```tsx
<ToggleField
  label="L2/R2 Trigger Navigation"
  description="Seek in Now Playing / Lyrics and fast-page through library lists"
  checked={status?.settings?.trigger_nav_enabled ?? true}
  onChange={async (val: boolean) => {
    await backendSetSetting("trigger_nav_enabled", val);
    showToast(val ? "L2/R2 Trigger Navigation enabled" : "L2/R2 Trigger Navigation disabled");
    refreshStatus();
  }}
/>
<SliderField
  label={`Seek Step (${status?.settings?.trigger_seek_seconds ?? 10}s)`}
  value={status?.settings?.trigger_seek_seconds ?? 10}
  min={5}
  max={30}
  step={5}
  showValue
  onChange={async (val: number) => {
    await backendSetSetting("trigger_seek_seconds", val);
    refreshStatus();
  }}
/>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `window.addEventListener("vgp_onbuttondown")` only (`DeckifyExpandedModal.tsx:641`) | `FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown` + `vgp_onbuttondown` fallback | Phase 8 (matching `src/index.tsx:759`) | Fixes broken `Y`/`X` modal actions and captures `TRIGGER_LEFT`/`TRIGGER_RIGHT`. |
| Unpinned `Sidebar` with outer `overflowY: "auto"` | Outer `<Focusable flow-children="column">` + inner scrollable list + pinned footer | Phase 8 | Guarantees `Back to Steam (B)` is always visible and D-pad reachable. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | SteamOS GamepadUI CEF exposes analog trigger floats (`0.0`–`1.0`) on `navigator.getGamepads()[i].buttons[6/7].value` while the modal is open; if Steam Input suppresses `getGamepads()` in GamepadUI, `FocusNavController` emits digital `TRIGGER_LEFT (7)` / `TRIGGER_RIGHT (8)` events. | Architecture Patterns, Summary | Low — hybrid `TriggerController` accepts both analog `0.0`–`1.0` and digital `1.0`/`0.0` inputs seamlessly. |
| A2 | `RegisterForGamepadButtonDown` returns an object with `.Unregister()` or a function in SteamOS GamepadUI CEF. | Architecture Patterns | Low — `active` boolean flag in `useEffect` cleanup guarantees immediate no-op on unmount even if `.Unregister` is absent. |

## Open Questions (RESOLVED)

1. **RESOLVED: Which lists are sorted A–Z for alphabetical anchor paging (D-05)?**
   - What we know: `ArtistsTab` (`followedArtists`) and `SoundtracksTab` (`sortGames`) are alphabetical; `LikedSongsTab`, `RecentTab`, and `QueueTab` are chronological/ordered.
   - Decision: Mark alphabetical list containers explicitly with `data-deckify-sorted="az"` (`ArtistsTab` artist list, `SoundtracksTab` games list) and `data-deckify-label={item.name}` on their rows so `listNavigation.ts` deterministically uses A–Z anchor jumps where appropriate and `±pageSize` everywhere else.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm | Build, typecheck, Vitest | ✓ | pnpm / Node 20+ | — |
| Vitest | Frontend unit tests (`pnpm test`) | ✓ | 5.1.0 | — |
| TypeScript | Typecheck (`pnpm typecheck`) | ✓ | 5.9.3 | — |
| Python `unittest` | Backend tests (`py -m unittest`) | ✓ | Python 3.14 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest `5.1.0` |
| Backend Framework | Python `unittest` (stdlib) |
| Config file | `package.json` (`test`, `typecheck`, `lint`, `test:python`) |
| Quick run command | `pnpm test --run` (82 tests, ~2s) |
| Typecheck command | `pnpm typecheck` |
| Full suite command | `pnpm test --run && pnpm typecheck && py -m unittest discover -s tests -p "test_*.py"` (432 Python tests) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CTRL-01 | Accumulated 250ms L2/R2 seek, `[0, duration_ms - 1000]` clamping, focus preservation, floating delta pill | unit | `pnpm test --run src/components/DeckifyExpandedModal.test.tsx` | ✅ (extend) |
| CTRL-02 | ±N item paging, A–Z anchor jumps, boundary clamping, short-list shortcut, `onLoadMore`, content-focus guard | unit | `pnpm test --run src/utils/listNavigation.test.ts` | ❌ Wave 0 |
| CTRL-03 | Schmidt hysteresis (`0.75` press / `0.25` release), `300ms` debounce, `500ms`/`300ms` repeat, modal-only cleanup | unit | `pnpm test --run src/utils/triggerController.test.ts` | ❌ Wave 0 |
| Settings | `DEFAULT_SETTINGS` keys (`trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, `show_controller_hints`) + `SettingsTab` `SliderField`/`ToggleField` | unit | `pnpm test --run src/components/tabs/SettingsTab.test.tsx` & `py -m unittest tests/test_py_modules.py` | ✅ (extend) |
| Sidebar | Fixed `Back to Steam (B)` footer outside scrollable tab list | unit | `pnpm test --run src/components/common/Sidebar.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test --run && pnpm typecheck`
- **Phase gate:** Full suite (`pnpm test --run && pnpm typecheck && pnpm lint && py -m unittest discover -s tests -p "test_*.py"`) green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `src/utils/triggerController.test.ts` — covers CTRL-03 Schmidt hysteresis, debounce, chatter rejection, hold-to-repeat
- [ ] `src/utils/listNavigation.test.ts` — covers CTRL-02 ±N paging, A–Z anchor jumps, short lists, boundary clamping
- [ ] `src/components/common/Sidebar.test.tsx` — covers pinned `Back to Steam (B)` footer structure

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | Clamp `trigger_seek_seconds` (`5–30`), `trigger_page_size` (`5–50`), and seek target (`[0, duration_ms - 1000]`) before RPC dispatch. |
| V6 Cryptography | no | — |

## Sources

### Primary (HIGH confidence)
- Codebase files read in session: `src/components/DeckifyExpandedModal.tsx:580-966`, `src/components/common/Sidebar.tsx:1-177`, `src/index.tsx:730-830`, `src/hooks/usePlaybackClock.ts:1-390`, `src/hooks/usePlaybackStatus.ts:1-52`, `src/components/common/InteractiveRow.tsx:1-136`, `src/components/tabs/SettingsTab.tsx:1-320,640-748`, `src/components/tabs/SoundtracksTab.tsx:420-475`, `src/types.ts:143-180`, `py_modules/common.py:70-106`.
- `@decky/ui` type definitions read in session: `node_modules/@decky/ui/dist/components/FooterLegend.d.ts:1-68`, `node_modules/@decky/ui/dist/components/Focusable.d.ts:1-12`.

### Secondary (MEDIUM confidence)
- WebSearch on `SteamClient.Input.RegisterForControllerInputMessages` and `FocusNavController.m_rgGamepadInputSources` confirming `SteamClient.Input` is undocumented/volatile across SteamOS updates, validating our hybrid `navigator.getGamepads()` + `FocusNavController` approach.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from `package.json` and `node_modules/@decky/ui`.
- Architecture: HIGH — all integration points, line numbers, and `@decky/ui` enums verified in session.
- Pitfalls: HIGH — root causes of `vgp_onbuttondown` unreliability and `Sidebar` focus trap directly observed in source.

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (30 days; `@decky/ui` 4.11.1 and React 19 are stable)
