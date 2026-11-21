let cachedAudioContext: AudioContext | null = null;

function getAudioContextConstructor(): (new () => AudioContext) | undefined {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext;
}

interface ChimeNoteOptions {
  frequencyHz: number;
  startTime: number;
  durationSec: number;
  peakGain: number;
}

function scheduleChimeNote(ctx: AudioContext, note: ChimeNoteOptions): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(note.frequencyHz, note.startTime);
  gain.gain.setValueAtTime(note.peakGain, note.startTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, note.startTime + note.durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(note.startTime);
  osc.stop(note.startTime + note.durationSec);
}

/**
 * Play a subtle two-note Web Audio chime scaled by the Deckify volume (0-100).
 * Never uses Steam's native notification sound and never throws.
 */
export function playNotificationChime(volumePercent: number): void {
  try {
    const clamped = Number.isFinite(volumePercent)
      ? Math.max(0, Math.min(100, volumePercent))
      : 0;
    if (clamped <= 0) return;

    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) return;

    if (!cachedAudioContext) {
      cachedAudioContext = new AudioCtx();
    }
    const ctx = cachedAudioContext;
    if (ctx.state === "suspended") {
      void ctx.resume?.().catch(() => {});
    }

    const peakGain = (clamped / 100) * 0.18;
    const t0 = ctx.currentTime;
    scheduleChimeNote(ctx, { frequencyHz: 523.25, startTime: t0, durationSec: 0.06, peakGain });
    scheduleChimeNote(ctx, {
      frequencyHz: 659.25,
      startTime: t0 + 0.06,
      durationSec: 0.09,
      peakGain,
    });
  } catch {
    // Web Audio errors must never break notification flow
  }
}

export function resetChimeContextForTests(): void {
  cachedAudioContext = null;
}
