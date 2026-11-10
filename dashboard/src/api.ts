async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface TrackMeta {
  track_id: string;
  name: string;
  artist: string;
  album: string;
  artwork_url: string | null;
  duration_ms: number;
  uri?: string;
  is_liked?: boolean;
}

export type AudioBackend = "librespot" | "spotify_client";
export type AudioQuality = "96" | "160" | "320" | "lossless";

export interface AudioStreamInfo {
  sample_spec?: string;
  sample_rate_hz?: number;
  bit_depth?: number;
  is_lossless_rate?: boolean;
  format_label?: string;
}

export interface EngineSettings {
  audio_backend: AudioBackend;
  audio_quality: AudioQuality;
  bitrate: number;
  normalisation: boolean;
  gapless: boolean;
  autoplay: boolean;
  spotify_client_installed?: boolean;
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
}

export interface StatusResponse {
  authenticated: boolean;
  librespot_running: boolean;
  spotify_client_running?: boolean;
  audio_backend?: AudioBackend;
  play_state: string | null;
  track: TrackMeta | null;
  position_ms: number;
  is_playing: boolean;
  volume: number | null;
  shuffle_state?: boolean;
  repeat_state?: "off" | "context" | "track";
  is_liked?: boolean;
  active_device?: { id: string; name: string; type: string } | null;
  audio_stream_info?: AudioStreamInfo | null;
  engine_settings?: EngineSettings;
}

export async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch("/api/status");
  return jsonOrThrow(res);
}

export function subscribeToEvents(
  onStatus: (status: StatusResponse) => void,
  onError?: (err: any) => void,
  onGamepad?: (events: string[]) => void
): () => void {
  try {
    const es = new EventSource("/api/events");
    es.addEventListener("status", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onStatus(data);
      } catch (err) {
        console.warn("Failed to parse SSE status data", err);
      }
    });
    es.addEventListener("gamepad", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (onGamepad && Array.isArray(data.events)) {
          onGamepad(data.events);
        }
      } catch (err) {
        console.warn("Failed to parse SSE gamepad data", err);
      }
    });
    es.onerror = (err) => {
      if (onError) onError(err);
    };
    return () => {
      es.close();
    };
  } catch (err) {
    if (onError) onError(err);
    return () => {};
  }
}

export async function controlPlayback(action: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/control?action=${encodeURIComponent(action)}`, { method: "POST" });
  return jsonOrThrow(res);
}

export async function setVolume(value: number): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/volume?value=${encodeURIComponent(value)}`, { method: "POST" });
  return jsonOrThrow(res);
}

export async function seekPlayback(positionMs: number): Promise<{ ok: boolean; position_ms?: number; error?: string }> {
  const res = await fetch("/api/seek", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position_ms: Math.max(0, Math.round(positionMs)) }),
  });
  return jsonOrThrow(res);
}

export async function setShuffle(state: boolean): Promise<{ ok: boolean; shuffle_state?: boolean; error?: string }> {
  const res = await fetch("/api/shuffle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return jsonOrThrow(res);
}

export async function setRepeat(state: "off" | "context" | "track"): Promise<{ ok: boolean; repeat_state?: string; error?: string }> {
  const res = await fetch("/api/repeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
  return jsonOrThrow(res);
}

export async function toggleLikeTrack(trackId?: string, liked?: boolean): Promise<{ ok: boolean; is_liked?: boolean; error?: string }> {
  const res = await fetch("/api/like", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId ?? "", liked }),
  });
  return jsonOrThrow(res);
}

export async function updateEngineSettings(
  settings: Partial<EngineSettings>,
): Promise<{
  ok: boolean;
  error?: string;
  running?: boolean;
  audio_stream_info?: AudioStreamInfo | null;
} & Partial<EngineSettings>> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return jsonOrThrow(res);
}

// ── Playlist, Folder & Queue types & API ─────────────────────

export interface Playlist {
  id: string;
  name: string;
  image_url: string | null;
  track_count: number;
  owner_id: string;
  uri?: string;
  can_mix?: boolean;
  is_mixed?: boolean;
}

export interface PlaylistFolder {
  id: string;
  uri?: string;
  name: string;
  playlist_ids: string[];
  playlists?: Playlist[];
  subfolders?: PlaylistFolder[];
  source?: string;
}

export interface PlaylistTrack {
  id: string | null;
  name: string;
  artist: string;
  album: string;
  uri: string;
  duration_ms: number;
  image_url: string | null;
  is_liked?: boolean;
}

export interface PlaylistsResponse {
  ok: boolean;
  playlists: Playlist[];
  total: number;
  offset: number;
  error?: string;
}

export interface FoldersResponse {
  ok: boolean;
  folders: PlaylistFolder[];
  error?: string;
}

export interface TracksResponse {
  ok: boolean;
  tracks: PlaylistTrack[];
  total?: number;
  offset?: number;
  error?: string;
}

export interface QueueResponse {
  ok: boolean;
  currently_playing: PlaylistTrack | null;
  queue: PlaylistTrack[];
  error?: string;
}

export async function fetchQueue(): Promise<QueueResponse> {
  const res = await fetch("/api/queue");
  return jsonOrThrow(res);
}

export async function addToQueue(uri: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/queue", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uri }),
  });
  return jsonOrThrow(res);
}

export async function addTrackToPlaylist(playlistId: string, trackUri: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/playlist/add-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playlist_id: playlistId, track_uri: trackUri }),
  });
  return jsonOrThrow(res);
}

export async function fetchFolders(): Promise<FoldersResponse> {
  const res = await fetch("/api/folders");
  return jsonOrThrow(res);
}

export async function manageFolder(params: {
  action: "create" | "rename" | "delete" | "add_playlist" | "remove_playlist";
  folder_id?: string;
  name?: string;
  playlist_id?: string;
}): Promise<FoldersResponse> {
  const res = await fetch("/api/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return jsonOrThrow(res);
}

export async function fetchDevices(): Promise<{ ok: boolean; devices: SpotifyDevice[]; error?: string }> {
  const res = await fetch("/api/devices");
  return jsonOrThrow(res);
}

export async function transferPlayback(deviceId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_id: deviceId }),
  });
  return jsonOrThrow(res);
}

export async function fetchPlaylists(offset = 0): Promise<PlaylistsResponse> {
  const res = await fetch(`/api/playlists?offset=${offset}`);
  return jsonOrThrow(res);
}

export async function fetchPlaylistTracks(id: string, offset = 0): Promise<TracksResponse> {
  const res = await fetch(`/api/playlists/${encodeURIComponent(id)}/tracks?offset=${offset}`);
  return jsonOrThrow(res);
}

export async function playInContext(contextUri: string, offsetUri?: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context_uri: contextUri, offset_uri: offsetUri }),
  });
  return jsonOrThrow(res);
}

export async function playUris(uris: string[], position = 0): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uris, position }),
  });
  return jsonOrThrow(res);
}

// ── Official Spotify Client Remote Window & Gamepad API ──────

export interface ClientWindowStatus {
  ok: boolean;
  running: boolean;
  title?: string;
  url?: string;
  logged_in?: boolean;
  viewport_width?: number;
  viewport_height?: number;
  error?: string;
}

export async function toggleNativeSpotifyMix(
  playlistId: string,
  enabled: boolean,
  playNow = true,
): Promise<{ ok: boolean; playlist_id?: string; is_mixed?: boolean; error?: string }> {
  const res = await fetch("/api/native-mix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playlist_id: playlistId, enabled, play_now: playNow }),
  });
  return jsonOrThrow(res);
}

export async function pollGamepadEvents(): Promise<{ ok: boolean; events: string[] }> {
  const res = await fetch("/api/gamepad/poll");
  return jsonOrThrow(res);
}

export async function fetchClientWindowStatus(): Promise<ClientWindowStatus> {
  const res = await fetch("/api/client-window/status");
  return jsonOrThrow(res);
}

export function getClientWindowScreenshotUrl(bust: number): string {
  return `/api/client-window/screenshot?t=${bust}`;
}

export async function sendClientWindowInput(params: {
  action: "click" | "wheel" | "text" | "key";
  x?: number;
  y?: number;
  delta_y?: number;
  text?: string;
  key?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/client-window/input", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return jsonOrThrow(res);
}

// ── Library types & API ──────────────────────────────────────

export interface Artist {
  id: string;
  name: string;
  image_url: string | null;
}

export interface Episode {
  id: string;
  name: string;
  show_name: string;
  uri: string;
  duration_ms: number;
  image_url: string | null;
}

export interface ArtistsResponse {
  ok: boolean;
  artists: Artist[];
  error?: string;
}

export interface EpisodesResponse {
  ok: boolean;
  episodes: Episode[];
  total: number;
  offset: number;
  error?: string;
}

export interface Album {
  id: string;
  name: string;
  artist: string;
  image_url: string | null;
  track_count: number;
  uri: string;
}

export interface AlbumsResponse {
  ok: boolean;
  albums: Album[];
  total: number;
  offset: number;
  error?: string;
}

export async function fetchLikedTracks(offset = 0): Promise<TracksResponse> {
  const res = await fetch(`/api/liked-tracks?offset=${offset}`);
  return jsonOrThrow(res);
}

export async function fetchRecentlyPlayed(limit = 30): Promise<TracksResponse> {
  const res = await fetch(`/api/recently-played?limit=${limit}`);
  return jsonOrThrow(res);
}

export async function fetchSavedEpisodes(offset = 0): Promise<EpisodesResponse> {
  const res = await fetch(`/api/episodes?offset=${offset}`);
  return jsonOrThrow(res);
}

export async function fetchFollowedArtists(): Promise<ArtistsResponse> {
  const res = await fetch("/api/artists");
  return jsonOrThrow(res);
}

export async function fetchSavedAlbums(offset = 0): Promise<AlbumsResponse> {
  const res = await fetch(`/api/albums?offset=${offset}`);
  return jsonOrThrow(res);
}

export async function fetchAlbumTracks(id: string, offset = 0): Promise<TracksResponse> {
  const res = await fetch(`/api/albums/${encodeURIComponent(id)}/tracks?offset=${offset}`);
  return jsonOrThrow(res);
}

export async function fetchArtistAlbums(id: string, offset = 0): Promise<AlbumsResponse> {
  const res = await fetch(`/api/artists/${encodeURIComponent(id)}/albums?offset=${offset}`);
  return jsonOrThrow(res);
}

export async function fetchArtistTopTracks(id: string): Promise<TracksResponse> {
  const res = await fetch(`/api/artists/${encodeURIComponent(id)}/top-tracks`);
  return jsonOrThrow(res);
}

// ── Search API ───────────────────────────────────────────────

export interface SearchResponse {
  ok: boolean;
  tracks: PlaylistTrack[];
  artists: Artist[];
  albums: Album[];
  playlists: Playlist[];
  error?: string;
}

export async function searchSpotify(q: string, offset = 0): Promise<SearchResponse> {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&offset=${offset}`);
  return jsonOrThrow(res);
}
