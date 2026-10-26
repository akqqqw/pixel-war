import type { BuildingKind } from '@/core/buildings/buildings';
import type { CountryId, TerritoryId } from '@/core/types';
import type { WorldData } from '@/core/world/world';

export const SAVE_VERSION = 2;

export type GameSpeed = 0 | 1 | 2 | 4;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameStatus = 'playing' | 'victory' | 'defeat';

export interface BuildingInstance {
  id: string;
  kind: BuildingKind;
  /** First map tile of the structure (used for drawing and radius checks). */
  tile: number;
}

export interface TerritoryState {
  id: TerritoryId;
  owner: CountryId | null;
  /** Thousands of people. Grows with cities, feeds the army. */
  population: number;
  /** Abstract army points — no unit models, just numbers. */
  army: number;
  buildings: BuildingInstance[];
  /** Money per tick, refreshed by the economy tick. */
  income: number;
  /** Set when the territory was taken (for the map flash). */
  capturedAtTick: number | null;
}

export interface CountryState {
  id: CountryId;
  name: string;
  shortName: string;
  color: string;
  accent: string;
  isPlayer: boolean;
  capitalTerritoryId: TerritoryId | null;
  money: number;
  income: number;
  /** True when the treasury is empty and the army is disbanding. */
  unpaid: boolean;
  alive: boolean;
  /** AI only: 0..1 expansion appetite. */
  aggression: number;
  warWith: CountryId[];
  stats: {
    buildings: number;
    captured: number;
    lost: number;
    missiles: number;
  };
}

export interface GameEvent {
  id: string;
  tick: number;
  kind: 'build' | 'capture' | 'war' | 'peace' | 'missile' | 'victory' | 'defeat';
  text: string;
  countryId?: CountryId;
  territoryId?: TerritoryId;
}

export interface VictoryInfo {
  kind: 'domination' | 'military';
  countryId: CountryId;
  title: string;
  description: string;
}

export interface GameState {
  version: number;
  seed: number;
  difficulty: Difficulty;
  tick: number;
  speed: GameSpeed;
  status: GameStatus;
  playerCountryId: CountryId;
  world: WorldData;
  countries: Record<CountryId, CountryState>;
  territories: Record<TerritoryId, TerritoryState>;
  /** Country index per map tile, -1 for water/neutral. */
  tileOwner: Int16Array;
  /** `countryOrder[i]` is the country stored as index `i` in `tileOwner`. */
  countryOrder: CountryId[];
  events: GameEvent[];
  nextIds: { building: number; event: number };
  /** Tick when each missile launcher may fire again, keyed by building id. */
  missileReady: Record<string, number>;
  victory: VictoryInfo | null;
  /** Number of cells that changed hands during the last tick (HUD read-only). */
  lastFlips: number;
}

export function countryIndexOf(state: GameState, countryId: CountryId | null | undefined): number {
  if (!countryId) return -1;
  return state.countryOrder.indexOf(countryId);
}

export function countryAt(state: GameState, index: number): CountryState | null {
  const id = state.countryOrder[index];
  return id ? state.countries[id] ?? null : null;
}
