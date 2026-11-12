export type AudioBackend = "librespot" | "spotify_client";
export type AudioQuality = "96" | "160" | "320" | "lossless";

export type ViewMode =
  | "now_playing"
  | "lyrics"
  | "playlists"
  | "liked"
  | "albums"
  | "artists"
  | "recent"
  | "episodes"
  | "search"
  | "queue"
  | "devices"
  | "engine";

export const ALL_MODES: ViewMode[] = [
  "now_playing",
  "lyrics",
  "playlists",
  "liked",
  "albums",
  "artists",
  "recent",
  "episodes",
  "search",
  "queue",
  "devices",
  "engine",
];

export type LyricsSource = "Spotify" | "LRCLIB" | "NetEase" | "Musixmatch" | "Lyrics.ovh";
export type EqualizerPreset = "flat" | "bass" | "vocal" | "gaming";

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
  artist_id?: string;
  album_id?: string;
}

export interface TrackItem {
  id?: string;
  track_id?: string;
  uri?: string;
  name?: string;
  artist?: string;
  album?: string;
  image_url?: string | null;
  artwork_url?: string | null;
  duration_ms?: number;
  is_liked?: boolean;
  artist_id?: string;
  album_id?: string;
}

export interface PlaylistItem {
  id: string;
  name: string;
  uri: string;
  image_url?: string;
  track_count?: number;
  can_mix?: boolean;
  is_mixed?: boolean;
  owner_id?: string;
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
  resume_position_ms?: number;
  fully_played?: boolean;
}

export interface FolderItem {
  id: string;
  name: string;
  uri?: string;
  source?: string;
  playlist_ids: string[];
  playlists: PlaylistItem[];
  subfolders?: FolderItem[];
}

export interface LyricsLine {
  timeMs: number;
  text: string;
}

export interface SyncedLine {
  timeMs: number;
  text: string;
}

export interface AudioStreamInfo {
  application?: string;
  sample_spec?: string;
  sample_rate_hz?: number;
  bit_depth?: number;
  is_lossless_rate?: boolean;
  format_label?: string;
  resample_method?: string;
  active?: boolean;
}

export interface AudioSinkInfo {
  name: string;
  description: string;
  is_default: boolean;
}

export interface EngineSettings {
  device_name?: string;
  audio_backend: AudioBackend;
  audio_quality: AudioQuality;
  bitrate: number;
  bit_perfect_clock?: boolean;
  spotify_client_id?: string;
  normalisation: boolean;
  normalisation_pregain?: number;
  gapless: boolean;
  autoplay: boolean;
  playlist_folders?: FolderItem[];
  spotify_folder_tree?: FolderItem[];
  game_audio_profiles?: Record<string, GameAudioProfile>;
  auto_ducking?: boolean;
  auto_ducking_volume?: number;
  gamepad_chords_enabled?: boolean;
  toast_enabled?: boolean;
  toast_position?: string;
  overlay_enabled?: boolean;
  overlay_position?: string;
  overlay_autohide?: boolean;
  overlay_show_progress?: boolean;
  eq_preset?: EqualizerPreset;
  spotify_client_installed?: boolean;
  duck_fade_down_duration?: number;
  duck_fade_up_duration?: number;
  ducking_mode?: DuckingMode;
  ducking_proportional_pct?: number;
  voice_ducking_enabled?: boolean;
  voice_ducking_volume?: number;
  voice_ducking_hold_delay?: number;
}

export type DuckingMode = "proportional" | "fixed";

export interface DuckingState {
  is_ducked: boolean;
  effective_volume: number;
  base_volume: number;
  duck_reasons: string[];
}

export interface SpotifyDevice {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
}

export interface SleepTimerStatus {
  active: boolean;
  remaining_seconds: number;
  shutdown_on_finish: boolean;
  end_of_track?: boolean;
}

export interface StatusResponse {
  authenticated: boolean;
  librespot_running: boolean;
  spotify_client_running?: boolean;
  running?: boolean;
  audio_backend?: AudioBackend;
  play_state: string | null;
  track: TrackMeta | null;
  track_meta?: TrackMeta | null;
  position_ms: number;
  duration_ms?: number;
  is_playing: boolean;
  volume: number | null;
  shuffle_state?: boolean;
  repeat_state?: "off" | "context" | "track";
  is_liked?: boolean;
  active_device?: { id: string; name: string; type: string } | null;
  audio_stream_info?: AudioStreamInfo | null;
  engine_settings?: EngineSettings;
  settings?: EngineSettings;
  sleep_timer?: SleepTimerStatus;
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
