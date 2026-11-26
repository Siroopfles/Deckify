import { FC, useEffect, useRef } from "react";
import { DialogButton, Focusable } from "@decky/ui";
import { QRCodeSVG } from "qrcode.react";
import { FaQrcode, FaSignOutAlt, FaStopCircle, FaTimes, FaUsers } from "react-icons/fa";
import { AudioBackend, JamSessionStatus } from "../../types";
import { InteractiveRow } from "./InteractiveRow";

const SPOTIFY_URI_RE = /^spotify:(track|playlist|album|episode|show):([A-Za-z0-9]+)$/;

export function buildSpotifyDeepLink(uri?: string | null): string {
  if (!uri || typeof uri !== "string") return "";
  const match = SPOTIFY_URI_RE.exec(uri.trim());
  if (!match) return "";
  return `https://open.spotify.com/${match[1]}/${match[2]}`;
}

export interface JamQrCardProps {
  audioBackend: AudioBackend;
  jamSession: JamSessionStatus | null;
  shareUri?: string | null;
  shareLabel?: string | null;
  loading?: boolean;
  onSwitchAndStartJam?: () => void;
  onRetryJam?: () => void;
  compact?: boolean;
}

export interface JamQrModalProps {
  audioBackend: AudioBackend;
  jamSession: JamSessionStatus | null;
  shareUri?: string | null;
  shareLabel?: string | null;
  loading?: boolean;
  onClose: () => void;
  onEndJam?: () => void;
  onLeaveJam?: () => void;
  onSwitchAndStartJam?: () => void;
  onRetryJam?: () => void;
}

function renderQrBody(qrUrl: string, loading: boolean, compact: boolean, errorMsg?: string | null) {
  const qrSize = compact ? 140 : 180;
  const qrPadding = compact ? 12 : 16;

  if (qrUrl) {
    return (
      <div
        style={{
          background: "#FFFFFF",
          padding: qrPadding,
          borderRadius: 12,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <QRCodeSVG value={qrUrl} size={qrSize} bgColor="#FFFFFF" fgColor="#000000" level="M" />
      </div>
    );
  }

  return (
    <div
      style={{
        width: qrSize,
        minHeight: compact ? 120 : 160,
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        textAlign: "center",
        fontSize: 13,
        opacity: 0.8,
      }}
    >
      {loading
        ? "Loading Spotify Jam QR..."
        : errorMsg || "No active Jam or playable track URI available to share."}
    </div>
  );
}

function renderGuestBadge(jamSession: JamSessionStatus | null) {
  if (!jamSession?.active) return null;
  const count = typeof jamSession.guest_count === "number" ? jamSession.guest_count : null;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(29, 185, 84, 0.18)",
        color: "var(--deckify-accent, #1DB954)",
        fontSize: 12,
        fontWeight: 700,
      }}
    >
      <FaUsers size={12} />
      <span>{count !== null ? `Jam Active · ${count} ${count === 1 ? "guest" : "guests"}` : "Jam Active"}</span>
    </div>
  );
}

function renderLibrespotNotice(onSwitchAndStartJam?: () => void) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        width: "100%",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
        Playback share link — switch to Official Spotify Client to host a live Spotify Jam.
      </div>
      {onSwitchAndStartJam && (
        <DialogButton
          onClick={onSwitchAndStartJam}
          style={{
            width: "auto",
            minWidth: "auto",
            flexShrink: 0,
            padding: "6px 14px",
            fontSize: 12,
          }}
        >
          Switch to Spotify Client &amp; Start Jam
        </DialogButton>
      )}
    </div>
  );
}

const ELLIPSIS_TEXT_STYLE = {
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export const JamQrCard: FC<JamQrCardProps> = ({
  audioBackend,
  jamSession,
  shareUri,
  shareLabel,
  loading = false,
  onSwitchAndStartJam,
  onRetryJam,
  compact = false,
}) => {
  const isSpotifyClient = audioBackend === "spotify_client";
  const qrUrl = isSpotifyClient ? (jamSession?.join_url || "") : buildSpotifyDeepLink(shareUri);
  const effectiveError =
    isSpotifyClient && !loading && !qrUrl
      ? (jamSession?.error || "Could not retrieve Spotify Jam invite link. Ensure Official Spotify Client is ready and retry.")
      : jamSession?.error;

  return (
    <div
      data-testid="jam-qr-card"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: compact ? 8 : 12,
        width: "100%",
        minWidth: 0,
      }}
    >
      {renderGuestBadge(jamSession)}
      {renderQrBody(qrUrl, loading, compact, effectiveError)}
      {shareLabel && <div style={{ fontSize: 14, fontWeight: 700, ...ELLIPSIS_TEXT_STYLE }}>{shareLabel}</div>}
      {qrUrl && <div style={{ fontSize: 12, opacity: 0.7, ...ELLIPSIS_TEXT_STYLE }}>{qrUrl}</div>}
      {isSpotifyClient && !qrUrl && !loading && onRetryJam && (
        <InteractiveRow tabIndex={0} onClick={onRetryJam} style={{ justifyContent: "center", gap: 8 }}>
          <span>Retry Jam</span>
        </InteractiveRow>
      )}
      {!isSpotifyClient && renderLibrespotNotice(onSwitchAndStartJam)}
    </div>
  );
};

function renderModalActions({
  isActive,
  isHost,
  onClose,
  onEndJam,
  onLeaveJam,
}: {
  isActive: boolean;
  isHost: boolean;
  onClose: () => void;
  onEndJam?: () => void;
  onLeaveJam?: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
      {isActive && isHost && onEndJam && (
        <InteractiveRow tabIndex={0} onClick={onEndJam} style={{ gap: 10, color: "#FF5555" }}>
          <FaStopCircle size={13} color="#FF5555" />
          <span>End Jam</span>
        </InteractiveRow>
      )}
      {isActive && !isHost && onLeaveJam && (
        <InteractiveRow tabIndex={0} onClick={onLeaveJam} style={{ gap: 10 }}>
          <FaSignOutAlt size={13} />
          <span>Leave Jam</span>
        </InteractiveRow>
      )}
      <InteractiveRow tabIndex={isActive ? undefined : 0} onClick={onClose} style={{ justifyContent: "center", gap: 8 }}>
        <FaTimes size={12} />
        <span>Close (B)</span>
      </InteractiveRow>
    </div>
  );
}

export const JamQrModal: FC<JamQrModalProps> = ({
  audioBackend,
  jamSession,
  shareUri,
  shareLabel,
  loading = false,
  onClose,
  onEndJam,
  onLeaveJam,
  onSwitchAndStartJam,
  onRetryJam,
}) => {
  const modalContainerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const rafId = requestAnimationFrame(() => {
      const target = modalContainerRef.current?.querySelector('[tabindex="0"]') as HTMLElement | null;
      target?.focus?.();
    });
    return () => {
      cancelAnimationFrame(rafId);
      previousFocusRef.current?.focus?.();
      previousFocusRef.current = null;
    };
  }, []);

  const isActive = Boolean(jamSession?.active);
  const isHost = Boolean(jamSession?.is_host);

  return (
    <div
      ref={modalContainerRef}
      data-testid="jam-qr-modal"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 40,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
      }}
    >
      <Focusable
        flow-children="column"
        onCancelButton={onClose}
        style={{
          background: "#1C1C1C",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 14,
          padding: 20,
          width: 400,
          maxWidth: "90%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700 }}>
          <FaQrcode size={16} color="var(--deckify-accent, #1DB954)" />
          <span>Spotify Jam</span>
        </div>

        <JamQrCard
          audioBackend={audioBackend}
          jamSession={jamSession}
          shareUri={shareUri}
          shareLabel={shareLabel}
          loading={loading}
          onSwitchAndStartJam={onSwitchAndStartJam}
          onRetryJam={onRetryJam}
        />

        {renderModalActions({ isActive, isHost, onClose, onEndJam, onLeaveJam })}
      </Focusable>
    </div>
  );
};
