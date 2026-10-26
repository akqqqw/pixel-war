import { describe, expect, it } from 'vitest';
import { SoundEngine, soundForStatus } from '@/services/audio';

describe('sound engine', () => {
  it('does nothing when the browser has no WebAudio', () => {
    const engine = new SoundEngine();
    expect(() => engine.unlock()).not.toThrow();
    expect(() => engine.play('capture')).not.toThrow();
    expect(() => engine.play('victory')).not.toThrow();
  });

  it('remembers the enabled flag', () => {
    const engine = new SoundEngine();
    expect(engine.isEnabled).toBe(true);
    engine.setEnabled(false);
    expect(engine.isEnabled).toBe(false);
    expect(() => engine.play('lost')).not.toThrow();
    engine.setEnabled(true);
    expect(engine.isEnabled).toBe(true);
  });

  it('maps the end of a campaign to the right effect', () => {
    expect(soundForStatus('victory')).toBe('victory');
    expect(soundForStatus('defeat')).toBe('defeat');
  });

  it('survives a broken audio context', () => {
    const scope = globalThis as unknown as { AudioContext?: unknown };
    const original = scope.AudioContext;
    // A constructor that throws must be swallowed, not bubble into the render loop.
    scope.AudioContext = class Broken {
      constructor() {
        throw new Error('no audio device');
      }
    };
    try {
      const engine = new SoundEngine();
      expect(() => engine.play('missile')).not.toThrow();
    } finally {
      scope.AudioContext = original;
    }
  });
});
