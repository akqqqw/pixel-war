import { createRng } from '@/core/rng';
import type { CountryId, Resources, TerritoryId } from '@/core/types';
import { zeroResources } from '@/core/types';
import type { AiState, CountryState, Difficulty, GameState, TerritoryState } from '@/core/state/types';
import { SAVE_VERSION } from '@/core/state/types';
import { makeArmy, type Army } from '@/core/units/army';
import { generateWorld } from '@/core/world/generateWorld';
import { MAP_WIDTH, PIXELS_PER_TILE, type Vec2, type WorldData } from '@/core/world/world';
import { COUNTRIES, countryDef } from '@/data/countries';
import { computeEconomy, territoryYield } from '@/core/economy/economy';

export const DEFAULT_STARTING_RESOURCES: Resources = {
  money: 620,
  metal: 240,
  oil: 160,
  energy: 110,
};

const AI_CADENCE: Record<Difficulty, number> = { easy: 26, normal: 18, hard: 12 };
const AI_AGGRESSION: Record<Difficulty, number> = { easy: 0.28, normal: 0.52, hard: 0.85 };

export function createWorld(seed: number): WorldData {
  return generateWorld({
    seed,
    countries: COUNTRIES.map((country) => ({ id: country.id, capitalName: country.capitalName })),
  });
}

function startingGarrison(isCapital: boolean, bonus: Partial<Record<string, number>> | undefined, rng: () => number): Army {
  if (isCapital) {
    return makeArmy({
      mbt: 2 + (bonus?.mbt ?? 0),
      ifv: 1 + (bonus?.ifv ?? 0),
      apc: 1 + (bonus?.apc ?? 0),
      spg: bonus?.spg ?? 0,
    });
  }
  const roll = rng();
  if (roll < 0.34) return makeArmy({ lightTank: 1 });
  if (roll < 0.62) return makeArmy({ apc: 1 });
  if (roll < 0.74) return makeArmy({ ifv: 1 });
  return {};
}

export interface CreateGameOptions {
  seed: number;
  playerCountryId: CountryId;
  difficulty: Difficulty;
  world?: WorldData;
}

export function createGame(options: CreateGameOptions): GameState {
  const world = options.world ?? createWorld(options.seed);
  const seedRng = createRng(options.seed ^ 0x5f356495);
  const roll = (): number => seedRng.next();

  const countries: Record<CountryId, CountryState> = {};
  const territories: Record<TerritoryId, TerritoryState> = {};

  const playerDef = countryDef(options.playerCountryId) ?? COUNTRIES[0]!;
  for (const def of COUNTRIES) {
    const resources: Resources = { ...DEFAULT_STARTING_RESOURCES };
    if (def.bonus.resources) {
      for (const key of Object.keys(resources) as (keyof Resources)[]) {
        resources[key] += def.bonus.resources[key] ?? 0;
      }
    }
    const capital = world.territories.find((t) => t.isCapital && t.initialOwner === def.id) ?? null;
    const relations: Record<CountryId, number> = {};
    for (const other of COUNTRIES) {
      relations[other.id] = other.id === def.id ? 100 : 20;
    }
    countries[def.id] = {
      id: def.id,
      name: def.name,
      color: def.colors.primary,
      accent: def.colors.accent,
      isPlayer: def.id === playerDef.id,
      capitalTerritoryId: capital?.id ?? null,
      resources,
      income: zeroResources(),
      deficit: { money: false, metal: false, oil: false, energy: false },
      reputation: 50,
      relations,
      warWith: [],
      alive: true,
      aggression: def.id === options.playerCountryId ? 0 : AI_AGGRESSION[options.difficulty],
      stats: { produced: 0, captured: 0, lost: 0, battlesWon: 0, battlesLost: 0 },
      };
  }

  for (const territory of world.territories) {
    const owner = territory.initialOwner ?? COUNTRIES[0]!.id;
    const isCapital = territory.isCapital && countries[owner]?.capitalTerritoryId === territory.id;
    territories[territory.id] = {
      id: territory.id,
      owner,
      population: territory.population,
      economyLevel: isCapital ? 2 : 1,
      garrison: startingGarrison(isCapital, countryDef(owner)?.bonus.capitalUnits, roll),
      unrest: 0,
      capturedAtTick: null,
      lastYield: zeroResources(),
    };
  }

  const ai: Record<CountryId, AiState> = {};
  let index = 0;
  for (const def of COUNTRIES) {
    if (def.id === options.playerCountryId) continue;
    ai[def.id] = makeAiState(def.id, options.difficulty, AI_CADENCE[options.difficulty] + index * 3);
    index += 1;
  }

  const capitalTerritory = world.territories.find((t) => t.isCapital && t.initialOwner === options.playerCountryId);
  const cameraFocus: Vec2 = capitalTerritory?.centroid ?? { x: MAP_WIDTH / 2, y: 40 };

  const state: GameState = {
    version: SAVE_VERSION,
    seed: options.seed,
    world,
    status: 'playing',
    difficulty: options.difficulty,
    playerCountryId: options.playerCountryId,
    countries,
    territories,
    groups: {},
    production: [],
    battles: [],
    events: [],
    tick: 0,
    tickProgressMs: 0,
    speed: 1,
    startedAt: Date.now(),
    playedMs: 0,
    nextIds: { group: 0, production: 0, event: 0, battle: 0 },
    selectedTerritoryId: capitalTerritory?.id ?? world.territories[0]?.id ?? null,
    selectedGroupIds: [],
    victory: null,
    rngState: (options.seed ^ 0x1234abcd) >>> 0,
    ai,
    camera: {
      x: cameraFocus.x * PIXELS_PER_TILE,
      y: cameraFocus.y * PIXELS_PER_TILE,
      zoom: 2,
    },
  };

  // Prime cached economy values so the first HUD frame is correct.
  for (const country of Object.values(countries)) {
    const breakdown = computeEconomy(world, state, country.id);
    country.income = breakdown.net;
  }
  for (const territory of world.territories) {
    const ts = state.territories[territory.id];
    if (!ts) continue;
    const isCapital = territory.id === countries[ts.owner]?.capitalTerritoryId;
    ts.lastYield = territoryYield(territory, ts, isCapital);
  }

  return state;
}

export function makeAiState(country: CountryId, difficulty: Difficulty, firstThink: number): AiState {
  return { country, difficulty, nextThinkTick: firstThink, focusTarget: null };
}
