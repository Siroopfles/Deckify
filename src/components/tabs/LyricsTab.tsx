import { FC, RefObject } from "react";
import { FaMicrophone, FaSyncAlt } from "react-icons/fa";
import { SyncedLine } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";

export interface LyricsTabProps {
  trackName?: string;
  artistName?: string;
  lyricsSource?: string;
  handleNextLyricsSource: () => void;
  loadingLyrics: boolean;
  syncedLyrics: SyncedLine[];
  plainLyrics?: string | null;
  currentLineIndex: number;
  activeLineRef?: RefObject<HTMLDivElement | null>;
  onSeekPlayback: (timeMs: number) => void;
}

export const LyricsTab: FC<LyricsTabProps> = ({
  trackName,
  artistName,
  lyricsSource,
  handleNextLyricsSource,
  loadingLyrics,
  syncedLyrics,
  plainLyrics,
  currentLineIndex,
  activeLineRef,
  onSeekPlayback,
}) => {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <FaMicrophone size={18} color="#1db954" />
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Lyrics</h2>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{trackName} — {artistName}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, background: "rgba(29, 185, 84, 0.2)", color: "#1db954", padding: "4px 10px", borderRadius: 12, fontWeight: 700 }}>
            Source: {lyricsSource || "Auto"}
          </span>
          <InteractiveRow
            onClick={handleNextLyricsSource}
            style={{ padding: "4px 10px", fontSize: 11, background: "rgba(255,255,255,0.08)" }}
          >
            <FaSyncAlt size={10} style={{ marginRight: 4 }} />
            Try Next Source
          </InteractiveRow>
        </div>
      </div>

      {loadingLyrics ? (
        <p style={{ opacity: 0.5 }}>Loading lyrics from waterfall...</p>
      ) : syncedLyrics.length > 0 ? (
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "20px 0" }}>
          {syncedLyrics.map((line, idx) => {
            const isCurrent = idx === currentLineIndex;
            return (
              <div
                key={idx}
                ref={isCurrent ? activeLineRef : undefined}
              >
                <InteractiveRow
                  onClick={() => onSeekPlayback(line.timeMs)}
                  active={isCurrent}
                  style={{
                    fontSize: isCurrent ? 20 : 15,
                    fontWeight: isCurrent ? 800 : 500,
                    color: isCurrent ? "#1db954" : "rgba(255,255,255,0.45)",
                    background: isCurrent ? "rgba(29, 185, 84, 0.15)" : "transparent",
                    padding: "6px 12px",
                  }}
                >
                  {line.text}
                </InteractiveRow>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ whiteSpace: "pre-line", opacity: 0.7, fontSize: 15, lineHeight: 1.8 }}>
          {plainLyrics || "No lyrics available for this track."}
        </div>
      )}
    </div>
  );
};
