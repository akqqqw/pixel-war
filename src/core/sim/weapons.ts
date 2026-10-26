import { BUILDINGS } from '@/core/buildings/buildings';
import { BALANCE } from '@/core/sim/balance';
import { areAtWar, territoryEffects } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import type { GameState } from '@/core/state/types';
import type { TerritoryId } from '@/core/types';

/** Territories within `range` hops of the start (breadth-first over borders). */
export function territoriesWithin(state: GameState, startId: TerritoryId, range: number): TerritoryId[] {
  const seen = new Set<TerritoryId>([startId]);
  let frontier: TerritoryId[] = [startId];
  const result: TerritoryId[] = [];
  for (let hop = 0; hop < range; hop += 1) {
    const next: TerritoryId[] = [];
    for (const id of frontier) {
      const staticTerritory = state.world.territories.find((t) => t.id === id);
      for (const neighbourId of staticTerritory?.neighbors ?? []) {
        if (seen.has(neighbourId)) continue;
        seen.add(neighbourId);
        next.push(neighbourId);
        result.push(neighbourId);
      }
    }
    frontier = next;
  }
  return result;
}

/** Does the defender have an AA battery covering this territory? */
export function hasAntiAir(state: GameState, territoryId: TerritoryId): boolean {
  const territory = state.territories[territoryId];
  const target = state.world.territories.find((t) => t.id === territoryId);
  if (!territory || !target) return false;
  const reach = BUILDINGS.aa.radius ?? 0;
  const width = state.world.width;
  const cx = target.centroid.x;
  const cy = target.centroid.y;
  for (const candidate of Object.values(state.territories)) {
    if (candidate.owner !== territory.owner) continue;
    for (const building of candidate.buildings) {
      if (building.kind !== 'aa') continue;
      const bx = building.tile % width;
      const by = Math.floor(building.tile / width);
      if (Math.max(Math.abs(bx - cx), Math.abs(by - cy)) <= reach) return true;
    }
  }
  return false;
}

export interface MissileResult {
  launched: number;
  intercepted: number;
}

/** Every ready launcher fires at the strongest reachable enemy territory. */
export function fireMissiles(state: GameState): MissileResult {
  let launched = 0;
  let intercepted = 0;

  for (const territory of Object.values(state.territories)) {
    if (!territory.owner) continue;
    const effects = territoryEffects(territory);
    if (!effects.hasMissile) continue;
    const launchers = territory.buildings.filter((building) => building.kind === 'missile');
    for (const launcher of launchers) {
      const readyAt = state.missileReady[launcher.id] ?? 0;
      if (state.tick < readyAt) continue;
      const country = state.countries[territory.owner];
      if (!country || !country.alive) continue;

      const reachable = territoriesWithin(state, territory.id, BALANCE.missileRange);
      let target: TerritoryId | null = null;
      let bestArmy = 0;
      for (const candidateId of reachable) {
        const candidate = state.territories[candidateId];
        if (!candidate || !candidate.owner) continue;
        if (!areAtWar(state, country.id, candidate.owner)) continue;
        if (candidate.army <= bestArmy) continue;
        bestArmy = candidate.army;
        target = candidateId;
      }
      if (!target) continue;

      state.missileReady[launcher.id] = state.tick + BALANCE.missileCooldown;
      launched += 1;
      const staticTerritory = state.world.territories.find((t) => t.id === target);
      if (hasAntiAir(state, target)) {
        intercepted += 1;
        pushEvent(state, 'missile', `ПВО сбила ракету над ${staticTerritory?.name ?? 'целью'}.`, territory.owner);
        continue;
      }
      const victim = state.territories[target];
      if (!victim) continue;
      victim.army = Math.max(0, Math.round((victim.army - BALANCE.missileDamage) * 10) / 10);
      country.stats.missiles += 1;
      pushEvent(
        state,
        'missile',
        `Ракетный удар по ${staticTerritory?.name ?? 'цели'}: −${BALANCE.missileDamage} армии.`,
        territory.owner,
        target,
      );
    }
  }

  return { launched, intercepted };
}
