import type { CountryId } from '@/core/types';
import type { TerrainCode } from '@/core/world/terrain';
import { TERRAIN, TERRAIN_INFO, isLand } from '@/core/world/terrain';

export const MAP_WIDTH = 128;
export const MAP_HEIGHT = 80;
export const TERRITORY_COUNT = 24;
export const PIXELS_PER_TILE = 8;

export interface Vec2 {
  x: number;
  y: number;
}

export interface TerritoryStatic {
  id: string;
  index: number;
  name: string;
  region: string;
  /** Flat tile indices (y * width + x). */
  tiles: number[];
  neighbors: string[];
  /** True when the connection to that neighbour is a sea route (no land border). */
  seaBoundaries: string[];
  centroid: Vec2;
  cityTile: number;
  cityName: string;
  dominantTerrain: TerrainCode;
  terrainMix: Partial<Record<TerrainCode, number>>;
  population: number;
  isCoastal: boolean;
  hasRiver: boolean;
  initialOwner: CountryId | null;
  isCapital: boolean;
}

export interface SeaZone {
  id: string;
  name: string;
  centroid: Vec2;
  bounds: { x: number; y: number; width: number; height: number };
}

/** Immutable world data: generated once, shared by every simulation step. */
export interface WorldData {
  seed: number;
  width: number;
  height: number;
  terrain: Uint8Array;
  elevation: Float32Array;
  moisture: Float32Array;
  /** 1 when the tile carries a river. */
  river: Uint8Array;
  /** Territory index per tile, -1 for open water. */
  tileTerritory: Int16Array;
  territories: TerritoryStatic[];
  seaZones: SeaZone[];
  landTiles: number;
}

export function tileIndex(x: number, y: number, width = MAP_WIDTH): number {
  return y * width + x;
}

export function tileX(index: number, width = MAP_WIDTH): number {
  return index % width;
}

export function tileY(index: number, width = MAP_WIDTH): number {
  return Math.floor(index / width);
}

export function inBounds(x: number, y: number, world: WorldData): boolean {
  return x >= 0 && y >= 0 && x < world.width && y < world.height;
}

export function neighbours4(x: number, y: number, world: WorldData): Vec2[] {
  const out: Vec2[] = [];
  if (x > 0) out.push({ x: x - 1, y });
  if (x < world.width - 1) out.push({ x: x + 1, y });
  if (y > 0) out.push({ x, y: y - 1 });
  if (y < world.height - 1) out.push({ x, y: y + 1 });
  return out;
}

export function neighbours8(x: number, y: number, world: WorldData): Vec2[] {
  const out: Vec2[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < world.width && ny < world.height) out.push({ x: nx, y: ny });
    }
  }
  return out;
}

export function isLandTile(world: WorldData, x: number, y: number): boolean {
  if (!inBounds(x, y, world)) return false;
  return isLand(world.terrain[tileIndex(x, y, world.width)] as TerrainCode);
}

export function territoryOfTile(world: WorldData, x: number, y: number): TerritoryStatic | null {
  if (!inBounds(x, y, world)) return null;
  const index = world.tileTerritory[tileIndex(x, y, world.width)];
  if (index === undefined || index < 0) return null;
  return world.territories[index] ?? null;
}

export function getTerritory(world: WorldData, id: string | null | undefined): TerritoryStatic | null {
  if (!id) return null;
  return world.territories.find((t) => t.id === id) ?? null;
}

export function territoryDefenseTerrain(world: WorldData, id: string): TerrainCode {
  return getTerritory(world, id)?.dominantTerrain ?? TERRAIN.Plains;
}

export function terrainDefenseBonus(world: WorldData, id: string): number {
  const code = territoryDefenseTerrain(world, id);
  return TERRAIN_INFO[code].defenseBonus;
}

export function terrainAttackModifier(world: WorldData, id: string): number {
  const code = territoryDefenseTerrain(world, id);
  return TERRAIN_INFO[code].attackModifier;
}
