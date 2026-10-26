import { BALANCE } from '@/core/sim/balance';
import { regionArmy } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import type { GameState } from '@/core/state/types';
import { countryIndexOf } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';
import { CELL_DIRS, isLandCell } from '@/core/world/cells';
import { fail, OK, type ActionResult } from '@/core/sim/result';

export type { ActionResult } from '@/core/sim/result';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Cells of a region the country actually owns. */
export function ownedCellsOfRegion(state: GameState, regionId: TerritoryId, countryId: CountryId): number[] {
  const territory = state.world.territories.find((entry) => entry.id === regionId);
  if (!territory) return [];
  const index = countryIndexOf(state, countryId);
  return territory.tiles.filter((cell) => (state.cellOwner[cell] ?? -1) === index);
}

/**
 * Puts soldiers on the cells that matter: a hostile border first, then the
 * region frontier, then the interior. Armies therefore stand in stacks near a
 * front instead of being smeared one soldier per cell across the whole region.
 */
export function distributeArmy(state: GameState, regionId: TerritoryId, amount: number): number {
  const territory = state.world.territories.find((entry) => entry.id === regionId);
  if (!territory || amount <= 0) return 0;
  const cells = territory.tiles.filter((cell) => (state.cellOwner[cell] ?? -1) >= 0);
  if (cells.length === 0) return 0;
  const world = state.world;
  const width = world.width;
  const scouted = cells.map((cell) => {
    const ownerIndex = state.cellOwner[cell] ?? -1;
    const x = cell % width;
    const y = (cell / width) | 0;
    let rank = 1;
    for (const [dx, dy] of CELL_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
      const next = ny * width + nx;
      if (!isLandCell(world, next)) continue;
      const nextOwner = state.cellOwner[next] ?? -1;
      if (nextOwner >= 0 && nextOwner !== ownerIndex) rank = Math.max(rank, 3);
      else if ((world.tileTerritory[next] ?? -1) !== (world.tileTerritory[cell] ?? -2)) rank = Math.max(rank, 2);
    }
    return { cell, rank, army: state.cellArmy[cell] ?? 0 };
  });
  scouted.sort((a, b) => b.rank - a.rank || a.army - b.army);
  const bestRank = scouted[0]?.rank ?? 1;
  const chosen = scouted.filter((entry) => entry.rank === bestRank).slice(0, 48);
  const share = amount / chosen.length;
  let placed = 0;
  for (const entry of chosen) {
    const add = Math.min(share, amount - placed);
    if (add <= 0) break;
    state.cellArmy[entry.cell] = round1((state.cellArmy[entry.cell] ?? 0) + add);
    placed += add;
  }
  return placed;
}

/** How many people of a region may be mobilised right now. */
export function mobilizeMax(state: GameState, countryId: CountryId, regionId: TerritoryId): number {
  const region = state.regions[regionId];
  if (!region || region.owner !== countryId) return 0;
  const country = state.countries[countryId];
  if (!country) return 0;
  const people = Math.max(0, region.population - BALANCE.minMobilizePopulation);
  const byAction = Math.floor(people * BALANCE.mobilizeSharePerAction);
  const byGarrison = Math.max(
    0,
    Math.floor(region.population * BALANCE.garrisonRatio - regionArmy(state, regionId)),
  );
  const byMoney = Math.floor(country.money / BALANCE.mobilizeCostPerSoldier);
  const byCooldown =
    state.tick - region.lastMobilizeTick >= BALANCE.mobilizeCooldownTicks
      ? Number.MAX_SAFE_INTEGER
      : 0;
  return Math.max(0, Math.min(byAction, byGarrison, byMoney, byCooldown));
}

/**
 * Mobilisation: citizens become soldiers standing on the region cells.
 * The people are really removed from the region, the gold is really paid,
 * battle losses never return to the population.
 */
export function mobilize(
  state: GameState,
  countryId: CountryId,
  regionId: TerritoryId,
  amount: number,
): ActionResult {
  const region = state.regions[regionId];
  const country = state.countries[countryId];
  if (!region || !country) return fail('Регион не найден.');
  if (region.owner !== countryId) return fail('Это не ваш регион.');
  if (state.tick - region.lastMobilizeTick < BALANCE.mobilizeCooldownTicks) {
    return fail('Мобилизация ещё не готова.');
  }
  const count = Math.floor(amount);
  if (count <= 0) return fail('Укажите количество людей.');
  const cap = mobilizeMax(state, countryId, regionId);
  if (count > cap) return fail(cap <= 0 ? 'Некому или нечем мобилизоваться.' : `Можно не больше ${cap}.`);
  const cost = Math.round(count * BALANCE.mobilizeCostPerSoldier * 10) / 10;
  if (country.money + 1e-9 < cost) return fail(`Нужно ${cost} золота.`);

  country.money = round1(country.money - cost);
  region.population = round1(region.population - count * BALANCE.populationPerSoldier);
  region.lastMobilizeTick = state.tick;
  country.lastMobilizeTick = state.tick;
  distributeArmy(state, regionId, count);
  pushEvent(state, 'mobilize', `${country.shortName}: мобилизовано ${count} солдат.`, countryId);
  return OK;
}

/** Moves soldiers between two neighbouring regions of the same country. */
export function transferArmy(
  state: GameState,
  countryId: CountryId,
  fromRegionId: TerritoryId,
  toRegionId: TerritoryId,
  amount: number,
): ActionResult {
  const fromRegion = state.regions[fromRegionId];
  const toRegion = state.regions[toRegionId];
  if (!fromRegion || !toRegion) return fail('Регион не найден.');
  if (fromRegion.owner !== countryId || toRegion.owner !== countryId) return fail('Только между своими регионами.');
  const fromStatic = state.world.territories.find((entry) => entry.id === fromRegionId);
  if (!fromStatic?.neighbors.includes(toRegionId)) return fail('Регионы не граничат.');
  const count = Math.floor(amount);
  if (count <= 0) return fail('Укажите количество.');
  const available = regionArmy(state, fromRegionId);
  if (count > available) return fail('В регионе нет столько солдат.');

  let left = count;
  const cells = ownedCellsOfRegion(state, fromRegionId, countryId);
  for (const cell of cells) {
    if (left <= 0) break;
    const army = state.cellArmy[cell] ?? 0;
    const take = Math.min(army, left);
    state.cellArmy[cell] = round1(army - take);
    left -= take;
  }
  distributeArmy(state, toRegionId, count - left);
  return OK;
}

/** Total soldiers a country keeps in its cells. */
export function armyInCells(state: GameState, countryId: CountryId): number {
  const index = countryIndexOf(state, countryId);
  if (index < 0) return 0;
  let total = 0;
  for (let cell = 0; cell < state.cellArmy.length; cell += 1) {
    if (state.cellOwner[cell] === index) total += state.cellArmy[cell] ?? 0;
  }
  return Math.round(total * 10) / 10;
}
