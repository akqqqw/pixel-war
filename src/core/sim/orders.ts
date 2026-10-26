import { BALANCE } from '@/core/sim/balance';
import { declareWar } from '@/core/sim/diplomacy';
import { areAtWar, cellDefense, regionArmy } from '@/core/sim/effects';
import { fail, OK, type ActionResult } from '@/core/sim/result';
import type { GameState, OffensiveOrder } from '@/core/state/types';
import { countryIndexOf } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';
import { CELL_DIRS, isLandCell } from '@/core/world/cells';

/** How many cells of a region the country really holds (borders move). */
export function regionCellsOwned(state: GameState, regionId: TerritoryId, countryId: CountryId): number {
  const index = countryIndexOf(state, countryId);
  if (index < 0) return 0;
  const territory = state.world.territories.find((entry) => entry.id === regionId);
  if (!territory) return 0;
  let count = 0;
  for (const cell of territory.tiles) if ((state.cellOwner[cell] ?? -1) === index) count += 1;
  return count;
}

/** One country always has at most one active push, so the interface stays simple. */
export function activeOffensive(state: GameState, countryId: CountryId): OffensiveOrder | null {
  return state.orders.find((order) => order.countryId === countryId && order.active) ?? null;
}

/**
 * Distance field towards the target over the country's own cells.
 * -1 means unreachable, 0 is the target itself (enemy), 1 are the front cells.
 */
export function buildFlowField(state: GameState, countryIndex: number, targetCell: number): Int32Array {
  const size = state.cellOwner.length;
  const dist = new Int32Array(size).fill(-1);
  if (targetCell < 0 || targetCell >= size) return dist;
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  dist[targetCell] = 0;
  queue[tail++] = targetCell;
  const width = state.world.width;
  while (head < tail && tail < size) {
    const cell = queue[head++] as number;
    const distance = dist[cell] as number;
    const x = cell % width;
    const y = (cell / width) | 0;
    for (const [dx, dy] of CELL_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= state.world.width || ny >= state.world.height) continue;
      const next = ny * width + nx;
      if ((dist[next] ?? -1) >= 0) continue;
      if (!isLandCell(state.world, next)) continue;
      if ((state.cellOwner[next] ?? -1) !== countryIndex) continue;
      dist[next] = distance + 1;
      queue[tail++] = next;
    }
  }
  return dist;
}

/**
 * Starts a push: `share` of the source region army walks to the chosen border.
 * The troops are not duplicated — they are moved between cells by
 * `advanceOffensives`, and the order stops when the committed amount is sent.
 */
export function startOffensive(
  state: GameState,
  countryId: CountryId,
  sourceRegionId: TerritoryId,
  targetCell: number,
  share: number,
): ActionResult {
  const country = state.countries[countryId];
  const region = state.regions[sourceRegionId];
  if (!country || !region) return fail('Регион не найден.');
  if (region.owner !== countryId && regionCellsOwned(state, sourceRegionId, countryId) === 0) {
    return fail('Наступать можно только со своей территории.');
  }
  if (state.status !== 'playing') return fail('Кампания окончена.');
  if (!isLandCell(state.world, targetCell)) return fail('Целью должна быть земля.');
  const targetIndex = state.cellOwner[targetCell] ?? -1;
  if (targetIndex < 0) return fail('Целью должна быть земля.');
  const targetCountry = state.countryOrder[targetIndex]!;
  if (targetCountry === countryId) return fail('Это уже ваша клетка.');

  const wanted = Math.max(0.1, Math.min(1, share));
  const army = regionArmy(state, sourceRegionId);
  const committed = Math.floor(army * wanted);
  if (committed < 1) return fail('В регионе нет армии для наступления.');

  if (!state.countries[targetCountry]?.alive) return fail('Государство уже уничтожено.');
  if (!country.warWith.includes(targetCountry)) {
    const war = declareWar(state, countryId, targetCountry);
    if (!war.ok) return war;
  }

  for (const order of state.orders) {
    if (order.countryId === countryId && order.active) order.active = false;
  }
  const order: OffensiveOrder = {
    id: `o${state.nextIds.order}`,
    countryId,
    sourceRegionId,
    targetCell,
    share: wanted,
    committed,
    delivered: 0,
    active: true,
    stalledTicks: 0,
    startedAtTick: state.tick,
  };
  state.nextIds.order += 1;
  state.orders.push(order);
  return OK;
}

export function stopOffensive(state: GameState, countryId: CountryId): ActionResult {
  const order = activeOffensive(state, countryId);
  if (!order) return fail('Наступления нет.');
  order.active = false;
  return OK;
}

/** Pulls the leading troops one step back, then stops the push. */
export function retreatOffensive(state: GameState, countryId: CountryId): ActionResult {
  const order = activeOffensive(state, countryId);
  if (!order) return fail('Наступления нет.');
  const countryIndex = countryIndexOf(state, countryId);
  const world = state.world;
  const width = world.width;
  if (countryIndex >= 0) {
    const dist = buildFlowField(state, countryIndex, order.targetCell);
    const moves: { from: number; to: number; amount: number }[] = [];
    for (let cell = 0; cell < dist.length; cell += 1) {
      const distance = dist[cell] ?? -1;
      if (distance < 1 || distance > 2) continue;
      const army = state.cellArmy[cell] ?? 0;
      if (army <= 0) continue;
      const x = cell % width;
      const y = (cell / width) | 0;
      let back = -1;
      for (const [dx, dy] of CELL_DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= world.height) continue;
        const next = ny * width + nx;
        if ((state.cellOwner[next] ?? -1) !== countryIndex) continue;
        if ((dist[next] ?? -1) > distance) {
          back = next;
          break;
        }
      }
      if (back < 0) continue;
      moves.push({ from: cell, to: back, amount: Math.round(army * 0.5 * 10) / 10 });
    }
    for (const move of moves) {
      state.cellArmy[move.from] = Math.max(0, (state.cellArmy[move.from] ?? 0) - move.amount);
      state.cellArmy[move.to] = (state.cellArmy[move.to] ?? 0) + move.amount;
    }
  }
  order.active = false;
  return OK;
}

/**
 * After a capture the order continues on its own: the closest enemy border cell
 * touching the country becomes the new spearhead. Returns false when there is
 * nothing left to attack (no neighbours or no war).
 */
function retarget(state: GameState, order: OffensiveOrder, countryIndex: number): boolean {
  const width = state.world.width;
  const old = order.targetCell;
  const oldX = old % width;
  const oldY = (old / width) | 0;
  const warWith = state.countries[order.countryId]?.warWith ?? [];
  let best = -1;
  let bestScore = Infinity;
  for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
    if ((state.cellOwner[cell] ?? -1) !== countryIndex) continue;
    const x = cell % width;
    const y = (cell / width) | 0;
    for (const [dx, dy] of CELL_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= state.world.height) continue;
      const next = ny * width + nx;
      const owner = state.cellOwner[next] ?? -1;
      if (owner < 0 || owner === countryIndex) continue;
      const enemy = state.countryOrder[owner];
      if (!enemy || !state.countries[enemy]?.alive) continue;
      if (!warWith.includes(enemy)) continue;
      const ex = next % width;
      const ey = (next / width) | 0;
      // Prefer a border close to the old spearhead that is also cheap to take.
      const score = Math.abs(ex - oldX) + Math.abs(ey - oldY) + cellDefense(state, next) * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = next;
      }
    }
  }
  if (best < 0) return false;
  order.targetCell = best;
  return true;
}

/** Number of own cells that touch the target and can feed the assault. */
function frontCells(state: GameState, countryIndex: number, dist: Int32Array): number {
  let count = 0;
  for (let cell = 0; cell < dist.length; cell += 1) {
    if ((dist[cell] ?? -1) !== 1) continue;
    if ((state.cellOwner[cell] ?? -1) === countryIndex) count += 1;
  }
  return count;
}

/**
 * Army flow. While a push is active every owned cell sends a part of its
 * garrison one step towards the chosen border, so the country's soldiers gather
 * at the spearhead and the front really moves.
 *
 * The step is computed from one snapshot and applied afterwards: a soldier is
 * only ever moved by a single cell per tick and never duplicated.
 */
export function advanceOffensives(state: GameState): number {
  let moved = 0;

  for (const order of state.orders) {
    if (!order.active) continue;
    const countryIndex = countryIndexOf(state, order.countryId);
    if (countryIndex < 0) {
      order.active = false;
      continue;
    }
    const source = state.regions[order.sourceRegionId];
    if (!source) {
      order.active = false;
      continue;
    }
    const targetOwner = state.cellOwner[order.targetCell] ?? -1;
    // The spearhead is ours again (captured) or peace was signed with its owner:
    // search for another border of a country we are at war with.
    const targetCountry = targetOwner >= 0 ? state.countryOrder[targetOwner] : null;
    const targetValid =
      targetOwner !== countryIndex && !!targetCountry && areAtWar(state, order.countryId, targetCountry);
    if (!targetValid && !retarget(state, order, countryIndex)) {
      order.active = false;
      continue;
    }

    let dist = buildFlowField(state, countryIndex, order.targetCell);
    // The border unit was wiped out: the push looks for the next opening.
    if (frontCells(state, countryIndex, dist) === 0) {
      if (!retarget(state, order, countryIndex)) {
        order.active = false;
        continue;
      }
      dist = buildFlowField(state, countryIndex, order.targetCell);
    }

    const deliveredBefore = order.delivered;
    const incoming = new Float32Array(state.cellArmy.length);
    const moves: { from: number; to: number; amount: number; front: boolean }[] = [];
    const width = state.world.width;
    const rate = order.share * BALANCE.marchRate;

    for (let cell = 0; cell < dist.length; cell += 1) {
      const distance = dist[cell] ?? -1;
      if (distance < 2) continue;
      if ((state.cellOwner[cell] ?? -1) !== countryIndex) continue;
      const army = state.cellArmy[cell] ?? 0;
      if (army <= 0) continue;
      const amount = Math.min(army, army * rate);
      if (amount < 0.1) continue;

      const x = cell % width;
      const y = (cell / width) | 0;
      let to = -1;
      for (const [dx, dy] of CELL_DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= state.world.height) continue;
        const next = ny * width + nx;
        if ((state.cellOwner[next] ?? -1) !== countryIndex) continue;
        if ((dist[next] ?? -1) !== distance - 1) continue;
        to = next;
        break;
      }
      if (to < 0) continue;

      const rounded = Math.round(amount * 10) / 10;
      moves.push({ from: cell, to, amount: rounded, front: distance - 1 === 1 });
      moved += rounded;
    }

    let delivered = 0;
    for (const move of moves) {
      state.cellArmy[move.from] = Math.max(0, (state.cellArmy[move.from] ?? 0) - move.amount);
      incoming[move.to] = (incoming[move.to] ?? 0) + move.amount;
      if (move.front) delivered += move.amount;
    }
    for (let cell = 0; cell < incoming.length; cell += 1) {
      const add = incoming[cell] ?? 0;
      if (add === 0) continue;
      state.cellArmy[cell] = (state.cellArmy[cell] ?? 0) + add;
    }
    order.delivered = Math.round((order.delivered + delivered) * 10) / 10;
    // A push that stops taking ground for a while searches for a softer border.
    if (order.delivered - deliveredBefore > 0.05) {
      order.stalledTicks = 0;
    } else {
      order.stalledTicks += 1;
      if (order.stalledTicks >= BALANCE.offensiveStallTicks) {
        order.stalledTicks = 0;
        if (!retarget(state, order, countryIndex)) order.active = false;
      }
    }
  }

  // Orders of eliminated countries are dropped.
  state.orders = state.orders.filter((order) => {
    if (!order.active) return true;
    const country = state.countries[order.countryId];
    return !!country?.alive;
  });

  return Math.round(moved * 10) / 10;
}
