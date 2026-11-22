import { describe, expect, it } from "vitest";
import type { EpisodeItem } from "../types";
import {
  PLAYBACK_SPEED_OPTIONS,
  QAM_SPEED_CYCLE,
  filterEpisodes,
  formatPlaybackSpeed,
  formatRemainingTime,
  getNextCycleSpeed,
  isSpokenContent,
} from "./playback";

describe("isSpokenContent", () => {
  it("returns true for episode, chapter, and audiobook media_type", () => {
    expect(
      isSpokenContent({ name: "Ep 1", artist: "Show", album: "Show", duration_ms: 1000, media_type: "episode" })
    ).toBe(true);
    expect(
      isSpokenContent({ name: "Ch 1", artist: "Author", album: "Book", duration_ms: 1000, media_type: "chapter" })
    ).toBe(true);
    expect(
      isSpokenContent({ name: "Book 1", artist: "Author", album: "Book", duration_ms: 1000, media_type: "audiobook" })
    ).toBe(true);
  });

  it("returns true for :episode: and :chapter: URIs", () => {
    expect(
      isSpokenContent({
        name: "Ep",
        artist: "Show",
        album: "Show",
        duration_ms: 1000,
        uri: "spotify:episode:abc123",
      })
    ).toBe(true);
    expect(
      isSpokenContent({
        name: "Ch",
        artist: "Author",
        album: "Book",
        duration_ms: 1000,
        uri: "spotify:chapter:xyz789",
      })
    ).toBe(true);
  });

  it("returns false for media_type track even with empty album", () => {
    expect(
      isSpokenContent({
        name: "Single",
        artist: "Artist",
        album: "",
        duration_ms: 1000,
        media_type: "track",
      })
    ).toBe(false);
  });

  it("returns true for legacy empty album when media_type is undefined", () => {
    expect(
      isSpokenContent({
        name: "Legacy Ep",
        artist: "Show",
        album: "",
        duration_ms: 1000,
      })
    ).toBe(true);
  });

  it("returns false for null/undefined or normal music tracks", () => {
    expect(isSpokenContent(null)).toBe(false);
    expect(isSpokenContent(undefined)).toBe(false);
    expect(
      isSpokenContent({
        name: "Song",
        artist: "Band",
        album: "LP",
        duration_ms: 1000,
        uri: "spotify:track:123",
      })
    ).toBe(false);
  });
});

describe("playback speed options and QAM cycle", () => {
  it("exposes 7 PLAYBACK_SPEED_OPTIONS from 0.5x through 2.0x", () => {
    expect(PLAYBACK_SPEED_OPTIONS).toHaveLength(7);
    expect(PLAYBACK_SPEED_OPTIONS.map((o) => o.label)).toEqual([
      "0.5x",
      "0.75x",
      "1.0x",
      "1.25x",
      "1.5x",
      "1.75x",
      "2.0x",
    ]);
    expect(PLAYBACK_SPEED_OPTIONS.map((o) => o.data)).toEqual([
      0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0,
    ]);
  });

  it("cycles QAM_SPEED_CYCLE 1.0 -> 1.25 -> 1.5 -> 1.75 -> 2.0 -> 0.5 -> 0.75 -> 1.0", () => {
    expect(Array.from(QAM_SPEED_CYCLE)).toEqual([1.0, 1.25, 1.5, 1.75, 2.0, 0.5, 0.75]);
    expect(getNextCycleSpeed(1.0)).toBe(1.25);
    expect(getNextCycleSpeed(1.25)).toBe(1.5);
    expect(getNextCycleSpeed(1.5)).toBe(1.75);
    expect(getNextCycleSpeed(1.75)).toBe(2.0);
    expect(getNextCycleSpeed(2.0)).toBe(0.5);
    expect(getNextCycleSpeed(0.5)).toBe(0.75);
    expect(getNextCycleSpeed(0.75)).toBe(1.0);
  });

  it("formats playback speeds explicitly", () => {
    expect(formatPlaybackSpeed(0.5)).toBe("0.5x");
    expect(formatPlaybackSpeed(0.75)).toBe("0.75x");
    expect(formatPlaybackSpeed(1.0)).toBe("1.0x");
    expect(formatPlaybackSpeed(1.25)).toBe("1.25x");
    expect(formatPlaybackSpeed(1.5)).toBe("1.5x");
    expect(formatPlaybackSpeed(1.75)).toBe("1.75x");
    expect(formatPlaybackSpeed(2.0)).toBe("2.0x");
  });
});

describe("filterEpisodes", () => {
  const episodes: EpisodeItem[] = [
    {
      id: "unplayed-1",
      name: "Unplayed",
      show_name: "Show",
      uri: "spotify:episode:1",
      duration_ms: 1800000,
      resume_position_ms: 0,
      fully_played: false,
    },
    {
      id: "in-progress-1",
      name: "In Progress",
      show_name: "Show",
      uri: "spotify:episode:2",
      duration_ms: 1800000,
      resume_position_ms: 600000,
      fully_played: false,
    },
    {
      id: "played-1",
      name: "Played",
      show_name: "Show",
      uri: "spotify:episode:3",
      duration_ms: 1800000,
      resume_position_ms: 1800000,
      fully_played: true,
    },
  ];

  it("handles empty arrays", () => {
    expect(filterEpisodes([], "all")).toEqual([]);
    expect(filterEpisodes([], "unplayed")).toEqual([]);
    expect(filterEpisodes([], "in_progress")).toEqual([]);
  });

  it("filters all, unplayed, and in_progress accurately", () => {
    expect(filterEpisodes(episodes, "all").map((e) => e.id)).toEqual([
      "unplayed-1",
      "in-progress-1",
      "played-1",
    ]);
    expect(filterEpisodes(episodes, "unplayed").map((e) => e.id)).toEqual(["unplayed-1"]);
    expect(filterEpisodes(episodes, "in_progress").map((e) => e.id)).toEqual(["in-progress-1"]);
  });
});

describe("formatRemainingTime", () => {
  it("formats minutes remaining and <1m left", () => {
    expect(formatRemainingTime(1800000, 600000)).toBe("20m left");
    expect(formatRemainingTime(90000, 60000)).toBe("<1m left");
  });

  it("returns empty string when durationMs <= resumeMs or invalid", () => {
    expect(formatRemainingTime(600000, 600000)).toBe("");
    expect(formatRemainingTime(500000, 600000)).toBe("");
    expect(formatRemainingTime(undefined, 0)).toBe("");
  });
});
