import type { BuildingKind } from '@/core/buildings/buildings';
import type { CountryId, TerritoryId } from '@/core/types';
import type { WorldData } from '@/core/world/world';

export const SAVE_VERSION = 3;

export type GameSpeed = 0 | 1 | 2 | 4;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameStatus = 'playing' | 'victory' | 'defeat';

export interface BuildingInstance {
  id: string;
  kind: BuildingKind;
  /** 1..3, every level multiplies the effect. */
  level: number;
  /** Map cell the structure stands on. */
  cell: number;
  /** Region of the cell, kept as a denormalised hint for the UI. */
  regionId: TerritoryId;
  /** Tick when the next missile / aircraft leaves the structure. */
  readyAtTick: number;
}

export interface RegionState {
  id: TerritoryId;
  /** Derived from the cell map every tick. */
  owner: CountryId | null;
  /** Citizens, people. Grows with cities, feeds mobilisation and taxes. */
  population: number;
  buildings: BuildingInstance[];
  /** Soldiers standing in the region, refreshed every tick. */
  army: number;
  /** Gold per second the region generates before upkeep, refreshed every tick. */
  income: number;
  capturedAtTick: number | null;
  lastMobilizeTick: number;
}

export interface CountryState {
  id: CountryId;
  name: string;
  shortName: string;
  color: string;
  accent: string;
  isPlayer: boolean;
  money: number;
  /** Gold per second, refreshed every tick and shown in the HUD. */
  income: number;
  /** Soldiers and citizens, refreshed every tick. */
  army: number;
  population: number;
  /** Numeric military hardware — never drawn as sprites. */
  tanks: number;
  aircraft: number;
  alive: boolean;
  capitalRegionId: TerritoryId | null;
  warWith: CountryId[];
  unpaid: boolean;
  lastMobilizeTick: number;
  tankProgress: number;
  aircraftProgress: number;
  stats: {
    built: number;
    /** Regions taken from an enemy. */
    captured: number;
    /** Single cells taken from an enemy — the finest war progress. */
    cellsTaken: number;
    lost: number;
    missiles: number;
    airStrikes: number;
  };
}

/** A planned push: troops walk from the source region towards the target cell. */
/** One point of the campaign graph: land share of every country. */
export interface HistorySample {
  tick: number;
  /** Share of the land map per country index in `countryOrder`, 0..1. */
  share: number[];
}

export interface OffensiveOrder {
  id: string;
  countryId: CountryId;
  sourceRegionId: TerritoryId;
  targetCell: number;
  /** Share of the source region army committed to the push, 0.1..1. */
  share: number;
  committed: number;
  /** Soldiers already delivered to the front, shown in the interface. */
  delivered: number;
  active: boolean;
  /** Ticks without progress; the push picks a new border when it grows. */
  stalledTicks: number;
  startedAtTick: number;
}

export interface Strike {
  id: string;
  kind: 'missile' | 'air';
  countryId: CountryId;
  fromCell: number;
  targetCell: number;
  fireAtTick: number;
  resolveAtTick: number;
  /** Damage decided when the strike was launched. */
  power: number;
}

export interface GameEvent {
  id: string;
  tick: number;
  kind:
    | 'build'
    | 'upgrade'
    | 'capture'
    | 'war'
    | 'peace'
    | 'missile'
    | 'air'
    | 'mobilize'
    | 'victory'
    | 'defeat';
  text: string;
  countryId?: CountryId;
  cell?: number;
}

export interface VictoryInfo {
  kind: 'domination' | 'military' | 'defeat';
  countryId: CountryId;
  title: string;
  description: string;
}

export interface GameState {
  version: number;
  seed: number;
  tick: number;
  speed: GameSpeed;
  status: GameStatus;
  difficulty: Difficulty;
  playerCountryId: CountryId;
  countryOrder: CountryId[];
  countries: Record<CountryId, CountryState>;
  regions: Record<TerritoryId, RegionState>;
  world: WorldData;

  /** Owner index into `countryOrder`, -1 for water. */
  cellOwner: Int16Array;
  /** Soldiers standing on each land cell. */
  cellArmy: Float32Array;
  /** Barricade defence bonus per cell (0..BALANCE.maxFortDefense). */
  cellFort: Float32Array;
  /** AA interception chance per cell (0..BALANCE.maxInterceptChance). */
  cellAir: Float32Array;

  orders: OffensiveOrder[];
  strikes: Strike[];
  events: GameEvent[];
  victory: VictoryInfo | null;
  /** Cells captured during the last tick, used for the map flash. */
  lastCaptured: number[];
  /** Cells where a fight was resolved this tick (sampled), used for sparks. */
  lastFights: number[];
  /** Coarse campaign graph, sampled every `BALANCE.historyInterval` ticks. */
  history: HistorySample[];
  /**
   * Bumped every time a cell changes hands. The renderer watches this number
   * instead of comparing the whole owner map each frame (O(1) instead of O(n)).
   */
  mapVersion: number;
  nextIds: { building: number; event: number; order: number; strike: number };
}

export function countryIndexOf(state: GameState, countryId: CountryId | null | undefined): number {
  if (!countryId) return -1;
  return state.countryOrder.indexOf(countryId);
}

export function countryIdAt(state: GameState, index: number): CountryId | null {
  return state.countryOrder[index] ?? null;
}
