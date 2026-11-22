import { useEffect, useState } from "react";
import type { AccentThemeMode } from "../types";
import { fetchWithQueueAndCache, imgMemoryCache } from "../components/common/imagePipeline";
import {
  type AccentColor,
  CLASSIC_SPOTIFY_GREEN,
  extractAccentFromDataUri,
  resolvePresetAccent,
} from "./accentTheme";

export const ACCENT_TRANSITION_NORMAL =
  "color 350ms ease, background-color 350ms ease, border-color 350ms ease, box-shadow 350ms ease";

export interface ThemeSyncInput {
  accentTheme?: AccentThemeMode;
  artworkUrl?: string | null;
  animationsSuspended?: boolean;
}

let currentAccent: AccentColor = CLASSIC_SPOTIFY_GREEN;
let currentAnimationsSuspended = false;
let activeRequestId = 0;
const subscribers = new Set<() => void>();

function applyCssVariables(accent: AccentColor, suspended: boolean): void {
  if (typeof document === "undefined" || !document.documentElement?.style) {
    return;
  }
  const style = document.documentElement.style;
  style.setProperty("--deckify-accent", accent.hex);
  style.setProperty("--deckify-accent-rgb", accent.rgb);
  style.setProperty(
    "--deckify-accent-transition",
    suspended ? "none" : ACCENT_TRANSITION_NORMAL,
  );
}

function notifySubscribers(): void {
  for (const cb of subscribers) {
    cb();
  }
}

function commitThemeState(accent: AccentColor, suspended: boolean): void {
  const changed =
    currentAccent.hex !== accent.hex ||
    currentAccent.rgb !== accent.rgb ||
    currentAnimationsSuspended !== suspended;
  currentAccent = accent;
  currentAnimationsSuspended = suspended;
  applyCssVariables(accent, suspended);
  if (changed) {
    notifySubscribers();
  }
}

async function resolveArtworkDataUri(artworkUrl: string): Promise<string | null> {
  if (artworkUrl.startsWith("data:image/")) {
    return artworkUrl;
  }
  const cached = imgMemoryCache.get(artworkUrl);
  if (cached) {
    return cached;
  }
  return fetchWithQueueAndCache(artworkUrl);
}

export async function syncThemeFromState(input: ThemeSyncInput): Promise<void> {
  const mode = input.accentTheme ?? "spotify_green";
  const suspended = Boolean(input.animationsSuspended);
  const requestId = ++activeRequestId;

  if (mode !== "dynamic_album") {
    commitThemeState(resolvePresetAccent(mode), suspended);
    return;
  }

  const artworkUrl = input.artworkUrl;
  if (!artworkUrl) {
    commitThemeState(CLASSIC_SPOTIFY_GREEN, suspended);
    return;
  }

  // Update transition flag immediately if it changed while waiting for image
  if (currentAnimationsSuspended !== suspended) {
    commitThemeState(currentAccent, suspended);
  }

  const dataUri = await resolveArtworkDataUri(artworkUrl);
  if (requestId !== activeRequestId) {
    return;
  }

  if (!dataUri) {
    commitThemeState(CLASSIC_SPOTIFY_GREEN, suspended);
    return;
  }

  const extracted = await extractAccentFromDataUri(dataUri, artworkUrl);
  if (requestId !== activeRequestId) {
    return;
  }

  commitThemeState(extracted, suspended);
}

export function getActiveAccent(): AccentColor {
  return currentAccent;
}

export function getAnimationsSuspended(): boolean {
  return currentAnimationsSuspended;
}

export function useAccentTheme(): { accent: AccentColor; animationsSuspended: boolean } {
  const [state, setState] = useState(() => ({
    accent: currentAccent,
    animationsSuspended: currentAnimationsSuspended,
  }));

  useEffect(() => {
    const update = () => {
      setState({
        accent: currentAccent,
        animationsSuspended: currentAnimationsSuspended,
      });
    };
    subscribers.add(update);
    update();
    return () => {
      subscribers.delete(update);
    };
  }, []);

  return state;
}

export function resetThemeBusForTest(): void {
  activeRequestId++;
  currentAccent = CLASSIC_SPOTIFY_GREEN;
  currentAnimationsSuspended = false;
  subscribers.clear();
}
