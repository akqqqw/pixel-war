import { describe, expect, it } from 'vitest';
import { createGame } from '@/core/state/createGame';
import { computeEconomy, runEconomyTick, territoryYield, UNREST_DURATION_TICKS } from '@/core/economy/economy';
import { makeArmy } from '@/core/units/army';
import { RESOURCE_KEYS } from '@/core/types';
import { commandUpgradeEconomy } from '@/core/sim/commands';

function newGame() {
  return createGame({ seed: 4242, playerCountryId: 'aquilonia', difficulty: 'normal' });
}

describe('economy', () => {
  it('produces income from owned territories and charges upkeep', () => {
    const game = newGame();
    const breakdown = computeEconomy(game.world, game, game.playerCountryId);
    expect(breakdown.territoryCount).toBeGreaterThan(5);
    for (const key of RESOURCE_KEYS) {
      expect(breakdown.gross[key]).toBeGreaterThan(0);
      expect(Number.isFinite(breakdown.net[key])).toBe(true);
    }
    expect(breakdown.upkeep.money).toBeGreaterThan(0);
  });

  it('never allows negative resources and flags deficits', () => {
    const game = newGame();
    const country = game.countries[game.playerCountryId]!;
    country.resources = { money: 0, metal: 0, oil: 0, energy: 0 };
    const capital = country.capitalTerritoryId!;
    game.territories[capital]!.garrison = makeArmy({ mbt: 40, spg: 20, mlrs: 10 });
    for (let i = 0; i < 10; i += 1) runEconomyTick(game);
    for (const key of RESOURCE_KEYS) {
      expect(country.resources[key]).toBeGreaterThanOrEqual(0);
    }
    expect(country.deficit.money || country.deficit.oil).toBe(true);
  });

  it('economy upgrades raise yields and reduce unrest over time', () => {
    const game = newGame();
    const capital = game.countries[game.playerCountryId]!.capitalTerritoryId!;
    const state = game.territories[capital]!;
    const territory = game.world.territories.find((item) => item.id === capital)!;
    const before = territoryYield(territory, state, true);
    const country = game.countries[game.playerCountryId]!;
    country.resources = { money: 5000, metal: 5000, oil: 5000, energy: 5000 };
    const result = commandUpgradeEconomy(game, { countryId: country.id, territoryId: capital });
    expect(result.ok).toBe(true);
    const after = territoryYield(territory, state, true);
    expect(after.money).toBeGreaterThan(before.money);

    state.unrest = 1;
    for (let i = 0; i < UNREST_DURATION_TICKS; i += 1) runEconomyTick(game);
    expect(state.unrest).toBeLessThan(0.1);

    // Upgrades are capped.
    state.economyLevel = 3;
    expect(commandUpgradeEconomy(game, { countryId: country.id, territoryId: capital }).ok).toBe(false);
  });

  it('unrest reduces production of a freshly conquered territory', () => {
    const game = newGame();
    const capital = game.countries[game.playerCountryId]!.capitalTerritoryId!;
    const state = game.territories[capital]!;
    const territory = game.world.territories.find((item) => item.id === capital)!;
    state.unrest = 1;
    const troubled = territoryYield(territory, state, true);
    state.unrest = 0;
    const calm = territoryYield(territory, state, true);
    expect(troubled.money).toBeLessThan(calm.money);
  });
});
