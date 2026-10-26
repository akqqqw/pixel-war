import { describe, expect, it } from 'vitest';
import { createGame } from '@/core/state/createGame';
import { commandSendArmy } from '@/core/sim/commands';
import { runTick } from '@/core/sim/simulation';
import { armyCount, makeArmy } from '@/core/units/army';
import { eliminateCountry } from '@/core/sim/combat';

function setup(seed = 8080) {
  const game = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'easy' });
  const playerId = game.playerCountryId;
  const player = game.countries[playerId]!;
  player.resources = { money: 9000, metal: 9000, oil: 9000, energy: 9000 };
  const own = game.world.territories.filter(
    (territory) => game.territories[territory.id]?.owner === playerId,
  );
  // Pick a hostile front-line territory so that own territory borders it.
  const target = game.world.territories.find(
    (territory) =>
      game.territories[territory.id]?.owner !== playerId &&
      territory.neighbors.some((neighbour) => game.territories[neighbour]?.owner === playerId),
  );
  expect(target).toBeDefined();
  const adjacentOwn = target!.neighbors.find(
    (neighbour) => game.territories[neighbour]?.owner === playerId,
  )!;
  expect(own.some((territory) => territory.id === adjacentOwn)).toBe(true);
  return { game, playerId, source: adjacentOwn, target: target! };
}

describe('territory capture', () => {
  it('takes an undefended territory without a battle', () => {
    const { game, playerId, source, target } = setup();
    game.territories[target.id]!.garrison = {};
    game.territories[source]!.garrison = makeArmy({ mbt: 2 });
    const army = makeArmy({ mbt: 2 });
    expect(commandSendArmy(game, { countryId: playerId, from: source, to: target.id, army }).ok).toBe(true);
    const before = game.battles.length;
    for (let i = 0; i < 120 && game.territories[target.id]!.owner !== playerId; i += 1) runTick(game);
    expect(game.territories[target.id]!.owner).toBe(playerId);
    expect(game.battles.length).toBe(before);
    expect(game.territories[target.id]!.unrest).toBeGreaterThan(0.9);
    expect(Object.values(game.groups)).toHaveLength(0);
    expect(armyCount(game.territories[target.id]!.garrison)).toBeGreaterThan(0);
  }, 20000);

  it('cannot capture a defended territory with a token force', () => {
    const { game, playerId, source, target } = setup(9090);
    game.territories[target.id]!.garrison = makeArmy({ mbt: 10, spg: 4 });
    game.territories[target.id]!.economyLevel = 3;
    game.territories[source]!.garrison = makeArmy({ apc: 1 });
    expect(
      commandSendArmy(game, { countryId: playerId, from: source, to: target.id, army: makeArmy({ apc: 1 }) }).ok,
    ).toBe(true);
    const originalOwner = game.territories[target.id]!.owner;
    for (let i = 0; i < 120; i += 1) runTick(game);
    expect(game.territories[target.id]!.owner).toBe(originalOwner);
    expect(game.battles.length).toBeGreaterThan(0);
    const report = game.battles.find((battle) => battle.territoryId === target.id);
    expect(report, 'battle report for the target territory').toBeDefined();
    expect(report!.outcome).toBe('defenderWin');
    expect(report!.attackerLosses).toBeTruthy();
  }, 20000);

  it('declares war automatically when troops arrive on a hostile border', () => {
    const { game, playerId, source, target } = setup(1234);
    const defenderId = game.territories[target.id]!.owner;
    game.territories[target.id]!.garrison = {};
    game.territories[source]!.garrison = makeArmy({ mbt: 1 });
    commandSendArmy(game, { countryId: playerId, from: source, to: target.id, army: makeArmy({ mbt: 1 }) });
    for (let i = 0; i < 120 && game.territories[target.id]!.owner !== playerId; i += 1) runTick(game);
    expect(game.countries[playerId]!.warWith).toContain(defenderId);
    expect(game.countries[defenderId]!.warWith).toContain(playerId);
  }, 20000);

  it('reassigns the capital and eliminates a country with no land left', () => {
    const game = createGame({ seed: 4321, playerCountryId: 'aquilonia', difficulty: 'easy' });
    const enemy = Object.values(game.countries).find((country) => !country.isPlayer)!;
    const enemyTerritories = game.world.territories.filter(
      (territory) => game.territories[territory.id]?.owner === enemy.id,
    );
    expect(enemyTerritories.length).toBeGreaterThan(2);
    const capitalId = enemy.capitalTerritoryId!;
    const playerId = game.playerCountryId;
    // Simulate capture of all enemy land via direct ownership transfer + eliminate.
    for (const territory of enemyTerritories) {
      game.territories[territory.id]!.owner = playerId;
      game.territories[territory.id]!.garrison = makeArmy({ apc: 1 });
    }
    eliminateCountry(game, enemy.id);
    const aliveTerritories = game.world.territories.filter(
      (territory) => game.territories[territory.id]!.owner === enemy.id,
    );
    expect(aliveTerritories).toHaveLength(0);
    expect(game.countries[enemy.id]!.alive).toBe(false);
    expect(game.countries[enemy.id]!.capitalTerritoryId).toBeNull();
    expect(capitalId).toBeTruthy();
    expect(game.territories[capitalId]!.owner).toBe(playerId);
  });
});
