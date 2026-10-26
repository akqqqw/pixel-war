import {
  BUILDINGS,
  buildingRadius,
  levelFactor,
  upgradeCost,
  type BuildingKind,
} from '@/core/buildings/buildings';
import { countBuildings, recomputeFortification, regionArmy } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import { fail, OK, type ActionResult } from '@/core/sim/result';
import { distributeArmy } from '@/core/sim/army';
import type { BuildingInstance, GameState } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';
import { cellRadiusDistance, isCoastalCell, isLandCell, regionCells } from '@/core/world/cells';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Why a structure cannot be placed on this cell — undefined when it can. */
export function buildBlocker(
  state: GameState,
  countryId: CountryId,
  regionId: TerritoryId,
  kind: BuildingKind,
  cell: number,
): string | undefined {
  const region = state.regions[regionId];
  const country = state.countries[countryId];
  const def = BUILDINGS[kind];
  if (!region || !country) return 'Регион не найден.';
  if (state.status !== 'playing') return 'Кампания окончена.';
  if (region.owner !== countryId) return 'Строить можно только у себя.';
  if (!regionCells(state.world, regionId).includes(cell)) return 'Клетка не из этого региона.';
  if (!isLandCell(state.world, cell)) return 'На воде не строят.';
  const ownerIndex = state.cellOwner[cell] ?? -1;
  if (ownerIndex !== state.countryOrder.indexOf(countryId)) return 'Клетка уже не ваша.';
  if (region.buildings.some((building) => building.cell === cell)) return 'Клетка занята.';
  if (countBuildings(region, kind) >= def.limit) return `Лимит: ${def.limit} на регион.`;
  if (def.coastal && !isCoastalCell(state.world, cell)) return 'Порт ставится у воды.';
  if (country.money + 1e-9 < def.cost) return `Нужно ${def.cost} золота.`;
  return undefined;
}

export function canBuild(
  state: GameState,
  countryId: CountryId,
  regionId: TerritoryId,
  kind: BuildingKind,
  cell: number,
): ActionResult {
  const blocker = buildBlocker(state, countryId, regionId, kind, cell);
  return blocker ? fail(blocker) : OK;
}

/**
 * Picks a sensible free cell for a structure — used by the AI and as a fallback
 * when the player clicks a region instead of a single cell.
 */
export function findBuildCell(
  state: GameState,
  countryId: CountryId,
  regionId: TerritoryId,
  kind: BuildingKind,
): number | null {
  const cells = regionCells(state.world, regionId);
  const index = state.countryOrder.indexOf(countryId);
  const candidates = cells.filter(
    (cell) =>
      (state.cellOwner[cell] ?? -1) === index &&
      !state.regions[regionId]?.buildings.some((building) => building.cell === cell),
  );
  if (candidates.length === 0) return null;
  if (BUILDINGS[kind].coastal) {
    return candidates.find((cell) => isCoastalCell(state.world, cell)) ?? null;
  }
  // Prefer cells away from the front so a lucky push does not raze the economy.
  const center = candidates[Math.floor(candidates.length / 2)] ?? candidates[0]!;
  return center;
}

export function build(
  state: GameState,
  countryId: CountryId,
  regionId: TerritoryId,
  kind: BuildingKind,
  cell: number,
): ActionResult {
  const blocker = buildBlocker(state, countryId, regionId, kind, cell);
  if (blocker) return fail(blocker);
  const region = state.regions[regionId]!;
  const country = state.countries[countryId]!;
  const def = BUILDINGS[kind];
  country.money = round1(country.money - def.cost);
  const building: BuildingInstance = {
    id: `b${state.nextIds.building}`,
    kind,
    level: 1,
    cell,
    regionId,
    readyAtTick: state.tick,
  };
  state.nextIds.building += 1;
  region.buildings.push(building);
  country.stats.built += 1;
  recomputeFortification(state);
  pushEvent(state, 'build', `${def.name} построен.`, countryId, cell);
  return OK;
}

export function findBuilding(state: GameState, buildingId: string): { building: BuildingInstance; regionId: TerritoryId } | null {
  for (const region of Object.values(state.regions)) {
    const building = region.buildings.find((entry) => entry.id === buildingId);
    if (building) return { building, regionId: region.id };
  }
  return null;
}

export function upgradeBuilding(
  state: GameState,
  countryId: CountryId,
  buildingId: string,
): ActionResult {
  const found = findBuilding(state, buildingId);
  if (!found) return fail('Постройка не найдена.');
  const { building, regionId } = found;
  const region = state.regions[regionId];
  const country = state.countries[countryId];
  if (!region || !country) return fail('Регион не найден.');
  if (region.owner !== countryId) return fail('Это не ваш регион.');
  const def = BUILDINGS[building.kind];
  if (building.level >= def.maxLevel) return fail('Максимальный уровень.');
  const cost = upgradeCost(building.kind, building.level);
  if (country.money + 1e-9 < cost) return fail(`Нужно ${cost} золота.`);
  country.money = round1(country.money - cost);
  building.level += 1;
  building.readyAtTick = Math.min(building.readyAtTick, state.tick);
  recomputeFortification(state);
  pushEvent(state, 'upgrade', `${def.name} улучшен до уровня ${building.level}.`, countryId, building.cell);
  return OK;
}

export function demolishBuilding(
  state: GameState,
  countryId: CountryId,
  buildingId: string,
): ActionResult {
  const found = findBuilding(state, buildingId);
  if (!found) return fail('Постройка не найдена.');
  const { building, regionId } = found;
  const region = state.regions[regionId];
  const country = state.countries[countryId];
  if (!region || !country) return fail('Регион не найден.');
  if (region.owner !== countryId) return fail('Это не ваш регион.');
  const refund = Math.round(BUILDINGS[building.kind].cost * 0.3);
  region.buildings = region.buildings.filter((entry) => entry.id !== buildingId);
  country.money = round1(country.money + refund);
  recomputeFortification(state);
  return OK;
}

/** Radius of a structure in cells, 0 when it has none. */
export function structureRadius(building: BuildingInstance): number {
  return buildingRadius(building.kind, building.level);
}

/** Soldiers currently standing in a region. */
export function regionGarrison(state: GameState, regionId: TerritoryId): number {
  return regionArmy(state, regionId);
}

export { distributeArmy, levelFactor, cellRadiusDistance };
