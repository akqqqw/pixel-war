import type { TerrainCode } from '@/core/world/terrain';
import { TERRAIN_INFO } from '@/core/world/terrain';
import type { TerritoryStatic, WorldData } from '@/core/world/world';

/** Cell-level helpers shared by the simulation and the renderer. */

/** 4-neighbourhood: north, east, south, west. */
export const CELL_DIRS: readonly [number, number][] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export const CELL_DIRS_8: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export function cellX(world: WorldData, cell: number): number {
  return cell % world.width;
}

export function cellY(world: WorldData, cell: number): number {
  return Math.floor(cell / world.width);
}

export function cellAt(world: WorldData, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return -1;
  return y * world.width + x;
}

export function isLandCell(world: WorldData, cell: number): boolean {
  if (cell < 0 || cell >= world.terrain.length) return false;
  return TERRAIN_INFO[world.terrain[cell] as TerrainCode]?.land ?? false;
}

/** Neighbouring land cells only — water is never part of the ground war. */
export function landNeighbours(world: WorldData, cell: number, out: number[] = []): number[] {
  out.length = 0;
  const x = cellX(world, cell);
  const y = cellY(world, cell);
  for (const [dx, dy] of CELL_DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
    const next = ny * world.width + nx;
    if (!isLandCell(world, next)) continue;
    out.push(next);
  }
  return out;
}

/** True when the cell touches water — the only place a port may stand. */
export function isCoastalCell(world: WorldData, cell: number): boolean {
  const x = cellX(world, cell);
  const y = cellY(world, cell);
  for (const [dx, dy] of CELL_DIRS_8) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
    if (!isLandCell(world, ny * world.width + nx)) return true;
  }
  return false;
}

/** Terrain defence multiplier of a cell, compressed by the balance weight. */
export function cellTerrainDefense(world: WorldData, cell: number, weight: number): number {
  const info = TERRAIN_INFO[world.terrain[cell] as TerrainCode];
  return 1 + ((info?.defenseBonus ?? 1) - 1) * weight;
}

export function regionOfCell(world: WorldData, cell: number): TerritoryStatic | null {
  const index = world.tileTerritory[cell] ?? -1;
  if (index < 0) return null;
  return world.territories[index] ?? null;
}

/** Squared distance in cells — enough for radius checks. */
export function cellDistance(world: WorldData, a: number, b: number): number {
  const dx = cellX(world, a) - cellX(world, b);
  const dy = cellY(world, a) - cellY(world, b);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Chebyshev distance — matches the square radius drawn on the map. */
export function cellRadiusDistance(world: WorldData, a: number, b: number): number {
  const dx = Math.abs(cellX(world, a) - cellX(world, b));
  const dy = Math.abs(cellY(world, a) - cellY(world, b));
  return Math.max(dx, dy);
}

/** All land cells of one region, cached by the caller if it needs speed. */
export function regionCells(world: WorldData, regionId: string): number[] {
  return world.territories.find((territory) => territory.id === regionId)?.tiles ?? [];
}
