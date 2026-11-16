import { FC, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Focusable, ModalRoot, NavEntryPositionPreferences } from "@decky/ui";
import { callable, toaster } from "@decky/api";
// Note: Child views render heart icons: FaHeart, FaRegHeart
import {
  AlbumItem,
  ArtistItem,
  EpisodeItem,
  FolderItem,
  PinnedPlaylistItem,
  PlaylistItem,
  SyncedLine,
  TrackItem,
  TrackMeta,
  StatusResponse,
  ViewMode,
  ALL_MODES,
} from "../types";
import { parseLrc } from "../utils";
import { computeListJump } from "../utils/listNavigation";
import { usePlaybackStatus } from "../hooks/usePlaybackStatus";
import { useTriggerNavigation } from "../hooks/useTriggerNavigation";
import { Sidebar } from "./common/Sidebar";
import { TrackActionModal } from "./common/TrackActionModal";
import { CollectionActionModal } from "./common/CollectionActionModal";

// Modular tab components
import { NowPlayingTab } from "./tabs/NowPlayingTab";
import { LyricsTab } from "./tabs/LyricsTab";
import { DiscoveryTab } from "./tabs/DiscoveryTab";
import { PlaylistsTab } from "./tabs/PlaylistsTab";
import { LikedSongsTab } from "./tabs/LikedSongsTab";
import { AlbumsTab } from "./tabs/AlbumsTab";
import { ArtistsTab } from "./tabs/ArtistsTab";
import { RecentTab } from "./tabs/RecentTab";
import { PodcastsTab } from "./tabs/PodcastsTab";
import { SearchTab } from "./tabs/SearchTab";
import { QueueTab } from "./tabs/QueueTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { SoundtracksTab } from "./tabs/SoundtracksTab";
import { SettingsTab } from "./tabs/SettingsTab";

// Backward-compatible re-exports
export { DeckifyImage } from "./common/DeckifyImage";
export { InteractiveRow } from "./common/InteractiveRow";

const ModalRootAny = ModalRoot as any;

export const SEEK_ACCUMULATION_WINDOW_MS = 600;

const FULL_BLEED = {
  width: "96vw",
  marginLeft: "calc((100% - 96vw) / 2)",
  boxSizing: "border-box" as const,
};

// RPC Callables
const backendPlayTracks = callable<[string | null, string | null, string[] | null, number], { ok: boolean; error?: string }>("play_tracks");
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
const backendSetSetting = callable<[string, unknown], { ok: boolean; settings?: any; error?: string }>("set_setting");

export const DeckifyExpandedModal: FC<{ closeModal?: () => void }> = ({ closeModal }) => {
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;
  useEffect(() => () => { closeModalRef.current?.(); }, []);

  const [mode, setMode] = useState<ViewMode>("now_playing");
  const { status, setStatus, currentPositionMs, refreshStatus, clock } = usePlaybackStatus();
  const hasResolvedInitialModeRef = useRef(false);

  useEffect(() => {
    if (hasResolvedInitialModeRef.current || !status) return;
    hasResolvedInitialModeRef.current = true;
    const activeTrack = status.track_meta || status.track;
    if (!activeTrack?.name) {
      setMode((prev) => (prev === "now_playing" ? "discovery" : prev));
    }
  }, [status]);

  // Drill-down states
  const [activePlaylist, setActivePlaylist] = useState<PlaylistItem | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<TrackItem[]>([]);
  const [activeAlbum, setActiveAlbum] = useState<AlbumItem | null>(null);
  const [albumTracks, setAlbumTracks] = useState<TrackItem[]>([]);
  const [activeArtist, setActiveArtist] = useState<ArtistItem | null>(null);
  const [artistTopTracks, setArtistTopTracks] = useState<TrackItem[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<AlbumItem[]>([]);
  const [actionTrack, setActionTrack] = useState<TrackItem | null>(null);
  const [actionCollection, setActionCollection] = useState<PinnedPlaylistItem | null>(null);
  const [showAddToPlaylistModal, setShowAddToPlaylistModal] = useState(false);
  const [playlistPickerOpen, setPlaylistPickerOpen] = useState(false);

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
  const [pillMsg, setPillMsg] = useState<string | null>(null);
  const pillTimerRef = useRef<any>(null);
  const pendingSeekDeltaSecRef = useRef(0);
  const seekDebounceTimerRef = useRef<any>(null);
  const seekBaseMsRef = useRef(0);
  const currentPositionMsRef = useRef(currentPositionMs);
  currentPositionMsRef.current = currentPositionMs;
  const activePlaylistRef = useRef<PlaylistItem | null>(null);
  activePlaylistRef.current = activePlaylist;
  const activeAlbumRef = useRef<AlbumItem | null>(null);
  activeAlbumRef.current = activeAlbum;
  const activeArtistRef = useRef<ArtistItem | null>(null);
  activeArtistRef.current = activeArtist;
  const actionTrackRef = useRef<TrackItem | null>(null);
  actionTrackRef.current = actionTrack;
  const actionCollectionRef = useRef<PinnedPlaylistItem | null>(null);
  actionCollectionRef.current = actionCollection;
  const focusedTrackRef = useRef<TrackItem | null>(null);
  const focusedCollectionRef = useRef<PinnedPlaylistItem | null>(null);
  const contentPaneRef = useRef<HTMLDivElement | null>(null);
  const modeRef = useRef<ViewMode>(mode);
  modeRef.current = mode;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3000);
  }, []);

  const showPill = useCallback((msg: string) => {
    setPillMsg(msg);
    if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    pillTimerRef.current = setTimeout(() => setPillMsg(null), 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
      if (seekDebounceTimerRef.current) clearTimeout(seekDebounceTimerRef.current);
    };
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

  const loadRecent = useCallback(async (silent = false) => {
    if (!silent) setLoadingContent(true);
    try {
      const res = await backendGetRecentlyPlayed(40);
      if (res.ok && res.tracks) setRecentlyPlayed(res.tracks);
    } catch {}
    if (!silent) setLoadingContent(false);
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
  }, [mode, loadLikedTracks, loadAlbums, loadArtists, loadRecent, loadEpisodes]);

  useEffect(() => {
    if (mode !== "queue") return undefined;
    loadQueue();
    const interval = setInterval(loadQueue, 10000);
    return () => clearInterval(interval);
  }, [mode, loadQueue]);

  // Drill-down open handlers
  const handleOpenPlaylist = useCallback(async (pl: PlaylistItem) => {
    focusedCollectionRef.current = null;
    setActivePlaylist(pl);
    setPlaylistTracks([]);
    setMode("playlists");
    setLoadingContent(true);
    try {
      const res = await backendGetPlaylistTracks(pl.id, 0, true);
      if (res.ok && res.tracks) {
        setPlaylistTracks(res.tracks);
        if (res.is_mixed !== undefined) {
          setActivePlaylist((prev) => (prev ? { ...prev, is_mixed: res.is_mixed } : null));
        }
      } else {
        showToast(res?.error || "Failed to load playlist tracks");
      }
    } catch {
      showToast("Failed to load playlist tracks");
    }
    setLoadingContent(false);
  }, [showToast]);

  const handleOpenAlbum = useCallback(async (alb: AlbumItem) => {
    focusedCollectionRef.current = null;
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
  const activeTrackId = track?.track_id || track?.id || "";
  const lastRecentTrackIdRef = useRef<string>(activeTrackId);

  useEffect(() => {
    if (mode !== "recent") {
      lastRecentTrackIdRef.current = activeTrackId;
      return undefined;
    }
    const interval = setInterval(() => loadRecent(true), 10000);
    if (!activeTrackId || lastRecentTrackIdRef.current === activeTrackId) {
      return () => clearInterval(interval);
    }
    lastRecentTrackIdRef.current = activeTrackId;
    loadRecent(true);
    const t1 = setTimeout(() => loadRecent(true), 3000);
    const t2 = setTimeout(() => loadRecent(true), 8000);
    return () => {
      clearInterval(interval);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [mode, activeTrackId, loadRecent]);
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
    const nextOffset = (lyricsOffset + 1) % 5;
    setLyricsOffset(nextOffset);
    fetchLyrics(nextOffset);
    showToast("Trying next lyrics provider...");
  }, [lyricsOffset, fetchLyrics, showToast]);

  const handleSelectLyricsSource = useCallback(
    (offset: number, label: string) => {
      setLyricsOffset(offset);
      fetchLyrics(offset);
      showToast(`Loading lyrics from ${label}...`);
    },
    [fetchLyrics, showToast]
  );

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
    const pid = activePlaylist.uri || activePlaylist.id || "";
    try {
      const res = await backendSetNativeMix(pid, targetMix, true);
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
    try {
      const res = await backendToggleLike(tid, null);
      if (res?.ok) {
        showToast(res.is_liked ? "Added to Liked Songs" : "Removed from Liked Songs");
        refreshStatus();
      } else {
        showToast(res?.error || "Failed to update Liked Songs");
      }
    } catch {
      showToast("Failed to update Liked Songs");
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
    let res;
    if (contextUri) {
      res = await backendPlayTracks(contextUri, uri || null, null, startIdx ?? 0);
    } else if (allUris && allUris.length > 0) {
      res = await backendPlayTracks(null, uri || null, allUris, startIdx ?? 0);
    } else {
      res = await backendPlayTracks(null, uri || null, null, 0);
    }
    if (res && res.ok === false) {
      showToast(res.error || "Playback failed");
      return;
    }
    showToast("Playback started");
    refreshStatus();
  }, [showToast, refreshStatus]);

  const handlePlayQueueTrack = useCallback(async (clickedTrack: TrackItem, idx: number) => {
    const remaining = queueTracks.slice(idx + 1);
    setQueueTracks(remaining);

    setStatus((prev) => {
      const promotedMeta: TrackMeta = {
        name: clickedTrack.name || "",
        artist: clickedTrack.artist || "",
        album: clickedTrack.album || "",
        artwork_url: clickedTrack.artwork_url || clickedTrack.image_url || null,
        image_url: clickedTrack.image_url || clickedTrack.artwork_url || null,
        duration_ms: clickedTrack.duration_ms || 0,
        uri: clickedTrack.uri,
        id: clickedTrack.id,
        track_id: clickedTrack.id,
        is_liked: clickedTrack.is_liked,
      };
      return prev
        ? {
            ...prev,
            is_playing: true,
            position_ms: 0,
            track: promotedMeta,
            track_meta: promotedMeta,
          }
        : ({
            is_playing: true,
            position_ms: 0,
            track: promotedMeta,
            track_meta: promotedMeta,
          } as StatusResponse);
    });

    const uris = queueTracks.slice(idx).map((x) => x.uri).filter(Boolean) as string[];
    try {
      const res = await backendPlayTracks(null, null, uris, 0);
      if (res && !res.ok && res.error) {
        showToast(res.error);
      } else {
        showToast("Playback started");
      }
    } catch {
      showToast("Failed to start playback");
    }

    refreshStatus();

    setTimeout(async () => {
      await loadQueue();
      await refreshStatus();
    }, 600);
  }, [queueTracks, setStatus, showToast, refreshStatus, loadQueue]);

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

  const pinnedPlaylists: PinnedPlaylistItem[] = status?.settings?.pinned_playlists || [];
  const pinnedUris = useMemo(
    () => new Set(pinnedPlaylists.map((p) => p.uri)),
    [pinnedPlaylists]
  );

  const handleTogglePin = useCallback(
    async (item: PinnedPlaylistItem) => {
      const exists = pinnedPlaylists.some((p) => p.uri === item.uri);
      if (exists) {
        const next = pinnedPlaylists.filter((p) => p.uri !== item.uri);
        const res = await backendSetSetting("pinned_playlists", next);
        if (res?.ok) {
          setStatus((prev) =>
            prev
              ? {
                  ...prev,
                  settings: res.settings
                    ? { ...prev.settings, ...res.settings }
                    : { ...(prev.settings || {}), pinned_playlists: next },
                }
              : prev
          );
          toaster.toast({ title: "Deckify", body: "Unpinned from QAM", duration: 2500 });
        }
        return;
      }

      if (pinnedPlaylists.length >= 4) {
        toaster.toast({
          title: "Deckify",
          body: "Max 4 pinned items — unpin one first",
          duration: 3000,
        });
        return;
      }

      const next = [...pinnedPlaylists, item];
      const res = await backendSetSetting("pinned_playlists", next);
      if (res?.ok) {
        setStatus((prev) =>
          prev
            ? {
                ...prev,
                settings: res.settings
                  ? { ...prev.settings, ...res.settings }
                  : { ...(prev.settings || {}), pinned_playlists: next },
              }
            : prev
        );
        toaster.toast({ title: "Deckify", body: "Pinned to QAM", duration: 2500 });
      }
    },
    [pinnedPlaylists, setStatus]
  );

  // Mode Selection & Gamepad Cycle
  const handleSelectMode = useCallback((id: ViewMode) => {
    setActivePlaylist(null);
    setActiveAlbum(null);
    setActiveArtist(null);
    setActionTrack(null);
    setActionCollection(null);
    setShowAddToPlaylistModal(false);
    setPlaylistPickerOpen(false);
    focusedTrackRef.current = null;
    focusedCollectionRef.current = null;
    setMode(id);
  }, []);

  const handleFocusTrack = useCallback((t: TrackItem | null) => {
    focusedTrackRef.current = t;
  }, []);

  const cycleMode = useCallback((direction: 1 | -1) => {
    const curIdx = ALL_MODES.indexOf(modeRef.current);
    if (curIdx === -1) return;
    const nextIdx = (curIdx + direction + ALL_MODES.length) % ALL_MODES.length;
    handleSelectMode(ALL_MODES[nextIdx]);
  }, [handleSelectMode]);

  // Modal-scoped Gamepad, Analog Trigger & Keyboard Navigation
  const triggerNavEnabled = (status?.settings as any)?.trigger_nav_enabled !== false;
  useTriggerNavigation({
    enabled: triggerNavEnabled,
    suppressed: Boolean(actionTrack || showAddToPlaylistModal || actionCollection || playlistPickerOpen),
    onTrigger: useCallback(
      (side) => {
        if (!triggerNavEnabled) return;
        if (modeRef.current === "now_playing" || modeRef.current === "lyrics") {
          const durationMs = (status as any)?.duration_ms || track?.duration_ms || 0;
          if (!track || durationMs <= 0) return;

          const seekStepSec = Math.min(
            30,
            Math.max(5, Number((status?.settings as any)?.trigger_seek_seconds ?? 10))
          );

          if (pendingSeekDeltaSecRef.current === 0) {
            seekBaseMsRef.current = currentPositionMsRef.current;
          }
          pendingSeekDeltaSecRef.current += side === "R2" ? seekStepSec : -seekStepSec;

          const maxSeekMs = Math.max(0, durationMs - 1000);
          const targetMs = Math.min(
            maxSeekMs,
            Math.max(0, seekBaseMsRef.current + pendingSeekDeltaSecRef.current * 1000)
          );

          clock.scrubTo?.(targetMs);
          showPill(
            (pendingSeekDeltaSecRef.current >= 0 ? "+" : "") +
              pendingSeekDeltaSecRef.current +
              "s"
          );

          if (seekDebounceTimerRef.current) {
            clearTimeout(seekDebounceTimerRef.current);
          }
          seekDebounceTimerRef.current = setTimeout(() => {
            seekDebounceTimerRef.current = null;
            pendingSeekDeltaSecRef.current = 0;
            handleSeekPlayback(targetMs);
          }, SEEK_ACCUMULATION_WINDOW_MS);
          return;
        }

        const listModes: ViewMode[] = [
          "playlists",
          "liked",
          "albums",
          "artists",
          "recent",
          "episodes",
          "search",
          "queue",
          "soundtracks",
        ];
        if (!listModes.includes(modeRef.current)) return;
        const paneEl = contentPaneRef.current;
        if (!paneEl) return;
        const domFocusedInPane = Boolean(paneEl.contains(document.activeElement));
        const virtualFocusedEl = paneEl.querySelector(
          '[data-deckify-focused="true"], .gpfocus'
        ) as HTMLElement | null;
        if (!domFocusedInPane && !virtualFocusedEl) return;

        const rows = Array.from(
          paneEl.querySelectorAll('[data-deckify-list-item="true"]')
        ) as HTMLElement[];
        if (rows.length === 0) return;

        const labels = rows.map((el) => el.getAttribute("data-deckify-label") || "");
        const activeEl = domFocusedInPane
          ? (document.activeElement as HTMLElement | null)
          : virtualFocusedEl;
        const foundIdx = activeEl
          ? rows.findIndex((el) => el === activeEl || el.contains(activeEl))
          : -1;
        const currentIndex = foundIdx >= 0 ? foundIdx : 0;
        const sortedAz = Boolean(
          paneEl.querySelector('[data-deckify-sorted="az"]')
        );
        const pageSize = Math.min(
          50,
          Math.max(5, Number((status?.settings as any)?.trigger_page_size ?? 15))
        );
        const direction: -1 | 1 = side === "R2" ? 1 : -1;
        const result = computeListJump(labels, currentIndex, direction, pageSize, sortedAz);
        if (!result) return;

        if (
          result.shouldLoadMore &&
          modeRef.current === "liked" &&
          likedTotal > likedTracks.length
        ) {
          loadLikedTracks(true);
        } else {
          const targetEl = rows[result.targetIndex];
          if (targetEl) {
            targetEl.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
            targetEl.focus?.();
          }
        }
        showPill(result.badge);
      },
      [
        triggerNavEnabled,
        status,
        track,
        clock,
        showPill,
        handleSeekPlayback,
        likedTotal,
        likedTracks.length,
        loadLikedTracks,
      ]
    ),
    onAction: useCallback(
      (action, e) => {
        if (action === "L1") {
          cycleMode(-1);
        } else if (action === "R1") {
          cycleMode(1);
        } else if (action === "Y") { // Gamepad Y button opens action menu
          if (focusedTrackRef.current || (modeRef.current !== "engine" && modeRef.current !== "devices")) {
            const isActiveTrackMode =
              modeRef.current === "now_playing" || modeRef.current === "lyrics";
            const candidate =
              focusedTrackRef.current || (isActiveTrackMode ? (track as any) : null);
            if (candidate && (candidate.id || candidate.track_id || candidate.uri)) {
              if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
              setActionTrack(candidate);
            } else if (focusedCollectionRef.current) {
              if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
              setActionCollection(focusedCollectionRef.current);
            }
          }
        } else if (action === "X") { // Gamepad X button toggles track like status
          if (focusedTrackRef.current || (modeRef.current !== "engine" && modeRef.current !== "devices")) {
            const isActiveTrackMode =
              modeRef.current === "now_playing" || modeRef.current === "lyrics";
            const t = (focusedTrackRef.current ||
              (isActiveTrackMode ? track : null)) as any;
            if (t?.id || t?.track_id) {
              if (e) {
                e.preventDefault?.();
                e.stopPropagation?.();
              }
              handleToggleLike(t.id || t.track_id);
            }
          }
        }
      },
      [track, handleToggleLike, cycleMode]
    ),
  });

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
      if (actionCollectionRef.current) {
        e.preventDefault();
        e.stopPropagation();
        (e as any).stopImmediatePropagation?.();
        setActionCollection(null);
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
    }, false);
  }, []);

  const audioBackend = status?.audio_backend || status?.settings?.audio_backend || "librespot";
  const artwork = track?.artwork_url || track?.image_url;
  const showHints = (status?.settings as any)?.show_controller_hints !== false;
  const hintText =
    mode === "now_playing" || mode === "lyrics"
      ? "L2/R2 Seek · X Like · Y Options · L1/R1 Tabs"
      : mode === "discovery"
      ? "A Play/Open · Y Options · L1/R1 Tabs"
      : mode === "devices" || mode === "engine"
      ? "L1/R1 Tabs · B Back"
      : "L2/R2 Page · X Like · Y Options · L1/R1 Tabs";

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
            tabIndex={actionTrack || actionCollection ? -1 : undefined}
            style={{
              display: "flex",
              flex: 1,
              minHeight: 0,
              overflow: "hidden",
              position: "relative",
              zIndex: 1,
              pointerEvents: actionTrack || actionCollection ? "none" : "auto",
            }}
          >
            {/* Left Sidebar */}
            <Sidebar
              mode={mode}
              status={status}
              onSelectMode={handleSelectMode}
              closeModal={closeModal}
              onFocusTrack={handleFocusTrack}
              onOpenActions={setActionTrack}
            />

            {/* Right Content Panel */}
            <div
              ref={contentPaneRef}
              data-testid="content-pane"
              style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex" }}
            >
              <Focusable
                data-testid="content-pane-focusable"
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
                  onOpenActions={setActionTrack}
                />
              )}

              {mode === "lyrics" && (
                <LyricsTab
                  trackName={trackName}
                  artistName={artistName}
                  lyricsSource={lyricsSource || undefined}
                  handleNextLyricsSource={handleNextLyricsSource}
                  onSelectLyricsSource={handleSelectLyricsSource}
                  loadingLyrics={loadingLyrics}
                  syncedLyrics={syncedLyrics}
                  plainLyrics={plainLyrics}
                  currentLineIndex={currentLineIndex}
                  activeLineRef={activeLineRef}
                  onSeekPlayback={handleSeekPlayback}
                />
              )}

              {mode === "discovery" && (
                <DiscoveryTab
                  onPlayTrack={handlePlayTrack}
                  onOpenPlaylist={handleOpenPlaylist}
                  onOpenAlbum={handleOpenAlbum}
                  onOpenArtist={handleOpenArtist}
                  onOpenActions={(t) => setActionTrack(t)}
                  onFocusTrack={(t) => {
                    focusedTrackRef.current = t;
                    if (t) focusedCollectionRef.current = null;
                  }}
                  onFocusCollection={(c) => {
                    focusedCollectionRef.current = c;
                    if (c) focusedTrackRef.current = null;
                  }}
                  onReauthenticate={() => {
                    showToast("Open Quick Access Menu to re-authenticate Spotify");
                  }}
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
                  pinnedUris={pinnedUris}
                  onTogglePin={handleTogglePin}
                  onFocusCollection={(c) => {
                    focusedCollectionRef.current = c;
                    if (c) focusedTrackRef.current = null;
                  }}
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
                  isPinned={pinnedUris.has("spotify:collection:tracks")}
                  onTogglePin={handleTogglePin}
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
                  pinnedUris={pinnedUris}
                  onTogglePin={handleTogglePin}
                  onFocusCollection={(c) => {
                    focusedCollectionRef.current = c;
                    if (c) focusedTrackRef.current = null;
                  }}
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
                  currentlyPlaying={status?.track_meta || status?.track}
                  isPlaying={Boolean(status?.is_playing)}
                  handlePlayQueueTrack={handlePlayQueueTrack}
                  handlePlayTrack={handlePlayTrack}
                  handleToggleLike={handleToggleLike}
                  onFocusTrack={(t) => { focusedTrackRef.current = t; }}
                />
              )}

              {mode === "devices" && (
                <DevicesTab showToast={showToast} />
              )}

              {mode === "soundtracks" && (
                <SoundtracksTab showToast={showToast} onPickerOpenChange={setPlaylistPickerOpen} />
              )}

              {mode === "engine" && (
                <SettingsTab
                  status={status}
                  refreshStatus={refreshStatus}
                  showToast={showToast}
                />
              )}
              </Focusable>
            </div>
          </Focusable>

          {/* Context-Aware Controller Hint Bar */}
          {showHints && (
            <div
              data-testid="controller-hint-bar"
              style={{
                padding: "8px 24px",
                background: "rgba(0,0,0,0.65)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                fontSize: 12,
                fontWeight: 700,
                color: "rgba(255,255,255,0.7)",
                textAlign: "center",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
              }}
            >
              {hintText}
            </div>
          )}

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

          {/* Context Modal for Collection Actions (Play / Pin to QAM) */}
          {actionCollection && (
            <CollectionActionModal
              collection={actionCollection}
              isPinned={pinnedUris.has(actionCollection.uri)}
              atLimit={pinnedPlaylists.length >= 4}
              onClose={() => setActionCollection(null)}
              onPlay={(c) => handlePlayTrack("", c.uri)}
              onTogglePin={handleTogglePin}
            />
          )}

          {/* Floating Trigger Indicator Pill */}
          {pillMsg && (
            <div
              data-testid="trigger-indicator-pill"
              style={{
                position: "absolute",
                bottom: showHints ? 48 : 24,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(0,0,0,0.88)",
                border: "1px solid rgba(29, 185, 84, 0.6)",
                borderRadius: 20,
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 700,
                color: "#1db954",
                pointerEvents: "none",
                boxShadow: "0 8px 24px rgba(0,0,0,0.7)",
                zIndex: 201,
              }}
            >
              {pillMsg}
            </div>
          )}

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
