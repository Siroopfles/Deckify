import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import * as deckyApi from "@decky/api";
import { callable, toaster } from "@decky/api";
import { StatusResponse, TrackMeta } from "../types";
import { usePlaybackClock } from "./usePlaybackClock";

export const backendGetStatus = callable<[], StatusResponse>("get_status");
export const backendSeekPlayback = callable<
  [number, string],
  { ok: boolean; position_ms?: number; error?: string }
>("seek_playback");

function createBaseStatus(): StatusResponse {
  return {
    authenticated: true,
    librespot_running: true,
    play_state: null,
    track: null,
    position_ms: 0,
    is_playing: false,
    volume: null,
  };
}

function applyLibrespotEvent(
  prev: StatusResponse | null,
  ev: Record<string, unknown>
): StatusResponse {
  const next: StatusResponse = { ...(prev ?? createBaseStatus()) };
  if (ev.event === "playing" || ev.event === "started") {
    next.is_playing = true;
    next.play_state = "playing";
  } else if (ev.event === "paused") {
    next.is_playing = false;
    next.play_state = "paused";
  } else if (ev.event === "stopped" || ev.event === "session_disconnected") {
    next.is_playing = false;
    next.play_state = null;
  }
  if (typeof ev.position_ms === "number") next.position_ms = ev.position_ms;
  if (typeof ev.duration_ms === "number") next.duration_ms = ev.duration_ms;
  if (typeof ev.volume === "number") next.volume = ev.volume;
  if (typeof ev.track_id === "string" && ev.track_id && next.track) {
    next.track = { ...next.track, track_id: ev.track_id, id: ev.track_id };
  }
  return next;
}

function applyTrackMetadata(
  prev: StatusResponse | null,
  meta: Record<string, unknown>
): StatusResponse {
  const base = prev ?? createBaseStatus();
  const trackMeta = meta as unknown as TrackMeta;
  return {
    ...base,
    track: trackMeta,
    track_meta: trackMeta,
    duration_ms:
      typeof trackMeta.duration_ms === "number" && trackMeta.duration_ms > 0
        ? trackMeta.duration_ms
        : base.duration_ms,
    ...(typeof meta.is_liked === "boolean" ? { is_liked: meta.is_liked } : {}),
  };
}

async function commitSeekWithToast(targetMs: number): Promise<void> {
  try {
    const res = await backendSeekPlayback(targetMs, "");
    if (res && res.ok === false) {
      toaster.toast({
        title: "Deckify",
        body: "Playback seek failed — Spotify did not respond. Try again or check your active device.",
        duration: 3000,
      });
    }
  } catch {
    toaster.toast({
      title: "Deckify",
      body: "Playback seek failed — Spotify did not respond. Try again or check your active device.",
      duration: 3000,
    });
  }
}

type SetStatusFn = Dispatch<SetStateAction<StatusResponse | null>>;

function subscribeDeckyPlaybackEvents(setStatus: SetStatusFn): () => void {
  const api = deckyApi as unknown as {
    addEventListener?: (ev: string, cb: (payload: unknown) => void) => unknown;
    removeEventListener?: (ev: string, token: unknown) => void;
  };
  const subscribe = typeof api.addEventListener === "function" ? api.addEventListener : null;
  const unsubscribe = typeof api.removeEventListener === "function" ? api.removeEventListener : null;
  if (!subscribe) {
    return () => undefined;
  }

  const unsubLibre = subscribe("librespot_event", (ev) => {
    if (!ev || typeof ev !== "object") return;
    setStatus((prev) => applyLibrespotEvent(prev, ev as Record<string, unknown>));
  });

  const unsubMeta = subscribe("track_metadata", (meta) => {
    if (!meta || typeof meta !== "object") return;
    setStatus((prev) => applyTrackMetadata(prev, meta as Record<string, unknown>));
  });

  const unsubSpeed = subscribe("playback_speed_changed", (ev) => {
    if (!ev || typeof ev !== "object") return;
    const speed = (ev as Record<string, unknown>).speed;
    if (typeof speed !== "number") return;
    setStatus((prev) => ({ ...(prev ?? createBaseStatus()), playback_speed: speed }));
  });

  return () => {
    if (!unsubscribe) return;
    if (unsubLibre !== null) unsubscribe("librespot_event", unsubLibre);
    if (unsubMeta !== null) unsubscribe("track_metadata", unsubMeta);
    if (unsubSpeed !== null) unsubscribe("playback_speed_changed", unsubSpeed);
  };
}

export function usePlaybackStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await backendGetStatus();
      if (s) setStatus(s);
    } catch {
      /* ignore transient poll failures */
    }
  }, []);

  const track = status?.track || status?.track_meta;
  const durationMs = status?.duration_ms || track?.duration_ms || 0;
  const isPlaying = Boolean(status?.is_playing);
  const trackId = track?.track_id || track?.id;

  const clock = usePlaybackClock({
    serverPositionMs: status?.position_ms ?? 0,
    isPlaying,
    durationMs,
    trackId,
    playbackSpeed: status?.playback_speed ?? 1.0,
    onSeekCommit: commitSeekWithToast,
  });

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 1500);
    const cleanupEvents = subscribeDeckyPlaybackEvents(setStatus);
    return () => {
      clearInterval(id);
      cleanupEvents();
    };
  }, [refreshStatus]);

  return {
    status,
    setStatus,
    currentPositionMs: clock.positionMs,
    refreshStatus,
    clock,
  };
}
