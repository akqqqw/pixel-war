import { BUILDINGS, buildingEffect, type BuildingKind } from '@/core/buildings/buildings';
import { armyInCells } from '@/core/sim/army';
import {
  cellDefense,
  countryPopulation,
  countryRegions,
  regionArmy,
  territoryShare,
} from '@/core/sim/effects';
import type { BuildingInstance, CountryState, GameState } from '@/core/state/types';
import type { CountryId } from '@/core/types';
import { regionOfCell } from '@/core/world/cells';

export function playerCountry(state: GameState | null): CountryState | null {
  if (!state) return null;
  return state.countries[state.playerCountryId] ?? null;
}

export interface PlayerStats {
  money: number;
  income: number;
  population: number;
  army: number;
  cells: number;
  share: number;
  tanks: number;
  aircraft: number;
}

export function playerStats(state: GameState | null): PlayerStats {
  const empty: PlayerStats = {
    money: 0,
    income: 0,
    population: 0,
    army: 0,
    cells: 0,
    share: 0,
    tanks: 0,
    aircraft: 0,
  };
  if (!state) return empty;
  const country = playerCountry(state);
  if (!country) return empty;
  let cells = 0;
  const index = state.countryOrder.indexOf(country.id);
  for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
    if (state.cellOwner[cell] === index) cells += 1;
  }
  return {
    money: country.money,
    income: country.income,
    population: countryPopulation(state, country.id),
    army: armyInCells(state, country.id),
    cells,
    share: territoryShare(state, country.id),
    tanks: country.tanks,
    aircraft: country.aircraft,
  };
}

export interface CellInfo {
  cell: number;
  land: boolean;
  owner: CountryState | null;
  isOwn: boolean;
  isPlayer?: boolean;
  army: number;
  defense: number;
  regionId: string | null;
  regionName: string;
  regionArmy: number;
  building: BuildingInstance | null;
  buildingDef: (typeof BUILDINGS)[BuildingKind] | null;
  buildingEffect: string | null;
}

export function cellInfo(state: GameState | null, cell: number | null): CellInfo | null {
  if (!state || cell === null || cell < 0 || cell >= state.cellOwner.length) return null;
  const ownerIndex = state.cellOwner[cell] ?? -1;
  const owner = ownerIndex >= 0 ? state.countries[state.countryOrder[ownerIndex]!] ?? null : null;
  const region = regionOfCell(state.world, cell);
  const regionState = region ? state.regions[region.id] : null;
  const building = regionState?.buildings.find((entry) => entry.cell === cell) ?? null;
  return {
    cell,
    land: (state.world.tileTerritory[cell] ?? -1) >= 0,
    owner,
    isOwn: owner?.id === state.playerCountryId,
    army: Math.round((state.cellArmy[cell] ?? 0) * 10) / 10,
    defense: Math.round(cellDefense(state, cell) * 10) / 10,
    regionId: region?.id ?? null,
    regionName: region?.name ?? 'Море',
    regionArmy: region ? regionArmy(state, region.id) : 0,
    building,
    buildingDef: building ? BUILDINGS[building.kind] : null,
    buildingEffect: building ? buildingEffect(building.kind, building.level) : null,
  };
}

export function ownedRegionIds(state: GameState | null, countryId: CountryId | null): string[] {
  if (!state || !countryId) return [];
  return countryRegions(state, countryId).map((region) => region.id);
}

/** Wars of the player with living countries. */
export function activeWars(state: GameState | null): CountryState[] {
  const player = playerCountry(state);
  if (!state || !player) return [];
  return player.warWith
    .map((id) => state.countries[id])
    .filter((country): country is CountryState => !!country && country.alive);
}

export function regionLabel(state: GameState | null, regionId: string | null): string {
  if (!state || !regionId) return '';
  return state.world.territories.find((entry) => entry.id === regionId)?.name ?? '';
}
