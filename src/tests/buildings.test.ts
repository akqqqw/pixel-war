import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  BUILDING_KINDS,
  TAB_LABELS,
  TAB_ORDER,
  buildingEffect,
  buildingsOfTab,
} from '@/core/buildings/buildings';
import { build, buildBlocker, demolishBuilding, upgradeBuilding } from '@/core/sim/actions';
import { countBuildings, regionArmy } from '@/core/sim/effects';
import { mobilize, mobilizeMax } from '@/core/sim/army';
import { isCoastalCell } from '@/core/world/cells';
import { createGame } from '@/core/state/createGame';

function setup(seed = 314) {
  const state = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const region = Object.values(state.regions).find((entry) => entry.owner === state.playerCountryId)!;
  const territory = state.world.territories.find((entry) => entry.id === region.id)!;
  const country = state.countries[state.playerCountryId]!;
  country.money = 50_000;
  return { state, region, territory, country };
}

function freeCell(state: ReturnType<typeof setup>['state'], regionId: string): number {
  const territory = state.world.territories.find((entry) => entry.id === regionId)!;
  const used = new Set(state.regions[regionId]!.buildings.map((entry) => entry.cell));
  const cell = territory.tiles.find((tile) => !used.has(tile) && (state.cellOwner[tile] ?? -1) >= 0);
  if (cell === undefined) throw new Error('no free cell');
  return cell;
}

describe('buildings', () => {
  it('defines the eight structures in three tabs', () => {
    expect(BUILDING_KINDS).toHaveLength(8);
    expect(TAB_ORDER).toEqual(['economy', 'weapons', 'security']);
    expect(TAB_LABELS.economy).toBe('Экономика');
    for (const kind of BUILDING_KINDS) {
      expect(BUILDINGS[kind].cost).toBeGreaterThan(0);
      expect(buildingEffect(kind).length).toBeGreaterThan(0);
      expect(buildingsOfTab(BUILDINGS[kind].tab)).toContain(BUILDINGS[kind]);
    }
  });

  it('builds on an own cell and charges the price', () => {
    const { state, region, country } = setup();
    const cell = freeCell(state, region.id);
    const before = country.money;
    const result = build(state, country.id, region.id, 'factory', cell);
    expect(result.ok).toBe(true);
    expect(country.money).toBeCloseTo(before - BUILDINGS.factory.cost, 1);
    expect(countBuildings(region, 'factory')).toBe(1);
  });

  it('refuses foreign cells, occupied cells, water and an empty treasury', () => {
    const { state, region, country, territory } = setup();
    const cell = freeCell(state, region.id);
    expect(build(state, country.id, region.id, 'factory', cell).ok).toBe(true);
    // occupied
    expect(build(state, country.id, region.id, 'city', cell).ok).toBe(false);
    // foreign country cannot build there
    const foreign = Object.values(state.countries).find((entry) => entry.id !== country.id)!;
    expect(build(state, foreign.id, region.id, 'factory', freeCell(state, region.id)).ok).toBe(false);
    // water
    const water = Array.from({ length: state.world.width * state.world.height }, (_, index) => index).find(
      (index) => (state.world.tileTerritory[index] ?? -1) < 0,
    )!;
    expect(build(state, country.id, region.id, 'factory', water).ok).toBe(false);
    // no money
    country.money = 10;
    const other = territory.tiles.find(
      (tile) => !region.buildings.some((entry) => entry.cell === tile) && (state.cellOwner[tile] ?? -1) >= 0,
    )!;
    expect(buildBlocker(state, country.id, region.id, 'city', other)).toBeTruthy();
  });

  it('places a port only next to water', () => {
    const { state, region, country } = setup();
    const inland = freeCell(state, region.id);
    if (!isCoastalCell(state.world, inland)) {
      expect(build(state, country.id, region.id, 'port', inland).ok).toBe(false);
    }
    const coast = state.world.territories
      .find((entry) => entry.id === region.id)!
      .tiles.find((tile) => isCoastalCell(state.world, tile) && !region.buildings.some((b) => b.cell === tile));
    if (coast !== undefined) {
      expect(build(state, country.id, region.id, 'port', coast).ok).toBe(true);
    }
  });

  it('upgrades a structure and respects the level cap', () => {
    const { state, region, country } = setup();
    const cell = freeCell(state, region.id);
    build(state, country.id, region.id, 'factory', cell);
    const factory = region.buildings[0]!;
    country.money = 100_000;
    expect(upgradeBuilding(state, country.id, factory.id).ok).toBe(true);
    expect(factory.level).toBe(2);
    while (factory.level < BUILDINGS.factory.maxLevel) {
      expect(upgradeBuilding(state, country.id, factory.id).ok).toBe(true);
    }
    expect(upgradeBuilding(state, country.id, factory.id).ok).toBe(false);
  });

  it('removes a structure and gives a small refund', () => {
    const { state, region, country } = setup();
    const cell = freeCell(state, region.id);
    build(state, country.id, region.id, 'barricade', cell);
    const barricade = region.buildings[0]!;
    const before = country.money;
    expect(demolishBuilding(state, country.id, barricade.id).ok).toBe(true);
    expect(country.money).toBeGreaterThan(before);
    expect(region.buildings).toHaveLength(0);
  });

  it('limits the amount of structures per region', () => {
    const { state, region, country } = setup();
    for (let i = 0; i < BUILDINGS.factory.limit; i += 1) {
      expect(build(state, country.id, region.id, 'factory', freeCell(state, region.id)).ok).toBe(true);
    }
    expect(build(state, country.id, region.id, 'factory', freeCell(state, region.id)).ok).toBe(false);
    expect(countBuildings(region, 'factory')).toBe(BUILDINGS.factory.limit);
  });

  it('mobilises people into soldiers for gold, no more than the region allows', () => {
    const { state, region, country } = setup();
    region.population = 800;
    region.lastMobilizeTick = -99;
    const territory = state.world.territories.find((entry) => entry.id === region.id)!;
    for (const cell of territory.tiles) state.cellArmy[cell] = 0;
    state.tick = 1000;
    const max = mobilizeMax(state, country.id, region.id);
    expect(max).toBeGreaterThan(0);
    const soldiersBefore = regionArmy(state, region.id);
    const moneyBefore = country.money;
    const result = mobilize(state, country.id, region.id, max);
    expect(result.ok).toBe(true);
    expect(regionArmy(state, region.id)).toBeGreaterThan(soldiersBefore);
    expect(country.money).toBeLessThan(moneyBefore);
    expect(region.population).toBeLessThan(800);
    // second call without a new tick is blocked by the cooldown
    expect(mobilize(state, country.id, region.id, 1).ok).toBe(false);
  });
});
