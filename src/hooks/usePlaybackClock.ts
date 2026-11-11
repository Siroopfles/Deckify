import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Returns variable scrub step duration based on total track duration (D-03):
 * - < 5 minutes (< 300,000ms): 5,000ms (5s)
 * - 5 to 30 minutes (300,000ms to 1,800,000ms): 10,000ms (10s)
 * - > 30 minutes (> 1,800,000ms): 30,000ms (30s)
 */
export function getScrubStepMs(durationMs: number): number {
  if (durationMs < 5 * 60 * 1000) return 5000;
  if (durationMs <= 30 * 60 * 1000) return 10000;
  return 30000;
}

export interface PlaybackClockOptions {
  serverPositionMs: number;
  isPlaying: boolean;
  durationMs: number;
  trackId?: string | null;
  driftThresholdMs?: number; // default: 1200ms (D-01)
  suppressServerWindowMs?: number; // default: 1500ms (D-05)
  debounceSeekMs?: number; // default: 300ms (D-04)
  tickIntervalMs?: number; // default: 250ms
  onSeekCommit?: (targetMs: number) => Promise<void> | void;
}

export interface UsePlaybackClockResult {
  positionMs: number;
  isScrubbing: boolean;
  scrubTo: (targetMs: number) => void;
  scrubDelta: (deltaMs: number) => void;
  seekImmediate: (targetMs: number) => void;
}

/**
 * Pure state controller for monotonic clock interpolation, drift gating,
 * debounced seek commits, and post-seek suppression.
 */
export class PlaybackClockController {
  private basePosition: number;
  private syncTime: number;
  private isPlaying: boolean;
  private durationMs: number;
  private trackId?: string | null;
  private driftThresholdMs: number;
  private suppressServerWindowMs: number;
  private debounceSeekMs: number;
  private tickIntervalMs: number;
  private onSeekCommit?: (targetMs: number) => Promise<void> | void;

  private isScrubbing = false;
  private scrubPosition = 0;
  private lastSeekTime = 0;
  private seekTimer: any = null;
  private tickTimer: any = null;
  private listeners: Set<() => void> = new Set();

  constructor(options: PlaybackClockOptions) {
    this.basePosition = Math.max(0, options.serverPositionMs);
    this.syncTime = Date.now();
    this.isPlaying = options.isPlaying;
    this.durationMs = options.durationMs;
    this.trackId = options.trackId;
    this.driftThresholdMs = options.driftThresholdMs ?? 1200;
    this.suppressServerWindowMs = options.suppressServerWindowMs ?? 1500;
    this.debounceSeekMs = options.debounceSeekMs ?? 300;
    this.tickIntervalMs = options.tickIntervalMs ?? 250;
    this.onSeekCommit = options.onSeekCommit;

    this.startTicker();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public getInterpolatedPosition(now = Date.now()): number {
    const elapsed = this.isPlaying ? Math.max(0, now - this.syncTime) : 0;
    const computed = this.basePosition + elapsed;
    if (this.durationMs > 0) {
      return Math.min(this.durationMs, Math.max(0, computed));
    }
    return Math.max(0, computed);
  }

  public get positionMs(): number {
    if (this.isScrubbing) {
      return this.scrubPosition;
    }
    return this.getInterpolatedPosition();
  }

  public get isCurrentlyScrubbing(): boolean {
    return this.isScrubbing;
  }

  public updateOptions(options: PlaybackClockOptions): void {
    const now = Date.now();
    this.onSeekCommit = options.onSeekCommit;
    this.durationMs = options.durationMs;
    this.driftThresholdMs = options.driftThresholdMs ?? 1200;
    this.suppressServerWindowMs = options.suppressServerWindowMs ?? 1500;
    this.debounceSeekMs = options.debounceSeekMs ?? 300;
    this.tickIntervalMs = options.tickIntervalMs ?? 250;

    // D-05: Post-seek suppression window
    if (now - this.lastSeekTime < this.suppressServerWindowMs) {
      return;
    }

    // Do not overwrite user position if scrubbing
    if (this.isScrubbing) {
      return;
    }

    const trackChanged = options.trackId !== this.trackId;
    const playStateChanged = options.isPlaying !== this.isPlaying;
    this.trackId = options.trackId;
    this.isPlaying = options.isPlaying;

    const currentPos = this.getInterpolatedPosition(now);
    const drift = Math.abs(options.serverPositionMs - currentPos);

    // D-01: Drift threshold resync
    if (trackChanged || playStateChanged || drift > this.driftThresholdMs) {
      this.basePosition = Math.max(0, options.serverPositionMs);
      this.syncTime = now;
      this.notify();
    }

    this.startTicker();
  }

  public scrubTo(targetMs: number): void {
    const clamped = this.durationMs > 0
      ? Math.min(this.durationMs, Math.max(0, targetMs))
      : Math.max(0, targetMs);

    this.isScrubbing = true;
    this.scrubPosition = clamped;
    this.notify();

    if (this.seekTimer) {
      clearTimeout(this.seekTimer);
    }

    // D-04: Debounce RPC commit by 300ms
    this.seekTimer = setTimeout(() => {
      this.commitSeek(this.scrubPosition);
    }, this.debounceSeekMs);
  }

  public scrubDelta(deltaMs: number): void {
    const current = this.isScrubbing ? this.scrubPosition : this.getInterpolatedPosition();
    this.scrubTo(current + deltaMs);
  }

  public seekImmediate(targetMs: number): void {
    if (this.seekTimer) {
      clearTimeout(this.seekTimer);
      this.seekTimer = null;
    }
    const clamped = this.durationMs > 0
      ? Math.min(this.durationMs, Math.max(0, targetMs))
      : Math.max(0, targetMs);

    this.commitSeek(clamped);
  }

  private commitSeek(targetMs: number): void {
    const now = Date.now();
    this.isScrubbing = false;
    this.basePosition = targetMs;
    this.syncTime = now;
    this.lastSeekTime = now;
    this.notify();

    if (this.onSeekCommit) {
      try {
        this.onSeekCommit(targetMs);
      } catch (err) {
        // Safe execution
      }
    }
  }

  private startTicker(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.isPlaying) {
      this.tickTimer = setInterval(() => {
        if (!this.isScrubbing) {
          this.notify();
        }
      }, this.tickIntervalMs);
    }
  }

  public destroy(): void {
    if (this.seekTimer) {
      clearTimeout(this.seekTimer);
      this.seekTimer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    this.listeners.clear();
  }
}

/**
 * React hook providing live interpolated playback clock and debounced seeking.
 */
export function usePlaybackClock({
  serverPositionMs,
  isPlaying,
  durationMs,
  trackId,
  driftThresholdMs = 1200,
  suppressServerWindowMs = 1500,
  debounceSeekMs = 300,
  tickIntervalMs = 250,
  onSeekCommit,
}: PlaybackClockOptions): UsePlaybackClockResult {
  const basePositionRef = useRef<number>(serverPositionMs);
  const syncTimeRef = useRef<number>(Date.now());
  const prevTrackIdRef = useRef<string | null | undefined>(trackId);
  const prevIsPlayingRef = useRef<boolean>(isPlaying);
  const lastSeekTimeRef = useRef<number>(0);
  const seekTimerRef = useRef<any>(null);
  const onSeekCommitRef = useRef(onSeekCommit);
  onSeekCommitRef.current = onSeekCommit;

  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubPositionMs, setScrubPositionMs] = useState<number>(serverPositionMs);
  const [displayPositionMs, setDisplayPositionMs] = useState<number>(serverPositionMs);

  const getInterpolatedPosition = useCallback(() => {
    const now = Date.now();
    const elapsed = isPlaying ? Math.max(0, now - syncTimeRef.current) : 0;
    const computed = basePositionRef.current + elapsed;
    if (durationMs > 0) {
      return Math.min(durationMs, Math.max(0, computed));
    }
    return Math.max(0, computed);
  }, [isPlaying, durationMs]);

  // Periodic high-frequency UI ticker
  useEffect(() => {
    if (!isPlaying || isScrubbing) return;
    const id = setInterval(() => {
      setDisplayPositionMs(getInterpolatedPosition());
    }, tickIntervalMs);
    return () => clearInterval(id);
  }, [isPlaying, isScrubbing, tickIntervalMs, getInterpolatedPosition]);

  // Server position synchronization and drift gating
  useEffect(() => {
    const now = Date.now();

    // D-05: Suppress incoming server positions during the post-seek window
    if (now - lastSeekTimeRef.current < suppressServerWindowMs) {
      return;
    }

    // Do not overwrite user position if scrubbing
    if (isScrubbing) {
      return;
    }

    const trackChanged = trackId !== prevTrackIdRef.current;
    const playStateChanged = isPlaying !== prevIsPlayingRef.current;

    prevTrackIdRef.current = trackId;
    prevIsPlayingRef.current = isPlaying;

    const currentPos = getInterpolatedPosition();
    const drift = Math.abs(serverPositionMs - currentPos);

    // D-01: Re-anchor only if track changed, play state changed, or drift > threshold
    if (trackChanged || playStateChanged || drift > driftThresholdMs) {
      const clamped = durationMs > 0
        ? Math.min(durationMs, Math.max(0, serverPositionMs))
        : Math.max(0, serverPositionMs);
      basePositionRef.current = clamped;
      syncTimeRef.current = now;
      setDisplayPositionMs(clamped);
    }
    // Else: drift <= 1200ms -> silently ignore server update to eliminate rubberbanding
  }, [
    serverPositionMs,
    isPlaying,
    trackId,
    durationMs,
    driftThresholdMs,
    suppressServerWindowMs,
    isScrubbing,
    getInterpolatedPosition,
  ]);

  const commitSeek = useCallback(
    (targetMs: number) => {
      const now = Date.now();
      const clamped = durationMs > 0
        ? Math.min(durationMs, Math.max(0, targetMs))
        : Math.max(0, targetMs);

      setIsScrubbing(false);
      basePositionRef.current = clamped;
      syncTimeRef.current = now;
      lastSeekTimeRef.current = now;
      setDisplayPositionMs(clamped);

      if (onSeekCommitRef.current) {
        try {
          onSeekCommitRef.current(clamped);
        } catch {}
      }
    },
    [durationMs]
  );

  const scrubTo = useCallback(
    (targetMs: number) => {
      const clamped = durationMs > 0
        ? Math.min(durationMs, Math.max(0, targetMs))
        : Math.max(0, targetMs);

      setIsScrubbing(true);
      setScrubPositionMs(clamped);

      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
      }

      // D-04: Debounce RPC seek commit by 300ms
      seekTimerRef.current = setTimeout(() => {
        commitSeek(clamped);
      }, debounceSeekMs);
    },
    [durationMs, debounceSeekMs, commitSeek]
  );

  const scrubDelta = useCallback(
    (deltaMs: number) => {
      const current = isScrubbing ? scrubPositionMs : getInterpolatedPosition();
      scrubTo(current + deltaMs);
    },
    [isScrubbing, scrubPositionMs, getInterpolatedPosition, scrubTo]
  );

  const seekImmediate = useCallback(
    (targetMs: number) => {
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
        seekTimerRef.current = null;
      }
      commitSeek(targetMs);
    },
    [commitSeek]
  );

  useEffect(() => {
    return () => {
      if (seekTimerRef.current) {
        clearTimeout(seekTimerRef.current);
      }
    };
  }, []);

  return {
    positionMs: isScrubbing ? scrubPositionMs : displayPositionMs,
    isScrubbing,
    scrubTo,
    scrubDelta,
    seekImmediate,
  };
}
