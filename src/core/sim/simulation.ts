import { createRng, type Rng } from '@/core/rng';
import type { GameState } from '@/core/state/types';
import { runEconomyTick } from '@/core/economy/economy';
import { runProductionTick } from '@/core/sim/production';
import { resolveArrival } from '@/core/sim/combat';
import { checkVictory } from '@/core/sim/victory';
import { runAiTurn } from '@/core/ai/ai';
import { travelMilliseconds } from '@/core/sim/path';

export const TICK_MS = 1000;

function advanceGroups(state: GameState, dtMs: number, rng: Rng): void {
  for (const [groupId, group] of Object.entries(state.groups)) {
    const movement = group.movement;
    if (!movement) continue;
    const country = state.countries[group.country];
    if (!country || !country.alive) {
      delete state.groups[groupId];
      continue;
    }

    if (movement.milliseconds <= 0) {
      const nextId = movement.path[movement.step];
      movement.milliseconds = nextId
        ? travelMilliseconds(state.world, group.territoryId, nextId, group.army, country)
        : TICK_MS;
    }

    movement.progress += dtMs;
    let guard = 0;
    while (group.movement && group.movement.progress >= group.movement.milliseconds && guard < 6) {
      guard += 1;
      const mv = group.movement;
      const nextId = mv.path[mv.step];
      if (!nextId) {
        delete state.groups[groupId];
        break;
      }
      group.territoryId = nextId;
      mv.progress = Math.max(0, mv.progress - Math.max(1, mv.milliseconds));

      if (mv.step >= mv.path.length - 1) {
        resolveArrival(state, groupId, rng);
        break;
      }
      mv.step += 1;
      const following = mv.path[mv.step];
      mv.milliseconds = following
        ? travelMilliseconds(state.world, group.territoryId, following, group.army, country)
        : TICK_MS;
    }
  }
}

function runAiPhases(state: GameState, rng: Rng): void {
  for (const ai of Object.values(state.ai)) {
    const country = state.countries[ai.country];
    if (!country || !country.alive || country.isPlayer) continue;
    if (state.tick < ai.nextThinkTick) continue;
    runAiTurn(state, ai.country, rng);
  }
}

/** Advances the simulation by one game tick (one second at ×1 speed). */
export function runTick(state: GameState, dtMs = TICK_MS): void {
  if (state.status !== 'playing') return;
  const rng = createRng(state.rngState);
  state.tick += 1;
  state.playedMs += dtMs;

  runEconomyTick(state);
  runProductionTick(state, dtMs / TICK_MS);
  advanceGroups(state, dtMs, rng);
  runAiPhases(state, rng);
  checkVictory(state);

  state.rngState = rng.getState();
}

/** Drives ticks in real time. Canvas-independent, so it also runs in tests. */
export class GameClock {
  private accumulator = 0;
  private state: GameState;

  constructor(state: GameState) {
    this.state = state;
  }

  setState(state: GameState): void {
    this.state = state;
    this.accumulator = 0;
  }

  /** Feeds real elapsed milliseconds; returns how many ticks were simulated. */
  advance(deltaMs: number): number {
    if (this.state.status !== 'playing') return 0;
    const speed = this.state.speed;
    if (speed === 0) return 0;
    const scaled = Math.min(deltaMs, 5000) * speed;
    this.accumulator += scaled;
    let ticks = 0;
    while (this.accumulator >= TICK_MS && ticks < 8) {
      this.accumulator -= TICK_MS;
      runTick(this.state, TICK_MS);
      ticks += 1;
      if (this.state.status !== 'playing') break;
    }
    this.state.tickProgressMs = this.accumulator;
    return ticks;
  }
}
