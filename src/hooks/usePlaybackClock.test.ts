import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("react", () => ({
  useState: (initial: any) => [initial, vi.fn()],
  useRef: (initial: any) => ({ current: initial }),
  useCallback: (fn: any) => fn,
  useEffect: (fn: any) => fn(),
}));

import {
  getScrubStepMs,
  PlaybackClockController,
  usePlaybackClock,
} from "./usePlaybackClock";

describe("usePlaybackClock & PlaybackClockController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getScrubStepMs (D-03)", () => {
    it("returns 5000ms for tracks under 5 minutes (< 300,000ms)", () => {
      expect(getScrubStepMs(0)).toBe(5000);
      expect(getScrubStepMs(180000)).toBe(5000); // 3 minutes
      expect(getScrubStepMs(299999)).toBe(5000);
    });

    it("returns 10000ms for tracks between 5 and 30 minutes", () => {
      expect(getScrubStepMs(300000)).toBe(10000); // 5 minutes
      expect(getScrubStepMs(600000)).toBe(10000); // 10 minutes
      expect(getScrubStepMs(1800000)).toBe(10000); // 30 minutes
    });

    it("returns 30000ms for tracks over 30 minutes", () => {
      expect(getScrubStepMs(1800001)).toBe(30000);
      expect(getScrubStepMs(2400000)).toBe(30000); // 40 minutes
      expect(getScrubStepMs(3600000)).toBe(30000); // 60 minutes
    });
  });

  describe("Monotonic Ticking & Interpolation", () => {
    it("advances position monotonically when isPlaying is true", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
      });

      expect(clock.positionMs).toBe(10000);
      vi.advanceTimersByTime(1000);
      expect(clock.positionMs).toBe(11000);
      vi.advanceTimersByTime(2500);
      expect(clock.positionMs).toBe(13500);
      clock.destroy();
    });

    it("freezes position when isPlaying is false", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: false,
        durationMs: 60000,
      });

      expect(clock.positionMs).toBe(10000);
      vi.advanceTimersByTime(1000);
      expect(clock.positionMs).toBe(10000);
      vi.advanceTimersByTime(5000);
      expect(clock.positionMs).toBe(10000);
      clock.destroy();
    });

    it("clamps position to durationMs when reaching the end", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 59000,
        isPlaying: true,
        durationMs: 60000,
      });

      vi.advanceTimersByTime(2000);
      expect(clock.positionMs).toBe(60000);
      clock.destroy();
    });
  });

  describe("Drift Tolerance Gating (D-01)", () => {
    it("ignores server updates with drift <= 1200ms to eliminate rubberbanding", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
        driftThresholdMs: 1200,
      });

      // Advance by 1500ms -> local interpolated is 11500ms
      vi.advanceTimersByTime(1500);
      expect(clock.positionMs).toBe(11500);

      // Incoming server status poll arrives with 11100ms (drift is 400ms <= 1200ms)
      clock.updateOptions({
        serverPositionMs: 11100,
        isPlaying: true,
        durationMs: 60000,
      });

      // Must remain on smooth local monotonic clock without snapping backwards!
      expect(clock.positionMs).toBe(11500);
      clock.destroy();
    });

    it("re-anchors base position when drift exceeds 1200ms", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
        driftThresholdMs: 1200,
      });

      vi.advanceTimersByTime(1500); // local pos is 11500ms

      // Major server drift (e.g. track jumped forward externally by 5s)
      clock.updateOptions({
        serverPositionMs: 16500,
        isPlaying: true,
        durationMs: 60000,
      });

      expect(clock.positionMs).toBe(16500);
      clock.destroy();
    });

    it("re-anchors when trackId changes regardless of drift", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
        trackId: "track_1",
      });

      vi.advanceTimersByTime(1000); // local pos 11000ms

      clock.updateOptions({
        serverPositionMs: 500, // new track start
        isPlaying: true,
        durationMs: 180000,
        trackId: "track_2",
      });

      expect(clock.positionMs).toBe(500);
      clock.destroy();
    });

    it("re-anchors when isPlaying state toggles", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
      });

      vi.advanceTimersByTime(2000); // 12000ms

      clock.updateOptions({
        serverPositionMs: 12000,
        isPlaying: false, // paused
        durationMs: 60000,
      });

      expect(clock.positionMs).toBe(12000);
      vi.advanceTimersByTime(2000);
      expect(clock.positionMs).toBe(12000);
      clock.destroy();
    });
  });

  describe("Optimistic Scrubbing & 300ms Debounce (D-04)", () => {
    it("updates position immediately and debounces onSeekCommit by 300ms", () => {
      const onSeekCommit = vi.fn();
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
        onSeekCommit,
      });

      // Rapid scrubbing
      clock.scrubTo(15000);
      expect(clock.positionMs).toBe(15000);
      expect(clock.isCurrentlyScrubbing).toBe(true);

      clock.scrubTo(20000);
      expect(clock.positionMs).toBe(20000);

      clock.scrubTo(25000);
      expect(clock.positionMs).toBe(25000);

      // RPC not called yet
      expect(onSeekCommit).not.toHaveBeenCalled();

      // Advance by 299ms: still debouncing
      vi.advanceTimersByTime(299);
      expect(onSeekCommit).not.toHaveBeenCalled();
      expect(clock.isCurrentlyScrubbing).toBe(true);

      // Advance 1ms (total 300ms): onSeekCommit fires once with 25000ms
      vi.advanceTimersByTime(1);
      expect(onSeekCommit).toHaveBeenCalledTimes(1);
      expect(onSeekCommit).toHaveBeenCalledWith(25000);
      expect(clock.isCurrentlyScrubbing).toBe(false);
      expect(clock.positionMs).toBe(25000);
      clock.destroy();
    });

    it("supports relative scrubDelta calls", () => {
      const onSeekCommit = vi.fn();
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
        onSeekCommit,
      });

      clock.scrubDelta(5000); // 10000 + 5000 = 15000
      expect(clock.positionMs).toBe(15000);

      clock.scrubDelta(-2000); // 15000 - 2000 = 13000
      expect(clock.positionMs).toBe(13000);

      vi.advanceTimersByTime(300);
      expect(onSeekCommit).toHaveBeenCalledTimes(1);
      expect(onSeekCommit).toHaveBeenCalledWith(13000);
      clock.destroy();
    });

    it("seekImmediate bypasses debounce and commits synchronously", () => {
      const onSeekCommit = vi.fn();
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
        onSeekCommit,
      });

      clock.seekImmediate(42000);
      expect(onSeekCommit).toHaveBeenCalledTimes(1);
      expect(onSeekCommit).toHaveBeenCalledWith(42000);
      expect(clock.positionMs).toBe(42000);
      clock.destroy();
    });
  });

  describe("Post-Seek Suppression Window (D-05)", () => {
    it("drops incoming server position updates within 1500ms of seek commit", () => {
      const clock = new PlaybackClockController({
        serverPositionMs: 10000,
        isPlaying: true,
        durationMs: 60000,
        suppressServerWindowMs: 1500,
      });

      clock.seekImmediate(35000);
      expect(clock.positionMs).toBe(35000);

      // Stale server poll arrives 500ms later with old position 10500ms
      vi.advanceTimersByTime(500);
      clock.updateOptions({
        serverPositionMs: 10500,
        isPlaying: true,
        durationMs: 60000,
      });

      // Must NOT revert to stale 10500ms!
      expect(clock.positionMs).toBe(35500); // 35000 + 500ms local tick

      // Advance past the 1500ms suppression window
      vi.advanceTimersByTime(1100); // Total 1600ms since seek

      // New server poll arrives synced at 36600ms
      clock.updateOptions({
        serverPositionMs: 36600,
        isPlaying: true,
        durationMs: 60000,
      });

      // Now server updates are accepted (or drift-gated)
      expect(clock.positionMs).toBe(36600);
      clock.destroy();
    });
  });

  describe("usePlaybackClock Hook Interface", () => {
    it("exports usePlaybackClock hook function", () => {
      expect(typeof usePlaybackClock).toBe("function");
    });
  });
});
