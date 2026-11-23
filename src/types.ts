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
  media_type?: string;
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
  media_type?: string;
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

export interface ShowItem {
  id: string;
  name: string;
  publisher?: string;
  image_url?: string;
  total_episodes?: number;
  uri: string;
}

export type EpisodeFilter = "all" | "unplayed" | "in_progress";

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
  romanized?: string;
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

export type AccentThemeMode = "spotify_green" | "dynamic_album" | "steamos_blue";
export type EcoStatusState = "on_battery_active" | "bypassed" | "engine_sleeping";

export interface EcoStatusInfo {
  enabled: boolean;
  has_battery: boolean;
  on_battery: boolean;
  is_docked: boolean;
  is_game_running: boolean;
  animations_suspended: boolean;
  engine_sleeping: boolean;
  sleep_spotify_client: boolean;
  timeout_minutes: number;
  paused_seconds: number;
  status: EcoStatusState;
}

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

export type ChordActionId =
  | "previous"
  | "next"
  | "play_pause"
  | "volume_up"
  | "volume_down"
  | "toggle_like"
  | "cycle_pinned"
  | "toggle_lyrics";

export type ChordBindingsMap = Partial<Record<ChordActionId, number[]>>;

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
  crossfade_seconds?: number;
  autoplay: boolean;
  playlist_folders?: FolderItem[];
  spotify_folder_tree?: FolderItem[];
  game_audio_profiles?: Record<string, GameAudioProfile>;
  auto_ducking?: boolean;
  auto_ducking_volume?: number;
  gamepad_chords_enabled?: boolean;
  silent_banner_enabled?: boolean;
  silent_banner_position?: string;
  gamepad_chord_bindings?: ChordBindingsMap;
  toast_enabled?: boolean;
  toast_sound_enabled?: boolean;
  toast_position?: string;
  overlay_enabled?: boolean;
  overlay_position?: string;
  overlay_autohide?: boolean;
  overlay_show_progress?: boolean;
  overlay_lyrics_enabled?: boolean;
  overlay_lyrics_offset_ms?: number;
  romanize_lyrics_enabled?: boolean;
  romanize_display_style?: "dual" | "romanized_only";
  romanize_overlay_enabled?: boolean;
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
  accent_theme?: AccentThemeMode;
  eco_mode_enabled?: boolean;
  eco_timeout_minutes?: number;
  eco_sleep_spotify_client?: boolean;
  preferred_podcast_speed?: number;
  search_history?: string[];
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
  is_restricted?: boolean;
  supports_volume?: boolean;
}

export interface DevicesResponse {
  ok: boolean;
  devices?: SpotifyDevice[];
  local_device_name?: string;
  local_hostname?: string;
  local_hardware_label?: string;
  audio_backend?: string;
  engine_running?: boolean;
  engine_sleeping?: boolean;
  error?: string;
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
  eco_status?: EcoStatusInfo;
  active_game_app_id?: number | null;
  active_game_override?: ActiveGameOverrideInfo | null;
  playback_speed?: number;
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

export type SearchFilterTab =
  | "all"
  | "tracks"
  | "artists"
  | "albums"
  | "playlists"
  | "podcasts"
  | "episodes";

export interface SearchResults {
  tracks?: TrackItem[];
  artists?: ArtistItem[];
  albums?: AlbumItem[];
  playlists?: PlaylistItem[];
  shows?: ShowItem[];
  episodes?: EpisodeItem[];
}

export interface NavHistoryEntry {
  mode: ViewMode;
  activeAlbum: AlbumItem | null;
  activeArtist: ArtistItem | null;
  activePlaylist: PlaylistItem | null;
  activeShow: ShowItem | null;
  scrollTop: number;
  focusLabel?: string;
  focusTrackId?: string;
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
