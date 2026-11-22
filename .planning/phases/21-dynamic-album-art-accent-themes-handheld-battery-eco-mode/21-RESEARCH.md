# Phase 21: Dynamic Album-Art Accent Themes & Handheld Battery Eco-Mode - Research

**Researched:** 2026-11-22
**Domain:** Frontend Canvas Color Extraction / CSS Custom Property Theming (`THEME-01`) & Linux sysfs Power Governor / Engine Sleep-Wake (`ECO-01`)
**Confidence:** HIGH

## Summary

Phase 21 introduces two cohesive Steam Deck polish features with **zero new external npm or Python dependencies**:

1. **Dynamic Album-Art Accent Themes (`THEME-01`):** Users can switch between *Classic Spotify Green* (`#1DB954`), *Dynamic Album Glow* (dominant accent extracted from the active track's already-proxied `data:image/...` base64 cover art via a `32x32` `<canvas>` downsample and clamped to HSL `L >= 55%`), and *SteamOS Deck Blue* (`#1A9FFF`). Because `DeckifyExpandedModal`, `QuickAccessMenu`, and `DeckifyOverlayWrapper` (`DeckifyOverlay` + `SilentBanner`) mount in separate React trees, synchronizing `--deckify-accent`, `--deckify-accent-rgb`, and `--deckify-accent-transition` on `document.documentElement.style` (backed by a lightweight module store/hook) updates all UI surfaces simultaneously while preserving `#1DB954` / `29, 185, 84` CSS variable fallbacks for existing Vitest component tests.
2. **Handheld Battery Eco-Mode (`ECO-01`):** A backend `PowerGovernor` (`py_modules/eco.py`) polls Linux `/sys/class/power_supply/*` combined with `DockAudioSwitcher` dock status and `SoundtrackManager._active_game_app_id`. It requires an explicit `type == "Battery"` supply with `status == "Discharging"` to classify as on-battery—guaranteeing Steam Machines, desktop SteamOS, and AC-powered/docked Decks are always treated as AC-powered. On battery during active gameplay, non-essential animations/transitions and future visualizer hooks (`animations_suspended`) are disabled. When playback remains paused on battery beyond `eco_timeout_minutes` (`5–30` min, default `15`), the governor puts the configured engine (`librespot` by default, optionally `spotify_client`) to sleep and wakes it transparently on the next `control_playback("play")`, `play_tracks`, or `quick_play_pinned` command.

**Primary recommendation:** Drive `THEME-01` through CSS custom properties (`--deckify-accent`, `--deckify-accent-rgb`, `--deckify-accent-transition`) with a `32x32` `<canvas>` vibrancy-weighted HSL extractor (`src/utils/accentTheme.ts`), and implement `ECO-01` as a dedicated `PowerGovernor` class (`py_modules/eco.py`) integrated into `main.py` and `py_modules/rpc_playback.py`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01 (Theme Presets):** Support 3 accent theme modes:
  1. `spotify_green` — *Classic Spotify Green* (`#1DB954`, default)
  2. `dynamic_album` — *Dynamic Album Glow* (extracted from active track's proxied base64 cover art)
  3. `steamos_blue` — *SteamOS Deck Blue* (`#1A9FFF`)
- **D-02 (UI Scope):** Apply the active accent color across **all** accent elements in the Expanded Modal, QAM, and HUD: focus halos, active buttons/pills, progress bars, active icons, `SilentBanner` accent borders/highlights, plus a subtle radial background glow in the Expanded Modal and HUD.
- **D-03 (Fallback Color):** In `dynamic_album` mode, fall back to `#1DB954` (*Classic Spotify Green*) whenever no track is playing, no artwork is available, or the artwork is grayscale/low-saturation.
- **D-04 (Color Extraction & WCAG Clamp):** Extract the dominant accent color on the **frontend** via `<canvas>` downsampling (`32x32` on the already-proxied `data:image/...` base64 URI — zero new Python dependencies) and clamp HSL lightness to `L >= 55%` so controller focus halos and text accents remain WCAG-readable on dark SteamOS surfaces.
- **D-05 (Transitions):** Use a smooth `300–400ms ease` CSS color transition between tracks, automatically switching to **instant** (zero transition cost) when Eco-Mode animation suspension is active on battery.
- **D-06 (Selector Placement):** Place the Accent Theme selector in `SettingsTab` only (keeping the Quick Access Menu compact).
- **D-07 (Power Source Detection):** Detect battery vs AC/docked state via Linux `/sys/class/power_supply/*` combined with `DockAudioSwitcher` dock status (`is_docked`). **Steam Machine / Desktop safety:** Require an explicit `Battery` supply (`type == "Battery"` and `status == "Discharging"`) to classify as on-battery; if no battery exists (Steam Machine / desktop SteamOS) or sysfs is unavailable, always treat as AC-powered so Eco-Mode sleep and animation suspension never trigger on desktop hardware.
- **D-08 (Defaults & Timeout Range):** Eco-Mode ships **enabled by default** (`eco_mode_enabled: true`) with a **15-minute** default inactivity timeout (`eco_timeout_minutes: 15`), configurable from `5` to `30` minutes in 5-minute steps.
- **D-09 (Sleep Timer Interaction):** Eco-Mode idle sleep applies only while playback is **paused**. If a `SleepTimer` is active and stops/pauses playback, Eco-Mode's inactivity timer starts normally from that paused state.
- **D-10 (Animation Suspension):** While running on battery during active gameplay (and Eco-Mode enabled), suspend non-essential CSS animations, background transitions, and visualizer hooks (exposing a shared state flag for Phase 29's `TvSplitView` spectrum visualizer). `SilentBanner` notifications and controller navigation remain instant and responsive.
- **D-11 (Configurable Engine Sleep Scope):** Make the engine sleep target configurable in `SettingsTab`: default to **Deckify-managed engines only** (`librespot` / `spotifyd`), with an optional toggle/choice to also allow sleeping `spotify_client` if desired.
- **D-12 (Transparent Wake & Status UI):** When the engine enters Eco-Sleep, wake it transparently on the next `play` / `play_tracks` / `quick_play_pinned` command. Display a live Eco-Mode status badge in `SettingsTab` (`On Battery — Active` / `Bypassed (AC / Docked / Desktop)` / `Engine Sleeping`) and a subtle Eco-Sleep indicator in QAM with a quick Play-to-wake action.

### the agent's Discretion
- CSS custom property / React context architecture (`--deckify-accent` or theme context/hook) for propagating the active accent color cleanly without breaking existing component tests.
- Exact `py_modules/eco.py` (or `PowerGovernor`) polling interval and sysfs parsing details.
- Exact settings key names in `py_modules/common.py` and `src/types.ts`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within Phase 21 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| THEME-01 | User can switch between *Classic Spotify Green*, *Dynamic Album Glow* (dominant cover-art accent color extracted from proxied artwork and WCAG luminance-clamped to `L >= 55%` for controller focus visibility), and *SteamOS Deck Blue* across the modal and HUD. | Frontend `<canvas>` `32x32` extractor on proxied `data:image/...` URIs (`imagePipeline.ts`), HSL `L >= 55%` clamp, CSS variables `--deckify-accent` / `--deckify-accent-rgb` / `--deckify-accent-transition` across `DeckifyExpandedModal`, `DeckifyOverlay`, `SilentBanner`, `QuickAccessMenu`, and `InteractiveRow.tsx`. |
| ECO-01 | User can enable Handheld Battery Eco-Mode to automatically suspend background spectrum visualizers/animations during active gameplay on battery and put an idle paused playback engine to sleep after a configurable inactivity timeout (`5–30 min`, disabled when AC-powered/docked). | `py_modules/eco.py` (`PowerGovernor`) reading `/sys/class/power_supply/*` + `DockAudioSwitcher` + `_active_game_app_id`, `animations_suspended` flag in `StatusResponse.eco_status`, idle-pause sleep via `stop_librespot()`, and transparent wake-on-play in `py_modules/rpc_playback.py`. |
</phase_requirements>

## Project Constraints (from GEMINI.md)

- **Steam CEF Content Security Policy:** Steam GamepadUI blocks direct external image URLs (`https://i.scdn.co/`); all artwork must be resolved through the backend base64 proxy (`get_image` / `fetchWithQueueAndCache` / `imgMemoryCache`).
- **SteamOS GamepadUI Navigation:** Controller focus relies on spatial navigation (`flow-children`, `@decky/ui`); focus halos must remain high-contrast and never introduce focus traps.
- **Steam Deck Environment:** Runs in `deck` user space (UID 1000) under SteamOS 3.5+.
- **Code Quality & ESLint (`eslint.config.js`):**
  - `complexity`: max 15
  - `max-depth`: max 4
  - `max-lines-per-function`: max 80 (skipping blank lines and comments)
  - `max-params`: max 4
  - `react-hooks/rules-of-hooks`: error; `react-hooks/exhaustive-deps`: warn
  - Compact inline `DialogButton` controls in `SettingsTab` must set `width: "auto"` / `minWidth: "auto"` to override SteamOS 100% button width.
- **Resilience & Process Isolation:** `os.environ.pop("LD_LIBRARY_PATH", None)` is mandatory in `main.py` before subprocesses; RPC methods must wrap external/system calls in `try/except` and return structured `{ "ok": False, "error": ... }` dicts.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cover-art dominant color extraction & HSL clamp | Browser / Client (`src/utils/accentTheme.ts`) | API / Backend (`py_modules/images.py`) | Backend already proxies artwork to `data:image/...` base64 URIs; `<canvas>` sampling in browser avoids adding Pillow/numpy to Decky's PyInstaller Python environment. |
| Theme CSS variable propagation & transitions | Browser / Client (`src/utils/themeBus.ts`, `:root`) | — | Modal, QAM, and HUD/SilentBanner live in separate React roots; `:root` CSS variables synchronize all three without prop drilling. |
| Power supply sysfs & dock status evaluation | API / Backend (`py_modules/eco.py`) | — | Only Python has direct access to `/sys/class/power_supply/*`, `DockAudioSwitcher`, and `SoundtrackManager._active_game_app_id`. |
| Engine sleep & transparent wake-on-play | API / Backend (`py_modules/eco.py`, `py_modules/rpc_playback.py`) | Browser / Client (`QuickAccessMenu`, `SettingsTab`) | Engine process supervision (`librespot`, `spotify_client`) and Spotify Connect transfer/play retries live in `main.py` / `rpc_playback.py`. |
| Animation suspension (`animations_suspended`) | API / Backend (`eco.py` computes flag) | Browser / Client (applies CSS / visualizer gate) | Backend knows battery + dock + active game state authoritatively and exposes `eco_status.animations_suspended` in `get_status()` and `eco_status_changed` events. |

## Standard Stack

No new packages are installed in Phase 21. All capabilities use existing project libraries and standard browser/Python APIs.

### Core
| Library / API | Version | Purpose | Why Standard |
|---------------|---------|---------|--------------|
| HTML5 `<canvas>` 2D `getImageData` | Browser built-in (Steam CEF) | `32x32` pixel downsampling for `dynamic_album` | Zero dependencies, works directly on `data:image/...` URIs without CORS taint. [VERIFIED: `src/components/common/DeckifyImage.tsx:59-105`] |
| CSS Custom Properties (`--deckify-accent*`) | Browser built-in | Cross-root theme token propagation | Synchronizes `ModalRoot`, QAM, and `DeckifyOverlay` simultaneously. |
| Python `pathlib` / `os` sysfs reader | Python 3.11+ / 3.14 stdlib | Read `/sys/class/power_supply/*/type` and `status` | Standard Linux kernel interface; zero external deps. [VERIFIED: `py_modules/common.py:1-5`] |
| `asyncio` background task | Python stdlib | 5s–10s `PowerGovernor` supervision loop | Matches `DockAudioSwitcher` and `SuspendResumeMonitor` patterns. [VERIFIED: `py_modules/dock.py:151-156`] |

## Architecture Patterns

### System Architecture Diagram

```text
  [proxied data:image/... URI] ──> [32x32 <canvas> Extractor] ──> [HSL Clamp L>=55%]
                                                                          │
  [Settings: accent_theme] ───────────────────────────────────────────────┼──> [:root CSS Vars]
                                                                          │      ├── ModalRoot (DeckifyExpandedModal + 14 Tabs)
  [/sys/class/power_supply/*] ─┐                                          │      ├── QuickAccessMenu
  [DockAudioSwitcher status]  ─┼─> [PowerGovernor (py_modules/eco.py)] ───┘      └── DeckifyOverlay + SilentBanner
  [_active_game_app_id]       ─┘      │
                                      ├─> animations_suspended ──> Disables transitions / Phase 29 visualizer
                                      └─> paused >= timeout    ──> stop_librespot() ──> wake on play/play_tracks/quick_play_pinned
```

### Pattern 1: Cross-Root Theme Token Synchronization (`--deckify-accent`)
Because `DeckifyExpandedModal`, `QuickAccessMenu`, and `DeckifyOverlayWrapper` are mounted in separate React roots (`showModal`, `definePlugin` QAM content, and `routerHook.addGlobalComponent`), a React Context inside any single tree would not reach the others.

Use a singleton theme controller (`src/utils/accentTheme.ts` + `src/utils/themeBus.ts`) that:
1. Computes `{ hex: string; rgb: string }` from `accent_theme` (`"spotify_green" | "dynamic_album" | "steamos_blue"`) and the active track's artwork URI.
2. Writes three CSS custom properties on `document.documentElement.style` (guarded by `typeof document !== "undefined"` for Node/Vitest safety):
   - `--deckify-accent`: e.g. `#1DB954`, `#1A9FFF`, or `#7AD99E`
   - `--deckify-accent-rgb`: e.g. `29, 185, 84` (for `rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.7)`)
   - `--deckify-accent-transition`: `350ms ease` normally, or `none` when `animations_suspended` is `true`
3. Notifies subscribed React components (`useAccentTheme()`) so SVG strokes, radial gradients, or JS-computed colors re-render if needed, while CSS-variable consumers (`focusHalo`, `InteractiveRow`, `RoundBtn`, `SilentBanner`, `Sidebar`, `DeckifyOverlay`, and tab pills) update automatically.

**Hardcoded green inventory:** Codebase scan found 150+ occurrences of `#1db954` / `#1DB954` / `29, 185, 84` across 25 component files (`src/index.tsx`, `src/components/DeckifyExpandedModal.tsx`, `src/components/DeckifyOverlay.tsx`, `src/components/SilentBanner.tsx`, `src/components/common/InteractiveRow.tsx`, `src/components/common/Sidebar.tsx`, `src/components/common/TrackActionModal.tsx`, `src/components/common/CollectionActionModal.tsx`, `src/components/common/EqBandFaders.tsx`, `src/components/common/TrackRowItem.tsx`, and all tab components). Replacing hex values with `var(--deckify-accent, #1DB954)` and rgba values with `rgba(var(--deckify-accent-rgb, 29, 185, 84), <alpha>)` keeps `#1DB954` as the default fallback in unit tests.

### Pattern 2: `32x32` Canvas Vibrancy-Weighted Color Extraction & WCAG Clamp
In `src/utils/accentTheme.ts`:
1. **Input resolution:** Never pass an external `https://i.scdn.co/...` URL directly to `new Image()` (blocked by Steam CEF CSP). Resolve via `imgMemoryCache.get(url)` or `fetchWithQueueAndCache(url)` from `src/components/common/imagePipeline.ts` so it is always a `data:image/...` URI.
2. **Downsample & sample:** Draw onto an offscreen `32x32` `<canvas>` (`1024` pixels), read `ctx.getImageData(0, 0, 32, 32).data`.
3. **Filter & bucket:**
   - Skip `alpha < 128`.
   - Convert RGB to HSL (`h ∈ [0, 360)`, `s ∈ [0, 1]`, `l ∈ [0, 1]`).
   - Reject near-black (`l < 0.12`), near-white (`l > 0.90`), and grayscale/low-saturation (`s < 0.18`).
   - Group into 24 hue buckets (`15°` each), accumulating weight `w = s * (1 - Math.abs(2 * l - 1))` and weighted `(h, s, l)` sums.
   - If total weight is `0` (grayscale/monochrome artwork), return `#1DB954` (`29, 185, 84`) per **D-03**.
4. **WCAG Luminance Clamp (`L >= 55%` per D-04):**
   - Pick the highest-weight bucket, compute weighted average `(h, s, l)`.
   - Clamp `l = Math.max(0.55, Math.min(0.75, l))` and `s = Math.max(0.45, s)`.
   - Convert HSL back to `#rrggbb` and `"r, g, b"`.
   - Cache result in an in-memory `Map<string, AccentColor>` (bounded at e.g. 64 entries) keyed by `artworkUrl` so repeat lookups are `0ms`.

### Pattern 3: `PowerGovernor` (`py_modules/eco.py`) State Machine
`PowerGovernor(plugin)` runs a lightweight `asyncio` loop (e.g. every `5.0s`) and evaluates on demand when settings, playback state, dock status, or game state changes:

```python
def read_power_supply_state(sysfs_root: str = "/sys/class/power_supply") -> tuple[bool, bool]:
    """Return (has_battery, on_battery). Steam Machine / missing sysfs -> (False, False)."""
    if not os.path.isdir(sysfs_root):
        return False, False
    has_battery = False
    discharging = False
    try:
        for entry in os.scandir(sysfs_root):
            if not entry.is_dir():
                continue
            type_path = os.path.join(entry.path, "type")
            status_path = os.path.join(entry.path, "status")
            try:
                with open(type_path, "r", encoding="utf-8") as f:
                    ptype = f.read().strip()
                if ptype != "Battery":
                    continue
                has_battery = True
                with open(status_path, "r", encoding="utf-8") as f:
                    status = f.read().strip()
                if status == "Discharging":
                    discharging = True
            except OSError:
                continue
    except OSError:
        return False, False
    return has_battery, discharging
```

**Dock & Desktop Bypass Logic:**
- `dock_state = plugin._dock_switcher.get_status_dict().get("status")` if `getattr(plugin, "_dock_switcher", None)` else `"disabled"`
- `is_docked = dock_state in ("docked", "bluetooth_held", "manual_override")`
  - *Note:* When `dock_auto_switch_enabled` is `False`, `DockAudioSwitcher` reports `"disabled"` (`py_modules/dock.py:355-357`). On powered docks, `Battery/status` is `"Charging"` or `"Full"` so `on_battery` is already `False`. To also catch unpowered USB-C HDMI/DAC hubs when `dock_auto_switch_enabled` is `False`, `PowerGovernor` can optionally treat `is_docked` as `True` if `dock_status == "docked"`, relying primarily on `Battery/status == "Discharging"` + `DockAudioSwitcher` status per **D-07**.
- `is_game_running = isinstance(getattr(getattr(plugin, "_soundtrack_manager", None), "_active_game_app_id", None), int)`
- `animations_suspended = bool(eco_enabled and has_battery and on_battery and not is_docked and is_game_running)`

**Inactivity Sleep & Wake Logic:**
- **Sleep eligibility:** `eco_enabled and has_battery and on_battery and not is_docked and engine_running and play_state != "playing"` AND `(audio_backend == "librespot" or eco_sleep_spotify_client)`.
- While eligible, if `_paused_since is None`, set `_paused_since = time.monotonic()`.
- Otherwise (playing, AC/docked, desktop, disabled, or already sleeping), reset `_paused_since = None`.
- When `_paused_since is not None` and `(time.monotonic() - _paused_since) >= eco_timeout_minutes * 60`:
  - Set `_eco_sleeping = True`, `_paused_since = None`.
  - Stop engine via `await plugin.stop_librespot()` (which calls `_stop_monitor()` first, preventing crash-recovery false positives).
  - Emit `eco_status_changed` event to frontend.
- **Transparent Wake (`wake_for_playback`):**
  - Called by `rpc_playback.control_playback` (when `action == "play"` or `"play_pause"` resolving to `"play"`), `rpc_playback.play_tracks`, and `rpc_playback.quick_play_pinned` whenever `_eco_sleeping` is `True` (or `not plugin._is_engine_running()`).
  - Clears `_eco_sleeping = False`, `_paused_since = None`, calls `await plugin.start_librespot()` (which already delegates to `start_spotify_client()` when `audio_backend == "spotify_client"` per `main.py:529-531`), polls `get_devices` up to `4 * 0.3s` for the Spotify Connect device to register, and proceeds with playback / `_auto_transfer_and_play`.

### Recommended Project Structure
```
py_modules/
├── eco.py                  # PowerGovernor, sysfs battery reader, status dict
├── common.py               # Add eco_* and accent_theme to DEFAULT_SETTINGS
└── rpc_playback.py         # Hook power_governor.wake_for_playback() into play/play_tracks/quick_play_pinned
src/
├── utils/
│   ├── accentTheme.ts      # <canvas> 32x32 extractor, HSL L>=55% clamp, LRU cache
│   └── themeBus.ts         # Cross-root CSS var sync + useAccentTheme hook
├── components/
│   ├── DeckifyExpandedModal.tsx  # Radial accent glow + CSS var consumption
│   ├── DeckifyOverlay.tsx        # Radial accent glow + animations_suspended transition gating
│   ├── SilentBanner.tsx          # var(--deckify-accent, #1DB954) border highlight
│   └── tabs/SettingsTab.tsx      # Accent Theme selector + Eco-Mode card & live badge
└── index.tsx               # QuickAccessMenu Eco-Sleep indicator + Play-to-wake + DeckifyOverlayWrapper sync
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image downloading for color extraction | New `fetch()` or Python endpoint | `fetchWithQueueAndCache` / `imgMemoryCache` (`src/components/common/imagePipeline.ts`) | Already handles Steam CEF CSP, 50MB disk LRU cache, and concurrency throttling. |
| Stopping/starting engines for Eco-Sleep | Custom `Popen` / `kill` logic | `plugin.stop_librespot()` and `plugin.start_librespot()` (`main.py:529-619`) | `start_librespot()` already dispatches to `start_spotify_client()` when `audio_backend == "spotify_client"`, and `stop_librespot()` cleanly cancels `_monitor_process` so Eco-Sleep is never misclassified as a crash. |
| Active game detection | New Steam IPC hook | `plugin._soundtrack_manager._active_game_app_id` (`main.py:656-659`) | Already fed by `RegisterForAppLifetimeNotifications` with 3.0s/3.5s debounce. |

## Common Pitfalls

### Pitfall 1: Misclassifying Desktop / Steam Machine as "On Battery"
**What goes wrong:** Treating missing `/sys/class/power_supply/BAT*` or `"Unknown"` status as `on_battery = True` causes Eco-Mode to kill playback on Steam Machines or desktop Linux.
**How to avoid:** Strictly require `has_battery == True` (`type == "Battery"`) AND `status == "Discharging"` (`D-07`). Any missing file, `OSError`, or non-`"Discharging"` status (`"Charging"`, `"Full"`, `"Not charging"`, `"Unknown"`) must resolve to `on_battery = False`.

### Pitfall 2: `control_playback("play")` Fails with 404 After Eco-Sleep
**What goes wrong:** `play_tracks` and `quick_play_pinned` in `py_modules/rpc_playback.py` have wake logic, but `control_playback` (`py_modules/rpc_playback.py:42-81`) currently only calls `_auto_transfer_and_play` on 404—it never starts a stopped engine!
**How to avoid:** In `control_playback`, when `action == "play"` (including `play_pause` resolved to `"play"`), if `power_governor.engine_sleeping` (or `not plugin._is_engine_running()`), call `await power_governor.wake_for_playback()` before/upon `me/player/play` and fall back to `_auto_transfer_and_play`. Also update `play_tracks` (`rpc_playback.py:417`) so it wakes `spotify_client` too if `eco_sleep_spotify_client` put it to sleep.

### Pitfall 3: `SilentBanner` or Controller Focus Losing Responsiveness During Animation Suspension
**What goes wrong:** Disabling all transitions globally via `* { transition: none !important; }` would break `SilentBanner`'s fade-out (`opacity 250ms ease-in`) or D-pad focus feedback.
**How to avoid:** Gate **only** non-essential visual transitions/animations: `--deckify-accent-transition: none` (D-05), `DeckifyOverlay` entrance/lyric fade animations, `DeckifyImage` shimmer keyframe, and Phase 29's `TvSplitView` visualizer via `eco_status.animations_suspended`. Keep `SilentBanner` and `focusHalo` instant/responsive (`D-10`).

### Pitfall 4: Breaking Existing Vitest Tests with Dynamic CSS Variables
**What goes wrong:** Existing tests (`SilentBanner.test.tsx`, `InteractiveRow.test.tsx`, `SettingsTab.test.tsx`, `DiscoveryTab.test.tsx`) inspect inline `style` objects or rendered colors.
**How to avoid:** Use CSS variables with explicit `#1DB954` / `29, 185, 84` fallbacks (`var(--deckify-accent, #1DB954)` and `rgba(var(--deckify-accent-rgb, 29, 185, 84), ...)`), and run the full Vitest suite after updating styles. Also ensure `accentTheme.ts` guards `typeof document !== "undefined"` and `canvas.getContext("2d")` returning `null` in JSDOM/Node test environments.

### Pitfall 5: `set_setting` Validation & `public_keys` Exposure
**What goes wrong:** Adding keys to `DEFAULT_SETTINGS` in `py_modules/common.py` without adding them to `public_keys` in `main.py:630-654` and validation in `main.py:739-890` prevents the frontend from receiving or saving them.
**How to avoid:** Register `accent_theme`, `eco_mode_enabled`, `eco_timeout_minutes`, and `eco_sleep_spotify_client` in all three places: `DEFAULT_SETTINGS`, `get_status().public_keys`, and `set_setting()`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Frontend Framework | Vitest 5.1.0 (`pnpm test`) |
| Backend Framework | Python `unittest` (`py -3 -m unittest discover -s tests`) |
| Linter / Typecheck | ESLint 10 (`pnpm lint`) & TypeScript 5.9 (`pnpm typecheck`) |
| Quick run command | `pnpm test -- src/utils/accentTheme.test.ts` / `py -3 -m unittest discover -s tests -p "test_eco.py"` |
| Full suite command | `pnpm test && pnpm typecheck && pnpm lint && py -3 -m unittest discover -s tests -p "test_*.py"` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| THEME-01 | `32x32` canvas extraction, grayscale fallback to `#1DB954`, HSL `L >= 55%` clamp | unit | `pnpm test -- src/utils/accentTheme.test.ts` | ❌ Wave 0 |
| THEME-01 | `accent_theme` setting validation & `public_keys` exposure | unit | `py -3 -m unittest discover -s tests -p "test_eco.py"` | ❌ Wave 0 |
| THEME-01 | `SettingsTab` Accent Theme selector & `SilentBanner` / `DeckifyOverlay` CSS var consumption | unit | `pnpm test -- src/components/SilentBanner.test.tsx src/components/DeckifyOverlay.test.tsx src/components/tabs/SettingsTab.test.tsx` | ✅ (extend) |
| ECO-01 | Sysfs battery detection, Steam Machine (no battery) bypass, dock bypass, sleep timeout, `SleepTimer` interaction, transparent wake on `play`/`play_tracks`/`quick_play_pinned` | unit | `py -3 -m unittest discover -s tests -p "test_eco.py"` | ❌ Wave 0 |
| ECO-01 | `SettingsTab` Eco-Mode controls/status badge & QAM Eco-Sleep indicator + Play-to-wake | unit | `pnpm test -- src/components/tabs/SettingsTab.test.tsx src/index.test.tsx` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** Relevant unit test file (`pnpm test -- <file>` or `py -3 -m unittest discover -s tests -p "test_eco.py"`)
- **Per wave merge:** `pnpm test && pnpm typecheck && pnpm lint && py -3 -m unittest discover -s tests -p "test_*.py"`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/utils/accentTheme.test.ts` — covers `THEME-01` canvas color extraction, HSL `L >= 55%` clamp, grayscale fallback, and preset resolution
- [ ] `tests/test_eco.py` — covers `ECO-01` sysfs parsing, Steam Machine safety, dock bypass, `animations_suspended`, idle pause sleep, `SleepTimer` interaction, and wake-on-play

## Security Domain

- **ASVS V5 Input Validation:** `set_setting` must strictly validate `accent_theme` against `("spotify_green", "dynamic_album", "steamos_blue")`, `eco_timeout_minutes` as integer clamped/stepped in `[5, 30]`, and `eco_mode_enabled` / `eco_sleep_spotify_client` as booleans.
- **Sysfs & Subprocess Safety:** `PowerGovernor` reads only fixed `/sys/class/power_supply/<entry>/{type,status}` paths with `OSError` guards—no shell interpolation, no user-controlled paths. Artwork color extraction operates solely on already-proxied `data:image/...` URIs validated by `py_modules/images.py`.

## Sources

### Primary (HIGH confidence)
- [VERIFIED: `C:/Users/djdje/Deckify/py_modules/common.py:102-166`] — `DEFAULT_SETTINGS` schema and `copy.deepcopy` pattern
- [VERIFIED: `C:/Users/djdje/Deckify/py_modules/dock.py:134-434`] — `DockAudioSwitcher` status states (`"disabled"`, `"idle"`, `"docked"`, `"bluetooth_held"`, `"manual_override"`)
- [VERIFIED: `C:/Users/djdje/Deckify/py_modules/rpc_playback.py:42-81,368-514`] — `control_playback`, `play_tracks`, and `quick_play_pinned` engine wake paths
- [VERIFIED: `C:/Users/djdje/Deckify/main.py:529-620,625-732,739-850`] — `start_librespot`, `stop_librespot`, `get_status` `public_keys`, `set_setting`
- [VERIFIED: `C:/Users/djdje/Deckify/src/components/common/DeckifyImage.tsx:59-105`] — `imgMemoryCache` & `fetchWithQueueAndCache` base64 proxy pipeline
- [VERIFIED: `C:/Users/djdje/Deckify/src/components/common/InteractiveRow.tsx:4-96`] — `focusHalo`, `RoundBtn`, `InteractiveRow` accent styles
- [VERIFIED: `C:/Users/djdje/Deckify/src/components/DeckifyExpandedModal.tsx:967-1015`] — Modal ambient glow & `ModalRoot`
- [VERIFIED: `C:/Users/djdje/Deckify/src/components/DeckifyOverlay.tsx:210-270`] — HUD styling, transitions, and `deckifyLyricFadeIn` animation
- [VERIFIED: `C:/Users/djdje/Deckify/src/components/SilentBanner.tsx:44-85`] — `getToneAccentColor` and banner border styling
- [VERIFIED: `C:/Users/djdje/Deckify/eslint.config.js:24-32`] — ESLint complexity/function-length constraints

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all APIs verified in codebase
- Architecture: HIGH — all integration points (`dock.py`, `rpc_playback.py`, `main.py`, `imagePipeline.ts`, `InteractiveRow.tsx`) inspected directly
- Pitfalls: HIGH — identified concrete gaps in `control_playback` wake path, `DockAudioSwitcher` disabled state, and JSDOM test fallbacks

**Research date:** 2026-11-22
**Valid until:** 2026-12-22 (stable internal architecture)
