import { BUILDINGS } from '@/core/buildings/buildings';
import { countryTotals } from '@/core/sim/economy';
import { defenseStrength, isBorderTerritory } from '@/core/sim/effects';
import type { CountryState, GameState, TerritoryState } from '@/core/state/types';
import type { TerritoryId } from '@/core/types';

export function playerCountry(state: GameState | null): CountryState | null {
  if (!state) return null;
  return state.countries[state.playerCountryId] ?? null;
}

export function selectedTerritory(state: GameState | null, id: TerritoryId | null): TerritoryState | null {
  if (!state || !id) return null;
  return state.territories[id] ?? null;
}

export function selectedStatic(state: GameState | null, id: TerritoryId | null) {
  if (!state || !id) return null;
  return state.world.territories.find((territory) => territory.id === id) ?? null;
}

export function playerTotals(state: GameState | null) {
  if (!state) return { population: 0, army: 0, territories: 0 };
  return countryTotals(state, state.playerCountryId);
}

export function ownedCount(state: GameState | null, countryId: string): number {
  if (!state) return 0;
  return Object.values(state.territories).filter((territory) => territory.owner === countryId).length;
}

export function territoryDefense(state: GameState | null, id: TerritoryId): number {
  if (!state) return 0;
  return Math.round(defenseStrength(state, id));
}

export function isBorder(state: GameState | null, id: TerritoryId): boolean {
  if (!state) return false;
  return isBorderTerritory(state, id);
}

export function buildingLabel(kind: keyof typeof BUILDINGS): string {
  return BUILDINGS[kind].name;
}

/** Wars of the player with living countries. */
export function activeWars(state: GameState | null): CountryState[] {
  const player = playerCountry(state);
  if (!state || !player) return [];
  return player.warWith
    .map((id) => state.countries[id])
    .filter((country): country is CountryState => !!country && country.alive);
}
