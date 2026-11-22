import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@decky/api", () => ({
  callable: () => vi.fn(async () => ({ ok: false })),
}));

vi.mock("react", () => ({
  useState: <T>(initial: T | (() => T)) => {
    const val = typeof initial === "function" ? (initial as () => T)() : initial;
    return [val, vi.fn()];
  },
  useEffect: vi.fn(),
}));

import {
  CLASSIC_SPOTIFY_GREEN,
  STEAMOS_DECK_BLUE,
  resolvePresetAccent,
  clampAccentHsl,
  extractAccentFromImageData,
  extractAccentFromDataUri,
  clearAccentCache,
  rgbToHsl,
} from "./accentTheme";
import {
  ACCENT_TRANSITION_NORMAL,
  syncThemeFromState,
  getActiveAccent,
  getAnimationsSuspended,
  resetThemeBusForTest,
} from "./themeBus";
import { imgMemoryCache } from "../components/common/imagePipeline";

describe("accentTheme", () => {
  beforeEach(() => {
    clearAccentCache();
    resetThemeBusForTest();
    imgMemoryCache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves preset accent modes deterministically", () => {
    expect(resolvePresetAccent("spotify_green")).toEqual(CLASSIC_SPOTIFY_GREEN);
    expect(resolvePresetAccent("steamos_blue")).toEqual(STEAMOS_DECK_BLUE);
    expect(resolvePresetAccent(undefined)).toEqual(CLASSIC_SPOTIFY_GREEN);
    expect(resolvePresetAccent("dynamic_album")).toEqual(CLASSIC_SPOTIFY_GREEN);
  });

  it("clamps HSL lightness to [0.55, 0.75] and saturation to >= 0.45", () => {
    const dark = clampAccentHsl(220, 0.2, 0.1);
    expect(dark.l).toBeCloseTo(0.55, 5);
    expect(dark.s).toBeCloseTo(0.45, 5);

    const bright = clampAccentHsl(120, 0.9, 0.92);
    expect(bright.l).toBeCloseTo(0.75, 5);
    expect(bright.s).toBeCloseTo(0.9, 5);

    const mid = clampAccentHsl(30, 0.65, 0.6);
    expect(mid.l).toBeCloseTo(0.6, 5);
    expect(mid.s).toBeCloseTo(0.65, 5);
  });

  it("extracts dominant vibrant hue and enforces L >= 55%", () => {
    // 4x4 dark crimson pixels (120, 10, 20, 255)
    const pixels = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i++) {
      pixels[i * 4] = 120;
      pixels[i * 4 + 1] = 10;
      pixels[i * 4 + 2] = 20;
      pixels[i * 4 + 3] = 255;
    }

    const accent = extractAccentFromImageData(pixels);
    expect(accent.hex).not.toBe(CLASSIC_SPOTIFY_GREEN.hex);
    const [r, g, b] = accent.rgb.split(",").map((v) => Number(v.trim()));
    const hsl = rgbToHsl(r, g, b);
    expect(hsl.l).toBeGreaterThanOrEqual(0.54);
  });

  it("falls back to Classic Spotify Green for grayscale or transparent pixels", () => {
    const gray = new Uint8ClampedArray(4 * 4);
    for (let i = 0; i < 4; i++) {
      gray[i * 4] = 128;
      gray[i * 4 + 1] = 128;
      gray[i * 4 + 2] = 128;
      gray[i * 4 + 3] = 255;
    }
    expect(extractAccentFromImageData(gray)).toEqual(CLASSIC_SPOTIFY_GREEN);

    const transparent = new Uint8ClampedArray(4 * 4);
    for (let i = 0; i < 4; i++) {
      transparent[i * 4] = 255;
      transparent[i * 4 + 1] = 0;
      transparent[i * 4 + 2] = 0;
      transparent[i * 4 + 3] = 64;
    }
    expect(extractAccentFromImageData(transparent)).toEqual(CLASSIC_SPOTIFY_GREEN);
  });

  it("rejects external https:// URLs without creating Image or canvas", async () => {
    const imageSpy = vi.fn();
    vi.stubGlobal("Image", imageSpy);

    const result = await extractAccentFromDataUri("https://i.scdn.co/image/abc123");
    expect(result).toEqual(CLASSIC_SPOTIFY_GREEN);
    expect(imageSpy).not.toHaveBeenCalled();
  });
});

describe("themeBus", () => {
  beforeEach(() => {
    clearAccentCache();
    resetThemeBusForTest();
    imgMemoryCache.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("synchronizes :root CSS custom properties and transition state via themeBus", async () => {
    const styleMap = new Map<string, string>();
    vi.stubGlobal("document", {
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => styleMap.set(k, v),
        },
      },
    });

    await syncThemeFromState({
      accentTheme: "steamos_blue",
      artworkUrl: null,
      animationsSuspended: false,
    });

    expect(getActiveAccent()).toEqual(STEAMOS_DECK_BLUE);
    expect(getAnimationsSuspended()).toBe(false);
    expect(styleMap.get("--deckify-accent")).toBe("#1A9FFF");
    expect(styleMap.get("--deckify-accent-rgb")).toBe("26, 159, 255");
    expect(styleMap.get("--deckify-accent-transition")).toBe(ACCENT_TRANSITION_NORMAL);

    await syncThemeFromState({
      accentTheme: "spotify_green",
      artworkUrl: null,
      animationsSuspended: true,
    });

    expect(getActiveAccent()).toEqual(CLASSIC_SPOTIFY_GREEN);
    expect(getAnimationsSuspended()).toBe(true);
    expect(styleMap.get("--deckify-accent")).toBe("#1DB954");
    expect(styleMap.get("--deckify-accent-rgb")).toBe("29, 185, 84");
    expect(styleMap.get("--deckify-accent-transition")).toBe("none");
  });
});
