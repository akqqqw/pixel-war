import { describe, expect, it } from 'vitest';
import { createGame } from '@/core/state/createGame';
import {
  commandCancelProduction,
  commandDeclareWar,
  commandProposePeace,
  commandQueueUnit,
  commandSendArmy,
  commandUpgradeEconomy,
} from '@/core/sim/commands';
import { makeArmy, armyCount } from '@/core/units/army';
import { createRng } from '@/core/rng';
import { MAX_QUEUE_PER_TERRITORY } from '@/core/sim/production';
import { runTick } from '@/core/sim/simulation';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';

function newGame(seed = 777) {
  const game = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'easy' });
  const country = game.countries[game.playerCountryId]!;
  country.resources = { money: 4000, metal: 4000, oil: 4000, energy: 4000 };
  const capital = country.capitalTerritoryId!;
  return { game, country, capital };
}

describe('player commands', () => {
  it('rejects sending troops from foreign or empty territories', () => {
    const { game, country, capital } = newGame();
    const foreign = game.world.territories.find(
      (territory) => game.territories[territory.id]?.owner !== country.id,
    )!;
    expect(
      commandSendArmy(game, {
        countryId: country.id,
        from: foreign.id,
        to: capital,
        army: makeArmy({ mbt: 1 }),
      }).ok,
    ).toBe(false);
    game.territories[capital]!.garrison = {};
    expect(
      commandSendArmy(game, {
        countryId: country.id,
        from: capital,
        to: foreign.id,
        army: makeArmy({ mbt: 1 }),
      }).ok,
    ).toBe(false);
  });

  it('moves units out of the garrison into a marching group', () => {
    const { game, country, capital } = newGame();
    const capitalMeta = game.world.territories.find((territory) => territory.id === capital)!;
    const destination = game.world.territories.find((t) => t.id === capitalMeta.neighbors[0])!;
    expect(destination).toBeDefined();
    const garrisonBefore = armyCount(game.territories[capital]!.garrison);
    const army = makeArmy({ mbt: 1 });
    if ((game.territories[capital]!.garrison.mbt ?? 0) < 1) {
      game.territories[capital]!.garrison = makeArmy({ mbt: 2 });
    }
    const result = commandSendArmy(game, {
      countryId: country.id,
      from: capital,
      to: destination.id,
      army,
    });
    expect(result.ok).toBe(true);
    const groups = Object.values(game.groups);
    expect(groups).toHaveLength(1);
    expect(armyCount(groups[0]!.army)).toBe(1);
    expect(armyCount(game.territories[capital]!.garrison)).toBe(
      Math.max(2, garrisonBefore) - 1,
    );
    expect(groups[0]!.movement?.path[0]).toBe(capital);
  });

  it('validates production cost, queue limits and refunds', () => {
    const { game, country, capital } = newGame();
    const before = { ...country.resources };
    const result = commandQueueUnit(game, { countryId: country.id, territoryId: capital, unit: 'apc' });
    expect(result.ok).toBe(true);
    expect(country.resources.money).toBeLessThan(before.money);
    expect(game.production).toHaveLength(1);

    for (let i = 0; i < MAX_QUEUE_PER_TERRITORY + 1; i += 1) {
      commandQueueUnit(game, { countryId: country.id, territoryId: capital, unit: 'apc' });
    }
    expect(
      game.production.filter((item) => item.territoryId === capital).length,
    ).toBeLessThanOrEqual(MAX_QUEUE_PER_TERRITORY);

    const item = game.production[0]!;
    const moneyBeforeCancel = country.resources.money;
    commandCancelProduction(game, { countryId: country.id, itemId: item.id });
    expect(country.resources.money).toBeGreaterThan(moneyBeforeCancel);
    expect(game.production.find((entry) => entry.id === item.id)).toBeUndefined();

    country.resources = { money: 0, metal: 0, oil: 0, energy: 0 };
    expect(commandQueueUnit(game, { countryId: country.id, territoryId: capital, unit: 'mbt' }).ok).toBe(false);
  });

  it('produces finished units into the garrison', () => {
    const { game, country, capital } = newGame();
    const before = armyCount(game.territories[capital]!.garrison);
    commandQueueUnit(game, { countryId: country.id, territoryId: capital, unit: 'apc' });
    for (let i = 0; i < 12; i += 1) runTick(game);
    expect(armyCount(game.territories[capital]!.garrison)).toBeGreaterThan(before);
  });

  it('handles war and peace', () => {
    const { game, country } = newGame();
    const target = Object.values(game.countries).find((item) => item.id !== country.id)!;
    expect(commandDeclareWar(game, { countryId: country.id, target: target.id }).ok).toBe(true);
    expect(country.warWith).toContain(target.id);
    expect(target.warWith).toContain(country.id);
    expect(commandDeclareWar(game, { countryId: country.id, target: target.id }).ok).toBe(false);
    expect(armyCount({})).toBe(0);
    // Peace can be refused; force many attempts and require at least one success eventually.
    let peaceMade = false;
    for (let attempt = 0; attempt < 25 && !peaceMade; attempt += 1) {
      const result = commandProposePeace(
        game,
        { countryId: country.id, target: target.id },
        createRng(100 + attempt),
      );
      peaceMade = result.ok;
    }
    expect(peaceMade).toBe(true);
    expect(country.warWith).not.toContain(target.id);
  });

  it('upgrades only own territory with enough resources', () => {
    const { game, country } = newGame();
    const foreign = game.world.territories.find(
      (territory) => game.territories[territory.id]?.owner !== country.id,
    )!;
    expect(
      commandUpgradeEconomy(game, { countryId: country.id, territoryId: foreign.id }).ok,
    ).toBe(false);
    country.resources = { money: 0, metal: 0, oil: 0, energy: 0 };
    expect(
      commandUpgradeEconomy(game, {
        countryId: country.id,
        territoryId: country.capitalTerritoryId!,
      }).ok,
    ).toBe(false);
  });

  it('terrain modifies defence values', () => {
    const { game } = newGame();
    for (const territory of game.world.territories) {
      const terrain = TERRAIN_INFO[territory.dominantTerrain as TerrainCode];
      expect(terrain.defenseBonus).toBeGreaterThan(0);
    }
  });
});
