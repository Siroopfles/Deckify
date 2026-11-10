import { FC } from "react";
import { Focusable } from "@decky/ui";
import { FaPodcast } from "react-icons/fa";
import { EpisodeItem } from "../../types";
import { DeckifyImage } from "../common/DeckifyImage";
import { InteractiveRow, formatMs } from "../common/InteractiveRow";

export interface PodcastsTabProps {
  savedShows: any[];
  savedEpisodes: EpisodeItem[];
  onPlayTrack: (uri: string) => void;
}

export const PodcastsTab: FC<PodcastsTabProps> = ({
  savedShows,
  savedEpisodes,
  onPlayTrack,
}) => {
  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>Podcasts & Shows</h2>

      {/* Followed Shows */}
      {savedShows.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>
            Followed Podcasts ({savedShows.length})
          </h3>
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {savedShows.map((s) => (
              <InteractiveRow
                key={s.id}
                onClick={() => onPlayTrack(s.uri)}
                style={{ gap: 12 }}
              >
                {s.image_url ? (
                  <DeckifyImage src={s.image_url} width={38} height={38} style={{ borderRadius: 6 }} />
                ) : (
                  <FaPodcast size={20} color="#888" />
                )}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.6 }}>
                    {s.publisher} · {s.total_episodes} episodes
                  </div>
                </div>
              </InteractiveRow>
            ))}
          </Focusable>
        </div>
      )}

      {/* Saved Episodes */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1db954", marginBottom: 10 }}>
          Saved Episodes ({savedEpisodes.length})
        </h3>
        {savedEpisodes.length === 0 && savedShows.length === 0 ? (
          <p style={{ opacity: 0.5 }}>No podcasts or episodes found in your library.</p>
        ) : (
          <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {savedEpisodes.map((ep) => {
              const resumeMs = ep.resume_position_ms || 0;
              const durationMs = ep.duration_ms || 1;
              const pct = Math.min(100, Math.round((resumeMs / durationMs) * 100));

              return (
                <InteractiveRow
                  key={ep.id}
                  onClick={() => onPlayTrack(ep.uri)}
                  style={{ gap: 12 }}
                >
                  {ep.image_url ? (
                    <DeckifyImage src={ep.image_url} width={42} height={42} style={{ borderRadius: 6 }} />
                  ) : (
                    <FaPodcast size={22} color="#888" />
                  )}
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ep.name}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginBottom: resumeMs > 0 ? 4 : 0 }}>
                      {ep.show_name} · {formatMs(ep.duration_ms || 0)}
                    </div>
                    {resumeMs > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#1db954" }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#1db954", fontWeight: 700 }}>
                          Resume {formatMs(resumeMs)}
                        </span>
                      </div>
                    )}
                  </div>
                </InteractiveRow>
              );
            })}
          </Focusable>
        )}
      </div>
    </div>
  );
};
