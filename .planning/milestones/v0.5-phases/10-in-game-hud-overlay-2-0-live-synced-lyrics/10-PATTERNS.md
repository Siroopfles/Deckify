# Phase 10: In-Game HUD Overlay 2.0 (Live Synced Lyrics) - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 12 (8 source/config files, 4 test files — all modifications to existing tracked files)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (`DEFAULT_SETTINGS`, `_load_settings`) | exact (self) |
| `main.py` | controller | request-response / event-driven | `main.py` (`set_setting`, `settings_changed` emit) | exact (self) |
| `src/types.ts` | model | transform | `src/types.ts` (`EngineSettings`) | exact (self) |
| `src/index.tsx` | provider / component | event-driven | `src/index.tsx` (`activeGameListeners`, `DeckifyOverlayWrapper`, `renderOverlayControls`) | exact (self) |
| `src/components/DeckifyOverlay.tsx` | component | event-driven | `src/components/DeckifyOverlay.tsx` (`hideTimerRef`, `pauseTimerRef`, `posStyle`) | exact (self) |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD | `src/components/tabs/SettingsTab.tsx` (Overlay card + `SliderField` controls) | exact (self) |
| `src/components/tabs/LyricsTab.tsx` | component | request-response | `src/components/tabs/LyricsTab.tsx` + `src/components/tabs/SettingsTab.tsx` (`Focusable` horizontal pills) | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | request-response / event-driven | `src/components/DeckifyExpandedModal.tsx` (`fetchLyrics`, `handleNextLyricsSource`, `ModalRootAny`) | exact (self) |
| `src/components/DeckifyOverlay.test.tsx` | test | event-driven | `src/components/DeckifyOverlay.test.tsx` (custom React hook mock + `vi.useFakeTimers`) | exact (self) |
| `src/components/tabs/SettingsTab.test.tsx` | test | CRUD | `src/components/tabs/SettingsTab.test.tsx` | exact (self) |
| `src/index.test.tsx` | test | event-driven | `src/index.test.tsx` | exact (self) |
| `tests/test_e2e_requirements.py` | test | CRUD / config | `tests/test_e2e_requirements.py` | exact (self) |

## Pattern Assignments

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py`

**`DEFAULT_SETTINGS` overlay block** (lines 101-104):
```python
    "overlay_enabled": False,
    "overlay_position": "top-right",
    "overlay_autohide": False,
    "overlay_show_progress": False,
```
Add `overlay_lyrics_enabled: False`, `overlay_lyrics_offset_ms: 0`, and `overlay_autohide_duration_s: 6` directly alongside these keys.

**`_load_settings` validation & clamping pattern** (lines 218-253):
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
Integer clamping pattern in the same function (lines 240-243):
```python
        try:
            merged["ducking_proportional_pct"] = max(10, min(90, int(merged.get("ducking_proportional_pct", 50))))
        except (TypeError, ValueError):
            merged["ducking_proportional_pct"] = 50
```
Copy this exact `bool(...)` coercion for `overlay_lyrics_enabled` and `try/except (TypeError, ValueError)` + `max(..., min(...))` clamping for `overlay_lyrics_offset_ms` (`-2000..2000`, default `0`) and `overlay_autohide_duration_s` (`3..15`, default `6`).

---

### `main.py` (controller, request-response / event-driven)

**Analog:** `main.py`

**Boolean setting validation** (lines 581-582):
```python
        elif key in ("normalisation", "gapless", "autoplay", "bit_perfect_clock", "overlay_enabled", "toast_enabled", "gamepad_chords_enabled", "overlay_autohide", "overlay_show_progress", "voice_ducking_enabled"):
            value = bool(value)
```
Add `"overlay_lyrics_enabled"` to this tuple.

**Clamped integer setting validation & structured error return** (lines 593-602):
```python
        elif key == "ducking_proportional_pct":
            try:
                value = max(10, min(90, int(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "ducking_proportional_pct must be an integer between 10 and 90"}
```
Copy this pattern for `overlay_lyrics_offset_ms` (`max(-2000, min(2000, int(value)))`) and `overlay_autohide_duration_s` (`max(3, min(15, int(value)))`).

**Persistence & `settings_changed` broadcast** (lines 640-663):
```python
        self._settings[key] = value
        _save_settings(self._settings)
        decky.logger.info("Setting updated: %s = %s", key, value)
        ...
        try:
            await decky.emit("settings_changed", dict(self._settings))
        except Exception:
            pass

        return {"ok": True, "settings": dict(self._settings)}
```

---

### `src/types.ts` (model, transform)

**Analog:** `src/types.ts`

**`EngineSettings` overlay fields** (lines 171-175):
```typescript
  overlay_enabled?: boolean;
  overlay_position?: string;
  overlay_autohide?: boolean;
  overlay_show_progress?: boolean;
```
Add:
- `overlay_lyrics_enabled?: boolean;`
- `overlay_lyrics_offset_ms?: number;`
- `overlay_autohide_duration_s?: number;`

**`SyncedLine` type** (lines 121-124):
```typescript
export interface SyncedLine {
  timeMs: number;
  text: string;
}
```

---

### `src/index.tsx` (provider / component, event-driven)

**Analog:** `src/index.tsx`

**Callable declaration pattern** (lines 57-75 & `DeckifyExpandedModal.tsx` line 82):
```typescript
const backendGetLyrics = callable<[string, string, number, number?], { ok: boolean; synced_lyrics?: string; plain_lyrics?: string; source?: string; error?: string }>("get_lyrics");
```
Also import `parseLrc` from `"./utils"` and `SyncedLine` from `"./types"`.

**Pub/sub listener pattern for `modalOpenListeners`** (analog: `activeGameListeners`, lines 77-95):
```typescript
let currentRunningAppId: number | null = null;
const activeGameListeners = new Set<(appId: number | null) => void>();
const setActiveGameState = (appId: number | null) => {
  currentRunningAppId = appId;
  activeGameListeners.forEach((cb) => cb(appId));
};

let bigOpen = false;
const openExpandedView = () => {
  if (bigOpen) return;
  bigOpen = true;
  showModal(
    <DeckifyExpandedModal
      closeModal={() => {
        bigOpen = false;
      }}
    />
  );
};
```
Mirror `activeGameListeners` with `modalOpenListeners = new Set<(open: boolean) => void>()` and `setModalOpenState(open: boolean)` called in `openExpandedView` (`true`) and `closeModal` (`false`).

**QAM `renderOverlayControls` toggle pattern** (lines 526-555):
```tsx
          <PanelSectionRow>
            <ToggleField
              label="Auto-Hide Overlay (6s)"
              description="Fades out 6s after track starts or resumes"
              checked={Boolean(settings.overlay_autohide)}
              onChange={async (val) => {
                setSettings((prev) => ({
                  ...prev,
                  overlay_autohide: val,
                }));
                await backendSetSetting("overlay_autohide", val);
              }}
            />
          </PanelSectionRow>
```
Add an Overlay Lyrics `ToggleField` inside `settings.overlay_enabled && (...)` following this exact optimistic `setSettings` + `await backendSetSetting("overlay_lyrics_enabled", val)` pattern.

**`DeckifyOverlayWrapper` event subscription & prop passing** (lines 833-906):
```tsx
const DeckifyOverlayWrapper: FC = () => {
  const [track, setTrack] = useState<TrackMeta | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [settings, setSettings] = useState<EngineSettings | null>(null);
  const [positionMs, setPositionMs] = useState<number>(0);
  const [durationMs, setDurationMs] = useState<number>(0);
  ...
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
Extend `DeckifyOverlayWrapper` to:
1. Subscribe to `modalOpenListeners` in `useEffect` and pass `visible={Boolean(settings.overlay_enabled) && !modalOpen}`.
2. Fetch `backendGetLyrics(track.name, track.artist, Math.round((track.duration_ms || durationMs || 0) / 1000), 0)` ONLY when `settings?.overlay_enabled && settings?.overlay_lyrics_enabled && track?.name && track?.artist`, deduplicated by a `lastFetchedTrackKeyRef` so 4s `get_status` polls never re-fetch for the same track.
3. Pass `autoHideDurationMs={(settings.overlay_autohide_duration_s ?? 6) * 1000}`, `lyricsEnabled={Boolean(settings.overlay_lyrics_enabled)}`, `lyricsOffsetMs={settings.overlay_lyrics_offset_ms ?? 0}`, `syncedLyrics={syncedLyrics}`, `lyricsLoaded={lyricsLoaded}`.

---

### `src/components/DeckifyOverlay.tsx` (component, event-driven)

**Analog:** `src/components/DeckifyOverlay.tsx`

**Timer & ref cleanup pattern** (lines 40-86):
```typescript
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  ...
  useEffect(() => {
    ...
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }

    if (!visible || !track || !track.name) {
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
  }, [isPlaying, track?.name, track?.track_id, track?.id, visible, autoHide]);
```
Changes to follow this pattern:
- Replace `6000` with `autoHideDurationMs` (clamped `3000..15000`, default `6000`) and include `autoHideDurationMs` in the dependency array.
- Add `lyricTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)` and `posAnchorRef = useRef<{ posMs: number; atMs: number }>({ posMs: positionMs, atMs: Date.now() })` for discrete `setTimeout` lyric scheduling (no `setInterval`, no `requestAnimationFrame`).
- Keep root container `pointerEvents: "none"` (line 99) and use only `useState`, `useRef`, `useEffect` (to stay compatible with `DeckifyOverlay.test.tsx`'s hook mock).

**Header + Progress bar layout** (lines 132-225):
Place the fixed-height single-line lyric row (`height: 18`, `lineHeight: "18px"`, `fontSize: 11`, `whiteSpace: "nowrap"`, `overflow: "hidden"`, `textOverflow: "ellipsis"`, `borderTop: "1px solid rgba(255, 255, 255, 0.08)"`, `paddingTop: 5`, `marginTop: 2`) directly below the artwork+title/artist flex row (line 198) and above the `showProgress && durationMs > 0` progress bar (line 200).

---

### `src/components/tabs/SettingsTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/SettingsTab.tsx`

**Overlay card `InteractiveRow` toggle pattern** (lines 623-656):
```tsx
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
```
Copy this `InteractiveRow` toggle pattern for `overlay_lyrics_enabled` inside the `status?.settings?.overlay_enabled && (<> ... </>)` block.

**`SliderField` pattern** (lines 743-755):
```tsx
        <SliderField
          label="Seek Step (Seconds)"
          min={5}
          max={30}
          step={5}
          showValue
          value={status?.settings?.trigger_seek_seconds ?? 10}
          onChange={async (val: number) => {
            const clamped = Math.min(30, Math.max(5, val));
            await backendSetSetting("trigger_seek_seconds", clamped);
            refreshStatus();
          }}
        />
```
Copy this `SliderField` pattern inside the Overlay settings card for:
1. Auto-Hide Duration (`min={3}`, `max={15}`, `step={1}`, `showValue`, `overlay_autohide_duration_s ?? 6`).
2. Lyrics Latency Offset (`min={-2000}`, `max={2000}`, `step={100}`, `showValue`, `overlay_lyrics_offset_ms ?? 0`, shown when `overlay_lyrics_enabled` is true or always under overlay settings).

---

### `src/components/tabs/LyricsTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/LyricsTab.tsx` + `src/components/tabs/SettingsTab.tsx` (lines 606-621)

**Horizontal `Focusable` pill group pattern** (`SettingsTab.tsx` lines 606-621):
```tsx
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
```

**Existing `LyricsTab.tsx` header & fallback button** (lines 41-52):
```tsx
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, background: "rgba(29, 185, 84, 0.2)", color: "#1db954", padding: "4px 10px", borderRadius: 12, fontWeight: 700 }}>
            Source: {lyricsSource || "Auto"}
          </span>
          <InteractiveRow
            onClick={handleNextLyricsSource}
            style={{ padding: "4px 10px", fontSize: 11, background: "rgba(255,255,255,0.08)" }}
          >
            <FaSyncAlt size={10} style={{ marginRight: 4 }} />
            Try Next Source
          </InteractiveRow>
        </div>
```
Add optional `onSelectLyricsSource?: (offset: number, label: string) => void;` to `LyricsTabProps`, and render the 5 source pills (`Spotify`: 0, `LRCLIB`: 1, `NetEase`: 2, `Musixmatch`: 3, `Lyrics.ovh`: 4) inside `<Focusable flow-children="horizontal">` using `<InteractiveRow active={lyricsSource === src.label} ...>`, while keeping `"Try Next Source"` alongside them.

---

### `src/components/DeckifyExpandedModal.tsx` (component, request-response / event-driven)

**Analog:** `src/components/DeckifyExpandedModal.tsx`

**Lyrics source selection & cycling** (lines 346-351 & 996-1009):
```typescript
  const handleNextLyricsSource = useCallback(() => {
    const nextOffset = lyricsOffset + 1;
    setLyricsOffset(nextOffset);
    fetchLyrics(nextOffset);
    showToast("Trying next lyrics provider...");
  }, [lyricsOffset, fetchLyrics, showToast]);
```
Wrap `nextOffset = (lyricsOffset + 1) % 5`, add `handleSelectLyricsSource = useCallback((offset: number, label: string) => { setLyricsOffset(offset); fetchLyrics(offset); showToast(\`Loading lyrics from ${label}...\`); }, [fetchLyrics, showToast])`, and pass `onSelectLyricsSource={handleSelectLyricsSource}` to `<LyricsTab />` (lines 997-1008).

**Unmount cleanup for `closeModal`** (lines 86, 902):
Add a `closeModalRef = useRef(closeModal)` and `useEffect(() => () => { closeModalRef.current?.(); }, [])` so `bigOpen` / `modalOpenListeners` never stays stuck `true` if SteamOS force-unmounts the modal.

---

### Test Files (`DeckifyOverlay.test.tsx`, `SettingsTab.test.tsx`, `index.test.tsx`, `tests/test_e2e_requirements.py`)

**Analog:** Each file extends its own existing test suite.
- `src/components/DeckifyOverlay.test.tsx` (lines 41-83): Uses custom `stateSlots`/`refSlots`/`effectSlots` hook mocks and `vi.useFakeTimers()`. Keep all hook calls in `DeckifyOverlay.tsx` unconditional and limited to `useState`, `useRef`, `useEffect`.
- `src/components/tabs/SettingsTab.test.tsx`: Extend with assertions for Overlay Lyrics toggle, Auto-Hide Duration slider (3–15), and Lyrics Latency Offset slider (-2000..2000).
- `src/index.test.tsx`: Extend with assertions for QAM Overlay Lyrics toggle, `modalOpenListeners` hiding `DeckifyOverlay` when modal opens, and conditional `get_lyrics` RPC gating.
- `tests/test_e2e_requirements.py`: Extend with backend tests for `DEFAULT_SETTINGS`, `_load_settings`, and `set_setting` validation/clamping of `overlay_lyrics_enabled`, `overlay_lyrics_offset_ms`, and `overlay_autohide_duration_s`.

## Shared Patterns

### Settings Validation & Clamping
**Source:** `py_modules/common.py` (lines 218-253) & `main.py` (lines 581-663)
**Apply to:** `py_modules/common.py`, `main.py`, `src/types.ts`
- All new settings keys MUST exist in `DEFAULT_SETTINGS` (`py_modules/common.py`), be sanitized/clamped in `_load_settings`, and be handled in `main.py:set_setting` (otherwise `set_setting` returns `{"ok": False, "error": "unknown setting: ..."}`).
- `set_setting` emits `settings_changed` with `dict(self._settings)` so `DeckifyOverlayWrapper` receives live updates without polling.

### SteamOS GamepadUI Horizontal Spatial Navigation
**Source:** `src/components/tabs/SettingsTab.tsx` (lines 606-621)
**Apply to:** `src/components/tabs/LyricsTab.tsx`
- Horizontal groups of focusable pills/buttons MUST be wrapped in `<Focusable flow-children="horizontal">` (never `flow-children="row"`).

### Overlay Input Safety & Hook Discipline
**Source:** `src/components/DeckifyOverlay.tsx` (lines 1, 99) & `src/components/DeckifyOverlay.test.tsx` (lines 41-83)
**Apply to:** `src/components/DeckifyOverlay.tsx`
- Root container MUST keep `pointerEvents: "none"`.
- Zero `setInterval` / `requestAnimationFrame` in `DeckifyOverlay.tsx` — discrete `setTimeout` only.
- Only use `useState`, `useRef`, `useEffect`, `useCallback`, `useMemo` (matching `DeckifyOverlay.test.tsx`'s mock).

## No Analog Found

None — all 12 files have direct in-repo analogs with exact or near-exact patterns.

## Metadata

**Analog search scope:** `py_modules/`, `main.py`, `src/`, `src/components/`, `src/components/tabs/`, `tests/`
**Files scanned:** 12
**Pattern extraction date:** 2026-11-15
