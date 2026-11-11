import { useCallback, useEffect, useState } from "react";
import { callable } from "@decky/api";
import { StatusResponse } from "../types";
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
        await backendSeekPlayback(targetMs, "");
      } catch {}
    },
  });

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 1500);
    return () => clearInterval(id);
  }, [refreshStatus]);

  return {
    status,
    setStatus,
    currentPositionMs: clock.positionMs,
    refreshStatus,
    clock,
  };
}
