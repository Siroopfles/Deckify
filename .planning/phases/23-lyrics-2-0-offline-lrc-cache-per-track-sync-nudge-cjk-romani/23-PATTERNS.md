# Phase 23: Lyrics 2.0 — Offline .lrc Cache, Per-Track Sync Nudge & CJK Romanization - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 17 (6 new, 11 modified)
**Analogs found:** 15 / 17 (2 pure-Python CJK modules have no existing codebase analog and use `23-RESEARCH.md`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/lyrics_offsets.py` | store / service | file-I/O | `py_modules/resilience.py` (atomic JSON) & `py_modules/common.py` (`DECK_HOME`) | exact |
| `py_modules/romanize.py` | utility | transform | None (pure-Python CJK transliterator; use `23-RESEARCH.md` Pattern 3) | no-analog |
| `py_modules/cjk_tables.py` | config / data | transform | None (compact Kanji/Hanzi reading tables; use `23-RESEARCH.md` Pattern 3) | no-analog |
| `py_modules/common.py` | config | file-I/O | `py_modules/common.py` (self-analog: `overlay_lyrics_offset_ms` & `DECK_HOME`) | exact |
| `py_modules/spotify.py` | service | file-I/O + request-response | `py_modules/spotify.py` (self-analog: `_get_cached_lyrics` / `_fetch_netease_lyrics`) | exact |
| `py_modules/rpc_library.py` | controller (RPC) | request-response | `py_modules/rpc_library.py` (self-analog: `get_lyrics` & `_exec` wrapper) | exact |
| `main.py` | controller (RPC) | request-response + event-driven | `main.py` (self-analog: `set_setting`, `get_lyrics`, `decky.emit`) | exact |
| `src/types.ts` | config / types | — | `src/types.ts` (self-analog: `SyncedLine`, `PluginSettings`) | exact |
| `src/components/tabs/LyricsTab.tsx` | component | event-driven + CRUD | `src/components/tabs/LyricsTab.tsx` (self-analog) & `src/components/common/InteractiveRow.tsx` | exact |
| `src/components/DeckifyExpandedModal.tsx` | component / container | event-driven + request-response | `src/components/DeckifyExpandedModal.tsx` (self-analog: `fetchLyrics`, `useTriggerNavigation`) | exact |
| `src/components/DeckifyOverlay.tsx` | component | event-driven | `src/components/DeckifyOverlay.tsx` (self-analog: `lyricsOffsetMs` scheduling) | exact |
| `src/index.tsx` | provider / wrapper | event-driven | `src/index.tsx` (self-analog: `DeckifyOverlayWrapper` & `addEventListener`) | exact |
| `src/components/tabs/SettingsTab.tsx` | component | request-response | `src/components/tabs/SettingsTab.tsx` (self-analog: `overlay_lyrics_enabled` card) | exact |
| `tests/test_lyrics_2.py` | test | file-I/O + request-response | `tests/test_py_modules.py` | exact |
| `tests/test_romanize.py` | test | transform | `tests/test_py_modules.py` | role-match |
| `src/components/tabs/LyricsTab.test.tsx` | test | component | `src/components/DeckifyOverlay.test.tsx` | exact |
| `src/components/DeckifyOverlay.test.tsx` | test | component | `src/components/DeckifyOverlay.test.tsx` (self-analog) | exact |

---

## Pattern Assignments

### `py_modules/lyrics_offsets.py` (store / service, file-I/O)

**Analog:** `py_modules/resilience.py` (atomic JSON write) + `py_modules/common.py` (`DECK_HOME` resolution)

**`DECK_HOME` path resolution pattern** (`py_modules/common.py` lines 61-73):
```python
DECK_USER = getattr(decky, "DECKY_USER", None) or os.environ.get("USER", "deck")
DECK_UID = 1000
DECK_HOME = getattr(decky, "DECKY_USER_HOME", f"/home/{DECK_USER}")
if pwd:
    try:
        _pw = pwd.getpwnam(DECK_USER)
        DECK_UID = _pw.pw_uid
        DECK_HOME = _pw.pw_dir
    except Exception:
        pass
```
Use `LYRICS_OFFSETS_FILE = os.path.join(DECK_HOME, ".config", "deckify", "lyrics_offsets.json")` (D-10). Never use `os.path.expanduser("~")`.

**Atomic JSON write pattern** (`py_modules/resilience.py` lines 549-559):
```python
try:
    parent = os.path.dirname(self.bookmark_file)
    if parent:
        os.makedirs(parent, exist_ok=True)
    tmp_path = f"{self.bookmark_file}.{os.getpid()}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(bookmark, f, indent=2)
    os.replace(tmp_path, self.bookmark_file)
except OSError as e:
    decky.logger.warning("Failed to persist session bookmark to %s: %s", self.bookmark_file, e)
```
Apply this exact `os.makedirs(..., exist_ok=True)` + `{path}.{os.getpid()}.tmp` + `os.replace(tmp_path, path)` pattern for `lyrics_offsets.json`, clamping values to `[-10000, 10000]` and popping `0` entries (D-08, D-10).

---

### `py_modules/common.py` (config, file-I/O)

**Analog:** `py_modules/common.py` (in-place modification)

**Settings validation & clamping pattern** (`py_modules/common.py` lines 394-405):
```python
if not isinstance(merged.get("overlay_lyrics_enabled"), bool):
    merged["overlay_lyrics_enabled"] = bool(merged.get("overlay_lyrics_enabled", False))
try:
    merged["overlay_lyrics_offset_ms"] = max(-2000, min(2000, int(merged.get("overlay_lyrics_offset_ms", 0))))
except (TypeError, ValueError):
    merged["overlay_lyrics_offset_ms"] = 0
```
Copy this pattern for:
- `romanize_lyrics_enabled` (`bool`, default `False`)
- `romanize_display_style` (`"dual"` or `"romanized_only"`, default `"dual"`)
- `romanize_overlay_enabled` (`bool`, default `False`)

---

### `py_modules/spotify.py` (service, file-I/O + request-response)

**Analog:** `py_modules/spotify.py` (in-place modification)

**Cache directory & clear pattern** (`py_modules/spotify.py` lines 14, 145-158):
```python
LYRICS_CACHE_DIR = os.path.join(CACHE_DIR, "lyrics")
...
def _clear_lyrics_cache() -> None:
    """Clear in-memory and on-disk lyrics cache."""
    with _CACHE_LOCK:
        _LYRICS_CACHE.clear()
    if os.path.isdir(LYRICS_CACHE_DIR):
        try:
            for f in os.scandir(LYRICS_CACHE_DIR):
                if f.is_file() and f.name.endswith(".json"):
                    try:
                        os.remove(f.path)
                    except OSError:
                        pass
        except Exception:
            pass
```
Update `LYRICS_CACHE_DIR` to `os.path.join(DECK_HOME, ".cache", "deckify", "lyrics")` (D-01) and update `_clear_lyrics_cache()` to delete `.lrc` (and legacy `.json`) files. Replace `.json` read/write in `_get_cached_lyrics` / `_put_cached_lyrics` (lines 161-197) with `.lrc` lookup by `[{safe_track_id}].lrc` and atomic `.tmp` + `os.replace()` write.

**NetEase API fetch pattern** (`py_modules/spotify.py` lines 343-355):
```python
lyric_url = f"http://music.163.com/api/song/lyric?os=pc&id={song_id}&lv=-1&kv=-1&tv=-1"
l_req = urllib.request.Request(lyric_url, headers=headers)
with urllib.request.urlopen(l_req, timeout=3.5) as l_resp:
    l_data = json.loads(l_resp.read().decode("utf-8", errors="ignore"))

lrc_text = l_data.get("lrc", {}).get("lyric", "")
```
Append `&rv=-1` to `lyric_url` and extract `l_data.get("romalrc", {}).get("lyric", "")` alongside `lrc_text` (D-13).

---

### `py_modules/rpc_library.py` (controller / RPC, request-response)

**Analog:** `py_modules/rpc_library.py` lines 1034-1053

**RPC executor pattern** (`py_modules/rpc_library.py` lines 1034-1053):
```python
async def get_lyrics(
    plugin,
    track_name: str,
    artist_name: str,
    duration_sec: int = 0,
    provider_offset: int = 0,
) -> dict:
    """Fetch synchronized or plain lyrics using 5-tier waterfall with provider offset."""
    try:
        return await _exec(
            _fetch_lyrics_sync,
            track_name,
            artist_name,
            duration_sec,
            provider_offset,
            timeout=12,
        )
    except Exception as e:
        decky.logger.warning("get_lyrics failed: %s", e)
        return {"ok": False, "error": str(e)}
```
Keep `track_id: str = ""` and `force_refresh: bool = False` as trailing optional parameters so existing callers/tests remain compatible.

---

### `main.py` (controller / RPC, request-response + event-driven)

**Analog:** `main.py` lines 703-729, 934-938, 1053, 1401-1408

**Public settings keys & `set_setting` validation pattern** (`main.py` lines 712, 934-938, 1053):
```python
        elif key == "overlay_lyrics_offset_ms":
            try:
                value = max(-2000, min(2000, int(value)))
            except (TypeError, ValueError):
                return {"ok": False, "error": "overlay_lyrics_offset_ms must be an integer between -2000 and 2000"}
```
Add `romanize_lyrics_enabled`, `romanize_display_style`, and `romanize_overlay_enabled` to `public_keys` (line 712) and validate them in `set_setting` (which emits `decky.emit("settings_changed", public_settings)` at line 1053).

**Lyrics RPC & Event emission pattern** (`main.py` lines 1401-1408):
```python
    async def get_lyrics(
        self,
        track_name: str,
        artist_name: str,
        duration_sec: int = 0,
        provider_offset: int = 0,
    ) -> dict:
        return await rpc_library.get_lyrics(self, track_name, artist_name, duration_sec, provider_offset)
```
Add `get_track_lyrics_offset(self, track_id: str)`, `set_track_lyrics_offset(self, track_id: str, offset_ms: int)` (emitting `await decky.emit("lyrics_offset_changed", {"track_id": track_id, "offset_ms": clamped})`), and `clear_lyrics_cache(self)`.

---

### `src/types.ts` (config / types)

**Analog:** `src/types.ts` lines 130-133, 266-267

```ts
export interface SyncedLine {
  timeMs: number;
  text: string;
}
```
Extend `SyncedLine` with `romanized?: string;` and `PluginSettings` with `romanize_lyrics_enabled?: boolean;`, `romanize_display_style?: "dual" | "romanized_only";`, `romanize_overlay_enabled?: boolean;`.

---

### `src/components/tabs/LyricsTab.tsx` (component, event-driven + CRUD)

**Analog:** `src/components/tabs/LyricsTab.tsx` lines 52-119

**Horizontal `Focusable` pill row pattern** (`src/components/tabs/LyricsTab.tsx` lines 66-90):
```tsx
      <Focusable
        flow-children="horizontal"
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}
      >
        {LYRICS_SOURCES.map((src) => {
          const isActive = lyricsSource === src.label;
          return (
            <InteractiveRow
              key={src.offset}
              active={isActive}
              onClick={() => onSelectLyricsSource?.(src.offset, src.label)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                ...
              }}
            >
              {src.label}
            </InteractiveRow>
          );
        })}
      </Focusable>
```
Add a second `<Focusable flow-children="horizontal" ...>` toolbar row directly below `LYRICS_SOURCES` containing `[-0.5s]`, offset badge, `[+0.5s]`, `[Reset]`, `[Romanize]`, and `X -0.5s · Y +0.5s` hint (D-06, `23-UI-SPEC.md`). Extract the toolbar into a small sub-component to stay under `eslint.config.js` `max-lines-per-function` (80 lines).

---

### `src/components/DeckifyExpandedModal.tsx` (component / container, event-driven + request-response)

**Analog:** `src/components/DeckifyExpandedModal.tsx` lines 355-414, 865-909

**Lyrics fetch & offline preservation** (`src/components/DeckifyExpandedModal.tsx` lines 355-382):
Currently lines 372-378 wipe `setSyncedLyrics([])` on `!res.ok` or `catch`. Guard this when `syncedLyrics.length > 0 || plainLyrics` and `forceRefresh` / `offset > 0` so offline `"Try Next Source"` keeps cached lyrics visible and shows a toast (D-05).

**Gamepad `X`/`Y` shortcut interception** (`src/components/DeckifyExpandedModal.tsx` lines 871-905):
```tsx
        } else if (action === "Y") { // Gamepad Y button opens action menu
          if (focusedTrackRef.current || (modeRef.current !== "engine" && modeRef.current !== "devices")) {
            const isActiveTrackMode =
              modeRef.current === "now_playing" || modeRef.current === "lyrics";
```
Intercept `modeRef.current === "lyrics"` **first** for `"X"` (`-500ms`) and `"Y"` (`+500ms`) with `e?.preventDefault?.(); e?.stopPropagation?.();` before the Track Like / ActionModal branches (D-07).

---

### `src/components/DeckifyOverlay.tsx` (component, event-driven)

**Analog:** `src/components/DeckifyOverlay.tsx` lines 160-202, 342-365

**Live offset scheduling pattern** (`src/components/DeckifyOverlay.tsx` lines 160-183):
```tsx
    const clampedOffsetMs = Math.min(2000, Math.max(-2000, lyricsOffsetMs ?? 0));

    const scheduleNext = () => {
      const effectivePosMs =
        posAnchorRef.current.posMs +
        Math.max(0, Date.now() - posAnchorRef.current.atMs) +
        clampedOffsetMs;
```
Add `trackLyricsOffsetMs?: number` (clamped `[-10000, 10000]`) and subtract it from `effectivePosMs` (`+ clampedOffsetMs - clampedTrackOffsetMs`) so `+0.5s` shifts lyrics **later** (D-09) without breaking `lyricsOffsetMs` semantics. Include `trackLyricsOffsetMs` in the `useEffect` dependency array (lines 193-202).

---

### `src/index.tsx` (provider / wrapper, event-driven)

**Analog:** `src/index.tsx` lines 1934-1951

Pass `trackLyricsOffsetMs`, `romanizeOverlayEnabled={Boolean(settings?.romanize_overlay_enabled)}`, and `romanizeDisplayStyle={settings?.romanize_display_style || "dual"}` to `<DeckifyOverlay ... />` inside `DeckifyOverlayWrapper`, and subscribe to `"lyrics_offset_changed"` via `addEventListener` alongside `"settings_changed"`.

---

### `src/components/tabs/SettingsTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/SettingsTab.tsx` lines 1718-1760

**Settings card toggle pattern** (`src/components/tabs/SettingsTab.tsx` lines 1719-1732):
```tsx
            <InteractiveRow
              onClick={async () => {
                const cur = localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled ?? false;
                showToast(!cur ? "Overlay lyrics enabled" : "Overlay lyrics disabled");
                await updateSetting("overlay_lyrics_enabled", !cur);
              }}
              active={localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled}
              style={{ justifyContent: "space-between", marginTop: 8, marginBottom: 8 }}
            >
              <span style={{ fontSize: 13, fontWeight: 600 }}>Overlay Lyrics</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: (localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled) ? "var(--deckify-accent, #1DB954)" : "#888" }}>
                {(localSettings.overlay_lyrics_enabled ?? status?.settings?.overlay_lyrics_enabled) ? "ON" : "OFF"}
              </span>
            </InteractiveRow>
```
Place `Romanize CJK Lyrics` toggle, `Romanization Display` (`Dual-Line` / `Romanized Only` in `<Focusable flow-children="horizontal">`), `Romanize In-Game Overlay` toggle, and `Clear Lyrics Cache` `DialogButton` (`width: "auto"`, `minWidth: "auto"`) in this same card.

---

### `tests/test_lyrics_2.py` & `tests/test_romanize.py` (test, Python `unittest`)

**Analog:** `tests/test_py_modules.py` lines 14-31, 55-80

**Decky module mocking pattern** (`tests/test_py_modules.py` lines 14-30):
```python
with patch.dict("sys.modules", {"decky": SimpleNamespace(
    DECKY_PLUGIN_SETTINGS_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_DIR=tempfile.gettempdir(),
    DECKY_PLUGIN_RUNTIME_DIR=tempfile.gettempdir(),
    logger=Mock(),
    emit=AsyncMock(),
)}):
    from py_modules import (
        auth,
        common,
        ...
    )
```

---

### `src/components/tabs/LyricsTab.test.tsx` & `src/components/DeckifyOverlay.test.tsx` (test, Vitest)

**Analog:** `src/components/DeckifyOverlay.test.tsx` lines 1-80

**JSX runtime & React hook mock pattern** (`src/components/DeckifyOverlay.test.tsx` lines 4-24):
Uses `vi.mock("react/jsx-dev-runtime", ...)`, `vi.mock("react/jsx-runtime", ...)`, and `vi.mock("@decky/api", ...)` for lightweight Vitest component tree assertions without JSDOM overhead.

---

## Shared Patterns

### Atomic File Persistence
**Source:** `py_modules/resilience.py` lines 550-556
**Apply to:** `py_modules/lyrics_offsets.py` and `py_modules/spotify.py` (`.lrc` cache writes)
Write to a temporary file (`f"{target}.{os.getpid()}.tmp"`), then atomically swap with `os.replace(tmp_path, target)` inside `os.makedirs(parent, exist_ok=True)`.

### SteamOS User-Space Path Resolution (`DECK_HOME`)
**Source:** `py_modules/common.py` lines 61-70
**Apply to:** `py_modules/lyrics_offsets.py`, `py_modules/spotify.py`, `py_modules/common.py`
Always build user paths from `DECK_HOME` (`~/.cache/deckify/lyrics/` and `~/.config/deckify/lyrics_offsets.json`), never `os.path.expanduser("~")`.

### Horizontal Controller Navigation (`flow-children="horizontal"`)
**Source:** `src/components/tabs/LyricsTab.tsx` lines 66-70
**Apply to:** `src/components/tabs/LyricsTab.tsx` (nudge/romanize toolbar), `src/components/tabs/SettingsTab.tsx` (display style pills)
All horizontal button strips in GamepadUI MUST use `<Focusable flow-children="horizontal">` with `InteractiveRow` or `DialogButton` (`width: "auto"`, `minWidth: "auto"`).

### Structured RPC Error Handling
**Source:** `py_modules/rpc_library.py` lines 1034-1053
**Apply to:** `main.py` (`get_track_lyrics_offset`, `set_track_lyrics_offset`, `clear_lyrics_cache`), `py_modules/rpc_library.py` (`get_lyrics`)
Catch exceptions and return `{"ok": False, "error": str(e)}`, offloading blocking disk/network I/O via `_exec()`.

---

## No Analog Found

Files with no close match in the existing codebase (planner should use `23-RESEARCH.md` Pattern 3):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `py_modules/romanize.py` | utility | transform | No existing CJK transliteration or `romalrc` alignment module exists in `py_modules/` |
| `py_modules/cjk_tables.py` | config / data | transform | No existing Kanji/Hanzi reading lookup tables exist in `py_modules/` |

---

## Metadata

**Analog search scope:** `main.py`, `py_modules/`, `src/`, `tests/`
**Files scanned:** 12 source & test files
**Pattern extraction date:** 2026-11-22
