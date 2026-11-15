---
phase: 12-resolve-open-todos-polish
reviewed: 2026-11-15T20:25:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - main.py
  - py_modules/common.py
  - py_modules/rpc_library.py
  - py_modules/rpc_playback.py
  - py_modules/vdf_parser.py
  - src/types.ts
  - src/index.tsx
  - src/components/DeckifyOverlay.tsx
  - src/components/DeckifyExpandedModal.tsx
  - src/components/common/InteractiveRow.tsx
  - src/components/common/Sidebar.tsx
  - src/components/tabs/NowPlayingTab.tsx
  - src/components/tabs/PlaylistsTab.tsx
  - src/components/tabs/PodcastsTab.tsx
  - src/components/tabs/SettingsTab.tsx
findings:
  critical: 0
  warning: 6
  info: 2
  total: 8
  necessity: 0
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-11-15T20:25:00Z
**Depth:** standard
**Files Reviewed:** 15 (changed across `12-01`, `12-02`, and `12-03`)
**Status:** issues_found

## Summary

Reviewed the Phase 12 (`12-01`, `12-02`, `12-03`) Python backend and TypeScript/React frontend changes. No critical security vulnerabilities or data-loss bugs were found. Six warnings were identified: playback retry error reporting (`rpc_playback.py`), playlist item null-safety (`rpc_library.py`), toast notification async race/ID handling (`src/index.tsx`), engine auto-wake backend gating (`rpc_playback.py`), `PodcastsTab` followed-shows flex-row collapse parity (`PodcastsTab.tsx`), and `get_saved_episodes` null-`items` safety (`rpc_library.py`). Two info items were identified for unhandled RPC rejections in `SettingsTab.tsx` and inactive-track state on the `NowPlayingTab` Add to Playlist button.

## Warnings

### WR-01: `play_tracks` returns `{"ok": True}` when retry `me/player/play` fails after auto-transfer (Medium)

**File:** `py_modules/rpc_playback.py:381-388`
**Issue:** After `transfer_res = await plugin._auto_transfer_and_play(token)` succeeds (`transfer_res.get("ok")` is `True`), the retry `await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)` is wrapped in `try ... except Exception: pass`. If that `PUT me/player/play` fails, execution falls through to `return transfer_res`, which reports `{"ok": True}` to the frontend (`DeckifyExpandedModal.tsx:471-475`), showing `"Playback started"` even though the requested track/context failed to start.
**Fix:**
```python
            if transfer_res.get("ok") and body:
                try:
                    await asyncio.sleep(0.5)
                    await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                    return {"ok": True}
                except urllib.error.HTTPError as retry_err:
                    return {"ok": False, "error": _parse_spotify_error(retry_err)}
                except Exception as retry_err:
                    return {"ok": False, "error": str(retry_err)}
            return transfer_res
```

### WR-02: `get_playlist_tracks` crashes with `AttributeError` on `null` items or `null` `album` fields (Medium)

**File:** `py_modules/rpc_library.py:107-136`
**Issue:** Line 108 uses `data.get("items") if "items" in data else data.get("tracks")`, which does not fall back to `tracks` if `data["items"]` is `None`. More importantly, lines 123–135 call `item.get(...)` and `t.get("album", {}).get(...)` without checking that `item` is a `dict` or that `t.get("album")` is non-`None`. Spotify playlist responses can contain `null` entries or `album: null` (local files/episodes), which raises `AttributeError` and fails the entire playlist load.
**Fix:**
```python
            items_obj = (
                (data.get("items") if data.get("items") is not None else data.get("tracks"))
                if isinstance(data, dict)
                else []
            )
            ...
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                t = item.get("item") or item.get("track")
                if not isinstance(t, dict):
                    continue
                album = t.get("album") if isinstance(t.get("album"), dict) else {}
                images = album.get("images") or []
```

### WR-03: `track_metadata` toast handler has an async race on rapid skips and suppresses empty/missing `track_id` (Medium)

**File:** `src/index.tsx:1084-1100`
**Issue:** `lastToastTrackId = meta.track_id` is set before `await backendGetStatus()` and `await fetchWithQueueAndCache(artwork)`. During rapid track skips (Track A -> Track B), Track A's image fetch can resolve after Track B's toast, displaying Track A's stale notification out of order. Additionally, if `meta.track_id` is `""` or `undefined`, `meta.track_id === lastToastTrackId` suppresses the first empty-ID track or all subsequent tracks lacking `track_id`.
**Fix:**
```tsx
    const trackKey = meta.track_id || `${meta.name}::${meta.artist || ""}`;
    if (trackKey === lastToastTrackId) return;
    lastToastTrackId = trackKey;
    try {
      const curStatus = await backendGetStatus().catch(() => null);
      if (trackKey !== lastToastTrackId) return;
      if (curStatus?.settings?.toast_enabled === false) return;
      ...
      // after await fetchWithQueueAndCache(artwork):
      if (trackKey !== lastToastTrackId) return;
```

### WR-04: `quick_play_pinned` calls `start_librespot()` without checking `audio_backend` (Low)

**File:** `py_modules/rpc_playback.py:436-443`
**Issue:** Unlike `play_tracks` (`py_modules/rpc_playback.py:370`), `quick_play_pinned` invokes `await plugin.start_librespot()` whenever `not plugin._is_engine_running()` without verifying `audio_backend == "librespot"`. Users configured with `audio_backend = "spotify_client"` will have `librespot` started unexpectedly on quick-play.
**Fix:** Gate the auto-wake block on `getattr(plugin, "_settings", {}).get("audio_backend", "librespot") == "librespot"`.

### WR-05: `PodcastsTab` Followed Podcasts (`savedShows`) rows lack `flexShrink: 0` and `minWidth: 0` (Low, Plan 12-03)

**File:** `src/components/tabs/PodcastsTab.tsx:31-51`
**Issue:** Commit `b573d55` added `flexShrink: 0` (on `InteractiveRow`, `DeckifyImage`, `FaPodcast`) and `minWidth: 0` (on the `flex: 1` text container) to the Saved Episodes list (`lines 77-84`) to prevent row collapse and text truncation failure in flex-column layouts, but left the `Followed Podcasts` (`savedShows`) list immediately above it (`lines 31-51`) without `flexShrink: 0` or `minWidth: 0`. Long show titles or overflowing show lists can still collapse or clip improperly.
**Fix:**
```tsx
              <InteractiveRow
                key={s.id}
                data-deckify-list-item="true"
                data-deckify-label={s.name || ""}
                onClick={() => onPlayTrack(s.uri)}
                style={{ gap: 12, flexShrink: 0 }}
              >
                {s.image_url ? (
                  <DeckifyImage src={s.image_url} width={38} height={38} style={{ borderRadius: 6, flexShrink: 0 }} />
                ) : (
                  <FaPodcast size={20} color="#888" style={{ flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
```

### WR-06: `get_saved_episodes` raises `TypeError` when `data["items"]` is `None` (Low, Plan 12-03)

**File:** `py_modules/rpc_library.py:500-523`
**Issue:** `items = data.get("items", []) if data else []` returns `None` if Spotify responds with `{"items": None}`, causing `for item in items:` to raise `TypeError: 'NoneType' object is not iterable`. Similarly, `total = data.get("total", 0) if data else 0` returns `None` if `"total": null`, and `resume_point = ep.get("resume_point") or {}` is not guarded with `isinstance(resume_point, dict)`.
**Fix:**
```python
        items = (data.get("items") or []) if isinstance(data, dict) else []
        ...
            resume_point = ep.get("resume_point")
            if not isinstance(resume_point, dict):
                resume_point = {}
        ...
        total = (data.get("total") or 0) if isinstance(data, dict) else 0
```

## Info

### IN-01: `SettingsTab` slider `updateSetting` and `toast_sound_enabled` toggle lack `try/catch` (Low)

**File:** `src/components/tabs/SettingsTab.tsx:78-85, 761-766`
**Issue:** `updateSetting` and the `toast_sound_enabled` `onClick` handler await `backendSetSetting(...)` without `try/catch`, leaving failed RPC calls as unhandled promise rejections.
**Fix:** Wrap `await backendSetSetting(...)` in `try/catch` and call `showToast("Failed to save setting")` on error.

### IN-02: `NowPlayingTab` "Add to Playlist" `RoundBtn` is a silent no-op when no track is active (Low, Plan 12-03)

**File:** `src/components/tabs/NowPlayingTab.tsx:271-277`
**Issue:** When `track` is undefined (no active playback), the `Add to Playlist` `RoundBtn` remains rendered and focusable, silently doing nothing on `onClick` (`() => track && onOpenActions?.(track as TrackItem)`).
**Fix:** Omit the button when `!track`, or disable/dim it visually and show a toast if activated without an active track.

---

_Reviewed: 2026-11-15T20:25:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
