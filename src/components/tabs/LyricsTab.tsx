import { FC, RefObject } from "react";
import { Focusable } from "@decky/ui";
import { FaLanguage, FaMicrophone, FaMinus, FaPlus, FaSyncAlt, FaUndo } from "react-icons/fa";
import { SyncedLine } from "../../types";
import { InteractiveRow } from "../common/InteractiveRow";

export const LYRICS_SOURCES = [
  { offset: 0, label: "Spotify" },
  { offset: 1, label: "LRCLIB" },
  { offset: 2, label: "NetEase" },
  { offset: 3, label: "Musixmatch" },
  { offset: 4, label: "Lyrics.ovh" },
] as const;

export interface LyricsTabProps {
  trackName?: string;
  artistName?: string;
  lyricsSource?: string;
  lyricsCached?: boolean;
  handleNextLyricsSource: () => void;
  onSelectLyricsSource?: (offset: number, label: string) => void;
  loadingLyrics: boolean;
  syncedLyrics: SyncedLine[];
  plainLyrics?: string | null;
  plainRomanizedLines?: (string | null)[] | null;
  currentLineIndex: number;
  activeLineRef?: RefObject<HTMLDivElement | null>;
  onSeekPlayback: (timeMs: number) => void;
  trackOffsetMs?: number;
  onNudgeOffset?: (deltaMs: number) => void;
  onResetOffset?: () => void;
  romanizeEnabled?: boolean;
  romanizeDisplayStyle?: "dual" | "romanized_only";
  onToggleRomanize?: () => void;
}

function formatOffsetBadge(offsetMs: number): string {
  const secs = offsetMs / 1000;
  if (offsetMs > 0) return `+${secs.toFixed(1)}s`;
  if (offsetMs < 0) return `${secs.toFixed(1)}s`;
  return "0.0s";
}

interface LyricsNudgeToolbarProps {
  trackOffsetMs: number;
  onNudgeOffset?: (deltaMs: number) => void;
  onResetOffset?: () => void;
  romanizeEnabled: boolean;
  onToggleRomanize?: () => void;
}

export const LyricsNudgeToolbar: FC<LyricsNudgeToolbarProps> = ({
  trackOffsetMs,
  onNudgeOffset,
  onResetOffset,
  romanizeEnabled,
  onToggleRomanize,
}) => {
  const hasOffset = trackOffsetMs !== 0;
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}
    >
      <InteractiveRow
        onClick={() => onNudgeOffset?.(-500)}
        style={{ minHeight: 36, padding: "8px 12px", fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.08)", borderRadius: 12 }}
      >
        <FaMinus size={10} style={{ marginRight: 4 }} />
        -0.5s
      </InteractiveRow>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          padding: "4px 8px",
          borderRadius: 8,
          color: hasOffset ? "var(--deckify-accent, #1DB954)" : "rgba(255,255,255,0.6)",
          background: hasOffset ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.18)" : "rgba(255,255,255,0.06)",
        }}
      >
        {formatOffsetBadge(trackOffsetMs)}
      </span>
      <InteractiveRow
        onClick={() => onNudgeOffset?.(500)}
        style={{ minHeight: 36, padding: "8px 12px", fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.08)", borderRadius: 12 }}
      >
        <FaPlus size={10} style={{ marginRight: 4 }} />
        +0.5s
      </InteractiveRow>
      <InteractiveRow
        onClick={() => onResetOffset?.()}
        style={{
          minHeight: 36,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 700,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 12,
          opacity: hasOffset ? 1 : 0.4,
        }}
      >
        <FaUndo size={10} style={{ marginRight: 4 }} />
        Reset
      </InteractiveRow>
      <InteractiveRow
        active={romanizeEnabled}
        onClick={() => onToggleRomanize?.()}
        style={{
          minHeight: 36,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 700,
          color: romanizeEnabled ? "var(--deckify-accent, #1DB954)" : "rgba(255,255,255,0.85)",
          background: romanizeEnabled ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)" : "rgba(255,255,255,0.08)",
          borderRadius: 12,
        }}
      >
        <FaLanguage size={12} style={{ marginRight: 4 }} />
        Romanize
      </InteractiveRow>
      <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.55 }}>
        X -0.5s · Y +0.5s
      </span>
    </Focusable>
  );
};

function renderLyricLineContent(
  text: string,
  romanized: string | null | undefined,
  romanizeEnabled: boolean,
  displayStyle: "dual" | "romanized_only",
) {
  if (!romanizeEnabled || !romanized) {
    return text;
  }
  if (displayStyle === "romanized_only") {
    return romanized;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span>{text}</span>
      <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.72, lineHeight: 1.3 }}>
        {romanized}
      </span>
    </div>
  );
}

interface PlainLyricsBodyProps {
  plainLyrics?: string | null;
  plainRomanizedLines?: (string | null)[] | null;
  romanizeEnabled: boolean;
  romanizeDisplayStyle: "dual" | "romanized_only";
}

const PlainLyricsBody: FC<PlainLyricsBodyProps> = ({
  plainLyrics,
  plainRomanizedLines,
  romanizeEnabled,
  romanizeDisplayStyle,
}) => {
  if (!plainLyrics) {
    return (
      <div style={{ padding: "24px 0" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px 0" }}>No Lyrics Available</h3>
        <p style={{ fontSize: 14, opacity: 0.6, margin: 0, lineHeight: 1.5 }}>
          No synced or plain lyrics were found for this track. Press Try Next Source to search another provider.
        </p>
      </div>
    );
  }
  if (romanizeEnabled && plainRomanizedLines && plainRomanizedLines.length > 0) {
    const lines = plainLyrics.split("\n");
    return (
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "24px 0", fontSize: 14, lineHeight: 1.5, opacity: 0.85 }}>
        {lines.map((line, idx) => (
          <div key={idx}>
            {renderLyricLineContent(line, plainRomanizedLines[idx], true, romanizeDisplayStyle)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ flex: 1, overflowY: "auto", whiteSpace: "pre-line", opacity: 0.7, fontSize: 14, lineHeight: 1.5, padding: "24px 0" }}>
      {plainLyrics}
    </div>
  );
};

interface LyricsHeaderProps {
  trackName?: string;
  artistName?: string;
  lyricsSource?: string;
  lyricsCached: boolean;
  handleNextLyricsSource: () => void;
}

function renderLyricsHeader({
  trackName,
  artistName,
  lyricsSource,
  lyricsCached,
  handleNextLyricsSource,
}: LyricsHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <FaMicrophone size={18} color="var(--deckify-accent, #1DB954)" />
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Lyrics</h2>
          <span style={{ fontSize: 12, opacity: 0.6 }}>{trackName} — {artistName}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)", color: "var(--deckify-accent, #1DB954)", padding: "4px 8px", borderRadius: 12, fontWeight: 700 }}>
          Source: {lyricsSource || "Auto"}{lyricsCached ? " (Cached)" : ""}
        </span>
        <InteractiveRow
          onClick={handleNextLyricsSource}
          style={{ minHeight: 36, padding: "8px 12px", fontSize: 12, fontWeight: 700, background: "rgba(255,255,255,0.08)", borderRadius: 12 }}
        >
          <FaSyncAlt size={10} style={{ marginRight: 4 }} />
          Try Next Source
        </InteractiveRow>
      </div>
    </div>
  );
}

interface SyncedLyricsListProps {
  syncedLyrics: SyncedLine[];
  currentLineIndex: number;
  activeLineRef?: RefObject<HTMLDivElement | null>;
  onSeekPlayback: (timeMs: number) => void;
  trackOffsetMs: number;
  romanizeEnabled: boolean;
  romanizeDisplayStyle: "dual" | "romanized_only";
}

const SyncedLyricsList: FC<SyncedLyricsListProps> = ({
  syncedLyrics,
  currentLineIndex,
  activeLineRef,
  onSeekPlayback,
  trackOffsetMs,
  romanizeEnabled,
  romanizeDisplayStyle,
}) => (
  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "24px 0" }}>
    {syncedLyrics.map((line, idx) => {
      const isCurrent = idx === currentLineIndex;
      return (
        <div key={idx} ref={isCurrent ? activeLineRef : undefined}>
          <InteractiveRow
            onClick={() => onSeekPlayback(Math.max(0, line.timeMs + trackOffsetMs))}
            active={isCurrent}
            style={{
              fontSize: isCurrent ? 20 : 14,
              fontWeight: isCurrent ? 700 : 400,
              color: isCurrent ? "var(--deckify-accent, #1DB954)" : "rgba(255,255,255,0.45)",
              background: isCurrent ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.15)" : "transparent",
              padding: "8px 12px",
            }}
          >
            {renderLyricLineContent(line.text, line.romanized, romanizeEnabled, romanizeDisplayStyle)}
          </InteractiveRow>
        </div>
      );
    })}
  </div>
);

function renderLyricsSourcesBar(
  lyricsSource?: string,
  onSelectLyricsSource?: (offset: number, label: string) => void,
) {
  return (
    <Focusable
      flow-children="horizontal"
      style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}
    >
      {LYRICS_SOURCES.map((src) => {
        const isActive = lyricsSource === src.label;
        return (
          <InteractiveRow
            key={src.offset}
            active={isActive}
            onClick={() => onSelectLyricsSource?.(src.offset, src.label)}
            style={{
              minHeight: 36,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: isActive ? 700 : 400,
              color: isActive ? "var(--deckify-accent, #1DB954)" : "rgba(255, 255, 255, 0.85)",
              background: isActive ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.2)" : "rgba(255, 255, 255, 0.08)",
              borderRadius: 12,
            }}
          >
            {src.label}
          </InteractiveRow>
        );
      })}
    </Focusable>
  );
}

export const LyricsTab: FC<LyricsTabProps> = ({
  trackName,
  artistName,
  lyricsSource,
  lyricsCached = false,
  handleNextLyricsSource,
  onSelectLyricsSource,
  loadingLyrics,
  syncedLyrics,
  plainLyrics,
  plainRomanizedLines,
  currentLineIndex,
  activeLineRef,
  onSeekPlayback,
  trackOffsetMs = 0,
  onNudgeOffset,
  onResetOffset,
  romanizeEnabled = false,
  romanizeDisplayStyle = "dual",
  onToggleRomanize,
}) => {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {renderLyricsHeader({
        trackName,
        artistName,
        lyricsSource,
        lyricsCached,
        handleNextLyricsSource,
      })}

      {renderLyricsSourcesBar(lyricsSource, onSelectLyricsSource)}

      <LyricsNudgeToolbar
        trackOffsetMs={trackOffsetMs}
        onNudgeOffset={onNudgeOffset}
        onResetOffset={onResetOffset}
        romanizeEnabled={romanizeEnabled}
        onToggleRomanize={onToggleRomanize}
      />

      {loadingLyrics ? (
        <p style={{ opacity: 0.5 }}>Loading lyrics from waterfall...</p>
      ) : syncedLyrics.length > 0 ? (
        <SyncedLyricsList
          syncedLyrics={syncedLyrics}
          currentLineIndex={currentLineIndex}
          activeLineRef={activeLineRef}
          onSeekPlayback={onSeekPlayback}
          trackOffsetMs={trackOffsetMs}
          romanizeEnabled={romanizeEnabled}
          romanizeDisplayStyle={romanizeDisplayStyle}
        />
      ) : (
        <PlainLyricsBody
          plainLyrics={plainLyrics}
          plainRomanizedLines={plainRomanizedLines}
          romanizeEnabled={romanizeEnabled}
          romanizeDisplayStyle={romanizeDisplayStyle}
        />
      )}
    </div>
  );
};
