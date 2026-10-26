import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/core/sim/balance';
import { resolveBattles } from '@/core/sim/battle';
import { declareWar } from '@/core/sim/diplomacy';
import { cellDefense, regionArmy, regionArmyOf } from '@/core/sim/effects';
import { createGame } from '@/core/state/createGame';
import type { GameState } from '@/core/state/types';
import { isLandCell } from '@/core/world/cells';

function setup(seed = 4242) {
  const state = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const player = state.playerCountryId;
  const enemy = Object.values(state.countries).find((entry) => !entry.isPlayer)!.id;
  declareWar(state, player, enemy);
  const playerIndex = state.countryOrder.indexOf(player);
  const enemyIndex = state.countryOrder.indexOf(enemy);
  const width = state.world.width;

  // A player cell touching an enemy cell, both on land.
  let pair: { mine: number; theirs: number } | null = null;
  for (let cell = 0; cell < state.cellOwner.length && !pair; cell += 1) {
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
      if ((state.cellOwner[next] ?? -1) === enemyIndex) {
        pair = { mine: cell, theirs: next };
        break;
      }
    }
  }
  if (!pair) throw new Error('no border found');
  return { state, player, enemy, playerIndex, enemyIndex, pair };
}

function clearArmy(state: GameState, except: number[] = []): void {
  for (let cell = 0; cell < state.cellArmy.length; cell += 1) {
    if (except.includes(cell)) continue;
    state.cellArmy[cell] = 0;
  }
}

describe('cell battles', () => {
  it('captures a cell only when the attack clearly beats the defence', () => {
    const { state, pair } = setup();
    clearArmy(state);
    const defence = cellDefense(state, pair.theirs);
    // Barely enough to fight, far from enough to win.
    state.cellArmy[pair.mine] = Math.max(0.5, (defence * 0.2) / BALANCE.attackCommitShare);
    resolveBattles(state);
    expect(state.cellOwner[pair.theirs]).not.toBe(state.cellOwner[pair.mine]);

    state.cellArmy[pair.mine] = (defence * 4) / BALANCE.attackCommitShare;
    resolveBattles(state);
    expect(state.cellOwner[pair.theirs]).toBe(state.cellOwner[pair.mine]);
  });

  it('uses only the soldiers standing at the border', () => {
    const { state, pair, playerIndex } = setup();
    clearArmy(state);
    state.cellArmy[pair.mine] = 1;
    let far = -1;
    for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
      if (cell === pair.mine) continue;
      if ((state.cellOwner[cell] ?? -1) !== playerIndex) continue;
      if (state.world.tileTerritory[cell] === undefined) continue;
      far = cell;
    }
    expect(far).toBeGreaterThanOrEqual(0);
    state.cellArmy[far] = 100_000;
    resolveBattles(state);
    expect(state.cellOwner[pair.theirs]).not.toBe(playerIndex);
    expect(state.cellArmy[far]).toBe(100_000);
  });

  it('does not fight without a war', () => {
    const { state, pair, enemy, player } = setup();
    clearArmy(state);
    state.countries[player]!.warWith = state.countries[player]!.warWith.filter((id) => id !== enemy);
    state.countries[enemy]!.warWith = state.countries[enemy]!.warWith.filter((id) => id !== player);
    state.cellArmy[pair.mine] = 10_000;
    state.cellArmy[pair.theirs] = 0;
    const result = resolveBattles(state);
    expect(result.captured).toHaveLength(0);
    expect(state.cellOwner[pair.theirs]).not.toBe(state.cellOwner[pair.mine]);
  });

  it('never gives water to a country', () => {
    const { state } = setup();
    resolveBattles(state);
    for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
      if (isLandCell(state.world, cell)) continue;
      expect(state.cellOwner[cell]).toBe(-1);
    }
  });

  it('keeps the map consistent: one snapshot per tick', () => {
    const { state } = setup();
    for (let cell = 0; cell < state.cellArmy.length; cell += 1) {
      state.cellArmy[cell] = 30;
    }
    resolveBattles(state);
    for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
      const owner = state.cellOwner[cell] ?? -1;
      if (owner < 0) continue;
      expect(state.countryOrder[owner]).toBeTruthy();
      expect(state.cellArmy[cell]).toBeGreaterThanOrEqual(0);
    }
  });

  it('counts only the own soldiers of a contested region', () => {
    const { state, pair, player, playerIndex } = setup();
    clearArmy(state);
    state.cellArmy[pair.mine] = 120;
    state.cellArmy[pair.theirs] = 80;
    const regionId = state.world.territories[state.world.tileTerritory[pair.mine] ?? -1]!.id;
    const otherRegion = state.world.territories[state.world.tileTerritory[pair.theirs] ?? -1]!.id;
    if (regionId !== otherRegion) {
      expect(regionArmy(state, regionId)).toBeGreaterThanOrEqual(120);
      expect(regionArmyOf(state, regionId, player)).toBe(120);
    }
    expect(regionArmyOf(state, regionId, player)).toBeLessThan(regionArmy(state, regionId) + 1);
    expect(regionArmyOf(state, regionId, state.countryOrder[state.cellOwner[pair.theirs]!]!)).toBeGreaterThanOrEqual(0);
    expect(playerIndex).toBeGreaterThanOrEqual(0);
  });

  it('does not let one cell attack two neighbours with the same soldiers', () => {
    const { state, pair, playerIndex } = setup();
    clearArmy(state);
    const enemyOwner = state.cellOwner[pair.theirs]!;
    state.cellArmy[pair.mine] = (cellDefense(state, pair.theirs) + 20) / BALANCE.attackCommitShare;
    const before = state.cellArmy[pair.mine]!;
    resolveBattles(state);
    const total = state.cellArmy[pair.mine]! + state.cellArmy[pair.theirs]!;
    expect(state.cellOwner[pair.theirs] === playerIndex || state.cellOwner[pair.theirs] === enemyOwner).toBe(true);
    expect(total).toBeLessThanOrEqual(before + 1e-6);
  });
});

describe('frontline feedback', () => {
  it('reports the cells that actually fought', () => {
    const { state, pair } = setup();
    clearArmy(state);
    state.cellArmy[pair.mine] = (cellDefense(state, pair.theirs) + 40) / BALANCE.attackCommitShare;
    const result = resolveBattles(state);
    expect(result.fights).toBeGreaterThan(0);
    expect(state.lastFights).toContain(pair.theirs);
    expect(state.lastFights.length).toBeLessThanOrEqual(160);
  });

  it('clears the fight list when nobody is at war', () => {
    const { state, player, enemy } = setup();
    state.countries[player]!.warWith = [];
    state.countries[enemy]!.warWith = [];
    for (let cell = 0; cell < state.cellArmy.length; cell += 1) state.cellArmy[cell] = 50;
    resolveBattles(state);
    expect(state.lastFights).toHaveLength(0);
  });
});

describe('map version', () => {
  it('bumps only when a cell really changes hands', () => {
    const { state, pair } = setup();
    clearArmy(state);
    const before = state.mapVersion;
    state.cellArmy[pair.mine] = 0;
    resolveBattles(state);
    expect(state.mapVersion).toBe(before);

    state.cellArmy[pair.mine] = (cellDefense(state, pair.theirs) + 40) / BALANCE.attackCommitShare;
    resolveBattles(state);
    expect(state.mapVersion).toBe(before + 1);
  });
});
