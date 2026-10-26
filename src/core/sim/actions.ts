import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import { BALANCE } from '@/core/sim/balance';
import { countKind, defenseStrength } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import type { GameState, TerritoryState } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';
import type { WorldData } from '@/core/world/world';

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const OK: ActionResult = { ok: true };

function fail(message: string): ActionResult {
  return { ok: false, message };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function territoryOf(state: GameState, id: TerritoryId): TerritoryState | null {
  return state.territories[id] ?? null;
}

function staticOf(state: GameState, id: TerritoryId) {
  return state.world.territories.find((t) => t.id === id) ?? null;
}

/** Deterministic spot inside the territory used to draw the structure and its radius. */
export function placementTile(world: WorldData, territoryId: TerritoryId, ordinal: number): number {
  const staticTerritory = world.territories.find((t) => t.id === territoryId);
  if (!staticTerritory) return 0;
  const width = world.width;
  const cx = staticTerritory.centroid.x;
  const cy = staticTerritory.centroid.y;
  const sorted = [...staticTerritory.tiles].sort((a, b) => {
    const da = Math.hypot((a % width) - cx, Math.floor(a / width) - cy);
    const db = Math.hypot((b % width) - cx, Math.floor(b / width) - cy);
    return da - db;
  });
  const ring = Math.min(sorted.length - 1, ordinal * 6);
  return sorted[ring] ?? staticTerritory.cityTile;
}

export function canBuild(
  state: GameState,
  countryId: CountryId,
  territoryId: TerritoryId,
  kind: BuildingKind,
): ActionResult {
  const territory = territoryOf(state, territoryId);
  const country = state.countries[countryId];
  const def = BUILDINGS[kind];
  if (!territory || !country) return fail('Территория недоступна.');
  if (territory.owner !== countryId) return fail('Строить можно только на своей территории.');
  if (countKind(territory, kind) >= def.limit) {
    return fail(`Лимит: ${def.limit} на территорию.`);
  }
  const staticTerritory = staticOf(state, territoryId);
  if (def.coastal && !staticTerritory?.isCoastal) return fail('Порт строится только на побережье.');
  if (country.money + 1e-9 < def.cost) return fail(`Нужно ${def.cost} ₽.`);
  return OK;
}

export function build(
  state: GameState,
  countryId: CountryId,
  territoryId: TerritoryId,
  kind: BuildingKind,
): ActionResult {
  const check = canBuild(state, countryId, territoryId, kind);
  if (!check.ok) return check;
  const territory = territoryOf(state, territoryId)!;
  const country = state.countries[countryId]!;
  const def = BUILDINGS[kind];

  country.money = round1(Math.max(0, country.money - def.cost));
  const ordinal = territory.buildings.length;
  territory.buildings.push({
    id: `b${state.nextIds.building}`,
    kind,
    tile: placementTile(state.world, territoryId, ordinal),
  });
  state.nextIds.building += 1;
  country.stats.buildings += 1;
  if (kind === 'missile') {
    const building = territory.buildings[territory.buildings.length - 1]!;
    state.missileReady[building.id] = state.tick + Math.round(BALANCE.missileCooldown / 2);
  }
  const staticTerritory = staticOf(state, territoryId);
  pushEvent(state, 'build', `${def.name} построен: ${staticTerritory?.name ?? territoryId}.`, countryId, territoryId);
  return OK;
}

/** Instant army from the local population — the main way to grow a garrison. */
export function armyCap(territory: TerritoryState): number {
  return Math.floor(territory.population * BALANCE.armyCapRatio);
}

export function maxRecruit(state: GameState, territoryId: TerritoryId): number {
  const territory = territoryOf(state, territoryId);
  if (!territory) return 0;
  const byPopulation = territory.population / BALANCE.populationPerArmy - territory.army;
  const byCap = armyCap(territory) - territory.army;
  return Math.max(0, Math.floor(Math.min(byPopulation, byCap)));
}

export function recruit(
  state: GameState,
  countryId: CountryId,
  territoryId: TerritoryId,
  amount: number,
): ActionResult {
  const territory = territoryOf(state, territoryId);
  const country = state.countries[countryId];
  if (!territory || !country) return fail('Территория недоступна.');
  if (territory.owner !== countryId) return fail('Это не ваша территория.');
  const count = Math.floor(amount);
  if (count <= 0) return fail('Укажите количество.');
  if (count > maxRecruit(state, territoryId)) return fail('Недостаточно населения.');
  const cost = Math.round(count * BALANCE.recruitCost);
  if (country.money + 1e-9 < cost) return fail(`Нужно ${cost} ₽.`);

  country.money = round1(Math.max(0, country.money - cost));
  territory.army = round1(territory.army + count);
  territory.population = round1(Math.max(5, territory.population - count * BALANCE.populationPerArmy));
  return OK;
}

export function moveArmy(
  state: GameState,
  countryId: CountryId,
  fromId: TerritoryId,
  toId: TerritoryId,
  amount: number,
): ActionResult {
  const from = territoryOf(state, fromId);
  const to = territoryOf(state, toId);
  if (!from || !to) return fail('Территория недоступна.');
  if (from.owner !== countryId || to.owner !== countryId) return fail('Перебрасывать можно только между своими территориями.');
  if (fromId === toId) return fail('Выберите другую территорию.');
  const staticFrom = staticOf(state, fromId);
  if (!staticFrom?.neighbors.includes(toId)) return fail('Нужна общая граница.');
  const count = Math.min(Math.floor(amount), Math.floor(from.army));
  if (count <= 0) return fail('В гарнизоне нет армии.');
  from.army = round1(from.army - count);
  to.army = round1(to.army + count);
  return OK;
}

export function declareWar(state: GameState, a: CountryId, b: CountryId): ActionResult {
  if (a === b) return fail('Нельзя объявить войну себе.');
  const first = state.countries[a];
  const second = state.countries[b];
  if (!first || !second) return fail('Государство не найдено.');
  if (!first.alive || !second.alive) return fail('Государство уже уничтожено.');
  if (first.warWith.includes(b)) return OK;
  first.warWith.push(b);
  if (!second.warWith.includes(a)) second.warWith.push(a);
  pushEvent(state, 'war', `${first.shortName} объявила войну ${second.shortName}.`, a);
  return OK;
}

export function makePeace(state: GameState, a: CountryId, b: CountryId): ActionResult {
  const first = state.countries[a];
  const second = state.countries[b];
  if (!first || !second) return fail('Государство не найдено.');
  if (!first.warWith.includes(b)) return fail('Вы и так не в состоянии войны.');
  first.warWith = first.warWith.filter((id) => id !== b);
  second.warWith = second.warWith.filter((id) => id !== a);
  pushEvent(state, 'peace', `${first.shortName} и ${second.shortName} заключили мир.`, a);
  return OK;
}

/** Total defence number shown in the HUD for a selected territory. */
export function territoryDefenseLabel(state: GameState, territoryId: TerritoryId): number {
  const territory = territoryOf(state, territoryId);
  if (!territory) return 0;
  return Math.round(
    defenseStrength(state, territoryId) * 10,
  ) / 10;
}
