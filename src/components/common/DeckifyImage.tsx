import { ReactNode, useEffect, useState } from "react";
import { callable } from "@decky/api";

const backendGetImage = callable<[string], { ok: boolean; data_url?: string; error?: string }>("get_image");

export const imgMemoryCache = new Map<string, string>();
export const imgPending = new Map<string, Promise<string | null>>();

export interface DeckifyImageProps {
  src?: string | null;
  width?: number | string;
  height?: number | string;
  style?: any;
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

  useEffect(() => {
    if (!src) {
      setDataUrl(null);
      return;
    }
    if (src.startsWith("data:") || src.startsWith("http://127.0.0.1")) {
      setDataUrl(src);
      return;
    }
    const cached = imgMemoryCache.get(src);
    if (cached) {
      setDataUrl(cached);
      return;
    }

    let active = true;
    let promise = imgPending.get(src);
    if (!promise) {
      promise = backendGetImage(src)
        .then((res) => {
          if (res.ok && res.data_url) {
            imgMemoryCache.set(src, res.data_url);
            return res.data_url;
          }
          return null;
        })
        .finally(() => {
          imgPending.delete(src);
        });
      imgPending.set(src, promise);
    }

    promise.then((du) => {
      if (active && du) setDataUrl(du);
    });

    return () => {
      active = false;
    };
  }, [src]);

  if (!dataUrl) {
    if (fallback) {
      return (
        <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
          {fallback}
        </div>
      );
    }
    return (
      <div
        style={{
          width,
          height,
          background: "rgba(255,255,255,0.06)",
          borderRadius: (style as any)?.borderRadius || 4,
          flexShrink: 0,
          ...style,
        }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      width={width}
      height={height}
      style={{ objectFit: "cover", flexShrink: 0, ...style }}
      className={className}
    />
  );
}
