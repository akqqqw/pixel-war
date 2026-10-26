import type { TerritoryId } from '@/core/types';
import type { WorldData } from '@/core/world/world';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import { armyEntries, type Army } from '@/core/units/army';
import type { CountryState, GameState } from '@/core/state/types';

/** Shortest territory path (inclusive of both ends) or null when unreachable. */
export function findPath(
  world: WorldData,
  from: TerritoryId,
  to: TerritoryId,
  passable?: (id: TerritoryId) => boolean,
): TerritoryId[] | null {
  if (from === to) return [from];
  const neighbours = new Map(world.territories.map((t) => [t.id, t.neighbors]));
  if (!neighbours.has(from) || !neighbours.has(to)) return null;
  const previous = new Map<TerritoryId, TerritoryId>();
  const visited = new Set<TerritoryId>([from]);
  const queue: TerritoryId[] = [from];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++] as TerritoryId;
    for (const next of neighbours.get(current) ?? []) {
      if (visited.has(next)) continue;
      if (next !== to && passable && !passable(next)) continue;
      visited.add(next);
      previous.set(next, current);
      if (next === to) {
        const path: TerritoryId[] = [to];
        let cursor = to;
        while (cursor !== from) {
          const prev = previous.get(cursor);
          if (!prev) return null;
          path.unshift(prev);
          cursor = prev;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/**
 * Armies march through friendly land only; the final territory may be hostile.
 * This keeps front lines meaningful instead of allowing teleporting deep strikes.
 */
export function findOrderPath(
  state: GameState,
  countryId: string,
  from: TerritoryId,
  to: TerritoryId,
): TerritoryId[] | null {
  // The starting tile may be contested (e.g. retreating after a lost battle).
  return findPath(state.world, from, to, (id) => state.territories[id]?.owner === countryId);
}

export function territoryDistance(world: WorldData, a: TerritoryId, b: TerritoryId): number {
  const ta = world.territories.find((t) => t.id === a);
  const tb = world.territories.find((t) => t.id === b);
  if (!ta || !tb) return 10;
  return Math.hypot(ta.centroid.x - tb.centroid.x, ta.centroid.y - tb.centroid.y);
}

export function slowestUnitSpeed(army: Army): number {
  let speed = Infinity;
  for (const entry of armyEntries(army)) speed = Math.min(speed, entry.def.speed);
  return Number.isFinite(speed) ? speed : 1;
}

/** Travel time for one border crossing, in game milliseconds. */
export function travelMilliseconds(
  world: WorldData,
  from: TerritoryId,
  to: TerritoryId,
  army: Army,
  country: CountryState,
): number {
  const target = world.territories.find((t) => t.id === to);
  const terrain = TERRAIN_INFO[(target?.dominantTerrain ?? 2) as TerrainCode];
  const distance = Math.max(4, territoryDistance(world, from, to));
  const speed = Math.max(0.4, slowestUnitSpeed(army)) * 2;
  const fuelPenalty = country.deficit.oil ? 1.6 : 1;
  const seconds = (distance / speed) * terrain.moveCost * fuelPenalty;
  return Math.round(seconds * 1000);
}
