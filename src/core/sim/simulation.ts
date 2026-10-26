import { runAi } from '@/core/ai/ai';
import { BALANCE, TICK_MS } from '@/core/sim/balance';
import { runEconomyTick } from '@/core/sim/economy';
import { stepFrontline } from '@/core/sim/frontline';
import { checkVictory } from '@/core/sim/victory';
import { fireMissiles } from '@/core/sim/weapons';
import type { GameState } from '@/core/state/types';

export const MAX_TICKS_PER_FRAME = 8;

/** One in-game hour. */
export function runTick(state: GameState): void {
  if (state.status !== 'playing') return;
  state.tick += 1;
  runEconomyTick(state);
  runAi(state);
  fireMissiles(state);
  stepFrontline(state);
  checkVictory(state);
}

/**
 * Turns real time into whole game ticks. Keeps a remainder so the simulation
 * stays smooth at ×1 and ×4 and never runs away after a tab switch.
 */
export class GameClock {
  private accumulator = 0;

  constructor(private readonly state: GameState) {}

  advance(deltaMs: number): number {
    if (this.state.speed === 0 || this.state.status !== 'playing') return 0;
    const delta = Math.min(deltaMs, 5000);
    this.accumulator += delta;
    const interval = TICK_MS / (this.state.speed === 1 ? 1 : this.state.speed === 2 ? 2 : 4);
    let ticks = 0;
    while (this.accumulator >= interval && ticks < MAX_TICKS_PER_FRAME * this.state.speed) {
      this.accumulator -= interval;
      ticks += 1;
    }
    if (ticks === MAX_TICKS_PER_FRAME * this.state.speed) this.accumulator = 0;
    for (let i = 0; i < ticks; i += 1) runTick(this.state);
    return ticks;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

/** Monthly budget hint for the HUD (money per hour). */
export function incomeHint(state: GameState, countryId: string): number {
  return state.countries[countryId]?.income ?? 0;
}

export { BALANCE };
