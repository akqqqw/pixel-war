import { describe, expect, it } from 'vitest';
import { BUILDINGS, buildingRadius } from '@/core/buildings/buildings';
import { build } from '@/core/sim/actions';
import { declareWar } from '@/core/sim/diplomacy';
import { BALANCE } from '@/core/sim/balance';
import { cellRadiusDistance } from '@/core/world/cells';
import { createGame } from '@/core/state/createGame';
import type { BuildingInstance, GameState } from '@/core/state/types';
import { findBuilding, fireMissile, interceptChance, launchAirStrike, resolveStrikes } from '@/core/sim/strikes';

function setup(seed = 8181) {
  const state = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const player = state.playerCountryId;
  const enemy = Object.values(state.countries).find((entry) => !entry.isPlayer)!.id;
  for (const rival of Object.values(state.countries)) {
    if (!rival.isPlayer) declareWar(state, player, rival.id);
  }
  const country = state.countries[player]!;
  country.money = 100_000;
  const region = Object.values(state.regions).find((entry) => entry.owner === player)!;
  const territory = state.world.territories.find((entry) => entry.id === region.id)!;
  const used = new Set(region.buildings.map((building) => building.cell));
  const ownCells = territory.tiles.filter(
    (cell) => (state.cellOwner[cell] ?? -1) === state.countryOrder.indexOf(player) && !used.has(cell),
  );
  expect(ownCells.length).toBeGreaterThan(1);
  return { state, player, enemy, country, region, ownCells };
}

function place(state: GameState, player: string, regionId: string, kind: 'missile' | 'airfield', cell: number): BuildingInstance {
  const result = build(state, player, regionId, kind, cell);
  expect(result.ok).toBe(true);
  const region = state.regions[regionId]!;
  const building = region.buildings.find((entry) => entry.kind === kind)!;
  return building;
}

function enemyCellNear(state: GameState, from: number, radius: number, inside: boolean): number {
  const playerIndex = state.countryOrder.indexOf(state.playerCountryId);
  let fallback = -1;
  for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
    const owner = state.cellOwner[cell] ?? -1;
    if (owner < 0 || owner === playerIndex) continue;
    const distance = cellRadiusDistance(state.world, from, cell);
    if (inside && distance <= radius) return cell;
    if (!inside && distance > radius + 2 && fallback < 0) fallback = cell;
  }
  return fallback;
}

describe('weapons', () => {
  it('fires a missile inside the radius and reloads afterwards', () => {
    const { state, player, region, ownCells } = setup();
    const building = place(state, player, region.id, 'missile', ownCells[0]!);
    const radius = buildingRadius('missile', 1);
    const target = enemyCellNear(state, building.cell, radius, true);
    expect(target).toBeGreaterThanOrEqual(0);
    const armyBefore = state.cellArmy[target] ?? 0;
    expect(fireMissile(state, player, building.id, target).ok).toBe(true);
    expect(building.readyAtTick).toBeGreaterThan(state.tick);

    state.tick += 3;
    resolveStrikes(state);
    expect(state.cellArmy[target] ?? 0).toBeLessThanOrEqual(Math.max(0, armyBefore));

    const again = fireMissile(state, player, building.id, target);
    if (state.tick < building.readyAtTick) expect(again.ok).toBe(false);
  });

  it('refuses targets outside the radius and without a war', () => {
    const { state, player, region, ownCells } = setup();
    const building = place(state, player, region.id, 'missile', ownCells[0]!);
    const radius = buildingRadius('missile', 1);
    const far = enemyCellNear(state, building.cell, radius, false);
    if (far >= 0) expect(fireMissile(state, player, building.id, far).ok).toBe(false);
    const own = ownCells[1] ?? ownCells[0]!;
    expect(fireMissile(state, player, building.id, own).ok).toBe(false);
  });

  it('needs aircraft for an air strike and spends one', () => {
    const { state, player, country, region, ownCells } = setup();
    const building = place(state, player, region.id, 'airfield', ownCells[0]!);
    const target = enemyCellNear(state, building.cell, buildingRadius('airfield', 1), true);
    expect(target).toBeGreaterThanOrEqual(0);
    country.aircraft = 0;
    expect(launchAirStrike(state, player, building.id, target).ok).toBe(false);
    country.aircraft = 2;
    expect(launchAirStrike(state, player, building.id, target).ok).toBe(true);
    expect(country.aircraft).toBe(1);
  });

  it('lets AA cover combined radii and caps interception', () => {
    const { state, region } = setup();
    const regionState = state.regions[region.id]!;
    const aa = regionState.buildings.find((building) => building.kind === 'aa');
    if (!aa) return;
    const cell = aa.cell;
    state.cellAir[cell] = 0.5;
    expect(interceptChance(state, cell)).toBeCloseTo(0.5, 3);
    state.cellAir[cell] = 0.95;
    expect(interceptChance(state, cell)).toBeCloseTo(BALANCE.maxInterceptChance, 3);
    const def = BUILDINGS.aa;
    expect(def.intercept).toBeGreaterThan(0);
  });

  it('reduces air damage where AA covers the target', () => {
    const { state, player, country, region, ownCells } = setup();
    const building = place(state, player, region.id, 'airfield', ownCells[0]!);
    const target = enemyCellNear(state, building.cell, buildingRadius('airfield', 1), true);
    expect(target).toBeGreaterThanOrEqual(0);
    country.aircraft = 5;
    state.cellArmy[target] = 400;

    state.cellAir[target] = 0;
    launchAirStrike(state, player, building.id, target);
    state.tick += 3;
    resolveStrikes(state);
    const withoutAa = 400 - (state.cellArmy[target] ?? 0);

    state.cellArmy[target] = 400;
    state.cellAir[target] = 0.7;
    building.readyAtTick = state.tick;
    expect(launchAirStrike(state, player, building.id, target).ok).toBe(true);
    state.tick += 3;
    resolveStrikes(state);
    const withAa = 400 - (state.cellArmy[target] ?? 0);

    expect(withoutAa).toBeGreaterThan(0);
    expect(withAa).toBeLessThan(withoutAa);
    expect(findBuilding(state, building.id)).not.toBeNull();
  });
});
