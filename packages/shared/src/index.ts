export type AudioBackend = "librespot" | "spotify_client";
export type AudioQuality = "96" | "160" | "320" | "lossless";

export interface TrackMeta {
  track_id?: string;
  id?: string;
  name: string;
  artist: string;
  album: string;
  artwork_url?: string | null;
  image_url?: string | null;
  duration_ms: number;
  uri?: string;
  is_liked?: boolean;
}

export interface TrackItem {
  id?: string;
  uri?: string;
  name?: string;
  artist?: string;
  album?: string;
  image_url?: string;
  artwork_url?: string;
  duration_ms?: number;
  is_liked?: boolean;
}

export interface PlaylistItem {
  id: string;
  name: string;
  uri: string;
  image_url?: string;
  track_count?: number;
  can_mix?: boolean;
  is_mixed?: boolean;
}

export interface AlbumItem {
  id: string;
  name: string;
  artist: string;
  image_url?: string;
  track_count?: number;
  uri: string;
}

export interface ArtistItem {
  id: string;
  name: string;
  image_url?: string;
}

export interface EpisodeItem {
  id: string;
  name: string;
  show_name: string;
  image_url?: string;
  duration_ms?: number;
  uri: string;
  release_date?: string;
}

export interface FolderItem {
  id: string;
  name: string;
  playlists: string[];
}

export interface LyricsLine {
  timeMs: number;
  text: string;
}

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

export interface GameAudioProfile {
  volume: number;
  ducking: boolean;
  ducking_level?: number;
}

export interface GameAudioSettings {
  enabled: boolean;
  profiles: Record<string, GameAudioProfile>;
  global_ducking: boolean;
}

export interface SleepTimerStatus {
  active: boolean;
  remaining_seconds: number;
  shutdown_on_finish: boolean;
}
