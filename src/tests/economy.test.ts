import { describe, expect, it } from 'vitest';
import { BALANCE } from '@/core/sim/balance';
import { build, armyCap, maxRecruit, recruit } from '@/core/sim/actions';
import { countryTotals, growTerritory, runEconomyTick } from '@/core/sim/economy';
import { countryIncome, territoryIncome } from '@/core/sim/effects';
import { createGame } from '@/core/state/createGame';

function setup(seed = 202) {
  const game = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const playerId = game.playerCountryId;
  const owned = Object.values(game.territories).filter((t) => t.owner === playerId);
  const capital = game.territories[game.countries[playerId]!.capitalTerritoryId!]!;
  return { game, playerId, owned, capital };
}

describe('economy', () => {
  it('pays tax, charges upkeep and never goes negative', () => {
    const { game, playerId, owned } = setup();
    const country = game.countries[playerId]!;
    const before = country.money;
    const income = countryIncome(game, playerId);

    const army = countryTotals(game, playerId).army;
    const tax = owned.reduce((sum, territory) => sum + territoryIncome(game, territory), 0);
    expect(tax).toBeGreaterThan(0);
    expect(income).toBeCloseTo(tax - army * BALANCE.armyUpkeep, 1);

    runEconomyTick(game);
    expect(country.income).toBeCloseTo(income, 0);
    expect(country.money).toBeCloseTo(before + income, 0);
    expect(country.money).toBeGreaterThanOrEqual(0);
  });

  it('disbands the army when the treasury is empty', () => {
    const { game, playerId, capital } = setup();
    const country = game.countries[playerId]!;
    country.money = 0;
    // Unpayable upkeep: the whole army is far above what the treasury supports.
    for (const territory of Object.values(game.territories)) {
      if (territory.owner === playerId) territory.army = 2000;
    }
    const before = capital.army;
    runEconomyTick(game);
    expect(country.unpaid).toBe(true);
    expect(country.money).toBe(0);
    expect(capital.army).toBeLessThan(before);
  });

  it('grows population up to the territory capacity', () => {
    const { game, playerId, owned } = setup();
    const empty = owned.find((territory) => territory.buildings.length === 0)!;
    expect(empty).toBeTruthy();
    empty.population = 100;
    growTerritory(empty);
    expect(empty.population).toBeGreaterThan(100);

    empty.population = BALANCE.basePopulationCap;
    growTerritory(empty);
    expect(empty.population).toBe(BALANCE.basePopulationCap);

    // A city raises the ceiling.
    game.countries[playerId]!.money = 10_000;
    expect(build(game, playerId, empty.id, 'city').ok).toBe(true);
    for (let i = 0; i < 50; i += 1) growTerritory(empty);
    expect(empty.population).toBeGreaterThan(BALANCE.basePopulationCap);
  });

  it('recruits only from own population and never exceeds the cap', () => {
    const { game, playerId, capital } = setup();
    const country = game.countries[playerId]!;
    country.money = 10_000;
    const cap = armyCap(capital);
    expect(cap).toBeGreaterThan(0);

    const available = maxRecruit(game, capital.id);
    expect(available).toBeGreaterThan(0);
    const armyBefore = capital.army;
    const popBefore = capital.population;
    const moneyBefore = country.money;

    expect(recruit(game, playerId, capital.id, available).ok).toBe(true);
    expect(capital.army).toBeCloseTo(armyBefore + available, 1);
    expect(capital.population).toBeCloseTo(popBefore - available * BALANCE.populationPerArmy, 1);
    expect(country.money).toBeCloseTo(moneyBefore - available * BALANCE.recruitCost, 1);
    expect(capital.army).toBeLessThanOrEqual(cap + 1e-6);
    expect(maxRecruit(game, capital.id)).toBe(0);
    expect(recruit(game, playerId, capital.id, 1).ok).toBe(false);
  });

  it('forbids recruiting outside the country', () => {
    const { game, playerId } = setup();
    const foreign = Object.values(game.territories).find((t) => t.owner !== playerId)!;
    expect(recruit(game, playerId, foreign.id, 1).ok).toBe(false);
    expect(foreign.army).toBeGreaterThan(0);
  });

  it('does not allow armies above the population cap to be kept', () => {
    const { game, capital } = setup();
    capital.population = 100;
    capital.army = 999;
    expect(armyCap(capital)).toBe(Math.floor(100 * BALANCE.armyCapRatio));
    const { game: game2, playerId } = setup();
    const territory = Object.values(game2.territories).find((t) => t.owner === playerId)!;
    territory.population = 100;
    territory.army = 999;
    expect(maxRecruit(game2, territory.id)).toBe(0);
    expect(game.world.territories.length).toBeGreaterThan(0);
  });

  it('keeps every resource of every country valid over a long run', () => {
    const { game } = setup(555);
    for (let tick = 0; tick < 120; tick += 1) {
      runEconomyTick(game);
      for (const territory of Object.values(game.territories)) {
        expect(territory.population).toBeGreaterThan(0);
        expect(territory.army).toBeGreaterThanOrEqual(0);
      }
      for (const country of Object.values(game.countries)) {
        expect(country.money).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
