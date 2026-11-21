# Phase 20: 100% Silent HUD Toasts & Extended In-Game Quick-Chords - Pattern Map

**Mapped:** 2026-11-21
**Files analyzed:** 15
**Analogs found:** 15 / 15

---

## Verified Steam `GamepadButton` Indices (`@decky/ui` vs `src/index.tsx`)

Before planning `src/chords.ts`, `src/index.tsx`, and Settings validation, note a critical discrepancy verified directly in `node_modules/@decky/ui` vs the legacy chord listener in `src/index.tsx`:

1. **Authoritative `@decky/ui` `GamepadButton` Enum** (`node_modules/@decky/ui/src/components/FooterLegend.ts:3-33` & `node_modules/@decky/ui/dist/components/FooterLegend.d.ts:2-32`, re-exported from `@decky/ui`):
   - `INVALID = 0`
   - `OK = 1` (**A**)
   - `CANCEL = 2` (**B**)
   - `SECONDARY = 3` (**X**)
   - `OPTIONS = 4` (**Y**)
   - `BUMPER_LEFT = 5` (**L1 / LB**)
   - `BUMPER_RIGHT = 6` (**R1 / RB**)
   - `TRIGGER_LEFT = 7` (**L2 / LT**)
   - `TRIGGER_RIGHT = 8` (**R2 / RT**)
   - `DIR_UP = 9` (**D-Pad Up**)
   - `DIR_DOWN = 10` (**D-Pad Down**)
   - `DIR_LEFT = 11` (**D-Pad Left**)
   - `DIR_RIGHT = 12` (**D-Pad Right**)
   - `SELECT = 13` (**View / Select**)
   - `START = 14` (**Menu / Start**)
   - `LSTICK_CLICK = 15`, `RSTICK_CLICK = 16`, `LSTICK_TOUCH = 17`, `RSTICK_TOUCH = 18`
   - `LPAD_TOUCH = 19`, `LPAD_CLICK = 20`, `RPAD_TOUCH = 21`, `RPAD_CLICK = 22`
   - `REAR_LEFT_UPPER = 23` (**L4**), `REAR_LEFT_LOWER = 24` (**L5**), `REAR_RIGHT_UPPER = 25` (**R4**), `REAR_RIGHT_LOWER = 26` (**R5**)
   - `STEAM_GUIDE = 27` (**STEAM**)
   - `STEAM_QUICK_MENU = 28` (**QAM `...`**)

2. **Existing Modal Input Hook Confirmation** (`src/hooks/useTriggerNavigation.ts:84-102` and `src/components/DeckifyExpandedModal.test.tsx:1338`):
   - `FocusNavController.m_rgGamepadInputSources[0].RegisterForGamepadButtonDown((btn: number) => ...)` emits `@decky/ui` `GamepadButton` enum indices:
     - `3` → `X` (`SECONDARY`)
     - `4` → `Y` (`OPTIONS`)
     - `5` → `L1` (`BUMPER_LEFT`)
     - `6` → `R1` (`BUMPER_RIGHT`)
     - `7` → `L2` (`TRIGGER_LEFT`)
     - `8` → `R2` (`TRIGGER_RIGHT`)
   - Note: `ControllerInputGamepadButton` in `node_modules/@decky/ui/src/globals/steam-client/Input.ts:563-615` (`A=0, X=2, LSHOULDER=30, GUIDE=34`) applies only to `SteamClient.Input.RegisterForControllerInputMessages`, **not** `FocusNavController.m_rgGamepadInputSources[0]`.

3. **Legacy `src/index.tsx:1173-1206` Discrepancy to Handle Carefully:**
   - `src/index.tsx:1176-1200` already uses `GamepadButton` values for D-Pad: `11` (`DIR_LEFT`), `12` (`DIR_RIGHT`), `9` (`DIR_UP`), `10` (`DIR_DOWN`).
   - However, `src/index.tsx:1174,1205` checks `btn === 13 || btn === 14` (`SELECT`/`START` in `GamepadButton`) for `guideHeld` instead of `27` (`STEAM_GUIDE`) / `28` (`STEAM_QUICK_MENU`), and `src/index.tsx:1182` checks `btn === 0` (`INVALID` in `GamepadButton`) instead of `1` (`OK` = A).
   - **Planning takeaway:** For **Valve reserved chords (`STEAM + X / R1 / L1`)** (`20-CONTEXT.md` D-07), `X=3`, `R1=6`, `L1=5`, and `STEAM_GUIDE=27` / `STEAM_QUICK_MENU=28` (plus legacy guide alias `13`/`14` if `guideHeld` preserves D-09 compatibility — keep `27`/`28` and `13`/`14` normalized or explicitly separated in `chords.ts`, and note that `GamepadButton.OK` is `1` while legacy play/pause used `0`). Also use `getFocusNavController()` semantics (`window.GamepadNavTree?.m_context?.m_controller || window.FocusNavController`, from `node_modules/@decky/ui/src/utils/index.ts:34-36`) or `window.FocusNavController` consistently.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/chords.ts` | utility / state-machine | event-driven / transform | `src/utils/triggerController.ts` | exact |
| `src/chords.test.ts` | test | unit / state-machine | `src/utils/triggerController.test.ts` | exact |
| `src/bannerBus.ts` | utility / store | pub-sub | `src/index.tsx` (`modalOpenListeners`) | role-match |
| `src/components/SilentBanner.tsx` | component | event-driven / timer | `src/components/DeckifyOverlay.tsx` | exact |
| `src/components/SilentBanner.test.tsx` | test | component / fake-timers | `src/components/DeckifyOverlay.test.tsx` | exact |
| `src/index.tsx` | controller / entry / wrapper | event-driven / RPC | `src/index.tsx` (existing sections) | exact |
| `src/index.test.tsx` | test | integration / event-driven | `src/index.test.tsx` | exact |
| `src/components/DeckifyOverlay.tsx` | component | props / event-driven | `src/components/DeckifyOverlay.tsx` | exact |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD / settings-RPC | `src/components/tabs/SettingsTab.tsx` | exact |
| `src/components/tabs/ChordBindingsCard.tsx` | component (extracted) | CRUD / event-driven | `src/components/common/EqBandFaders.tsx` | role-match |
| `src/components/tabs/SettingsTab.test.tsx` | test | component / CRUD | `src/components/tabs/SettingsTab.test.tsx` | exact |
| `src/types.ts` | config / types | schema | `src/types.ts` | exact |
| `main.py` | controller / RPC | request-response / settings | `main.py` (`set_setting`, `get_status`) | exact |
| `py_modules/common.py` | config / sanitizer | file-I/O / transform | `py_modules/common.py` (`_sanitize_pinned_playlists`, `_load_settings`) | exact |
| `tests/test_chord_settings.py` (or `tests/test_features.py`) | test | CRUD / validation | `tests/test_pinned_playlists.py` | exact |

---

## Pattern Assignments

### `src/chords.ts` (utility, event-driven / transform)

**Analog:** `src/utils/triggerController.ts`

**Why this analog:** Pure TypeScript module with zero React/@decky/api side effects, explicit exported constants, typed state structures, and deterministic timestamp-based state machine methods (`now: number` injected or `Date.now()`).

**Constants & state interface pattern** (`src/utils/triggerController.ts:1-24`):
```typescript
export const TRIGGER_PRESS_THRESHOLD = 0.75;
export const TRIGGER_RELEASE_THRESHOLD = 0.25;
export const TRIGGER_DEBOUNCE_MS = 300;
export const TRIGGER_REPEAT_DELAY_MS = 500;
export const TRIGGER_REPEAT_INTERVAL_MS = 300;

export type TriggerSide = "L2" | "R2";

export interface TriggerChannelState {
  armed: boolean;
  lastFireAt: number;
  heldSince: number | null;
  lastRepeatAt: number;
}
```

**Pure state machine class/factory pattern** (`src/utils/triggerController.ts:29-86`):
```typescript
export class TriggerController {
  private channels: Record<TriggerSide, TriggerChannelState>;

  constructor() {
    this.channels = {
      L2: createInitialChannelState(),
      R2: createInitialChannelState(),
    };
  }

  processTrigger(side: TriggerSide, value: number, now: number): boolean {
    const ch = this.channels[side];
    // Release threshold resets arming
    if (value <= TRIGGER_RELEASE_THRESHOLD) {
      ch.armed = true;
      ch.heldSince = null;
      ch.lastRepeatAt = -Infinity;
      return false;
    }
    // ...
  }

  reset(): void {
    this.channels.L2 = createInitialChannelState();
    this.channels.R2 = createInitialChannelState();
  }
}
```

**Button enum & cleanup return handling pattern** (`src/hooks/useTriggerNavigation.ts:84-102, 185-191`):
```typescript
const unsubDown = src.RegisterForGamepadButtonDown((btn: number) => {
  if (btn === 3) dispatchAction("X");
  else if (btn === 4) dispatchAction("Y");
  else if (btn === 5) dispatchAction("L1");
  else if (btn === 6) dispatchAction("R1");
  else if (btn === 7) handleTriggerValue("L2", 1.0);
  else if (btn === 8) handleTriggerValue("R2", 1.0);
});
unregisters.push(unsubDown);
// Cleanup handles both function and { Unregister() } handles:
for (const unsub of unregisters) {
  if (typeof unsub === "function") {
    unsub();
  } else if (unsub && typeof unsub.Unregister === "function") {
    unsub.Unregister();
  }
}
```

**Application to `src/chords.ts`:**
- Keep `src/chords.ts` free of `@decky/api` and React so `src/chords.test.ts` runs without heavyweight DOM/plugin mocks (do not import runtime objects from `@decky/ui` unless mocked or keep numeric `GAMEPAD_BUTTON` constants matching `FooterLegend.ts:3-33`).
- Export `CHORD_ACTIONS`, `DEFAULT_CHORD_BINDINGS`, `GUIDE_EXPIRY_MS = 4000`, `normalizeChord`, `validateChordBinding`, `formatButtonName`, and `createChordMatcher` (accepting `now` or `Date.now()` + timer support for 4s `guideHeld` expiry, largest-subset matching, last-button-down firing, and per-binding re-arming on release).

---

### `src/chords.test.ts` (test, unit / state-machine)

**Analog:** `src/utils/triggerController.test.ts`

**Test structure & deterministic timing pattern** (`src/utils/triggerController.test.ts:1-64`):
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import {
  TriggerController,
  TRIGGER_PRESS_THRESHOLD,
  TRIGGER_RELEASE_THRESHOLD,
  TRIGGER_DEBOUNCE_MS,
  TRIGGER_REPEAT_DELAY_MS,
  TRIGGER_REPEAT_INTERVAL_MS,
} from "./triggerController";

describe("TriggerController", () => {
  let controller: TriggerController;

  beforeEach(() => {
    controller = new TriggerController();
  });

  it("exports expected threshold and timing constants", () => {
    expect(TRIGGER_PRESS_THRESHOLD).toBe(0.75);
    // ...
  });

  it("activates at >= 0.75 and ignores values below 0.75", () => {
    expect(controller.processTrigger("L2", 0.74, 1000)).toBe(false);
    expect(controller.processTrigger("L2", 0.75, 1016)).toBe(true);
  });
});
```
- Pair with `vi.useFakeTimers()` / `vi.advanceTimersByTime(4000)` if testing automatic `setTimeout`-based `guideHeld` clearing in addition to lazy timestamp expiry checks.

---

### `src/bannerBus.ts` (utility / store, pub-sub)

**Analog:** `src/index.tsx` (`activeGameListeners`, `modalOpenListeners`)

**Module-scope pub/sub pattern** (`src/index.tsx:89-101`):
```typescript
let currentRunningAppId: number | null = null;
const activeGameListeners = new Set<(appId: number | null) => void>();
const setActiveGameState = (appId: number | null) => {
  currentRunningAppId = appId;
  activeGameListeners.forEach((cb) => cb(appId));
};

let bigOpen = false;
const modalOpenListeners = new Set<(open: boolean) => void>();
const setModalOpenState = (open: boolean) => {
  bigOpen = open;
  modalOpenListeners.forEach((cb) => cb(open));
};
```

**React subscription lifecycle pattern** (`src/index.tsx:1008-1015`):
```typescript
useEffect(() => {
  const listener = (open: boolean) => setModalOpen(open);
  modalOpenListeners.add(listener);
  setModalOpen(bigOpen);
  return () => {
    modalOpenListeners.delete(listener);
  };
}, []);
```

**Application to `src/bannerBus.ts`:**
- Define `BannerTone = "accent" | "error" | "neutral"` and `BannerPayload { id: number; text: string; secondaryText?: string; imageUrl?: string | null; tone?: BannerTone }` so track-change (2-line + optional 40px cached cover per `20-UI-SPEC.md`) and chord banners share one `emitBanner` / `subscribeBanner` API.
- Expose `resetBannerBusForTests()` (or unsubscribe cleanly) so Vitest tests don't leak subscribers across runs.

---

### `src/components/SilentBanner.tsx` (component, event-driven / timer)

**Analog:** `src/components/DeckifyOverlay.tsx`

**Imports & props pattern** (`src/components/DeckifyOverlay.tsx:1-31`):
```tsx
import { FC, useState, useEffect, useRef } from "react";
import { FaMusic, FaPlay, FaPause } from "react-icons/fa";
import { DeckifyImage } from "./common/DeckifyImage";
import { SyncedLine } from "../types";

export interface DeckifyOverlayProps {
  track?: OverlayTrack | null;
  isPlaying?: boolean;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | string;
  visible?: boolean;
  // ...
}
```

**Timer reset & cleanup pattern** (`src/components/DeckifyOverlay.tsx:69-108`):
```tsx
  useEffect(() => {
    // ...
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    // ...
    hideTimerRef.current = setTimeout(() => {
      setIsVisible(false);
    }, clampedAutoHideMs);

    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [/* deps */]);
```

**Fixed non-blocking corner positioning & ellipsis truncation pattern** (`src/components/DeckifyOverlay.tsx:191-223, 279-309`):
```tsx
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
    // ...
  };
```
```tsx
  <div
    style={{
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      // ...
    }}
  >
```
- **Phase 20 differences per `20-UI-SPEC.md`:** Use `24px` (`lg`) inset, `zIndex: 10000` (above HUD `9999`), `minWidth: 240`, `maxWidth: "min(420px, 40vw)"`, `padding: "12px 16px"`, `borderRadius: 8`, `background: "rgba(18,18,18,0.92)"`, `borderLeft: "3px solid <toneColor>"`, `pointerEvents: "none"` (no `tabIndex`, not a `Focusable`), `3500ms` timer keyed on banner `id`, and vertical offset (`sm` = `8px`) if HUD is simultaneously visible in the same corner. Normalize `position.replace("_", "-")` for `toast_position`/`overlay_position`. Render text strictly as React text nodes (no `dangerouslySetInnerHTML`) and render optional `40px` cached cover only if already resolved/proxied (`data:` / `http://127.0.0.1` / `imgMemoryCache.get(url)`).

---

### `src/components/SilentBanner.test.tsx` (test, component / fake-timers)

**Analog:** `src/components/DeckifyOverlay.test.tsx`

**Mock JSX + stateful React hooks + `vi.useFakeTimers()` harness** (`src/components/DeckifyOverlay.test.tsx:3-189`):
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock React JSX runtime
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
```
**Hook simulation & timer advance pattern** (`src/components/DeckifyOverlay.test.tsx:29-150, 340-396`):
```tsx
let stateSlots: any[] = [];
let stateIndex = 0;
let refSlots: any[] = [];
let refIndex = 0;
let effectSlots: Array<{
  effect: () => void | (() => void);
  deps?: any[];
  cleanup?: () => void;
  ran?: boolean;
}> = [];
// ... triggerRerender re-invokes component and flushEffects()
// Test fake timers:
vi.useFakeTimers();
vi.advanceTimersByTime(3499);
expect(getTree()).not.toBeNull();
vi.advanceTimersByTime(1);
expect(getTree()).toBeNull(); // or opacity 0
```
- Also follow `DeckifyOverlay.test.tsx:193-256` for testing `pointerEvents: "none"`, `position: "fixed"`, all 4 corners (plus `_`-to-`-` normalization and same-corner offset when `hudVisible` is true), latest-wins replacement resetting 3500ms timer, and `silent_banner_enabled` banner gating alongside `toast_enabled` track-change gating.

---

### `src/index.tsx` (controller / entry / wrapper, event-driven / RPC)

**Analog:** `src/index.tsx` (existing sections)

**1. `DeckifyOverlayWrapper` always-mounted banner vs HUD visibility gate** (`src/index.tsx:1008-1015, 1114-1132`):
```tsx
  useEffect(() => {
    const listener = (open: boolean) => setModalOpen(open);
    modalOpenListeners.add(listener);
    setModalOpen(bigOpen);
    return () => {
      modalOpenListeners.delete(listener);
    };
  }, []);
  // ...
  if (!settings?.overlay_enabled) return null;
  return (
    <DeckifyOverlay
      track={track}
      isPlaying={isPlaying}
      position={settings.overlay_position || "top-right"}
      visible={Boolean(settings.overlay_enabled) && !modalOpen}
      // ...
    />
  );
```
**Change pattern:** Remove early `if (!settings?.overlay_enabled) return null;` at line 1114. Wrap `<DeckifyOverlay>` and `<SilentBanner>` in a React Fragment `<>...</>`: render `<DeckifyOverlay>` only when `settings?.overlay_enabled` is truthy (preserving existing `visible={Boolean(settings.overlay_enabled) && !modalOpen}`), and always mount `<SilentBanner enabled={settings?.silent_banner_enabled !== false} position={...} hudVisible={...} />` as a sibling outside the `overlay_enabled` / `modalOpen` gate while gating track-change emission on `toast_enabled !== false` inside the `track_metadata` listener (D-01, D-05, D-11).

**2. `handleQuickPlayPinned` & `handleToggleLike` RPC patterns** (`src/index.tsx:441-465, 521-526`):
```tsx
  const handleQuickPlayPinned = async (pill: PinnedPlaylistItem) => {
    setOptimisticContextUri(pill.uri);
    try {
      const res = await backendQuickPlayPinned(pill.uri, pill.type);
      if (!res?.ok) {
        setOptimisticContextUri(null);
        toaster.toast({
          title: "Deckify",
          body: res?.error || "Failed to start pinned playlist — check Spotify connection or engine",
          duration: 3000,
        });
      } else {
        setContextUri(pill.uri);
        setOptimisticContextUri(null);
        refreshStatus();
      }
    } catch {
      // ...
    }
  };

  const handleToggleLike = async () => {
    const tid = trackMeta?.track_id || trackMeta?.id;
    if (!tid) return;
    const res = await backendToggleLike(tid, null);
    if (res.ok) setIsLiked(Boolean(res.is_liked));
  };
```

**3. Chord listener & `track_metadata` toast replacement** (`src/index.tsx:1165-1256`):
```tsx
  // 4. In-Game Gamepad Chords Listener
  let cleanupChords: (() => void) | null = null;
  try {
    const win = window as any;
    const fc = win.FocusNavController;
    const src = fc?.m_rgGamepadInputSources?.[0];
    if (src?.RegisterForGamepadButtonDown) {
      // ...
      src.RegisterForGamepadButtonDown(onDown);
      if (src.RegisterForGamepadButtonUp) {
        src.RegisterForGamepadButtonUp(onUp);
      }
      cleanupChords = () => {
        // Must unregister handles AND clear timers/state!
      };
    }
  } catch (e) {
    console.warn("Deckify: Gamepad chords setup error:", e);
  }

  // 5. In-game track change toast notification
  let lastToastTrackId = "";
  const trackSub = addEventListener<[any]>("track_metadata", async (meta: any) => {
    if (!meta || !meta.name || meta.track_id === lastToastTrackId) return;
    lastToastTrackId = meta.track_id;
    try {
      const curStatus = await backendGetStatus().catch(() => null);
      if (curStatus?.settings?.toast_enabled === false) return;
      const soundEnabled = Boolean(curStatus?.settings?.toast_sound_enabled);
      // ... if (soundEnabled) keep toaster.toast(...) unchanged (D-04);
      //     else if (curStatus?.settings?.silent_banner_enabled !== false) emitBanner(...);
      //     else toaster.toast(...)
    } catch {}
  });
```
- **Important wiring details for `src/index.tsx`:**
  - Respect `settings.gamepad_chords_enabled` (default `true`), `bigOpen` (D-10: ignore chords when Expanded Modal is open; still active when QAM is open), and `isRecordingChord` suppression flag when `SettingsTab` is capturing a chord!
  - Sync module-level chord settings (`currentBindings`, `chordsEnabled`, `silentBannerEnabled`, `toastEnabled`) from `backendGetStatus()`, `"settings_changed"` listener, and `"track_metadata"` / `"librespot_event"` so chord actions (like optimistic Like/Unlike + rollback, Pinned cycle index/context matching, Lyrics HUD toggle `overlay_lyrics_enabled`) don't stall waiting for extra roundtrips.
  - Wrap every async RPC call in the chord action handlers (`backendToggleLike`, `backendQuickPlayPinned`, `backendSetSetting`, `backendControlPlayback`, `backendSetVolume`, `backendGetStatus`) with `try/catch` or `.catch(...)` so both `{ ok: false }` responses and rejected RPC promises cleanly revert optimistic state (`cachedIsLiked`, `cachedContextUri`, `lastPinnedIndex`), keep `cachedOverlayLyricsEnabled` unchanged on failure, emit the error banner, and never produce unhandled promise rejections.
  - Note that `py_modules/rpc_playback.py:240-244` (`toggle_like_track`) emits `"track_metadata"` with the same `track_id` on success; `if (meta.track_id === lastToastTrackId) return;` prevents duplicate track-change banners.
  - Update `onDismount()` (`src/index.tsx:1305-1326`) to invoke `cleanupChords` (unregistering both `RegisterForGamepadButtonDown` and `RegisterForGamepadButtonUp` handles if returned, and clearing `guideHeld` timer) and remove any new module-scope event listeners.

---

### `src/index.test.tsx` (test, integration / event-driven)

**Analog:** `src/index.test.tsx`

**Wrapper & `track_metadata` toast test pattern** (`src/index.test.tsx:525-622, 718-753`):
```tsx
  it("suppresses HUD visibility via modalOpenListeners while modal is open and restores on close (D-10)", async () => {
    await import("./index");
    const { routerHook } = await import("@decky/api");
    const { showModal } = await import("@decky/ui");
    const plugin = capturedPluginFactory!();
    const wrapperFactory = (routerHook.addGlobalComponent as any).mock.calls[0][1];
    const renderWrapper = () => {
      hookIdx = 0;
      const el = wrapperFactory();
      return el.type(el.props || {});
    };
    // ...
  });

  it("proxies track_metadata toast cover via get_image at 48x48 and respects toast_sound_enabled", async () => {
    mockToasterToast.mockClear();
    mockGetImage.mockClear();
    await import("./index");
    const { addEventListener } = await import("@decky/api");
    const plugin = capturedPluginFactory!();
    const trackMetaCall = (addEventListener as any).mock.calls.find(
      (c: any[]) => c[0] === "track_metadata"
    );
    const trackMetaHandler = trackMetaCall[1];
    // ...
  });
```
- **Note for mocking `DeckifyOverlayWrapper`:** Notice `src/index.test.tsx:547, 574-579, 605, 614, 619, 707, 713` currently assert `renderWrapper().props.lyricsEnabled` and `renderWrapper().props.visible` directly on the single returned `<DeckifyOverlay>` element! When `DeckifyOverlayWrapper` changes to return a Fragment `<>...</>` containing `<DeckifyOverlay>` + `<SilentBanner>` (or returns `<SilentBanner>` when `!overlay_enabled`), update those assertions (or find the `Overlay` node inside `flattenNodes(renderWrapper())`) so existing Phase 10 tests keep passing.
- Add mock `toggle_like_track` in the `@decky/api` mock (`src/index.test.tsx:21-37`) and mock `FocusNavController.m_rgGamepadInputSources[0]` in `globalThis.window` to test all chord actions, modal suppression (`bigOpen`), silent banner vs `mockToasterToast` fallback, and optimistic Like rollback.

---

### `src/components/DeckifyOverlay.tsx` (component, props / event-driven)

**Analog:** `src/components/DeckifyOverlay.tsx`

**Current gate & corner positioning** (`src/components/DeckifyOverlay.tsx:186-203`):
```tsx
  if (!track || !track.name) {
    return null;
  }

  const art = track.artwork_url || track.image_url;
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
    // ...
  };
```
- **Check:** Keep `DeckifyOverlay.tsx` backwards-compatible with all 712 lines of `src/components/DeckifyOverlay.test.tsx` (which assert `getTree()` is `null` when `!track?.name` and `getTree().props.style.zIndex === 9999` / `margin === 16`). If `SilentBanner` renders as a sibling inside `DeckifyOverlayWrapper`, `DeckifyOverlay.tsx` may not even need structural changes (unless exporting a helper to compute whether HUD is currently rendered/occupying the corner for same-corner offset).

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD / settings-RPC)

**Analog:** `src/components/tabs/SettingsTab.tsx` (Resilience / Notifications / Dock sections)

**Imports & `updateSetting` pattern** (`src/components/tabs/SettingsTab.tsx:1-5, 239-246`):
```tsx
import { FC, useState, useEffect, useCallback, useRef } from "react";
import { DialogButton, Focusable, SliderField, ToggleField } from "@decky/ui";
import { callable, addEventListener, removeEventListener } from "@decky/api";
import { FaSlidersH, FaClock, FaPowerOff, FaPlug, FaBluetooth } from "react-icons/fa";
// ...
  const updateSetting = useCallback(
    async (key: string, value: unknown) => {
      setLocalSettings((prev) => ({ ...prev, [key]: value }));
      await backendSetSetting(key, value);
      refreshStatus();
    },
    [refreshStatus]
  );
```

**Notifications & Gamepad Chords section** (`src/components/tabs/SettingsTab.tsx:1402-1485`):
```tsx
      {/* Toasts & Gamepad Quick Chords */}
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          Notifications & Controller Shortcuts
        </h3>
        {/* Track Change Toasts, Notification Sound, Gamepad Quick Chords */}
```

**Two-button horizontal Focusable action group & ToggleField pattern** (`src/components/tabs/SettingsTab.tsx:851-860, 920-951`):
```tsx
  <ToggleField
    label="Auto-Resume on Wake / Wi-Fi"
    description="Automatically restore active playback after Steam Deck sleep or Wi-Fi recovery."
    checked={autoResume}
    onChange={(v: boolean) => {
      void updateSetting("resilience_auto_resume", v);
      showToast(v ? "Auto-resume enabled" : "Auto-resume disabled");
    }}
  />
// ...
  <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8 }}>
    <DialogButton
      style={{ minWidth: "auto", padding: "6px 12px", fontSize: 12, color: "#1db954" }}
      onClick={async () => { /* ... */ }}
    >
      Resume Bookmark
    </DialogButton>
    <DialogButton
      style={{ minWidth: "auto", padding: "6px 12px", fontSize: 12 }}
      onClick={async () => { /* ... */ }}
    >
      Dismiss
    </DialogButton>
  </Focusable>
```
- **Complexity constraint:** `SettingsTab` is already 1564 lines and `eslint.config.js:27-30` enforces `max-lines-per-function: 80` (warn) and `complexity: 15`. Extract the new `In-Game Quick Chords` card (`FaGamepad` header, `Silent HUD Banner` toggle, 8 action binding rows, press-to-record capture, inline validation error, per-action Clear/Reset, and two-step `Reset All Chords`) into `src/components/tabs/ChordBindingsCard.tsx` and compose it inside `SettingsTab.tsx`.

---

### `src/components/tabs/ChordBindingsCard.tsx` (component, CRUD / event-driven)

**Analog:** `src/components/tabs/GameEqModal.tsx` (stateful interactive widget with hooks) and `src/components/common/EqBandFaders.tsx` (UI row styling)

- **Hook isolation rule (`eslint.config.js:21` `react-hooks/rules-of-hooks: error`):** Unlike hookless `EqBandFaders.tsx`, `ChordBindingsCard` owns stateful capture hooks (`useState`, `useEffect`, `useRef` via `useChordRecorder`). Therefore `SettingsTab.tsx` MUST mount `<ChordBindingsCard ... />` as a JSX element — NEVER invoke `ChordBindingsCard(props)` as a plain function inside `SettingsTab` or a plain helper wrapper, which would leak hooks onto `SettingsTab`'s Fiber, violate `react-hooks/rules-of-hooks`, and collide with `SettingsTab.test.tsx:89-91` `mockAudioSinksState`.
- **SteamOS `.DialogButton { width: 100% }` override rule (`SoundtracksTab.tsx:369,385,640,667,680`, `GameEqModal.tsx:143,207`, `.planning/debug/phase-19-uat-ui-layout-navigation.md`):** Every compact inline `<DialogButton>` placed beside a `minWidth: 0, flex: 1` sibling or inside a horizontal flex strip (`Record Chord`, `Clear Chord`, `Reset Chord`, `Reset All Chords`, `Confirm Reset`, `Keep Chords`) MUST specify `width: "auto"` and `minWidth: "auto"` (plus `whiteSpace: "nowrap"` where appropriate) so SteamOS CSS cannot force `100%` button width and squeeze adjacent flex siblings.
- **Testing pattern:** In `SettingsTab.test.tsx`, inspect the mounted `<ChordBindingsCard>` JSX element via `findNodes(tree, (n) => n.type === ChordBindingsCard)` to verify prop wiring and `onToggleSilentBanner` / `onSaveBindings` callbacks; place interactive press-to-record, 5s countdown, validation, Clear/Reset, and two-step Reset All Chords tests in dedicated `ChordBindingsCard.test.tsx` using the stateful hook slot harness (`DeckifyOverlay.test.tsx` pattern).

---

### `src/components/tabs/SettingsTab.test.tsx` (test, component / CRUD)

**Analog:** `src/components/tabs/SettingsTab.test.tsx`

**Mocking icons/components & testing toggles/buttons** (`src/components/tabs/SettingsTab.test.tsx:30-62, 1208-1235, 1350-1367`):
```tsx
vi.mock("@decky/ui", () => ({
  DialogButton: ({ children, ...props }: any) => ({
    type: "DialogButton",
    props: { children, ...props },
  }),
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  SliderField: (props: any) => ({
    type: "SliderField",
    props,
  }),
  ToggleField: (props: any) => ({
    type: "ToggleField",
    props,
  }),
  // ...
}));

vi.mock("react-icons/fa", () => ({
  FaSlidersH: () => ({ type: "FaSlidersH" }),
  FaClock: () => ({ type: "FaClock" }),
  FaPowerOff: () => ({ type: "FaPowerOff" }),
  FaPlug: () => ({ type: "FaPlug" }),
  FaBluetooth: () => ({ type: "FaBluetooth" }),
  // Add FaGamepad, FaUndo, FaTimes, FaCircle when used in SettingsTab/ChordBindingsCard!
}));
```
```tsx
    const toggles = findNodes(
      tree,
      (n) => n.type === ToggleField || n.type === "ToggleField"
    );
    const mprisToggle = toggles.find((t) => t.props?.label === "Enable MPRIS2 Media Controls");
    await mprisToggle.props.onChange(false);
    expect(mockSetSetting).toHaveBeenCalledWith("mpris_enabled", false);
```
- **Critical mock note:** `SettingsTab.test.tsx:86-98` uses a **stateless** `useState` mock (`return [val, vi.fn()]`) with `mockAudioSinksState` matching `Array.isArray(val) && val.length === 0`, whereas `DeckifyOverlay.test.tsx:42-84` uses a **stateful** hook slot harness! Mounting `<ChordBindingsCard ... />` as JSX in `SettingsTab.tsx` keeps `SettingsTab`'s hook slots isolated and tests `<ChordBindingsCard>` prop wiring/callbacks cleanly in `SettingsTab.test.tsx`, while interactive recording/state tests run in `ChordBindingsCard.test.tsx`.

---

### `src/types.ts` (config / types, schema)

**Analog:** `src/types.ts`

**Settings interface & typed record/union pattern** (`src/types.ts:200-270`):
```typescript
export type PinnedItemType = "playlist" | "album" | "liked_songs";

export interface PinnedPlaylistItem {
  uri: string;
  name: string;
  type: PinnedItemType;
  image_url?: string | null;
}

export interface EngineSettings {
  // ...
  gamepad_chords_enabled?: boolean;
  silent_banner_enabled?: boolean;
  gamepad_chord_bindings?: ChordBindingsMap;
  toast_enabled?: boolean;
  toast_sound_enabled?: boolean;
  toast_position?: string;
  overlay_enabled?: boolean;
  overlay_position?: string;
  // ...
}
```
- Define `ChordActionId` union (`"previous" | "next" | "play_pause" | "volume_up" | "volume_down" | "toggle_like" | "cycle_pinned" | "toggle_lyrics"`) and `ChordBindingsMap = Partial<Record<ChordActionId, number[]>>` (or `Record<ChordActionId, number[]>`).

---

### `main.py` (controller / RPC, request-response / settings)

**Analog:** `main.py` (`get_status`, `set_setting`)

**1. `public_keys` exposure in `get_status`** (`main.py:602-625`):
```python
        public_keys = (
            "device_name", "audio_backend", "audio_quality", "bitrate",
            "bit_perfect_clock", "spotify_client_id", "normalisation",
            "normalisation_pregain", "gapless", "autoplay", "playlist_folders",
            "spotify_folder_tree", "game_audio_profiles", "auto_ducking",
            "auto_ducking_volume", "gamepad_chords_enabled", "toast_enabled",
            "toast_sound_enabled", "toast_position", "overlay_enabled", "overlay_position",
            # ... add "silent_banner_enabled", "gamepad_chord_bindings"
        )
```

**2. `set_setting` validation, sanitization, persistence, & `"settings_changed"` emit** (`main.py:710-761, 840-852, 885-891`):
```python
    async def set_setting(self, key: str, value) -> dict:
        if key == "active_game_override_snapshot":
            return {"ok": False, "error": "active_game_override_snapshot is managed internally"}
        if key not in DEFAULT_SETTINGS:
            return {"ok": False, "error": f"unknown setting: {key}"}
        # ...
        elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock", "overlay_enabled", "toast_enabled", "toast_sound_enabled", "gamepad_chords_enabled", ...):
            value = bool(value)
        # ...
        elif key == "pinned_playlists":
            if not isinstance(value, list):
                return {"ok": False, "error": "pinned_playlists must be a list"}
            if len(value) > MAX_PINNED_PLAYLISTS:
                return {"ok": False, "error": "Max 4 pinned items — unpin one first"}
            value = _sanitize_pinned_playlists(value)
        self._settings[key] = value
        _save_settings(self._settings)
        decky.logger.info("Setting updated: %s = %s", key, value)
        # ...
        public_settings = self._public_settings_payload()
        try:
            await decky.emit("settings_changed", public_settings)
        except Exception:
            pass

        return {"ok": True, "settings": public_settings}
```
- **Validation requirements (`20-RESEARCH.md` Security Domain):**
  - Add `"silent_banner_enabled"` to the boolean coercion tuple at `main.py:759` and `public_keys` at `main.py:607`.
  - Add `elif key == "gamepad_chord_bindings":` check validating `isinstance(value, dict)`, rejecting unknown action keys (or stripping/rejecting malformed values via shared helper `_validate_chord_bindings` / `_sanitize_chord_bindings` in `py_modules/common.py` so `set_setting` returns `{"ok": False, "error": ...}` on invalid types/lengths/>4 buttons/reserved combos/duplicates).

---

### `py_modules/common.py` (config / sanitizer, file-I/O / transform)

**Analog:** `py_modules/common.py` (`DEFAULT_SETTINGS`, `_sanitize_pinned_playlists`, `_load_settings`)

**Defaults & sanitizer helper pattern** (`py_modules/common.py:103-114, 166-198`):
```python
    "gamepad_chords_enabled": True,
    "toast_enabled": True,
    "toast_sound_enabled": False,
    "toast_position": "top_right",
```
```python
def _sanitize_pinned_playlists(raw) -> list[dict]:
    """Validate, deduplicate, and cap pinned playlist items to MAX_PINNED_PLAYLISTS."""
    if not isinstance(raw, list):
        return []
    result: list[dict] = []
    seen_uris: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        # ...
    return result
```

**`_load_settings` merge & coercion pattern** (`py_modules/common.py:323-342`):
```python
        for _rbool, _rdef in (
            ("resilience_auto_resume", True),
            ("resilience_bookmark_never_expires", False),
            ("resilience_toast_enabled", True),
            ("resilience_prompt_held_enabled", True),
            ("mpris_enabled", True),
            ("mpris_auto_proxy", True),
        ):
            if not isinstance(merged.get(_rbool), bool):
                merged[_rbool] = bool(merged.get(_rbool, _rdef))
        # ...
        merged["pinned_playlists"] = _sanitize_pinned_playlists(merged.get("pinned_playlists"))
        return merged
```
- Add `"silent_banner_enabled": True` and `"gamepad_chord_bindings": {k: list(v) for k, v in DEFAULT_CHORD_BINDINGS.items()}` to `DEFAULT_SETTINGS`, and use `copy.deepcopy(DEFAULT_SETTINGS)` in `_load_settings()` base merge and fallback (`except Exception:`) so nested defaults are never shared by reference.
- Important: in Python `isinstance(True, int)` is `True`! When sanitizing button arrays inside `gamepad_chord_bindings`, always guard `not isinstance(btn, bool) and isinstance(btn, int) and 0 <= btn <= 28` (or upper bound matching Steam button range), dedupe, cap `len <= 4`, reject Valve reserved chords and duplicate chords across actions (falling back to default for corrupt disk values in `_load_settings`).

---

### Backend Tests (`tests/test_chord_settings.py` or `tests/test_features.py`) (test, CRUD / validation)

**Analog:** `tests/test_pinned_playlists.py` (primary), `tests/test_dock.py:562-621`, `tests/test_features.py:357-370`

**`decky` stubbing & `Plugin` import pattern** (`tests/test_pinned_playlists.py:1-21`):
```python
import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=MagicMock(),
    emit=AsyncMock(),
)}):
    from py_modules import common, rpc_playback

try:
    from test_token_refresh import main
except ImportError:
    from tests.test_token_refresh import main
```

**Sanitizer + `_load_settings` + `set_setting` test pattern** (`tests/test_pinned_playlists.py:49-104` & `tests/test_features.py:357-370`):
```python
class TestPinnedPlaylists(unittest.IsolatedAsyncioTestCase):
    def test_load_settings_sanitizes_pinned_playlists(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            settings_path = os.path.join(tmpdir, "settings.json")
            with open(settings_path, "w") as f:
                json.dump({"pinned_playlists": [...]}, f)
            loaded = common._load_settings(settings_path)
            # ...

    async def test_set_setting_pinned_playlists_accepts_4_and_rejects_5(self):
        plugin = main.Plugin()
        plugin._settings = dict(common.DEFAULT_SETTINGS)
        with patch.object(main, "_save_settings") as mock_save, \
             patch.object(main.decky, "emit", new_callable=AsyncMock) as mock_emit:
            res = await plugin.set_setting("pinned_playlists", four_items)
            self.assertTrue(res["ok"])
            mock_save.assert_called_once()
            mock_emit.assert_awaited_once()
```

---

## Shared Patterns

### 1. SteamOS GamepadUI Spatial Navigation & `focusHalo`
**Source:** `src/components/common/InteractiveRow.tsx:4-15, 113-155` & `GEMINI.md`
**Apply to:** `src/components/tabs/SettingsTab.tsx`, `src/components/tabs/ChordBindingsCard.tsx`
- All horizontal button groups (`Record Chord`, `Clear Chord`, `Reset Chord`, chord chips) MUST use `<Focusable flow-children="horizontal" ...>` (never `"row"`).
- All interactive rows/buttons use `noFocusRing` + `focusHalo(focused)` (`onFocus`, `onBlur`, `onGamepadFocus`, `onGamepadBlur`, `onClick`, `onActivate`).
- `SilentBanner` MUST NOT use `<Focusable>` or `tabIndex` and MUST have `pointerEvents: "none"` so it never intercepts clicks or steals controller focus.

### 2. Steam CEF CSP Image Proxy & Zero-Wait Banner Rendering
**Source:** `src/components/common/imagePipeline.ts:86-109` & `src/index.tsx:1228-1236`
**Apply to:** `src/index.tsx`, `src/components/SilentBanner.tsx`
- Never pass external `https://i.scdn.co/...` URLs directly into `<img src>`.
- For silent track-change banners, check `imgMemoryCache.get(artwork)` (or `data:` / `http://127.0.0.1` prefix) synchronously or only use cached/proxied base64 URLs so the banner renders immediately without blocking on network I/O (`20-UI-SPEC.md` line 147).

### 3. Decky Backend RPC & Settings Persistence Contract
**Source:** `main.py:602-647, 710-891` & `py_modules/common.py:74-135, 201-345`
**Apply to:** `main.py`, `py_modules/common.py`, `src/types.ts`
- Every new setting requires 4 synchronized touchpoints:
  1. `py_modules/common.py`: `DEFAULT_SETTINGS` entry + sanitizer in `_load_settings()`.
  2. `main.py`: `public_keys` tuple in `get_status()`, plus type validation/coercion branch in `set_setting()`.
  3. `main.py`: `_save_settings(self._settings)` + `await decky.emit("settings_changed", public_settings)` (already at bottom of `set_setting`).
  4. `src/types.ts`: property in `EngineSettings`.
- Python RPCs return `{"ok": True, ...}` or `{"ok": False, "error": "..."}`; frontend RPC calls wrap `await` in `try/catch` with graceful fallback.

### 4. TypeScript Strictness & ESLint Complexity Limits
**Source:** `tsconfig.json:9-15` & `eslint.config.js:21-38`
**Apply to:** All new/modified `.ts` / `.tsx` files
- `tsconfig.json` enforces `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true`, `noImplicitAny: true`.
- `eslint.config.js` warns on `complexity > 15`, `max-depth > 4`, `max-params > 4`, `max-lines-per-function > 80`, and `@typescript-eslint/no-explicit-any`. Keep helper functions small and single-purpose (e.g., extract `ChordBindingsCard.tsx`, split chord action handlers in `src/index.tsx`).

### 5. Lightweight Vitest React Test Harness (No `@testing-library/react`)
**Source:** `src/components/DeckifyOverlay.test.tsx:3-180` & `src/index.test.tsx:104-176`
**Apply to:** `src/components/SilentBanner.test.tsx`, `src/components/tabs/ChordBindingsCard.test.tsx`, `src/index.test.tsx`
- Repo has no `@testing-library/react` or `jsdom` in `package.json`; all component tests mock `react/jsx-runtime`, `react/jsx-dev-runtime`, `react` hooks, `@decky/api`, `@decky/ui`, and `react-icons/fa`, then inspect virtual JSX object trees via `findNodes` / `findText` / `flattenNodes`.

---

## No Analog Found

Files or sub-behaviors with partial novelty (use `20-RESEARCH.md` and `20-UI-SPEC.md` alongside the closest analog above):

| File / Feature | Role | Data Flow | Closest Partial Analog | Note |
|----------------|------|-----------|------------------------|------|
| `src/chords.ts` (longest-subset combo matcher & Valve-reserved validator) | utility | event-driven | `src/utils/triggerController.ts` | Analog covers single-channel hysteresis/debounce; multi-button subset matching, last-button-down triggering, release re-arming, and 4s `guideHeld` expiry follow `20-RESEARCH.md` Pattern section |
| `src/components/tabs/ChordBindingsCard.tsx` (press-to-record 5s capture widget) | component | event-driven | `src/components/tabs/GameEqModal.tsx` | Modal analog covers interactive preview state & button bars; gamepad capture listener lifecycle + 5s countdown follows `20-UI-SPEC.md` & `useTriggerNavigation.ts` |

---

## Metadata

**Analog search scope:** `src/`, `src/components/`, `src/components/common/`, `src/components/tabs/`, `src/hooks/`, `src/utils/`, `py_modules/`, `tests/`, `main.py`, `node_modules/@decky/ui/`
**Files scanned:** 18 tracked project files + `@decky/ui` type/source definitions (`FooterLegend.ts`, `FooterLegend.d.ts`, `FooterLegend.js`, `Input.ts`, `utils/index.ts`, `index.d.ts`)
**Pattern extraction date:** 2026-11-21
