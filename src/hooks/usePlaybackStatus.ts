import { useCallback, useEffect, useState } from "react";
import * as deckyApi from "@decky/api";
import { callable, toaster } from "@decky/api";
import { StatusResponse, TrackMeta } from "../types";
import { usePlaybackClock } from "./usePlaybackClock";

export const backendGetStatus = callable<[], StatusResponse>("get_status");
export const backendSeekPlayback = callable<
  [number, string],
  { ok: boolean; position_ms?: number; error?: string }
>("seek_playback");

export function usePlaybackStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await backendGetStatus();
      if (s) setStatus(s);
    } catch {}
  }, []);

  const track = status?.track || status?.track_meta;
  const durationMs = (status as any)?.duration_ms || track?.duration_ms || 0;
  const isPlaying = Boolean(status?.is_playing);
  const trackId = track?.track_id || track?.id;

  const clock = usePlaybackClock({
    serverPositionMs: status?.position_ms ?? 0,
    isPlaying,
    durationMs,
    trackId,
    onSeekCommit: async (targetMs) => {
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
    },
  });

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 1500);

    const api = deckyApi as Record<string, any>;
    const subscribe =
      "addEventListener" in api && typeof api.addEventListener === "function"
        ? api.addEventListener
        : null;
    const unsubscribe =
      "removeEventListener" in api && typeof api.removeEventListener === "function"
        ? api.removeEventListener
        : null;

    const unsubLibre = subscribe
      ? subscribe("librespot_event", (ev: any) => {
          if (!ev || typeof ev !== "object") return;
          setStatus((prev) => {
            const base: StatusResponse = prev ?? {
              authenticated: true,
              librespot_running: true,
              play_state: null,
              track: null,
              position_ms: 0,
              is_playing: false,
              volume: null,
            };
            const next: StatusResponse = { ...base };
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
            if (typeof ev.position_ms === "number") {
              next.position_ms = ev.position_ms;
            }
            if (typeof ev.duration_ms === "number") {
              next.duration_ms = ev.duration_ms;
            }
            if (typeof ev.volume === "number") {
              next.volume = ev.volume;
            }
            if (typeof ev.track_id === "string" && ev.track_id && next.track) {
              next.track = { ...next.track, track_id: ev.track_id, id: ev.track_id };
            }
            return next;
          });
        })
      : null;

    const unsubMeta = subscribe
      ? subscribe("track_metadata", (meta: any) => {
          if (!meta || typeof meta !== "object") return;
          setStatus((prev) => {
            const base: StatusResponse = prev ?? {
              authenticated: true,
              librespot_running: true,
              play_state: null,
              track: null,
              position_ms: 0,
              is_playing: false,
              volume: null,
            };
            const trackMeta = meta as TrackMeta;
            return {
              ...base,
              track: trackMeta,
              track_meta: trackMeta,
              duration_ms:
                typeof trackMeta.duration_ms === "number" && trackMeta.duration_ms > 0
                  ? trackMeta.duration_ms
                  : base.duration_ms,
              ...(typeof (meta as any).is_liked === "boolean" ? { is_liked: (meta as any).is_liked } : {}),
            };
          });
        })
      : null;

    return () => {
      clearInterval(id);
      if (unsubscribe && unsubLibre !== null) {
        unsubscribe("librespot_event", unsubLibre);
      }
      if (unsubscribe && unsubMeta !== null) {
        unsubscribe("track_metadata", unsubMeta);
      }
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
