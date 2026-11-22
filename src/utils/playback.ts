import type { SingleDropdownOption } from "@decky/ui";
import type { EpisodeFilter, EpisodeItem, TrackItem, TrackMeta } from "../types";

export const PLAYBACK_SPEED_OPTIONS: SingleDropdownOption[] = [
  { data: 0.5, label: "0.5x" },
  { data: 0.75, label: "0.75x" },
  { data: 1.0, label: "1.0x" },
  { data: 1.25, label: "1.25x" },
  { data: 1.5, label: "1.5x" },
  { data: 1.75, label: "1.75x" },
  { data: 2.0, label: "2.0x" },
];

export const QAM_SPEED_CYCLE = [1.0, 1.25, 1.5, 1.75, 2.0, 0.5, 0.75] as const;

const SPEED_LABEL_MAP: Record<number, string> = {
  0.5: "0.5x",
  0.75: "0.75x",
  1.0: "1.0x",
  1.25: "1.25x",
  1.5: "1.5x",
  1.75: "1.75x",
  2.0: "2.0x",
};

export function getNextCycleSpeed(current: number): number {
  const idx = QAM_SPEED_CYCLE.findIndex((s) => Math.abs(s - current) < 0.01);
  if (idx === -1) {
    return 1.0;
  }
  return QAM_SPEED_CYCLE[(idx + 1) % QAM_SPEED_CYCLE.length];
}

export function formatPlaybackSpeed(speed: number): string {
  if (!Number.isFinite(speed) || speed <= 0) {
    return "1.0x";
  }
  const matched = Object.keys(SPEED_LABEL_MAP).find(
    (key) => Math.abs(Number(key) - speed) < 0.01
  );
  if (matched !== undefined) {
    return SPEED_LABEL_MAP[Number(matched)];
  }
  return `${speed}x`;
}

export function isSpokenContent(track?: TrackMeta | TrackItem | null): boolean {
  if (!track) return false;
  const mediaType = track.media_type?.toLowerCase();
  if (mediaType === "episode" || mediaType === "chapter" || mediaType === "audiobook") {
    return true;
  }
  if (mediaType === "track") {
    return false;
  }
  const uri = track.uri ?? "";
  if (uri.includes(":episode:") || uri.includes(":chapter:")) {
    return true;
  }
  if (mediaType === undefined && track.album === "") {
    return true;
  }
  return false;
}

export function filterEpisodes(
  episodes: EpisodeItem[],
  filter: EpisodeFilter
): EpisodeItem[] {
  if (filter === "all") {
    return episodes;
  }
  if (filter === "unplayed") {
    return episodes.filter(
      (ep) => !ep.fully_played && (ep.resume_position_ms ?? 0) === 0
    );
  }
  return episodes.filter(
    (ep) => !ep.fully_played && (ep.resume_position_ms ?? 0) > 0
  );
}

export function formatRemainingTime(durationMs?: number, resumeMs?: number): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs <= 0) {
    return "";
  }
  const safeResume =
    resumeMs != null && Number.isFinite(resumeMs) && resumeMs > 0 ? resumeMs : 0;
  const remainingMs = durationMs - safeResume;
  if (remainingMs <= 0) {
    return "";
  }
  const remainingMin = Math.floor(remainingMs / 60000);
  if (remainingMin < 1) {
    return "<1m left";
  }
  return `${remainingMin}m left`;
}
