# Phase 4: Queue Navigation & Live State Synchronization - Pattern Map

**Mapped:** 2026-11-11  
**Files analyzed:** 7  
**Analogs found:** 7 / 7  

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/components/tabs/QueueTab.tsx` | component | request-response | `src/components/tabs/NowPlayingTab.tsx` & `src/components/tabs/LikedSongsTab.tsx` | exact (refactor) |
| `src/components/DeckifyExpandedModal.tsx` | component / controller | request-response / event-driven | `src/components/DeckifyExpandedModal.tsx` & `src/hooks/usePlaybackStatus.ts` | exact (enhancement) |
| `main.py` | controller / route | request-response | `main.py` (lines 763–770) | exact (alias wiring) |
| `py_modules/rpc_playback.py` | service | request-response | `py_modules/rpc_playback.py` (lines 239–367) | exact |
| `src/components/tabs/QueueTab.test.tsx` | test | event-driven | `src/components/common/DeckifyImage.test.ts` & `src/hooks/usePlaybackClock.test.ts` | role-match |
| `tests/test_plugin_api.py` | test | request-response | `tests/test_plugin_api.py` (lines 99–135, 397–420) | exact |
| `tests/test_e2e_requirements.py` | test | request-response | `tests/test_e2e_requirements.py` (lines 575–621) | exact |

---

## Pattern Assignments

### `src/components/tabs/QueueTab.tsx` (component, request-response)

**Analog:** `src/components/tabs/NowPlayingTab.tsx` (for Now Playing card visual hierarchy & active badge), `src/components/tabs/LikedSongsTab.tsx` (for list header & column layout), and `src/components/common/InteractiveRow.tsx` (for focusable items).

**Imports pattern** (copy from [src/components/tabs/NowPlayingTab.tsx:1-20](file:///C:/Users/djdje/Deckify/src/components/tabs/NowPlayingTab.tsx#L1-L20) and [src/components/tabs/QueueTab.tsx:1-7](file:///C:/Users/djdje/Deckify/src/components/tabs/QueueTab.tsx#L1-L7)):
```typescript
import { FC, useState } from "react";
import { Focusable } from "@decky/ui";
import { FaHeart, FaRegHeart, FaSpotify, FaMusic } from "react-icons/fa";
import { StatusResponse, TrackItem, TrackMeta } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, formatMs, focusHalo } from "../common/InteractiveRow";
```

**Props interface pattern** (extends existing `QueueTabProps` with `currentlyPlaying` and optimistic play handler):
```typescript
export interface QueueTabProps {
  queueTracks: TrackItem[];
  currentlyPlaying?: TrackItem | TrackMeta | null;
  isPlaying?: boolean;
  handlePlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  handlePlayQueueTrack?: (clickedTrack: TrackItem, idx: number) => void;
  handleToggleLike: (trackId?: string) => void;
  onFocusTrack?: (track: TrackItem) => void;
  onOpenActions?: (track: TrackItem) => void;
}
```

**Now Playing Card pattern** (copy visual elevation and badge styling from [src/components/tabs/NowPlayingTab.tsx:75-126](file:///C:/Users/djdje/Deckify/src/components/tabs/NowPlayingTab.tsx#L75-L126)):
```typescript
{/* Dedicated Now Playing Card [D-02] */}
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px",
    borderRadius: 10,
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    marginBottom: 20,
  }}
>
  {nowArtwork ? (
    <DeckifyImage
      src={nowArtwork}
      width={48}
      height={48}
      style={{ borderRadius: 6, flexShrink: 0 }}
    />
  ) : (
    <div
      style={{
        width: 48,
        height: 48,
        borderRadius: 6,
        background: "#222",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <FaSpotify size={24} color="#1db954" />
    </div>
  )}
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
      <span
        style={{
          background: isPlaying ? "rgba(29, 185, 84, 0.2)" : "rgba(255, 255, 255, 0.1)",
          border: isPlaying ? "1px solid #1db954" : "1px solid rgba(255, 255, 255, 0.2)",
          color: isPlaying ? "#1db954" : "#aaa",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: 0.5,
        }}
      >
        {isPlaying ? "NOW PLAYING" : "CURRENT TRACK"}
      </span>
    </div>
    <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {currentlyPlaying?.name || "No track playing"}
    </div>
    <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {currentlyPlaying?.artist || "—"}
    </div>
  </div>
  {currentlyPlaying?.duration_ms ? (
    <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(currentlyPlaying.duration_ms)}</span>
  ) : null}
</div>
```

**Numbered Upcoming List & Focus Preservation pattern** (copy from [src/components/tabs/QueueTab.tsx:29-67](file:///C:/Users/djdje/Deckify/src/components/tabs/QueueTab.tsx#L29-L67) and [src/components/common/InteractiveRow.tsx:91-135](file:///C:/Users/djdje/Deckify/src/components/common/InteractiveRow.tsx#L91-L135)):
```typescript
{/* Next in Queue Header */}
<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
  <span style={{ fontSize: 13, fontWeight: 700, opacity: 0.6, letterSpacing: 0.5, textTransform: "uppercase" }}>
    Next in Queue ({queueTracks.length})
  </span>
</div>

{queueTracks.length === 0 ? (
  <div style={{ textAlign: "center", padding: "40px 20px", opacity: 0.6 }}>
    Queue is empty. Add songs from your library or search.
  </div>
) : (
  <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
    {queueTracks.slice(0, 40).map((t, idx) => (
      <InteractiveRow
        key={t.id || t.uri || idx}
        onClick={() => {
          if (handlePlayQueueTrack) {
            handlePlayQueueTrack(t, idx);
          } else if (t.uri) {
            const remaining = queueTracks.slice(idx).map((x) => x.uri).filter(Boolean) as string[];
            handlePlayTrack(t.uri, undefined, remaining, 0);
          }
        }}
        onFocus={() => onFocusTrack?.(t)}
        style={{ gap: 12 }}
      >
        <span style={{ width: 22, fontSize: 12, opacity: 0.5 }}>{idx + 1}</span>
        {(t.artwork_url || t.image_url) && (
          <DeckifyImage
            src={t.artwork_url || t.image_url || undefined}
            width={32}
            height={32}
            style={{ borderRadius: 4 }}
          />
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
          <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.artist}</div>
        </div>
        <span
          onClick={(e) => {
            e.stopPropagation();
            if (t.id) handleToggleLike(t.id);
          }}
          style={{ cursor: "pointer", padding: "4px 6px" }}
        >
          {t.is_liked ? <FaHeart size={13} color="#1db954" /> : <FaRegHeart size={13} color="#777" />}
        </span>
        <span style={{ fontSize: 12, opacity: 0.5 }}>{formatMs(t.duration_ms || 0)}</span>
      </InteractiveRow>
    ))}
  </Focusable>
)}
```

---

### `src/components/DeckifyExpandedModal.tsx` (component / controller, request-response & event-driven)

**Analog:** `src/components/DeckifyExpandedModal.tsx` (existing modal) and `src/hooks/usePlaybackStatus.ts` (polling & clock coordination).

**RPC Callable Binding Correction** (replace line 48 in [src/components/DeckifyExpandedModal.tsx:48](file:///C:/Users/djdje/Deckify/src/components/DeckifyExpandedModal.tsx#L48)):
```typescript
// Fixed: bind to "play_tracks" matching backend main.py Plugin.play_tracks
const backendPlayTracks = callable<
  [string | null, string | null, string[] | null, number],
  { ok: boolean; error?: string }
>("play_tracks");
```

**Optimistic Slicing and Delayed Resynchronization pattern** (replaces lines 386–398 in [src/components/DeckifyExpandedModal.tsx:386-398](file:///C:/Users/djdje/Deckify/src/components/DeckifyExpandedModal.tsx#L386-L398)):
```typescript
const handlePlayQueueTrack = useCallback(async (clickedTrack: TrackItem, idx: number) => {
  // 1. Immediate optimistic UI update [D-03]
  const remaining = queueTracks.slice(idx + 1);
  setQueueTracks(remaining);
  if (status) {
    setStatus({
      ...status,
      track: {
        ...status.track,
        name: clickedTrack.name || "",
        artist: clickedTrack.artist || "",
        album: clickedTrack.album || "",
        artwork_url: clickedTrack.artwork_url || clickedTrack.image_url,
        image_url: clickedTrack.artwork_url || clickedTrack.image_url,
        duration_ms: clickedTrack.duration_ms || 0,
        uri: clickedTrack.uri,
        track_id: clickedTrack.id || (clickedTrack as any).track_id,
        id: clickedTrack.id || (clickedTrack as any).track_id,
        is_liked: clickedTrack.is_liked,
      },
      is_playing: true,
      position_ms: 0,
    });
  }

  // 2. Playback RPC call with explicit URI sequence starting at clicked track [D-01]
  const uris = queueTracks.slice(idx).map((x) => x.uri).filter(Boolean) as string[];
  try {
    const res = await backendPlayTracks(null, null, uris, 0);
    if (!res.ok) {
      showToast(res.error || "Failed to start queue track");
    } else {
      showToast("Playback started");
    }
  } catch (err: any) {
    showToast(err?.message || "Playback error");
  }
  refreshStatus();

  // 3. Delayed canonical resync after Spotify's distributed queue pointer settles [D-03]
  setTimeout(async () => {
    await loadQueue();
    await refreshStatus();
  }, 600);
}, [queueTracks, status, showToast, refreshStatus, loadQueue]);
```

**Conservative 10-Second Polling while Queue Tab is Active** (copy from [src/hooks/usePlaybackStatus.ts:39-43](file:///C:/Users/djdje/Deckify/src/hooks/usePlaybackStatus.ts#L39-L43)):
```typescript
useEffect(() => {
  if (mode !== "queue") return;
  loadQueue();
  const pollInterval = setInterval(() => {
    loadQueue();
  }, 10000); // 10s conservative poll to respect rate limits [D-05]
  return () => clearInterval(pollInterval);
}, [mode, loadQueue]);
```

**Passing Props to QueueTab** (in `DeckifyExpandedModal.tsx` tab switch):
```typescript
{mode === "queue" && (
  <QueueTab
    queueTracks={queueTracks}
    currentlyPlaying={status?.track_meta || status?.track}
    isPlaying={Boolean(status?.is_playing)}
    handlePlayTrack={handlePlayTrack}
    handlePlayQueueTrack={handlePlayQueueTrack}
    handleToggleLike={handleToggleLike}
    onFocusTrack={(t) => { focusedTrackRef.current = t; }}
    onOpenActions={(t) => setActionTrack(t)}
  />
)}
```

---

### `main.py` (controller / route, request-response)

**Analog:** `main.py` lines 763–770 ([main.py:763-770](file:///C:/Users/djdje/Deckify/main.py#L763-L770)).

**RPC Alias Pattern for Bidirectional Compatibility**:
```python
    async def play_tracks(
        self,
        context_uri: str | None = None,
        offset_uri: str | None = None,
        uris: list | None = None,
        position: int = 0,
    ) -> dict:
        return await rpc_playback.play_tracks(self, context_uri, offset_uri, uris, position)

    # Bidirectional compatibility alias [D-01]
    play_track = play_tracks
```

---

### `py_modules/rpc_playback.py` (service, request-response)

**Analog:** `py_modules/rpc_playback.py` lines 239–367 ([py_modules/rpc_playback.py:239-367](file:///C:/Users/djdje/Deckify/py_modules/rpc_playback.py#L239-L367)).

**Explicit URIs and Queue Handling pattern**:
```python
async def play_tracks(
    plugin,
    context_uri: str | None = None,
    offset_uri: str | None = None,
    uris: list | None = None,
    position: int = 0,
) -> dict:
    token = await plugin._ensure_token()
    if not token:
        return {"ok": False, "error": "Not authenticated"}
    if isinstance(offset_uri, list):
        uris, offset_uri = offset_uri, None

    body = {}
    if context_uri:
        body["context_uri"] = context_uri
        if offset_uri:
            body["offset"] = {"uri": offset_uri}
        plugin._context_uri = context_uri
    elif uris:
        body["uris"] = uris
        if position > 0:
            body["offset"] = {"position": position}
    elif offset_uri and str(offset_uri).strip():
        body["uris"] = [str(offset_uri).strip()]

    try:
        await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
        return {"ok": True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            transfer_res = await plugin._auto_transfer_and_play(token)
            if transfer_res.get("ok") and body:
                try:
                    await asyncio.sleep(0.5)
                    await _exec(_spotify_api_request, "me/player/play", token, "PUT", None, body)
                    return {"ok": True}
                except Exception:
                    pass
            return transfer_res
        return {"ok": False, "error": _parse_spotify_error(e)}
    except Exception as e:
        decky.logger.error("play_tracks failed: %s", e)
        return {"ok": False, "error": str(e)}
```

---

### `src/components/tabs/QueueTab.test.tsx` (test, event-driven)

**Analog:** `src/components/common/DeckifyImage.test.ts` (Vitest structure) & `src/hooks/usePlaybackClock.test.ts` (mocking & fake timers).

**Test Pattern Structure**:
```typescript
import { describe, it, expect, vi } from "vitest";

// Mock @decky/ui Focusable and DeckifyImage
vi.mock("@decky/ui", () => ({
  Focusable: ({ children, onClick, onActivate, ...props }: any) => (
    <div data-testid="focusable" onClick={onClick || onActivate} {...props}>
      {children}
    </div>
  ),
}));

vi.mock("../common/DeckifyImage", () => ({
  DeckifyImage: ({ src, ...props }: any) => <img data-testid="deckify-image" src={src} {...props} />,
}));

import { QueueTab } from "./QueueTab";
import { TrackItem } from "../../types";

describe("QueueTab", () => {
  const mockQueue: TrackItem[] = [
    { id: "t1", name: "Track One", artist: "Artist A", uri: "spotify:track:1", duration_ms: 180000, is_liked: false },
    { id: "t2", name: "Track Two", artist: "Artist B", uri: "spotify:track:2", duration_ms: 210000, is_liked: true },
    { id: "t3", name: "Track Three", artist: "Artist C", uri: "spotify:track:3", duration_ms: 240000, is_liked: false },
  ];

  it("renders Now Playing card when currentlyPlaying track is supplied", () => {
    // Assert presence of NOW PLAYING badge, track title, and artist
  });

  it("renders empty state message when queueTracks is empty", () => {
    // Assert 'Queue is empty' message
  });

  it("calls handlePlayQueueTrack with selected track and remaining queue slice on click", () => {
    const handlePlayQueueTrack = vi.fn();
    // Simulate click on track 2 (index 1)
    // Assert handlePlayQueueTrack called with mockQueue[1] and idx 1
  });

  it("calls handleToggleLike when heart icon is clicked without triggering row play", () => {
    const handleToggleLike = vi.fn();
    const handlePlayQueueTrack = vi.fn();
    // Simulate click on heart
    // Assert handleToggleLike called with t1 id, handlePlayQueueTrack not called
  });

  it("caps rendered upcoming tracks at 40 items for 60fps performance", () => {
    // Pass 60 tracks, assert only 40 InteractiveRows are rendered
  });
});
```

---

### `tests/test_plugin_api.py` (test, request-response)

**Analog:** `tests/test_plugin_api.py` lines 99–124 (`test_get_queue_formats_items`) and lines 397–420 (`test_play_tracks`).

**Python Test Extension Pattern**:
```python
    async def test_play_track_alias_and_delegation(self):
        """Verify play_track is aliased to play_tracks on Plugin and functions identically."""
        self.assertEqual(self.plugin.play_track, self.plugin.play_tracks)
        self.execute.return_value = {}
        res = await self.plugin.play_track(uris=["spotify:track:queue1", "spotify:track:queue2"], position=0)
        self.assertTrue(res["ok"])
        self.execute.assert_awaited_with(
            main._spotify_api_request,
            "me/player/play",
            "valid-token",
            "PUT",
            None,
            {"uris": ["spotify:track:queue1", "spotify:track:queue2"]},
        )
```

---

### `tests/test_e2e_requirements.py` (test, request-response)

**Analog:** `tests/test_e2e_requirements.py` lines 578–621 (`test_r9_*`).

**E2E Queue Playback Pattern**:
```python
    async def test_r9_play_tracks_with_explicit_uris_list(self):
        """R9.2: play_tracks with uris list passes uris array to API."""
        await self.plugin.play_tracks(uris=["spotify:track:1", "spotify:track:2"])
        call_args = self.execute.call_args[0]
        body = call_args[5]
        self.assertEqual(body.get("uris"), ["spotify:track:1", "spotify:track:2"])

    def test_r9_queue_items_have_click_to_play_binding(self):
        """R9.4: Queue view track items in DeckifyExpandedModal.tsx have click play handler."""
        content = read_project_file("src/components/DeckifyExpandedModal.tsx")
        self.assertTrue(
            bool(re.search(r"queue.*onClick.*(?:backendPlayTracks|handlePlayTrack|play_tracks)", content, re.DOTALL))
            or "handlePlayQueueTrack" in content,
            "Queue track items must be clickable to trigger immediate playback",
        )
```

---

## Shared Patterns

### 1. Spatial Controller Navigation & Focus Halo
**Source:** `src/components/common/InteractiveRow.tsx` lines 4–15, 91–135  
**Apply to:** All tabs in `src/components/tabs/`, specifically `QueueTab.tsx`  
**Pattern:**
```typescript
<Focusable
  noFocusRing
  onClick={onClick}
  onActivate={onClick}
  onFocus={() => { setFocused(true); onFocus?.(); }}
  onBlur={() => setFocused(false)}
  onGamepadFocus={() => { setFocused(true); onFocus?.(); }}
  onGamepadBlur={() => setFocused(false)}
  style={{
    display: "flex",
    alignItems: "center",
    padding: "8px 12px",
    borderRadius: 8,
    background: active
      ? "rgba(29, 185, 84, 0.25)"
      : focused
      ? "rgba(255,255,255,0.18)"
      : "rgba(255,255,255,0.03)",
    cursor: "pointer",
    ...focusHalo(focused),
    ...style,
  }}
>
```

### 2. Decky RPC Callable Invocation & Error Handling
**Source:** `src/components/DeckifyExpandedModal.tsx` lines 48–75, 386–396  
**Apply to:** All frontend-to-backend RPC calls in `DeckifyExpandedModal.tsx`  
**Pattern:**
```typescript
const backendMethod = callable<[Arg1Type, Arg2Type], { ok: boolean; error?: string }>("method_name");

try {
  const res = await backendMethod(arg1, arg2);
  if (!res.ok) {
    showToast(res.error || "Operation failed");
  }
} catch (err: any) {
  showToast(err?.message || "Communication error");
}
```

### 3. Base64 CSP-Compliant Image Rendering
**Source:** `src/components/common/DeckifyImage.tsx`  
**Apply to:** All album art rendering in `QueueTab.tsx` and Now Playing cards  
**Pattern:**
```typescript
<DeckifyImage
  src={track.artwork_url || track.image_url || undefined}
  width={32}
  height={32}
  style={{ borderRadius: 4 }}
/>
```

### 4. Monotonic Playback Time Formatting
**Source:** `src/components/common/InteractiveRow.tsx` lines 27–33  
**Apply to:** Track durations in `QueueTab.tsx`  
**Pattern:**
```typescript
export function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| *None* | — | — | All Phase 4 files have strong existing analogs in the Deckify codebase. |

---

## Metadata

**Analog search scope:** `src/components/`, `src/hooks/`, `main.py`, `py_modules/`, `tests/`  
**Files scanned:** 14  
**Pattern extraction date:** 2026-11-11  
