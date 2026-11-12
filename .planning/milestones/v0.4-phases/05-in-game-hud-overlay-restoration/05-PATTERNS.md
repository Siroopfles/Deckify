# Phase 5: In-Game HUD Overlay Restoration - Pattern Map

**Mapped:** 2026-11-11  
**Files analyzed:** 8  
**Analogs found:** 8 / 8 (100% git-tracked codebase analogs)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/components/DeckifyOverlay.tsx` | component | streaming / event-driven | `src/components/DeckifyOverlay.tsx` | exact |
| `src/index.tsx` | controller / component | request-response / lifecycle | `src/index.tsx` | exact |
| `src/components/tabs/SettingsTab.tsx` | component | request-response | `src/components/tabs/SettingsTab.tsx` | exact |
| `src/types.ts` | model / config | transform | `src/types.ts` | exact |
| `py_modules/common.py` | model / config | transform / file-I/O | `py_modules/common.py` | exact |
| `main.py` | controller | request-response | `main.py` | exact |
| `src/components/DeckifyOverlay.test.tsx` | test | request-response | `src/components/tabs/QueueTab.test.tsx` | role-match |
| `tests/test_e2e_requirements.py` | test | request-response | `tests/test_e2e_requirements.py` | exact |

---

## Pattern Assignments

### 1. `src/components/DeckifyOverlay.tsx` (component, streaming / event-driven)

**Analog:** `src/components/DeckifyOverlay.tsx` (lines 1-123)

**Imports pattern** (lines 1-4):
```typescript
import { FC, useState, useEffect, useRef } from "react";
import { FaMusic, FaPlay, FaPause } from "react-icons/fa";
import { DeckifyImage } from "./common/DeckifyImage";
```

**Props & State Contract**:
```typescript
export interface OverlayTrack {
  name?: string;
  artist?: string;
  album?: string;
  artwork_url?: string | null;
  image_url?: string | null;
  duration_ms?: number;
}

export interface DeckifyOverlayProps {
  track?: OverlayTrack | null;
  isPlaying?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | string;
  visible?: boolean;
  autoHide?: boolean;
  showProgress?: boolean;
  positionMs?: number;
  durationMs?: number;
}
```

**Core Presentation & Non-Blocking Overlay Pattern** (lines 34-56):
```typescript
const isTop = position.includes("top");
const isLeft = position.includes("left");

const posStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 9999,
  pointerEvents: "none",
  margin: 16,
  top: isTop ? 16 : undefined,
  bottom: !isTop ? 16 : undefined,
  left: isLeft ? 16 : undefined,
  right: !isLeft ? 16 : undefined,
  background: "rgba(18, 18, 18, 0.88)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 10,
  padding: "8px 12px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
  boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
  color: "#fff",
  maxWidth: 320,
  opacity: isVisible ? 1 : 0,
  transform: isVisible
    ? "translateY(0)"
    : isTop ? "translateY(-10px)" : "translateY(10px)",
  transition: "opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1), transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
  overflow: "hidden",
};
```

**Auto-Hide (6s) & Pause Grace Period (3.5s) Lifecycle Pattern**:
```typescript
const [isVisible, setIsVisible] = useState<boolean>(false);
const hideTimerRef = useRef<any>(null);
const pauseTimerRef = useRef<any>(null);
const prevPlayingRef = useRef<boolean>(isPlaying);
const prevTrackIdRef = useRef<string | undefined>(track?.name);

useEffect(() => {
  const currentTrackId = track?.name;
  const playStateChanged = isPlaying !== prevPlayingRef.current;
  const trackChanged = currentTrackId !== prevTrackIdRef.current;
  prevPlayingRef.current = isPlaying;
  prevTrackIdRef.current = currentTrackId;

  if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current);

  if (!visible || !track?.name) {
    setIsVisible(false);
    return;
  }

  if (isPlaying) {
    setIsVisible(true);
    if (autoHide) {
      hideTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 6000);
    }
  } else {
    // Music is paused: grace period (D-04: 3-4s with pause icon before smooth fade)
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
}, [isPlaying, track?.name, visible, autoHide]);
```

**Subtle 2px Progress Bar Pattern** (when `showProgress` is true):
```tsx
{showProgress && durationMs > 0 && (
  <div
    style={{
      width: "100%",
      height: 2,
      background: "rgba(255, 255, 255, 0.15)",
      borderRadius: 1,
      overflow: "hidden",
      marginTop: 2,
    }}
  >
    <div
      style={{
        height: "100%",
        width: `${Math.min(100, Math.max(0, (positionMs / durationMs) * 100))}%`,
        background: "#1db954",
        transition: "width 0.25s linear",
      }}
    />
  </div>
)}
```

---

### 2. `src/index.tsx` (controller / component, request-response / lifecycle)

**Analog:** `src/index.tsx` (lines 415-530, 675-680)

**Imports pattern** (lines 1-23):
```typescript
import {
  PanelSection,
  PanelSectionRow,
  ToggleField,
  DropdownItem,
  // ...
} from "@decky/ui";
import {
  callable,
  addEventListener,
  removeEventListener,
  definePlugin,
  routerHook,
} from "@decky/api";
```

**RPC Callable Definition Pattern** (lines 50-63):
```typescript
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");
const backendGetStatus = callable<[], StatusResponse>("get_status");
```

**Dual-Signal Wrapper Pattern (`DeckifyOverlayWrapper`)** (lines 465-517):
```typescript
const DeckifyOverlayWrapper: FC = () => {
  const [track, setTrack] = useState<TrackMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [settings, setSettings] = useState<EngineSettings | null>(null);
  const [positionMs, setPositionMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);

  useEffect(() => {
    let mounted = true;

    const syncStatus = (s: StatusResponse | null) => {
      if (!mounted || !s) return;
      const t = s.track || s.track_meta;
      if (t) setTrack(t);
      if (typeof s.is_playing === "boolean") setIsPlaying(s.is_playing);
      if (s.settings) setSettings(s.settings);
      if (typeof s.position_ms === "number") setPositionMs(s.position_ms);
      if (typeof s.duration_ms === "number") setDurationMs(s.duration_ms || t?.duration_ms || 0);
    };

    backendGetStatus().then(syncStatus).catch(() => {});

    const unsubMeta = addEventListener<[any]>("track_metadata", (meta: any) => {
      if (meta) {
        setTrack(meta);
        if (meta.duration_ms) setDurationMs(meta.duration_ms);
      }
    });
    const unsubLibre = addEventListener<[any]>("librespot_event", (ev: any) => {
      if (ev?.event === "playing") setIsPlaying(true);
      else if (ev?.event === "paused" || ev?.event === "stopped") setIsPlaying(false);
      if (typeof ev?.position_ms === "number") setPositionMs(ev.position_ms);
      if (typeof ev?.duration_ms === "number") setDurationMs(ev.duration_ms);
    });
    const unsubSettings = addEventListener<[any]>("settings_changed", (st: any) => {
      if (st) setSettings(st);
    });

    const poll = setInterval(async () => {
      try {
        const s = await backendGetStatus();
        syncStatus(s);
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

  if (!settings?.overlay_enabled) return null;

  return (
    <DeckifyOverlay
      track={track}
      isPlaying={isPlaying}
      position={settings.overlay_position || "top-right"}
      visible={Boolean(settings.overlay_enabled)}
      autoHide={Boolean(settings.overlay_autohide)}
      showProgress={Boolean(settings.overlay_show_progress)}
      positionMs={positionMs}
      durationMs={durationMs}
    />
  );
};
```

**Global Component Lifecycle Pattern** (lines 525-530, 677-679):
```typescript
// Registration on plugin init:
try {
  routerHook.addGlobalComponent("DeckifyOverlay", () => <DeckifyOverlayWrapper />);
} catch (err) {
  console.warn("Could not register DeckifyOverlay global component:", err);
}

// Dismount on plugin unload:
onDismount() {
  try {
    routerHook.removeGlobalComponent("DeckifyOverlay");
  } catch {}
}
```

**QAM Direct Controls Pattern** (lines 419-446):
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

---

### 3. `src/components/tabs/SettingsTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/SettingsTab.tsx` (lines 466-508)

**Settings Tab Overlay Controls Pattern**:
```tsx
{/* In-Game Mini Overlay HUD */}
<div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
    In-Game Mini Overlay (HUD)
  </h3>
  <p style={{ fontSize: 12, opacity: 0.6, marginBottom: 10 }}>
    Display a compact Now Playing overlay badge while gaming.
  </p>
  <InteractiveRow
    onClick={async () => {
      const cur = status?.settings?.overlay_enabled || false;
      await backendSetSetting("overlay_enabled", !cur);
      showToast(!cur ? "Overlay HUD enabled" : "Overlay HUD disabled");
      refreshStatus();
    }}
    active={status?.settings?.overlay_enabled}
    style={{ justifyContent: "space-between", marginBottom: status?.settings?.overlay_enabled ? 10 : 0 }}
  >
    <span style={{ fontSize: 13, fontWeight: 600 }}>Mini Overlay HUD</span>
    <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.overlay_enabled ? "#1db954" : "#888" }}>
      {status?.settings?.overlay_enabled ? "ON" : "OFF"}
    </span>
  </InteractiveRow>

  {status?.settings?.overlay_enabled && (
    <>
      <Focusable flow-children="horizontal" style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {["top-left", "top-right", "bottom-left", "bottom-right"].map((pos) => (
          <InteractiveRow
            key={pos}
            onClick={async () => {
              await backendSetSetting("overlay_position", pos);
              showToast(`Overlay position: ${pos}`);
              refreshStatus();
            }}
            active={(status?.settings?.overlay_position || "top-right") === pos}
            style={{ flex: 1, justifyContent: "center", fontSize: 11, fontWeight: 700, textTransform: "capitalize", padding: "6px" }}
          >
            {pos.replace("-", " ")}
          </InteractiveRow>
        ))}
      </Focusable>

      {/* Auto-Hide Toggle */}
      <InteractiveRow
        onClick={async () => {
          const cur = status?.settings?.overlay_autohide || false;
          await backendSetSetting("overlay_autohide", !cur);
          showToast(!cur ? "Auto-hide enabled (6s)" : "Auto-hide disabled (Permanent)");
          refreshStatus();
        }}
        active={status?.settings?.overlay_autohide}
        style={{ justifyContent: "space-between", marginTop: 10 }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Auto-Hide Overlay (6s)</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.overlay_autohide ? "#1db954" : "#888" }}>
          {status?.settings?.overlay_autohide ? "ON" : "OFF"}
        </span>
      </InteractiveRow>

      {/* Show Progress Bar Toggle */}
      <InteractiveRow
        onClick={async () => {
          const cur = status?.settings?.overlay_show_progress || false;
          await backendSetSetting("overlay_show_progress", !cur);
          showToast(!cur ? "Progress line enabled" : "Progress line disabled");
          refreshStatus();
        }}
        active={status?.settings?.overlay_show_progress}
        style={{ justifyContent: "space-between", marginTop: 8 }}
      >
        <span style={{ fontSize: 13, fontWeight: 600 }}>Show Progress Bar (2px)</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: status?.settings?.overlay_show_progress ? "#1db954" : "#888" }}>
          {status?.settings?.overlay_show_progress ? "ON" : "OFF"}
        </span>
      </InteractiveRow>
    </>
  )}
</div>
```

---

### 4. `src/types.ts` (model / config, transform)

**Analog:** `src/types.ts` (lines 141-165)

**Settings Interface Definition Pattern**:
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

---

### 5. `py_modules/common.py` (model / config, transform / file-I/O)

**Analog:** `py_modules/common.py` (lines 70-92, 151-155)

**DEFAULT_SETTINGS Schema Pattern**:
```python
DEFAULT_SETTINGS = {
    # ...
    "overlay_enabled": False,
    "overlay_position": "top-right",
    "overlay_autohide": False,
    "overlay_show_progress": False,
    "eq_preset": "flat",
}
```

**_load_settings() Sanitization Pattern**:
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

---

### 6. `main.py` (controller, request-response)

**Analog:** `main.py` (lines 464-471, 543-550)

**get_status() Public Keys Whitelist Pattern**:
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

**set_setting() Boolean Coercion Pattern**:
```python
elif key in (
    "normalisation", "gapless", "autoplay", "bit_perfect_clock",
    "overlay_enabled", "toast_enabled", "gamepad_chords_enabled",
    "auto_ducking", "overlay_autohide", "overlay_show_progress",
):
    value = bool(value)
```

---

### 7. `src/components/DeckifyOverlay.test.tsx` (test, component test)

**Analog:** `src/components/tabs/QueueTab.test.tsx` (lines 1-80) and `src/hooks/usePlaybackClock.test.ts` (lines 17-25)

**Vitest React Mocking & Tree Traversal Pattern**:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("react/jsx-runtime", () => ({
  jsx: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
  jsxs: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: (props: any) => ({
    type: "DeckifyImage",
    props,
  }),
}));

import { DeckifyOverlay } from "./DeckifyOverlay";

function findNodes(tree: any, predicate: (node: any) => boolean, results: any[] = []): any[] {
  if (!tree) return results;
  if (predicate(tree)) results.push(tree);
  if (tree.props && tree.props.children) {
    const children = Array.isArray(tree.props.children)
      ? tree.props.children
      : [tree.props.children];
    for (const child of children) {
      findNodes(child, predicate, results);
    }
  }
  return results;
}
```

**Testing Non-Blocking Overlay & Style Attributes**:
```typescript
it("enforces pointer-events: none on the root container", () => {
  const tree = DeckifyOverlay({
    track: { name: "Test Song", artist: "Test Artist" },
    visible: true,
    isPlaying: true,
  });

  expect(tree.props.style.pointerEvents).toBe("none");
  expect(tree.props.style.position).toBe("fixed");
  expect(tree.props.style.zIndex).toBe(9999);
});
```

**Testing Corner Positions**:
```typescript
it("positions overlay at top-right by default", () => {
  const tree = DeckifyOverlay({
    track: { name: "Test Song", artist: "Test Artist" },
    visible: true,
    position: "top-right",
  });
  expect(tree.props.style.top).toBe(16);
  expect(tree.props.style.right).toBe(16);
  expect(tree.props.style.bottom).toBeUndefined();
  expect(tree.props.style.left).toBeUndefined();
});

it("positions overlay at bottom-left when configured", () => {
  const tree = DeckifyOverlay({
    track: { name: "Test Song", artist: "Test Artist" },
    visible: true,
    position: "bottom-left",
  });
  expect(tree.props.style.bottom).toBe(16);
  expect(tree.props.style.left).toBe(16);
  expect(tree.props.style.top).toBeUndefined();
  expect(tree.props.style.right).toBeUndefined();
});
```

---

### 8. `tests/test_e2e_requirements.py` (test, integration/e2e test)

**Analog:** `tests/test_e2e_requirements.py` (lines 496-525)

**Overlay Requirements Test Pattern**:
```python
def test_r7_default_settings_includes_overlay_autohide(self):
    """R7.6: DEFAULT_SETTINGS contains overlay_autohide: False."""
    self.assertIn("overlay_autohide", common.DEFAULT_SETTINGS)
    self.assertEqual(common.DEFAULT_SETTINGS["overlay_autohide"], False)

def test_r7_default_settings_includes_overlay_show_progress(self):
    """R7.7: DEFAULT_SETTINGS contains overlay_show_progress: False."""
    self.assertIn("overlay_show_progress", common.DEFAULT_SETTINGS)
    self.assertEqual(common.DEFAULT_SETTINGS["overlay_show_progress"], False)

async def test_r7_overlay_autohide_setting_persists(self):
    """R7.8: Toggling overlay_autohide persists boolean setting."""
    res = await self.plugin.set_setting("overlay_autohide", True)
    self.assertTrue(res.get("ok"))
    self.assertEqual(self.plugin._settings.get("overlay_autohide"), True)

async def test_r7_overlay_show_progress_setting_persists(self):
    """R7.9: Toggling overlay_show_progress persists boolean setting."""
    res = await self.plugin.set_setting("overlay_show_progress", True)
    self.assertTrue(res.get("ok"))
    self.assertEqual(self.plugin._settings.get("overlay_show_progress"), True)

async def test_r7_get_status_includes_all_overlay_settings(self):
    """R7.10: get_status() includes overlay settings in returned public settings."""
    status = await self.plugin.get_status()
    settings = status.get("settings", {})
    self.assertIn("overlay_enabled", settings)
    self.assertIn("overlay_position", settings)
    self.assertIn("overlay_autohide", settings)
    self.assertIn("overlay_show_progress", settings)
```

---

## Shared Patterns

### 1. SteamOS Non-Blocking Gamescope Overlay CSS
**Source:** `src/components/DeckifyOverlay.tsx` lines 34-56  
**Apply to:** All floating GamepadUI components
- `pointerEvents: "none"` MUST be placed on root container so touch or controller events pass straight through to running games.
- Child elements must NOT override `pointerEvents: "auto"`.
- `position: "fixed"` with `zIndex: 9999` keeps the element above gamescope surfaces.
- `backdropFilter: "blur(12px)"` and high-contrast background (`rgba(18, 18, 18, 0.88)`) provide readability over light and dark scenes.

### 2. Dual-Signal State Synchronization
**Source:** `src/index.tsx` lines 470-506  
**Apply to:** All real-time reactive UI wrappers in Decky Loader
- Combines immediate push events (`addEventListener("track_metadata")`, `addEventListener("librespot_event")`, `addEventListener("settings_changed")`) with a 4-second concurrent fallback polling loop (`backendGetStatus()`).
- Concurrent fallback must synchronize `track`, `isPlaying`, `settings`, `positionMs`, and `durationMs` simultaneously.
- Ensures recovery within 4 seconds even if events are dropped or when using alternative backends (e.g. Spotify client) that don't emit librespot events.

### 3. Decky Settings RPC & Schema Persistence
**Source:** `py_modules/common.py` & `main.py`  
**Apply to:** All settings exposed via QAM or modal tabs
- Any new setting key MUST exist in:
  1. `py_modules/common.py:DEFAULT_SETTINGS`
  2. `py_modules/common.py:_load_settings()` validation
  3. `main.py:get_status()` `public_keys` tuple
  4. `main.py:set_setting()` type coercion/validation whitelist
  5. `src/types.ts:EngineSettings` TypeScript interface

---

## No Analog Found

All 8 files have exact or role-matched git-tracked analogs in the current repository. None required fallback to external research.

---

## Metadata

**Analog search scope:** `src/components/`, `src/index.tsx`, `src/types.ts`, `py_modules/`, `main.py`, `tests/`  
**Files scanned:** 8  
**Pattern extraction date:** 2026-11-11  
**Git tracking verified:** Yes (all 8 analog paths verified via `git ls-files`)
