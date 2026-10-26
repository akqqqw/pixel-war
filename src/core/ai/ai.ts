import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import { BALANCE } from '@/core/sim/balance';
import { armyCap, build, canBuild, declareWar, makePeace, maxRecruit, moveArmy, recruit } from '@/core/sim/actions';
import { areAtWar, countryPower, defenseStrength, isBorderTerritory } from '@/core/sim/effects';
import { countryTotals } from '@/core/sim/economy';
import type { GameState, TerritoryState } from '@/core/state/types';
import type { TerritoryId } from '@/core/types';

interface AiProfile {
  interval: number;
  /** Needed army advantage before declaring war. */
  warRatio: number;
  /** Grace period before the AI may start a war. */
  earliestWarTick: number;
  /** Share of income the AI is willing to spend per decision. */
  spendShare: number;
  /** Army points the AI keeps per owned territory. */
  armyPerTerritory: number;
  buildOrder: BuildingKind[];
}

const PROFILES: Record<string, AiProfile> = {
  easy: {
    interval: BALANCE.aiInterval.easy,
    warRatio: 2.2,
    earliestWarTick: 240,
    spendShare: 0.35,
    armyPerTerritory: 100,
    buildOrder: ['city', 'factory', 'barricade', 'tankPlant', 'aa'],
  },
  normal: {
    interval: BALANCE.aiInterval.normal,
    warRatio: 1.6,
    earliestWarTick: 180,
    spendShare: 0.55,
    armyPerTerritory: 160,
    buildOrder: ['factory', 'city', 'tankPlant', 'barricade', 'aa', 'missile', 'airfield'],
  },
  hard: {
    interval: BALANCE.aiInterval.hard,
    warRatio: 1.25,
    earliestWarTick: 120,
    spendShare: 0.75,
    armyPerTerritory: 240,
    buildOrder: ['tankPlant', 'factory', 'city', 'aa', 'missile', 'airfield', 'barricade'],
  },
};

function owned(state: GameState, countryId: string): TerritoryState[] {
  return Object.values(state.territories).filter((territory) => territory.owner === countryId);
}

function strongestNeighbour(state: GameState, countryId: string): TerritoryState | null {
  const mine = owned(state, countryId);
  const neighbours = new Set<string>();
  for (const territory of mine) {
    const staticTerritory = state.world.territories.find((t) => t.id === territory.id);
    for (const id of staticTerritory?.neighbors ?? []) neighbours.add(id);
  }
  let best: TerritoryState | null = null;
  let bestPower = Infinity;
  for (const id of neighbours) {
    const territory = state.territories[id];
    if (!territory || !territory.owner || territory.owner === countryId) continue;
    const power = defenseStrength(state, id);
    if (power < bestPower) {
      bestPower = power;
      best = territory;
    }
  }
  return best;
}

function tryBuild(state: GameState, countryId: string, profile: AiProfile): void {
  const country = state.countries[countryId];
  if (!country) return;
  const budget = country.money * profile.spendShare;
  const territories = owned(state, countryId);
  if (territories.length === 0) return;

  // Secure the borders first, then grow the economy.
  const borders = territories.filter((territory) => isBorderTerritory(state, territory.id));
  const interior = territories.filter((territory) => !isBorderTerritory(state, territory.id));

  const candidates: { territory: TerritoryState; kind: BuildingKind }[] = [];
  for (const territory of borders) {
    candidates.push({ territory, kind: 'barricade' });
    candidates.push({ territory, kind: 'aa' });
  }
  for (const territory of interior.length > 0 ? interior : territories) {
    candidates.push({ territory, kind: 'city' });
    candidates.push({ territory, kind: 'factory' });
  }
  for (const territory of territories) {
    candidates.push({ territory, kind: 'tankPlant' });
    candidates.push({ territory, kind: 'airfield' });
    candidates.push({ territory, kind: 'missile' });
    if (state.world.territories.find((t) => t.id === territory.id)?.isCoastal) {
      candidates.push({ territory, kind: 'port' });
    }
  }

  let built = 0;
  for (const kind of profile.buildOrder) {
    if (built >= 2) break;
    const option = candidates.find(
      (candidate) =>
        candidate.kind === kind &&
        BUILDINGS[candidate.kind].cost <= budget &&
        canBuild(state, countryId, candidate.territory.id, candidate.kind).ok,
    );
    if (!option) continue;
    if (build(state, countryId, option.territory.id, option.kind).ok) built += 1;
  }
}

function tryRecruit(state: GameState, countryId: string, profile: AiProfile): void {
  const country = state.countries[countryId];
  if (!country) return;
  const territories = owned(state, countryId);
  if (territories.length === 0) return;
  // A country keeps a standing army of roughly `armyPerTerritory` per region and
  // spends surplus money on structures instead of endless recruitment.
  const target = territories.length * profile.armyPerTerritory;
  const capSum = territories.reduce((sum, territory) => sum + armyCap(territory), 0);
  const current = countryTotals(state, countryId).army;
  // A rich treasury is turned into soldiers up to what the population supports.
  const goal = country.money > target * 25 ? Math.max(target, capSum) : target;
  if (current >= goal) return;
  const missing = goal - current;
  const borders = territories
    .filter((territory) => isBorderTerritory(state, territory.id))
    .sort((a, b) => a.army - b.army)
    .slice(0, 3);
  if (borders.length === 0) return;
  for (const territory of borders) {
    const affordable = Math.floor((country.money * 0.6) / BALANCE.recruitCost / borders.length);
    const amount = Math.min(maxRecruit(state, territory.id), affordable, Math.ceil(missing / borders.length));
    if (amount < 3) continue;
    recruit(state, countryId, territory.id, amount);
  }
}

/**
 * Gathers the army next to the weakest enemy region. The AI only shuttles
 * between neighbouring territories, so deep reserves advance one hop per pass.
 */
function tryConcentrate(state: GameState, countryId: string): void {
  const territories = owned(state, countryId);
  if (territories.length === 0) return;
  const capitalId = state.countries[countryId]?.capitalTerritoryId ?? null;

  let targetId: TerritoryId | null = null;
  let stagingId: TerritoryId | null = null;
  let bestDefense = Infinity;
  for (const territory of territories) {
    const staticTerritory = state.world.territories.find((t) => t.id === territory.id);
    for (const neighbourId of staticTerritory?.neighbors ?? []) {
      const enemy = state.territories[neighbourId];
      if (!enemy?.owner || enemy.owner === countryId) continue;
      if (!areAtWar(state, countryId, enemy.owner)) continue;
      const defense = defenseStrength(state, neighbourId);
      if (defense < bestDefense) {
        bestDefense = defense;
        targetId = neighbourId;
        stagingId = territory.id;
      }
    }
  }
  if (!stagingId) {
    // Peace time: fill the weakest border from the interior.
    const borders = territories
      .filter((territory) => isBorderTerritory(state, territory.id))
      .sort((a, b) => a.army - b.army);
    const weakest = borders[0];
    if (!weakest) return;
    for (const territory of territories) {
      if (territory.id === weakest.id || territory.army < 10) continue;
      const staticTerritory = state.world.territories.find((t) => t.id === territory.id);
      if (!staticTerritory?.neighbors.includes(weakest.id)) continue;
      const keep = territory.id === capitalId ? 10 : 5;
      moveArmy(state, countryId, territory.id, weakest.id, Math.floor(Math.max(0, territory.army - keep) * 0.8));
    }
    return;
  }
  void targetId;
  for (const territory of territories) {
    if (territory.id === stagingId || territory.army < 10) continue;
    const staticTerritory = state.world.territories.find((t) => t.id === territory.id);
    if (!staticTerritory?.neighbors.includes(stagingId)) continue;
    const keep = territory.id === capitalId ? 10 : 4;
    moveArmy(state, countryId, territory.id, stagingId, Math.floor(Math.max(0, territory.army - keep) * 0.85));
  }
}

function tryWar(state: GameState, countryId: string, profile: AiProfile): void {
  const country = state.countries[countryId];
  if (!country) return;
  if (state.tick < profile.earliestWarTick) return;
  const target = strongestNeighbour(state, countryId);
  if (!target || !target.owner) return;
  const enemyId = target.owner;
  if (country.warWith.includes(enemyId)) return;
  if (country.warWith.length >= 1) return;

  // Only the troops that actually border the target can invade.
  const targetStatic = state.world.territories.find((t) => t.id === target.id);
  let borderArmy = 0;
  for (const neighbourId of targetStatic?.neighbors ?? []) {
    const neighbour = state.territories[neighbourId];
    if (neighbour?.owner === countryId) borderArmy += neighbour.army;
  }
  const enemyTotal = countryTotals(state, enemyId).army;
  const targetDefense = defenseStrength(state, target.id);
  if (borderArmy < 20) return;
  if (borderArmy < targetDefense * 1.4) return;
  if (borderArmy < enemyTotal * profile.warRatio * 0.5) return;
  declareWar(state, countryId, enemyId);
}

function tryPeace(state: GameState, countryId: string): void {
  const country = state.countries[countryId];
  if (!country || country.warWith.length === 0) return;
  for (const enemyId of [...country.warWith]) {
    const mine = countryPower(state, countryId);
    const theirs = countryPower(state, enemyId);
    if (mine === 0) return;
    if (theirs / mine > 1.5) {
      makePeace(state, countryId, enemyId);
      return;
    }
  }
}

/** One AI decision pass; runs every few ticks for every living AI country. */
export function runAi(state: GameState): void {
  if (state.status !== 'playing') return;
  const profile = PROFILES[state.difficulty] ?? PROFILES.normal!;
  for (const country of Object.values(state.countries)) {
    if (country.isPlayer || !country.alive) continue;
    if (state.tick % profile.interval !== 0) continue;
    tryBuild(state, country.id, profile);
    tryRecruit(state, country.id, profile);
    tryConcentrate(state, country.id);
    tryWar(state, country.id, profile);
    tryPeace(state, country.id);
  }
}

/** Used by tests and the HUD: weakest neighbour of a country. */
export function weakestNeighbour(state: GameState, countryId: string): TerritoryId | null {
  return strongestNeighbour(state, countryId)?.id ?? null;
}

export { BUILDINGS };
