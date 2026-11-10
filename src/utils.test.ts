import { describe, it, expect } from "vitest";

function formatMs(ms: number): string {
  if (!ms || ms <= 0) return "0:00";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

interface SyncedLine {
  timeMs: number;
  text: string;
}

function parseLrc(lrcText: string): SyncedLine[] {
  const lines = lrcText.split("\n");
  const result: SyncedLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;
  for (const line of lines) {
    const match = regex.exec(line.trim());
    if (match) {
      const min = parseInt(match[1], 10);
      const sec = parseInt(match[2], 10);
      const ms = parseInt(match[3].padEnd(3, "0").substring(0, 3), 10);
      const timeMs = min * 60000 + sec * 1000 + ms;
      const text = match[4].trim();
      if (text) result.push({ timeMs, text });
    }
  }
  return result.sort((a, b) => a.timeMs - b.timeMs);
}

describe("Frontend Utilities", () => {
  describe("formatMs", () => {
    it("formats 0 as 0:00", () => {
      expect(formatMs(0)).toBe("0:00");
    });

    it("formats negative numbers as 0:00", () => {
      expect(formatMs(-500)).toBe("0:00");
    });

    it("formats seconds with leading zeros", () => {
      expect(formatMs(65000)).toBe("1:05");
    });

    it("formats minutes and seconds properly", () => {
      expect(formatMs(185000)).toBe("3:05");
      expect(formatMs(240000)).toBe("4:00");
    });
  });

  describe("parseLrc", () => {
    it("parses synchronized LRC lines correctly", () => {
      const lrc = `
[00:12.50]First line of lyrics
[00:15.80]Second line of lyrics
[01:05.120]Chorus starts here
`;
      const parsed = parseLrc(lrc);
      expect(parsed).toHaveLength(3);
      expect(parsed[0]).toEqual({ timeMs: 12500, text: "First line of lyrics" });
      expect(parsed[1]).toEqual({ timeMs: 15800, text: "Second line of lyrics" });
      expect(parsed[2]).toEqual({ timeMs: 65120, text: "Chorus starts here" });
    });

    it("sorts unsorted LRC entries in chronological order", () => {
      const lrc = `
[00:20.00]Line 2
[00:10.00]Line 1
`;
      const parsed = parseLrc(lrc);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].text).toBe("Line 1");
      expect(parsed[1].text).toBe("Line 2");
    });

    it("ignores empty or non-matching lines", () => {
      const lrc = `
[ar:Artist Name]
[ti:Track Title]
Just some plain text
[00:05.00]Valid line
`;
      const parsed = parseLrc(lrc);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({ timeMs: 5000, text: "Valid line" });
    });
  });
});
