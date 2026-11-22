import { type MutableRefObject, useCallback, useEffect, useRef, useState } from "react";

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
  playbackSpeed?: number;
  driftThresholdMs?: number; // default: 1200ms (D-01)
  suppressServerWindowMs?: number; // default: 1500ms (D-05)
  debounceSeekMs?: number; // default: 300ms (D-04)
  tickIntervalMs?: number; // default: 250ms
  onSeekCommit?: (targetMs: number) => Promise<void> | void;
}

function normalizePlaybackSpeed(speed?: number): number {
  return typeof speed === "number" && Number.isFinite(speed) && speed > 0 ? speed : 1.0;
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
  private playbackSpeed: number;
  private driftThresholdMs: number;
  private suppressServerWindowMs: number;
  private debounceSeekMs: number;
  private tickIntervalMs: number;
  private onSeekCommit?: (targetMs: number) => Promise<void> | void;

  private isScrubbing = false;
  private scrubPosition = 0;
  private lastSeekTime = 0;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<() => void> = new Set();

  constructor(options: PlaybackClockOptions) {
    this.basePosition = Math.max(0, options.serverPositionMs);
    this.syncTime = Date.now();
    this.isPlaying = options.isPlaying;
    this.durationMs = options.durationMs;
    this.trackId = options.trackId;
    this.playbackSpeed = normalizePlaybackSpeed(options.playbackSpeed);
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
    const elapsed = this.isPlaying
      ? Math.max(0, now - this.syncTime) * this.playbackSpeed
      : 0;
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

    const nextSpeed = normalizePlaybackSpeed(options.playbackSpeed);
    const speedChanged = Math.abs(nextSpeed - this.playbackSpeed) > 0.001;
    if (speedChanged && !this.isScrubbing) {
      this.basePosition = this.getInterpolatedPosition(now);
      this.syncTime = now;
      this.playbackSpeed = nextSpeed;
    } else if (speedChanged) {
      this.playbackSpeed = nextSpeed;
    }

    // D-05: Post-seek suppression window
    if (now - this.lastSeekTime < this.suppressServerWindowMs) {
      if (speedChanged) {
        this.notify();
      }
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
    } else if (speedChanged) {
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
      } catch {
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

function clampPosition(targetMs: number, durationMs: number): number {
  return durationMs > 0
    ? Math.min(durationMs, Math.max(0, targetMs))
    : Math.max(0, targetMs);
}

interface ClockScrubParams {
  durationMs: number;
  debounceSeekMs: number;
  isScrubbing: boolean;
  scrubPositionMs: number;
  getInterpolatedPosition: () => number;
  basePositionRef: MutableRefObject<number>;
  syncTimeRef: MutableRefObject<number>;
  lastSeekTimeRef: MutableRefObject<number>;
  onSeekCommitRef: MutableRefObject<((targetMs: number) => Promise<void> | void) | undefined>;
  setIsScrubbing: (v: boolean) => void;
  setScrubPositionMs: (v: number) => void;
  setDisplayPositionMs: (v: number) => void;
}

function useClockScrubActions(params: ClockScrubParams) {
  const {
    durationMs,
    debounceSeekMs,
    isScrubbing,
    scrubPositionMs,
    getInterpolatedPosition,
    basePositionRef,
    syncTimeRef,
    lastSeekTimeRef,
    onSeekCommitRef,
    setIsScrubbing,
    setScrubPositionMs,
    setDisplayPositionMs,
  } = params;
  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitSeek = useCallback(
    (targetMs: number) => {
      const now = Date.now();
      const clamped = clampPosition(targetMs, durationMs);

      setIsScrubbing(false);
      basePositionRef.current = clamped;
      syncTimeRef.current = now;
      lastSeekTimeRef.current = now;
      setDisplayPositionMs(clamped);

      if (onSeekCommitRef.current) {
        try {
          onSeekCommitRef.current(clamped);
        } catch {
          /* ignore */
        }
      }
    },
    [durationMs, basePositionRef, syncTimeRef, lastSeekTimeRef, onSeekCommitRef, setIsScrubbing, setDisplayPositionMs]
  );

  const scrubTo = useCallback(
    (targetMs: number) => {
      const clamped = clampPosition(targetMs, durationMs);
      setIsScrubbing(true);
      setScrubPositionMs(clamped);
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
      seekTimerRef.current = setTimeout(() => commitSeek(clamped), debounceSeekMs);
    },
    [durationMs, debounceSeekMs, commitSeek, setIsScrubbing, setScrubPositionMs]
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
      if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    };
  }, []);

  return { scrubTo, scrubDelta, seekImmediate };
}

interface ClockSyncParams {
  serverPositionMs: number;
  isPlaying: boolean;
  trackId?: string | null;
  durationMs: number;
  driftThresholdMs: number;
  suppressServerWindowMs: number;
  isScrubbing: boolean;
  safeSpeed: number;
  getInterpolatedPosition: () => number;
  basePositionRef: MutableRefObject<number>;
  syncTimeRef: MutableRefObject<number>;
  speedRef: MutableRefObject<number>;
  prevTrackIdRef: MutableRefObject<string | null | undefined>;
  prevIsPlayingRef: MutableRefObject<boolean>;
  lastSeekTimeRef: MutableRefObject<number>;
  setDisplayPositionMs: (v: number) => void;
}

function useClockServerSync(params: ClockSyncParams) {
  const {
    serverPositionMs,
    isPlaying,
    trackId,
    durationMs,
    driftThresholdMs,
    suppressServerWindowMs,
    isScrubbing,
    safeSpeed,
    getInterpolatedPosition,
    basePositionRef,
    syncTimeRef,
    speedRef,
    prevTrackIdRef,
    prevIsPlayingRef,
    lastSeekTimeRef,
    setDisplayPositionMs,
  } = params;

  useEffect(() => {
    const now = Date.now();
    const speedChanged = Math.abs(safeSpeed - speedRef.current) > 0.001;
    if (speedChanged && !isScrubbing) {
      const anchoredPos = getInterpolatedPosition();
      basePositionRef.current = anchoredPos;
      syncTimeRef.current = now;
      speedRef.current = safeSpeed;
      setDisplayPositionMs(anchoredPos);
    } else if (speedChanged) {
      speedRef.current = safeSpeed;
    }

    if (now - lastSeekTimeRef.current < suppressServerWindowMs || isScrubbing) return;

    const trackChanged = trackId !== prevTrackIdRef.current;
    const playStateChanged = isPlaying !== prevIsPlayingRef.current;
    prevTrackIdRef.current = trackId;
    prevIsPlayingRef.current = isPlaying;

    const drift = Math.abs(serverPositionMs - getInterpolatedPosition());
    if (trackChanged || playStateChanged || drift > driftThresholdMs) {
      const clamped = clampPosition(serverPositionMs, durationMs);
      basePositionRef.current = clamped;
      syncTimeRef.current = now;
      setDisplayPositionMs(clamped);
    }
  }, [
    serverPositionMs,
    isPlaying,
    trackId,
    durationMs,
    driftThresholdMs,
    suppressServerWindowMs,
    isScrubbing,
    safeSpeed,
    getInterpolatedPosition,
    basePositionRef,
    syncTimeRef,
    speedRef,
    prevTrackIdRef,
    prevIsPlayingRef,
    lastSeekTimeRef,
    setDisplayPositionMs,
  ]);
}

/**
 * React hook providing live interpolated playback clock and debounced seeking.
 */
export function usePlaybackClock({
  serverPositionMs,
  isPlaying,
  durationMs,
  trackId,
  playbackSpeed = 1.0,
  driftThresholdMs = 1200,
  suppressServerWindowMs = 1500,
  debounceSeekMs = 300,
  tickIntervalMs = 250,
  onSeekCommit,
}: PlaybackClockOptions): UsePlaybackClockResult {
  const safeSpeed = normalizePlaybackSpeed(playbackSpeed);
  const basePositionRef = useRef<number>(serverPositionMs);
  const syncTimeRef = useRef<number>(Date.now());
  const speedRef = useRef<number>(safeSpeed);
  const prevTrackIdRef = useRef<string | null | undefined>(trackId);
  const prevIsPlayingRef = useRef<boolean>(isPlaying);
  const lastSeekTimeRef = useRef<number>(0);
  const onSeekCommitRef = useRef(onSeekCommit);
  onSeekCommitRef.current = onSeekCommit;

  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubPositionMs, setScrubPositionMs] = useState<number>(serverPositionMs);
  const [displayPositionMs, setDisplayPositionMs] = useState<number>(serverPositionMs);

  const getInterpolatedPosition = useCallback(() => {
    const now = Date.now();
    const elapsed = isPlaying
      ? Math.max(0, now - syncTimeRef.current) * speedRef.current
      : 0;
    const computed = basePositionRef.current + elapsed;
    return durationMs > 0 ? Math.min(durationMs, Math.max(0, computed)) : Math.max(0, computed);
  }, [isPlaying, durationMs]);

  useEffect(() => {
    if (!isPlaying || isScrubbing) return;
    const id = setInterval(() => setDisplayPositionMs(getInterpolatedPosition()), tickIntervalMs);
    return () => clearInterval(id);
  }, [isPlaying, isScrubbing, tickIntervalMs, getInterpolatedPosition]);

  useClockServerSync({
    serverPositionMs,
    isPlaying,
    trackId,
    durationMs,
    driftThresholdMs,
    suppressServerWindowMs,
    isScrubbing,
    safeSpeed,
    getInterpolatedPosition,
    basePositionRef,
    syncTimeRef,
    speedRef,
    prevTrackIdRef,
    prevIsPlayingRef,
    lastSeekTimeRef,
    setDisplayPositionMs,
  });

  const { scrubTo, scrubDelta, seekImmediate } = useClockScrubActions({
    durationMs,
    debounceSeekMs,
    isScrubbing,
    scrubPositionMs,
    getInterpolatedPosition,
    basePositionRef,
    syncTimeRef,
    lastSeekTimeRef,
    onSeekCommitRef,
    setIsScrubbing,
    setScrubPositionMs,
    setDisplayPositionMs,
  });

  return {
    positionMs: isScrubbing ? scrubPositionMs : displayPositionMs,
    isScrubbing,
    scrubTo,
    scrubDelta,
    seekImmediate,
  };
}
