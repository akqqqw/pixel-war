import type { Rng } from '@/core/rng';
import { clamp } from '@/core/rng';
import type { CountryId, TerritoryId } from '@/core/types';
import type { BattleReport, BattleRoundLog, GameState } from '@/core/state/types';
import { addArmy, armyCount, armyPower, cloneArmy, makeArmy, type Army } from '@/core/units/army';
import { simulateBattle } from '@/core/combat/battle';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import type { TerritoryStatic } from '@/core/world/world';
import { countryName, pushEvent, territoryName } from '@/core/sim/events';
import { findPath, findOrderPath } from '@/core/sim/path';

export const MAX_BATTLE_HISTORY = 40;

export function territoryStatic(state: GameState, id: TerritoryId): TerritoryStatic | null {
  return state.world.territories.find((t) => t.id === id) ?? null;
}

/** Static defence strength of a territory including terrain and infrastructure. */
export function defensePower(state: GameState, territoryId: TerritoryId): number {
  const ts = state.territories[territoryId];
  const stat = territoryStatic(state, territoryId);
  if (!ts || !stat) return 0;
  const terrain = TERRAIN_INFO[stat.dominantTerrain as TerrainCode];
  return armyPower(ts.garrison) * terrain.defenseBonus * structureDefenseBonus(state, territoryId);
}

export function structureDefenseBonus(state: GameState, territoryId: TerritoryId): number {
  const ts = state.territories[territoryId];
  const stat = territoryStatic(state, territoryId);
  if (!ts || !stat) return 1;
  const isCapital = state.countries[ts.owner]?.capitalTerritoryId === territoryId;
  return 1 + (ts.economyLevel - 1) * 0.12 + (isCapital ? 0.15 : 0);
}

export function declareWarInternal(state: GameState, attacker: CountryId, defender: CountryId): void {
  if (attacker === defender) return;
  const a = state.countries[attacker];
  const b = state.countries[defender];
  if (!a || !b) return;
  if (a.warWith.includes(defender)) return;
  a.warWith.push(defender);
  if (!b.warWith.includes(attacker)) b.warWith.push(attacker);
  a.relations[defender] = clamp((a.relations[defender] ?? 0) - 60, -100, 100);
  b.relations[attacker] = clamp((b.relations[attacker] ?? 0) - 60, -100, 100);
  a.reputation = clamp(a.reputation - 6, 0, 100);
  pushEvent(
    state,
    'diplomacy',
    `${countryName(state, attacker)} объявляет войну ${countryName(state, defender)}!`,
    attacker,
  );
}

export function makePeaceInternal(state: GameState, a: CountryId, b: CountryId): void {
  const ca = state.countries[a];
  const cb = state.countries[b];
  if (!ca || !cb) return;
  ca.warWith = ca.warWith.filter((id) => id !== b);
  cb.warWith = cb.warWith.filter((id) => id !== a);
  ca.relations[b] = clamp((ca.relations[b] ?? 0) + 30, -100, 100);
  cb.relations[a] = clamp((cb.relations[a] ?? 0) + 30, -100, 100);
  pushEvent(
    state,
    'diplomacy',
    `${countryName(state, a)} и ${countryName(state, b)} подписывают мир.`,
    a,
  );
}

function applyPrestigePenalty(state: GameState, conqueror: CountryId): void {
  for (const country of Object.values(state.countries)) {
    if (country.id === conqueror) continue;
    country.relations[conqueror] = clamp((country.relations[conqueror] ?? 0) - 5, -100, 100);
  }
  const c = state.countries[conqueror];
  if (c) c.reputation = clamp(c.reputation - 2, 0, 100);
}

/**
 * Transfers a territory to a new owner, handles capital loss, unrest and country elimination.
 * The garrison must already be computed by the caller.
 */
export function captureTerritory(
  state: GameState,
  territoryId: TerritoryId,
  newOwner: CountryId,
  garrison: Army,
  rng: Rng,
): void {
  const ts = state.territories[territoryId];
  const stat = territoryStatic(state, territoryId);
  if (!ts || !stat) return;
  const oldOwner = ts.owner;
  if (oldOwner === newOwner) return;

  const previous = state.countries[oldOwner];
  const next = state.countries[newOwner];
  if (previous) previous.stats.lost += 1;
  if (next) next.stats.captured += 1;

  ts.owner = newOwner;
  ts.garrison = makeArmy(garrison);
  ts.unrest = 1;
  ts.capturedAtTick = state.tick;
  if (rng.chance(0.45)) ts.economyLevel = Math.max(1, ts.economyLevel - 1);

  pushEvent(
    state,
    'capture',
    `${countryName(state, newOwner)} захватывает территорию «${stat.name}» у ${countryName(state, oldOwner)}.`,
    newOwner,
    { territoryId, previousOwnerId: oldOwner },
  );
  applyPrestigePenalty(state, newOwner);

  if (previous && previous.capitalTerritoryId === territoryId) {
    previous.capitalTerritoryId = null;
    const remaining = state.world.territories
      .filter((t) => state.territories[t.id]?.owner === oldOwner)
      .sort((a, b) => (state.territories[b.id]?.population ?? 0) - (state.territories[a.id]?.population ?? 0));
    if (remaining.length > 0) {
      previous.capitalTerritoryId = remaining[0]!.id;
      pushEvent(
        state,
        'capture',
        `Столица ${countryName(state, oldOwner)} пала! Правительство переезжает в «${remaining[0]!.name}».`,
        oldOwner,
      );
    } else {
      eliminateCountry(state, oldOwner);
    }
  }
}

export function eliminateCountry(state: GameState, countryId: CountryId): void {
  const country = state.countries[countryId];
  if (!country || !country.alive) return;
  country.alive = false;
  country.capitalTerritoryId = null;
  country.warWith = [];
  for (const [id, group] of Object.entries(state.groups)) {
    if (group.country === countryId) delete state.groups[id];
  }
  state.production = state.production.filter((item) => item.country !== countryId);
  pushEvent(
    state,
    'victory',
    `${countryName(state, countryId)} прекращает существование. Государство уничтожено.`,
    countryId,
  );
}

/** Sends routed defenders to the safest friendly neighbour; returns the number saved. */
function retreatDefenders(
  state: GameState,
  fromTerritory: TerritoryId,
  defenderCountry: CountryId,
  survivors: Army,
): void {
  if (armyCount(survivors) === 0) return;
  const stat = territoryStatic(state, fromTerritory);
  if (!stat) return;
  const candidates = stat.neighbors
    .map((id) => state.territories[id])
    .filter((ts): ts is NonNullable<typeof ts> => !!ts && ts.owner === defenderCountry)
    .sort((a, b) => armyCount(b.garrison) - armyCount(a.garrison));
  const refuge = candidates[0];
  if (!refuge) return;
  addArmy(refuge.garrison, survivors);
  pushEvent(
    state,
    'battle',
    `Остатки гарнизона ${countryName(state, defenderCountry)} отступают в «${territoryName(state, refuge.id)}».`,
    defenderCountry,
  );
}

function findRetreatTarget(state: GameState, countryId: CountryId, from: TerritoryId): TerritoryId | null {
  const owned = state.world.territories
    .filter((t) => state.territories[t.id]?.owner === countryId)
    .map((t) => ({ id: t.id, path: findOrderPath(state, countryId, from, t.id) }))
    .filter((entry): entry is { id: TerritoryId; path: TerritoryId[] } => !!entry.path)
    .sort((a, b) => a.path.length - b.path.length);
  return owned[0]?.id ?? null;
}

export interface AssaultContext {
  attackerMorale?: number;
  defenderMorale?: number;
}

/** Resolves the arrival of a moving group: merges, captures or fights. */
export function resolveArrival(state: GameState, groupId: string, rng: Rng): void {
  const group = state.groups[groupId];
  if (!group) return;
  const territoryId = group.territoryId;
  const ts = state.territories[territoryId];
  const stat = territoryStatic(state, territoryId);
  const attacker = state.countries[group.country];
  if (!ts || !stat || !attacker) {
    delete state.groups[groupId];
    return;
  }

  if (ts.owner === group.country) {
    addArmy(ts.garrison, group.army);
    delete state.groups[groupId];
    return;
  }

  if (!attacker.warWith.includes(ts.owner)) {
    declareWarInternal(state, group.country, ts.owner);
  }

  const defender = state.countries[ts.owner];
  const terrain = TERRAIN_INFO[stat.dominantTerrain as TerrainCode];
  const attackerTerrainMod = terrain.attackModifier;
  const defenderTerrainBonus = terrain.defenseBonus;
  const defenderStructureBonus = structureDefenseBonus(state, territoryId);

  // Empty territory: Conway-style immediate takeover, no fight required.
  if (armyCount(ts.garrison) === 0) {
    const garrison = cloneArmy(group.army);
    captureTerritory(state, territoryId, group.country, garrison, rng);
    pushEvent(
      state,
      'capture',
      `«${stat.name}» занята без боя подразделениями ${countryName(state, group.country)}.`,
      group.country,
    );
    delete state.groups[groupId];
    return;
  }

  const attackerArmy = cloneArmy(group.army);
  const defenderArmy = cloneArmy(ts.garrison);
  const result = simulateBattle({
    attacker: attackerArmy,
    defender: defenderArmy,
    attackerTerrainMod,
    defenderTerrainBonus,
    defenderStructureBonus,
    rng,
  });

  const rounds: BattleRoundLog[] = result.rounds;
  const report: BattleReport = {
    id: `b${state.nextIds.battle++}`,
    tick: state.tick,
    territoryId,
    territoryName: stat.name,
    attackerCountry: group.country,
    defenderCountry: ts.owner,
    attackerArmy,
    defenderArmy,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    outcome: result.outcome,
    captured: false,
    rounds,
    attackerTerrainMod: Math.round(attackerTerrainMod * 100) / 100,
    defenderTerrainBonus: Math.round(defenderTerrainBonus * 100) / 100,
  };

  const attackerWins =
    result.outcome === 'attackerWin' && armyCount(result.attackerSurvivors) > 0;

  if (attackerWins) {
    report.captured = true;
    if (defender) defender.stats.battlesLost += 1;
    attacker.stats.battlesWon += 1;
    retreatDefenders(state, territoryId, ts.owner, result.defenderSurvivors);
    captureTerritory(state, territoryId, group.country, result.attackerSurvivors, rng);
    pushEvent(
      state,
      'battle',
      `Победа ${countryName(state, group.country)}: «${stat.name}» захвачена после ${rounds.length} раундов боя.`,
      group.country,
    );
    delete state.groups[groupId];
  } else {
    if (defender) defender.stats.battlesWon += 1;
    attacker.stats.battlesLost += 1;
    ts.garrison = makeArmy(result.defenderSurvivors);
    pushEvent(
      state,
      'battle',
      `${countryName(state, ts.owner)} удерживает «${stat.name}» — атака отбита.`,
      ts.owner,
    );
    const survivors = makeArmy(result.attackerSurvivors);
    if (armyCount(survivors) === 0) {
      delete state.groups[groupId];
    } else {
      const home = findRetreatTarget(state, group.country, territoryId);
      if (!home || home === territoryId) {
        // Nowhere to fall back to: survivors are absorbed by the defender as losses.
        delete state.groups[groupId];
      } else {
        group.army = survivors;
        const path = findPath(state.world, territoryId, home);
        if (!path) {
          delete state.groups[groupId];
        } else {
          group.movement = {
            path,
            step: path.length > 1 ? 1 : 0,
            progress: 0,
            milliseconds: 0,
            originTerritoryId: territoryId,
          };
          group.intent = 'move';
          group.order = { kind: 'move', targetTerritoryId: home };
        }
      }
    }
  }

  state.battles.unshift(report);
  if (state.battles.length > MAX_BATTLE_HISTORY) state.battles.length = MAX_BATTLE_HISTORY;
}
