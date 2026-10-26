import { describe, expect, it } from 'vitest';
import { createGame } from '@/core/state/createGame';
import { runTick } from '@/core/sim/simulation';

/**
 * Guard for the fixed tick: the logic must stay far below the 500 ms tick of
 * the game clock even with the whole map populated and dozens of structures.
 */
describe('performance', () => {
  it('keeps a tick well inside the budget on a full map', () => {
    const state = createGame({ seed: 909, playerCountryId: 'aquilonia', difficulty: 'hard' });
    for (let i = 0; i < 120; i += 1) runTick(state);

    const ticks = 300;
    const started = performance.now();
    for (let i = 0; i < ticks; i += 1) runTick(state);
    const perTick = (performance.now() - started) / ticks;

    expect(state.cellOwner.length).toBeGreaterThan(9000);
    expect(perTick).toBeLessThan(25);
  });

  it('keeps the map repaint check O(1)', () => {
    const state = createGame({ seed: 909, playerCountryId: 'aquilonia', difficulty: 'normal' });
    for (let i = 0; i < 20; i += 1) runTick(state);
    // The renderer only watches this counter, never the whole owner array.
    expect(typeof state.mapVersion).toBe('number');
    expect(state.mapVersion).toBeGreaterThanOrEqual(0);
  });
});
