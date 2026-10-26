import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import { BALANCE } from '@/core/sim/balance';
import { build, findBuildCell, upgradeBuilding } from '@/core/sim/actions';
import { mobilize, mobilizeMax } from '@/core/sim/army';
import { declareWar, makePeace } from '@/core/sim/diplomacy';
import {
  areAtWar,
  cellDefense,
  countryRegions,
  regionArmy,
  territoryShare,
} from '@/core/sim/effects';
import { activeOffensive, startOffensive, stopOffensive } from '@/core/sim/orders';
import { fireMissile, isReady, launchAirStrike } from '@/core/sim/strikes';
import type { CountryState, GameState, RegionState } from '@/core/state/types';
import { countryIndexOf } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';
import { CELL_DIRS, isLandCell } from '@/core/world/cells';

interface AiProfile {
  interval: number;
  warRatio: number;
  earliestWarTick: number;
  offensiveShare: number;
  /** Gold the AI keeps as a reserve before spending on structures. */
  reserve: number;
  buildOrder: BuildingKind[];
}

const PROFILES: Record<string, AiProfile> = {
  easy: {
    interval: BALANCE.aiInterval.easy,
    warRatio: BALANCE.aiWarRatio.easy,
    earliestWarTick: BALANCE.earlyWarTick.easy,
    offensiveShare: BALANCE.aiOffensiveShare.easy,
    reserve: 700,
    buildOrder: ['city', 'factory', 'barricade', 'tankPlant'],
  },
  normal: {
    interval: BALANCE.aiInterval.normal,
    warRatio: BALANCE.aiWarRatio.normal,
    earliestWarTick: BALANCE.earlyWarTick.normal,
    offensiveShare: BALANCE.aiOffensiveShare.normal,
    reserve: 500,
    buildOrder: ['city', 'factory', 'barricade', 'tankPlant', 'aa', 'port'],
  },
  hard: {
    interval: BALANCE.aiInterval.hard,
    warRatio: BALANCE.aiWarRatio.hard,
    earliestWarTick: BALANCE.earlyWarTick.hard,
    offensiveShare: BALANCE.aiOffensiveShare.hard,
    reserve: 350,
    buildOrder: ['city', 'factory', 'tankPlant', 'barricade', 'aa', 'port', 'airfield', 'missile'],
  },
};

function isBorder(state: GameState, region: RegionState): boolean {
  const territory = state.world.territories.find((entry) => entry.id === region.id);
  if (!territory) return false;
  return territory.neighbors.some((id) => {
    const other = state.regions[id];
    return !!other && !!other.owner && other.owner !== region.owner;
  });
}

function ownedBorders(state: GameState, countryId: CountryId): RegionState[] {
  return countryRegions(state, countryId).filter((region) => isBorder(state, region));
}

function interior(state: GameState, countryId: CountryId): RegionState[] {
  return countryRegions(state, countryId).filter((region) => !isBorder(state, region));
}

/** Economy: one structure (or one upgrade) per decision. */
function tryBuild(state: GameState, countryId: CountryId, profile: AiProfile): void {
  const country = state.countries[countryId];
  if (!country) return;
  if (country.money < profile.reserve) return;

  const borders = ownedBorders(state, countryId);
  const quiet = interior(state, countryId);
  for (const kind of profile.buildOrder) {
    const def = BUILDINGS[kind];
    if (country.money < def.cost + profile.reserve * 0.5) continue;
    const pool = def.tab === 'security' || kind === 'missile' ? borders : quiet.length > 0 ? quiet : borders;
    for (const region of pool) {
      const cell = findBuildCell(state, countryId, region.id, kind);
      if (cell === null) continue;
      if (build(state, countryId, region.id, kind, cell).ok) return;
    }
  }

  // Nothing new fits — put the money into an upgrade instead.
  const upgradable = countryRegions(state, countryId)
    .flatMap((region) => region.buildings)
    .filter((building) => building.level < BUILDINGS[building.kind].maxLevel)
    .sort((a, b) => a.level - b.level);
  const pick = upgradable[0];
  if (pick && country.money > 1800) upgradeBuilding(state, countryId, pick.id);
}

/** Army: keeps a garrison per region and pushes it to the weakest border. */
function tryMobilize(state: GameState, countryId: CountryId, profile: AiProfile): void {
  const country = state.countries[countryId];
  if (!country) return;
  const regions = countryRegions(state, countryId);
  if (regions.length === 0) return;
  // A country at war needs a real field army, not a token garrison.
  const target = (country.warWith.length > 0 ? 600 : 260) + regions.length * 260;
  if (country.army >= target) return;
  const borders = ownedBorders(state, countryId).sort((a, b) => regionArmy(state, a.id) - regionArmy(state, b.id));
  const candidates = borders.length > 0 ? borders : regions;
  const region = candidates[0];
  if (!region) return;
  const reserve = profile.reserve;
  const affordable = Math.floor((country.money - reserve) / BALANCE.mobilizeCostPerSoldier);
  const wanted = Math.min(mobilizeMax(state, countryId, region.id), affordable, Math.ceil(target - country.army));
  if (wanted >= 20) mobilize(state, countryId, region.id, wanted);
}

interface TargetChoice {
  cell: number;
  regionId: TerritoryId;
  enemy: string;
  ownForce: number;
  defense: number;
  score: number;
}

/** Best border cell to attack: enemy defence compared with the local attack. */
function findTarget(state: GameState, countryId: CountryId): TargetChoice | null {
  const index = countryIndexOf(state, countryId);
  if (index < 0) return null;
  const world = state.world;
  const width = world.width;
  let best: TargetChoice | null = null;
  for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
    if ((state.cellOwner[cell] ?? -1) !== index) continue;
    const x = cell % width;
    const y = (cell / width) | 0;
    for (const [dx, dy] of CELL_DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) continue;
      const next = ny * width + nx;
      if (!isLandCell(world, next)) continue;
      const enemyIndex = state.cellOwner[next] ?? -1;
      if (enemyIndex < 0 || enemyIndex === index) continue;
      const enemyId = state.countryOrder[enemyIndex]!;
      const enemyCountry = state.countries[enemyId];
      if (!enemyCountry?.alive) continue;
      const region = state.regions[world.territories[world.tileTerritory[cell] ?? -1]?.id ?? ''];
      if (!region) continue;
      const localForce = state.cellArmy[cell] ?? 0;
      const defense = cellDefense(state, next);
      // Prefer a cheap target that also has friendly troops standing next to it.
      const score = (defense + 5) / (localForce + 5);
      if (!best || score < best.score) {
        best = { cell: next, regionId: region.id, enemy: enemyId, ownForce: localForce, defense, score };
      }
    }
  }
  return best;
}

/** War and offensives — only when the border actually has the troops for it. */
function tryOffensive(state: GameState, countryId: CountryId, profile: AiProfile): void {
  const country = state.countries[countryId];
  if (!country) return;
  const active = activeOffensive(state, countryId);
  if (active) {
    const index = countryIndexOf(state, countryId);
    const targetOwner = state.cellOwner[active.targetCell] ?? -1;
    if (targetOwner === index) {
      stopOffensive(state, countryId);
      return;
    }
    // A push only stops when the country is truly spent: the army now lives at
    // the front, so the source region may be empty while the attack rolls on.
    if (country.army < 80) stopOffensive(state, countryId);
    return;
  }
  if (state.tick < profile.earliestWarTick) return;

  const target = findTarget(state, countryId);
  if (!target) return;
  const force = regionArmy(state, target.regionId);
  // The whole region marches, so compare the region army with the defence of
  // the chosen cell instead of the single stack that happens to touch it.
  if (force * profile.offensiveShare < target.defense * profile.warRatio * 2) return;
  if (force < 120) return;
  if (!areAtWar(state, countryId, target.enemy)) {
    if (country.warWith.length >= 2) return;
    const war = declareWar(state, countryId, target.enemy);
    if (!war.ok) return;
  }
  startOffensive(state, countryId, target.regionId, target.cell, profile.offensiveShare);
}

const AIR_RANGE = 20;

/** Missiles and aircraft: fire everything ready at the thickest enemy stack. */
function tryStrikes(state: GameState, countryId: CountryId): void {
  const country = state.countries[countryId];
  if (!country || country.warWith.length === 0) return;
  const maxRange = 24;
  for (const region of countryRegions(state, countryId)) {
    for (const building of region.buildings) {
      if (building.kind !== 'missile' || !isReady(state, building)) continue;
      const index = countryIndexOf(state, countryId);
      const width = state.world.width;
      const bx = building.cell % width;
      const by = (building.cell / width) | 0;
      let bestCell = -1;
      let bestArmy = 0;
      for (let y = Math.max(0, by - maxRange); y <= Math.min(state.world.height - 1, by + maxRange); y += 1) {
        for (let x = Math.max(0, bx - maxRange); x <= Math.min(state.world.width - 1, bx + maxRange); x += 1) {
          if (Math.max(Math.abs(x - bx), Math.abs(y - by)) > maxRange) continue;
          const cell = y * width + x;
          const owner = state.cellOwner[cell] ?? -1;
          if (owner < 0 || owner === index) continue;
          if (!areAtWar(state, countryId, state.countryOrder[owner])) continue;
          const army = state.cellArmy[cell] ?? 0;
          if (army > bestArmy) {
            bestArmy = army;
            bestCell = cell;
          }
        }
      }
      if (building.kind === 'missile' && bestCell >= 0 && bestArmy > 20) {
        fireMissile(state, countryId, building.id, bestCell);
      }
    }
  }

  // Aircraft hit the thickest enemy stack within their radius.
  for (const region of countryRegions(state, countryId)) {
    for (const building of region.buildings) {
      if (building.kind !== 'airfield' || !isReady(state, building)) continue;
      if (country.aircraft < 1) return;
      const index = countryIndexOf(state, countryId);
      const width = state.world.width;
      const bx = building.cell % width;
      const by = (building.cell / width) | 0;
      let bestCell = -1;
      let bestArmy = 0;
      for (let y = Math.max(0, by - AIR_RANGE); y <= Math.min(state.world.height - 1, by + AIR_RANGE); y += 1) {
        for (let x = Math.max(0, bx - AIR_RANGE); x <= Math.min(state.world.width - 1, bx + AIR_RANGE); x += 1) {
          const cell = y * width + x;
          const owner = state.cellOwner[cell] ?? -1;
          if (owner < 0 || owner === index) continue;
          if (!areAtWar(state, countryId, state.countryOrder[owner])) continue;
          const army = state.cellArmy[cell] ?? 0;
          if (army > bestArmy) {
            bestArmy = army;
            bestCell = cell;
          }
        }
      }
      if (bestCell >= 0 && bestArmy > 40) launchAirStrike(state, countryId, building.id, bestCell);
    }
  }
}

function tryPeace(state: GameState, countryId: CountryId): void {
  const country = state.countries[countryId];
  if (!country || country.warWith.length === 0) return;
  const mine = country.army + country.population * 0.05;
  for (const enemyId of [...country.warWith]) {
    const enemy = state.countries[enemyId];
    if (!enemy) continue;
    const theirs = enemy.army + enemy.population * 0.05;
    if (mine <= 0) return;
    if (theirs / mine > 1.8 && territoryShare(state, countryId) < 0.2) {
      makePeace(state, countryId, enemyId);
      return;
    }
  }
}

/** One decision pass for a single AI country. */
export function runAiCountry(state: GameState, country: CountryState, profile: AiProfile): void {
  tryBuild(state, country.id, profile);
  tryMobilize(state, country.id, profile);
  tryStrikes(state, country.id);
  tryOffensive(state, country.id, profile);
  tryPeace(state, country.id);
}

/** Runs every AI country on its own cadence — the same rules the player has. */
export function runAi(state: GameState): void {
  if (state.status !== 'playing') return;
  const profile = PROFILES[state.difficulty] ?? PROFILES.normal!;
  for (const [index, country] of Object.values(state.countries).entries()) {
    if (country.isPlayer || !country.alive) continue;
    if ((state.tick + index) % profile.interval !== 0) continue;
    runAiCountry(state, country, profile);
  }
}

export function aiProfileFor(difficulty: string): AiProfile {
  return PROFILES[difficulty] ?? PROFILES.normal!;
}

export { BUILDINGS };
