import { describe, it, expect, beforeEach } from "vitest";
import {
  TriggerController,
  TRIGGER_PRESS_THRESHOLD,
  TRIGGER_RELEASE_THRESHOLD,
  TRIGGER_DEBOUNCE_MS,
  TRIGGER_REPEAT_DELAY_MS,
  TRIGGER_REPEAT_INTERVAL_MS,
} from "./triggerController";

describe("TriggerController", () => {
  let controller: TriggerController;

  beforeEach(() => {
    controller = new TriggerController();
  });

  it("exports expected threshold and timing constants", () => {
    expect(TRIGGER_PRESS_THRESHOLD).toBe(0.75);
    expect(TRIGGER_RELEASE_THRESHOLD).toBe(0.25);
    expect(TRIGGER_DEBOUNCE_MS).toBe(300);
    expect(TRIGGER_REPEAT_DELAY_MS).toBe(500);
    expect(TRIGGER_REPEAT_INTERVAL_MS).toBe(300);
  });

  it("activates at >= 0.75 and ignores values below 0.75", () => {
    expect(controller.processTrigger("L2", 0.74, 1000)).toBe(false);
    expect(controller.processTrigger("L2", 0.75, 1016)).toBe(true);
  });

  it("rejects analog chatter without dropping <= 0.25 (Schmidt hysteresis)", () => {
    expect(controller.processTrigger("L2", 0.76, 1000)).toBe(true);
    // Dips slightly below 0.75 but stays above 0.25, then climbs back above 0.75
    expect(controller.processTrigger("L2", 0.73, 1050)).toBe(false);
    expect(controller.processTrigger("L2", 0.78, 1100)).toBe(false);
    expect(controller.processTrigger("L2", 0.26, 1150)).toBe(false);
    expect(controller.processTrigger("L2", 0.9, 1200)).toBe(false);
  });

  it("resets arming when value drops <= 0.25 and enforces 300ms software debounce", () => {
    expect(controller.processTrigger("R2", 0.8, 1000)).toBe(true);
    // Release at t=1100
    expect(controller.processTrigger("R2", 0.25, 1100)).toBe(false);
    expect(controller.getChannelState("R2").armed).toBe(true);
    expect(controller.getChannelState("R2").heldSince).toBeNull();

    // Pull again at t=1200 (200ms since lastFireAt=1000 < 300ms debounce)
    expect(controller.processTrigger("R2", 0.85, 1200)).toBe(false);
    // Still held at t=1300 (300ms since lastFireAt=1000) -> fires
    expect(controller.processTrigger("R2", 0.85, 1300)).toBe(true);
  });

  it("supports hold-to-repeat after 500ms initial delay and every 300ms thereafter", () => {
    expect(controller.processTrigger("L2", 0.8, 1000)).toBe(true);

    // Before 500ms initial delay
    expect(controller.processTrigger("L2", 0.8, 1499)).toBe(false);
    // At 500ms initial delay -> first repeat
    expect(controller.processTrigger("L2", 0.8, 1500)).toBe(true);
    // Before 300ms repeat interval
    expect(controller.processTrigger("L2", 0.8, 1799)).toBe(false);
    // At 300ms repeat interval (even if analog value hovers at 0.5 > 0.25) -> second repeat
    expect(controller.processTrigger("L2", 0.5, 1800)).toBe(true);
  });

  it("tracks L2 and R2 channels independently", () => {
    expect(controller.processTrigger("L2", 0.8, 1000)).toBe(true);
    expect(controller.processTrigger("R2", 0.8, 1000)).toBe(true);
    expect(controller.processTrigger("L2", 0.8, 1100)).toBe(false);
    expect(controller.processTrigger("R2", 0.2, 1100)).toBe(false);
    expect(controller.getChannelState("L2").armed).toBe(false);
    expect(controller.getChannelState("R2").armed).toBe(true);
  });

  it("reset() restores both channels to clean armed state", () => {
    expect(controller.processTrigger("L2", 0.9, 1000)).toBe(true);
    expect(controller.processTrigger("R2", 0.9, 1000)).toBe(true);

    controller.reset();

    expect(controller.getChannelState("L2")).toEqual({
      armed: true,
      lastFireAt: -Infinity,
      heldSince: null,
      lastRepeatAt: -Infinity,
    });
    expect(controller.getChannelState("R2")).toEqual({
      armed: true,
      lastFireAt: -Infinity,
      heldSince: null,
      lastRepeatAt: -Infinity,
    });
    expect(controller.processTrigger("L2", 0.8, 1050)).toBe(true);
  });
});
