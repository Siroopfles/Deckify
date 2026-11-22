import { FC, CSSProperties, useState, useEffect, useRef } from "react";
import { BannerPayload, BannerTone, subscribeBanner } from "../bannerBus";
import { getThemeCssVars, useAccentTheme } from "../utils/themeBus";

export const BANNER_DURATION_MS = 3500;
export const BANNER_FADE_START_MS = 3250;
export const HUD_CLEARANCE_OFFSET_PX = 140;

export interface SilentBannerProps {
  enabled: boolean;
  position?: string;
  hudVisible?: boolean;
  hudPosition?: string;
  onVisibilityChange?: (visible: boolean) => void;
}

type BannerCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface ActiveBannerState {
  payload: BannerPayload;
  fading: boolean;
}

function normalizeCornerPosition(raw?: string): BannerCorner {
  const normalized = (raw ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (
    normalized === "top-left" ||
    normalized === "top-right" ||
    normalized === "bottom-left" ||
    normalized === "bottom-right"
  ) {
    return normalized;
  }
  return "top-right";
}

function resolveSafeCoverUrl(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  if (raw.startsWith("data:") || raw.startsWith("http://127.0.0.1")) {
    return raw;
  }
  return null;
}

function getToneAccentColor(tone?: BannerTone): string {
  if (tone === "error") return "#E53935";
  if (tone === "neutral") return "rgba(255, 255, 255, 0.35)";
  return "var(--deckify-accent, #1DB954)";
}

function buildBannerStyle(
  corner: BannerCorner,
  sameCornerHud: boolean,
  fading: boolean,
  tone?: BannerTone
): CSSProperties {
  const isTop = corner.startsWith("top");
  const isLeft = corner.endsWith("left");
  const verticalInset = sameCornerHud ? HUD_CLEARANCE_OFFSET_PX : 24;

  return {
    position: "fixed",
    zIndex: 10000,
    pointerEvents: "none",
    top: isTop ? verticalInset : undefined,
    bottom: isTop ? undefined : verticalInset,
    left: isLeft ? 24 : undefined,
    right: isLeft ? undefined : 24,
    minWidth: 240,
    maxWidth: "min(420px, 40vw)",
    minHeight: 48,
    padding: "12px 16px",
    borderRadius: 8,
    background: "rgba(18, 18, 18, 0.92)",
    border: "1px solid rgba(255, 255, 255, 0.12)",
    borderLeft: `3px solid ${getToneAccentColor(tone)}`,
    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    gap: 8,
    boxSizing: "border-box",
    transition: fading ? "opacity 250ms ease-in" : "opacity 150ms ease-out",
    opacity: fading ? 0 : 1,
  };
}

function clearTimerRef(ref: { current: ReturnType<typeof setTimeout> | null }): void {
  if (ref.current) {
    clearTimeout(ref.current);
    ref.current = null;
  }
}

function renderBannerContent(payload: BannerPayload, safeCover: string | null) {
  return (
    <>
      {safeCover ? (
        <img
          src={safeCover}
          alt=""
          width={40}
          height={40}
          style={{
            width: 40,
            height: 40,
            borderRadius: 4,
            objectFit: "cover",
            flexShrink: 0,
            display: "block",
          }}
        />
      ) : null}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {payload.text}
        </div>
        {payload.secondaryText ? (
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1.3,
              opacity: 0.7,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 2,
            }}
          >
            {payload.secondaryText}
          </div>
        ) : null}
      </div>
    </>
  );
}

export const SilentBanner: FC<SilentBannerProps> = ({
  enabled,
  position = "top-right",
  hudVisible = false,
  hudPosition,
  onVisibilityChange,
}) => {
  const { accent, animationsSuspended } = useAccentTheme();
  const [bannerState, setBannerState] = useState<ActiveBannerState | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onVisibilityChangeRef = useRef(onVisibilityChange);
  onVisibilityChangeRef.current = onVisibilityChange;

  useEffect(() => {
    onVisibilityChangeRef.current?.(Boolean(enabled && bannerState));
  }, [enabled, bannerState]);

  useEffect(() => {
    return () => {
      onVisibilityChangeRef.current?.(false);
    };
  }, []);

  useEffect(() => {
    const clearTimers = () => {
      clearTimerRef(fadeTimerRef);
      clearTimerRef(hideTimerRef);
    };

    if (!enabled) {
      clearTimers();
      setBannerState((prev) => (prev !== null ? null : prev));
      return undefined;
    }

    const unsubscribe = subscribeBanner((next) => {
      clearTimers();
      setBannerState({ payload: next, fading: false });
      fadeTimerRef.current = setTimeout(() => {
        fadeTimerRef.current = null;
        setBannerState((prev) =>
          prev && prev.payload.id === next.id ? { ...prev, fading: true } : prev
        );
      }, BANNER_FADE_START_MS);
      hideTimerRef.current = setTimeout(() => {
        hideTimerRef.current = null;
        setBannerState((prev) => (prev && prev.payload.id === next.id ? null : prev));
      }, BANNER_DURATION_MS);
    });

    return () => {
      unsubscribe();
      clearTimers();
    };
  }, [enabled]);

  if (!enabled || !bannerState) {
    return null;
  }

  const { payload, fading } = bannerState;
  const corner = normalizeCornerPosition(position);
  const sameCornerHud =
    Boolean(hudVisible) && normalizeCornerPosition(hudPosition ?? corner) === corner;
  const safeCover = resolveSafeCoverUrl(payload.imageUrl);

  return (
    <div
      data-testid="deckify-silent-banner"
      data-banner-id={payload.id}
      style={{
        ...getThemeCssVars(accent, animationsSuspended),
        ...buildBannerStyle(corner, sameCornerHud, fading, payload.tone),
      }}
    >
      {renderBannerContent(payload, safeCover)}
    </div>
  );
};
