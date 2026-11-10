import { SyncedLine } from "./types";

export function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function parseLrc(lrcText: string): SyncedLine[] {
  if (!lrcText) return [];
  const lines = lrcText.split("\n");
  const result: SyncedLine[] = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)/;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = regex.exec(trimmed);
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const rawMs = match[3] || "0";
      const ms = parseInt(rawMs.padEnd(3, "0").substring(0, 3), 10);
      const timeMs = min * 60000 + sec * 1000 + ms;
      const text = match[4].trim();
      if (text) {
        result.push({ timeMs, text });
      }
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}
