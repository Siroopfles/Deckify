import { describe, it, expect } from "vitest";
import { computeListJump } from "./listNavigation";

describe("computeListJump", () => {
  it("returns null for empty lists", () => {
    expect(computeListJump([], 0, 1, 15, false)).toBeNull();
    expect(computeListJump([], 0, -1, 15, true)).toBeNull();
  });

  it("handles single-element lists safely in both ±N and A-Z modes", () => {
    expect(computeListJump(["Only Track"], 0, 1, 15, false)).toEqual({
      targetIndex: 0,
      badge: "1 / 1",
      shouldLoadMore: true,
    });
    expect(computeListJump(["Only Track"], 0, -1, 15, false)).toEqual({
      targetIndex: 0,
      badge: "1 / 1",
      shouldLoadMore: false,
    });
    expect(computeListJump(["Miles Davis"], 0, 1, 15, true)).toEqual({
      targetIndex: 0,
      badge: "M",
      shouldLoadMore: true,
    });
  });

  it("jumps to first (L2) and last (R2) on short lists (length <= pageSize)", () => {
    const labels = ["Track 1", "Track 2", "Track 3", "Track 4", "Track 5"];
    expect(computeListJump(labels, 2, -1, 15, false)).toEqual({
      targetIndex: 0,
      badge: "1 / 5",
      shouldLoadMore: false,
    });
    expect(computeListJump(labels, 2, 1, 15, false)).toEqual({
      targetIndex: 4,
      badge: "5 / 5",
      shouldLoadMore: false,
    });
    expect(computeListJump(labels, 4, 1, 15, false)).toEqual({
      targetIndex: 4,
      badge: "5 / 5",
      shouldLoadMore: true,
    });
  });

  it("pages by ±pageSize and clamps to [0, length - 1] on long lists", () => {
    const labels = Array.from({ length: 40 }, (_, i) => `Song ${i + 1}`);
    expect(computeListJump(labels, 0, 1, 15, false)).toEqual({
      targetIndex: 15,
      badge: "16 / 40",
      shouldLoadMore: false,
    });
    expect(computeListJump(labels, 15, 1, 15, false)).toEqual({
      targetIndex: 30,
      badge: "31 / 40",
      shouldLoadMore: false,
    });
    expect(computeListJump(labels, 30, 1, 15, false)).toEqual({
      targetIndex: 39,
      badge: "40 / 40",
      shouldLoadMore: false,
    });
    expect(computeListJump(labels, 39, 1, 15, false)).toEqual({
      targetIndex: 39,
      badge: "40 / 40",
      shouldLoadMore: true,
    });
    expect(computeListJump(labels, 10, -1, 15, false)).toEqual({
      targetIndex: 0,
      badge: "1 / 40",
      shouldLoadMore: false,
    });
  });

  it("jumps across distinct A-Z anchors forward and backward with equal adjacent labels", () => {
    const labels = ["Alpha", "Apex", "Beta", "Bravo", "Charlie"];
    // Forward from Alpha (0) skips Apex (1) to Beta (2)
    expect(computeListJump(labels, 0, 1, 15, true)).toEqual({
      targetIndex: 2,
      badge: "B",
      shouldLoadMore: false,
    });
    // Forward from Beta (2) skips Bravo (3) to Charlie (4)
    expect(computeListJump(labels, 2, 1, 15, true)).toEqual({
      targetIndex: 4,
      badge: "C",
      shouldLoadMore: false,
    });
    // Forward from Charlie (4) clamps to 4 and requests loadMore
    expect(computeListJump(labels, 4, 1, 15, true)).toEqual({
      targetIndex: 4,
      badge: "C",
      shouldLoadMore: true,
    });
    // Backward from Charlie (4) lands on first item of B group (Beta at 2)
    expect(computeListJump(labels, 4, -1, 15, true)).toEqual({
      targetIndex: 2,
      badge: "B",
      shouldLoadMore: false,
    });
    // Backward from Bravo (3) lands on first item of A group (Alpha at 0)
    expect(computeListJump(labels, 3, -1, 15, true)).toEqual({
      targetIndex: 0,
      badge: "A",
      shouldLoadMore: false,
    });
    // Backward from Apex (1) clamps to 0
    expect(computeListJump(labels, 1, -1, 15, true)).toEqual({
      targetIndex: 0,
      badge: "A",
      shouldLoadMore: false,
    });
  });
});
