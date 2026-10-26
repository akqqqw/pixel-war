import { describe, expect, it } from 'vitest';
import { BALANCE, TICK_SECONDS } from '@/core/sim/balance';
import { TANK_COST, growRegion, produceHardware, runEconomyTick } from '@/core/sim/economy';
import {
  countryPopulation,
  populationCap,
  regionArmy,
  regionIncome,
  regionPopulationGrowth,
} from '@/core/sim/effects';
import { createGame } from '@/core/state/createGame';
import type { BuildingInstance } from '@/core/state/types';
import type { TerritoryId } from '@/core/types';

function setup(seed = 314) {
  const state = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const regionId = Object.values(state.regions).find((region) => region.owner === state.playerCountryId)!.id;
  return { state, regionId };
}

function building(kind: BuildingInstance['kind'], level = 1): BuildingInstance {
  return { id: `${kind}-test`, kind, level, cell: 0, regionId: 'test', readyAtTick: 0 };
}

describe('economy', () => {
  it('pays taxes from the population and charges the army upkeep', () => {
    const { state } = setup();
    const country = state.countries[state.playerCountryId]!;
    country.army = 0;
    runEconomyTick(state);
    const peaceful = country.income;

    country.army = 10_000;
    runEconomyTick(state);
    expect(country.income).toBeLessThan(peaceful);
    expect(peaceful - country.income).toBeCloseTo(10_000 * BALANCE.armyUpkeepPerSoldierPerSecond, 1);
  });

  it('grows the population up to the cap the cities allow', () => {
    const { state, regionId } = setup();
    const region = state.regions[regionId]!;
    region.buildings = [];
    region.population = 100;
    const before = region.population;
    growRegion(region);
    expect(region.population).toBeGreaterThan(before);

    region.buildings = [building('city', 1)];
    const withCity = populationCap(region);
    expect(withCity).toBeGreaterThan(BALANCE.basePopulationCap);
    expect(regionPopulationGrowth(region)).toBeGreaterThan(BALANCE.basePopulationGrowth);

    region.population = withCity;
    growRegion(region);
    expect(region.population).toBe(withCity);
  });

  it('counts factory income in the region and in the country treasury', () => {
    const { state, regionId } = setup();
    const region = state.regions[regionId]!;
    region.buildings = [building('factory', 1)];
    const income = regionIncome(region);
    expect(income).toBeGreaterThan(region.population * BALANCE.taxPerCitizenPerSecond);

    const country = state.countries[state.playerCountryId]!;
    country.army = 0;
    runEconomyTick(state);
    expect(country.income).toBeGreaterThan(0);
    expect(country.money).toBeGreaterThan(0);
  });

  it('never lets the treasury go negative', () => {
    const { state } = setup();
    const country = state.countries[state.playerCountryId]!;
    country.money = 0;
    country.army = 1_000_000;
    for (let i = 0; i < 10; i += 1) runEconomyTick(state);
    expect(country.money).toBeGreaterThanOrEqual(0);
    expect(country.unpaid).toBe(true);
  });

  it('builds tanks only when there is gold for them', () => {
    const { state, regionId } = setup();
    const country = state.countries[state.playerCountryId]!;
    const region = state.regions[regionId]!;
    region.buildings = [building('tankPlant', 1)];
    country.tanks = 0;
    country.money = 0;
    produceHardware(state, country.id);
    expect(country.tanks).toBe(0);

    country.money = TANK_COST * 10;
    for (let i = 0; i < 20; i += 1) {
      state.tick += 1;
      produceHardware(state, country.id);
    }
    expect(country.tanks).toBeGreaterThan(0);
    expect(country.money).toBeGreaterThanOrEqual(0);
  });

  it('sums the population of the owned regions', () => {
    const { state, regionId } = setup();
    state.regions[regionId]!.population = 1000;
    expect(countryPopulation(state, state.playerCountryId)).toBeGreaterThanOrEqual(1000);
    expect(regionArmy(state, regionId as TerritoryId)).toBeGreaterThan(0);
  });

  it('grows money over a second of ticks', () => {
    const { state } = setup();
    const country = state.countries[state.playerCountryId]!;
    country.army = 0;
    country.money = 500;
    for (let i = 0; i < Math.round(1 / TICK_SECONDS); i += 1) runEconomyTick(state);
    expect(country.money).toBeGreaterThan(500);
  });
});
