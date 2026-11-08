import { useState, useEffect, useCallback, useRef } from "react";
import {
  FaTimes,
  FaChevronLeft,
  FaMusic,
  FaHeart,
  FaRegHeart,
  FaPodcast,
  FaUser,
  FaCompactDisc,
  FaStar,
  FaHistory,
  FaPlay,
  FaRandom,
  FaPlus,
  FaFolder,
  FaFolderOpen,
  FaFolderPlus,
  FaTrash,
  FaListUl,
} from "react-icons/fa";
import {
  fetchPlaylists,
  fetchPlaylistTracks,
  fetchLikedTracks,
  fetchRecentlyPlayed,
  fetchSavedEpisodes,
  fetchSavedAlbums,
  fetchAlbumTracks,
  fetchFollowedArtists,
  fetchArtistAlbums,
  fetchArtistTopTracks,
  fetchFolders,
  manageFolder,
  playInContext,
  playUris,
  addToQueue,
  setShuffle,
  toggleLikeTrack,
  toggleNativeSpotifyMix,
  type Playlist,
  type PlaylistFolder,
  type PlaylistTrack,
  type Album,
  type Artist,
  type Episode,
} from "./api";
import { formatMs } from "./utils";

type View = "library" | "playlist" | "liked" | "recent" | "episodes" | "album" | "artist";

interface Props {
  open: boolean;
  onClose: () => void;
  onToast?: (msg: string) => void;
  onOpenAddToPlaylist?: (track: { uri: string; name: string; artist?: string }) => void;
  isSpotifyClientBackend?: boolean;
}

export default function Sidebar({
  open,
  onClose,
  onToast,
  onOpenAddToPlaylist,
  isSpotifyClientBackend = false,
}: Props) {
  const [view, setView] = useState<View>("library");
  const [loading, setLoading] = useState(false);

  // Library data
  const [madeForYou, setMadeForYou] = useState<Playlist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<Playlist[]>([]);
  const [playlistsTotal, setPlaylistsTotal] = useState(0);
  const [playlistsOffset, setPlaylistsOffset] = useState(0);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);

  // Playlist Folders state
  const [folders, setFolders] = useState<PlaylistFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [assigningPlaylistToFolder, setAssigningPlaylistToFolder] = useState<string | null>(null);

  // Drill-in: tracks (shared by playlist, liked, recent, album)
  const [drillTitle, setDrillTitle] = useState("");
  const [drillSubtitle, setDrillSubtitle] = useState("");
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [tracksTotal, setTracksTotal] = useState(0);
  const [tracksOffset, setTracksOffset] = useState(0);
  const [loadingTracks, setLoadingTracks] = useState(false);

  // Drill-in: episodes
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [episodesTotal, setEpisodesTotal] = useState(0);
  const [episodesOffset, setEpisodesOffset] = useState(0);

  // Drill-in: artist top tracks + albums
  const [artistTopTracks, setArtistTopTracks] = useState<PlaylistTrack[]>([]);
  const [artistAlbums, setArtistAlbums] = useState<Album[]>([]);

  // Context for play action
  const [activeContextId, setActiveContextId] = useState<string | null>(null);
  const [activePlaylistMixed, setActivePlaylistMixed] = useState(false);
  const [mixingBusy, setMixingBusy] = useState(false);

  const drillReqId = useRef(0);

  const splitPlaylists = useCallback((items: Playlist[]) => {
    const made: Playlist[] = [];
    const user: Playlist[] = [];
    for (const p of items) {
      if (p.owner_id === "spotify") made.push(p);
      else user.push(p);
    }
    return { made, user };
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([fetchPlaylists(), fetchSavedAlbums(), fetchFollowedArtists(), fetchFolders()])
      .then(([pl, al, ar, fl]) => {
        if (pl.ok) {
          const { made, user } = splitPlaylists(pl.playlists);
          setMadeForYou(made);
          setPlaylists(user);
          setAllPlaylists(pl.playlists);
          setPlaylistsTotal(pl.total);
          setPlaylistsOffset(pl.playlists.length);
        }
        if (al.ok) setAlbums(al.albums);
        if (ar.ok) setArtists(ar.artists);
        if (fl.ok) setFolders(fl.folders || []);
      })
      .catch((e) => console.error("Failed to load library:", e))
      .finally(() => setLoading(false));
  }, [open, splitPlaylists]);

  const loadMorePlaylists = useCallback(async () => {
    setLoadingTracks(true);
    try {
      const r = await fetchPlaylists(playlistsOffset);
      if (r.ok) {
        const { made, user } = splitPlaylists(r.playlists);
        setMadeForYou((p) => [...p, ...made]);
        setPlaylists((p) => [...p, ...user]);
        setAllPlaylists((p) => [...p, ...r.playlists]);
        setPlaylistsOffset((p) => p + r.playlists.length);
      }
    } catch (e) {
      console.error("Failed to load more playlists:", e);
    }
    setLoadingTracks(false);
  }, [playlistsOffset, splitPlaylists]);

  const handleToggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  }, []);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    try {
      const res = await manageFolder({ action: "create", name });
      if (res.ok) {
        setFolders(res.folders);
        setNewFolderName("");
        setCreatingFolder(false);
        onToast?.(`Created folder "${name}"`);
      }
    } catch (e) {
      console.error("Failed to create folder:", e);
    }
  }, [newFolderName, onToast]);

  const handleDeleteFolder = useCallback(async (e: React.MouseEvent, folder: PlaylistFolder) => {
    e.stopPropagation();
    try {
      const res = await manageFolder({ action: "delete", folder_id: folder.id });
      if (res.ok) {
        setFolders(res.folders);
        onToast?.(`Deleted folder "${folder.name}"`);
      }
    } catch (err) {
      console.error("Failed to delete folder:", err);
    }
  }, [onToast]);

  const handleAddPlaylistToFolder = useCallback(async (folderId: string, playlistId: string) => {
    try {
      const res = await manageFolder({
        action: "add_playlist",
        folder_id: folderId,
        playlist_id: playlistId,
      });
      if (res.ok) {
        setFolders(res.folders);
        setAssigningPlaylistToFolder(null);
        onToast?.("Added playlist to folder");
      }
    } catch (err) {
      console.error("Failed to add playlist to folder:", err);
    }
  }, [onToast]);

  const handleRemovePlaylistFromFolder = useCallback(async (e: React.MouseEvent, folderId: string, playlistId: string) => {
    e.stopPropagation();
    try {
      const res = await manageFolder({
        action: "remove_playlist",
        folder_id: folderId,
        playlist_id: playlistId,
      });
      if (res.ok) {
        setFolders(res.folders);
        onToast?.("Removed playlist from folder");
      }
    } catch (err) {
      console.error("Failed to remove playlist from folder:", err);
    }
  }, [onToast]);

  const openPlaylist = useCallback(async (pl: Playlist) => {
    const reqId = ++drillReqId.current;
    setView("playlist");
    setDrillTitle(pl.name);
    setDrillSubtitle(`${pl.track_count} tracks`);
    setActiveContextId(pl.id);
    setActivePlaylistMixed(Boolean(pl.is_mixed));
    setTracks([]);
    setTracksOffset(0);
    setLoadingTracks(true);
    try {
      const r = await fetchPlaylistTracks(pl.id, 0);
      if (reqId !== drillReqId.current) return;
      if (r.ok) {
        setTracks(r.tracks);
        setTracksTotal(r.total ?? r.tracks.length);
        setTracksOffset(r.tracks.length);
      }
    } catch (e) {
      console.error("Failed to load playlist tracks:", e);
    }
    if (reqId === drillReqId.current) setLoadingTracks(false);
  }, []);

  const openAlbum = useCallback(async (al: Album) => {
    const reqId = ++drillReqId.current;
    setView("album");
    setDrillTitle(al.name);
    setDrillSubtitle(al.artist);
    setActiveContextId(al.id);
    setTracks([]);
    setTracksOffset(0);
    setLoadingTracks(true);
    try {
      const r = await fetchAlbumTracks(al.id, 0);
      if (reqId !== drillReqId.current) return;
      if (r.ok) {
        setTracks(r.tracks);
        setTracksTotal(r.total ?? r.tracks.length);
        setTracksOffset(r.tracks.length);
      }
    } catch (e) {
      console.error("Failed to load album tracks:", e);
    }
    if (reqId === drillReqId.current) setLoadingTracks(false);
  }, []);

  const openLiked = useCallback(async () => {
    const reqId = ++drillReqId.current;
    setView("liked");
    setDrillTitle("Liked Songs");
    setDrillSubtitle("");
    setActiveContextId(null);
    setTracks([]);
    setTracksOffset(0);
    setLoadingTracks(true);
    try {
      const r = await fetchLikedTracks(0);
      if (reqId !== drillReqId.current) return;
      if (r.ok) {
        setTracks(r.tracks);
        setTracksTotal(r.total ?? r.tracks.length);
        setTracksOffset(r.tracks.length);
        setDrillSubtitle(`${r.total ?? r.tracks.length} tracks`);
      }
    } catch (e) {
      console.error("Failed to load liked tracks:", e);
    }
    if (reqId === drillReqId.current) setLoadingTracks(false);
  }, []);

  const openRecent = useCallback(async () => {
    const reqId = ++drillReqId.current;
    setView("recent");
    setDrillTitle("Recently Played");
    setDrillSubtitle("");
    setActiveContextId(null);
    setTracks([]);
    setTracksOffset(0);
    setLoadingTracks(true);
    try {
      const r = await fetchRecentlyPlayed(30);
      if (reqId !== drillReqId.current) return;
      if (r.ok) {
        setTracks(r.tracks);
        setTracksTotal(r.tracks.length);
        setTracksOffset(r.tracks.length);
        setDrillSubtitle(`${r.tracks.length} recent tracks`);
      }
    } catch (e) {
      console.error("Failed to load recently played:", e);
    }
    if (reqId === drillReqId.current) setLoadingTracks(false);
  }, []);

  const openEpisodes = useCallback(async () => {
    const reqId = ++drillReqId.current;
    setView("episodes");
    setDrillTitle("Your Episodes");
    setDrillSubtitle("");
    setEpisodes([]);
    setEpisodesOffset(0);
    setLoadingTracks(true);
    try {
      const r = await fetchSavedEpisodes(0);
      if (reqId !== drillReqId.current) return;
      if (r.ok) {
        setEpisodes(r.episodes);
        setEpisodesTotal(r.total);
        setEpisodesOffset(r.episodes.length);
        setDrillSubtitle(`${r.total} episodes`);
      }
    } catch (e) {
      console.error("Failed to load episodes:", e);
    }
    if (reqId === drillReqId.current) setLoadingTracks(false);
  }, []);

  const openArtist = useCallback(async (artist: Artist) => {
    const reqId = ++drillReqId.current;
    setView("artist");
    setDrillTitle(artist.name);
    setDrillSubtitle("Top Tracks & Albums");
    setActiveContextId(artist.id);
    setArtistTopTracks([]);
    setArtistAlbums([]);
    setLoadingTracks(true);
    try {
      const [topRes, albRes] = await Promise.all([
        fetchArtistTopTracks(artist.id),
        fetchArtistAlbums(artist.id),
      ]);
      if (reqId !== drillReqId.current) return;
      if (topRes.ok) setArtistTopTracks(topRes.tracks);
      if (albRes.ok) setArtistAlbums(albRes.albums);
    } catch (e) {
      console.error("Failed to load artist details:", e);
    }
    if (reqId === drillReqId.current) setLoadingTracks(false);
  }, []);

  const loadMoreTracks = useCallback(async () => {
    setLoadingTracks(true);
    try {
      let r;
      if (view === "liked") r = await fetchLikedTracks(tracksOffset);
      else if (view === "album") r = await fetchAlbumTracks(activeContextId!, tracksOffset);
      else r = await fetchPlaylistTracks(activeContextId!, tracksOffset);
      if (r.ok) {
        setTracks((p) => [...p, ...r.tracks]);
        setTracksOffset((p) => p + r.tracks.length);
      }
    } catch (e) {
      console.error("Failed to load more tracks:", e);
    }
    setLoadingTracks(false);
  }, [view, activeContextId, tracksOffset]);

  const loadMoreEpisodes = useCallback(async () => {
    setLoadingTracks(true);
    try {
      const r = await fetchSavedEpisodes(episodesOffset);
      if (r.ok) {
        setEpisodes((p) => [...p, ...r.episodes]);
        setEpisodesOffset((p) => p + r.episodes.length);
      }
    } catch (e) {
      console.error("Failed to load more episodes:", e);
    }
    setLoadingTracks(false);
  }, [episodesOffset]);

  const handlePlayTrack = useCallback(async (track: PlaylistTrack, index: number) => {
    if (view === "playlist" && activeContextId) {
      await playInContext(`spotify:playlist:${activeContextId}`, track.uri);
    } else if (view === "album" && activeContextId) {
      await playInContext(`spotify:album:${activeContextId}`, track.uri);
    } else {
      const uris = tracks.map((t) => t.uri);
      await playUris(uris, index);
    }
  }, [view, activeContextId, tracks]);

  const handlePlayAll = useCallback(async (shuffle = false) => {
    if (view === "playlist" && activeContextId) {
      await playInContext(`spotify:playlist:${activeContextId}`);
    } else if (view === "album" && activeContextId) {
      await playInContext(`spotify:album:${activeContextId}`);
    } else if (tracks.length > 0) {
      await playUris(tracks.map((t) => t.uri), 0);
    }
    await setShuffle(shuffle);
    onToast?.(shuffle ? `Shuffling ${drillTitle}` : `Playing ${drillTitle}`);
  }, [view, activeContextId, tracks, drillTitle, onToast]);

  const handleToggleNativeMix = useCallback(async () => {
    if (!activeContextId || mixingBusy) return;
    setMixingBusy(true);
    const nextMixed = !activePlaylistMixed;
    try {
      const res = await toggleNativeSpotifyMix(activeContextId, nextMixed, true);
      if (res.ok) {
        setActivePlaylistMixed(nextMixed);
        onToast?.(
          nextMixed
            ? `Native Spotify Mix enabled for "${drillTitle}"`
            : `Native Spotify Mix disabled for "${drillTitle}"`,
        );
      } else {
        onToast?.(res.error || "Could not toggle Native Spotify Mix");
      }
    } catch (e) {
      console.error("Failed to toggle native mix:", e);
      onToast?.("Could not toggle Native Spotify Mix");
    } finally {
      setMixingBusy(false);
    }
  }, [activeContextId, activePlaylistMixed, drillTitle, mixingBusy, onToast]);

  const handleToggleTrackLike = useCallback(async (e: React.MouseEvent, t: PlaylistTrack) => {
    e.stopPropagation();
    if (!t.id) return;
    const nextLiked = !t.is_liked;
    const res = await toggleLikeTrack(t.id, nextLiked);
    if (res.ok) {
      const upd = (list: PlaylistTrack[]) =>
        list.map((x) => (x.id === t.id ? { ...x, is_liked: res.is_liked } : x));
      setTracks(upd);
      setArtistTopTracks(upd);
      onToast?.(res.is_liked ? `Saved "${t.name}"` : `Removed "${t.name}"`);
    }
  }, [onToast]);

  const handleQueueTrack = useCallback(async (e: React.MouseEvent, t: PlaylistTrack) => {
    e.stopPropagation();
    const res = await addToQueue(t.uri);
    if (res.ok) {
      onToast?.(`Queued "${t.name}"`);
    }
  }, [onToast]);

  const handleAddToPlaylistClick = useCallback((e: React.MouseEvent, t: PlaylistTrack) => {
    e.stopPropagation();
    onOpenAddToPlaylist?.({ uri: t.uri, name: t.name, artist: t.artist });
  }, [onOpenAddToPlaylist]);

  const handlePlayEpisode = useCallback(async (ep: Episode) => {
    await playUris([ep.uri]);
  }, []);

  const goBack = useCallback(() => {
    setView("library");
    setTracks([]);
    setEpisodes([]);
    setArtistTopTracks([]);
    setArtistAlbums([]);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setTimeout(() => {
      setView("library");
      setTracks([]);
      setEpisodes([]);
      setArtistTopTracks([]);
      setArtistAlbums([]);
    }, 300);
  }, [onClose]);

  const inDrill = view !== "library";
  const allPlaylistsLoaded = playlistsOffset >= playlistsTotal;
  const playlistById = new Map<string, Playlist>();
  for (const p of allPlaylists) playlistById.set(p.id, p);

  const registerFolderPlaylists = (nodes: PlaylistFolder[]) => {
    for (const f of nodes) {
      if (f.playlists) {
        for (const p of f.playlists) {
          if (p.id && !playlistById.has(p.id)) playlistById.set(p.id, p);
        }
      }
      if (f.subfolders) registerFolderPlaylists(f.subfolders);
    }
  };
  registerFolderPlaylists(folders);

  const countFolderItems = (folder: PlaylistFolder): { subfolderCount: number; playlistCount: number } => {
    const subs = folder.subfolders || [];
    const directPlaylists =
      folder.playlists && folder.playlists.length > 0
        ? folder.playlists.length
        : (folder.playlist_ids || []).length;
    let totalPlaylists = directPlaylists;
    for (const sf of subs) {
      totalPlaylists += countFolderItems(sf).playlistCount;
    }
    return { subfolderCount: subs.length, playlistCount: totalPlaylists };
  };

  const PlaylistRow = ({
    pl,
    icon,
    inFolderId,
    depth = 0,
    canRemove = false,
  }: {
    pl: Playlist;
    icon?: React.ReactNode;
    inFolderId?: string;
    depth?: number;
    canRemove?: boolean;
  }) => (
    <div className="flex items-center group hover:bg-neutral-800 transition-colors">
      <button
        data-focusable="true"
        onClick={() => openPlaylist(pl)}
        style={depth > 0 ? { paddingLeft: `${16 + depth * 14}px` } : undefined}
        className={`flex-1 flex items-center gap-3 ${inFolderId && depth === 0 ? "pl-8 pr-2" : "px-4"} py-2 text-left min-w-0`}
      >
        {pl.image_url ? (
          <img src={pl.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center shrink-0">
            {icon || <FaMusic className="text-neutral-600" size={12} />}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate flex items-center gap-1.5">
            <span className="truncate">{pl.name}</span>
            {isSpotifyClientBackend && pl.is_mixed && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 font-semibold shrink-0">
                MIX
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-500">{pl.track_count} tracks</div>
        </div>
      </button>
      {inFolderId && canRemove && (
        <button
          data-focusable="true"
          onClick={(e) => handleRemovePlaylistFromFolder(e, inFolderId, pl.id)}
          className="p-2 mr-2 text-neutral-500 hover:text-red-400"
          title="Remove from folder"
        >
          <FaTimes size={11} />
        </button>
      )}
    </div>
  );

  const renderFolderNode = (folder: PlaylistFolder, depth = 0): React.ReactNode => {
    const isExpanded = Boolean(expandedFolders[folder.id]);
    const isNativeSpotify = folder.source === "spotify_client";
    const directPlaylists: Playlist[] =
      folder.playlists && folder.playlists.length > 0
        ? folder.playlists
        : (folder.playlist_ids || [])
            .map((pid) => playlistById.get(pid))
            .filter((x): x is Playlist => Boolean(x));
    const subfolders = folder.subfolders || [];
    const { subfolderCount, playlistCount } = countFolderItems(folder);

    return (
      <div key={folder.id} className={depth === 0 ? "border-b border-neutral-800/40" : ""}>
        <div className="flex items-center hover:bg-neutral-800 transition-colors">
          <button
            data-focusable="true"
            onClick={() => handleToggleFolder(folder.id)}
            style={depth > 0 ? { paddingLeft: `${16 + depth * 14}px` } : undefined}
            className="flex-1 flex items-center gap-3 px-4 py-2 text-left min-w-0"
          >
            <div className="w-8 h-8 rounded bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              {isExpanded ? <FaFolderOpen size={14} /> : <FaFolder size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{folder.name}</div>
              <div className="text-xs text-neutral-500 truncate">
                {subfolderCount > 0 ? `${subfolderCount} folders · ` : ""}
                {playlistCount} playlists
                {isNativeSpotify && depth === 0 ? " · Spotify" : ""}
              </div>
            </div>
          </button>
          {!isNativeSpotify && (
            <>
              <button
                data-focusable="true"
                onClick={() =>
                  setAssigningPlaylistToFolder((curr) =>
                    curr === folder.id ? null : folder.id,
                  )
                }
                className="p-2 text-neutral-400 hover:text-green-400"
                title="Add playlist to folder"
              >
                <FaPlus size={11} />
              </button>
              <button
                data-focusable="true"
                onClick={(e) => handleDeleteFolder(e, folder)}
                className="p-2 mr-2 text-neutral-500 hover:text-red-400"
                title="Delete folder"
              >
                <FaTrash size={11} />
              </button>
            </>
          )}
        </div>

        {assigningPlaylistToFolder === folder.id && !isNativeSpotify && (
          <div className="px-4 py-2 bg-neutral-950/80 space-y-1 max-h-40 overflow-y-auto">
            <div className="text-[11px] text-neutral-400 mb-1">
              Select playlist to add to "{folder.name}":
            </div>
            {allPlaylists
              .filter((p) => !(folder.playlist_ids || []).includes(p.id))
              .map((p) => (
                <button
                  key={p.id}
                  data-focusable="true"
                  onClick={() => handleAddPlaylistToFolder(folder.id, p.id)}
                  className="w-full text-left text-xs py-1 px-2 rounded hover:bg-neutral-800 truncate text-neutral-200"
                >
                  + {p.name}
                </button>
              ))}
          </div>
        )}

        {isExpanded && (
          <div className="bg-neutral-950/35">
            {subfolders.map((sf) => renderFolderNode(sf, depth + 1))}
            {directPlaylists.length === 0 && subfolders.length === 0 ? (
              <div
                style={{ paddingLeft: `${28 + depth * 14}px` }}
                className="pr-4 py-2 text-xs text-neutral-600"
              >
                Empty folder
              </div>
            ) : (
              directPlaylists.map((pl) => (
                <PlaylistRow
                  key={`${folder.id}-${pl.id}`}
                  pl={pl}
                  inFolderId={folder.id}
                  depth={depth + 1}
                  canRemove={!isNativeSpotify}
                />
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60" onClick={handleClose} />}

      <div
        data-modal-scope={open ? "true" : undefined}
        className={`fixed inset-y-0 left-0 z-50 w-80 bg-neutral-900 shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          {inDrill ? (
            <button
              data-focusable="true"
              onClick={goBack}
              className="text-neutral-400 hover:text-white flex items-center gap-1 text-sm"
            >
              <FaChevronLeft size={12} /> Library
            </button>
          ) : (
            <span className="font-semibold text-sm">Library</span>
          )}
          <button
            data-focusable="true"
            onClick={handleClose}
            className="text-neutral-500 hover:text-white p-1"
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === "library" && (
            loading ? (
              <div className="p-4 text-neutral-500 text-sm">Loading...</div>
            ) : (
              <>
                <button
                  data-focusable="true"
                  onClick={openLiked}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded bg-gradient-to-br from-purple-700 to-blue-300 flex items-center justify-center shrink-0">
                    <FaHeart className="text-white" size={14} />
                  </div>
                  <span className="text-sm font-medium">Liked Songs</span>
                </button>
                <button
                  data-focusable="true"
                  onClick={openRecent}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center shrink-0">
                    <FaHistory className="text-green-400" size={14} />
                  </div>
                  <span className="text-sm font-medium">Recently Played</span>
                </button>
                <button
                  data-focusable="true"
                  onClick={openEpisodes}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded bg-green-800 flex items-center justify-center shrink-0">
                    <FaPodcast className="text-white" size={14} />
                  </div>
                  <span className="text-sm font-medium">Your Episodes</span>
                </button>

                {/* Playlist Folders Section */}
                <div className="px-4 pt-4 pb-1 flex items-center justify-between">
                  <span className="text-xs text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FaFolder size={10} /> Folders
                  </span>
                  <button
                    data-focusable="true"
                    onClick={() => setCreatingFolder((v) => !v)}
                    className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1"
                    title="Create Playlist Folder"
                  >
                    <FaFolderPlus size={12} /> New Folder
                  </button>
                </div>

                {creatingFolder && (
                  <div className="px-4 py-2 flex items-center gap-1.5 bg-neutral-800/60">
                    <input
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateFolder();
                      }}
                      placeholder="Folder name..."
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white outline-none"
                    />
                    <button
                      data-focusable="true"
                      onClick={handleCreateFolder}
                      className="bg-green-500 text-black text-xs font-semibold px-2.5 py-1 rounded hover:bg-green-400"
                    >
                      Save
                    </button>
                  </div>
                )}

                {folders.length === 0 && !creatingFolder && (
                  <div className="px-4 py-1.5 text-xs text-neutral-600">
                    No folders yet. Click "New Folder" or sync via Official Spotify Client.
                  </div>
                )}

                {folders.map((folder) => renderFolderNode(folder, 0))}

                {madeForYou.length > 0 && (
                  <>
                    <div className="px-4 pt-4 pb-1 text-xs text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                      <FaStar size={10} /> Made For You
                    </div>
                    {madeForYou.map((pl) => <PlaylistRow key={pl.id} pl={pl} />)}
                  </>
                )}

                {artists.length > 0 && (
                  <>
                    <div className="px-4 pt-4 pb-1 text-xs text-neutral-500 uppercase tracking-wider">Artists</div>
                    {artists.map((a) => (
                      <button
                        key={a.id}
                        data-focusable="true"
                        onClick={() => openArtist(a)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                      >
                        {a.image_url ? (
                          <img src={a.image_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center shrink-0">
                            <FaUser className="text-neutral-600" size={14} />
                          </div>
                        )}
                        <span className="text-sm font-medium truncate">{a.name}</span>
                      </button>
                    ))}
                  </>
                )}

                {albums.length > 0 && (
                  <>
                    <div className="px-4 pt-4 pb-1 text-xs text-neutral-500 uppercase tracking-wider">Albums</div>
                    {albums.map((al) => (
                      <button
                        key={al.id}
                        data-focusable="true"
                        onClick={() => openAlbum(al)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                      >
                        {al.image_url ? (
                          <img src={al.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center shrink-0">
                            <FaCompactDisc className="text-neutral-600" size={14} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{al.name}</div>
                          <div className="text-xs text-neutral-500 truncate">{al.artist}</div>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {playlists.length > 0 && (
                  <>
                    <div className="px-4 pt-4 pb-1 text-xs text-neutral-500 uppercase tracking-wider">Playlists</div>
                    {playlists.map((pl) => <PlaylistRow key={pl.id} pl={pl} />)}
                  </>
                )}

                {!allPlaylistsLoaded && (
                  <button
                    data-focusable="true"
                    onClick={loadMorePlaylists}
                    className="w-full py-3 text-sm text-green-500 hover:text-green-400 transition-colors"
                  >
                    {loadingTracks ? "Loading..." : "Load more playlists"}
                  </button>
                )}
              </>
            )
          )}

          {/* Artist drill-in (top tracks + albums) */}
          {view === "artist" && (
            <>
              <div className="px-4 py-3 border-b border-neutral-800">
                <div className="text-sm font-semibold truncate">{drillTitle}</div>
                {drillSubtitle && <div className="text-xs text-neutral-500">{drillSubtitle}</div>}
              </div>
              {artistTopTracks.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 text-xs text-neutral-500 uppercase tracking-wider">Popular Tracks</div>
                  {artistTopTracks.slice(0, 5).map((t, i) => (
                    <div
                      key={t.uri + i}
                      data-focusable="true"
                      data-track-id={t.id ?? ""}
                      data-track-uri={t.uri}
                      data-track-name={t.name}
                      onClick={() => playUris(artistTopTracks.map((x) => x.uri), i)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="text-sm truncate">{t.name}</div>
                        <div className="text-xs text-neutral-500 truncate">{t.album}</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {t.id && (
                          <button
                            onClick={(e) => handleToggleTrackLike(e, t)}
                            className={`p-1.5 transition-colors ${t.is_liked ? "text-green-500" : "text-neutral-500 hover:text-white"}`}
                            title={t.is_liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
                          >
                            {t.is_liked ? <FaHeart size={12} /> : <FaRegHeart size={12} />}
                          </button>
                        )}
                        <button
                          onClick={(e) => handleAddToPlaylistClick(e, t)}
                          className="p-1.5 text-neutral-500 hover:text-green-400"
                          title="Add to Playlist"
                        >
                          <FaListUl size={11} />
                        </button>
                        <button
                          onClick={(e) => handleQueueTrack(e, t)}
                          className="p-1.5 text-neutral-500 hover:text-green-400"
                          title="Add to Queue"
                        >
                          <FaPlus size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {artistAlbums.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 text-xs text-neutral-500 uppercase tracking-wider">Albums & Singles</div>
                  {artistAlbums.map((al) => (
                    <button
                      key={al.id}
                      data-focusable="true"
                      onClick={() => openAlbum(al)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                    >
                      {al.image_url ? (
                        <img src={al.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center shrink-0">
                          <FaCompactDisc className="text-neutral-600" size={14} />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">{al.name}</div>
                        <div className="text-xs text-neutral-500 truncate">{al.artist}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {loadingTracks && <div className="px-4 py-3 text-neutral-500 text-sm">Loading...</div>}
            </>
          )}

          {/* Track drill-in (playlist / liked / recent / album) */}
          {(view === "playlist" || view === "liked" || view === "recent" || view === "album") && (
            <>
              <div className="px-4 py-3 border-b border-neutral-800 space-y-2.5">
                <div>
                  <div className="text-sm font-semibold truncate">{drillTitle}</div>
                  {drillSubtitle && <div className="text-xs text-neutral-500">{drillSubtitle}</div>}
                </div>
                {tracks.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      data-focusable="true"
                      onClick={() => handlePlayAll(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white text-black text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      <FaPlay size={10} /> Play
                    </button>
                    <button
                      data-focusable="true"
                      onClick={() => handlePlayAll(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 text-white text-xs font-medium py-1.5 px-2.5 rounded-lg hover:bg-neutral-700 transition-colors"
                    >
                      <FaRandom size={11} /> Shuffle
                    </button>
                    {view === "playlist" && isSpotifyClientBackend && (
                      <button
                        data-focusable="true"
                        disabled={mixingBusy}
                        onClick={handleToggleNativeMix}
                        className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 px-2.5 rounded-lg transition-colors ${
                          activePlaylistMixed
                            ? "bg-green-500 text-black hover:bg-green-400"
                            : "bg-neutral-800 text-green-400 border border-green-500/40 hover:bg-neutral-700"
                        }`}
                        title="Toggle Native Spotify Playlist Mix"
                      >
                        {activePlaylistMixed ? "Mix: ON" : "Mix"}
                      </button>
                    )}
                  </div>
                )}
              </div>
              {tracks.map((t, i) => (
                <div
                  key={t.uri + i}
                  data-focusable="true"
                  data-track-id={t.id ?? ""}
                  data-track-uri={t.uri}
                  data-track-name={t.name}
                  onClick={() => handlePlayTrack(t, i)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="text-sm truncate">{t.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{t.artist}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-neutral-600 mr-1">{formatMs(t.duration_ms)}</span>
                    {t.id && (
                      <button
                        onClick={(e) => handleToggleTrackLike(e, t)}
                        className={`p-1.5 transition-colors ${t.is_liked ? "text-green-500" : "text-neutral-500 hover:text-white"}`}
                        title={t.is_liked ? "Remove from Liked Songs" : "Save to Liked Songs"}
                      >
                        {t.is_liked ? <FaHeart size={12} /> : <FaRegHeart size={12} />}
                      </button>
                    )}
                    <button
                      onClick={(e) => handleAddToPlaylistClick(e, t)}
                      className="p-1.5 text-neutral-500 hover:text-green-400 transition-colors"
                      title="Add to Playlist"
                    >
                      <FaListUl size={11} />
                    </button>
                    <button
                      onClick={(e) => handleQueueTrack(e, t)}
                      className="p-1.5 text-neutral-500 hover:text-green-400 transition-colors"
                      title="Add to Queue"
                    >
                      <FaPlus size={11} />
                    </button>
                  </div>
                </div>
              ))}
              {loadingTracks && <div className="px-4 py-3 text-neutral-500 text-sm">Loading...</div>}
              {!loadingTracks && tracks.length < tracksTotal && (
                <button
                  data-focusable="true"
                  onClick={loadMoreTracks}
                  className="w-full py-3 text-sm text-green-500 hover:text-green-400 transition-colors"
                >
                  Load more
                </button>
              )}
            </>
          )}

          {/* Episodes drill-in */}
          {view === "episodes" && (
            <>
              <div className="px-4 py-3 border-b border-neutral-800">
                <div className="text-sm font-semibold truncate">{drillTitle}</div>
                {drillSubtitle && <div className="text-xs text-neutral-500">{drillSubtitle}</div>}
              </div>
              {episodes.map((ep, i) => (
                <button
                  key={ep.uri + i}
                  data-focusable="true"
                  onClick={() => handlePlayEpisode(ep)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="text-sm truncate">{ep.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{ep.show_name}</div>
                  </div>
                  <span className="text-xs text-neutral-600 shrink-0">{formatMs(ep.duration_ms)}</span>
                </button>
              ))}
              {loadingTracks && <div className="px-4 py-3 text-neutral-500 text-sm">Loading...</div>}
              {!loadingTracks && episodes.length < episodesTotal && (
                <button
                  data-focusable="true"
                  onClick={loadMoreEpisodes}
                  className="w-full py-3 text-sm text-green-500 hover:text-green-400 transition-colors"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
