import type { CountryId, Resources, TerritoryId } from '@/core/types';
import type { CountryState, GameState, TerritoryState } from '@/core/state/types';
import type { TerritoryStatic } from '@/core/world/world';
import { useGameStore } from '@/store/gameStore';
import { armyCount, armyPower, type Army } from '@/core/units/army';
import { LAND_UNIT_TYPES, type LandUnitType } from '@/core/units/unitTypes';
import { defensePower, territoryStatic } from '@/core/sim/combat';
import { forecastBattle, type BattleForecast } from '@/core/combat/battle';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';

/** Re-renders on every simulation commit and returns the current game snapshot. */
export function useGameSnapshot(): GameState | null {
  useGameStore((state) => state.revision);
  return useGameStore.getState().game;
}

export function playerCountry(game: GameState): CountryState | undefined {
  return game.countries[game.playerCountryId];
}

export function otherCountries(game: GameState): CountryState[] {
  return Object.values(game.countries).filter(
    (country) => country.id !== game.playerCountryId && country.alive,
  );
}

export function territoryState(game: GameState, id: TerritoryId | null | undefined): TerritoryState | null {
  if (!id) return null;
  return game.territories[id] ?? null;
}

export function territoryMeta(game: GameState, id: TerritoryId | null | undefined): TerritoryStatic | null {
  if (!id) return null;
  return territoryStatic(game, id);
}

export function terrainLabel(code: TerrainCode | undefined): string {
  return code !== undefined ? TERRAIN_INFO[code].name : '—';
}

export function ownedTerritories(game: GameState, countryId: CountryId): TerritoryStatic[] {
  return game.world.territories.filter((territory) => game.territories[territory.id]?.owner === countryId);
}

export function totalArmy(game: GameState, countryId: CountryId): { army: Army; total: number; power: number } {
  const army: Army = {};
  for (const territory of game.world.territories) {
    const state = game.territories[territory.id];
    if (!state || state.owner !== countryId) continue;
    for (const type of LAND_UNIT_TYPES) {
      const count = state.garrison[type] ?? 0;
      if (count > 0) army[type] = (army[type] ?? 0) + count;
    }
  }
  for (const group of Object.values(game.groups)) {
    if (group.country !== countryId) continue;
    for (const type of LAND_UNIT_TYPES) {
      const count = group.army[type] ?? 0;
      if (count > 0) army[type] = (army[type] ?? 0) + count;
    }
  }
  return { army, total: armyCount(army), power: armyPower(army) };
}

export function armySize(army: Army): number {
  return armyCount(army);
}

export function territoryDefense(game: GameState, id: TerritoryId): number {
  return Math.round(defensePower(game, id));
}

export function territoryAttackForecast(
  game: GameState,
  attacker: Army,
  targetId: TerritoryId,
): BattleForecast {
  const meta = territoryStatic(game, targetId);
  const ts = game.territories[targetId];
  const terrain = meta ? TERRAIN_INFO[meta.dominantTerrain as TerrainCode] : TERRAIN_INFO[2];
  const isCapital = ts ? game.countries[ts.owner]?.capitalTerritoryId === targetId : false;
  const structure = ts ? 1 + (ts.economyLevel - 1) * 0.12 + (isCapital ? 0.15 : 0) : 1;
  return forecastBattle({
    attacker,
    defender: ts?.garrison ?? {},
    attackerTerrainMod: terrain.attackModifier,
    defenderTerrainBonus: terrain.defenseBonus,
    defenderStructureBonus: structure,
  });
}

export function relationTone(value: number): string {
  if (value <= -40) return 'var(--red)';
  if (value < 0) return '#e0a458';
  if (value >= 40) return 'var(--green)';
  return 'var(--muted)';
}

export function relationLabel(value: number): string {
  if (value <= -60) return 'враждебность';
  if (value <= -20) return 'напряжённость';
  if (value < 20) return 'нейтралитет';
  if (value < 60) return 'дружелюбие';
  return 'союзнические';
}

export function isAtWar(game: GameState, a: CountryId, b: CountryId): boolean {
  return game.countries[a]?.warWith.includes(b) ?? false;
}

export function resourceList(resources: Resources): { key: keyof Resources; value: number }[] {
  return [
    { key: 'money', value: resources.money },
    { key: 'metal', value: resources.metal },
    { key: 'oil', value: resources.oil },
    { key: 'energy', value: resources.energy },
  ];
}

export function unitTypeName(type: LandUnitType): string {
  return type;
}

export function sortedGarrison(army: Army): { type: LandUnitType; count: number }[] {
  return LAND_UNIT_TYPES.map((type) => ({ type, count: army[type] ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function battleOutcomeLabel(outcome: 'attackerWin' | 'defenderWin' | 'stalemate'): string {
  if (outcome === 'attackerWin') return 'Атака удалась';
  if (outcome === 'defenderWin') return 'Оборона выстояла';
  return 'Без результата';
}

export function percent(value: number): number {
  return Math.round(value * 100);
}
