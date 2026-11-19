export type AudioBackend = "librespot" | "spotify_client";
export type AudioQuality = "96" | "160" | "320" | "lossless";

export type ViewMode =
  | "now_playing"
  | "lyrics"
  | "discovery"
  | "playlists"
  | "liked"
  | "albums"
  | "artists"
  | "recent"
  | "episodes"
  | "search"
  | "queue"
  | "devices"
  | "soundtracks"
  | "engine";

export const ALL_MODES: ViewMode[] = [
  "now_playing",
  "lyrics",
  "discovery",
  "playlists",
  "liked",
  "albums",
  "artists",
  "recent",
  "episodes",
  "search",
  "queue",
  "devices",
  "soundtracks",
  "engine",
];

export type LyricsSource = "Spotify" | "LRCLIB" | "NetEase" | "Musixmatch" | "Lyrics.ovh";
export type EqualizerPreset =
  | "flat"
  | "bass"
  | "vocal"
  | "gaming"
  | "deck_speakers"
  | "late_night"
  | "custom";

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
  is_active?: boolean;
}

export type DockStatusState =
  | "disabled"
  | "monitoring"
  | "docked"
  | "bluetooth_held"
  | "manual_override";

export interface DockStatusInfo {
  status: DockStatusState;
  active_sink: string | null;
  active_sink_label: string;
  pre_dock_sink: string | null;
  manual_override: boolean;
}

export interface HeldBookmarkInfo {
  track_uri: string;
  context_uri?: string;
  position_ms: number;
  was_playing: boolean;
  track_name?: string;
  artist?: string;
  saved_at: number;
}

export interface ResilienceStatusInfo {
  onevent_healthy: boolean;
  poll_interval_s: number;
  polling_mode: "onevent" | "fallback";
  last_event_at: number | null;
  held_bookmark: HeldBookmarkInfo | null;
  held_reason: "expired" | "remote_active" | null;
  recovering: boolean;
}

export type MprisBadgeState = "active" | "proxy_unavailable" | "disabled";

export interface MprisStatusInfo {
  enabled: boolean;
  bus_registered: boolean;
  proxy_running: boolean;
  proxy_managed: boolean;
  proxy_available: boolean;
  status: MprisBadgeState;
  bus_name: string;
}

export type PinnedItemType = "playlist" | "album" | "liked_songs";

export interface PinnedPlaylistItem {
  uri: string;
  name: string;
  type: PinnedItemType;
  image_url?: string | null;
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
  toast_sound_enabled?: boolean;
  toast_position?: string;
  overlay_enabled?: boolean;
  overlay_position?: string;
  overlay_autohide?: boolean;
  overlay_show_progress?: boolean;
  overlay_lyrics_enabled?: boolean;
  overlay_lyrics_offset_ms?: number;
  overlay_autohide_duration_s?: number;
  eq_preset?: EqualizerPreset;
  eq_custom_bands?: number[];
  spotify_client_installed?: boolean;
  duck_fade_down_duration?: number;
  duck_fade_up_duration?: number;
  ducking_mode?: DuckingMode;
  ducking_proportional_pct?: number;
  voice_ducking_enabled?: boolean;
  voice_ducking_volume?: number;
  voice_ducking_hold_delay?: number;
  soundtrack_launch_debounce?: number;
  soundtrack_exit_debounce?: number;
  soundtrack_unbound_policy?: "keep_playing" | "auto_pause";
  soundtrack_default_playlist?: string;
  soundtrack_default_mode?: "remember_position" | "fresh_start";
  trigger_nav_enabled?: boolean;
  trigger_seek_seconds?: number;
  trigger_page_size?: number;
  show_controller_hints?: boolean;
  pinned_playlists?: PinnedPlaylistItem[];
  sleep_timer_fade_enabled?: boolean;
  sleep_timer_fade_duration?: number;
  dock_auto_switch_enabled?: boolean;
  dock_target_sink?: string;
  dock_respect_bluetooth?: boolean;
  dock_pause_on_undock?: boolean;
  dock_toast_enabled?: boolean;
  resilience_auto_resume?: boolean;
  resilience_bookmark_expiry_hours?: number;
  resilience_bookmark_never_expires?: boolean;
  resilience_toast_enabled?: boolean;
  resilience_prompt_held_enabled?: boolean;
  mpris_enabled?: boolean;
  mpris_auto_proxy?: boolean;
}

export type DuckingMode = "proportional" | "fixed";

export interface DuckingState {
  is_ducked: boolean;
  effective_volume: number;
  base_volume: number;
  duck_reasons: string[];
  has_game_override?: boolean;
}

export interface ActiveGameOverrideInfo {
  app_id: number | null;
  app_name: string;
  eq_preset: EqualizerPreset;
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
  fading?: boolean;
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
  context_uri?: string | null;
  active_device?: { id: string; name: string; type: string } | null;
  audio_stream_info?: AudioStreamInfo | null;
  engine_settings?: EngineSettings;
  settings?: EngineSettings;
  sleep_timer?: SleepTimerStatus;
  dock_status?: DockStatusInfo;
  resilience_status?: ResilienceStatusInfo;
  mpris_status?: MprisStatusInfo;
  active_game_app_id?: number | null;
  active_game_override?: ActiveGameOverrideInfo | null;
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

export interface InstalledGame {
  app_id: number;
  name: string;
  is_steam?: boolean;
  is_non_steam?: boolean;
  icon_url?: string;
  exe?: string;
  is_running?: boolean;
}

export interface SoundtrackPlaylist {
  uri: string;
  name: string;
  image?: string;
}

export type SoundtrackMode = "shuffle" | "random" | "rotation";

export interface SoundtrackProfile {
  app_id: number;
  app_name: string;
  playlists: SoundtrackPlaylist[];
  mode: SoundtrackMode;
  rotation_index: number;
  resume_mode: "remember_position" | "fresh_start";
  always_auto_start: boolean;
  exit_policy: "restore_snapshot" | "pause" | "keep_playing";
  volume_override: number | null;
  ducking_override: boolean | null;
  eq_preset?: EqualizerPreset | null;
  eq_custom_bands?: number[] | null;
  ducking_level_override?: number | null;
  last_track_uri?: string;
  last_position_ms?: number;
}


export type DiscoveryTimeRange = "short_term" | "medium_term" | "long_term";

export interface DiscoveryMixItem extends PlaylistItem {
  subtitle?: string;
  is_album?: boolean;
}

export interface DiscoveryFeedResponse {
  ok: boolean;
  time_range?: DiscoveryTimeRange;
  made_for_you?: DiscoveryMixItem[];
  made_for_you_fallback?: boolean;
  top_tracks?: TrackItem[];
  top_artists?: ArtistItem[];
  new_releases?: AlbumItem[];
  needs_reauth?: boolean;
  rate_limited?: boolean;
  stale?: boolean;
  retry_after?: number;
  error?: string;
}
