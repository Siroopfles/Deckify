import { useState, useEffect, useCallback, useRef } from "react";
import {
  FaTimes,
  FaChevronLeft,
  FaMusic,
  FaHeart,
  FaPodcast,
  FaUser,
  FaCompactDisc,
  FaStar,
  FaHistory,
  FaPlay,
  FaRandom,
  FaSlidersH,
  FaPlus,
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
  playInContext,
  playUris,
  addToQueue,
  setShuffle,
  startMixPlay,
  type Playlist,
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
}

export default function Sidebar({ open, onClose, onToast }: Props) {
  const [view, setView] = useState<View>("library");
  const [loading, setLoading] = useState(false);

  // Library data
  const [madeForYou, setMadeForYou] = useState<Playlist[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistsTotal, setPlaylistsTotal] = useState(0);
  const [playlistsOffset, setPlaylistsOffset] = useState(0);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);

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
    Promise.all([fetchPlaylists(), fetchSavedAlbums(), fetchFollowedArtists()])
      .then(([pl, al, ar]) => {
        if (pl.ok) {
          const { made, user } = splitPlaylists(pl.playlists);
          setMadeForYou(made);
          setPlaylists(user);
          setPlaylistsTotal(pl.total);
          setPlaylistsOffset(pl.playlists.length);
        }
        if (al.ok) setAlbums(al.albums);
        if (ar.ok) setArtists(ar.artists);
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
        setPlaylistsOffset((p) => p + r.playlists.length);
      }
    } catch (e) {
      console.error("Failed to load more playlists:", e);
    }
    setLoadingTracks(false);
  }, [playlistsOffset, splitPlaylists]);

  const openPlaylist = useCallback(async (pl: Playlist) => {
    const reqId = ++drillReqId.current;
    setView("playlist");
    setDrillTitle(pl.name);
    setDrillSubtitle(`${pl.track_count} tracks`);
    setActiveContextId(pl.id);
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

  const handleMixPlay = useCallback(async () => {
    const contextUri =
      view === "playlist" && activeContextId
        ? `spotify:playlist:${activeContextId}`
        : view === "album" && activeContextId
        ? `spotify:album:${activeContextId}`
        : undefined;
    const uris = !contextUri && tracks.length > 0 ? tracks.map((t) => t.uri) : undefined;
    const res = await startMixPlay({ context_uri: contextUri, uris, mix_mode: "fade", crossfade_seconds: 6, shuffle: true });
    if (res.ok) {
      onToast?.(`Mix Mode started for ${drillTitle}`);
    }
  }, [view, activeContextId, tracks, drillTitle, onToast]);

  const handleQueueTrack = useCallback(async (e: React.MouseEvent, t: PlaylistTrack) => {
    e.stopPropagation();
    const res = await addToQueue(t.uri);
    if (res.ok) {
      onToast?.(`Queued "${t.name}"`);
    }
  }, [onToast]);

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

  const PlaylistRow = ({ pl, icon }: { pl: Playlist; icon?: React.ReactNode }) => (
    <button onClick={() => openPlaylist(pl)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
      {pl.image_url ? (
        <img src={pl.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center shrink-0">
          {icon || <FaMusic className="text-neutral-600" size={14} />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{pl.name}</div>
        <div className="text-xs text-neutral-500">{pl.track_count} tracks</div>
      </div>
    </button>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/60" onClick={handleClose} />}

      <div className={`fixed inset-y-0 left-0 z-50 w-80 bg-neutral-900 shadow-2xl flex flex-col transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0">
          {inDrill ? (
            <button onClick={goBack} className="text-neutral-400 hover:text-white flex items-center gap-1 text-sm">
              <FaChevronLeft size={12} /> Library
            </button>
          ) : (
            <span className="font-semibold text-sm">Library</span>
          )}
          <button onClick={handleClose} className="text-neutral-500 hover:text-white p-1">
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
                <button onClick={openLiked} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
                  <div className="w-10 h-10 rounded bg-gradient-to-br from-purple-700 to-blue-300 flex items-center justify-center shrink-0">
                    <FaHeart className="text-white" size={14} />
                  </div>
                  <span className="text-sm font-medium">Liked Songs</span>
                </button>
                <button onClick={openRecent} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
                  <div className="w-10 h-10 rounded bg-neutral-800 flex items-center justify-center shrink-0">
                    <FaHistory className="text-green-400" size={14} />
                  </div>
                  <span className="text-sm font-medium">Recently Played</span>
                </button>
                <button onClick={openEpisodes} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
                  <div className="w-10 h-10 rounded bg-green-800 flex items-center justify-center shrink-0">
                    <FaPodcast className="text-white" size={14} />
                  </div>
                  <span className="text-sm font-medium">Your Episodes</span>
                </button>

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
                      <button key={a.id} onClick={() => openArtist(a)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
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
                      <button key={al.id} onClick={() => openAlbum(al)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
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
                  <button onClick={loadMorePlaylists} className="w-full py-3 text-sm text-green-500 hover:text-green-400 transition-colors">
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
                      onClick={() => playUris(artistTopTracks.map((x) => x.uri), i)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <div className="text-sm truncate">{t.name}</div>
                        <div className="text-xs text-neutral-500 truncate">{t.album}</div>
                      </div>
                      <button
                        onClick={(e) => handleQueueTrack(e, t)}
                        className="p-1.5 text-neutral-500 hover:text-green-400"
                        title="Add to Queue"
                      >
                        <FaPlus size={11} />
                      </button>
                    </div>
                  ))}
                </>
              )}
              {artistAlbums.length > 0 && (
                <>
                  <div className="px-4 pt-3 pb-1 text-xs text-neutral-500 uppercase tracking-wider">Albums & Singles</div>
                  {artistAlbums.map((al) => (
                    <button key={al.id} onClick={() => openAlbum(al)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
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
                      onClick={() => handlePlayAll(false)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-white text-black text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-neutral-200 transition-colors"
                    >
                      <FaPlay size={10} /> Play
                    </button>
                    <button
                      onClick={() => handlePlayAll(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-800 text-white text-xs font-medium py-1.5 px-2.5 rounded-lg hover:bg-neutral-700 transition-colors"
                    >
                      <FaRandom size={11} /> Shuffle
                    </button>
                    <button
                      onClick={handleMixPlay}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-green-500 text-black text-xs font-semibold py-1.5 px-2.5 rounded-lg hover:bg-green-400 transition-colors"
                      title="Start with Mix Crossfade & Shuffle"
                    >
                      <FaSlidersH size={11} /> Mix
                    </button>
                  </div>
                )}
              </div>
              {tracks.map((t, i) => (
                <div
                  key={t.uri + i}
                  onClick={() => handlePlayTrack(t, i)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1 mr-2">
                    <div className="text-sm truncate">{t.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{t.artist}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-neutral-600">{formatMs(t.duration_ms)}</span>
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
                <button onClick={loadMoreTracks} className="w-full py-3 text-sm text-green-500 hover:text-green-400 transition-colors">
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
                <button key={ep.uri + i} onClick={() => handlePlayEpisode(ep)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-neutral-800 transition-colors text-left">
                  <div className="min-w-0 flex-1 mr-3">
                    <div className="text-sm truncate">{ep.name}</div>
                    <div className="text-xs text-neutral-500 truncate">{ep.show_name}</div>
                  </div>
                  <span className="text-xs text-neutral-600 shrink-0">{formatMs(ep.duration_ms)}</span>
                </button>
              ))}
              {loadingTracks && <div className="px-4 py-3 text-neutral-500 text-sm">Loading...</div>}
              {!loadingTracks && episodes.length < episodesTotal && (
                <button onClick={loadMoreEpisodes} className="w-full py-3 text-sm text-green-500 hover:text-green-400 transition-colors">
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
