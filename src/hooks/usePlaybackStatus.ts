import { useCallback, useEffect, useState } from "react";
import { callable } from "@decky/api";
import { StatusResponse } from "../types";

export const backendGetStatus = callable<[], StatusResponse>("get_status");

export function usePlaybackStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [currentPositionMs, setCurrentPositionMs] = useState<number>(0);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await backendGetStatus();
      if (s) setStatus(s);
    } catch {}
  }, []);

  useEffect(() => {
    if (status?.position_ms !== undefined) {
      setCurrentPositionMs(status.position_ms);
    }
  }, [status?.position_ms]);

  useEffect(() => {
    if (!status?.is_playing) return;
    const interval = setInterval(() => {
      setCurrentPositionMs((prev) => {
        const duration = (status?.track || status?.track_meta)?.duration_ms || 0;
        if (duration > 0 && prev >= duration) return prev;
        return prev + 1000;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [status?.is_playing, status?.track, status?.track_meta]);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 1500);
    return () => clearInterval(id);
  }, [refreshStatus]);

  return {
    status,
    setStatus,
    currentPositionMs,
    setCurrentPositionMs,
    refreshStatus,
  };
}
