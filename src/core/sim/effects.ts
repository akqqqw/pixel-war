import {
  BALANCE,
} from '@/core/sim/balance';
import {
  BUILDINGS,
  buildingDamage,
  buildingDefense,
  buildingIntercept,
  buildingPopulation,
  buildingRadius,
  buildingIncome,
  type BuildingKind,
} from '@/core/buildings/buildings';
import type { BuildingInstance, CountryState, GameState, RegionState } from '@/core/state/types';
import { countryIndexOf } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';
import { cellTerrainDefense, cellX, cellY, isLandCell } from '@/core/world/cells';

/** Pure queries shared by the simulation, the AI and the interface. */

export function areAtWar(state: GameState, a: CountryId | null, b: CountryId | null): boolean {
  if (!a || !b || a === b) return false;
  return state.countries[a]?.warWith.includes(b) ?? false;
}

export function buildingsOf(region: RegionState, kind?: BuildingKind): BuildingInstance[] {
  return kind ? region.buildings.filter((building) => building.kind === kind) : region.buildings;
}

export function countBuildings(region: RegionState, kind: BuildingKind): number {
  let count = 0;
  for (const building of region.buildings) if (building.kind === kind) count += 1;
  return count;
}

export function buildingAt(state: GameState, cell: number): BuildingInstance | null {
  const region = regionOfCellState(state, cell);
  if (!region) return null;
  for (const building of region.buildings) if (building.cell === cell) return building;
  return null;
}

export function regionOfCellState(state: GameState, cell: number): RegionState | null {
  const index = state.world.tileTerritory[cell] ?? -1;
  if (index < 0) return null;
  const territory = state.world.territories[index];
  if (!territory) return null;
  return state.regions[territory.id] ?? null;
}

/** Iterates land cells of a square radius around `cell` (Chebyshev distance). */
function forEachCellInRadius(
  state: GameState,
  cell: number,
  radius: number,
  visit: (other: number, distance: number) => void,
): void {
  const world = state.world;
  const cx = cellX(world, cell);
  const cy = cellY(world, cell);
  const minX = Math.max(0, cx - radius);
  const maxX = Math.min(world.width - 1, cx + radius);
  const minY = Math.max(0, cy - radius);
  const maxY = Math.min(world.height - 1, cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const other = y * world.width + x;
      if (!isLandCell(world, other)) continue;
      const distance = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (distance > radius) continue;
      visit(other, distance);
    }
  }
}

/**
 * Rebuilds the fortification layers from the buildings. Barricade bonuses add
 * up but never pass `maxFortDefense`; AA interception combines as independent
 * chances and is capped by `maxInterceptChance` — overlapping radii therefore
 * help, but cannot make a country invulnerable.
 */
export function recomputeFortification(state: GameState): void {
  state.cellFort.fill(0);
  state.cellAir.fill(0);
  for (const region of Object.values(state.regions)) {
    for (const building of region.buildings) {
      const def = BUILDINGS[building.kind];
      if (!def.radius) continue;
      const radius = buildingRadius(building.kind, building.level);
      const ownerIndex = countryIndexOf(state, region.owner);
      if (ownerIndex < 0) continue;
      const defense = def.defense ? buildingDefense(building.kind, building.level) : 0;
      const intercept = def.intercept ? buildingIntercept(building.kind, building.level) : 0;
      forEachCellInRadius(state, building.cell, radius, (other) => {
        if (state.cellOwner[other] !== ownerIndex) return;
        if (defense > 0) {
          state.cellFort[other] = Math.min(
            BALANCE.maxFortDefense,
            (state.cellFort[other] ?? 0) + defense,
          );
        }
        if (intercept > 0) {
          const current = state.cellAir[other] ?? 0;
          const combined = 1 - (1 - current) * (1 - intercept);
          state.cellAir[other] = Math.min(BALANCE.maxInterceptChance, combined);
        }
      });
    }
  }
}

/** Airfield bonus for pushes launched from `cell`, 0..maxAirfieldAttackBonus. */
export function airfieldAttackBonus(state: GameState, cell: number): number {
  const owner = state.cellOwner[cell];
  if (owner === undefined || owner < 0) return 0;
  let bonus = 0;
  for (const region of Object.values(state.regions)) {
    if (countryIndexOf(state, region.owner) !== owner) continue;
    for (const building of region.buildings) {
      if (building.kind !== 'airfield') continue;
      const radius = buildingRadius(building.kind, building.level);
      const dx = Math.abs(cellX(state.world, building.cell) - cellX(state.world, cell));
      const dy = Math.abs(cellY(state.world, building.cell) - cellY(state.world, cell));
      if (Math.max(dx, dy) > radius) continue;
      bonus += BUILDINGS.airfield.attack ?? 0;
    }
  }
  return Math.min(BALANCE.maxAirfieldAttackBonus, bonus);
}

export function tankAttackBonus(country: CountryState): number {
  return Math.min(BALANCE.maxTankAttackBonus, country.tanks * BALANCE.tankAttackBonus);
}

export function tankDefenseBonus(country: CountryState): number {
  return Math.min(BALANCE.maxTankDefenseBonus, country.tanks * BALANCE.tankDefenseBonus);
}

/** Defence of a single cell: garrison, militia, terrain, barricades and tanks. */
export function cellDefense(state: GameState, cell: number): number {
  const owner = state.cellOwner[cell] ?? -1;
  if (owner < 0) return 0;
  const country = state.countries[state.countryOrder[owner]!];
  if (!country) return 0;
  const army = state.cellArmy[cell] ?? 0;
  const fort = 1 + (state.cellFort[cell] ?? 0);
  const terrain = cellTerrainDefense(state.world, cell, BALANCE.terrainWeight);
  const militia = BALANCE.cellMilitiaDefense * terrain * fort;
  const soldiers = army * (1 + tankDefenseBonus(country)) * fort * terrain;
  return soldiers + militia;
}

/** Defence number shown in the interface for a whole region. */
export function regionDefense(state: GameState, regionId: TerritoryId): number {
  const territory = state.world.territories.find((entry) => entry.id === regionId);
  if (!territory) return 0;
  let total = 0;
  for (const cell of territory.tiles) total += cellDefense(state, cell);
  return Math.round(total);
}

export function regionArmy(state: GameState, regionId: TerritoryId): number {
  const territory = state.world.territories.find((entry) => entry.id === regionId);
  if (!territory) return 0;
  let total = 0;
  for (const cell of territory.tiles) total += state.cellArmy[cell] ?? 0;
  return total;
}

/** Soldiers of one country standing inside a region (enemies are not counted). */
export function regionArmyOf(state: GameState, regionId: TerritoryId, countryId: CountryId): number {
  const territory = state.world.territories.find((entry) => entry.id === regionId);
  const index = countryIndexOf(state, countryId);
  if (!territory || index < 0) return 0;
  let total = 0;
  for (const cell of territory.tiles) {
    if ((state.cellOwner[cell] ?? -1) !== index) continue;
    total += state.cellArmy[cell] ?? 0;
  }
  return total;
}

export function countryArmy(state: GameState, countryId: CountryId): number {
  let total = 0;
  for (let cell = 0; cell < state.cellArmy.length; cell += 1) {
    const owner = state.cellOwner[cell] ?? -1;
    if (owner < 0) continue;
    if (state.countryOrder[owner] !== countryId) continue;
    total += state.cellArmy[cell] ?? 0;
  }
  return total;
}

export function countryPopulation(state: GameState, countryId: CountryId): number {
  let total = 0;
  for (const region of Object.values(state.regions)) {
    if (region.owner === countryId) total += region.population;
  }
  return total;
}

export function countryRegions(state: GameState, countryId: CountryId): RegionState[] {
  return Object.values(state.regions).filter((region) => region.owner === countryId);
}

/** Share of the land map one country controls, 0..1. */
export function territoryShare(state: GameState, countryId: CountryId): number {
  const index = countryIndexOf(state, countryId);
  if (index < 0) return 0;
  let owned = 0;
  let land = 0;
  for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
    const owner = state.cellOwner[cell] ?? -1;
    if (!isLandCell(state.world, cell)) continue;
    land += 1;
    if (owner === index) owned += 1;
  }
  return land === 0 ? 0 : owned / land;
}

/** Population capacity of a region, raised by cities. */
export function populationCap(region: Pick<RegionState, 'buildings'>): number {
  let cap = BALANCE.basePopulationCap;
  for (const building of region.buildings) {
    if (building.kind !== 'city') continue;
    cap += BALANCE.cityPopulationCap * Math.pow(1.5, building.level - 1);
  }
  return Math.round(cap);
}

/** Income of a region per second: taxes plus buildings. */
export function regionIncome(region: RegionState): number {
  let income = region.population * BALANCE.taxPerCitizenPerSecond;
  for (const building of region.buildings) {
    if (BUILDINGS[building.kind].income) income += buildingIncome(building.kind, building.level);
  }
  return Math.round(income * 10) / 10;
}

/** Population the cities of a region add every second. */
export function regionPopulationGrowth(region: Pick<RegionState, 'buildings'>): number {
  let growth = BALANCE.basePopulationGrowth;
  for (const building of region.buildings) {
    if (building.kind !== 'city') continue;
    growth += buildingPopulation('city', building.level);
  }
  return growth;
}

export function missileDamageOf(building: BuildingInstance): number {
  return buildingDamage('missile', building.level);
}

export function airStrikeDamageOf(building: BuildingInstance): number {
  return buildingDamage('airfield', building.level);
}

/** Regions of a country touching a region of another country. */
export function borderRegions(state: GameState, countryId: CountryId): RegionState[] {
  const out: RegionState[] = [];
  for (const region of countryRegions(state, countryId)) {
    const territory = state.world.territories.find((entry) => entry.id === region.id);
    if (!territory) continue;
    const isBorder = territory.neighbors.some((id) => {
      const other = state.regions[id];
      return other && other.owner && other.owner !== countryId;
    });
    if (isBorder) out.push(region);
  }
  return out;
}

export function livingCountries(state: GameState): CountryState[] {
  return Object.values(state.countries).filter((country) => country.alive);
}
