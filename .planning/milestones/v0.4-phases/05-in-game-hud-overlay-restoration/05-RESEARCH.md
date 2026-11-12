# Phase 5: In-Game HUD Overlay Restoration - Research

**Researched:** 2026-11-11  
**Domain:** SteamOS GamepadUI CEF, Decky Global Component Lifecycle, In-Game HUD Overlay, Spotify State Synchronization  
**Confidence:** HIGH  

## Summary

Phase 5 restores and enhances the Deckify in-game floating HUD overlay across gameplay and SteamOS GamepadUI navigation. In Decky Loader plugins running inside Valve's SteamOS Chromium Embedded Framework (CEF), floating in-game elements are registered at plugin startup via `routerHook.addGlobalComponent`. While basic overlay registration was present in `src/index.tsx`, several critical gaps degraded reliability: `DeckifyOverlayWrapper`'s 4-second polling loop only updated `settings` while ignoring `track` and `is_playing`, causing the HUD to freeze when background push events were missed or when using the official Spotify desktop client backend; the overlay immediately unmounted instead of performing smooth opacity fade-out transitions; and users had no direct way to toggle or reposition the HUD from the Quick Access Menu (QAM) while gaming.

To resolve these issues cleanly, this phase introduces:
1. **Configurable display mode (`overlay_autohide: boolean`)**: Users can toggle between permanent HUD mode (continuous display while music is playing) and auto-hide mode (badge appears for 6 seconds upon track start/resume, then smoothly fades out).
2. **QAM direct controls**: An 'Overlay HUD' toggle and 4-corner position selector directly inside the Quick Access Menu mini-player (`src/index.tsx`) beneath playback controls, enabling zero-friction adjustment mid-game.
3. **Visual styling & progress line (`overlay_show_progress: boolean`)**: Configurable compact mode (36px cover, title truncated at 45 chars, artist, play/pause indicator) with an optional 2px green progress line along the bottom reflecting live playback position.
4. **Pause grace period & fade-out**: When playback pauses, the overlay displays a pause indicator for 3.5 seconds (within the 3-4s requirement) before transitioning opacity to 0, ensuring gameplay visuals remain unobscured.
5. **Robust multi-tier synchronization**: `DeckifyOverlayWrapper` updates `track`, `is_playing`, `position_ms`, `duration_ms`, and `settings` concurrently during its 4-second fallback polling, guaranteeing that missed events or backend switches never freeze the HUD.

**Primary recommendation:** Keep `DeckifyOverlay` mounted with CSS opacity transitions (`opacity: isVisible ? 1 : 0`, `pointerEvents: "none"`) rather than returning `null` during state transitions, and synchronize `track`, `isPlaying`, `settings`, `positionMs`, and `durationMs` concurrently in `DeckifyOverlayWrapper`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Configurable Permanent vs Auto-Hide):** Provide a user setting (`overlay_autohide: boolean`, default `false`/permanent) allowing users to choose whether the HUD remains visible continuously while music plays or automatically fades out 6 seconds after a song starts or resumes. [VERIFIED: .planning/phases/05-in-game-hud-overlay-restoration/05-CONTEXT.md:29-32]
- **D-02 (QAM Direct Controls):** Add an 'Overlay HUD' toggle and 4-corner position selector (`top-left`, `top-right`, `bottom-left`, `bottom-right`) directly into the Quick Access Menu mini-player (`src/index.tsx`) beneath playback controls. Players can toggle or move the HUD instantly during a game session without opening the modal. [VERIFIED: .planning/phases/05-in-game-hud-overlay-restoration/05-CONTEXT.md:33-36]
- **D-03 (Configurable Visual Style & Progress Line):** Provide style configuration (`overlay_show_progress: boolean`):
  - Compact: 36px artwork, title (truncated at 45 chars), artist, and play/pause indicator icon.
  - With Progress Bar: adds a subtle 2px green progress line at the bottom of the badge showing track progress. [VERIFIED: .planning/phases/05-in-game-hud-overlay-restoration/05-CONTEXT.md:37-42]
- **D-04 (Pause Grace Period & Fade-Out):** When music is paused during gameplay, display the pause icon in the overlay badge for 3-4 seconds, then transition opacity to 0 to keep the gameplay screen clean. When playback resumes (`is_playing: true`), immediately fade back in. [VERIFIED: .planning/phases/05-in-game-hud-overlay-restoration/05-CONTEXT.md:43-46]
- **D-05 (Robust State Polling in Wrapper):** In `DeckifyOverlayWrapper` (`src/index.tsx`), update the background polling loop to synchronize `track` (`s.track || s.track_meta`), `isPlaying` (`Boolean(s.is_playing)`), and `settings` (`s.settings`) simultaneously. This ensures the HUD never freezes on stale metadata when playing through Spotify Connect or when process events are dropped. [VERIFIED: .planning/phases/05-in-game-hud-overlay-restoration/05-CONTEXT.md:47-50]

### the agent's Discretion
- Exact CSS cubic-bezier transition curves for fade-in / fade-out animations (`cubic-bezier(0.16, 1, 0.3, 1)` recommended for natural SteamOS easing).
- Fallback placeholder icon styling when track has no album artwork (`FaMusic` with `#1db954` or `#888`).

### Deferred Ideas (OUT OF SCOPE)
- Floating interactive lyrics overlay (deferred to v2 `LYRIC-01`).
- Game-specific audio ducking profiles (already implemented under settings/audio, not part of overlay visual HUD).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **HUD-01** | Ensure the Deckify in-game HUD overlay mounts reliably in Steam GamepadUI gamescope, respects the settings toggle, and auto-hides or displays according to configuration. | Addressed by global component lifecycle (`routerHook.addGlobalComponent`), settings persistence (`overlay_enabled`, `overlay_position`, `overlay_autohide`), QAM toggle controls, and timer-based auto-hide logic in `DeckifyOverlay`. |
| **HUD-02** | Correctly resolve and render album artwork and playback state indicators (playing/paused) in the HUD overlay. | Addressed by `DeckifyImage` with in-memory caching and CSP proxy fallback, `resolveArtworkUrl` supporting multiple payload schemas, real-time play/pause state icons, and 3-4s pause grace period before fade-out. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Global Overlay Injection | Frontend (`@decky/api`) | SteamOS CEF Gamescope | `routerHook.addGlobalComponent` registers the root HUD into the top-level GamepadUI window tree |
| HUD Presentation & Animations | Frontend (`DeckifyOverlay`) | Browser CSS Transitions | Manages badge layout, cover art, play/pause icon, auto-hide timers, and CSS opacity transitions |
| Wrapper State Coordination | Frontend (`DeckifyOverlayWrapper`) | Backend RPC | Subscribes to events (`track_metadata`, `librespot_event`, `settings_changed`) with 4s concurrent polling |
| QAM Quick Controls | Frontend (`src/index.tsx:Content`) | Backend RPC (`set_setting`) | Renders toggle and position dropdown in Steam QAM and commits settings updates immediately |
| Settings Storage & RPC Validation | Backend (`py_modules/common.py`, `main.py`) | Filesystem (`settings.json`) | Persists `overlay_enabled`, `overlay_position`, `overlay_autohide`, `overlay_show_progress` atomically |
| Base64 CSP Image Proxy | Backend (`py_modules/images.py`) | Frontend (`DeckifyImage`) | Downloads and encodes Spotify CDN images into data URIs to bypass Steam CEF Content Security Policy |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@decky/api` | 1.1.3 | Global component mounting & RPC | Standard Decky API for registering global overlays (`routerHook.addGlobalComponent`) [VERIFIED: package.json:46] |
| `@decky/ui` | 4.11.1 | SteamOS GamepadUI controls | Provides standard SteamOS components (`ToggleField`, `DropdownItem`, `Focusable`) [VERIFIED: package.json:29] |
| `react` | 19.2.x | UI component framework | Framework bundled with Steam GamepadUI CEF [VERIFIED: package.json:32] |
| `react-icons` | 5.5.0 | Vector UI icons | Lightweight SVG icons (`FaMusic`, `FaPlay`, `FaPause`) [VERIFIED: package.json:48] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `usePlaybackClock` | internal | Local clock interpolation & progress | Provides smooth track position interpolation for the optional 2px progress bar |
| `DeckifyImage` | internal | CSP-safe image caching & rendering | Handles base64 image proxying and local memory caching for album art |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS opacity transitions | Unmounting (`return null`) | Unmounting abruptly cuts off fade-out transitions; CSS opacity with `pointerEvents: "none"` provides smooth easing |
| Concurrent 4s fallback polling | Event-only updates | Process events (`librespot_event`) can be missed or are not emitted by alternative backends like `spotify_client` |
| QAM toggle + dropdown | Modal-only settings | Modal requires opening full-screen view; QAM controls allow instant mid-game adjustment |

## Package Legitimacy Audit

No external packages need to be installed for this phase. All required libraries (`@decky/api`, `@decky/ui`, `react-icons`) are already installed and locked in `package.json`.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@decky/api` | npm | 2+ yrs | N/A (Decky ecosystem) | github.com/SteamDeckHomebrew/decky-loader | [OK] | Approved |
| `@decky/ui` | npm | 2+ yrs | N/A (Decky ecosystem) | github.com/SteamDeckHomebrew/decky-loader | [OK] | Approved |
| `react-icons` | npm | 8+ yrs | ~3.5M/wk | github.com/react-icons/react-icons | [OK] | Approved |

**Packages removed due to [SLOP] verdict:** None  
**Packages flagged as suspicious [SUS]:** None  

## Architecture Patterns

### System Architecture Diagram

```
SteamOS GamepadUI CEF Environment
┌────────────────────────────────────────────────────────────────────────┐
│ routerHook.addGlobalComponent("DeckifyOverlay", DeckifyOverlayWrapper)  │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ DeckifyOverlayWrapper                                              │ │
│ │   - Event Listeners: track_metadata, librespot_event, settings     │ │
│ │   - Concurrent 4s Fallback Polling (track, is_playing, settings)   │ │
│ │   - Prop Feed -> DeckifyOverlay                                    │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                  │                                     │
│                                  ▼                                     │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ DeckifyOverlay (Fixed HUD Badge, pointer-events: none)             │ │
│ │   - Position: top-left | top-right | bottom-left | bottom-right    │ │
│ │   - Visuals: 36px Cover (DeckifyImage) + Title + Artist + Icon     │ │
│ │   - Progress Line (D-03): 2px green bar when enabled               │ │
│ │   - Auto-Hide Engine (D-01): 6s timer upon track start/resume      │ │
│ │   - Pause Delay Engine (D-04): 3.5s pause icon before fade-out     │ │
│ │   - CSS Opacity & Glide Transitions                                │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                                   ▲
                                   │ RPC & Events
┌──────────────────────────────────┴─────────────────────────────────────┐
│ Python Daemon (main.py, py_modules/)                                   │
│   - DEFAULT_SETTINGS: overlay_enabled, overlay_position,               │
│                       overlay_autohide, overlay_show_progress          │
│   - set_setting() validation & persistence to settings.json            │
│   - get_status() includes overlay settings in public_keys              │
│   - decky.emit("track_metadata", ...) & decky.emit("settings_changed") │
└────────────────────────────────────────────────────────────────────────┘
```

### Pattern 1: Global Component Lifecycle in Decky
**What:** SteamOS GamepadUI overlays must register at startup via `routerHook.addGlobalComponent` and cleanly unregister on dismount.
**When to use:** For floating UI elements that must remain rendered over games and across GamepadUI route changes.

Verified in `src/index.tsx`:
```typescript
// [VERIFIED: src/index.tsx:526-530]
routerHook.addGlobalComponent("DeckifyOverlay", () => <DeckifyOverlayWrapper />);

// [VERIFIED: src/index.tsx:677-679]
onDismount() {
  try {
    routerHook.removeGlobalComponent("DeckifyOverlay");
  } catch {}
}
```

### Pattern 2: Dual-Signal State Synchronization (Events + Concurrent Fallback Polling)
**What:** Real-time event listeners provide immediate response (< 50ms) when librespot fires track changes or play/pause events, while a 4000ms polling loop queries `backendGetStatus()` to synchronize `track`, `is_playing`, `position_ms`, `duration_ms`, and `settings` concurrently.
**Why:** Background events can be missed during high CPU load or when using external Spotify Connect targets, and the official Spotify desktop client backend does not emit `librespot_event`. The concurrent poll guarantees the HUD recovers within 4 seconds.

```typescript
// Pattern in DeckifyOverlayWrapper
useEffect(() => {
  let mounted = true;

  const syncState = (s: StatusResponse | null) => {
    if (!mounted || !s) return;
    const t = s.track || s.track_meta;
    if (t) setTrack(t);
    if (typeof s.is_playing === "boolean") setIsPlaying(s.is_playing);
    if (s.settings) setSettings(s.settings);
    if (typeof s.position_ms === "number") setServerPositionMs(s.position_ms);
    if (typeof s.duration_ms === "number") setDurationMs(s.duration_ms || t?.duration_ms || 0);
  };

  backendGetStatus().then(syncState).catch(() => {});

  const unsubMeta = addEventListener<[any]>("track_metadata", (meta: any) => {
    if (meta) setTrack(meta);
  });
  const unsubLibre = addEventListener<[any]>("librespot_event", (ev: any) => {
    if (ev?.event === "playing") setIsPlaying(true);
    else if (ev?.event === "paused" || ev?.event === "stopped") setIsPlaying(false);
  });
  const unsubSettings = addEventListener<[any]>("settings_changed", (st: any) => {
    if (st) setSettings(st);
  });

  const poll = setInterval(async () => {
    try {
      const s = await backendGetStatus();
      syncState(s);
    } catch {}
  }, 4000);

  return () => {
    mounted = false;
    clearInterval(poll);
    removeEventListener("track_metadata", unsubMeta);
    removeEventListener("librespot_event", unsubLibre);
    removeEventListener("settings_changed", unsubSettings);
  };
}, []);
```

### Pattern 3: Self-Contained HUD Presentation with Auto-Hide & Pause Grace Timers
**What:** `DeckifyOverlay` manages its internal visibility state (`visibleState: boolean`) based on `isPlaying`, track changes, `autoHide`, and pause transitions.
**Rules:**
1. When `isPlaying` is true:
   - If `autoHide` is false: stay visible (`visibleState = true`).
   - If `autoHide` is true: show for 6000ms, then set `visibleState = false`. If track changes while playing, reset the 6000ms timer.
2. When `isPlaying` transitions to false (pause):
   - If previously visible: maintain `visibleState = true` for 3500ms (3.5s, satisfying D-04's 3-4s requirement) while rendering the `<FaPause>` icon.
   - When 3500ms elapses: set `visibleState = false`.
   - If playback resumes during the grace period: cancel the pause timer and immediately show play state.
3. Keep container mounted with `opacity: visibleState ? 1 : 0`, `pointerEvents: "none"`, and smooth CSS transitions.

### Anti-Patterns to Avoid
- **Unmounting with `return null` on pause/hide:** Destroys DOM nodes immediately, preventing CSS exit animations from playing. Instead, use `opacity: 0` with `pointerEvents: "none"`.
- **Capturing pointer events on overlay badge:** If `pointerEvents: "none"` is omitted or overridden on children, game inputs and touch clicks will be captured by CEF, making games unplayable while the overlay is visible.
- **Polling only settings in wrapper:** Leaving `track` and `isPlaying` out of the 4s polling loop causes permanent freeze if an event is dropped.
- **Forgetting `public_keys` in `main.py`:** If `overlay_autohide` and `overlay_show_progress` are not in `public_keys`, `get_status()` will strip them, causing frontend settings state desynchronization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| In-Game Overlay Injection | Custom window injection / DOM hacking | `routerHook.addGlobalComponent` | Decky Loader manages root lifecycle, routing boundaries, and gamescope CEF layering |
| Base64 Image Fetching & Caching | Custom fetch in overlay | `DeckifyImage` with `fetchWithQueueAndCache` | Handles concurrency limits, memory LRU caching, and Steam CEF CSP compliance |
| QAM Controls | Custom HTML inputs / sliders | `@decky/ui` `ToggleField` & `DropdownItem` | Integrates with SteamOS GamepadUI spatial navigation and controller focus |
| Playback Clock Interpolation | Raw `setInterval(pos + 1000)` | `usePlaybackClock` | Monotonic clock interpolation, drift gating, and pause awareness |

## Settings Schema & Storage

### Backend Schema (`py_modules/common.py`)
In `DEFAULT_SETTINGS` [VERIFIED: py_modules/common.py:70-92]:
```python
DEFAULT_SETTINGS = {
    "device_name": "",
    "audio_backend": "librespot",
    "audio_quality": "320",
    "bitrate": 320,
    "bit_perfect_clock": True,
    "spotify_client_id": "",
    "normalisation": True,
    "normalisation_pregain": 0.0,
    "gapless": True,
    "autoplay": True,
    "playlist_folders": [],
    "spotify_folder_tree": [],
    "game_audio_profiles": {},
    "auto_ducking": True,
    "auto_ducking_volume": 30,
    "gamepad_chords_enabled": True,
    "toast_enabled": True,
    "toast_position": "top_right",
    "overlay_enabled": False,
    "overlay_position": "top-right",
    "overlay_autohide": False,
    "overlay_show_progress": False,
    "eq_preset": "flat",
}
```

In `_load_settings()` [VERIFIED: py_modules/common.py:151-155]:
```python
if not isinstance(merged.get("overlay_enabled"), bool):
    merged["overlay_enabled"] = bool(merged.get("overlay_enabled", False))
if merged.get("overlay_position") not in ("top-left", "top-right", "bottom-left", "bottom-right"):
    merged["overlay_position"] = "top-right"
if not isinstance(merged.get("overlay_autohide"), bool):
    merged["overlay_autohide"] = bool(merged.get("overlay_autohide", False))
if not isinstance(merged.get("overlay_show_progress"), bool):
    merged["overlay_show_progress"] = bool(merged.get("overlay_show_progress", False))
```

### Backend RPC Validation (`main.py`)
In `get_status()` [VERIFIED: main.py:464-471]:
```python
public_keys = (
    "device_name", "audio_backend", "audio_quality", "bitrate",
    "bit_perfect_clock", "spotify_client_id", "normalisation",
    "normalisation_pregain", "gapless", "autoplay", "playlist_folders",
    "spotify_folder_tree", "game_audio_profiles", "auto_ducking",
    "auto_ducking_volume", "gamepad_chords_enabled", "toast_enabled",
    "toast_position", "overlay_enabled", "overlay_position",
    "overlay_autohide", "overlay_show_progress", "eq_preset",
)
```

In `set_setting()` [VERIFIED: main.py:543-544]:
```python
elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock", "overlay_enabled", "toast_enabled", "gamepad_chords_enabled", "auto_ducking", "overlay_autohide", "overlay_show_progress"):
    value = bool(value)
```

### TypeScript Types (`src/types.ts`)
In `EngineSettings` [VERIFIED: src/types.ts:141-164]:
```typescript
export interface EngineSettings {
  device_name?: string;
  audio_backend: AudioBackend;
  audio_quality: AudioQuality;
  bitrate: number;
  bit_perfect_clock?: boolean;
  spotify_client_id?: string;
  normalisation: boolean;
  normalisation_pregain?: number;
  gapless: boolean;
  autoplay: boolean;
  playlist_folders?: FolderItem[];
  spotify_folder_tree?: FolderItem[];
  game_audio_profiles?: Record<string, GameAudioProfile>;
  auto_ducking?: boolean;
  auto_ducking_volume?: number;
  gamepad_chords_enabled?: boolean;
  toast_enabled?: boolean;
  toast_position?: string;
  overlay_enabled?: boolean;
  overlay_position?: string;
  overlay_autohide?: boolean;
  overlay_show_progress?: boolean;
  eq_preset?: EqualizerPreset;
  spotify_client_installed?: boolean;
}
```

## Common Pitfalls

### Pitfall 1: Overlay Capturing Gamepad or Mouse Clicks
**What goes wrong:** While playing a game, clicking with touch or controller triggers invisible focus on the overlay or drops game inputs.
**Why it happens:** Missing `pointerEvents: "none"` on the root fixed element or styling child elements with `pointerEvents: "auto"`.
**How to avoid:** Ensure the root fixed container has `pointerEvents: "none"` and no child elements override it. Do not wrap overlay elements in `@decky/ui` `Focusable`.
**Early detection:** Verify `pointerEvents: "none"` in unit tests.

### Pitfall 2: Abrupt Unmounting Cancelling CSS Transitions
**What goes wrong:** The HUD snaps out of existence instantly without the smooth fade animation.
**Why it happens:** React component immediately returns `null` when `visible` or `isPlaying` is false.
**How to avoid:** Keep the DOM node rendered while transitioning `opacity: 0`, and only unmount if `overlay_enabled` is completely disabled and the fade-out transition has finished.

### Pitfall 3: Missed Events Freezing the Overlay
**What goes wrong:** Song changes or pauses, but HUD still displays old track or playing icon.
**Why it happens:** Relying solely on `librespot_event` or `track_metadata` without concurrent fallback polling.
**How to avoid:** Include `track` (`s.track || s.track_meta`), `isPlaying` (`Boolean(s.is_playing)`), `position_ms`, `duration_ms`, and `settings` concurrently in `DeckifyOverlayWrapper`'s 4s interval.

### Pitfall 4: Settings Missing from `public_keys`
**What goes wrong:** Toggling `overlay_autohide` saves in backend, but `get_status()` returns undefined, resetting UI toggles.
**Why it happens:** `main.py:get_status()` filters settings through a hardcoded `public_keys` tuple.
**How to avoid:** Add `"overlay_autohide"` and `"overlay_show_progress"` to `public_keys` in `main.py`.

## Code Examples

### 1. Robust `resolveArtworkUrl` Utility
```typescript
export function resolveArtworkUrl(track?: any): string | null {
  if (!track) return null;
  if (track.artwork_url) return track.artwork_url;
  if (track.image_url) return track.image_url;
  if (Array.isArray(track.images) && track.images[0]?.url) return track.images[0].url;
  if (track.album && Array.isArray(track.album.images) && track.album.images[0]?.url) {
    return track.album.images[0].url;
  }
  return null;
}
```

### 2. Auto-Hide and Pause Delay Logic in `DeckifyOverlay`
```typescript
// Inside DeckifyOverlay
const [isVisible, setIsVisible] = useState<boolean>(false);
const hideTimerRef = useRef<any>(null);
const pauseTimerRef = useRef<any>(null);
const prevPlayingRef = useRef<boolean>(isPlaying);
const prevTrackIdRef = useRef<string | undefined>(track?.track_id || track?.id || track?.name);

useEffect(() => {
  const currentTrackId = track?.track_id || track?.id || track?.name;
  const trackChanged = currentTrackId !== prevTrackIdRef.current;
  const playStateChanged = isPlaying !== prevPlayingRef.current;
  prevTrackIdRef.current = currentTrackId;
  prevPlayingRef.current = isPlaying;

  if (!visible || !track || !track.name) {
    setIsVisible(false);
    return;
  }

  // Clear existing timers
  if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);

  if (isPlaying) {
    setIsVisible(true);
    if (autoHide) {
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 6000);
    }
  } else {
    // Music is paused: grace period (D-04: 3-4s with pause icon before fade)
    if (isVisible) {
      pauseTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 3500);
    }
  }

  return () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);
  };
}, [isPlaying, track?.name, track?.track_id, visible, autoHide]);
```

### 3. QAM Direct Controls in `src/index.tsx`
```tsx
{/* In-Game Mini Overlay (HUD) Quick Controls */}
<PanelSectionRow>
  <ToggleField
    label="In-Game Overlay (HUD)"
    description={settings.overlay_enabled ? "Visible during gameplay" : "Disabled"}
    checked={Boolean(settings.overlay_enabled)}
    onChange={async (val) => {
      setSettings((prev) => ({ ...prev, overlay_enabled: val }));
      await backendSetSetting("overlay_enabled", val);
    }}
  />
</PanelSectionRow>

{settings.overlay_enabled && (
  <>
    <PanelSectionRow>
      <DropdownItem
        label="Overlay Position"
        rgOptions={[
          { data: "top-left", label: "Top Left" },
          { data: "top-right", label: "Top Right" },
          { data: "bottom-left", label: "Bottom Left" },
          { data: "bottom-right", label: "Bottom Right" },
        ]}
        selectedOption={settings.overlay_position || "top-right"}
        onChange={async (opt) => {
          setSettings((prev) => ({ ...prev, overlay_position: opt.data }));
          await backendSetSetting("overlay_position", opt.data);
        }}
      />
    </PanelSectionRow>

    <PanelSectionRow>
      <ToggleField
        label="Auto-Hide Overlay (6s)"
        description="Fades out 6s after track starts or resumes"
        checked={Boolean(settings.overlay_autohide)}
        onChange={async (val) => {
          setSettings((prev) => ({ ...prev, overlay_autohide: val }));
          await backendSetSetting("overlay_autohide", val);
        }}
      />
    </PanelSectionRow>

    <PanelSectionRow>
      <ToggleField
        label="Show Progress Bar"
        description="2px progress line at bottom of overlay"
        checked={Boolean(settings.overlay_show_progress)}
        onChange={async (val) => {
          setSettings((prev) => ({ ...prev, overlay_show_progress: val }));
          await backendSetSetting("overlay_show_progress", val);
        }}
      />
    </PanelSectionRow>
  </>
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling only `settings` in wrapper | Concurrent polling of `track`, `is_playing`, `position_ms`, `settings` | Phase 5 | Eliminates desynchronization and freeze when events are dropped or using Spotify client |
| Hardcoded permanent display | Configurable permanent vs 6s auto-hide (`overlay_autohide`) | Phase 5 | Allows players who want minimal screen clutter to have auto-fading notifications |
| Instant unmount on pause | 3.5s pause icon grace period before smooth CSS fade-out | Phase 5 | Visual feedback confirms pause action before gently clearing game screen |
| Modal-only overlay toggle | Direct QAM toggle and position dropdown | Phase 5 | Instant mid-game repositioning and toggling without quitting or opening full modal |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | 3500ms is the optimal pause delay within the 3-4s requirement window (D-04) | Architecture Patterns | Low; configurable or adjustable between 3000-4000ms |
| A2 | 2px green bar (`#1db954`) is subtle and does not obstruct artwork or title | Architectural Patterns | Low; matches Deckify brand and theme |

## Open Questions (RESOLVED)

1. **How should the progress line update without excessive re-renders in `DeckifyOverlay`?**
   - *Resolution:* If `overlay_show_progress` is disabled, the progress line is omitted completely. When enabled, `DeckifyOverlayWrapper` feeds `positionMs` and `durationMs` from `usePlaybackClock` or status polling, updating the 2px progress bar with CSS `transition: width 0.25s linear`.
2. **Where should QAM controls be placed in `src/index.tsx`?**
   - *Resolution:* Place the overlay section directly beneath the playback transport controls and volume slider, making it readily accessible during gameplay without scrolling.
3. **What happens if a game has dark or light backgrounds?**
   - *Resolution:* The HUD badge uses `background: "rgba(18, 18, 18, 0.88)"`, `backdropFilter: "blur(12px)"`, and `border: "1px solid rgba(255, 255, 255, 0.12)"`, providing high contrast and readability on all backgrounds.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / pnpm | Bundling & Vitest tests | ✓ | v20+ / pnpm 9+ | — |
| Python 3 | Backend daemon & unittests | ✓ | 3.14 / 3.11+ | `py` launcher on Windows |
| Decky Loader | SteamOS Runtime | ✓ | 3.5+ Gamescope | Unit test mocks |

**Missing dependencies with no fallback:** None  
**Missing dependencies with fallback:** None  

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.1.0 (Frontend) & Python `unittest` (Backend) |
| Config file | `vitest.config.ts` / root project configuration |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && py -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| **HUD-01** | Overlay mounting, QAM controls, auto-hide timer, and settings persistence | Unit / Integration | `pnpm test src/components/DeckifyOverlay.test.tsx` | ❌ Wave 0 |
| **HUD-01** | Backend overlay settings persistence (`overlay_enabled`, `overlay_position`, `overlay_autohide`, `overlay_show_progress`) | Integration | `py -m unittest tests/test_e2e_requirements.py` | ✅ Existing (`test_r7_*`) |
| **HUD-02** | Artwork resolution (CSP proxy), play/pause indicator, pause grace period (3-4s), and progress bar rendering | Unit | `pnpm test src/components/DeckifyOverlay.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test && py -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/DeckifyOverlay.test.tsx` — comprehensive unit tests for `DeckifyOverlay` (auto-hide timer, pause grace period, artwork fallback, progress bar, pointer-events: none, position classes)
- [ ] Backend test expansions in `tests/test_e2e_requirements.py`: `test_r7_default_settings_includes_overlay_autohide`, `test_r7_default_settings_includes_overlay_show_progress`, `test_r7_overlay_autohide_setting_persists`, `test_r7_overlay_show_progress_setting_persists`.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | Position string whitelist (`top-left`, `top-right`, `bottom-left`, `bottom-right`) and boolean coercion in `main.py:set_setting()` |
| V14 Configuration | Yes | Atomically read and write `settings.json` via `_save_settings()` |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Gamescope Touch/Click Hijacking | Denial of Service | Enforce `pointerEvents: "none"` on fixed HUD container |
| CEF CSP Network Blocking | Denial of Service | Route all album art URLs through `DeckifyImage` and backend base64 proxy |

## Sources

### Primary (HIGH confidence)
- `src/components/DeckifyOverlay.tsx` [VERIFIED: lines 1-123]
- `src/index.tsx` [VERIFIED: lines 465-535, 670-686]
- `src/components/tabs/SettingsTab.tsx` [VERIFIED: lines 466-508]
- `src/types.ts` [VERIFIED: lines 141-164]
- `py_modules/common.py` [VERIFIED: lines 70-92, 151-155]
- `main.py` [VERIFIED: lines 464-471, 543-550]
- `tests/test_e2e_requirements.py` [VERIFIED: lines 497-526]

### Secondary (MEDIUM confidence)
- `.planning/phases/05-in-game-hud-overlay-restoration/05-CONTEXT.md`
- `.planning/research/STACK.md`

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Verified with `package.json` and existing codebase imports.
- Architecture: HIGH — Verified against Decky Loader `routerHook.addGlobalComponent` and React component trees.
- Pitfalls: HIGH — Verified against SteamOS GamepadUI CEF constraints (CSP, pointerEvents).

**Research date:** 2026-11-11  
**Valid until:** 2026-12-11
