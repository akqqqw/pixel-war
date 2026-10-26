import { describe, expect, it } from 'vitest';
import { declareWar, makePeace } from '@/core/sim/actions';
import { defenseStrength } from '@/core/sim/effects';
import { stepFrontline, transferTerritory } from '@/core/sim/frontline';
import { BALANCE } from '@/core/sim/balance';
import { createGame } from '@/core/state/createGame';

function borderPair(seed = 4242) {
  const game = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const playerId = game.playerCountryId;
  const sourceStatic = game.world.territories.find(
    (t) => t.id === game.countries[playerId]!.capitalTerritoryId,
  )!;
  const targetId = sourceStatic.neighbors.find((id) => game.territories[id]!.owner !== playerId)!;
  const targetStatic = game.world.territories.find((t) => t.id === targetId)!;
  const target = game.territories[targetId]!;
  return { game, playerId, sourceId: sourceStatic.id, targetId, targetStatic, target, enemyId: target.owner! };
}

function tilesOf(game: ReturnType<typeof createGame>, territoryId: string, owner: string): number {
  const staticTerritory = game.world.territories.find((t) => t.id === territoryId)!;
  const index = game.countryOrder.indexOf(owner);
  return staticTerritory.tiles.filter((tile) => game.tileOwner[tile] === index).length;
}

describe('Game-of-Life frontline', () => {
  it('never converts cells in peacetime', () => {
    const { game, playerId, sourceId, targetId, target } = borderPair();
    game.territories[sourceId]!.army = 5000;
    target.army = 0;
    const before = Int16Array.from(game.tileOwner);
    for (let i = 0; i < 10; i += 1) expect(stepFrontline(game).flips).toBe(0);
    expect(Array.from(game.tileOwner)).toEqual(Array.from(before));
    expect(game.territories[targetId]!.owner).not.toBe(playerId);
  });

  it('does nothing when the defender is stronger', () => {
    const { game, playerId, sourceId, targetId, target, targetStatic, enemyId } = borderPair();
    declareWar(game, playerId, enemyId);
    game.territories[sourceId]!.army = 20;
    target.population = 5000;
    target.army = 600;
    expect(defenseStrength(game, targetId)).toBeGreaterThan(20);

    const playerIndex = game.countryOrder.indexOf(playerId);
    for (let i = 0; i < 15; i += 1) {
      stepFrontline(game);
      const taken = targetStatic.tiles.filter((tile) => game.tileOwner[tile] === playerIndex).length;
      expect(taken).toBe(0);
    }
    expect(target.owner).toBe(enemyId);
  });

  it('converts a border cell only through a legal neighbour birth', () => {
    const { game, playerId, sourceId, targetId, enemyId } = borderPair();
    declareWar(game, playerId, enemyId);
    game.territories[sourceId]!.army = 4000;
    game.territories[targetId]!.population = 40;
    game.territories[targetId]!.army = 0;
    const playerIndex = game.countryOrder.indexOf(playerId);
    const enemyIndex = game.countryOrder.indexOf(enemyId);
    const attackers = game.world.territories.find((t) => t.id === targetId)!.neighbors.filter(
      (id) => game.territories[id]!.owner === playerId,
    ).length;
    const before = Int16Array.from(game.tileOwner);
    const result = stepFrontline(game);
    expect(result.flips).toBeGreaterThan(0);

    const width = game.world.width;
    const height = game.world.height;
    const tiles = game.world.territories.find((t) => t.id === targetId)!.tiles;
    const insideTarget = tiles.filter((tile) => before[tile] !== game.tileOwner[tile]).length;
    expect(insideTarget).toBeGreaterThan(0);
    expect(insideTarget).toBeLessThanOrEqual(BALANCE.maxFlipsPerBorder * attackers);
    let checked = 0;
    for (const tile of tiles) {
      if (before[tile] === playerIndex) continue;
      if (game.tileOwner[tile] !== playerIndex) continue;
      checked += 1;
      const x = tile % width;
      const y = Math.floor(tile / width);
      let friends = 0;
      const foreign = new Map<number, number>();
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const neighbour = ny * width + nx;
          if ((game.world.tileTerritory[neighbour] ?? -1) < 0) continue;
          const owner = before[neighbour]!;
          if (owner === playerIndex) friends += 1;
          else if (owner >= 0) foreign.set(owner, (foreign.get(owner) ?? 0) + 1);
        }
      }
      const best = Math.max(0, ...foreign.values());
      const birth = best >= 3;
      const starved = friends <= 1 && best >= 2;
      expect(birth || starved).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
    expect(game.tileOwner.some((owner) => owner === enemyIndex)).toBe(true);
  });

  it('captures a territory once the majority of its cells are taken', () => {
    const { game, playerId, sourceId, targetId, target, targetStatic, enemyId } = borderPair();
    declareWar(game, playerId, enemyId);
    game.territories[sourceId]!.army = 6000;
    target.population = 20;
    target.army = 0;

    let ticks = 0;
    while (target.owner !== playerId && ticks < 400) {
      stepFrontline(game);
      ticks += 1;
    }
    expect(target.owner).toBe(playerId);
    expect(ticks).toBeGreaterThan(10);
    expect(ticks).toBeLessThan(400);
    expect(tilesOf(game, targetId, playerId)).toBe(targetStatic.tiles.length);
    expect(game.countries[playerId]!.stats.captured).toBe(1);
    expect(game.countries[enemyId]!.stats.lost).toBe(1);
    expect(game.events.some((event) => event.kind === 'capture')).toBe(true);
    expect(target.army).toBeGreaterThan(0);
  });

  it('pauses the push while the war is over', () => {
    const { game, playerId, sourceId, targetId, target, enemyId } = borderPair();
    declareWar(game, playerId, enemyId);
    game.territories[sourceId]!.army = 6000;
    target.population = 20;
    target.army = 0;
    stepFrontline(game);
    const ownerAfterFirst = tilesOf(game, targetId, playerId);
    expect(ownerAfterFirst).toBeGreaterThan(0);
    makePeace(game, playerId, enemyId);
    const before = Array.from(game.tileOwner);
    stepFrontline(game);
    expect(Array.from(game.tileOwner)).toEqual(before);
  });

  it('transfers garrisons, destroys half the structures and moves the capital', () => {
    const { game, playerId, targetId, target, enemyId } = borderPair();
    const capitalBefore = game.countries[enemyId]!.capitalTerritoryId;
    target.buildings = [
      { id: 'x1', kind: 'factory', tile: 0 },
      { id: 'x2', kind: 'city', tile: 0 },
      { id: 'x3', kind: 'barricade', tile: 0 },
      { id: 'x4', kind: 'port', tile: 0 },
    ];
    target.population = 1000;
    const populationBefore = target.population;

    expect(transferTerritory(game, targetId, playerId)).toBe(true);
    expect(target.owner).toBe(playerId);
    expect(target.buildings).toHaveLength(2);
    expect(target.population).toBeCloseTo(populationBefore * 0.85, 0);
    if (capitalBefore === targetId) {
      expect(game.countries[enemyId]!.capitalTerritoryId).not.toBe(targetId);
    }
  });

  it('eliminates a country that loses its last territory', () => {
    const { game, playerId, targetId, enemyId } = borderPair();
    for (const territory of Object.values(game.territories)) {
      if (territory.owner === enemyId && territory.id !== targetId) {
        transferTerritory(game, territory.id, playerId);
      }
    }
    expect(game.countries[enemyId]!.alive).toBe(true);
    transferTerritory(game, targetId, playerId);
    expect(game.countries[enemyId]!.alive).toBe(false);
    expect(game.countries[enemyId]!.capitalTerritoryId).toBeNull();
    for (const country of Object.values(game.countries)) {
      expect(country.warWith).not.toContain(enemyId);
    }
  });
});
