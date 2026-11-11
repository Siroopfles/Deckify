import { FC, useState, useEffect, useCallback, useRef } from "react";
import { Focusable, ModalRoot, NavEntryPositionPreferences } from "@decky/ui";
import { callable } from "@decky/api";
// Note: Child views render heart icons: FaHeart, FaRegHeart
import {
  AlbumItem,
  ArtistItem,
  EpisodeItem,
  FolderItem,
  PlaylistItem,
  SyncedLine,
  TrackItem,
  ViewMode,
  ALL_MODES,
} from "../types";
import { parseLrc } from "../utils";
import { usePlaybackStatus } from "../hooks/usePlaybackStatus";
import { Sidebar } from "./common/Sidebar";
import { TrackActionModal } from "./common/TrackActionModal";

// Modular tab components
import { NowPlayingTab } from "./tabs/NowPlayingTab";
import { LyricsTab } from "./tabs/LyricsTab";
import { PlaylistsTab } from "./tabs/PlaylistsTab";
import { LikedSongsTab } from "./tabs/LikedSongsTab";
import { AlbumsTab } from "./tabs/AlbumsTab";
import { ArtistsTab } from "./tabs/ArtistsTab";
import { RecentTab } from "./tabs/RecentTab";
import { PodcastsTab } from "./tabs/PodcastsTab";
import { SearchTab } from "./tabs/SearchTab";
import { QueueTab } from "./tabs/QueueTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { SettingsTab } from "./tabs/SettingsTab";

// Backward-compatible re-exports
export { DeckifyImage } from "./common/DeckifyImage";
export { InteractiveRow } from "./common/InteractiveRow";

const ModalRootAny = ModalRoot as any;

const FULL_BLEED = {
  width: "96vw",
  marginLeft: "calc((100% - 96vw) / 2)",
  boxSizing: "border-box" as const,
};

// RPC Callables
const backendPlayTracks = callable<[string | null, string | null, string[] | null, number], { ok: boolean; error?: string }>("play_track");
const backendControlPlayback = callable<[string, string], { ok: boolean; error?: string }>("control_playback");
const backendSetVolume = callable<[number], { ok: boolean; error?: string }>("set_volume");
const backendSetRepeat = callable<[string, string], { ok: boolean; error?: string }>("set_repeat");
const backendSetShuffle = callable<[boolean, string], { ok: boolean; error?: string }>("set_shuffle");
const backendToggleLike = callable<[string, string | null], { ok: boolean; is_liked?: boolean; error?: string }>("toggle_like");
const backendGetTrackRecommendations = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_track_recommendations");
const backendAddToQueue = callable<[string, string], { ok: boolean; error?: string }>("add_to_queue");
const backendAddTrackToPlaylist = callable<[string, string], { ok: boolean; error?: string }>("add_track_to_playlist");
const backendRemoveTrackFromPlaylist = callable<[string, string], { ok: boolean; error?: string }>("remove_track_from_playlist");
const backendCreatePlaylist = callable<[string, boolean], { ok: boolean; playlist?: PlaylistItem; error?: string }>("create_playlist");
const backendManagePlaylistFolder = callable<[string, string, string, string], { ok: boolean; error?: string }>("manage_playlist_folder");
const backendGetPlaylistFolders = callable<[], { ok: boolean; folders?: FolderItem[]; error?: string }>("get_playlist_folders");
const backendGetPlaylists = callable<[number], { ok: boolean; playlists?: PlaylistItem[]; total?: number; error?: string }>("get_playlists");
const backendGetPlaylistTracks = callable<[string, number, boolean], { ok: boolean; tracks?: TrackItem[]; is_mixed?: boolean; error?: string }>("get_playlist_tracks");
const backendGetSavedAlbums = callable<[number], { ok: boolean; albums?: AlbumItem[]; total?: number; error?: string }>("get_saved_albums");
const backendGetAlbumTracks = callable<[string, number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_album_tracks");
const backendGetFollowedArtists = callable<[], { ok: boolean; artists?: ArtistItem[]; total?: number; error?: string }>("get_followed_artists");
const backendGetArtistTopTracks = callable<[string], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_artist_top_tracks");
const backendGetArtistAlbums = callable<[string, number], { ok: boolean; albums?: AlbumItem[]; error?: string }>("get_artist_albums");
const backendGetLikedTracks = callable<[number, boolean], { ok: boolean; tracks?: TrackItem[]; total?: number; error?: string }>("get_liked_tracks");
const backendGetRecentlyPlayed = callable<[number], { ok: boolean; tracks?: TrackItem[]; error?: string }>("get_recently_played");
const backendGetSavedEpisodes = callable<[number], { ok: boolean; episodes?: EpisodeItem[]; total?: number; error?: string }>("get_saved_episodes");
const backendGetSavedShows = callable<[number], { ok: boolean; shows?: any[]; total?: number; error?: string }>("get_saved_shows");
const backendGetQueue = callable<[], { ok: boolean; queue?: TrackItem[]; error?: string }>("get_queue");
const backendGetLyrics = callable<[string, string, number, number?], { ok: boolean; synced_lyrics?: string; plain_lyrics?: string; source?: string; error?: string }>("get_lyrics");
const backendSetNativeMix = callable<[string, boolean, boolean], { ok: boolean; error?: string }>("set_native_mix");

export const DeckifyExpandedModal: FC<{ closeModal?: () => void }> = ({ closeModal }) => {
  const [mode, setMode] = useState<ViewMode>("now_playing");
  const { status, currentPositionMs, refreshStatus, clock } = usePlaybackStatus();

  // Drill-down states
  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<AlbumItem | null>(null);
  const [albumTracks, setAlbumTracks] = useState<TrackItem[]>([]);
  const [activeArtist, setActiveArtist] = useState<ArtistItem | null>(null);
  const [artistTopTracks, setArtistTopTracks] = useState<TrackItem[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<AlbumItem[]>([]);
  const [actionTrack, setActionTrack] = useState<TrackItem | null>(null);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);

  // Library & Data states
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [allUserPlaylists, setAllUserPlaylists] = useState<PlaylistItem[]>([]);
  const [likedTracks, setLikedTracks] = useState<TrackItem[]>([]);
  const [likedTotal, setLikedTotal] = useState(0);
  const [savedAlbums, setSavedAlbums] = useState<AlbumItem[]>([]);
  const [followedArtists, setFollowedArtists] = useState<ArtistItem[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<TrackItem[]>([]);
  const [savedEpisodes, setSavedEpisodes] = useState<EpisodeItem[]>([]);
  const [savedShows, setSavedShows] = useState<any[]>([]);
  const [queueTracks, setQueueTracks] = useState<TrackItem[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [mixingBusy, setMixingBusy] = useState(false);

  // Lyrics states
  const [syncedLyrics, setSyncedLyrics] = useState<SyncedLine[]>([]);
  const [plainLyrics, setPlainLyrics] = useState<string | null>(null);
  const [lyricsSource, setLyricsSource] = useState<string | null>(null);
  const [lyricsOffset, setLyricsOffset] = useState(0);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // UI state & refs
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);
  const activePlaylistRef = useRef<PlaylistItem | null>(null);
  activePlaylistRef.current = activePlaylist;
  const activeAlbumRef = useRef<AlbumItem | null>(null);
  activeAlbumRef.current = activeAlbum;
  const activeArtistRef = useRef<ArtistItem | null>(null);
  activeArtistRef.current = activeArtist;
  const actionTrackRef = useRef<TrackItem | null>(null);
  actionTrackRef.current = actionTrack;
  const focusedTrackRef = useRef<TrackItem | null>(null);
  const modeRef = useRef<ViewMode>(mode);
  modeRef.current = mode;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  // Library Loaders
  const loadFolders = useCallback(async () => {
    try {
      const res = await backendGetPlaylistFolders();
      if (res.ok && res.folders) setFolders(res.folders);
      const plRes = await backendGetPlaylists(0);
      if (plRes.ok && plRes.playlists) setAllUserPlaylists(plRes.playlists);
    } catch {}
  }, []);

  const loadLikedTracks = useCallback(async (more = false) => {
    setLoadingContent(true);
    try {
      const offset = more ? likedTracks.length : 0;
      const res = await backendGetLikedTracks(offset, false);
      if (res.ok && res.tracks) {
        setLikedTracks((prev) => (more ? [...prev, ...res.tracks!] : res.tracks!));
        if (res.total) setLikedTotal(res.total);
      }
    } catch {}
    setLoadingContent(false);
  }, [likedTracks.length]);

  const loadAlbums = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetSavedAlbums(0);
      if (res.ok && res.albums) setSavedAlbums(res.albums);
    } catch {}
    setLoadingContent(false);
  }, []);

  const loadArtists = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetFollowedArtists();
      if (res.ok && res.artists) setFollowedArtists(res.artists);
    } catch {}
    setLoadingContent(false);
  }, []);

  const loadRecent = useCallback(async () => {
    setLoadingContent(true);
    try {
      const res = await backendGetRecentlyPlayed(40);
      if (res.ok && res.tracks) setRecentlyPlayed(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, []);

  const loadEpisodes = useCallback(async () => {
    setLoadingContent(true);
    try {
      const [epRes, showRes] = await Promise.all([
        backendGetSavedEpisodes(0),
        backendGetSavedShows(0),
      ]);
      if (epRes.ok && epRes.episodes) setSavedEpisodes(epRes.episodes);
      if (showRes.ok && showRes.shows) setSavedShows(showRes.shows);
    } catch {}
    setLoadingContent(false);
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const res = await backendGetQueue();
      if (res.ok && res.queue) setQueueTracks(res.queue);
    } catch {}
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (mode === "liked") loadLikedTracks();
    else if (mode === "albums") loadAlbums();
    else if (mode === "artists") loadArtists();
    else if (mode === "recent") loadRecent();
    else if (mode === "episodes") loadEpisodes();
    else if (mode === "queue") loadQueue();
  }, [mode, loadLikedTracks, loadAlbums, loadArtists, loadRecent, loadEpisodes, loadQueue]);

  // Drill-down open handlers
  const handleOpenPlaylist = useCallback(async (pl: PlaylistItem) => {
    setActivePlaylist(pl);
    setMode("playlists");
    setLoadingContent(true);
    try {
      const res = await backendGetPlaylistTracks(pl.id, 0, true);
      if (res.ok && res.tracks) {
        setPlaylistTracks(res.tracks);
        if (res.is_mixed !== undefined) {
          setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: res.is_mixed } : null));
        }
      }
    } catch {}
    setLoadingContent(false);
  }, []);

  const handleOpenAlbum = useCallback(async (alb: AlbumItem) => {
    setActiveAlbum(alb);
    setMode("albums");
    setLoadingContent(true);
    try {
      const res = await backendGetAlbumTracks(alb.id, 0);
      if (res.ok && res.tracks) setAlbumTracks(res.tracks);
    } catch {}
    setLoadingContent(false);
  }, []);

  const handleOpenArtist = useCallback(async (art: ArtistItem) => {
    setActiveArtist(art);
    setMode("artists");
    setLoadingContent(true);
    try {
      const [topRes, albRes] = await Promise.all([
        backendGetArtistTopTracks(art.id),
        backendGetArtistAlbums(art.id, 0),
      ]);
      if (topRes.ok && topRes.tracks) setArtistTopTracks(topRes.tracks);
      if (albRes.ok && albRes.albums) setArtistAlbums(albRes.albums);
    } catch {}
    setLoadingContent(false);
  }, []);

  // Lyrics Loader
  const track = status?.track_meta || status?.track;
  const trackName = track?.name;
  const artistName = track?.artist;
  const durationSec = Math.round((track?.duration_ms || 0) / 1000);

  const fetchLyrics = useCallback(async (offset = 0) => {
    if (!trackName || !artistName) return;
    setLoadingLyrics(true);
    try {
      const res = await backendGetLyrics(trackName, artistName, durationSec, offset);
      if (res.ok) {
        setLyricsSource(res.source || "Auto");
        if (res.synced_lyrics) {
          setSyncedLyrics(parseLrc(res.synced_lyrics));
          setPlainLyrics(null);
        } else if (res.plain_lyrics) {
          setPlainLyrics(res.plain_lyrics);
          setSyncedLyrics([]);
        } else {
          setSyncedLyrics([]);
          setPlainLyrics("No lyrics found from this provider.");
        }
      } else {
        setSyncedLyrics([]);
        setPlainLyrics("Lyrics could not be loaded.");
      }
    } catch {
      setSyncedLyrics([]);
      setPlainLyrics("Lyrics load error.");
    } finally {
      setLoadingLyrics(false);
    }
  }, [trackName, artistName, durationSec]);

  useEffect(() => {
    if (mode !== "lyrics") return;
    setLyricsOffset(0);
    fetchLyrics(0);
  }, [mode, trackName, artistName, durationSec, fetchLyrics]);

  const handleNextLyricsSource = useCallback(() => {
    const nextOffset = lyricsOffset + 1;
    setLyricsOffset(nextOffset);
    fetchLyrics(nextOffset);
    showToast("Trying next lyrics provider...");
  }, [lyricsOffset, fetchLyrics, showToast]);

  useEffect(() => {
    if (!syncedLyrics.length) return;
    let idx = -1;
    for (let i = 0; i < syncedLyrics.length; i++) {
      if (currentPositionMs >= syncedLyrics[i].timeMs) idx = i;
      else break;
    }
    setCurrentLineIndex(idx);
  }, [currentPositionMs, syncedLyrics]);

  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIndex]);

  // Native Mix toggle
  const handleToggleMix = useCallback(async () => {
    if (!activePlaylist || mixingBusy) return;
    setMixingBusy(true);
    const targetMix = !activePlaylist.is_mixed;
    try {
      const res = await backendSetNativeMix(activePlaylist.uri, targetMix, true);
      if (res.ok) {
        setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: targetMix } : null));
        showToast(targetMix ? "Native Mix activated!" : "Native Mix deactivated.");
      } else {
        showToast(`Mix error: ${res.error || "Failed"}`);
      }
    } catch {
      showToast("Error applying mix.");
    } finally {
      setMixingBusy(false);
    }
  }, [activePlaylist, mixingBusy, showToast]);

  // Playback Control Handlers
  const isPlaying = status?.is_playing;
  const handlePlayPause = useCallback(async () => {
    await backendControlPlayback(isPlaying ? "pause" : "play", "");
    refreshStatus();
  }, [isPlaying, refreshStatus]);

  const handleNext = useCallback(async () => {
    await backendControlPlayback("next", "");
    refreshStatus();
  }, [refreshStatus]);

  const handlePrev = useCallback(async () => {
    await backendControlPlayback("previous", "");
    refreshStatus();
  }, [refreshStatus]);

  const handleToggleLike = useCallback(async (trackId?: string) => {
    const tid = trackId || (status?.track_meta || status?.track)?.track_id || (status?.track_meta || status?.track)?.id;
    if (!tid) return;
    const res = await backendToggleLike(tid, null);
    if (res.ok) {
      showToast(res.is_liked ? "Added to Liked Songs" : "Removed from Liked Songs");
      refreshStatus();
    }
  }, [status, showToast, refreshStatus]);

  const handleToggleRepeat = useCallback(async () => {
    const current = status?.repeat_state || "off";
    const next = current === "off" ? "context" : current === "context" ? "track" : "off";
    await backendSetRepeat(next, "");
    showToast(next === "track" ? "Repeat: Track" : next === "context" ? "Repeat: Context" : "Repeat: Off");
    refreshStatus();
  }, [status, showToast, refreshStatus]);

  const handleSetShuffle = useCallback(async (state: boolean) => {
    await backendSetShuffle(state, "");
    showToast(state ? "Shuffle: On" : "Shuffle: Off");
    refreshStatus();
  }, [showToast, refreshStatus]);

  const handlePlayTrack = useCallback(async (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => {
    if (contextUri) {
      await backendPlayTracks(contextUri, uri || null, null, 0);
    } else if (allUris && allUris.length > 0) {
      await backendPlayTracks(null, null, allUris, startIdx ?? 0);
    } else {
      await backendPlayTracks(null, uri || null, null, 0);
    }
    showToast("Playback started");
    refreshStatus();
  }, [showToast, refreshStatus]);

  const handlePlayQueueTrack = handlePlayTrack;

  const handleSeekDelta = useCallback((seconds: number) => {
    clock.scrubDelta(seconds * 1000);
  }, [clock]);

  const handleSeekPlayback = useCallback((timeMs: number) => {
    clock.scrubTo(timeMs);
  }, [clock]);

  const handleVolumeDelta = useCallback(async (delta: number) => {
    const cur = typeof status?.volume === "number" ? status.volume : 50;
    const target = Math.min(100, Math.max(0, cur + delta));
    await backendSetVolume(target);
    showToast(`Volume: ${target}%`);
    refreshStatus();
  }, [status, showToast, refreshStatus]);

  // Track Action Handlers
  const handleStartRadio = useCallback(async (t: TrackItem) => {
    const tid = t.id || t.uri?.replace("spotify:track:", "");
    if (!tid) return;
    showToast(`Starting radio for ${t.name}...`);
    try {
      const res = await backendGetTrackRecommendations(tid, 25);
      if (res.ok && res.tracks && res.tracks.length > 0) {
        const uris = res.tracks.map((x) => x.uri).filter(Boolean) as string[];
        if (uris.length) {
          await backendPlayTracks(null, uris[0], uris, 0);
          showToast(`Radio started (${uris.length} tracks)`);
          refreshStatus();
        }
      } else {
        showToast("No recommendations found.");
      }
    } catch {
      showToast("Error fetching recommendations.");
    }
    setActionTrack(null);
  }, [showToast, refreshStatus]);

  const handleAddToQueue = useCallback(async (t: TrackItem) => {
    if (!t.uri) return;
    const res = await backendAddToQueue(t.uri, "");
    if (res.ok) showToast(`Added to queue: ${t.name}`);
    else showToast(`Queue error: ${res.error || "Failed"}`);
    setActionTrack(null);
  }, [showToast]);

  const handleAddTrackToPlaylist = useCallback(async (playlistId: string, playlistName: string) => {
    if (!actionTrack?.uri) return;
    const res = await backendAddTrackToPlaylist(playlistId, actionTrack.uri);
    if (res.ok) showToast(`Added to ${playlistName}`);
    else showToast(`Error adding: ${res.error || "Failed"}`);
    setShowAddToPlaylistModal(false);
    setActionTrack(null);
  }, [actionTrack, showToast]);

  const handleRemoveTrackFromActivePlaylist = useCallback(async () => {
    if (!activePlaylist?.id || !actionTrack?.uri) return;
    const res = await backendRemoveTrackFromPlaylist(activePlaylist.id, actionTrack.uri);
    if (res.ok) {
      showToast("Removed from playlist");
      setPlaylistTracks((prev) => prev.filter((t) => t.uri !== actionTrack.uri));
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
    setActionTrack(null);
  }, [activePlaylist, actionTrack, showToast]);

  // Playlist/Folder Management
  const handleCreatePlaylist = useCallback(async (name: string) => {
    const res = await backendCreatePlaylist(name, true);
    if (res.ok) {
      showToast(`Playlist '${name}' created!`);
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [showToast, loadFolders]);

  const handleCreateFolder = useCallback(async (name: string) => {
    const res = await backendManagePlaylistFolder("create", "", name, "");
    if (res.ok) {
      showToast(`Folder '${name}' created`);
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [showToast, loadFolders]);

  const handleRenameFolder = useCallback(async (folderId: string, newName: string) => {
    const res = await backendManagePlaylistFolder("rename", folderId, newName, "");
    if (res.ok) {
      showToast("Folder renamed");
      loadFolders();
    } else {
      showToast(`Error: ${res.error || "Failed"}`);
    }
  }, [showToast, loadFolders]);

  const handleDeleteFolder = useCallback(async (folderId: string, folderName: string) => {
    const res = await backendManagePlaylistFolder("delete", folderId, "", "");
    if (res.ok) {
      showToast(`Folder '${folderName}' deleted`);
      loadFolders();
    }
  }, [showToast, loadFolders]);

  // Mode Selection & Gamepad Cycle
  const handleSelectMode = useCallback((id: ViewMode) => {
    setActivePlaylist(null);
    setActiveAlbum(null);
    setActiveArtist(null);
    setActionTrack(null);
    setShowAddToPlaylistModal(false);
    focusedTrackRef.current = null;
    setMode(id);
  }, []);

  const cycleMode = useCallback((direction: 1 | -1) => {
    const curIdx = ALL_MODES.indexOf(modeRef.current);
    if (curIdx === -1) return;
    const nextIdx = (curIdx + direction + ALL_MODES.length) % ALL_MODES.length;
    handleSelectMode(ALL_MODES[nextIdx]);
  }, [handleSelectMode]);

  // Gamepad & Keyboard Listeners
  useEffect(() => {
    const handleGamepadAction = (btn: any, e?: any) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      const isL1 = btn === "L1" || btn === "LB" || btn === 5 || btn === "BUMPER_LEFT" || btn === "BUTTON_LEFT_BUMPER";
      const isR1 = btn === "R1" || btn === "RB" || btn === 6 || btn === "BUMPER_RIGHT" || btn === "BUTTON_RIGHT_BUMPER";
      const button = (btn === "Y" || btn === "y" || btn === 4 || btn === "OPTIONS" || btn === "BUTTON_Y")
        ? "Y"
        : (btn === "X" || btn === "x" || btn === 3 || btn === "SECONDARY" || btn === "BUTTON_X")
        ? "X"
        : btn;

      if (isL1) cycleMode(-1);
      else if (isR1) cycleMode(1);
      else if (button === "Y") { // Gamepad Y button opens action menu
        if (modeRef.current !== "engine" && modeRef.current !== "devices") {
          const candidate = focusedTrackRef.current || (modeRef.current === "now_playing" ? (track as any) : null);
          if (candidate && (candidate.id || candidate.track_id || candidate.uri)) {
            if (e) { e.preventDefault?.(); e.stopPropagation?.(); }
            setActionTrack(candidate);
          }
        }
      } else if (button === "X") { // Gamepad X button toggles track like status
        if (modeRef.current !== "engine" && modeRef.current !== "devices") {
          const t = (focusedTrackRef.current || (modeRef.current === "now_playing" ? track : null)) as any;
          if (t?.id || t?.track_id) {
            if (e) { e.preventDefault?.(); e.stopPropagation?.(); }
            handleToggleLike(t.id || t.track_id);
          }
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toUpperCase();
      if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;

      if (e.key === "PageUp" || e.key === "[" || (e as any).code === "GamepadBumperLeft") {
        cycleMode(-1);
      } else if (e.key === "PageDown" || e.key === "]" || (e as any).code === "GamepadBumperRight") {
        cycleMode(1);
      } else if (e.key === "y" || e.key === "Y") {
        handleGamepadAction("Y", e);
      } else if (e.key === "x" || e.key === "X") {
        handleGamepadAction("X", e);
      }
    };

    const handleVgpButton = (e: any) => {
      const btn = e.detail?.button ?? e.detail ?? e.button;
      handleGamepadAction(btn, e);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("vgp_onbuttondown", handleVgpButton);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("vgp_onbuttondown", handleVgpButton);
    };
  }, [track, handleToggleLike, cycleMode]);

  // Breadcrumb B navigation handler
  const attachNav = useCallback((el: HTMLDivElement | null) => {
    if (!el || (el as any).__deckifyNavAttached) return;
    (el as any).__deckifyNavAttached = true;

    el.addEventListener("vgp_oncancel", (e: Event) => {
      if (actionTrackRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionTrack(null);
        return;
      }
      if (activeAlbumRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActiveAlbum(null);
        return;
      }
      if (activeArtistRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActiveArtist(null);
        return;
      }
      if (activePlaylistRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActivePlaylist(null);
        return;
      }
      closeModal?.();
    }, true);
  }, [closeModal]);

  const audioBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
  const artwork = track?.artwork_url || track?.image_url;

  return (
    <ModalRootAny closeModal={closeModal} onCancel={closeModal} bAllowFullSize>
      <div ref={attachNav} style={{ display: "contents" }}>
        <div
          style={{
            ...FULL_BLEED,
            height: "84vh",
            display: "flex",
            flexDirection: "column",
            borderRadius: 14,
            background: "#121212",
            color: "#fff",
            overflow: "hidden",
            boxShadow: "0 24px 64px rgba(0,0,0,0.85)",
            border: "1px solid rgba(255,255,255,0.08)",
            position: "relative",
          }}
        >
          {/* Ambient Glow */}
          {artwork && (
            <div
              style={{
                position: "absolute",
                top: -80,
                right: -80,
                width: 480,
                height: 480,
                borderRadius: "50%",
                backgroundImage: `url(${artwork})`,
                backgroundSize: "cover",
                filter: "blur(90px) saturate(200%)",
                opacity: 0.22,
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
          )}

          {/* Main Body */}
          <Focusable
            flow-children="horizontal"
            tabIndex={actionTrack ? -1 : undefined}
            style={{
              display: "flex",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
              pointerEvents: actionTrack ? "none" : "auto",
            }}
          >
            {/* Left Sidebar */}
            <Sidebar
              mode={mode}
              status={status}
              onSelectMode={handleSelectMode}
              closeModal={closeModal}
            />

            {/* Right Content Panel */}
            <Focusable
              flow-children="column"
              navEntryPreferPosition={NavEntryPositionPreferences.FIRST}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "20px 28px",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}
            >
              {mode === "now_playing" && (
                <NowPlayingTab
                  status={status}
                  currentPositionMs={currentPositionMs}
                  handlePlayPause={handlePlayPause}
                  handleNext={handleNext}
                  handlePrev={handlePrev}
                  handleToggleRepeat={handleToggleRepeat}
                  handleToggleLike={handleToggleLike}
                  handleSeekDelta={handleSeekDelta}
                  handleVolumeDelta={handleVolumeDelta}
                  onSetShuffle={handleSetShuffle}
                  onSeekPlayback={handleSeekPlayback}
                />
              )}

              {mode === "lyrics" && (
                <LyricsTab
                  trackName={trackName}
                  artistName={artistName}
                  lyricsSource={lyricsSource || undefined}
                  handleNextLyricsSource={handleNextLyricsSource}
                  loadingLyrics={loadingLyrics}
                  syncedLyrics={syncedLyrics}
                  plainLyrics={plainLyrics}
                  currentLineIndex={currentLineIndex}
                  activeLineRef={activeLineRef}
                  onSeekPlayback={handleSeekPlayback}
                />
              )}

              {mode === "playlists" && (
                <PlaylistsTab
                  folders={folders}
                  allUserPlaylists={allUserPlaylists}
                  activePlaylist={activePlaylist}
                  playlistTracks={playlistTracks}
                  loadingContent={loadingContent}
                  audioBackend={audioBackend}
                  mixingBusy={mixingBusy}
                  onOpenPlaylist={handleOpenPlaylist}
                  onClosePlaylist={() => setActivePlaylist(null)}
                  onPlayTrack={handlePlayTrack}
                  onToggleMix={handleToggleMix}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                  onCreatePlaylist={handleCreatePlaylist}
                  onCreateFolder={handleCreateFolder}
                  onRenameFolder={handleRenameFolder}
                  onDeleteFolder={handleDeleteFolder}
                />
              )}

              {mode === "liked" && (
                <LikedSongsTab
                  likedTracks={likedTracks}
                  likedTotal={likedTotal}
                  loadingContent={loadingContent}
                  onPlayTrack={handlePlayTrack}
                  onLoadMore={() => loadLikedTracks(true)}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                />
              )}

              {mode === "albums" && (
                <AlbumsTab
                  savedAlbums={savedAlbums}
                  activeAlbum={activeAlbum}
                  albumTracks={albumTracks}
                  loadingContent={loadingContent}
                  onOpenAlbum={handleOpenAlbum}
                  onCloseAlbum={() => setActiveAlbum(null)}
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                />
              )}

              {mode === "artists" && (
                <ArtistsTab
                  followedArtists={followedArtists}
                  activeArtist={activeArtist}
                  artistTopTracks={artistTopTracks}
                  artistAlbums={artistAlbums}
                  loadingContent={loadingContent}
                  onOpenArtist={handleOpenArtist}
                  onCloseArtist={() => setActiveArtist(null)}
                  onOpenAlbum={handleOpenAlbum}
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                />
              )}

              {mode === "recent" && (
                <RecentTab
                  recentlyPlayed={recentlyPlayed}
                  loadingContent={loadingContent}
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                />
              )}

              {mode === "episodes" && (
                <PodcastsTab
                  savedShows={savedShows}
                  savedEpisodes={savedEpisodes}
                  onPlayTrack={handlePlayTrack}
                />
              )}

              {mode === "search" && (
                <SearchTab
                  onPlayTrack={handlePlayTrack}
                  onToggleLike={handleToggleLike}
                  onOpenActions={(t) => setActionTrack(t)}
                  onOpenPlaylist={handleOpenPlaylist}
                  onOpenArtist={handleOpenArtist}
                  onOpenAlbum={handleOpenAlbum}
                />
              )}

              {mode === "queue" && (
                <QueueTab
                  queueTracks={queueTracks}
                  handlePlayTrack={handlePlayQueueTrack}
                  handleToggleLike={handleToggleLike}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                />
              )}

              {mode === "devices" && (
                <DevicesTab showToast={showToast} />
              )}

              {mode === "engine" && (
                <SettingsTab
                  status={status}
                  refreshStatus={refreshStatus}
                  showToast={showToast}
                />
              )}
            </Focusable>
          </Focusable>

          {/* Context Modal for Track Actions & Playlist Selection */}
          <TrackActionModal
            actionTrack={actionTrack}
            activePlaylist={activePlaylist}
            showAddToPlaylistModal={showAddToPlaylistModal}
            allUserPlaylists={allUserPlaylists}
            onClose={() => setActionTrack(null)}
            onPlayTrack={handlePlayTrack}
            onAddToQueue={handleAddToQueue}
            onOpenAddToPlaylist={() => setShowAddToPlaylistModal(true)}
            onCloseAddToPlaylist={() => setShowAddToPlaylistModal(false)}
            onAddTrackToPlaylist={handleAddTrackToPlaylist}
            onStartRadio={handleStartRadio}
            onOpenArtist={handleOpenArtist}
            onOpenAlbum={handleOpenAlbum}
            onRemoveFromPlaylist={handleRemoveTrackFromActivePlaylist}
            onToggleLike={handleToggleLike}
            setMode={handleSelectMode}
          />

          {/* Toast Notification */}
          {toastMsg && (
            <div
              style={{
                position: "absolute",
                bottom: 24,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0, 0, 0, 0.88)",
                border: "1px solid rgba(29, 185, 84, 0.6)",
                borderRadius: 20,
                padding: "8px 20px",
                fontSize: 13,
                fontWeight: 700,
                color: "#1db954",
                boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
                zIndex: 200,
              }}
            >
              {toastMsg}
            </div>
          )}
        </div>
      </div>
    </ModalRootAny>
  );
};
