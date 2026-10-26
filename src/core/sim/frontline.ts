import { BALANCE } from '@/core/sim/balance';
import { areAtWar, attackStrength, defenseStrength } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import type { GameState } from '@/core/state/types';
import type { TerritoryId } from '@/core/types';

/**
 * Cell ownership works like Conway's Game of Life:
 *  - a cell with three or more foreign neighbours is "born" into that country,
 *  - a cell with one or no friendly neighbours starves and joins its neighbours,
 *  - only countries at war may convert cells,
 *  - the army difference decides how many cells flip per tick.
 */
export interface FrontlineResult {
  flips: number;
  captured: TerritoryId[];
  lost: TerritoryId[];
}

interface FlipCandidate {
  tile: number;
  from: number;
  to: number;
  count: number;
  territory: TerritoryId;
  starved: boolean;
}

const NEIGHBOURS: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function budgetKey(territoryId: TerritoryId, attackerIndex: number): string {
  return `${territoryId}|${attackerIndex}`;
}

/**
 * How many cells a country may convert inside `territoryId` this tick.
 * Armies are compared directly: no superiority means no progress.
 */
function computeBudgets(state: GameState): Map<string, number> {
  const budgets = new Map<string, number>();
  for (const territory of Object.values(state.territories)) {
    const staticTerritory = state.world.territories.find((t) => t.id === territory.id);
    if (!staticTerritory) continue;
    const defense = defenseStrength(state, territory.id);
    for (const neighbourId of staticTerritory.neighbors) {
      const neighbour = state.territories[neighbourId];
      if (!neighbour || !neighbour.owner) continue;
      if (neighbour.owner === territory.owner) continue;
      if (!areAtWar(state, neighbour.owner, territory.owner)) continue;
      const attack = attackStrength(state, neighbourId);
      if (attack < BALANCE.minAttackArmy) continue;
      const edge = attack - defense;
      if (edge <= 0) continue;
      const attackerIndex = state.countryOrder.indexOf(neighbour.owner);
      if (attackerIndex < 0) continue;
      const key = budgetKey(territory.id, attackerIndex);
      const cells = Math.min(BALANCE.maxFlipsPerBorder, Math.floor(edge / BALANCE.armyPerFlip));
      if (cells <= 0) continue;
      budgets.set(key, (budgets.get(key) ?? 0) + cells);
    }
  }
  return budgets;
}

/** Neighbouring territory of `attacker` with the most army — it pays for the push. */
function supplyTerritory(state: GameState, defenderTerritoryId: TerritoryId, attacker: string): TerritoryId | null {
  const staticTerritory = state.world.territories.find((t) => t.id === defenderTerritoryId);
  if (!staticTerritory) return null;
  let best: TerritoryId | null = null;
  let bestArmy = -1;
  for (const neighbourId of staticTerritory.neighbors) {
    const neighbour = state.territories[neighbourId];
    if (!neighbour || neighbour.owner !== attacker) continue;
    if (neighbour.army > bestArmy) {
      bestArmy = neighbour.army;
      best = neighbourId;
    }
  }
  return best;
}

function collectCandidates(state: GameState, budgets: Map<string, number>): FlipCandidate[] {
  const world = state.world;
  const width = world.width;
  const height = world.height;
  const tileOwner = state.tileOwner;
  const tileTerritory = world.tileTerritory;
  const out: FlipCandidate[] = [];

  for (let y = 1; y < height - 1; y += 1) {
    const row = y * width;
    for (let x = 1; x < width - 1; x += 1) {
      const index = row + x;
      const regionIndex = tileTerritory[index] ?? -1;
      if (regionIndex < 0) continue;
      const from = tileOwner[index] ?? -1;
      if (from < 0) continue;

      const counts = new Map<number, number>();
      let own = 0;
      for (const [dx, dy] of NEIGHBOURS) {
        const neighbourIndex = index + dy * width + dx;
        // Water cells are not part of the political map.
        if ((tileTerritory[neighbourIndex] ?? -1) < 0) continue;
        const owner = tileOwner[neighbourIndex] ?? -1;
        if (owner < 0) continue;
        if (owner === from) own += 1;
        else counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
      if (counts.size === 0) continue;

      const territory = world.territories[regionIndex];
      if (!territory) continue;

      let bestOwner = -1;
      let bestCount = 0;
      for (const [owner, count] of counts) {
        if (count <= bestCount) continue;
        if (!areAtWar(state, state.countryOrder[owner], state.countryOrder[from])) continue;
        if ((budgets.get(budgetKey(territory.id, owner)) ?? 0) <= 0) continue;
        bestOwner = owner;
        bestCount = count;
      }
      if (bestOwner < 0) continue;

      if (own <= 1 && bestCount >= 2) {
        // Starved cell: it has lost its own support and falls to the neighbours.
        out.push({ tile: index, from, to: bestOwner, count: bestCount + 8, territory: territory.id, starved: true });
      } else if (bestCount >= 3) {
        // Birth rule of Game of Life.
        out.push({ tile: index, from, to: bestOwner, count: bestCount, territory: territory.id, starved: false });
      }
    }
  }

  out.sort((a, b) => b.count - a.count);
  return out;
}

/** Transfers a territory and all its remaining cells to a new owner. */
export function transferTerritory(state: GameState, territoryId: TerritoryId, newOwner: string): boolean {
  const territory = state.territories[territoryId];
  const staticTerritory = state.world.territories.find((t) => t.id === territoryId);
  if (!territory || !staticTerritory) return false;
  const oldOwner = territory.owner;
  if (!newOwner || newOwner === oldOwner) return false;

  // Remaining defenders retreat to a friendly neighbour.
  const retreat = territory.army * BALANCE.retreatShare;
  if (oldOwner && retreat > 0) {
    let refugeId: TerritoryId | null = null;
    let refugeArmy = -1;
    for (const neighbourId of staticTerritory.neighbors) {
      const neighbour = state.territories[neighbourId];
      if (!neighbour || neighbour.owner !== oldOwner) continue;
      if (neighbour.army > refugeArmy) {
        refugeArmy = neighbour.army;
        refugeId = neighbourId;
      }
    }
    if (refugeId) {
      const refuge = state.territories[refugeId];
      if (refuge) refuge.army = Math.round((refuge.army + retreat) * 10) / 10;
    }
  }

  // Half of the structures are destroyed in the fighting.
  const survivors = territory.buildings.filter((_building, index) => index % 2 === 0);
  territory.buildings = survivors;
  territory.population = Math.round(territory.population * 0.85 * 10) / 10;
  territory.owner = newOwner;
  territory.capturedAtTick = state.tick;
  territory.army = 0;

  // The invading army leaves a garrison behind.
  const supplierId = supplyTerritory(state, territoryId, newOwner);
  if (supplierId) {
    const supplier = state.territories[supplierId];
    if (supplier && supplier.army > 0) {
      const moved = Math.round(supplier.army * 0.3 * 10) / 10;
      supplier.army = Math.round((supplier.army - moved) * 10) / 10;
      territory.army = moved;
    }
  }

  // Consolidate the remaining cells so no pockets keep flickering.
  const ownerIndex = state.countryOrder.indexOf(newOwner);
  for (const tile of staticTerritory.tiles) state.tileOwner[tile] = ownerIndex;

  const oldCountry = oldOwner ? state.countries[oldOwner] : null;
  const newCountry = state.countries[newOwner];
  if (oldCountry) {
    oldCountry.stats.lost += 1;
    if (oldCountry.capitalTerritoryId === territoryId) {
      const replacement = Object.values(state.territories)
        .filter((t) => t.owner === oldOwner)
        .sort((a, b) => b.population - a.population)[0];
      oldCountry.capitalTerritoryId = replacement?.id ?? null;
    }
    if (!Object.values(state.territories).some((t) => t.owner === oldOwner)) {
      oldCountry.alive = false;
      for (const country of Object.values(state.countries)) {
        country.warWith = country.warWith.filter((id) => id !== oldOwner);
      }
      pushEvent(state, 'capture', `${oldCountry.name} потеряла последнюю территорию.`, oldOwner ?? undefined);
    }
  }
  if (newCountry) {
    newCountry.stats.captured += 1;
    pushEvent(
      state,
      'capture',
      `${newCountry.name} захватила ${staticTerritory.name}.`,
      newOwner,
      territoryId,
    );
  }
  return true;
}

/** Recomputes territory ownership from the cell map. */
function syncTerritoryOwners(state: GameState): { captured: TerritoryId[]; lost: TerritoryId[] } {
  const captured: TerritoryId[] = [];
  const lost: TerritoryId[] = [];
  for (const territory of state.world.territories) {
    const current = state.territories[territory.id];
    if (!current) continue;
    const counts = new Map<string, number>();
    for (const tile of territory.tiles) {
      const owner = state.countryOrder[state.tileOwner[tile] ?? -1];
      if (!owner) continue;
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    let bestOwner: string | null = null;
    let bestCount = 0;
    for (const [owner, count] of counts) {
      if (count > bestCount) {
        bestOwner = owner;
        bestCount = count;
      }
    }
    const total = Math.max(1, territory.tiles.length);
    if (!bestOwner || bestOwner === current.owner) continue;
    if (bestCount / total < BALANCE.captureShare) continue;
    if (transferTerritory(state, territory.id, bestOwner)) {
      captured.push(territory.id);
      if (current.owner) lost.push(territory.id);
    }
  }
  return { captured, lost };
}

export function stepFrontline(state: GameState): FrontlineResult {
  const budgets = computeBudgets(state);
  if (budgets.size === 0) {
    state.lastFlips = 0;
    return { flips: 0, captured: [], lost: [] };
  }
  const candidates = collectCandidates(state, budgets);
  let flips = 0;
  for (const candidate of candidates) {
    const attacker = state.countryOrder[candidate.to];
    if (!attacker) continue;
    const key = budgetKey(candidate.territory, candidate.to);
    const left = budgets.get(key) ?? 0;
    if (left <= 0) continue;
    budgets.set(key, left - 1);

    state.tileOwner[candidate.tile] = candidate.to;
    flips += 1;

    const defender = state.territories[candidate.territory];
    if (defender) {
      defender.army = Math.max(0, Math.round((defender.army - BALANCE.defenderFlipArmyLoss) * 10) / 10);
      defender.population = Math.max(
        5,
        Math.round(defender.population * (1 - BALANCE.defenderFlipPopLoss) * 10) / 10,
      );
    }
    const supplierId = supplyTerritory(state, candidate.territory, attacker);
    const supplier = supplierId ? state.territories[supplierId] : null;
    if (supplier) {
      supplier.army = Math.max(0, Math.round((supplier.army - BALANCE.flipAttrition) * 10) / 10);
    }
  }

  const ownership = syncTerritoryOwners(state);
  state.lastFlips = flips;
  return { flips, ...ownership };
}
