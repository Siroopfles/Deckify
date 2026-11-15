import { FC, useCallback, useEffect, useState } from "react";
import { Focusable } from "@decky/ui";
import { callable } from "@decky/api";
import { FaSync } from "react-icons/fa";
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
import { focusHalo } from "../common/InteractiveRow";

const backendGetDiscoveryFeed = callable<[DiscoveryTimeRange, boolean?], DiscoveryFeedResponse>(
  "get_discovery_feed"
);

export function getGreetingForHour(hour: number): string {
  if (hour >= 5 && hour <= 11) return "Good morning";
  if (hour >= 12 && hour <= 17) return "Good afternoon";
  return "Good evening";
}

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
  onFocusTrack,
  onFocusCollection,
}) => {
  const [timeRange] = useState<DiscoveryTimeRange>("medium_term");
  const [feed, setFeed] = useState<DiscoveryFeedResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshFocused, setRefreshFocused] = useState(false);

  const loadFeed = useCallback(
    async (range: DiscoveryTimeRange, forceRefresh = false) => {
      setLoading(true);
      try {
        const res = await backendGetDiscoveryFeed(range, forceRefresh);
        setFeed(res);
      } catch (e: any) {
        setFeed({ ok: false, error: e?.message || "Failed to load Discovery feed" });
      } finally {
        setLoading(false);
      }
    },
    []
  );

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
      onFocusTrack(null);
      onFocusCollection(null);
    };
  }, [timeRange, onFocusTrack, onFocusCollection]);

  const greeting = getGreetingForHour(new Date().getHours());
  const madeForYou: DiscoveryMixItem[] = feed?.made_for_you || [];

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

      {loading && !feed && (
        <div data-testid="discovery-loading" style={{ fontSize: 13, opacity: 0.7 }}>
          Loading Discovery feed...
        </div>
      )}

      {!loading && feed && madeForYou.length === 0 && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          Discovery feed ready.
        </div>
      )}
    </div>
  );
};
