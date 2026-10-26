import type { CountryId, Resources } from '@/core/types';
import { RESOURCE_KEYS, zeroResources } from '@/core/types';
import type { GameState, TerritoryState } from '@/core/state/types';
import type { TerritoryStatic, WorldData } from '@/core/world/world';
import { armyCount, armyUpkeep, type Army } from '@/core/units/army';
import type { CountryDef } from '@/core/countries/country';

export const MAX_ECONOMY_LEVEL = 3;
/** Administrative cost of holding one territory, per tick. */
export const TERRITORY_ADMIN_COST = 0.05;
/** Conquered land needs this many ticks before it produces at full rate. */
export const UNREST_DURATION_TICKS = 45;

export function economyUpgradeCost(level: number): Partial<Resources> {
  return { money: 280 + level * 260, metal: 120 + level * 130 };
}

export function territoryYield(
  territory: TerritoryStatic,
  state: TerritoryState,
  isCapital: boolean,
): Resources {
  const level = Math.max(1, state.economyLevel);
  const levelMultiplier = 1 + (level - 1) * 0.5;
  const capitalMultiplier = isCapital ? 1.25 : 1;
  const unrestMultiplier = 1 - Math.min(0.6, state.unrest * 0.6);
  const scale = levelMultiplier * capitalMultiplier * unrestMultiplier;
  return {
    money: territory.baseYields.money * scale,
    metal: territory.baseYields.metal * scale,
    oil: territory.baseYields.oil * scale,
    energy: territory.baseYields.energy * scale,
  };
}

function countryArmies(state: GameState, countryId: CountryId): Army[] {
  const armies: Army[] = [];
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== countryId) continue;
    armies.push(territory.garrison);
  }
  for (const group of Object.values(state.groups)) {
    if (group.country === countryId) armies.push(group.army);
  }
  return armies;
}

export interface EconomyBreakdown {
  gross: Resources;
  upkeep: Resources;
  net: Resources;
  territoryCount: number;
  armySize: number;
}

export function computeEconomy(
  world: WorldData,
  state: GameState,
  countryId: CountryId,
): EconomyBreakdown {
  const gross = zeroResources();
  let territoryCount = 0;
  for (const territory of world.territories) {
    const ts = state.territories[territory.id];
    if (!ts || ts.owner !== countryId) continue;
    territoryCount += 1;
    const yields = territoryYield(territory, ts, territory.id === capitalOf(state, countryId));
    for (const key of RESOURCE_KEYS) gross[key] += yields[key];
  }

  const upkeep = zeroResources();
  let armySize = 0;
  for (const army of countryArmies(state, countryId)) {
    armySize += armyCount(army);
    const cost = armyUpkeep(army);
    for (const key of RESOURCE_KEYS) upkeep[key] += cost[key];
  }
  upkeep.money += territoryCount * TERRITORY_ADMIN_COST;
  upkeep.energy += armySize * 0.02;

  const net = zeroResources();
  for (const key of RESOURCE_KEYS) net[key] = gross[key] - upkeep[key];
  return { gross, upkeep, net, territoryCount, armySize };
}

export function capitalOf(state: GameState, countryId: CountryId): string | null {
  return state.countries[countryId]?.capitalTerritoryId ?? null;
}

/** Applies one economy tick: income, upkeep, unrest and slow population growth. */
export function runEconomyTick(state: GameState): void {
  const world = state.world;
  for (const country of Object.values(state.countries)) {
    if (!country.alive) continue;
    const breakdown = computeEconomy(world, state, country.id);
    country.income = breakdown.net;

    for (const key of RESOURCE_KEYS) {
      country.resources[key] = Math.max(0, country.resources[key] + breakdown.gross[key]);
    }

    for (const key of RESOURCE_KEYS) {
      const demand = breakdown.upkeep[key];
      const available = country.resources[key];
      const paid = Math.min(available, demand);
      country.resources[key] = Math.max(0, available - paid);
      country.deficit[key] = demand > paid + 1e-6;
    }

    for (const territory of world.territories) {
      const ts = state.territories[territory.id];
      if (!ts || ts.owner !== country.id) continue;
      ts.lastYield = territoryYield(territory, ts, territory.id === country.capitalTerritoryId);
      if (ts.unrest > 0) ts.unrest = Math.max(0, ts.unrest - 1 / UNREST_DURATION_TICKS);
      const growth = 1.0004;
      const cap = territory.population * 1.45;
      ts.population = Math.min(cap, ts.population * growth);
    }
  }
}

/** Economic development score used by the HUD and (later) the economic victory. */
export function economyScore(state: GameState, countryId: CountryId): number {
  let score = 0;
  for (const territory of state.world.territories) {
    const ts = state.territories[territory.id];
    if (!ts || ts.owner !== countryId) continue;
    score += (territory.population / 1_000_000) * (1 + (ts.economyLevel - 1) * 0.4);
  }
  return Math.round(score);
}

export function applyCountryBonus(def: CountryDef | undefined, resources: Resources): Resources {
  const out = { ...resources };
  if (!def?.bonus.resources) return out;
  for (const key of RESOURCE_KEYS) {
    out[key] += def.bonus.resources[key] ?? 0;
  }
  return out;
}
