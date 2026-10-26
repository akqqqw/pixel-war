import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import type { GameState, TerritoryState } from '@/core/state/types';
import type { TerritoryId } from '@/core/types';
import type { WorldData } from '@/core/world/world';
import { BALANCE } from '@/core/sim/balance';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';

export interface TerritoryEffects {
  /** Money per tick from buildings (without tax and upkeep). */
  buildingIncome: number;
  /** Population per tick from buildings. */
  populationPerTick: number;
  /** Army per tick from buildings. */
  armyPerTick: number;
  /** Population capacity (thousands). */
  populationCap: number;
  /** Defence bonus inside the territory, 0..1. */
  defense: number;
  /** Attack bonus for pushes launched from this territory, 0..1. */
  attack: number;
  hasAA: boolean;
  hasMissile: boolean;
  buildings: number;
}

export function terrainDefense(state: GameState, territoryId: TerritoryId): number {
  const staticTerritory = state.world.territories.find((t) => t.id === territoryId);
  if (!staticTerritory) return BALANCE.terrainDefense;
  return TERRAIN_INFO[staticTerritory.dominantTerrain as TerrainCode]?.defenseBonus ?? 1;
}

export function countKind(territory: TerritoryState, kind: BuildingKind): number {
  let count = 0;
  for (const building of territory.buildings) if (building.kind === kind) count += 1;
  return count;
}

/** Aggregated effect of all buildings on a territory. */
export function territoryEffects(territory: TerritoryState): TerritoryEffects {
  const result: TerritoryEffects = {
    buildingIncome: 0,
    populationPerTick: 0,
    armyPerTick: 0,
    populationCap: BALANCE.basePopulationCap,
    defense: 0,
    attack: 0,
    hasAA: false,
    hasMissile: false,
    buildings: territory.buildings.length,
  };
  for (const building of territory.buildings) {
    const def = BUILDINGS[building.kind];
    if (!def) continue;
    result.buildingIncome += def.income ?? 0;
    result.populationPerTick += def.population ?? 0;
    result.armyPerTick += def.army ?? 0;
    if (def.kind === 'city') result.populationCap += BALANCE.cityPopulationCap;
    if (def.kind === 'aa') {
      result.defense += def.defense ?? 0;
      result.hasAA = true;
    }
    if (def.kind === 'barricade') result.defense += def.defense ?? 0;
    if (def.kind === 'airfield') result.attack += def.attack ?? 0;
    if (def.kind === 'missile') result.hasMissile = true;
  }
  return result;
}

/** Income before upkeep: tax plus buildings. */
export function territoryIncome(_state: GameState, territory: TerritoryState): number {
  const effects = territoryEffects(territory);
  return territory.population * BALANCE.taxRate + effects.buildingIncome;
}

export function countryIncome(state: GameState, countryId: string): number {
  let income = 0;
  let army = 0;
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== countryId) continue;
    income += territoryIncome(state, territory);
    army += territory.army;
  }
  income -= army * BALANCE.armyUpkeep;
  return Math.round(income * 10) / 10;
}

/**
 * Defence bonus from AA batteries and barricades whose radius of action covers
 * the centre of this territory. Structures of any own territory count, so a
 * battery built one region behind the front still protects the border.
 */
interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const boundsCache = new WeakMap<object, Map<string, Bounds>>();

/** Bounding box of a territory in tiles — cached because the map never moves. */
function territoryBounds(world: WorldData, territoryId: TerritoryId): Bounds | null {
  let perWorld = boundsCache.get(world);
  if (!perWorld) {
    perWorld = new Map();
    boundsCache.set(world, perWorld);
  }
  const cached = perWorld.get(territoryId);
  if (cached) return cached;
  const staticTerritory = world.territories.find((t) => t.id === territoryId);
  if (!staticTerritory) return null;
  const width = world.width;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tile of staticTerritory.tiles) {
    const x = tile % width;
    const y = Math.floor(tile / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const bounds: Bounds = { minX, minY, maxX, maxY };
  perWorld.set(territoryId, bounds);
  return bounds;
}

export function securityDefense(state: GameState, territoryId: TerritoryId): number {
  const target = state.territories[territoryId];
  if (!target || !target.owner) return 0;
  const world = state.world;
  const bounds = territoryBounds(world, territoryId);
  if (!bounds) return 0;
  const width = world.width;
  let bonus = 0;
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== target.owner) continue;
    for (const building of territory.buildings) {
      const def = BUILDINGS[building.kind];
      if (!def?.radius || !def.defense) continue;
      const bx = building.tile % width;
      const by = Math.floor(building.tile / width);
      const dx = Math.max(bounds.minX - bx, 0, bx - bounds.maxX);
      const dy = Math.max(bounds.minY - by, 0, by - bounds.maxY);
      if (Math.max(dx, dy) > def.radius) continue;
      bonus += def.defense;
    }
  }
  return Math.min(BALANCE.maxSecurityDefense, bonus);
}

/**
 * Defence strength of a territory: its army, terrain and the people itself.
 * AA and barricades reinforce the value inside their radius of action.
 */
export function defenseStrength(state: GameState, territoryId: TerritoryId): number {
  const territory = state.territories[territoryId];
  if (!territory) return 0;
  const terrain = 1 + (terrainDefense(state, territoryId) - 1) * BALANCE.terrainDefenseWeight;
  const security = securityDefense(state, territoryId);
  const army = territory.army * BALANCE.defenseArmyWeight;
  const people = territory.population * BALANCE.populationDefense;
  return Math.round((army + people) * terrain * (1 + security) * 10) / 10;
}

/**
 * Attack strength of an army group sitting in `territoryId`. Airfields in the
 * territory and its direct neighbours add up to +50 %.
 */
export function attackStrength(state: GameState, territoryId: TerritoryId): number {
  const territory = state.territories[territoryId];
  if (!territory || territory.army <= 0) return 0;
  const staticTerritory = state.world.territories.find((t) => t.id === territoryId);
  let attackBonus = 0;
  const check = (id: TerritoryId | undefined): void => {
    if (!id) return;
    const other = state.territories[id];
    if (!other || other.owner !== territory.owner) return;
    for (const building of other.buildings) {
      if (building.kind === 'airfield') attackBonus += BUILDINGS.airfield.attack ?? 0;
    }
  };
  check(territoryId);
  for (const neighbour of staticTerritory?.neighbors ?? []) check(neighbour);
  return territory.army * (1 + Math.min(0.5, attackBonus));
}

/** True when the territory has at least one enemy neighbour. */
export function isBorderTerritory(state: GameState, territoryId: TerritoryId): boolean {
  const staticTerritory = state.world.territories.find((t) => t.id === territoryId);
  const territory = state.territories[territoryId];
  if (!staticTerritory || !territory) return false;
  return staticTerritory.neighbors.some((id) => {
    const other = state.territories[id];
    return other && other.owner && other.owner !== territory.owner;
  });
}

export function areAtWar(state: GameState, a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false;
  return state.countries[a]?.warWith.includes(b) ?? false;
}

/** Living countries sorted by strength, used by AI and victory checks. */
export function countryPower(state: GameState, countryId: string): number {
  let power = 0;
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== countryId) continue;
    power += territory.army + territory.population * 0.05 + territory.buildings.length * 2;
  }
  return power;
}
