import { FC } from "react";
import { DialogButton, Focusable } from "@decky/ui";
import { FaCheckCircle, FaDownload, FaPlane } from "react-icons/fa";
import { OfflineDownloadItem, OfflineState } from "../../types";

export interface OfflineTogglePayload {
  uri: string;
  name: string;
  type: "playlist" | "album" | "episode" | "show";
  image_url?: string | null;
  isDownloaded: boolean;
}

export function clampOfflineProgress(progress?: number): number {
  if (typeof progress !== "number" || !Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

export function getItemOfflineInfo(
  item: { uri?: string; offline_state?: OfflineState; offline_progress?: number },
  offlineDownloads?: Record<string, OfflineDownloadItem>,
): { state: OfflineState; progress: number } {
  const cached = item.uri ? offlineDownloads?.[item.uri] : undefined;
  const state = cached?.offline_state ?? item.offline_state ?? "not_downloaded";
  const progress = clampOfflineProgress(cached?.offline_progress ?? item.offline_progress ?? 0);
  return { state, progress };
}

export const OfflineBadge: FC<{ state: OfflineState; progress: number }> = ({ state, progress }) => {
  const clamped = clampOfflineProgress(progress);
  if (state === "downloaded") {
    return (
      <span
        aria-label="Downloaded for offline"
        title="Downloaded for offline"
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--deckify-accent, #1DB954)",
          background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)",
          padding: "2px 6px",
          borderRadius: 10,
          flexShrink: 0,
        }}
      >
        ✓
      </span>
    );
  }
  if (state === "downloading") {
    return (
      <span
        aria-label={`Downloading ${clamped}%`}
        title={`Downloading ${clamped}%`}
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--deckify-accent, #1DB954)",
          background: "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.14)",
          padding: "2px 6px",
          borderRadius: 10,
          flexShrink: 0,
        }}
      >
        ↓ {clamped}%
      </span>
    );
  }
  return null;
};

export const OfflineProgressBar: FC<{ progress: number }> = ({ progress }) => {
  const clamped = clampOfflineProgress(progress);
  return (
    <div
      data-testid="offline-progress-bar"
      style={{
        height: 4,
        borderRadius: 2,
        background: "rgba(255,255,255,0.12)",
        overflow: "hidden",
        marginBottom: 10,
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: "var(--deckify-accent, #1DB954)",
          transition: "width 0.25s ease",
        }}
      />
    </div>
  );
};

export const OfflineDownloadButton: FC<{
  state: OfflineState;
  progress: number;
  onClick: () => void;
  compact?: boolean;
}> = ({ state, progress, onClick, compact }) => {
  const clamped = clampOfflineProgress(progress);
  const isDownloaded = state === "downloaded";
  const isDownloading = state === "downloading";
  const label = isDownloaded
    ? "Remove Download"
    : isDownloading
      ? `Downloading ${clamped}%`
      : "Download for Offline";

  return (
    <DialogButton
      onClick={(e) => {
        e?.stopPropagation?.();
        onClick();
      }}
      style={{
        width: "auto",
        minWidth: "auto",
        flexShrink: 0,
        minHeight: compact ? 30 : 36,
        padding: compact ? "4px 10px" : "6px 14px",
        fontSize: 12,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: isDownloaded ? "rgba(var(--deckify-accent-rgb, 29, 185, 84), 0.16)" : undefined,
        color: isDownloaded ? "var(--deckify-accent, #1DB954)" : undefined,
      }}
    >
      {isDownloaded ? <FaCheckCircle size={12} /> : <FaDownload size={12} />}
      <span>{label}</span>
    </DialogButton>
  );
};

export const TravelModeBanner: FC<{
  message?: string;
  onExitTravelMode?: () => void;
}> = ({ message, onExitTravelMode }) => (
  <Focusable
    flow-children="horizontal"
    data-testid="travel-mode-banner"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      background: "#1C1C1C",
      border: "1px solid var(--deckify-accent, #1DB954)",
      borderRadius: 10,
      padding: "8px 12px",
      marginBottom: 16,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
      <FaPlane size={13} color="var(--deckify-accent, #1DB954)" style={{ flexShrink: 0 }} />
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "#fff",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {message || "Offline Travel Mode"}
      </span>
    </div>
    {onExitTravelMode && (
      <DialogButton
        onClick={onExitTravelMode}
        style={{
          width: "auto",
          minWidth: "auto",
          flexShrink: 0,
          minHeight: 32,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        Exit Travel Mode
      </DialogButton>
    )}
  </Focusable>
);
