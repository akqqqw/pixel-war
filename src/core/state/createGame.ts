import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import { BALANCE } from '@/core/sim/balance';
import { countryIndexOf, SAVE_VERSION, type CountryState, type Difficulty, type GameState, type TerritoryState } from '@/core/state/types';
import { clamp, type CountryId } from '@/core/types';
import type { WorldData } from '@/core/world/world';
import { generateWorld } from '@/core/world/generateWorld';
import { COUNTRIES, countryDef } from '@/data/countries';
import { placementTile } from '@/core/sim/actions';

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

const COUNTRY_BONUS_MONEY: Record<string, number> = { aquilonia: 300, draconia: 0, veldania: 0 };
const COUNTRY_BONUS_ARMY: Record<string, number> = { aquilonia: 0, draconia: 40, veldania: 0 };
const COUNTRY_BONUS_POPULATION: Record<string, number> = { aquilonia: 1, draconia: 1, veldania: 1.25 };

export function createGame(options: CreateGameOptions): GameState {
  const world = options.world ?? createWorld(options.seed);
  const countryOrder = COUNTRIES.map((country) => country.id);
  const tileOwner = new Int16Array(world.width * world.height).fill(-1);

  const countries: Record<CountryId, CountryState> = {};
  const territories: Record<string, TerritoryState> = {};
  let buildingCounter = 0;

  for (const def of COUNTRIES) {
    countries[def.id] = {
      id: def.id,
      name: def.name,
      shortName: def.shortName,
      color: def.colors.primary,
      accent: def.colors.accent,
      isPlayer: def.id === options.playerCountryId,
      capitalTerritoryId: null,
      money: BALANCE.startMoney + (COUNTRY_BONUS_MONEY[def.id] ?? 0),
      income: 0,
      unpaid: false,
      alive: true,
      aggression: def.id === 'draconia' ? 0.75 : def.id === 'veldania' ? 0.55 : 0.4,
      warWith: [],
      stats: { buildings: 0, captured: 0, lost: 0, missiles: 0 },
    };
  }

  for (const staticTerritory of world.territories) {
    const owner = staticTerritory.initialOwner ?? countryOrder[0]!;
    const population =
      Math.round(
        Math.max(70, staticTerritory.population / BALANCE.populationScale) *
          (COUNTRY_BONUS_POPULATION[owner] ?? 1) *
          (staticTerritory.isCapital ? 1.4 : 1),
      ) || 70;
    const army = staticTerritory.isCapital
      ? BALANCE.startCapitalArmy + (COUNTRY_BONUS_ARMY[owner] ?? 0)
      : BALANCE.startArmy;

    const state: TerritoryState = {
      id: staticTerritory.id,
      owner,
      population,
      army,
      buildings: [],
      income: 0,
      capturedAtTick: null,
    };

    // Every state starts with a couple of structures so the first minutes matter.
    const starterBuildings: BuildingKind[] = staticTerritory.isCapital ? ['factory', 'city'] : [];
    if (staticTerritory.isCapital && staticTerritory.isCoastal) starterBuildings.push('port');
    for (const kind of starterBuildings) {
      state.buildings.push({
        id: `b${buildingCounter}`,
        kind,
        tile: placementTile(world, staticTerritory.id, state.buildings.length),
      });
      buildingCounter += 1;
    }

    territories[staticTerritory.id] = state;
    const ownerIndex = countryIndexOf({ countryOrder } as GameState, owner);
    for (const tile of staticTerritory.tiles) tileOwner[tile] = ownerIndex;
    if (staticTerritory.isCapital) countries[owner]!.capitalTerritoryId = staticTerritory.id;
  }

  // Country specific starting bonus buildings (port / tank plant / factory).
  for (const def of COUNTRIES) {
    const capital = countries[def.id]?.capitalTerritoryId;
    if (!capital) continue;
    const capitalState = territories[capital];
    if (!capitalState) continue;
    const kind = def.bonus.capitalBuildings?.[0] as BuildingKind | undefined;
    if (!kind) continue;
    if (capitalState.buildings.some((building) => building.kind === kind)) continue;
    const staticTerritory = world.territories.find((t) => t.id === capital)!;
    if (BUILDINGS[kind].coastal && !staticTerritory.isCoastal) continue;
    capitalState.buildings.push({
      id: `b${buildingCounter}`,
      kind,
      tile: placementTile(world, capital, capitalState.buildings.length),
    });
    buildingCounter += 1;
  }

  const playerId = countries[options.playerCountryId] ? options.playerCountryId : countryOrder[0]!;
  const capitalId = countries[playerId]?.capitalTerritoryId ?? world.territories[0]?.id ?? null;

  const state: GameState = {
    version: SAVE_VERSION,
    seed: options.seed,
    difficulty: options.difficulty,
    tick: 0,
    speed: 1,
    status: 'playing',
    playerCountryId: playerId,
    world,
    countries,
    territories,
    tileOwner,
    countryOrder,
    events: [],
    nextIds: { building: buildingCounter, event: 1 },
    missileReady: {},
    victory: null,
    lastFlips: 0,
  };

  if (capitalId) {
    const country = state.countries[playerId];
    if (country) {
      state.events.push({
        id: `e${state.nextIds.event}`,
        tick: 0,
        kind: 'war',
        text: `${country.name}: кампания началась.`,
        countryId: country.id,
      });
      state.nextIds.event += 1;
    }
  }

  return state;
}

/** Sanitises a loaded save so no number can go negative. */
export function sanitizeGame(state: GameState): void {
  for (const country of Object.values(state.countries)) {
    country.money = clamp(country.money, 0, Number.MAX_SAFE_INTEGER);
    country.income = Number.isFinite(country.income) ? country.income : 0;
    country.warWith = country.warWith.filter((id) => id !== country.id && !!state.countries[id]);
  }
  for (const territory of Object.values(state.territories)) {
    territory.population = clamp(territory.population, 5, 100_000);
    territory.army = clamp(territory.army, 0, 100_000);
    territory.income = Number.isFinite(territory.income) ? territory.income : 0;
    if (!territory.buildings) territory.buildings = [];
  }
  state.tick = Math.max(0, Math.floor(state.tick));
  if (state.speed !== 0 && state.speed !== 1 && state.speed !== 2 && state.speed !== 4) state.speed = 1;
}

export { countryDef };
