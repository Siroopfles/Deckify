import { describe, expect, it } from "vitest";
import { formatMs } from "./utils";

describe("formatMs", () => {
  it("formats 0 ms as 0:00", () => {
    expect(formatMs(0)).toBe("0:00");
  });

  it("formats sub-minute times correctly", () => {
    expect(formatMs(5000)).toBe("0:05");
    expect(formatMs(45000)).toBe("0:45");
    expect(formatMs(59999)).toBe("0:59");
  });

  it("formats multi-minute times correctly", () => {
    expect(formatMs(60000)).toBe("1:00");
    expect(formatMs(185000)).toBe("3:05");
    expect(formatMs(3600000)).toBe("60:00");
  });
});
