import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { playNotificationChime, resetChimeContextForTests } from "./chime";

interface MockGainNode {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
}

interface MockOscillatorNode {
  type: OscillatorType;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

interface FakeCtxRecord {
  state: string;
  currentTime: number;
  destination: object;
  resume: ReturnType<typeof vi.fn>;
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  oscillators: MockOscillatorNode[];
  gains: MockGainNode[];
}

function makeFakeAudioContextClass(createdContexts: FakeCtxRecord[]) {
  return class FakeAudioContext implements FakeCtxRecord {
    state = "running";
    currentTime = 10;
    destination = {};
    oscillators: MockOscillatorNode[] = [];
    gains: MockGainNode[] = [];
    resume = vi.fn().mockResolvedValue(undefined);
    createOscillator = vi.fn(() => {
      const osc: MockOscillatorNode = {
        type: "sine",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      this.oscillators.push(osc);
      return osc;
    });
    createGain = vi.fn(() => {
      const gain: MockGainNode = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      this.gains.push(gain);
      return gain;
    });

    constructor() {
      createdContexts.push(this);
    }
  };
}

describe("playNotificationChime", () => {
  const originalAudioContext = globalThis.AudioContext;
  const originalWebkit = (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
  let createdContexts: FakeCtxRecord[];

  beforeEach(() => {
    resetChimeContextForTests();
    createdContexts = [];
    (globalThis as { AudioContext?: unknown }).AudioContext =
      makeFakeAudioContextClass(createdContexts);
    delete (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
  });

  afterEach(() => {
    resetChimeContextForTests();
    if (originalAudioContext === undefined) {
      delete (globalThis as { AudioContext?: unknown }).AudioContext;
    } else {
      globalThis.AudioContext = originalAudioContext;
    }
    if (originalWebkit === undefined) {
      delete (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext;
    } else {
      (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext = originalWebkit;
    }
    vi.restoreAllMocks();
  });

  it("scales GainNode peak proportionally to volume (0-100) and reuses AudioContext", () => {
    playNotificationChime(50);
    expect(createdContexts).toHaveLength(1);
    const ctx = createdContexts[0];
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.gains).toHaveLength(2);
    expect(ctx.gains[0].gain.setValueAtTime).toHaveBeenCalledWith(0.5 * 0.18, 10);
    expect(ctx.gains[0].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 10.06);
    expect(ctx.oscillators[0].frequency.setValueAtTime).toHaveBeenCalledWith(523.25, 10);
    expect(ctx.gains[1].gain.setValueAtTime).toHaveBeenCalledWith(0.5 * 0.18, 10.06);
    expect(ctx.gains[1].gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 10.15);
    expect(ctx.oscillators[1].frequency.setValueAtTime).toHaveBeenCalledWith(659.25, 10.06);

    playNotificationChime(150);
    expect(createdContexts).toHaveLength(1);
    expect(ctx.gains[2].gain.setValueAtTime).toHaveBeenCalledWith(0.18, 10);
  });

  it("is a no-op when volume <= 0 or non-finite or AudioContext is unavailable", () => {
    playNotificationChime(0);
    playNotificationChime(-15);
    playNotificationChime(Number.NaN);
    expect(createdContexts).toHaveLength(0);

    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    expect(() => playNotificationChime(60)).not.toThrow();
    expect(createdContexts).toHaveLength(0);
  });

  it("resumes a suspended AudioContext and swallows resume rejections or Web Audio throws", async () => {
    class SuspendedAudioContext {
      state = "suspended";
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockRejectedValue(new Error("autoplay blocked"));
      createOscillator = vi.fn(() => {
        throw new Error("node creation failed");
      });
      createGain = vi.fn();
    }
    (globalThis as { AudioContext?: unknown }).AudioContext = SuspendedAudioContext;
    expect(() => playNotificationChime(80)).not.toThrow();
    await Promise.resolve();
  });
});
