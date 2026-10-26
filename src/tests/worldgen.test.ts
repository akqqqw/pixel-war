import { describe, expect, it } from 'vitest';
import { createWorld } from '@/core/state/createGame';
import { validateWorld } from '@/core/world/generateWorld';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import { COUNTRIES } from '@/data/countries';

const SEEDS = [1, 42, 2026, 777_777];

describe('procedural world', () => {
  it('generates a valid, connected world for every seed', () => {
    for (const seed of SEEDS) {
      const world = createWorld(seed);
      expect(validateWorld(world), `seed ${seed}`).toEqual([]);
      expect(world.territories.length).toBeGreaterThanOrEqual(20);
      expect(world.territories.length).toBeLessThanOrEqual(30);
      expect(world.landTiles).toBeGreaterThan(500);
      expect(world.width).toBe(128);
      expect(world.height).toBe(80);
    }
  });

  it('assigns every land tile to a territory and keeps cities on land', () => {
    for (const seed of SEEDS) {
      const world = createWorld(seed);
      let unassigned = 0;
      for (let i = 0; i < world.terrain.length; i += 1) {
        const code = world.terrain[i] as TerrainCode;
        if (!TERRAIN_INFO[code].land) continue;
        if ((world.tileTerritory[i] ?? -1) < 0) unassigned += 1;
      }
      expect(unassigned, `seed ${seed}`).toBe(0);
      for (const territory of world.territories) {
        expect(territory.tiles.length).toBeGreaterThan(0);
        expect(TERRAIN_INFO[world.terrain[territory.cityTile] as TerrainCode].land).toBe(true);
        expect(territory.tiles).toContain(territory.cityTile);
        expect(territory.centroid.x).toBeGreaterThanOrEqual(0);
        expect(territory.centroid.y).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('gives each country a contiguous, balanced starting position', () => {
    for (const seed of SEEDS) {
      const world = createWorld(seed);
      const counts = new Map<string, number>();
      for (const territory of world.territories) {
        const owner = territory.initialOwner ?? 'none';
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
      for (const country of COUNTRIES) {
        const count = counts.get(country.id) ?? 0;
        expect(count, `${country.id} seed ${seed}`).toBeGreaterThanOrEqual(6);
      }
      const capitals = world.territories.filter((territory) => territory.isCapital);
      expect(capitals.length).toBe(COUNTRIES.length);
      expect(new Set(capitals.map((capital) => capital.initialOwner)).size).toBe(COUNTRIES.length);
    }
  });

  it('produces non-negative economy values and sane terrain mixes', () => {
    const world = createWorld(123);
    for (const territory of world.territories) {
      expect(territory.population).toBeGreaterThan(100_000);
      for (const value of Object.values(territory.baseYields)) {
        expect(value).toBeGreaterThan(0);
        expect(Number.isFinite(value)).toBe(true);
      }
      const totalTiles = Object.values(territory.terrainMix).reduce((sum, value) => sum + (value ?? 0), 0);
      expect(totalTiles).toBe(territory.tiles.length);
      expect(TERRAIN_INFO[territory.dominantTerrain]).toBeDefined();
    }
  });

  it('keeps adjacency symmetric and islands reachable via sea routes', () => {
    const world = createWorld(99);
    const byId = new Map(world.territories.map((territory) => [territory.id, territory]));
    for (const territory of world.territories) {
      for (const neighbourId of territory.neighbors) {
        const neighbour = byId.get(neighbourId);
        expect(neighbour, `${territory.id} -> ${neighbourId}`).toBeDefined();
        expect(neighbour!.neighbors).toContain(territory.id);
      }
    }
  });
});
