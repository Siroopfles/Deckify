# Phase 03: Live Playback Ticker & Gamepad Seekbar Scrubbing - Pattern Map

**Mapped:** 2026-11-11  
**Files analyzed:** 5  
**Analogs found:** 5 / 5  

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/hooks/usePlaybackClock.ts` | hook / utility | streaming / monotonic timer | `src/hooks/usePlaybackStatus.ts` | role-match |
| `src/hooks/usePlaybackClock.test.ts` | test | event-driven / fake timers | `src/components/common/DeckifyImage.test.ts` | exact |
| `src/hooks/usePlaybackStatus.ts` | hook | polling / request-response | `src/hooks/usePlaybackStatus.ts` | exact |
| `src/components/tabs/NowPlayingTab.tsx` | component | event-driven / UI | `src/components/tabs/NowPlayingTab.tsx` & `src/components/common/InteractiveRow.tsx` | exact |
| `src/index.tsx` | component / entrypoint | request-response / event-driven | `src/index.tsx` | exact |

---

## Pattern Assignments

### `src/hooks/usePlaybackClock.ts` (hook / utility, monotonic timer)

**Analog:** `src/hooks/usePlaybackStatus.ts`

**Imports pattern** (`src/hooks/usePlaybackStatus.ts`, lines 1-3):
```typescript
import { useCallback, useEffect, useRef, useState } from "react";
```

**Hook state & return shape pattern** (`src/hooks/usePlaybackStatus.ts`, lines 7-10, 42-49):
```typescript
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
  // Anchors and UI state
  ...
  return {
    positionMs: isScrubbing ? scrubPositionMs : displayPositionMs,
    isScrubbing,
    scrubTo,
    scrubDelta,
    seekImmediate,
  };
}
```

**Interval lifecycle & cleanup pattern** (`src/hooks/usePlaybackStatus.ts`, lines 24-34, 36-40):
```typescript
useEffect(() => {
  if (!isPlaying || isScrubbing) return;
  const id = setInterval(() => {
    setDisplayPositionMs(getInterpolatedPosition());
  }, tickIntervalMs);
  return () => clearInterval(id);
}, [isPlaying, isScrubbing, tickIntervalMs, getInterpolatedPosition]);
```

**Safe asynchronous execution pattern** (`src/hooks/usePlaybackStatus.ts`, lines 11-16):
```typescript
const refreshStatus = useCallback(async () => {
  try {
    const s = await backendGetStatus();
    if (s) setStatus(s);
  } catch {}
}, []);
```

---

### `src/hooks/usePlaybackClock.test.ts` (test, event-driven)

**Analog:** `src/components/common/DeckifyImage.test.ts`

**Imports and Decky API mock pattern** (`src/components/common/DeckifyImage.test.ts`, lines 1-5):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(),
}));
```

**Timer-based asynchronous testing pattern** (`src/components/common/DeckifyImage.test.ts`, lines 77-100, 102-121):
```typescript
describe("usePlaybackClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("interpolates elapsed time smoothly when playing", () => {
    const { result } = renderHook(() =>
      usePlaybackClock({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
      })
    );

    expect(result.current.positionMs).toBe(10000);
    vi.advanceTimersByTime(1000);
    expect(result.current.positionMs).toBe(11000);
  });
});
```

**Debounce & RPC verification pattern** (`src/components/common/DeckifyImage.test.ts`, lines 149-177):
```typescript
it("debounces rapid seek calls to 300ms before committing RPC", async () => {
  const onSeekCommit = vi.fn();
  const { result } = renderHook(() =>
    usePlaybackClock({
      serverPositionMs: 10000,
      isPlaying: true,
      durationMs: 60000,
      onSeekCommit,
    })
  );

  result.current.scrubTo(15000);
  result.current.scrubTo(20000);
  result.current.scrubTo(25000);

  expect(onSeekCommit).not.toHaveBeenCalled();
  vi.advanceTimersByTime(300);
  expect(onSeekCommit).toHaveBeenCalledTimes(1);
  expect(onSeekCommit).toHaveBeenCalledWith(25000);
});
```

---

### `src/hooks/usePlaybackStatus.ts` (hook, polling / request-response)

**Analog:** `src/hooks/usePlaybackStatus.ts`

**RPC Callable declaration** (`src/hooks/usePlaybackStatus.ts`, lines 1-5):
```typescript
import { useCallback, useEffect, useState } from "react";
import { callable } from "@decky/api";
import { StatusResponse } from "../types";

export const backendGetStatus = callable<[], StatusResponse>("get_status");
```

**Polling schedule pattern** (`src/hooks/usePlaybackStatus.ts`, lines 36-40):
```typescript
useEffect(() => {
  refreshStatus();
  const id = setInterval(refreshStatus, 1500);
  return () => clearInterval(id);
}, [refreshStatus]);
```

**Integration pattern with `usePlaybackClock`:**
```typescript
import { usePlaybackClock } from "./usePlaybackClock";

export function usePlaybackStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await backendGetStatus();
      if (s) setStatus(s);
    } catch {}
  }, []);

  const track = status?.track || status?.track_meta;
  const durationMs = (status as any)?.duration_ms || track?.duration_ms || 0;
  const isPlaying = Boolean(status?.is_playing);
  const trackId = track?.track_id || track?.id;

  const clock = usePlaybackClock({
    serverPositionMs: status?.position_ms ?? 0,
    isPlaying,
    durationMs,
    trackId,
    onSeekCommit: async (targetMs) => {
      await backendSeekPlayback(targetMs, "");
    },
  });

  return {
    status,
    setStatus,
    currentPositionMs: clock.positionMs,
    refreshStatus,
    clock,
  };
}
```

---

### `src/components/tabs/NowPlayingTab.tsx` (component, event-driven)

**Analog:** `src/components/tabs/NowPlayingTab.tsx` & `src/components/common/InteractiveRow.tsx`

**Component Props & Imports pattern** (`src/components/tabs/NowPlayingTab.tsx`, lines 1-32):
```typescript
import { FC, useState } from "react";
import { Focusable } from "@decky/ui";
import { StatusResponse } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { RoundBtn, formatMs } from "../common/InteractiveRow";
```

**Gamepad focus halo and active styling pattern** (`src/components/common/InteractiveRow.tsx`, lines 4-15, 50-60, 100-116):
```typescript
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

**Gamepad D-pad event prevention and direct scrubbing pattern** (`src/components/tabs/NowPlayingTab.tsx`, lines 125-131):
```typescript
<Focusable
  noFocusRing
  tabIndex={0}
  onFocus={() => setIsFocused(true)}
  onBlur={() => setIsFocused(false)}
  onGamepadFocus={() => setIsFocused(true)}
  onGamepadBlur={() => setIsFocused(false)}
  onKeyDown={(e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault?.();
      e.stopPropagation?.();
      handleScrubDelta(-stepMs);
    } else if (e.key === "ArrowRight") {
      e.preventDefault?.();
      e.stopPropagation?.();
      handleScrubDelta(stepMs);
    }
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
    ...focusHalo(isFocused),
  }}
>
  {/* Live fill bar bound to currentPositionMs */}
  <div
    style={{
      width: `${progressPercent}%`,
      height: "100%",
      background: "#1db954",
      borderRadius: 6,
      position: "relative",
    }}
  >
    {/* Visible thumb handle */}
    <div
      style={{
        position: "absolute",
        right: -6,
        top: isFocused ? -3 : -2,
        width: isFocused ? 18 : 16,
        height: isFocused ? 18 : 16,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: isFocused
          ? "0 0 0 2px #1db954, 0 2px 8px rgba(0,0,0,0.8)"
          : "0 2px 6px rgba(0,0,0,0.6)",
        transition: "width 0.1s ease, height 0.1s ease, top 0.1s ease",
      }}
    />
  </div>
</Focusable>
```

**Horizontal spatial navigation pattern** (`src/components/tabs/NowPlayingTab.tsx`, lines 143-150):
```typescript
<Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 8 }}>
  <InteractiveRow onClick={() => handleScrubDelta(-15000)} style={{ padding: "4px 10px", fontSize: 11 }}>
    -15s
  </InteractiveRow>
  <InteractiveRow onClick={() => handleScrubDelta(15000)} style={{ padding: "4px 10px", fontSize: 11 }}>
    +15s
  </InteractiveRow>
</Focusable>
```

---

### `src/index.tsx` (component / entrypoint, request-response / event-driven)

**Analog:** `src/index.tsx`

**Decky SliderField seek pattern** (`src/index.tsx`, lines 346-353):
```typescript
<SliderField
  label={`${formatMs(currentPositionMs)} / ${formatMs(durationMs)}`}
  value={Math.floor(currentPositionMs / 1000)}
  min={0}
  max={Math.floor(durationMs / 1000)}
  step={1}
  onChange={(sec) => clock.scrubTo(sec * 1000)}
/>
```

**Horizontal spatial container correction** (`src/index.tsx`, line 355):
```typescript
// Replace flow-children="row" with flow-children="horizontal" to prevent SteamOS vertical focus jumps
<Focusable flow-children="horizontal" style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 4 }}>
  <DialogButton style={{ minWidth: "auto", padding: "4px 10px", fontSize: 11 }} onClick={() => clock.scrubDelta(-15000)}>
    -15s
  </DialogButton>
  <DialogButton style={{ minWidth: "auto", padding: "4px 10px", fontSize: 11 }} onClick={() => clock.scrubDelta(15000)}>
    +15s
  </DialogButton>
</Focusable>
```

**Consolidation of playback status** (`src/index.tsx`, lines 112-172):
Replace duplicate `setInterval` polling and local `setPositionMs` timer loops with `usePlaybackStatus()` / `usePlaybackClock()`.

---

## Shared Patterns

### 1. Decky RPC Callable Pattern
**Source:** `src/hooks/usePlaybackStatus.ts` (lines 2-5), `src/components/DeckifyExpandedModal.tsx` (lines 48-55), `src/index.tsx` (lines 50-55)  
**Apply to:** All frontend files communicating with the Python backend daemon  
```typescript
import { callable } from "@decky/api";

export const backendSeekPlayback = callable<[number, string], { ok: boolean; position_ms?: number; error?: string }>("seek_playback");
export const backendGetStatus = callable<[], StatusResponse>("get_status");
```

### 2. Focus Halo and Gamepad Spatial Navigation
**Source:** `src/components/common/InteractiveRow.tsx` (lines 4-15), `GEMINI.md` (lines 154-156)  
**Apply to:** `NowPlayingTab.tsx` and all interactive focusable controls  
```typescript
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
**Constraint:** All horizontal groups MUST specify `flow-children="horizontal"` on the parent `<Focusable>` container. Never use `flow-children="row"`.

### 3. Controller Spatial Key Event Interception
**Source:** `src/components/tabs/NowPlayingTab.tsx` (lines 127-130), `03-RESEARCH.md` (lines 203-206)  
**Apply to:** Custom interactive slider/progress bar elements in `NowPlayingTab.tsx`  
```typescript
onKeyDown={(e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault?.();
    e.stopPropagation?.();
    // handle adjustment
  }
}}
```
**Why:** Prevents SteamOS GamepadUI spatial navigation from prematurely transferring focus to neighbor widgets when scrubbing left or right.

### 4. Consolidated Duration Formatting
**Source:** `src/components/common/InteractiveRow.tsx` (lines 27-33)  
**Apply to:** `NowPlayingTab.tsx`, `src/index.tsx`, and all position/duration displays  
```typescript
export function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
```

### 5. Vitest Fake Timers and Hook Testing Pattern
**Source:** `src/components/common/DeckifyImage.test.ts` (lines 1-13), `src/utils.test.ts` (lines 1-9)  
**Apply to:** `src/hooks/usePlaybackClock.test.ts`  
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("usePlaybackClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
});
```

---

## No Analog Found

None. All 5 target files have direct role and data-flow analogs within the repository.

---

## Metadata

**Analog search scope:** `src/`, `src/hooks/`, `src/components/`, `src/components/tabs/`, `src/components/common/`  
**Files scanned:** 28  
**Pattern extraction date:** 2026-11-11  
