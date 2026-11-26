# Phase 28: CDP Offline Downloads, Wi-Fi Travel Mode & Living Room Spotify Jam - Pattern Map

**Mapped:** 2026-11-26
**Files analyzed:** 24
**Analogs found:** 24 / 24

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `py_modules/cdp_bridge.py` | service | request-response | `py_modules/cdp_bridge.py` (lines 74-145) | exact |
| `py_modules/resilience.py` | service | event-driven | `py_modules/resilience.py` (lines 680-717) | exact |
| `py_modules/common.py` | utility / config | file-I/O | `py_modules/common.py` (lines 53-120) | exact |
| `py_modules/engine.py` | service | file-I/O / process | `py_modules/engine.py` (lines 14-52) | exact |
| `py_modules/rpc_library.py` | service | CRUD / request-response | `py_modules/rpc_library.py` (lines 60-90) | exact |
| `main.py` | controller | request-response | `main.py` (lines 1580-1609) | exact |
| `src/types.ts` | model | transform | `src/types.ts` (lines 1-90) | exact |
| `src/components/common/JamQrModal.tsx` | component | request-response | `src/components/common/CollectionActionModal.tsx` (lines 76-140) + `src/index.tsx` (lines 1485-1489) | exact |
| `src/index.tsx` | component | event-driven / request-response | `src/index.tsx` (lines 1056-1095, 1322-1445) | exact |
| `src/components/DeckifyExpandedModal.tsx` | component | event-driven / request-response | `src/components/DeckifyExpandedModal.tsx` (lines 255-261, 1548-1585) | exact |
| `src/components/common/CollectionActionModal.tsx` | component | request-response | `src/components/common/CollectionActionModal.tsx` (lines 76-140) | exact |
| `src/components/tabs/PlaylistsTab.tsx` | component | CRUD | `src/components/tabs/PlaylistsTab.tsx` (lines 31-85) | exact |
| `src/components/tabs/AlbumsTab.tsx` | component | CRUD | `src/components/tabs/PlaylistsTab.tsx` (lines 31-85) | role-match |
| `src/components/tabs/PodcastsTab.tsx` | component | CRUD | `src/components/tabs/PodcastsTab.tsx` (lines 26-65) | exact |
| `src/components/tabs/LikedSongsTab.tsx` | component | CRUD | `src/components/tabs/PlaylistsTab.tsx` (lines 31-70) | role-match |
| `src/components/tabs/LyricsTab.tsx` | component | request-response | `src/components/tabs/LyricsTab.tsx` (lines 7-50) | exact |
| `src/components/tabs/DiscoveryTab.tsx` | component | request-response | `src/components/tabs/DiscoveryTab.tsx` (lines 18-50) | exact |
| `src/components/tabs/SearchTab.tsx` | component | request-response | `src/components/tabs/DiscoveryTab.tsx` (lines 18-50) | role-match |
| `src/components/tabs/NowPlayingTab.tsx` | component | event-driven / request-response | `src/components/tabs/NowPlayingTab.tsx` (lines 24-85) | exact |
| `src/components/tabs/DevicesTab.tsx` | component | request-response | `src/components/tabs/NowPlayingTab.tsx` (lines 24-40) | role-match |
| `src/components/tabs/SettingsTab.tsx` | component | CRUD / config | `src/components/tabs/SettingsTab.tsx` (lines 43-85) | exact |
| `tests/test_offline_downloads.py` | test | unit | `tests/test_cdp_bridge.py` (lines 1-45) | exact |
| `tests/test_travel_mode.py` | test | unit | `tests/test_cdp_bridge.py` (lines 1-45) | role-match |
| `src/components/common/JamQrModal.test.tsx` | test | unit | `src/components/common/TrackActionModal.test.tsx` (lines 1-45) | exact |

---

## Pattern Assignments

### `py_modules/cdp_bridge.py` (service, request-response)

**Analog:** `py_modules/cdp_bridge.py` (self-extension)

**Atomic disk cache pattern** (lines 74-104):
```python
def load_discovery_mixes_cache(cache_file: str | None = None) -> dict:
    """Load persisted discovery mixes cache from disk, returning {} on missing/corrupt data."""
    target = cache_file or DISCOVERY_MIXES_CACHE_FILE
    if not os.path.exists(target):
        return {}
    try:
        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}
```
Copy this atomic `.tmp` + `os.replace` pattern for `offline_downloads.json` (`~/.cache/deckify/offline_downloads.json`) so Travel Mode filtering works even when `spotify_client` is stopped.

**Registry evaluation pattern** (lines 107-136):
```python
def evaluate_with_registry(
    body_js: str,
    port: int = SPOTIFY_CDP_PORT,
    timeout: float = DEFAULT_CDP_TIMEOUT,
    eval_fn=None,
) -> dict:
    """Evaluate a JS body with cached Platform.Registry preamble and clean error fallback."""
```
Use `getService('OfflineAPI')` / `getService('PlaylistAPI')` / `getService('SocialConnectAPI')` / `getService('JamDevicesAPI')` inside `body_js` with `typeof ... === 'function'` guards and `{ ok: false, error: ... }` fallbacks.

---

### `py_modules/resilience.py` (service, event-driven)

**Analog:** `py_modules/resilience.py` (self-extension)

**Wi-Fi drop & wake recovery pattern** (lines 680-716):
```python
    async def on_poll_network_result(self, ok: bool) -> dict | None:
        """Buffer-aware 4s Wi-Fi drop detector (D-02)."""
        now_mono = time.monotonic()
        if not ok:
            if self._wifi_drop_started_at is None:
                self._wifi_drop_started_at = now_mono
            elif (now_mono - self._wifi_drop_started_at) >= self.wifi_grace_s and not self._network_lost_session:
                self._network_lost_session = True
                self.flush_snapshot()
            return None
```
Extend `on_poll_network_result` with a `WAKE_GRACE_WINDOW_S = 10.0` check against `self._last_recovery_ts` before auto-enabling Travel Mode (`travel_mode_enabled = True`, keeping `travel_mode_manual = False`), and auto-exiting on `ok=True` only when `not travel_mode_manual`. Emit `travel_mode_changed` via `decky.emit`.

---

### `py_modules/common.py` (utility / config, file-I/O)

**Analog:** `py_modules/common.py` (self-extension)

**Constants & `DEFAULT_SETTINGS` pattern** (lines 57-120):
```python
SPOTIFY_FLATPAK_ID = "com.spotify.Client"
SPOTIFY_CDP_PORT = 9229
...
SPOTIFY_CLIENT_CONFIG_DIR = os.path.join(DECK_HOME, ".var", "app", SPOTIFY_FLATPAK_ID, "config", "spotify")
SPOTIFY_CLIENT_CACHE_DIR = os.path.join(DECK_HOME, ".var", "app", SPOTIFY_FLATPAK_ID, "cache", "spotify")
```
Add `travel_mode_enabled: False`, `travel_mode_manual: False`, `travel_mode_auto_enabled: True`, `offline_min_free_gb: 3.0`, and `offline_storage_path: SPOTIFY_CLIENT_CACHE_DIR` to `DEFAULT_SETTINGS`. Add `get_disk_free_bytes(path: str) -> int` using `os.statvfs(target).f_bavail * st.f_frsize` on POSIX with `shutil.disk_usage(target).free` fallback on Windows.

---

### `py_modules/engine.py` (service, file-I/O / process)

**Analog:** `py_modules/engine.py` (self-extension)

**Spotify `prefs` & subprocess pattern** (lines 14-51):
```python
def _update_spotify_prefs_content(
    existing_text: str,
    audio_quality: str,
    gapless: bool = True,
    normalisation: bool = True,
    crossfade_seconds: int = 0,
) -> str:
```
Use `_build_deck_command(["flatpak", "override", "--user", f"--filesystem={abspath}", SPOTIFY_FLATPAK_ID])` (list-form args, no `shell=True`, `LD_LIBRARY_PATH` stripped) inside `_exec(...)`, validate writeability before persisting `offline_storage_path`, and update `prefs` / `Storage` symlink cleanly.

---

### `main.py` (controller, request-response)

**Analog:** `main.py` (lines 1580-1609)

**RPC delegation pattern**:
```python
    async def play_tracks(
        self,
        context_uri: str | None = None,
        offset_uri: str | None = None,
        uris: list | None = None,
        position: int = 0,
        position_ms: int | None = None,
    ) -> dict:
        return await rpc_playback.play_tracks(self, context_uri, offset_uri, uris, position, position_ms)
```
Expose `toggle_offline_download`, `get_offline_status`, `get_offline_downloads_list`, `remove_all_offline_downloads`, `set_offline_storage_path`, `set_travel_mode`, `start_spotify_jam`, `get_jam_status`, and `end_spotify_jam` as thin `async def` methods on `Plugin` delegating to `py_modules` and running blocking disk/CDP work in `await _exec(...)`.

---

### `src/components/common/JamQrModal.tsx` (component, request-response)

**Analog:** `src/components/common/CollectionActionModal.tsx` (lines 76-140) + `src/index.tsx` (lines 1485-1489)

**Modal focus-trap & restoration pattern** (`CollectionActionModal.tsx` lines 86-100):
```tsx
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const rafId = requestAnimationFrame(() => {
      const target = modalContainerRef.current?.querySelector('[tabindex="0"]') as HTMLElement | null;
      target?.focus?.();
    });
    return () => {
      cancelAnimationFrame(rafId);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, []);
```

**High-contrast `QRCodeSVG` quiet-zone pattern** (`src/index.tsx` lines 1485-1489):
```tsx
<div style={{ display: "inline-block", padding: 8, background: "#fff", borderRadius: 8 }}>
  <QRCodeSVG value={qrUrl} size={140} />
</div>
```
Export both `<JamQrCard>` (for Phase 29 `TvSplitView` reuse) and `<JamQrModal>` (with `InteractiveRow` **"End Jam"** / **"Leave Jam"** / **"Close"** controls and `librespot` deep-link fallback + 1-click **"Switch to Spotify Client & Start Jam"** button).

---

### `src/components/DeckifyExpandedModal.tsx` (component, event-driven / request-response)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (lines 255-261, 1548-1585)

**Hook slot stability** (lines 256-260):
```tsx
  const [isCrudModalOpen, setIsCrudModalOpen] = useState(false);
  const [pendingEditPlaylist, setPendingEditPlaylist] = useState<PlaylistItem | null>(null);
  const [pendingDeletePlaylist, setPendingDeletePlaylist] = useState<PlaylistItem | null>(null);
```
Append any new `useState` hooks (`travelModeEnabled`, `jamModalOpen`, `pendingEngineSwitchDownload`, etc.) strictly **after** `pendingDeletePlaylist` at line 260.

**`vgp_oncancel` modal guard pattern** (lines 1552-1578):
```tsx
    el.addEventListener("vgp_oncancel", (e: Event) => {
      if (typeof grabCancelRef.current === "function" && grabCancelRef.current()) {
        e.preventDefault();
        e.stopPropagation();
        (e as unknown as { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.();
        return;
      }
      if (isCrudModalOpenRef.current) { ... }
      if (actionTrackRef.current) { ... }
      if (actionCollectionRef.current) { ... }
```
Add matching `Ref` guards for `jamModalOpenRef` and `engineSwitchDownloadRef` before `navigationHistoryRef` so pressing `B` closes the active sub-modal instead of the entire `DeckifyExpandedModal`.

---

### `src/components/tabs/PodcastsTab.tsx`, `PlaylistsTab.tsx`, `AlbumsTab.tsx`, `LikedSongsTab.tsx` (component, CRUD)

**Analog:** `src/components/tabs/PodcastsTab.tsx` (lines 26-52) & `src/components/tabs/PlaylistsTab.tsx` (lines 31-85)

**Horizontal pill/button bar pattern** (`PodcastsTab.tsx` lines 30-51):
```tsx
  <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
    {FILTER_OPTIONS.map((opt) => {
      const isActive = activeFilter === opt.key;
      return (
        <DialogButton
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            width: "auto",
            minWidth: "auto",
            minHeight: 36,
            padding: "4px 16px",
```
Use `flow-children="horizontal"` and `width: "auto"` / `flexShrink: 0` on all detail header *"Download for Offline"* buttons, Travel Mode banner *"Exit Travel Mode"* buttons, and *"Jam Active"* / *"Start Jam"* pills.

---

### `tests/test_offline_downloads.py` & `tests/test_travel_mode.py` (test, unit)

**Analog:** `tests/test_cdp_bridge.py` (lines 1-45)

**Python `unittest` setup pattern** (lines 1-14):
```python
import json
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.dirname(__file__))
from test_token_refresh import main  # noqa: F401
from py_modules import cdp_bridge, engine
```
Use `SimpleNamespace` + `MagicMock` + `patch` for `os.statvfs` / `get_disk_free_bytes`, `subprocess.run` (`flatpak override`), and `eval_fn` CDP mocks.

---

### `src/components/common/JamQrModal.test.tsx` (test, unit)

**Analog:** `src/components/common/TrackActionModal.test.tsx` (lines 1-45)

**Vitest + Decky UI mock pattern** (lines 1-32):
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@decky/ui", () => ({
  Focusable: ({ children, ...props }: any) => ({ type: "Focusable", props: { children, ...props } }),
  TextField: (props: any) => ({ type: "TextField", props }),
}));

vi.mock("./InteractiveRow", () => ({
  InteractiveRow: ({ children, ...props }: any) => ({ type: "InteractiveRow", props: { children, ...props } }),
}));
```
Mock `qrcode.react` (`QRCodeSVG`) alongside `@decky/ui` and `react-icons/fa` to assert quiet-zone container styling, `librespot` deep-link fallback, and focus restoration.

---

## Shared Patterns

### Blocking I/O & Subprocess Offloading
**Source:** `py_modules/common.py` (`_exec`, `_build_deck_command`), `py_modules/engine.py`
**Apply to:** `main.py`, `py_modules/cdp_bridge.py`, `py_modules/engine.py`
All `os.statvfs`, `os.access`, `flatpak override` subprocess calls, and CDP WebSocket evaluations must execute inside `await _exec(...)` with `LD_LIBRARY_PATH` stripped and list-form subprocess arguments.

### GamepadUI Focus & Modal Cancellation
**Source:** `src/components/common/CollectionActionModal.tsx` (lines 86-100), `src/components/DeckifyExpandedModal.tsx` (lines 1552-1578)
**Apply to:** `JamQrModal.tsx`, `CollectionActionModal.tsx`, `SettingsTab.tsx`, `DeckifyExpandedModal.tsx`
All modals save `document.activeElement` on mount, focus `[tabindex="0"]` via `requestAnimationFrame`, restore focus on unmount, and register a `Ref` check in `DeckifyExpandedModal`'s `vgp_oncancel` listener.

### Horizontal Control Bars
**Source:** `src/components/tabs/PodcastsTab.tsx` (lines 30-51)
**Apply to:** `PlaylistsTab.tsx`, `AlbumsTab.tsx`, `PodcastsTab.tsx`, `LikedSongsTab.tsx`, `NowPlayingTab.tsx`, `DevicesTab.tsx`, `DeckifyExpandedModal.tsx`
Every horizontal row of buttons or pills uses `<Focusable flow-children="horizontal">` and `width: "auto"` / `flexShrink: 0` on `DialogButton`s.

## No Analog Found

None — all 24 files have exact or strong role-match analogs in the existing codebase.

## Metadata

**Analog search scope:** `main.py`, `py_modules/`, `src/`, `tests/`
**Files scanned:** 12 (all verified via `git ls-files`)
**Pattern extraction date:** 2026-11-26
