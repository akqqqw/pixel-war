import { describe, expect, it } from 'vitest';
import { createGame, createWorld } from '@/core/state/createGame';
import { TERRITORY_COUNT, isLandTile } from '@/core/world/world';

describe('world generation', () => {
  const world = createWorld(1234);

  it('produces the same map for the same seed', () => {
    const again = createWorld(1234);
    expect(Array.from(again.tileTerritory)).toEqual(Array.from(world.tileTerritory));
    expect(again.territories.map((t) => t.name)).toEqual(world.territories.map((t) => t.name));
  });

  it('varies between seeds', () => {
    const other = createWorld(999);
    expect(Array.from(other.tileTerritory)).not.toEqual(Array.from(world.tileTerritory));
  });

  it('has the expected number of territories with land', () => {
    expect(world.territories.length).toBeGreaterThanOrEqual(TERRITORY_COUNT);
    expect(world.territories.length).toBeLessThanOrEqual(TERRITORY_COUNT + 4);
    const ids = new Set(world.territories.map((t) => t.id));
    expect(ids.size).toBe(world.territories.length);
    for (const territory of world.territories) {
      expect(territory.tiles.length).toBeGreaterThan(0);
      expect(territory.tiles).toContain(territory.cityTile);
      expect(territory.initialOwner).toBeTruthy();
    }
  });

  it('maps every land tile to exactly one territory', () => {
    const seen = new Set<number>();
    for (const territory of world.territories) {
      for (const tile of territory.tiles) {
        expect(seen.has(tile)).toBe(false);
        seen.add(tile);
      }
    }
    let land = 0;
    for (let i = 0; i < world.terrain.length; i += 1) {
      const x = i % world.width;
      const y = Math.floor(i / world.width);
      if (!isLandTile(world, x, y)) continue;
      land += 1;
      expect(seen.has(i)).toBe(true);
    }
    expect(land).toBe(seen.size);
  });

  it('keeps tileTerritory indexes aligned with the territory array', () => {
    // Regression: regions used to be re-indexed while sorting names, so the cell
    // map pointed at the wrong territory and captures happened elsewhere.
    for (const [index, territory] of world.territories.entries()) {
      for (const tile of territory.tiles) {
        expect(world.tileTerritory[tile]).toBe(index);
      }
    }
    for (let i = 0; i < world.tileTerritory.length; i += 1) {
      const region = world.tileTerritory[i] ?? -1;
      if (region < 0) continue;
      expect(world.territories[region]?.tiles).toContain(i);
    }
  });

  it('has symmetric borders', () => {
    for (const territory of world.territories) {
      expect(territory.neighbors).not.toContain(territory.id);
      for (const neighbourId of territory.neighbors) {
        const neighbour = world.territories.find((t) => t.id === neighbourId);
        expect(neighbour, neighbourId).toBeTruthy();
        expect(neighbour!.neighbors).toContain(territory.id);
      }
    }
    expect(world.territories.some((t) => t.neighbors.length >= 3)).toBe(true);
  });

  it('starts every country with territories, a capital and money', () => {
    const game = createGame({ seed: 77, playerCountryId: 'aquilonia', difficulty: 'normal' });
    for (const country of Object.values(game.countries)) {
      expect(country.alive).toBe(true);
      expect(country.money).toBeGreaterThan(0);
      expect(country.capitalTerritoryId).toBeTruthy();
      const capital = game.territories[country.capitalTerritoryId!];
      expect(capital?.owner).toBe(country.id);
      const owned = Object.values(game.territories).filter((t) => t.owner === country.id);
      expect(owned.length).toBeGreaterThan(0);
    }
    expect(Object.values(game.countries).filter((c) => c.isPlayer)).toHaveLength(1);
    expect(game.countries[game.playerCountryId]!.isPlayer).toBe(true);
  });

  it('paints every territory tile with its owner on the cell map', () => {
    const game = createGame({ seed: 77, playerCountryId: 'aquilonia', difficulty: 'normal' });
    for (const territory of game.world.territories) {
      const ownerIndex = game.countryOrder.indexOf(game.territories[territory.id]!.owner!);
      expect(ownerIndex).toBeGreaterThanOrEqual(0);
      for (const tile of territory.tiles) expect(game.tileOwner[tile]).toBe(ownerIndex);
    }
  });
});
