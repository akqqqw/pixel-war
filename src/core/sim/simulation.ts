import { runAi } from '@/core/ai/ai';
import { BALANCE, TICK_MS } from '@/core/sim/balance';
import { resolveBattles } from '@/core/sim/battle';
import { runEconomyTick } from '@/core/sim/economy';
import { advanceOffensives } from '@/core/sim/orders';
import { refreshRegionOwnership, refreshTotals } from '@/core/sim/regions';
import { resolveStrikes } from '@/core/sim/strikes';
import { checkVictory } from '@/core/sim/victory';
import type { GameState } from '@/core/state/types';

export const MAX_TICKS_PER_FRAME = 8;

/**
 * One fixed logic tick (0.5 s of game time at ×1):
 * economy → AI → army flow → cellular battle → strikes → regions → victory.
 * Rendering runs at the frame rate and only reads the result.
 */
export function runTick(state: GameState): void {
  if (state.status !== 'playing') return;
  state.tick += 1;
  runEconomyTick(state);
  runAi(state);
  advanceOffensives(state);
  resolveBattles(state);
  resolveStrikes(state);
  refreshRegionOwnership(state);
  refreshTotals(state);
  checkVictory(state);
}

/**
 * Converts real time into whole ticks. Speed ×1 runs two ticks per second,
 * ×2 and ×4 run four and eight; a background tab never fast-forwards the war.
 */
export class GameClock {
  private accumulator = 0;

  constructor(private readonly state: GameState) {}

  advance(deltaMs: number): number {
    if (this.state.speed === 0 || this.state.status !== 'playing') return 0;
    const delta = Math.min(deltaMs, 5000);
    this.accumulator += delta;
    const interval = TICK_MS / this.state.speed;
    let ticks = 0;
    const limit = MAX_TICKS_PER_FRAME * this.state.speed;
    while (this.accumulator >= interval && ticks < limit) {
      this.accumulator -= interval;
      ticks += 1;
    }
    if (ticks === limit) this.accumulator = 0;
    for (let i = 0; i < ticks; i += 1) runTick(this.state);
    return ticks;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

export { BALANCE };
