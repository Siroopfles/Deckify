import { FC, useState } from "react";
import { DialogButton, Focusable } from "@decky/ui";
import { FaArrowLeft, FaPodcast } from "react-icons/fa";
import { EpisodeFilter, EpisodeItem, OfflineDownloadItem, ShowItem } from "../../types";
import { filterEpisodes, formatRemainingTime } from "../../utils/playback";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, formatMs } from "../common/InteractiveRow";
import {
  OfflineBadge,
  OfflineDownloadButton,
  OfflineProgressBar,
  OfflineTogglePayload,
  TravelModeBanner,
  getItemOfflineInfo,
} from "../common/OfflineStatusUI";

export interface PodcastsTabProps {
  savedShows: ShowItem[];
  savedEpisodes: EpisodeItem[];
  onPlayTrack: (uri: string) => void;
  activeShow?: ShowItem | null;
  showEpisodes?: EpisodeItem[];
  loadingShowEpisodes?: boolean;
  onOpenShow?: (show: ShowItem) => void;
  onCloseShow?: () => void;
  travelModeEnabled?: boolean;
  onExitTravelMode?: () => void;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  onToggleOfflineDownload?: (item: OfflineTogglePayload) => void;
}

const FILTER_OPTIONS: { key: EpisodeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unplayed", label: "Unplayed" },
  { key: "in_progress", label: "In Progress" },
];

export const EpisodeFilterBar: FC<{
  activeFilter: EpisodeFilter;
  onChange: (filter: EpisodeFilter) => void;
}> = ({ activeFilter, onChange }) => (
  <Focusable flow-children="horizontal" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
    {FILTER_OPTIONS.map((opt) => {
      const isActive = activeFilter === opt.key;
      return (
        <DialogButton
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            width: "auto",
            minWidth: "auto",
            minHeight: 36,
            padding: "4px 16px",
            background: isActive ? "var(--deckify-accent, #1DB954)" : undefined,
            color: isActive ? "#000" : undefined,
            fontWeight: isActive ? 700 : 500,
          }}
        >
          {opt.label}
        </DialogButton>
      );
    })}
  </Focusable>
);

function computeProgress(episode: EpisodeItem): { showBar: boolean; pct: number; badge: string } {
  const resumeMs = episode.resume_position_ms ?? 0;
  const durationMs = episode.duration_ms ?? 0;
  if (episode.fully_played) {
    return { showBar: true, pct: 100, badge: "Played" };
  }
  if (resumeMs > 0) {
    const pct = durationMs > 0 ? Math.max(0, Math.min(100, Math.round((resumeMs / durationMs) * 100))) : 0;
    return { showBar: true, pct, badge: formatRemainingTime(durationMs, resumeMs) };
  }
  return { showBar: false, pct: 0, badge: "" };
}

export const EpisodeRow: FC<{
  episode: EpisodeItem;
  onPlayTrack: (uri: string) => void;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  onToggleOfflineDownload?: (item: OfflineTogglePayload) => void;
}> = ({ episode, onPlayTrack, offlineDownloads, onToggleOfflineDownload }) => {
  const { showBar, pct, badge } = computeProgress(episode);
  const offlineInfo = getItemOfflineInfo(episode, offlineDownloads);
  const durationMs = episode.duration_ms ?? 0;
  const metaText = `${episode.show_name || ""}${durationMs > 0 ? `${episode.show_name ? " · " : ""}${formatMs(durationMs)}` : ""}`;

  return (
    <InteractiveRow
      data-deckify-list-item="true"
      data-deckify-label={episode.name || ""}
      onClick={() => onPlayTrack(episode.uri)}
      style={{ gap: 12, flexShrink: 0, position: "relative", overflow: "hidden", paddingBottom: showBar ? 10 : undefined }}
    >
      {episode.image_url ? (
        <DeckifyImage src={episode.image_url} width={42} height={42} style={{ borderRadius: 6, flexShrink: 0 }} />
      ) : (
        <FaPodcast size={22} color="#888" style={{ flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {episode.name}
        </div>
        <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{metaText}</div>
      </div>
      <OfflineBadge state={offlineInfo.state} progress={offlineInfo.progress} />
      {onToggleOfflineDownload && (
        <OfflineDownloadButton
          compact
          state={offlineInfo.state}
          progress={offlineInfo.progress}
          onClick={() =>
            onToggleOfflineDownload({
              uri: episode.uri,
              name: episode.name,
              type: "episode",
              image_url: episode.image_url,
              isDownloaded: offlineInfo.state === "downloaded",
            })
          }
        />
      )}
      {badge && (
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", flexShrink: 0 }}>
          {badge}
        </span>
      )}
      {showBar && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgba(255,255,255,0.15)" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--deckify-accent, #1DB954)" }} />
        </div>
      )}
    </InteractiveRow>
  );
};

export const ShowEpisodesView: FC<{
  activeShow: ShowItem;
  episodes: EpisodeItem[];
  loading?: boolean;
  filter: EpisodeFilter;
  onFilterChange: (filter: EpisodeFilter) => void;
  onCloseShow?: () => void;
  onPlayTrack: (uri: string) => void;
  travelModeEnabled?: boolean;
  onExitTravelMode?: () => void;
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  onToggleOfflineDownload?: (item: OfflineTogglePayload) => void;
}> = ({
  activeShow,
  episodes,
  loading,
  filter,
  onFilterChange,
  onCloseShow,
  onPlayTrack,
  travelModeEnabled,
  onExitTravelMode,
  offlineDownloads,
  onToggleOfflineDownload,
}) => {
  const showOffline = getItemOfflineInfo(activeShow, offlineDownloads);
  const filtered = filterEpisodes(episodes, filter).filter((ep) =>
    travelModeEnabled ? getItemOfflineInfo(ep, offlineDownloads).state === "downloaded" : true,
  );
  return (
    <div>
      {travelModeEnabled && <TravelModeBanner onExitTravelMode={onExitTravelMode} />}
      <InteractiveRow
        onClick={() => onCloseShow?.()}
        style={{ gap: 8, marginBottom: 16, width: "fit-content", padding: "6px 12px", fontSize: 12 }}
      >
        <FaArrowLeft size={12} />
        <span>Back to Podcasts</span>
      </InteractiveRow>
      <Focusable flow-children="horizontal" style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
        {activeShow.image_url ? (
          <DeckifyImage src={activeShow.image_url} width={56} height={56} style={{ borderRadius: 8, flexShrink: 0 }} />
        ) : (
          <FaPodcast size={32} color="#888" style={{ flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              {activeShow.name}
            </h2>
            <OfflineBadge state={showOffline.state} progress={showOffline.progress} />
          </div>
          <span style={{ fontSize: 12, opacity: 0.6, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeShow.publisher || ""}{activeShow.total_episodes != null ? `${activeShow.publisher ? " · " : ""}${activeShow.total_episodes} episodes` : ""}
          </span>
        </div>
        {onToggleOfflineDownload && (
          <OfflineDownloadButton
            state={showOffline.state}
            progress={showOffline.progress}
            onClick={() =>
              onToggleOfflineDownload({
                uri: activeShow.uri,
                name: activeShow.name,
                type: "show",
                image_url: activeShow.image_url,
                isDownloaded: showOffline.state === "downloaded",
              })
            }
          />
        )}
      </Focusable>
      {showOffline.state === "downloading" && <OfflineProgressBar progress={showOffline.progress} />}
      <EpisodeFilterBar activeFilter={filter} onChange={onFilterChange} />
      {loading ? (
        <p style={{ opacity: 0.5 }}>Loading episodes...</p>
      ) : filtered.length === 0 ? (
        <p style={{ opacity: 0.5 }}>{travelModeEnabled ? "No offline downloads yet" : "No Matching Episodes"}</p>
      ) : (
        <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {filtered.map((ep) => (
            <EpisodeRow
              key={ep.id}
              episode={ep}
              onPlayTrack={onPlayTrack}
              offlineDownloads={offlineDownloads}
              onToggleOfflineDownload={onToggleOfflineDownload}
            />
          ))}
        </Focusable>
      )}
    </div>
  );
};

const FollowedShowsSection: FC<{
  savedShows: ShowItem[];
  offlineDownloads?: Record<string, OfflineDownloadItem>;
  onOpenShow?: (show: ShowItem) => void;
  onPlayTrack: (uri: string) => void;
}> = ({ savedShows, offlineDownloads, onOpenShow, onPlayTrack }) => (
  <div style={{ marginBottom: 24 }}>
    <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 10 }}>
      Followed Podcasts ({savedShows.length})
    </h3>
    <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {savedShows.map((s) => {
        const offlineInfo = getItemOfflineInfo(s, offlineDownloads);
        return (
          <InteractiveRow
            key={s.id}
            data-deckify-list-item="true"
            data-deckify-label={s.name || ""}
            onClick={() => (onOpenShow ? onOpenShow(s) : onPlayTrack(s.uri))}
            style={{ gap: 12 }}
          >
            {s.image_url ? (
              <DeckifyImage src={s.image_url} width={38} height={38} style={{ borderRadius: 6, flexShrink: 0 }} />
            ) : (
              <FaPodcast size={20} color="#888" style={{ flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </div>
              <div style={{ fontSize: 11, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.publisher} · {s.total_episodes} episodes
              </div>
            </div>
            <OfflineBadge state={offlineInfo.state} progress={offlineInfo.progress} />
          </InteractiveRow>
        );
      })}
    </Focusable>
  </div>
);

export const PodcastsTab: FC<PodcastsTabProps> = ({
  savedShows,
  savedEpisodes,
  onPlayTrack,
  activeShow,
  showEpisodes = [],
  loadingShowEpisodes = false,
  onOpenShow,
  onCloseShow,
  travelModeEnabled,
  onExitTravelMode,
  offlineDownloads,
  onToggleOfflineDownload,
}) => {
  const [savedFilter, setSavedFilter] = useState<EpisodeFilter>("all");
  const [showFilter, setShowFilter] = useState<EpisodeFilter>("all");

  if (activeShow) {
    return (
      <ShowEpisodesView
        activeShow={activeShow}
        episodes={showEpisodes}
        loading={loadingShowEpisodes}
        filter={showFilter}
        onFilterChange={setShowFilter}
        onCloseShow={onCloseShow}
        onPlayTrack={onPlayTrack}
        travelModeEnabled={travelModeEnabled}
        onExitTravelMode={onExitTravelMode}
        offlineDownloads={offlineDownloads}
        onToggleOfflineDownload={onToggleOfflineDownload}
      />
    );
  }

  const visibleShows = travelModeEnabled
    ? savedShows.filter((s) => getItemOfflineInfo(s, offlineDownloads).state === "downloaded")
    : savedShows;
  const filteredSaved = filterEpisodes(savedEpisodes, savedFilter).filter((ep) =>
    travelModeEnabled ? getItemOfflineInfo(ep, offlineDownloads).state === "downloaded" : true,
  );

  return (
    <div>
      {travelModeEnabled && <TravelModeBanner onExitTravelMode={onExitTravelMode} />}
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Podcasts & Shows</h2>
      {visibleShows.length > 0 && (
        <FollowedShowsSection
          savedShows={visibleShows}
          offlineDownloads={offlineDownloads}
          onOpenShow={onOpenShow}
          onPlayTrack={onPlayTrack}
        />
      )}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--deckify-accent, #1DB954)", marginBottom: 10 }}>
          Saved Episodes ({filteredSaved.length})
        </h3>
        <EpisodeFilterBar activeFilter={savedFilter} onChange={setSavedFilter} />
        {travelModeEnabled && visibleShows.length === 0 && filteredSaved.length === 0 ? (
          <div data-testid="travel-mode-empty" style={{ textAlign: "center", padding: "32px 16px", opacity: 0.7, fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>No offline downloads yet</div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Switch to Official Spotify Client and select &quot;Download for Offline&quot; on any playlist, album, or podcast episode to listen without Wi-Fi.
            </div>
          </div>
        ) : savedEpisodes.length === 0 && savedShows.length === 0 ? (
          <p style={{ opacity: 0.5 }}>No podcasts or episodes found in your library.</p>
        ) : filteredSaved.length === 0 ? (
          <p style={{ opacity: 0.5 }}>No Matching Episodes</p>
        ) : (
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filteredSaved.map((ep) => (
              <EpisodeRow
                key={ep.id}
                episode={ep}
                onPlayTrack={onPlayTrack}
                offlineDownloads={offlineDownloads}
                onToggleOfflineDownload={onToggleOfflineDownload}
              />
            ))}
          </Focusable>
        )}
      </div>
    </div>
  );
};
