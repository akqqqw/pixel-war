import type { Rng } from '@/core/rng';
import type { CountryId, TerritoryId } from '@/core/types';
import type { GameState } from '@/core/state/types';
import { armyCount, armyPower, makeArmy, scaleArmy, type Army } from '@/core/units/army';
import type { LandUnitType } from '@/core/units/unitTypes';
import { commandQueueUnit, commandSendArmy, commandUpgradeEconomy } from '@/core/sim/commands';
import { defensePower } from '@/core/sim/combat';
import { countryName, territoryName } from '@/core/sim/events';
import { findOrderPath, findPath } from '@/core/sim/path';

interface AiProfile {
  thinkInterval: number;
  /** Required attacker/defender power ratio before an assault is ordered. */
  attackRatio: number;
  /** Max simultaneous offensive groups. */
  maxAttacks: number;
  /** Chance to develop infrastructure when rich. */
  developChance: number;
  preferredUnits: LandUnitType[];
  /** How many units the AI keeps at home per border territory. */
  homeGuard: number;
  /** Production orders the AI tries to keep in flight. */
  maxQueue: number;
  /** How many garrisons the AI shuffles towards the front per decision. */
  maxTransfers: number;
}

const PROFILES: Record<string, AiProfile> = {
  easy: {
    thinkInterval: 26,
    attackRatio: 2.4,
    maxAttacks: 1,
    developChance: 0.25,
    preferredUnits: ['apc', 'lightTank', 'ifv', 'mbt'],
    homeGuard: 2,
    maxQueue: 1,
    maxTransfers: 1,
  },
  normal: {
    thinkInterval: 16,
    attackRatio: 1.6,
    maxAttacks: 2,
    developChance: 0.4,
    preferredUnits: ['lightTank', 'mbt', 'ifv', 'spg', 'apc'],
    homeGuard: 1,
    maxQueue: 3,
    maxTransfers: 2,
  },
  hard: {
    thinkInterval: 11,
    attackRatio: 1.35,
    maxAttacks: 2,
    developChance: 0.55,
    preferredUnits: ['mbt', 'ifv', 'spg', 'lightTank', 'mlrs'],
    homeGuard: 1,
    maxQueue: 4,
    maxTransfers: 3,
  },
};

function profileFor(state: GameState): AiProfile {
  return PROFILES[state.difficulty] ?? PROFILES.normal!;
}

function ownedTerritories(state: GameState, countryId: CountryId): TerritoryId[] {
  return state.world.territories.filter((t) => state.territories[t.id]?.owner === countryId).map((t) => t.id);
}

function hostileNeighbours(state: GameState, countryId: CountryId, territoryId: TerritoryId): TerritoryId[] {
  const stat = state.world.territories.find((t) => t.id === territoryId);
  if (!stat) return [];
  return stat.neighbors.filter((id) => {
    const owner = state.territories[id]?.owner;
    return !!owner && owner !== countryId;
  });
}

function activeAttackGroups(state: GameState, countryId: CountryId): number {
  return Object.values(state.groups).filter((g) => g.country === countryId && g.intent === 'attack').length;
}

function pickDevelopmentTarget(state: GameState, countryId: CountryId): TerritoryId | null {
  const owned = ownedTerritories(state, countryId);
  if (owned.length === 0) return null;
  const candidates = owned
    .map((id) => state.territories[id]!)
    .filter((ts) => ts.economyLevel < 3)
    .sort((a, b) => b.population - a.population || a.economyLevel - b.economyLevel);
  return candidates[0]?.id ?? null;
}

function pickFactory(state: GameState, countryId: CountryId): TerritoryId | null {
  const owned = ownedTerritories(state, countryId);
  if (owned.length === 0) return null;
  const safe = owned.filter((id) => hostileNeighbours(state, countryId, id).length === 0);
  const pool = safe.length > 0 ? safe : owned;
  const capital = state.countries[countryId]?.capitalTerritoryId;
  if (capital && pool.includes(capital)) return capital;
  return [...pool].sort(
    (a, b) => (state.territories[b]?.economyLevel ?? 1) - (state.territories[a]?.economyLevel ?? 1),
  )[0] ?? null;
}

function tryProduce(state: GameState, country: CountryId, profile: AiProfile, rng: Rng): void {
  const factory = pickFactory(state, country);
  if (!factory) return;
  let queued = state.production.filter((item) => item.country === country).length;
  while (queued < profile.maxQueue) {
    if (!queueOneUnit(state, country, profile, rng)) break;
    queued += 1;
  }
}

function queueOneUnit(state: GameState, country: CountryId, profile: AiProfile, rng: Rng): boolean {
  const factory = pickFactory(state, country);
  if (!factory) return false;
  const list = [...profile.preferredUnits];
  // Randomised order keeps AI armies varied without breaking its preferences.
  const order = list
    .map((unit) => ({ unit, weight: rng.next() * 0.6 + (profile.preferredUnits.indexOf(unit) === 0 ? 0.5 : 0) }))
    .sort((a, b) => b.weight - a.weight);
  for (const { unit } of order) {
    const result = commandQueueUnit(state, { countryId: country, territoryId: factory, unit });
    if (result.ok) return true;
  }
  return false;
}

/** Pulls idle interior garrisons towards the most exposed border territory. */
function tryMobilize(state: GameState, country: CountryId, profile: AiProfile, rng: Rng): void {
  const owned = ownedTerritories(state, country);
  if (owned.length < 2) return;
  const border = owned.filter((id) => hostileNeighbours(state, country, id).length > 0);
  if (border.length === 0) return;

  const pressure = border
    .map((id) => {
      const threat = Math.max(
        ...hostileNeighbours(state, country, id).map((neighbour) => defensePower(state, neighbour)),
        0,
      );
      const own = armyPower(state.territories[id]?.garrison ?? {});
      return { id, threat, own, score: own - threat };
    })
    .sort((a, b) => a.score - b.score);

  const target = pressure[0];
  if (!target) return;
  if (target.threat <= 0) return;

  const donors = owned
    .filter((id) => id !== target.id)
    .filter((id) => hostileNeighbours(state, country, id).length === 0)
    .map((id) => {
      const garrison = state.territories[id]?.garrison ?? {};
      const path = findOrderPath(state, country, id, target.id);
      return { id, count: armyCount(garrison), power: armyPower(garrison), path };
    })
    .filter((entry) => entry.path && entry.count >= 2)
    .sort((a, b) => b.count - a.count);

  let sent = 0;
  for (const donor of donors) {
    if (sent >= profile.maxTransfers) break;
    const garrison = state.territories[donor.id]?.garrison;
    if (!garrison) continue;
    const fraction = rng.chance(0.5) ? 0.6 : 0.8;
    const force = scaleArmy(garrison, fraction);
    if (armyCount(force) === 0) continue;
    const result = commandSendArmy(state, { countryId: country, from: donor.id, to: target.id, army: force });
    if (result.ok) sent += 1;
  }
}

function tryDevelop(state: GameState, country: CountryId, profile: AiProfile, rng: Rng): void {
  const countryState = state.countries[country];
  if (!countryState || countryState.resources.money < 600) return;
  if (!rng.chance(profile.developChance)) return;
  const target = pickDevelopmentTarget(state, country);
  if (!target) return;
  commandUpgradeEconomy(state, { countryId: country, territoryId: target });
}

function tryAttack(state: GameState, country: CountryId, profile: AiProfile, rng: Rng): void {
  if (activeAttackGroups(state, country) >= profile.maxAttacks) return;
  const owned = ownedTerritories(state, country);
  const options: {
    from: TerritoryId;
    to: TerritoryId;
    ratio: number;
    keep: number;
  }[] = [];

  for (const from of owned) {
    const ts = state.territories[from];
    if (!ts) continue;
    const garrisonPower = armyPower(ts.garrison);
    if (garrisonPower < 180) continue;
    const targets = hostileNeighbours(state, country, from);
    for (const to of targets) {
      if (!state.territories[to]) continue;
      const ratio = garrisonPower / Math.max(1, defensePower(state, to));
      const stat = state.world.territories.find((t) => t.id === to);
      const distance = stat ? 1 : 2;
      options.push({ from, to, ratio: ratio - distance * 0.05, keep: profile.homeGuard });
    }
  }

  options.sort((a, b) => b.ratio - a.ratio);
  const best = options[0];
  if (!best || best.ratio < profile.attackRatio) return;
  if (!rng.chance(0.55 + state.countries[country]?.aggression * 0.4)) return;

  const garrison = state.territories[best.from]?.garrison;
  if (!garrison) return;
  let force: Army = makeArmy(garrison);
  if (armyCount(force) > best.keep) {
    // Keep a token home guard only if the AI has something to leave behind.
    const keepFraction = best.keep / Math.max(1, armyCount(force));
    force = scaleArmy(force, 1 - Math.min(0.5, keepFraction));
  }
  if (armyCount(force) === 0) return;
  const result = commandSendArmy(state, { countryId: country, from: best.from, to: best.to, army: force });
  if (result.ok) {
    const ai = state.ai[country];
    if (ai) ai.focusTarget = best.to;
        const targetOwner = state.territories[best.to]?.owner;
      if (targetOwner === state.playerCountryId) {
        emitAttack(state, country, best.to);
      }
  }
}

function emitAttack(state: GameState, country: CountryId, target: TerritoryId): void {
  const owner = state.territories[target]?.owner;
  if (!owner) return;
  state.events.push({
    id: `e${state.nextIds.event++}`,
    tick: state.tick,
    kind: 'battle',
    message: `${countryName(state, country)} начинает наступление на «${territoryName(state, target)}» (${countryName(state, owner)}).`,
    countryId: country,
  });
}

function tryReinforce(state: GameState, country: CountryId): void {
  const owned = ownedTerritories(state, country);
  if (owned.length < 2) return;
  const threatened = owned
    .map((id) => ({
      id,
      power: armyPower(state.territories[id]?.garrison ?? {}),
      threat: hostileNeighbours(state, country, id),
    }))
    .filter((entry) => entry.threat.length > 0)
    .sort((a, b) => a.power - b.power);

  const weakest = threatened[0];
  if (!weakest) return;
  const strongestThreat = Math.max(
    ...weakest.threat.map((id) => defensePower(state, id)),
    0,
  );
  if (weakest.power > strongestThreat * 0.8) return;

  const donors = owned
    .filter((id) => id !== weakest.id)
    .map((id) => ({
      id,
      power: armyPower(state.territories[id]?.garrison ?? {}),
      border: hostileNeighbours(state, country, id).length > 0,
    }))
    .filter((entry) => entry.power > 160)
    .sort((a, b) => (a.border === b.border ? b.power - a.power : a.border ? 1 : -1));

  const donor = donors[0];
  if (!donor) return;
  const path = findPath(state.world, donor.id, weakest.id);
  if (!path || path.length < 2) return;
  const garrison = state.territories[donor.id]?.garrison;
  if (!garrison) return;
  const force = scaleArmy(garrison, donor.border ? 0.5 : 0.7);
  if (armyCount(force) === 0) return;
  commandSendArmy(state, { countryId: country, from: donor.id, to: weakest.id, army: force });
}

/** One AI decision pass. Uses exactly the same commands and costs as the player. */
export function runAiTurn(state: GameState, countryId: CountryId, rng: Rng): void {
  const country = state.countries[countryId];
  if (!country || !country.alive) return;
  const profile = profileFor(state);

  tryDevelop(state, countryId, profile, rng);
  tryProduce(state, countryId, profile, rng);
  tryReinforce(state, countryId);
  tryMobilize(state, countryId, profile, rng);
  tryAttack(state, countryId, profile, rng);

  const ai = state.ai[countryId];
  if (ai) ai.nextThinkTick = state.tick + profile.thinkInterval + Math.floor(rng.next() * 4);
}
