import { BALANCE } from '@/core/sim/balance';
import {
  airfieldAttackBonus,
  areAtWar,
  cellDefense,
  tankAttackBonus,
} from '@/core/sim/effects';
import type { GameState } from '@/core/state/types';
import { CELL_DIRS, isLandCell } from '@/core/world/cells';

/**
 * Cellular frontline.
 *
 * Every tick the battle is resolved from one snapshot of the cell map:
 *  - only countries at war fight each other,
 *  - a cell commits `attackCommitShare` of its soldiers and that budget is
 *    split between all enemy neighbours, so the same soldier never attacks
 *    twice in one tick,
 *  - the defence of a cell is its garrison plus militia, terrain, barricades
 *    and tanks (see `cellDefense`),
 *  - a cell changes hands only when the attack clearly beats the defence,
 *  - all flips are collected first and applied together, so the result does not
 *    depend on the order cells are visited in.
 */
export interface BattleResult {
  captured: number[];
  fights: number;
}

interface Flip {
  cell: number;
  to: number;
  survivors: number;
}

export function resolveBattles(state: GameState): BattleResult {
  const size = state.cellOwner.length;
  const world = state.world;
  const width = world.width;
  const owner = state.cellOwner;
  const army = state.cellArmy;

  const enemyCount = new Uint8Array(size);
  const defenders: number[] = [];

  // Pass 1: who borders an enemy at war.
  for (let cell = 0; cell < size; cell += 1) {
    const ownerIndex = owner[cell] ?? -1;
    if (ownerIndex < 0) continue;
    if (!isLandCell(world, cell)) continue;
    const x = cell % width;
    const y = (cell / width) | 0;
    let count = 0;
    for (const [dx, dy] of CELL_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
      const next = ny * width + nx;
      const nextOwner = owner[next] ?? -1;
      if (nextOwner < 0 || nextOwner === ownerIndex) continue;
      if (!areAtWar(state, state.countryOrder[ownerIndex], state.countryOrder[nextOwner])) continue;
      count += 1;
    }
    if (count > 0) {
      enemyCount[cell] = count;
      defenders.push(cell);
    }
  }

  if (defenders.length === 0) {
    state.lastCaptured = [];
    state.lastFights = [];
    return { captured: [], fights: 0 };
  }

  const delta = new Float32Array(size);
  const flips: Flip[] = [];
  const hot: number[] = [];
  const MAX_HOT = 160;
  let fights = 0;

  for (const cell of defenders) {
    const defenderOwnerIndex = owner[cell] ?? -1;
    const defenderCountry = state.countries[state.countryOrder[defenderOwnerIndex]!];
    if (!defenderCountry) continue;

    const x = cell % width;
    const y = (cell / width) | 0;
    const defence = cellDefense(state, cell);
    let attackTotal = 0;
    const contributors: { cell: number; force: number; ownerIndex: number }[] = [];

    for (const [dx, dy] of CELL_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
      const next = ny * width + nx;
      const nextOwner = owner[next] ?? -1;
      if (nextOwner < 0 || nextOwner === defenderOwnerIndex) continue;
      if (!areAtWar(state, state.countryOrder[nextOwner], state.countryOrder[defenderOwnerIndex])) continue;
      const neighbours = enemyCount[next] || 1;
      const committed = ((army[next] ?? 0) * BALANCE.attackCommitShare) / neighbours;
      if (committed <= 0) continue;
      const attacker = state.countries[state.countryOrder[nextOwner]!];
      if (!attacker) continue;
      const force = committed * (1 + tankAttackBonus(attacker)) * (1 + airfieldAttackBonus(state, next));
      attackTotal += force;
      contributors.push({ cell: next, force, ownerIndex: nextOwner });
    }

    if (attackTotal <= 0) continue;
    fights += 1;
    if (hot.length < MAX_HOT) hot.push(cell);

    if (attackTotal > defence * BALANCE.captureRatio) {
      // The cell falls. Every attacker spends the troops it committed.
      let best = contributors[0]!;
      for (const entry of contributors) if (entry.force > best.force) best = entry;
      const losses = defence * BALANCE.captureLossShare;
      const survivors = Math.max(0, attackTotal - losses);
      for (const entry of contributors) delta[entry.cell] -= entry.force;

      // Part of the beaten garrison escapes to a friendly neighbour.
      const retreat = (army[cell] ?? 0) * BALANCE.retreatShare;
      if (retreat > 0) {
        for (const [dx, dy] of CELL_DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
          const next = ny * width + nx;
          if ((owner[next] ?? -1) !== defenderOwnerIndex) continue;
          delta[next] += retreat;
          break;
        }
      }
      flips.push({ cell, to: best.ownerIndex, survivors });
    } else {
      // The cell holds: both sides bleed, nobody moves.
      const defenderLoss = Math.min(army[cell] ?? 0, attackTotal * BALANCE.defenderLossOnHold);
      delta[cell] -= defenderLoss;
      const attackerLoss = defence * BALANCE.attackerLossOnHold;
      for (const entry of contributors) {
        delta[entry.cell] -= (attackerLoss * entry.force) / attackTotal;
      }
    }
  }

  // Apply everything at once — afterwards the map is consistent again.
  for (let cell = 0; cell < size; cell += 1) {
    const change = delta[cell] ?? 0;
    if (change === 0) continue;
    state.cellArmy[cell] = Math.max(0, Math.round(((army[cell] ?? 0) + change) * 10) / 10);
  }
  const captured: number[] = [];
  for (const flip of flips) {
    const previous = state.cellOwner[flip.cell] ?? -1;
    if (previous < 0) continue;
    state.cellOwner[flip.cell] = flip.to;
    state.cellArmy[flip.cell] = Math.round(flip.survivors * 10) / 10;
    const taker = state.countries[state.countryOrder[flip.to]!];
    if (taker) taker.stats.cellsTaken += 1;
    captured.push(flip.cell);
  }
  state.lastCaptured = captured;
  state.lastFights = hot;
  if (captured.length > 0) state.mapVersion += 1;
  return { captured, fights };
}

/** Forecast shown in the interface: attack from neighbours against the cell. */
export function cellForecast(state: GameState, cell: number): { attack: number; defense: number } {
  const world = state.world;
  const width = world.width;
  const ownerIndex = state.cellOwner[cell] ?? -1;
  if (ownerIndex < 0) return { attack: 0, defense: 0 };
  const x = cell % width;
  const y = (cell / width) | 0;
  let attack = 0;
  let defense = cellDefense(state, cell);
  for (const [dx, dy] of CELL_DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
    const next = ny * width + nx;
    const nextOwner = state.cellOwner[next] ?? -1;
    if (nextOwner < 0 || nextOwner === ownerIndex) continue;
    if (!areAtWar(state, state.countryOrder[nextOwner], state.countryOrder[ownerIndex])) continue;
    const country = state.countries[state.countryOrder[nextOwner]!];
    if (!country) continue;
    attack += (state.cellArmy[next] ?? 0) * BALANCE.attackCommitShare * (1 + tankAttackBonus(country));
  }
  return { attack: Math.round(attack), defense: Math.round(defense) };
}
