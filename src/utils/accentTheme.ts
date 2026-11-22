import type { AccentThemeMode } from "../types";

export interface AccentColor {
  hex: string;
  rgb: string;
}

export const CLASSIC_SPOTIFY_GREEN: AccentColor = {
  hex: "#1DB954",
  rgb: "29, 185, 84",
};

export const STEAMOS_DECK_BLUE: AccentColor = {
  hex: "#1A9FFF",
  rgb: "26, 159, 255",
};

const HUE_BIN_COUNT = 24;
const ACCENT_CACHE_CAPACITY = 64;
const accentCache = new Map<string, AccentColor>();

export function resolvePresetAccent(mode?: AccentThemeMode): AccentColor {
  if (mode === "steamos_blue") {
    return STEAMOS_DECK_BLUE;
  }
  return CLASSIC_SPOTIFY_GREEN;
}

export function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s, l };
}

function hueToChannel(p: number, q: number, tInput: number): number {
  let t = tInput;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hn = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hueToChannel(p, q, hn + 1 / 3) * 255),
    g: Math.round(hueToChannel(p, q, hn) * 255),
    b: Math.round(hueToChannel(p, q, hn - 1 / 3) * 255),
  };
}

export function clampAccentHsl(
  h: number,
  s: number,
  l: number,
): { h: number; s: number; l: number } {
  const clampedL = Math.max(0.55, Math.min(0.75, l));
  const clampedS = Math.max(0.45, Math.min(1, s));
  return { h, s: clampedS, l: clampedL };
}

function formatAccentColor(r: number, g: number, b: number): AccentColor {
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return {
    hex: `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase(),
    rgb: `${r}, ${g}, ${b}`,
  };
}

interface HueBin {
  weight: number;
  sumH: number;
  sumS: number;
  sumL: number;
}

export function extractAccentFromImageData(data: Uint8ClampedArray): AccentColor {
  const bins: HueBin[] = Array.from({ length: HUE_BIN_COUNT }, () => ({
    weight: 0,
    sumH: 0,
    sumS: 0,
    sumL: 0,
  }));

  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (hsl.l < 0.12 || hsl.l > 0.9 || hsl.s < 0.18) continue;

    const weight = hsl.s * (1 - Math.abs(2 * hsl.l - 1));
    const binIdx = Math.floor((((hsl.h % 360) + 360) % 360) / 15) % HUE_BIN_COUNT;
    const bin = bins[binIdx];
    bin.weight += weight;
    bin.sumH += hsl.h * weight;
    bin.sumS += hsl.s * weight;
    bin.sumL += hsl.l * weight;
  }

  let best: HueBin | null = null;
  for (const bin of bins) {
    if (bin.weight > 0 && (!best || bin.weight > best.weight)) {
      best = bin;
    }
  }

  if (!best) {
    return CLASSIC_SPOTIFY_GREEN;
  }

  const clamped = clampAccentHsl(
    best.sumH / best.weight,
    best.sumS / best.weight,
    best.sumL / best.weight,
  );
  const rgb = hslToRgb(clamped.h, clamped.s, clamped.l);
  return formatAccentColor(rgb.r, rgb.g, rgb.b);
}

function setCachedAccent(key: string, color: AccentColor): void {
  if (accentCache.has(key)) {
    accentCache.delete(key);
  } else if (accentCache.size >= ACCENT_CACHE_CAPACITY) {
    const oldest = accentCache.keys().next().value;
    if (oldest !== undefined) {
      accentCache.delete(oldest);
    }
  }
  accentCache.set(key, color);
}

function loadImageElement(dataUri: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUri;
  });
}

export async function extractAccentFromDataUri(
  dataUri: string,
  cacheKey?: string,
): Promise<AccentColor> {
  if (!dataUri || !dataUri.startsWith("data:image/")) {
    return CLASSIC_SPOTIFY_GREEN;
  }

  const key = cacheKey ?? dataUri;
  const cached = accentCache.get(key);
  if (cached) {
    setCachedAccent(key, cached);
    return cached;
  }

  if (typeof document === "undefined" || typeof Image === "undefined") {
    return CLASSIC_SPOTIFY_GREEN;
  }

  const img = await loadImageElement(dataUri);
  if (!img) {
    return CLASSIC_SPOTIFY_GREEN;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return CLASSIC_SPOTIFY_GREEN;
  }

  ctx.drawImage(img, 0, 0, 32, 32);
  const imageData = ctx.getImageData(0, 0, 32, 32);
  const result = extractAccentFromImageData(imageData.data);
  setCachedAccent(key, result);
  return result;
}

export function clearAccentCache(): void {
  accentCache.clear();
}
