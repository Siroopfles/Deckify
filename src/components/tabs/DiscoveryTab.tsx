import { FC, useCallback, useEffect, useRef, useState } from "react";
import { Focusable } from "@decky/ui";
import { callable } from "@decky/api";
import { FaCompass, FaExclamationTriangle, FaLock, FaSync } from "react-icons/fa";
import {
  AlbumItem,
  ArtistItem,
  DiscoveryFeedResponse,
  DiscoveryMixItem,
  DiscoveryTimeRange,
  PinnedPlaylistItem,
  PlaylistItem,
  TrackItem,
} from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { focusHalo } from "../common/InteractiveRow";

const backendGetDiscoveryFeed = callable<[DiscoveryTimeRange, boolean?], DiscoveryFeedResponse>(
  "get_discovery_feed"
);
const backendPlayAiDj = callable<
  [string?],
  { ok: boolean; requires_spotify_client?: boolean; error?: string }
>("play_ai_dj");

const TIME_RANGES: { id: DiscoveryTimeRange; label: string }[] = [
  { id: "short_term", label: "4 Weeks" },
  { id: "medium_term", label: "6 Months" },
  { id: "long_term", label: "All Time" },
];

export function getGreetingForHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 17) return "Good afternoon";
  return "Good evening";
}

function scrollCardIntoView(e: any): void {
  e?.currentTarget?.scrollIntoView?.({
    behavior: "smooth",
    inline: "nearest",
    block: "nearest",
  });
}

interface DiscoveryCardProps {
  testId: string;
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  roundArtwork?: boolean;
  onActivate: () => void;
  onCardFocus: () => void;
}

const DiscoveryCard: FC<DiscoveryCardProps> = ({
  testId,
  imageUrl,
  title,
  subtitle,
  roundArtwork = false,
  onActivate,
  onCardFocus,
}) => {
  const [focused, setFocused] = useState(false);

  const handleFocus = (e: any) => {
    setFocused(true);
    scrollCardIntoView(e);
    onCardFocus();
  };

  return (
    <Focusable
      noFocusRing
      data-testid={testId}
      onClick={onActivate}
      onActivate={onActivate}
      onFocus={handleFocus}
      onBlur={() => setFocused(false)}
      onGamepadFocus={handleFocus}
      onGamepadBlur={() => setFocused(false)}
      style={{
        width: 144,
        flexShrink: 0,
        padding: 8,
        borderRadius: 10,
        background: "#1C1C1C",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        ...focusHalo(focused),
      }}
    >
      <DeckifyImage
        src={imageUrl}
        width={128}
        height={128}
        style={{
          borderRadius: roundArtwork ? "50%" : 8,
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 400,
            lineHeight: 1.5,
            color: "#fff",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
            minHeight: 39,
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.3,
              color: "#fff",
              opacity: 0.65,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {subtitle}
          </div>
        ) : null}
      </div>
    </Focusable>
  );
};

interface AiDjCardProps {
  dj: DiscoveryMixItem;
  cdpActive: boolean;
  onCardFocus: () => void;
}

const AiDjCard: FC<AiDjCardProps> = ({ dj, cdpActive, onCardFocus }) => {
  const [focused, setFocused] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>("");

  const handleFocus = (e: any) => {
    setFocused(true);
    scrollCardIntoView(e);
    onCardFocus();
  };

  const handleActivate = async () => {
    if (!cdpActive) {
      setStatusMsg("Requires Official Spotify Client");
      return;
    }
    try {
      const res = await backendPlayAiDj(dj.uri);
      if (!res?.ok) {
        setStatusMsg(res?.error || "Failed to start AI DJ");
      } else {
        setStatusMsg("Playing AI DJ");
      }
    } catch (e: any) {
      setStatusMsg(e?.message || "Failed to start AI DJ");
    }
  };

  const subtitle = !cdpActive
    ? "Requires Official Spotify Client"
    : statusMsg || dj.subtitle || "Play personalized AI DJ";

  return (
    <Focusable
      noFocusRing
      data-testid="discovery-card-ai-dj"
      onClick={handleActivate}
      onActivate={handleActivate}
      onFocus={handleFocus}
      onBlur={() => setFocused(false)}
      onGamepadFocus={handleFocus}
      onGamepadBlur={() => setFocused(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: 12,
        borderRadius: 10,
        background: "#1C1C1C",
        opacity: cdpActive ? 1 : 0.6,
        cursor: cdpActive ? "pointer" : "default",
        ...focusHalo(focused),
      }}
    >
      <DeckifyImage
        src={dj.image_url}
        width={64}
        height={64}
        style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
          {dj.name || "Spotify AI DJ"}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "#fff", opacity: 0.75 }}>
          {subtitle}
        </div>
      </div>
    </Focusable>
  );
};

const TimeRangePill: FC<{
  id: DiscoveryTimeRange;
  label: string;
  active: boolean;
  onSelect: (id: DiscoveryTimeRange) => void;
}> = ({ id, label, active, onSelect }) => {
  const [focused, setFocused] = useState(false);

  return (
    <Focusable
      noFocusRing
      data-testid={`discovery-pill-${id}`}
      onClick={() => onSelect(id)}
      onActivate={() => onSelect(id)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 32,
        padding: "8px 16px",
        borderRadius: 16,
        background: active ? "var(--deckify-accent, #1DB954)" : "#1C1C1C",
        color: active ? "#000" : "#fff",
        fontSize: 11,
        fontWeight: 600,
        lineHeight: 1.3,
        cursor: "pointer",
        ...focusHalo(focused),
      }}
    >
      {label}
    </Focusable>
  );
};

const ReauthCard: FC<{ onReauthenticate?: () => void }> = ({ onReauthenticate }) => {
  const [focused, setFocused] = useState(false);

  return (
    <div
      data-testid="discovery-reauth-card"
      style={{
        background: "#1C1C1C",
        borderRadius: 10,
        padding: 32,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
        <FaLock size={16} style={{ color: "var(--deckify-accent, #1DB954)", flexShrink: 0 }} />
        <div style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, color: "#fff" }}>
          Re-authenticate to unlock Top Tracks &amp; Top Artists
        </div>
      </div>
      <Focusable
        noFocusRing
        data-testid="discovery-reauth-btn"
        onClick={() => onReauthenticate?.()}
        onActivate={() => onReauthenticate?.()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onGamepadFocus={() => setFocused(true)}
        onGamepadBlur={() => setFocused(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 32,
          padding: "8px 16px",
          borderRadius: 16,
          background: "var(--deckify-accent, #1DB954)",
          color: "#000",
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.3,
          cursor: "pointer",
          flexShrink: 0,
          ...focusHalo(focused),
        }}
      >
        Re-authenticate Spotify
      </Focusable>
    </div>
  );
};

export interface DiscoveryTabProps {
  onPlayTrack: (uri: string, contextUri?: string, allUris?: string[], startIdx?: number) => void;
  onOpenPlaylist: (pl: PlaylistItem) => void;
  onOpenAlbum: (alb: AlbumItem) => void;
  onOpenArtist: (art: ArtistItem) => void;
  onOpenActions: (track: TrackItem) => void;
  onFocusTrack: (track: TrackItem | null) => void;
  onFocusCollection: (item: PinnedPlaylistItem | null) => void;
  onReauthenticate?: () => void;
}

export const DiscoveryTab: FC<DiscoveryTabProps> = ({
  onPlayTrack,
  onOpenPlaylist,
  onOpenAlbum,
  onOpenArtist,
  onFocusTrack,
  onFocusCollection,
  onReauthenticate,
}) => {
  const [timeRange, setTimeRange] = useState<DiscoveryTimeRange>("medium_term");
  const [feed, setFeed] = useState<DiscoveryFeedResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshFocused, setRefreshFocused] = useState(false);
  const onFocusTrackRef = useRef(onFocusTrack);
  const onFocusCollectionRef = useRef(onFocusCollection);
  onFocusTrackRef.current = onFocusTrack;
  onFocusCollectionRef.current = onFocusCollection;

  const loadFeed = useCallback(async (range: DiscoveryTimeRange, forceRefresh = false) => {
    setLoading(true);
    try {
      const res = await backendGetDiscoveryFeed(range, forceRefresh);
      setFeed(res);
    } catch (e: any) {
      setFeed({ ok: false, error: e?.message || "Failed to load Discovery feed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    backendGetDiscoveryFeed(timeRange, false)
      .then((res) => {
        if (mounted) {
          setFeed(res);
        }
      })
      .catch((e: any) => {
        if (mounted) {
          setFeed({ ok: false, error: e?.message || "Failed to load Discovery feed" });
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
      onFocusTrackRef.current(null);
      onFocusCollectionRef.current(null);
    };
  }, [timeRange]);

  const handleSelectRange = useCallback(
    (range: DiscoveryTimeRange) => {
      if (range === timeRange) return;
      onFocusTrack(null);
      onFocusCollection(null);
      setTimeRange(range);
    },
    [timeRange, onFocusTrack, onFocusCollection]
  );

  const greeting = getGreetingForHour(new Date().getHours());
  const madeForYou: DiscoveryMixItem[] = feed?.made_for_you || [];
  const blends: DiscoveryMixItem[] = feed?.blends || [];
  const dj: DiscoveryMixItem | null = feed?.dj || null;
  const cdpActive = feed?.cdp_active !== false;
  const topTracks: TrackItem[] = feed?.top_tracks || [];
  const topArtists: ArtistItem[] = feed?.top_artists || [];
  const newReleases: AlbumItem[] = feed?.new_releases || [];
  const allTopTrackUris = topTracks.map((t) => t.uri || "").filter(Boolean);

  const hasAnyItems =
    madeForYou.length > 0 ||
    blends.length > 0 ||
    Boolean(dj) ||
    topTracks.length > 0 ||
    topArtists.length > 0 ||
    newReleases.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 64 }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div
          data-testid="discovery-greeting"
          style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.2, color: "#fff" }}
        >
          {greeting}
        </div>
        <Focusable
          noFocusRing
          data-testid="discovery-refresh-btn"
          onClick={() => {
            if (!loading) loadFeed(timeRange, true);
          }}
          onActivate={() => {
            if (!loading) loadFeed(timeRange, true);
          }}
          onFocus={() => setRefreshFocused(true)}
          onBlur={() => setRefreshFocused(false)}
          onGamepadFocus={() => setRefreshFocused(true)}
          onGamepadBlur={() => setRefreshFocused(false)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minHeight: 32,
            padding: "8px 16px",
            borderRadius: 16,
            background: "#1C1C1C",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.3,
            opacity: loading ? 0.5 : 1,
            cursor: loading ? "default" : "pointer",
            ...focusHalo(refreshFocused),
          }}
        >
          <FaSync size={10} />
          <span>{loading ? "Refreshing..." : "Refresh Feed"}</span>
        </Focusable>
      </div>

      {/* Shared Time-Range Filter Pill Bar */}
      <Focusable
        flow-children="horizontal"
        data-testid="discovery-time-range-bar"
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        {TIME_RANGES.map((r) => (
          <TimeRangePill
            key={r.id}
            id={r.id}
            label={r.label}
            active={timeRange === r.id}
            onSelect={handleSelectRange}
          />
        ))}
      </Focusable>

      {/* 429 Stale Cache Banner */}
      {feed?.rate_limited && feed?.stale && (
        <div
          data-testid="discovery-stale-banner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#1C1C1C",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 11,
            fontWeight: 600,
            lineHeight: 1.3,
            color: "#fff",
          }}
        >
          <FaExclamationTriangle size={12} style={{ color: "#f59e0b", flexShrink: 0 }} />
          <span>Rate limited — showing cached feed</span>
        </div>
      )}

      {loading && !feed && (
        <div data-testid="discovery-loading" style={{ fontSize: 13, opacity: 0.7 }}>
          Loading Discovery feed...
        </div>
      )}

      {/* Empty or 429 Cooldown without cache */}
      {!loading && feed && !hasAnyItems && !feed.needs_reauth && (
        <div
          data-testid="discovery-empty-state"
          style={{
            background: "#1C1C1C",
            borderRadius: 10,
            padding: 32,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>
            <FaCompass size={16} style={{ color: "var(--deckify-accent, #1DB954)" }} />
            <span>
              {feed.rate_limited
                ? "Rate limited"
                : "No personalized recommendations yet"}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 400, lineHeight: 1.5, opacity: 0.8 }}>
            {feed.rate_limited
              ? "Spotify rate limit cooldown active. Wait a moment and select Refresh Feed to try again."
              : "Play a few tracks or follow playlists on Spotify, then select Refresh Feed to populate your Discovery hub."}
          </div>
        </div>
      )}

      {/* 0. Spotify AI DJ */}
      {dj && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            data-testid="discovery-heading-ai-dj"
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#fff" }}
          >
            Spotify AI DJ
          </div>
          <AiDjCard
            dj={dj}
            cdpActive={cdpActive}
            onCardFocus={() => {
              onFocusTrack(null);
              onFocusCollection(null);
            }}
          />
        </div>
      )}

      {/* 1. Made For You / Jump Back In */}
      {madeForYou.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            data-testid="discovery-heading-made-for-you"
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#fff" }}
          >
            {feed?.made_for_you_fallback ? "Jump Back In" : "Made For You"}
          </div>
          <Focusable
            flow-children="horizontal"
            data-testid="discovery-carousel-made-for-you"
            style={{ display: "flex", gap: 16, overflowX: "auto", padding: "6px 4px 10px" }}
          >
            {madeForYou.map((mix, idx) => (
              <DiscoveryCard
                key={mix.id || mix.uri || idx}
                testId={`discovery-card-mix-${idx}`}
                imageUrl={mix.image_url}
                title={mix.name}
                subtitle={mix.subtitle || (mix.is_album ? "Album" : "Playlist")}
                onActivate={() => {
                  if (mix.is_album) {
                    onOpenAlbum({
                      id: mix.id,
                      name: mix.name,
                      artist: mix.subtitle || "",
                      image_url: mix.image_url,
                      uri: mix.uri,
                    });
                  } else {
                    onOpenPlaylist(mix);
                  }
                }}
                onCardFocus={() =>
                  onFocusCollection({
                    uri: mix.uri,
                    name: mix.name,
                    image_url: mix.image_url,
                    type: mix.is_album ? "album" : "playlist",
                  })
                }
              />
            ))}
          </Focusable>
        </div>
      )}

      {/* 1b. Your Blends */}
      {blends.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            data-testid="discovery-heading-blends"
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#fff" }}
          >
            Your Blends
          </div>
          <Focusable
            flow-children="horizontal"
            data-testid="discovery-carousel-blends"
            style={{ display: "flex", gap: 16, overflowX: "auto", padding: "6px 4px 10px" }}
          >
            {blends.map((blend, idx) => (
              <DiscoveryCard
                key={blend.id || blend.uri || idx}
                testId={`discovery-card-blend-${idx}`}
                imageUrl={blend.image_url}
                title={blend.name}
                subtitle={blend.subtitle || "Blend"}
                onActivate={() => onOpenPlaylist(blend)}
                onCardFocus={() =>
                  onFocusCollection({
                    uri: blend.uri,
                    name: blend.name,
                    image_url: blend.image_url,
                    type: "playlist",
                  })
                }
              />
            ))}
          </Focusable>
        </div>
      )}

      {/* 2. Top Tracks */}
      {(feed?.needs_reauth || topTracks.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            data-testid="discovery-heading-top-tracks"
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#fff" }}
          >
            Top Tracks
          </div>
          {feed?.needs_reauth ? (
            <ReauthCard onReauthenticate={onReauthenticate} />
          ) : (
            <Focusable
              flow-children="horizontal"
              data-testid="discovery-carousel-top-tracks"
              style={{ display: "flex", gap: 16, overflowX: "auto", padding: "6px 4px 10px" }}
            >
              {topTracks.map((trk, idx) => (
                <DiscoveryCard
                  key={trk.id || trk.uri || idx}
                  testId={`discovery-card-track-${idx}`}
                  imageUrl={trk.image_url || trk.artwork_url}
                  title={trk.name || "Unknown Track"}
                  subtitle={trk.artist || ""}
                  onActivate={() => onPlayTrack(trk.uri || "", undefined, allTopTrackUris, idx)}
                  onCardFocus={() => onFocusTrack(trk)}
                />
              ))}
            </Focusable>
          )}
        </div>
      )}

      {/* 3. Top Artists */}
      {(feed?.needs_reauth || topArtists.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            data-testid="discovery-heading-top-artists"
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#fff" }}
          >
            Top Artists
          </div>
          {feed?.needs_reauth ? (
            <ReauthCard onReauthenticate={onReauthenticate} />
          ) : (
            <Focusable
              flow-children="horizontal"
              data-testid="discovery-carousel-top-artists"
              style={{ display: "flex", gap: 16, overflowX: "auto", padding: "6px 4px 10px" }}
            >
              {topArtists.map((art, idx) => (
                <DiscoveryCard
                  key={art.id || idx}
                  testId={`discovery-card-artist-${idx}`}
                  imageUrl={art.image_url}
                  title={art.name}
                  subtitle="Artist"
                  roundArtwork
                  onActivate={() => onOpenArtist(art)}
                  onCardFocus={() => {
                    onFocusTrack(null);
                    onFocusCollection(null);
                  }}
                />
              ))}
            </Focusable>
          )}
        </div>
      )}

      {/* 4. New Releases */}
      {newReleases.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            data-testid="discovery-heading-new-releases"
            style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2, color: "#fff" }}
          >
            New Releases
          </div>
          <Focusable
            flow-children="horizontal"
            data-testid="discovery-carousel-new-releases"
            style={{ display: "flex", gap: 16, overflowX: "auto", padding: "6px 4px 10px" }}
          >
            {newReleases.map((alb, idx) => (
              <DiscoveryCard
                key={alb.id || alb.uri || idx}
                testId={`discovery-card-album-${idx}`}
                imageUrl={alb.image_url}
                title={alb.name}
                subtitle={alb.artist}
                onActivate={() => onOpenAlbum(alb)}
                onCardFocus={() =>
                  onFocusCollection({
                    uri: alb.uri,
                    name: alb.name,
                    image_url: alb.image_url,
                    type: "album",
                  })
                }
              />
            ))}
          </Focusable>
        </div>
      )}
    </div>
  );
};
