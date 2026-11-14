# Phase 08: Controller L2/R2 Ergonomics & Trigger Navigation - Pattern Map

**Mapped:** 2026-11-14
**Files analyzed:** 18
**Analogs found:** 18 / 18

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/utils/triggerController.ts` | utility | event-driven | `src/hooks/usePlaybackClock.ts` (`PlaybackClockController`) | role-match |
| `src/utils/triggerController.test.ts` | test | unit | `src/hooks/usePlaybackClock.test.ts` | exact |
| `src/utils/listNavigation.ts` | utility | transform | `src/components/tabs/soundtrackUtils.ts` | exact |
| `src/utils/listNavigation.test.ts` | test | unit | `src/hooks/usePlaybackClock.test.ts` | exact |
| `src/hooks/useTriggerNavigation.ts` | hook | event-driven | `src/index.tsx` (lines 755-807) & `src/components/DeckifyExpandedModal.tsx` (lines 595-646) | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | event-driven | `src/components/DeckifyExpandedModal.tsx` (self) & `src/index.tsx` (lines 755-807) | exact |
| `src/components/DeckifyExpandedModal.test.tsx` | test | component | `src/components/DeckifyExpandedModal.test.tsx` (self) | exact |
| `src/components/common/Sidebar.tsx` | component | UI / navigation | `src/components/common/Sidebar.tsx` (self) | exact |
| `src/components/common/Sidebar.test.tsx` | test | component | `src/components/tabs/SettingsTab.test.tsx` | exact |
| `src/components/common/InteractiveRow.tsx` | component | UI / list-item | `src/components/common/InteractiveRow.tsx` (self) | exact |
| `src/components/common/TrackRowItem.tsx` | component | UI / list-item | `src/components/common/TrackRowItem.tsx` (self) | exact |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD | `src/components/tabs/SoundtracksTab.tsx` (lines 420-470) | exact |
| `src/components/tabs/SettingsTab.test.tsx` | test | component | `src/components/tabs/SettingsTab.test.tsx` (self) & `src/components/tabs/SoundtracksTab.test.tsx` | exact |
| `src/hooks/usePlaybackClock.ts` | hook | transform | `src/hooks/usePlaybackClock.ts` (self, lines 335-362) | exact |
| `src/hooks/usePlaybackStatus.ts` | hook | request-response | `src/hooks/usePlaybackStatus.ts` (self, lines 27-37) | exact |
| `src/types.ts` | config | types | `src/types.ts` (self, lines 143-180) | exact |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (self, lines 70-106) | exact |
| `tests/test_py_modules.py` | test | unit | `tests/test_py_modules.py` (self, lines 53-71) | exact |

---

## Pattern Assignments

### `src/utils/triggerController.ts` (utility, event-driven)

**Analog:** `src/hooks/usePlaybackClock.ts` (`PlaybackClockController` pure TS class with injected clock/timer)

**Core pattern** (pure framework-agnostic class/module with explicit constants and state):
- Export named constants in `UPPER_SNAKE_CASE` (`TRIGGER_PRESS_THRESHOLD = 0.75`, `TRIGGER_RELEASE_THRESHOLD = 0.25`, `TRIGGER_DEBOUNCE_MS = 300`, `TRIGGER_REPEAT_DELAY_MS = 500`, `TRIGGER_REPEAT_INTERVAL_MS = 300`).
- Accept injected `now: number` timestamp parameters on `processTrigger(side, value, now)` so Vitest can test deterministically without real timers, matching how `usePlaybackClock.test.ts` uses `vi.useFakeTimers()` and deterministic state checks.

---

### `src/utils/triggerController.test.ts` & `src/utils/listNavigation.test.ts` (test, unit)

**Analog:** `src/hooks/usePlaybackClock.test.ts`

**Imports & timer mocking pattern** (`src/hooks/usePlaybackClock.test.ts` lines 1-24):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("usePlaybackClock & PlaybackClockController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
```
*(Note: pure `src/utils/triggerController.ts` and `src/utils/listNavigation.ts` have zero React dependency, so the `vi.mock("react", ...)` block in `usePlaybackClock.test.ts` lines 3-8 is not needed for pure utility tests.)*

---

### `src/utils/listNavigation.ts` (utility, transform)

**Analog:** `src/components/tabs/soundtrackUtils.ts`

**Pure helper & named export pattern** (`src/components/tabs/soundtrackUtils.ts` lines 25-60):
```typescript
/** Debounce delay for persisting profile edits (T-07-04: avoid RPC thrashing). */
export const SAVE_DEBOUNCE_MS = 500;

/** Accept either `{ "<appid>": profile }` or `{ profiles: {...} }` shapes. */
export function normalizeProfiles(raw: any): Record<string, SoundtrackProfile> {
  if (!raw || typeof raw !== "object") return {};
  ...
```
- Use pure TypeScript functions with explicit parameter types and return objects (`{ targetIndex, badge, shouldLoadMore }`), plus concise JSDoc comments explaining edge cases (empty lists, short lists `rows.length <= pageSize`, alphabetical anchor detection, boundary clamping).

---

### `src/hooks/useTriggerNavigation.ts` (hook, event-driven)

**Analog:** `src/index.tsx` (lines 755-807) & `src/components/DeckifyExpandedModal.tsx` (lines 595-646)

**FocusNavController subscription pattern** (`src/index.tsx` lines 757-807):
```typescript
  try {
    const win = window as any;
    const fc = win.FocusNavController;
    const src = fc?.m_rgGamepadInputSources?.[0];
    if (src?.RegisterForGamepadButtonDown) {
      const onDown = (btn: number) => {
        ...
      };
      const onUp = (btn: number) => {
        ...
      };
      src.RegisterForGamepadButtonDown(onDown);
      if (src.RegisterForGamepadButtonUp) {
        src.RegisterForGamepadButtonUp(onUp);
      }
      ...
    }
  } catch (e) {
    console.warn("Deckify: Gamepad chords setup error:", e);
  }
```
- **Modal-scoped cleanup difference:** Unlike `src/index.tsx` (which is global), `useTriggerNavigation.ts` runs inside a `useEffect` in `DeckifyExpandedModal` and MUST set an `active = true` -> `active = false` guard in cleanup, call `unsub?.Unregister?.()` or `unsub()` if returned, cancel `requestAnimationFrame`, clear pending seek/pill timers, and remove `window` `vgp_onbuttondown` / `keydown` listeners on unmount.

---

### `src/components/DeckifyExpandedModal.tsx` (component, event-driven)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (lines 595-695)

**Existing input & cancel-bubble pattern** (`src/components/DeckifyExpandedModal.tsx` lines 620-683):
```typescript
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
      ...
    };

    const handleVgpButton = (e: any) => {
      const btn = e.detail?.button ?? e.detail ?? e.button;
      handleGamepadAction(btn, e);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("vgp_onbuttondown", handleVgpButton);
```
**Preserve bubble-phase `vgp_oncancel` handler** (`src/components/DeckifyExpandedModal.tsx` lines 649-683):
```typescript
    el.addEventListener("vgp_oncancel", (e: Event) => {
      if (actionTrackRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionTrack(null);
        return;
      }
      ...
    }, false);
```
- Wire `contentPaneRef` to the right-hand content pane container for D-10 content-focus guard (`contentPaneRef.current?.contains(document.activeElement)`).
- Render the floating seek/page indicator pill and subtle context-aware hint bar (`show_controller_hints`) inside the modal layout.

---

### `src/components/DeckifyExpandedModal.test.tsx` (test, component)

**Analog:** `src/components/DeckifyExpandedModal.test.tsx` (lines 1-60)

**Mocking pattern** (`src/components/DeckifyExpandedModal.test.tsx` lines 1-42):
```typescript
vi.mock("@decky/api", () => ({
  callable: () => vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@decky/ui", () => ({
  ModalRoot: ({ children, ...props }: any) => ({ type: "ModalRoot", props: { children, ...props } }),
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  DialogButton: ({ children, ...props }: any) => ({ type: "DialogButton", props: { children, ...props } }),
  ButtonItem: ({ children, ...props }: any) => ({ type: "ButtonItem", props: { children, ...props } }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
  DropdownItem: (props: any) => ({ type: "DropdownItem", props }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  TextField: (props: any) => ({ type: "TextField", props }),
  NavEntryPositionPreferences: { FIRST: 0 },
}));
```
- Extend existing test suite to cover `FocusNavController` button events (`Y`/`X`/`L2`/`R2`), accumulated seek, and suppression when `actionTrack` or `INPUT` is focused.

---

### `src/components/common/Sidebar.tsx` (component, UI / navigation)

**Analog:** `src/components/common/Sidebar.tsx` (lines 87-177)

**Current layout to refactor** (`src/components/common/Sidebar.tsx` lines 88-175):
```tsx
    <div
      style={{
        width: 220,
        background: "rgba(0,0,0,0.45)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        padding: 16,
        gap: 8,
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      {/* Brand Header */}
      ...
      {/* Navigation Menu */}
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        ...
      </Focusable>
      {/* Now Playing Widget in Sidebar */}
      ...
      {/* Back to Quick Menu (B) Button */}
      <InteractiveRow onClick={() => closeModal?.()} ...>
        <span>Back to Steam (B)</span>
      </InteractiveRow>
    </div>
```
- Replace outer `<div>` with `<Focusable flow-children="column" style={{ ..., overflow: "hidden" }}>`, move `overflowY: "auto"` to an inner wrapper around the tab list (`flex: 1, minHeight: 0`), and keep `Back to Steam (B)` in a `flexShrink: 0` pinned footer inside the parent `<Focusable flow-children="column">`.

---

### `src/components/common/Sidebar.test.tsx` (test, component)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (lines 1-60)

**JSX tree-inspection test pattern** (`src/components/tabs/SettingsTab.test.tsx` lines 14-60):
```typescript
vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
}));

vi.mock("react/jsx-dev-runtime", () => ({
  jsxDEV: (type: any, props: any, key: any) => ({
    type,
    props: { ...props, ...(key !== undefined ? { key } : {}) },
  }),
}));
...
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
- Verify that the root `<Focusable flow-children="column">` wraps both the scrollable tab list (`overflowY: "auto"`) and the pinned `Back to Steam (B)` footer (`flexShrink: 0`).

---

### `src/components/common/InteractiveRow.tsx` & `src/components/common/TrackRowItem.tsx` (component, UI / list-item)

**Analog:** `src/components/common/InteractiveRow.tsx` (lines 17-25, 91-136) & `src/components/common/TrackRowItem.tsx` (lines 31-37)

**Props & Focusable forwarding pattern** (`src/components/common/InteractiveRow.tsx` lines 17-25, 102-118):
```tsx
export interface InteractiveRowProps {
  children: ReactNode;
  onClick: () => void;
  onFocus?: () => void;
  active?: boolean;
  style?: any;
  tabIndex?: number;
  onKeyDown?: (e: any) => void;
}
```
- Extend `InteractiveRowProps` with optional `data-deckify-list-item?: string` / `data-deckify-label?: string` (or spread `data-*` props onto `<Focusable>`), and pass `data-deckify-list-item="true"` from `TrackRowItem` and tab list rows so `listNavigation.ts` can query `[data-deckify-list-item="true"]` and call `el.scrollIntoView({ block: "nearest", behavior: "smooth" })` + `el.focus()`.

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/SoundtracksTab.tsx` (lines 420-470) & `src/components/tabs/SettingsTab.tsx` (lines 660-717)

**`ToggleField` & `SliderField` pattern** (`src/components/tabs/SoundtracksTab.tsx` lines 424-463):
```tsx
<ToggleField
  label="Always auto-start soundtrack"
  checked={profile.always_auto_start}
  onChange={(val: boolean) =>
    persistProfile(game.app_id, { ...profile, always_auto_start: val })
  }
/>
...
<SliderField
  label={
    profile.volume_override !== null
      ? `Volume Override (${profile.volume_override}%)`
      : "Volume Override (Disabled)"
  }
  value={profile.volume_override ?? 80}
  min={0}
  max={100}
  step={5}
  showValue
  onChange={(val: number) =>
    persistProfile(game.app_id, setVolumeOverride(profile, val))
  }
/>
```
**Settings card container & `backendSetSetting` pattern** (`src/components/tabs/SettingsTab.tsx` lines 661-675):
```tsx
      <div style={{ marginBottom: 20, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.04)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 6 }}>
          Notifications & Controller Shortcuts
        </h3>
        ...
            await backendSetSetting("toast_enabled", !cur);
            showToast(!cur ? "Track change toasts enabled" : "Track change toasts disabled");
            refreshStatus();
```
- Import `SliderField, ToggleField` from `@decky/ui` alongside `Focusable` in `SettingsTab.tsx` line 2.
- All time/seconds-based settings (`trigger_seek_seconds`, `5`–`30`, step `5`) MUST use `SliderField` (D-04).

---

### `src/components/tabs/SettingsTab.test.tsx` (test, component)

**Analog:** `src/components/tabs/SettingsTab.test.tsx` (lines 14-19)

**`@decky/ui` mock update required:**
```typescript
vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({
    type: "Focusable",
    props: { children, ...props },
  }),
  SliderField: (props: any) => ({ type: "SliderField", props }),
  ToggleField: (props: any) => ({ type: "ToggleField", props }),
}));
```
- Add tests asserting `SliderField` and `ToggleField` render for `trigger_nav_enabled`, `trigger_seek_seconds`, `trigger_page_size`, and `show_controller_hints`, and invoke `backendSetSetting`.

---

### `src/hooks/usePlaybackClock.ts` & `src/hooks/usePlaybackStatus.ts` (hook, transform / request-response)

**Analog:** `src/hooks/usePlaybackClock.ts` (lines 335-354) & `src/hooks/usePlaybackStatus.ts` (lines 27-37)

**Existing seek clamping & commit pattern** (`src/hooks/usePlaybackClock.ts` lines 335-354):
```typescript
  const scrubTo = useCallback(
    (targetMs: number) => {
      const clamped = durationMs > 0
        ? Math.min(durationMs, Math.max(0, targetMs))
        : Math.max(0, targetMs);

      setIsScrubbing(true);
      setScrubPositionMs(clamped);
```
- For L2/R2 seeking (D-03), clamp target to `[0, Math.max(0, durationMs - 1000)]` before passing to `clock.scrubTo(...)` so spamming R2 near track end never triggers an accidental skip.
- In `src/hooks/usePlaybackStatus.ts` lines 32-36, check `const res = await backendSeekPlayback(targetMs, "");` and surface an error toast via `toaster.toast` if `res?.ok === false` or the call throws.

---

### `src/types.ts`, `py_modules/common.py`, `tests/test_py_modules.py` (config & unit test)

**Analog:** `src/types.ts` (lines 159-180), `py_modules/common.py` (lines 98-106), `tests/test_py_modules.py` (lines 53-71)

**`EngineSettings` in `src/types.ts`:**
```typescript
  gamepad_chords_enabled?: boolean;
  toast_enabled?: boolean;
  ...
  trigger_nav_enabled?: boolean;
  trigger_seek_seconds?: number;
  trigger_page_size?: number;
  show_controller_hints?: boolean;
```
**`DEFAULT_SETTINGS` in `py_modules/common.py`:**
```python
    "gamepad_chords_enabled": True,
    "toast_enabled": True,
    ...
    "trigger_nav_enabled": True,
    "trigger_seek_seconds": 10,
    "trigger_page_size": 15,
    "show_controller_hints": True,
```
**Unit test in `tests/test_py_modules.py`:**
Assert `DEFAULT_SETTINGS` contains `trigger_nav_enabled` (`True`), `trigger_seek_seconds` (`10`), `trigger_page_size` (`15`), and `show_controller_hints` (`True`), and that `_load_settings` / `_save_settings` round-trips them.

---

## Shared Patterns

### Hybrid `FocusNavController` + `vgp_onbuttondown` + `keydown` Subscription with Dedup
**Source:** `src/index.tsx` (lines 757-807) & `src/components/DeckifyExpandedModal.tsx` (lines 595-646)
**Apply to:** `src/hooks/useTriggerNavigation.ts`, `src/components/DeckifyExpandedModal.tsx`
- Subscribe to `window.FocusNavController?.m_rgGamepadInputSources?.[0]?.RegisterForGamepadButtonDown` / `RegisterForGamepadButtonUp` using numeric `GamepadButton` codes (`3=SECONDARY/X`, `4=OPTIONS/Y`, `5=BUMPER_LEFT`, `6=BUMPER_RIGHT`, `7=TRIGGER_LEFT`, `8=TRIGGER_RIGHT`).
- Keep `window.addEventListener("vgp_onbuttondown", ...)` and `window.addEventListener("keydown", ...)` as fallbacks, with an `80ms` per-action timestamp deduplication map (`lastActionTimeRef`) so dual-emitted events never double-fire.
- Gate all handlers with an `active` mount flag and clean up every listener/rAF/timer on modal unmount.

### Settings Persistence & `SliderField` / `ToggleField` Convention
**Source:** `src/components/tabs/SoundtracksTab.tsx` (lines 424-463), `src/components/tabs/SettingsTab.tsx` (lines 661-717), `py_modules/common.py` (lines 70-106)
**Apply to:** `src/components/tabs/SettingsTab.tsx`, `src/types.ts`, `py_modules/common.py`
- Every time/seconds setting in `SettingsTab.tsx` uses `@decky/ui` `SliderField` (never steppers/dropdowns).
- Persist changes immediately via `backendSetSetting(key, val)` followed by `refreshStatus()`.

### Spatial Navigation (`flow-children`) & Focus Halo
**Source:** `src/components/common/Sidebar.tsx` (line 111), `src/components/common/InteractiveRow.tsx` (lines 4-15, 102-134)
**Apply to:** `src/components/common/Sidebar.tsx`, `src/components/common/InteractiveRow.tsx`, `src/components/common/TrackRowItem.tsx`, list tabs
- Vertical containers use `<Focusable flow-children="column">`; horizontal button groups MUST use `flow-children="horizontal"` (never `"row"`).
- List items use `InteractiveRow` (`onFocus` + `onGamepadFocus` + `focusHalo`) so `targetEl.focus()` updates `focusedTrackRef.current` and applies the `#fff` / `#1db954` focus ring automatically.

---

## No Analog Found

Files or mechanisms with no exact existing analog in the codebase (planner should follow `08-RESEARCH.md` patterns):

| File / Mechanism | Role | Data Flow | Reason |
|------------------|------|-----------|--------|
| `navigator.getGamepads()` rAF analog polling + Schmidt hysteresis in `src/utils/triggerController.ts` & `src/hooks/useTriggerNavigation.ts` | utility / hook | event-driven | No existing analog trigger float (`0.0`–`1.0`) polling or Schmidt hysteresis exists in the codebase yet; follow `08-RESEARCH.md` Pattern 1 & Pitfall 2. |
| Floating seek/page indicator pill & context-aware hint bar in `src/components/DeckifyExpandedModal.tsx` | component | UI overlay | No existing floating pill inside `DeckifyExpandedModal` yet; follow `08-RESEARCH.md` Architecture Diagram & `08-CONTEXT.md` D-02, D-09, D-13. |

---

## Metadata

**Analog search scope:** `src/`, `py_modules/`, `tests/` (all git-tracked)
**Files scanned:** 14 source/test files read in detail; full tracked file list verified via `git ls-files`
**Pattern extraction date:** 2026-11-14
