import type { BuildingKind } from '@/core/buildings/buildings';
import { BALANCE } from '@/core/sim/balance';
import { recomputeFortification } from '@/core/sim/effects';
import { distributeArmy } from '@/core/sim/army';
import { refreshTotals } from '@/core/sim/regions';
import {
  SAVE_VERSION,
  type BuildingInstance,
  type CountryState,
  type Difficulty,
  type GameState,
  type RegionState,
} from '@/core/state/types';
import type { CountryId } from '@/core/types';
import { isCoastalCell } from '@/core/world/cells';
import { generateWorld } from '@/core/world/generateWorld';
import { COUNTRIES } from '@/data/countries';
import type { WorldData } from '@/core/world/world';

export function createWorld(seed: number): WorldData {
  return generateWorld({
    seed,
    countries: COUNTRIES.map((country) => ({ id: country.id, capitalName: country.capitalName })),
  });
}

export interface CreateGameOptions {
  seed: number;
  playerCountryId: CountryId;
  difficulty: Difficulty;
  world?: WorldData;
}

function countCellsByOwner(tileOwner: Int16Array, index: number): number[] {
  const out: number[] = [];
  for (let cell = 0; cell < tileOwner.length; cell += 1) if (tileOwner[cell] === index) out.push(cell);
  return out;
}

/**
 * Builds a fresh campaign: the world comes from the seed, every land cell gets
 * an owner, regions get people and the starting army is spread over the cells.
 */
export function createGame(options: CreateGameOptions): GameState {
  const world = options.world ?? createWorld(options.seed);
  const countryOrder = COUNTRIES.map((country) => country.id);
  const size = world.width * world.height;

  const cellOwner = new Int16Array(size).fill(-1);
  for (const territory of world.territories) {
    const index = countryOrder.indexOf(territory.initialOwner ?? '');
    if (index < 0) continue;
    for (const cell of territory.tiles) cellOwner[cell] = index;
  }

  const countries: Record<CountryId, CountryState> = {};
  for (const [index, def] of COUNTRIES.entries()) {
    countries[def.id] = {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      color: def.colors.primary,
      accent: def.colors.accent,
      isPlayer: def.id === options.playerCountryId,
      money: BALANCE.startMoney + (def.bonus.money ?? 0),
      income: 0,
      army: 0,
      population: 0,
      tanks: 0,
      aircraft: 0,
      alive: countCellsByOwner(cellOwner, index).length > 0,
      capitalRegionId: null,
      warWith: [],
      unpaid: false,
      lastMobilizeTick: -99,
      tankProgress: 0,
      aircraftProgress: 0,
      stats: { built: 0, captured: 0, lost: 0, missiles: 0, airStrikes: 0 },
    };
  }

  const regions: Record<string, RegionState> = {};
  for (const territory of world.territories) {
    regions[territory.id] = {
      id: territory.id,
      owner: territory.initialOwner,
      population: 0,
      buildings: [],
      army: 0,
      income: 0,
      capturedAtTick: null,
      lastMobilizeTick: -99,
    };
  }

  const cellArmy = new Float32Array(size);

  // Starting population and army.
  for (const territory of world.territories) {
    const owner = territory.initialOwner;
    if (!owner) continue;
    const def = COUNTRIES.find((country) => country.id === owner);
    const region = regions[territory.id]!;
    region.population = Math.round(
      (territory.isCapital ? BALANCE.startCapitalPopulation : BALANCE.startPopulation) *
        (def?.bonus.populationMultiplier ?? 1),
    );
    if (territory.isCapital) countries[owner]!.capitalRegionId = territory.id;
    const soldiers =
      BALANCE.startArmy + (territory.isCapital ? BALANCE.startCapitalArmy + (def?.bonus.capitalArmy ?? 0) : 0);
    void soldiers;
  }

  // Capital structures from the national bonus.
  let buildingCounter = 0;
  for (const def of COUNTRIES) {
    const capitalId = countries[def.id]?.capitalRegionId;
    if (!capitalId) continue;
    const territory = world.territories.find((entry) => entry.id === capitalId);
    if (!territory) continue;
    for (const kind of def.bonus.capitalBuildings ?? []) {
      const cells = territory.tiles.filter(
        (cell) => cellOwner[cell] === countryOrder.indexOf(def.id),
      );
      const cell = kind === 'port'
        ? cells.find((entry) => isCoastalCell(world, entry))
        : cells[Math.floor(cells.length / 2)];
      if (cell === undefined) continue;
      const building: BuildingInstance = {
        id: `b${buildingCounter}`,
        kind: kind as BuildingKind,
        level: 1,
        cell,
        regionId: territory.id,
        readyAtTick: 0,
      };
      buildingCounter += 1;
      regions[territory.id]!.buildings.push(building);
    }
  }

  const state: GameState = {
    version: SAVE_VERSION,
    seed: world.seed,
    tick: 0,
    speed: 1,
    status: 'playing',
    difficulty: options.difficulty,
    playerCountryId: options.playerCountryId,
    countryOrder,
    countries,
    regions,
    world,
    cellOwner,
    cellArmy,
    cellFort: new Float32Array(size),
    cellAir: new Float32Array(size),
    orders: [],
    strikes: [],
    events: [],
    victory: null,
    lastCaptured: [],
    nextIds: { building: buildingCounter, event: 1, order: 1, strike: 1 },
  };

  // Starting armies stand on the borders of their regions, not spread thin.
  for (const territory of world.territories) {
    const owner = territory.initialOwner;
    if (!owner) continue;
    const def = COUNTRIES.find((country) => country.id === owner);
    const soldiers =
      BALANCE.startArmy + (territory.isCapital ? BALANCE.startCapitalArmy + (def?.bonus.capitalArmy ?? 0) : 0);
    distributeArmy(state, territory.id, soldiers);
  }

  recomputeFortification(state);
  refreshTotals(state);

  const player = countries[options.playerCountryId];
  if (player) {
    state.events.push({
      id: 'e0',
      tick: 0,
      kind: 'war',
      text: `${player.name}: кампания началась.`,
      countryId: player.id,
    });
  }
  return state;
}

/** Repairs a loaded save: every number and reference is validated. */
export function sanitizeGame(state: GameState): void {
  const size = state.world.width * state.world.height;
  if (!state.cellOwner || state.cellOwner.length !== size) {
    state.cellOwner = new Int16Array(size).fill(-1);
  }
  if (!state.cellArmy || state.cellArmy.length !== size) state.cellArmy = new Float32Array(size);
  if (!state.cellFort || state.cellFort.length !== size) state.cellFort = new Float32Array(size);
  if (!state.cellAir || state.cellAir.length !== size) state.cellAir = new Float32Array(size);
  if (!Array.isArray(state.orders)) state.orders = [];
  if (!Array.isArray(state.strikes)) state.strikes = [];
  if (!Array.isArray(state.events)) state.events = [];
  if (!Array.isArray(state.lastCaptured)) state.lastCaptured = [];

  for (let cell = 0; cell < size; cell += 1) {
    const owner = state.cellOwner[cell] ?? -1;
    if (owner >= state.countryOrder.length) state.cellOwner[cell] = -1;
    const army = state.cellArmy[cell] ?? 0;
    state.cellArmy[cell] = Number.isFinite(army) ? Math.max(0, Math.min(1_000_000, army)) : 0;
  }

  for (const country of Object.values(state.countries)) {
    country.money = Number.isFinite(country.money) ? Math.max(0, country.money) : 0;
    country.tanks = Math.max(0, Math.round(country.tanks || 0));
    country.aircraft = Math.max(0, Math.round(country.aircraft || 0));
    country.warWith = (country.warWith ?? []).filter((id) => id !== country.id && !!state.countries[id]);
    if (country.capitalRegionId && !state.regions[country.capitalRegionId]) country.capitalRegionId = null;
  }

  for (const region of Object.values(state.regions)) {
    region.population = Number.isFinite(region.population) ? Math.max(1, region.population) : 1;
    region.buildings = (region.buildings ?? []).filter(
      (building) => !!building && !!building.kind && Number.isFinite(building.cell),
    );
    if (region.owner && !state.countries[region.owner]) region.owner = null;
    if (!Number.isFinite(region.lastMobilizeTick)) region.lastMobilizeTick = -99;
  }

  state.tick = Math.max(0, Math.floor(state.tick || 0));
  if (![0, 1, 2, 4].includes(state.speed)) state.speed = 1;
  for (const order of state.orders) {
    if (!Number.isFinite(order.stalledTicks)) order.stalledTicks = 0;
    if (!Number.isFinite(order.share)) order.share = 0.5;
    if (!Number.isFinite(order.delivered)) order.delivered = 0;
  }
  state.orders = state.orders.filter(
    (order) =>
      !!order &&
      !!state.countries[order.countryId] &&
      Number.isFinite(order.targetCell) &&
      order.targetCell >= 0 &&
      order.targetCell < size,
  );
  state.strikes = state.strikes.filter(
    (strike) => !!strike && strike.targetCell >= 0 && strike.targetCell < size,
  );

  recomputeFortification(state);
  refreshTotals(state);
}
