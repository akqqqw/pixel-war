import { createWorld, sanitizeGame } from '@/core/state/createGame';
import {
  SAVE_VERSION,
  type CountryState,
  type GameEvent,
  type GameSpeed,
  type GameState,
  type GameStatus,
  type OffensiveOrder,
  type RegionState,
  type Strike,
  type VictoryInfo,
} from '@/core/state/types';
import type { WorldData } from '@/core/world/world';

/**
 * Saves keep only the mutable state: banks, regions, cells, orders and events.
 * The map itself is regenerated from the seed, which keeps saves small and
 * makes them independent of the renderer.
 */
export interface SerializedGame {
  version: number;
  seed: number;
  tick: number;
  speed: GameSpeed;
  status: GameStatus;
  difficulty: GameState['difficulty'];
  playerCountryId: string;
  countryOrder: string[];
  countries: Record<string, CountryState>;
  regions: Record<string, RegionState>;
  cellOwner: number[];
  cellArmy: number[];
  orders: OffensiveOrder[];
  strikes: Strike[];
  events: GameEvent[];
  victory: VictoryInfo | null;
  nextIds: GameState['nextIds'];
}

export function serializeGame(state: GameState): string {
  const data: SerializedGame = {
    version: SAVE_VERSION,
    seed: state.seed,
    tick: state.tick,
    speed: state.speed,
    status: state.status,
    difficulty: state.difficulty,
    playerCountryId: state.playerCountryId,
    countryOrder: state.countryOrder,
    countries: state.countries,
    regions: state.regions,
    cellOwner: Array.from(state.cellOwner),
    cellArmy: Array.from(state.cellArmy, (value) => Math.round(value * 10) / 10),
    orders: state.orders,
    strikes: state.strikes,
    events: state.events.slice(-40),
    victory: state.victory,
    nextIds: state.nextIds,
  };
  return JSON.stringify(data);
}

function rebuildRegions(world: WorldData, saved: Record<string, RegionState>): Record<string, RegionState> {
  const regions: Record<string, RegionState> = {};
  for (const territory of world.territories) {
    const previous = saved[territory.id];
    regions[territory.id] = {
      id: territory.id,
      owner: previous?.owner ?? territory.initialOwner,
      population: previous?.population ?? 1000,
      buildings: (previous?.buildings ?? []).map((building) => ({
        ...building,
        regionId: territory.id,
      })),
      army: 0,
      income: 0,
      capturedAtTick: previous?.capturedAtTick ?? null,
      lastMobilizeTick: previous?.lastMobilizeTick ?? -99,
    };
  }
  return regions;
}

export function deserializeGame(raw: string): GameState {
  const parsed = JSON.parse(raw) as SerializedGame;
  if (!parsed || typeof parsed !== 'object') throw new Error('Повреждённое сохранение');
  if (parsed.version !== SAVE_VERSION) {
    throw new Error(`Несовместимая версия сохранения (${parsed.version}). Начните новую кампанию.`);
  }
  if (!Array.isArray(parsed.cellOwner)) throw new Error('В сохранении нет карты');
  if (!Number.isFinite(parsed.seed)) throw new Error('В сохранении нет карты');
  if (!parsed.countries || !parsed.regions) throw new Error('В сохранении нет государств');

  const world = createWorld(parsed.seed);
  const size = world.width * world.height;
  if (parsed.cellOwner.length !== size) throw new Error('Размер карты не совпадает');

  const state: GameState = {
    version: SAVE_VERSION,
    seed: parsed.seed,
    tick: parsed.tick,
    speed: parsed.speed,
    status: parsed.status,
    difficulty: parsed.difficulty,
    playerCountryId: parsed.playerCountryId,
    countryOrder: parsed.countryOrder,
    countries: parsed.countries,
    regions: rebuildRegions(world, parsed.regions),
    world,
    cellOwner: Int16Array.from(parsed.cellOwner),
    cellArmy: Float32Array.from(parsed.cellArmy ?? []),
    cellFort: new Float32Array(size),
    cellAir: new Float32Array(size),
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
    strikes: Array.isArray(parsed.strikes) ? parsed.strikes : [],
    events: Array.isArray(parsed.events) ? parsed.events : [],
    victory: parsed.victory ?? null,
    lastCaptured: [],
    mapVersion: 0,
    nextIds: parsed.nextIds ?? { building: 1, event: 1, order: 1, strike: 1 },
  };

  sanitizeGame(state);
  return state;
}
