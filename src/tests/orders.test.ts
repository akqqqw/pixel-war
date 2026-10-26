import { describe, expect, it } from 'vitest';
import { resolveBattles } from '@/core/sim/battle';
import {
  activeOffensive,
  advanceOffensives,
  buildFlowField,
  retreatOffensive,
  startOffensive,
  stopOffensive,
} from '@/core/sim/orders';
import { createGame } from '@/core/state/createGame';
import type { GameState } from '@/core/state/types';
import { isLandCell } from '@/core/world/cells';

function setup(seed = 5150) {
  const state = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const player = state.playerCountryId;
  const playerIndex = state.countryOrder.indexOf(player);
  const width = state.world.width;
  let mine = -1;
  let target = -1;
  for (let cell = 0; cell < state.cellOwner.length && target < 0; cell += 1) {
    if ((state.cellOwner[cell] ?? -1) !== playerIndex) continue;
    const x = cell % width;
    const y = (cell / width) | 0;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= state.world.height) continue;
      const next = ny * width + nx;
      const owner = state.cellOwner[next] ?? -1;
      if (owner >= 0 && owner !== playerIndex && isLandCell(state.world, next)) {
        mine = cell;
        target = next;
        break;
      }
    }
  }
  if (mine < 0 || target < 0) throw new Error('no border found');
  const regionId = state.world.territories[state.world.tileTerritory[mine] ?? -1]!.id;
  return { state, player, playerIndex, mine, target, regionId };
}

function totalArmy(state: GameState, playerIndex: number): number {
  let total = 0;
  for (let cell = 0; cell < state.cellArmy.length; cell += 1) {
    if (state.cellOwner[cell] === playerIndex) total += state.cellArmy[cell] ?? 0;
  }
  return total;
}

describe('offensives', () => {
  it('starts only from own land and declares war automatically', () => {
    const { state, player, regionId, target, mine, playerIndex } = setup();
    expect(startOffensive(state, player, regionId, target, 0.5).ok).toBe(true);
    const enemy = state.countries[state.countryOrder[state.cellOwner[target]!]!]!;
    expect(state.countries[player]!.warWith).toContain(enemy.id);
    expect(activeOffensive(state, player)).not.toBeNull();
    expect(state.cellOwner[mine]).toBe(playerIndex);
  });

  it('marches soldiers to the front without duplicating them', () => {
    const { state, player, regionId, target, playerIndex } = setup();
    for (let cell = 0; cell < state.cellArmy.length; cell += 1) state.cellArmy[cell] = 0;
    // Spread troops over the region: they have to walk towards the border.
    const region = state.regions[regionId]!;
    const territory = state.world.territories.find((entry) => entry.id === region.id)!;
    const ownCells = territory.tiles.filter((cell) => (state.cellOwner[cell] ?? -1) === playerIndex);
    for (const cell of ownCells) state.cellArmy[cell] = 40;
    const before = totalArmy(state, playerIndex);
    expect(startOffensive(state, player, regionId, target, 1).ok).toBe(true);
    const order = activeOffensive(state, player)!;
    for (let i = 0; i < 5; i += 1) advanceOffensives(state);
    expect(order.delivered).toBeGreaterThan(0);
    expect(totalArmy(state, playerIndex)).toBeCloseTo(before, 0);
  });

  it('moves the same soldier only one cell per tick', () => {
    const { state, player, regionId, target, playerIndex } = setup();
    startOffensive(state, player, regionId, target, 1);
    expect(activeOffensive(state, player)).not.toBeNull();
    const dist = buildFlowField(state, playerIndex, target);
    let source = -1;
    for (let cell = 0; cell < dist.length; cell += 1) {
      if ((dist[cell] ?? -1) < 3) continue;
      if ((state.cellOwner[cell] ?? -1) !== playerIndex) continue;
      source = cell;
      break;
    }
    expect(source).toBeGreaterThanOrEqual(0);
    for (let cell = 0; cell < state.cellArmy.length; cell += 1) state.cellArmy[cell] = 0;
    state.cellArmy[source] = 100;
    const before = totalArmy(state, playerIndex);
    advanceOffensives(state);
    expect(state.cellArmy[source]).toBeLessThan(100);
    expect(state.cellArmy[source]).toBeGreaterThanOrEqual(100 * (1 - 0.5) - 0.2);
    expect(totalArmy(state, playerIndex)).toBeCloseTo(before, 0);
    // The soldier is now exactly one step closer to the front.
    let moved = -1;
    for (let cell = 0; cell < dist.length; cell += 1) {
      if ((state.cellOwner[cell] ?? -1) !== playerIndex) continue;
      if ((dist[cell] ?? -1) !== (dist[source] ?? -1) - 1) continue;
      if ((state.cellArmy[cell] ?? 0) > 0.1) moved = cell;
    }
    expect(moved).toBeGreaterThanOrEqual(0);
  });

  it('stops and retreats on command', () => {
    const { state, player, regionId, target } = setup();
    startOffensive(state, player, regionId, target, 0.5);
    expect(stopOffensive(state, player).ok).toBe(true);
    expect(activeOffensive(state, player)).toBeNull();

    startOffensive(state, player, regionId, target, 0.5);
    expect(retreatOffensive(state, player).ok).toBe(true);
    expect(activeOffensive(state, player)).toBeNull();
  });

  it('eventually captures ground when the push is fed', () => {
    const { state, player, regionId, target, playerIndex } = setup();
    for (let cell = 0; cell < state.cellArmy.length; cell += 1) state.cellArmy[cell] = 0;
    const region = state.regions[regionId]!;
    const territory = state.world.territories.find((entry) => entry.id === region.id)!;
    const ownCells = territory.tiles.filter((cell) => (state.cellOwner[cell] ?? -1) === playerIndex);
    for (const cell of ownCells) state.cellArmy[cell] = 200;
    startOffensive(state, player, regionId, target, 1);

    let captured = 0;
    for (let tick = 0; tick < 60; tick += 1) {
      state.tick += 1;
      advanceOffensives(state);
      captured += resolveBattles(state).captured.length;
    }
    expect(captured).toBeGreaterThan(0);
  });
});
