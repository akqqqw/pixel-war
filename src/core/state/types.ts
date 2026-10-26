import type { CountryId, Resources, TerritoryId } from '@/core/types';
import type { WorldData } from '@/core/world/world';
import type { Army } from '@/core/units/army';
import type { LandUnitType } from '@/core/units/unitTypes';

export const SAVE_VERSION = 1;

export type GameSpeed = 0 | 1 | 2 | 4;
export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameStatus = 'playing' | 'victory' | 'defeat';

export interface ResourceDeficit {
  money: boolean;
  metal: boolean;
  oil: boolean;
  energy: boolean;
}

export interface TerritoryState {
  id: TerritoryId;
  owner: CountryId;
  population: number;
  /** 1..3 — infrastructure that boosts yields and defence. */
  economyLevel: number;
  /** Stationary defenders. Mobile detachments live in `groups`. */
  garrison: Army;
  /** 0..1 — recently conquered land earns less until it settles. */
  unrest: number;
  /** Tick at which the territory was captured (for the map flash animation). */
  capturedAtTick: number | null;
  /** Cached per-tick income, recomputed by the economy tick (UI read-only). */
  lastYield: Resources;
}

export type OrderKind = 'move' | 'attack' | 'defend';

export interface UnitOrder {
  kind: OrderKind;
  targetTerritoryId: TerritoryId;
}

export interface GroupMovement {
  path: TerritoryId[];
  /** Index of the territory the group is heading to. */
  step: number;
  /** 0..1 progress towards `path[step]`. */
  progress: number;
  milliseconds: number;
  originTerritoryId: TerritoryId;
}

export interface UnitGroup {
  id: string;
  country: CountryId;
  /** Territory the group is standing in (or left from while moving). */
  territoryId: TerritoryId;
  army: Army;
  order: UnitOrder | null;
  movement: GroupMovement | null;
  /** Set when the group was sent to conquer: becomes the target on arrival. */
  intent: 'move' | 'attack';
  /** Tick when the group arrived, used for map animations. */
  arrivedAtTick: number;
}

export interface CountryState {
  id: CountryId;
  name: string;
  color: string;
  accent: string;
  isPlayer: boolean;
  capitalTerritoryId: TerritoryId | null;
  resources: Resources;
  /** Net income per tick (positive or negative), refreshed every tick. */
  income: Resources;
  deficit: ResourceDeficit;
  reputation: number;
  /** Relation score -100..100 towards each other country. */
  relations: Record<CountryId, number>;
  warWith: CountryId[];
  alive: boolean;
  /** AI only: how aggressively this nation expands (0..1). */
  aggression: number;
  stats: {
    produced: number;
    captured: number;
    lost: number;
    battlesWon: number;
    battlesLost: number;
  };
}

export interface ProductionItem {
  id: string;
  country: CountryId;
  territoryId: TerritoryId;
  unit: LandUnitType;
  ticksLeft: number;
  totalTicks: number;
}

export interface BattleRoundLog {
  index: number;
  attackerDamage: number;
  defenderDamage: number;
  attackerHpLeft: number;
  defenderHpLeft: number;
}

export interface BattleReport {
  id: string;
  tick: number;
  territoryId: TerritoryId;
  territoryName: string;
  attackerCountry: CountryId;
  defenderCountry: CountryId;
  attackerArmy: Army;
  defenderArmy: Army;
  attackerLosses: Army;
  defenderLosses: Army;
  outcome: 'attackerWin' | 'defenderWin' | 'stalemate';
  captured: boolean;
  rounds: BattleRoundLog[];
  attackerTerrainMod: number;
  defenderTerrainBonus: number;
}

export type GameEventKind =
  | 'capture'
  | 'battle'
  | 'production'
  | 'economy'
  | 'diplomacy'
  | 'victory'
  | 'system';

export interface GameEvent {
  id: string;
  tick: number;
  kind: GameEventKind;
  message: string;
  countryId?: CountryId;
  territoryId?: TerritoryId;
  previousOwnerId?: CountryId;
}

export interface AiState {
  country: CountryId;
  difficulty: Difficulty;
  /** Tick when the AI will reconsider its plans. */
  nextThinkTick: number;
  /** Territory the AI wants to attack next (debug / HUD). */
  focusTarget: TerritoryId | null;
}

export interface VictoryInfo {
  kind: 'domination' | 'military' | 'economic' | 'none';
  countryId: CountryId;
  title: string;
  description: string;
}

export interface GameState {
  version: number;
  seed: number;
  world: WorldData;
  status: GameStatus;
  difficulty: Difficulty;
  playerCountryId: CountryId;
  countries: Record<CountryId, CountryState>;
  territories: Record<TerritoryId, TerritoryState>;
  groups: Record<string, UnitGroup>;
  production: ProductionItem[];
  battles: BattleReport[];
  events: GameEvent[];
  tick: number;
  /** Milliseconds accumulated inside the current tick (0..1000). */
  tickProgressMs: number;
  speed: GameSpeed;
  startedAt: number;
  playedMs: number;
  nextIds: { group: number; production: number; event: number; battle: number };
  selectedTerritoryId: TerritoryId | null;
  selectedGroupIds: string[];
  victory: VictoryInfo | null;
  rngState: number;
  ai: Record<CountryId, AiState>;
  camera: { x: number; y: number; zoom: number };
}
