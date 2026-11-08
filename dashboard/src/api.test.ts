import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";

describe("Dashboard API module", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockResponse = (data: any, ok = true, status = 200) => {
    return Promise.resolve({
      ok,
      status,
      json: () => Promise.resolve(data),
    } as unknown as Response);
  };

  it("fetchStatus queries /api/status", async () => {
    const payload = { authenticated: true, is_playing: true };
    vi.mocked(fetch).mockReturnValueOnce(mockResponse(payload));

    const res = await api.fetchStatus();
    expect(res).toEqual(payload);
    expect(fetch).toHaveBeenCalledWith("/api/status");
  });

  it("jsonOrThrow throws when status not ok", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ error: "Unauthorized" }, false, 401));
    await expect(api.fetchStatus()).rejects.toThrow("API error: 401");
  });

  it("controlPlayback queries /api/control", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    const res = await api.controlPlayback("play");
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/control?action=play", { method: "POST" });
  });

  it("setVolume queries /api/volume", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    const res = await api.setVolume(75);
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/volume?value=75", { method: "POST" });
  });

  it("seekPlayback queries /api/seek with clamped body", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, position_ms: 12000 }));
    const res = await api.seekPlayback(12000.4);
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/seek", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position_ms: 12000 }),
    });
  });

  it("setShuffle and setRepeat query POST endpoints", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.setShuffle(true);
    expect(fetch).toHaveBeenCalledWith("/api/shuffle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: true }),
    });

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.setRepeat("context");
    expect(fetch).toHaveBeenCalledWith("/api/repeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "context" }),
    });
  });

  it("toggleLikeTrack handles trackId and liked state", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, is_liked: true }));
    const res = await api.toggleLikeTrack("track1", true);
    expect(res.is_liked).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/like", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track_id: "track1", liked: true }),
    });
  });

  it("updateEngineSettings sends settings payload", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, audio_quality: "lossless" }));
    const res = await api.updateEngineSettings({ audio_quality: "lossless", normalisation: false });
    expect(res.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_quality: "lossless", normalisation: false }),
    });
  });

  it("queue APIs (fetchQueue, addToQueue, addTrackToPlaylist)", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, queue: [] }));
    await api.fetchQueue();
    expect(fetch).toHaveBeenCalledWith("/api/queue");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.addToQueue("spotify:track:123");
    expect(fetch).toHaveBeenCalledWith("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri: "spotify:track:123" }),
    });

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.addTrackToPlaylist("pl1", "spotify:track:123");
    expect(fetch).toHaveBeenCalledWith("/api/playlist/add-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: "pl1", track_uri: "spotify:track:123" }),
    });
  });

  it("folders APIs (fetchFolders, manageFolder)", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, folders: [] }));
    await api.fetchFolders();
    expect(fetch).toHaveBeenCalledWith("/api/folders");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, folders: [] }));
    await api.manageFolder({ action: "create", name: "Favorites" });
    expect(fetch).toHaveBeenCalledWith("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", name: "Favorites" }),
    });
  });

  it("devices APIs (fetchDevices, transferPlayback)", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, devices: [] }));
    await api.fetchDevices();
    expect(fetch).toHaveBeenCalledWith("/api/devices");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.transferPlayback("dev-9");
    expect(fetch).toHaveBeenCalledWith("/api/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: "dev-9" }),
    });
  });

  it("library items APIs (playlists, liked, episodes, artists, albums)", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, playlists: [] }));
    await api.fetchPlaylists(10);
    expect(fetch).toHaveBeenCalledWith("/api/playlists?offset=10");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, tracks: [] }));
    await api.fetchPlaylistTracks("p1", 5);
    expect(fetch).toHaveBeenCalledWith("/api/playlists/p1/tracks?offset=5");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, tracks: [] }));
    await api.fetchLikedTracks(20);
    expect(fetch).toHaveBeenCalledWith("/api/liked-tracks?offset=20");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, tracks: [] }));
    await api.fetchRecentlyPlayed(15);
    expect(fetch).toHaveBeenCalledWith("/api/recently-played?limit=15");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, episodes: [] }));
    await api.fetchSavedEpisodes(0);
    expect(fetch).toHaveBeenCalledWith("/api/episodes?offset=0");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, artists: [] }));
    await api.fetchFollowedArtists();
    expect(fetch).toHaveBeenCalledWith("/api/artists");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, albums: [] }));
    await api.fetchSavedAlbums(0);
    expect(fetch).toHaveBeenCalledWith("/api/albums?offset=0");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, tracks: [] }));
    await api.fetchAlbumTracks("alb-1", 0);
    expect(fetch).toHaveBeenCalledWith("/api/albums/alb-1/tracks?offset=0");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, albums: [] }));
    await api.fetchArtistAlbums("art-1", 0);
    expect(fetch).toHaveBeenCalledWith("/api/artists/art-1/albums?offset=0");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, tracks: [] }));
    await api.fetchArtistTopTracks("art-1");
    expect(fetch).toHaveBeenCalledWith("/api/artists/art-1/top-tracks");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.searchSpotify("daft punk", 0);
    expect(fetch).toHaveBeenCalledWith("/api/search?q=daft%20punk&offset=0");
  });

  it("context and URIs playback (playInContext, playUris)", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.playInContext("spotify:album:1", "spotify:track:2");
    expect(fetch).toHaveBeenCalledWith("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context_uri: "spotify:album:1", offset_uri: "spotify:track:2" }),
    });

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.playUris(["spotify:track:1"], 4000);
    expect(fetch).toHaveBeenCalledWith("/api/play", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uris: ["spotify:track:1"], position: 4000 }),
    });
  });

  it("remote window and gamepad controls", async () => {
    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.toggleNativeSpotifyMix("mix-1", true, false);
    expect(fetch).toHaveBeenCalledWith("/api/native-mix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playlist_id: "mix-1", enabled: true, play_now: false }),
    });

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, events: ["a"] }));
    const gp = await api.pollGamepadEvents();
    expect(gp.events).toEqual(["a"]);

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true, running: true }));
    const win = await api.fetchClientWindowStatus();
    expect(win.running).toBe(true);

    expect(api.getClientWindowScreenshotUrl(12345)).toBe("/api/client-window/screenshot?t=12345");

    vi.mocked(fetch).mockReturnValueOnce(mockResponse({ ok: true }));
    await api.sendClientWindowInput({ action: "click", x: 10, y: 20 });
    expect(fetch).toHaveBeenCalledWith("/api/client-window/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "click", x: 10, y: 20 }),
    });
  });

  it("subscribeToEvents receives SSE messages and handles close", () => {
    let messageListener: any = null;
    let errorListener: any = null;
    const closeMock = vi.fn();

    class MockEventSource {
      constructor(public url: string) {}
      addEventListener(type: string, fn: any) {
        if (type === "status") messageListener = fn;
      }
      set onerror(fn: any) {
        errorListener = fn;
      }
      close() {
        closeMock();
      }
    }
    vi.stubGlobal("EventSource", MockEventSource as any);

    const onStatus = vi.fn();
    const onError = vi.fn();
    const unsubscribe = api.subscribeToEvents(onStatus, onError);

    // Simulate SSE status event
    messageListener({ data: JSON.stringify({ authenticated: true }) });
    expect(onStatus).toHaveBeenCalledWith({ authenticated: true });

    // Simulate error
    errorListener(new Error("Network drop"));
    expect(onError).toHaveBeenCalled();

    // Unsubscribe closes EventSource
    unsubscribe();
    expect(closeMock).toHaveBeenCalled();
  });
});
