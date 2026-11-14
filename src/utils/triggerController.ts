export const TRIGGER_PRESS_THRESHOLD = 0.75;
export const TRIGGER_RELEASE_THRESHOLD = 0.25;
export const TRIGGER_DEBOUNCE_MS = 300;
export const TRIGGER_REPEAT_DELAY_MS = 500;
export const TRIGGER_REPEAT_INTERVAL_MS = 300;

export type TriggerSide = "L2" | "R2";

export interface TriggerChannelState {
  armed: boolean;
  lastFireAt: number;
  heldSince: number | null;
  lastRepeatAt: number;
}

function createInitialChannelState(): TriggerChannelState {
  return {
    armed: true,
    lastFireAt: -Infinity,
    heldSince: null,
    lastRepeatAt: -Infinity,
  };
}

/**
 * Pure Schmidt hysteresis + software debounce + hold-to-repeat state machine
 * for analog L2/R2 gamepad triggers.
 */
export class TriggerController {
  private channels: Record<TriggerSide, TriggerChannelState>;

  constructor() {
    this.channels = {
      L2: createInitialChannelState(),
      R2: createInitialChannelState(),
    };
  }

  processTrigger(side: TriggerSide, value: number, now: number): boolean {
    const ch = this.channels[side];

    // Release threshold resets hysteresis arming and hold timers
    if (value <= TRIGGER_RELEASE_THRESHOLD) {
      ch.armed = true;
      ch.heldSince = null;
      ch.lastRepeatAt = -Infinity;
      return false;
    }

    if (ch.armed) {
      if (value >= TRIGGER_PRESS_THRESHOLD) {
        if (now - ch.lastFireAt < TRIGGER_DEBOUNCE_MS) {
          return false;
        }
        ch.armed = false;
        ch.lastFireAt = now;
        ch.heldSince = now;
        ch.lastRepeatAt = now;
        return true;
      }
      return false;
    }

    // Disarmed (already fired and still held > TRIGGER_RELEASE_THRESHOLD): check hold-to-repeat
    if (
      ch.heldSince !== null &&
      now - ch.heldSince >= TRIGGER_REPEAT_DELAY_MS &&
      now - ch.lastRepeatAt >= TRIGGER_REPEAT_INTERVAL_MS
    ) {
      ch.lastRepeatAt = now;
      ch.lastFireAt = now;
      return true;
    }

    return false;
  }

  getChannelState(side: TriggerSide): Readonly<TriggerChannelState> {
    return this.channels[side];
  }

  reset(): void {
    this.channels.L2 = createInitialChannelState();
    this.channels.R2 = createInitialChannelState();
  }
}
