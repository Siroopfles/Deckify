import { CSSProperties, ReactNode, useEffect, useState } from "react";
import { FaMusic } from "react-icons/fa";
import {
  ImageLruCache,
  ImageRequestQueue,
  imgMemoryCache,
  imgRequestQueue,
  imgPending,
  fetchWithQueueAndCache,
} from "./imagePipeline";

export {
  ImageLruCache,
  ImageRequestQueue,
  imgMemoryCache,
  imgRequestQueue,
  imgPending,
};

const SHIMMER_STYLE_ID = "deckify-image-shimmer-style";

function ensureShimmerStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHIMMER_STYLE_ID)) return;
  const styleEl = document.createElement("style");
  styleEl.id = SHIMMER_STYLE_ID;
  styleEl.textContent = `
    @keyframes deckifyShimmer {
      0% { background-color: #1a1a1a; }
      50% { background-color: #2a2a2a; }
      100% { background-color: #1a1a1a; }
    }
    .deckify-image-skeleton {
      animation: deckifyShimmer 1.5s ease-in-out infinite;
    }
  `;
  document.head.appendChild(styleEl);
}

export interface DeckifyImageProps {
  src?: string | null;
  width?: number | string;
  height?: number | string;
  style?: CSSProperties | any;
  className?: string;
  fallback?: ReactNode;
}

export function DeckifyImage({
  src,
  width,
  height,
  style,
  className,
  fallback,
}: DeckifyImageProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(() => {
    if (!src) return null;
    if (src.startsWith("data:") || src.startsWith("http://127.0.0.1")) return src;
    return imgMemoryCache.get(src) || null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!src) return false;
    if (src.startsWith("data:") || src.startsWith("http://127.0.0.1")) return false;
    return !imgMemoryCache.has(src);
  });

  useEffect(() => {
    ensureShimmerStyle();
    if (!src) {
      setDataUrl(null);
      setIsLoading(false);
      return;
    }
    if (src.startsWith("data:") || src.startsWith("http://127.0.0.1")) {
      setDataUrl(src);
      setIsLoading(false);
      return;
    }
    const cached = imgMemoryCache.get(src);
    if (cached) {
      setDataUrl(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    let active = true;

    fetchWithQueueAndCache(src).then((du) => {
      if (!active) return;
      setDataUrl(du);
      setIsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [src]);

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        width={width}
        height={height}
        style={{ objectFit: "cover", flexShrink: 0, ...style }}
        className={className}
        onError={() => setDataUrl(null)}
      />
    );
  }

  if (fallback) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
        {fallback}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="deckify-image-skeleton"
        style={{
          width,
          height,
          backgroundColor: "#1a1a1a",
          animation: "deckifyShimmer 1.5s ease-in-out infinite",
          borderRadius: (style as any)?.borderRadius || 4,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  const iconSize = typeof width === "number" ? Math.max(12, Math.floor(width * 0.4)) : 14;
  return (
    <div
      style={{
        width,
        height,
        background: "rgba(255, 255, 255, 0.05)",
        borderRadius: (style as any)?.borderRadius || 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        ...style,
      }}
    >
      <FaMusic size={iconSize} color="rgba(255, 255, 255, 0.3)" />
    </div>
  );
}
