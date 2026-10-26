/**
 * Tiny sound engine: every effect is synthesised with WebAudio, so the game
 * ships without audio files and works fully offline.
 *
 * The context is created lazily on the first user gesture (browsers block audio
 * before that) and every call is a no-op when the API is missing — the game
 * stays playable in tests, in an old browser and with sound switched off.
 */

export type SoundName =
  | 'capture'
  | 'lost'
  | 'missile'
  | 'build'
  | 'mobilize'
  | 'upgrade'
  | 'victory'
  | 'defeat';

interface Note {
  /** Frequency in Hz. */
  freq: number;
  /** Offset from the start of the effect, seconds. */
  at: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  /** End frequency for a glide, defaults to `freq`. */
  to?: number;
}

const EFFECTS: Record<SoundName, Note[]> = {
  // Two short notes up — ground taken.
  capture: [
    { freq: 520, at: 0, duration: 0.07, type: 'square', gain: 0.045 },
    { freq: 780, at: 0.06, duration: 0.09, type: 'square', gain: 0.04 },
  ],
  // One note down — ground lost.
  lost: [
    { freq: 300, at: 0, duration: 0.1, type: 'triangle', gain: 0.05 },
    { freq: 180, at: 0.09, duration: 0.16, type: 'triangle', gain: 0.05 },
  ],
  // Falling whine — a missile left the launcher.
  missile: [
    { freq: 900, at: 0, duration: 0.28, type: 'sawtooth', gain: 0.035, to: 220 },
  ],
  build: [{ freq: 420, at: 0, duration: 0.06, type: 'square', gain: 0.035 }],
  mobilize: [
    { freq: 340, at: 0, duration: 0.07, type: 'square', gain: 0.035 },
    { freq: 460, at: 0.05, duration: 0.07, type: 'square', gain: 0.03 },
  ],
  upgrade: [
    { freq: 600, at: 0, duration: 0.06, type: 'square', gain: 0.03 },
    { freq: 900, at: 0.05, duration: 0.08, type: 'square', gain: 0.03 },
  ],
  victory: [
    { freq: 523, at: 0, duration: 0.14, type: 'square', gain: 0.05 },
    { freq: 659, at: 0.13, duration: 0.14, type: 'square', gain: 0.05 },
    { freq: 784, at: 0.26, duration: 0.26, type: 'square', gain: 0.05 },
  ],
  defeat: [
    { freq: 400, at: 0, duration: 0.18, type: 'triangle', gain: 0.05 },
    { freq: 300, at: 0.17, duration: 0.18, type: 'triangle', gain: 0.05 },
    { freq: 200, at: 0.34, duration: 0.34, type: 'triangle', gain: 0.05 },
  ],
};

type AudioContextCtor = new () => AudioContext;

export class SoundEngine {
  private context: AudioContext | null = null;
  private enabled = true;
  private unavailable = false;
  /** Rate limit so a fast frontline cannot turn into a buzz. */
  private lastPlayed: Partial<Record<SoundName, number>> = {};

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.context?.suspend?.().catch(() => undefined);
    else if (this.context?.state === 'suspended') this.context.resume?.().catch(() => undefined);
  }

  /** Must be called from a user gesture: browsers refuse audio before one. */
  unlock(): void {
    if (!this.enabled || this.unavailable) return;
    this.ensureContext();
    if (this.context?.state === 'suspended') this.context.resume?.().catch(() => undefined);
  }

  play(name: SoundName): void {
    if (!this.enabled || this.unavailable) return;
    const now = Date.now();
    const throttle = name === 'capture' || name === 'lost' ? 120 : 60;
    if (now - (this.lastPlayed[name] ?? 0) < throttle) return;
    this.lastPlayed[name] = now;

    const context = this.ensureContext();
    if (!context) return;
    const start = context.currentTime + 0.01;
    for (const note of EFFECTS[name]) {
      this.tone(context, note, start);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (this.unavailable) return null;
    const ctor = (globalThis as unknown as { AudioContext?: AudioContextCtor }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!ctor) {
      this.unavailable = true;
      return null;
    }
    try {
      this.context = new ctor();
      return this.context;
    } catch {
      this.unavailable = true;
      return null;
    }
  }

  private tone(context: AudioContext, note: Note, start: number): void {
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.type;
      const from = Math.max(40, note.freq);
      const to = Math.max(40, note.to ?? note.freq);
      oscillator.frequency.setValueAtTime(from, start + note.at);
      if (note.to) oscillator.frequency.linearRampToValueAtTime(to, start + note.at + note.duration);

      // Short attack, exponential release — no clicks at the edges.
      const begin = start + note.at;
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.linearRampToValueAtTime(note.gain, begin + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, begin + note.duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(begin);
      oscillator.stop(begin + note.duration + 0.02);
    } catch {
      // A single failed node must never break the frame.
    }
  }
}

export const sound = new SoundEngine();

/** Only the player's own events are heard, not every AI skirmish on the map. */
export function soundForStatus(status: 'victory' | 'defeat'): SoundName {
  return status === 'victory' ? 'victory' : 'defeat';
}
