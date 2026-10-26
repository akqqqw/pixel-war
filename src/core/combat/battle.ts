import type { Rng } from '@/core/rng';
import type { BattleRoundLog } from '@/core/state/types';
import { armyAvgArmor, armyCount, armyHp, cloneArmy, type Army } from '@/core/units/army';
import { LAND_UNIT_TYPES, LAND_UNITS, type LandUnitType } from '@/core/units/unitTypes';

/** Global tuning knob: how fast HP is traded per combat round. */
export const DAMAGE_SCALE = 0.5;
export const MAX_ROUNDS = 10;
/** Defenders get a structural edge even in open terrain. */
export const DEFENDER_EDGE = 1.3;
/** A side below this share of its starting HP may break off the fight. */
const ROUT_THRESHOLD = 0.28;

export interface BattleInput {
  attacker: Army;
  defender: Army;
  /** Attacker firepower multiplier from the target's terrain. */
  attackerTerrainMod: number;
  /** Defender firepower multiplier from the target's terrain. */
  defenderTerrainBonus: number;
  /** Extra defender multiplier from infrastructure (economy level). */
  defenderStructureBonus: number;
  rng: Rng;
  attackerMorale?: number;
  defenderMorale?: number;
}

export interface BattleResult {
  outcome: 'attackerWin' | 'defenderWin' | 'stalemate';
  attackerSurvivors: Army;
  defenderSurvivors: Army;
  attackerLosses: Army;
  defenderLosses: Army;
  rounds: BattleRoundLog[];
}

interface Side {
  initial: Army;
  hp: Record<LandUnitType, number>;
  maxHp: number;
}

function createSide(army: Army): Side {
  const hp = {} as Record<LandUnitType, number>;
  let maxHp = 0;
  for (const type of LAND_UNIT_TYPES) {
    const count = Math.max(0, Math.floor(army[type] ?? 0));
    hp[type] = count * LAND_UNITS[type].hp;
    maxHp += hp[type];
  }
  return { initial: cloneArmy(army), hp, maxHp };
}

function sideTotalHp(side: Side): number {
  let total = 0;
  for (const type of LAND_UNIT_TYPES) total += side.hp[type];
  return total;
}

/** Current unit counts derived from remaining HP (partially damaged units still count). */
function sideArmy(side: Side): Army {
  const army: Army = {};
  for (const type of LAND_UNIT_TYPES) {
    const hp = side.hp[type];
    if (hp <= 0) continue;
    army[type] = Math.ceil(hp / LAND_UNITS[type].hp);
  }
  return army;
}

function firepower(army: Army): number {
  let power = 0;
  for (const type of LAND_UNIT_TYPES) {
    power += (army[type] ?? 0) * LAND_UNITS[type].attack;
  }
  return power;
}

function armourMitigation(targetArmor: number): number {
  return 100 / (100 + targetArmor * 5);
}

function applyDamage(side: Side, damage: number): void {
  const total = sideTotalHp(side);
  if (total <= 0 || damage <= 0) return;
  const share = Math.min(1, damage / total);
  for (const type of LAND_UNIT_TYPES) {
    side.hp[type] = Math.max(0, side.hp[type] * (1 - share));
  }
}

function lossesBetween(initial: Army, survivors: Army): Army {
  const losses: Army = {};
  for (const type of LAND_UNIT_TYPES) {
    const lost = Math.max(0, (initial[type] ?? 0) - (survivors[type] ?? 0));
    if (lost > 0) losses[type] = lost;
  }
  return losses;
}

export function simulateBattle(input: BattleInput): BattleResult {
  const attacker = createSide(input.attacker);
  const defender = createSide(input.defender);
  const rounds: BattleRoundLog[] = [];

  if (attacker.maxHp <= 0) {
    return {
      outcome: 'defenderWin',
      attackerSurvivors: {},
      defenderSurvivors: sideArmy(defender),
      attackerLosses: cloneArmy(input.attacker),
      defenderLosses: {},
      rounds,
    };
  }
  if (defender.maxHp <= 0) {
    return {
      outcome: 'attackerWin',
      attackerSurvivors: sideArmy(attacker),
      defenderSurvivors: {},
      attackerLosses: {},
      defenderLosses: {},
      rounds,
    };
  }

  let outcome: BattleResult['outcome'] = 'stalemate';
  const attackerMorale = (input.attackerMorale ?? 75) / 100;
  const defenderMorale = (input.defenderMorale ?? 75) / 100;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    const attackerArmy = sideArmy(attacker);
    const defenderArmy = sideArmy(defender);
    if (armyCount(attackerArmy) === 0) break;
    if (armyCount(defenderArmy) === 0) break;

    const attackerRoll = 0.85 + input.rng.next() * 0.3;
    const defenderRoll = 0.85 + input.rng.next() * 0.3;

    const attackerDamage =
      firepower(attackerArmy) *
      DAMAGE_SCALE *
      input.attackerTerrainMod *
      attackerMorale *
      attackerRoll *
      armourMitigation(armyAvgArmor(defenderArmy));
    const defenderDamage =
      firepower(defenderArmy) *
      DAMAGE_SCALE *
      input.defenderTerrainBonus *
      input.defenderStructureBonus *
      DEFENDER_EDGE *
      defenderMorale *
      defenderRoll *
      armourMitigation(armyAvgArmor(attackerArmy));

    applyDamage(defender, attackerDamage);
    applyDamage(attacker, defenderDamage);

    const attackerHpLeft = sideTotalHp(attacker);
    const defenderHpLeft = sideTotalHp(defender);
    rounds.push({
      index: round,
      attackerDamage: Math.round(attackerDamage),
      defenderDamage: Math.round(defenderDamage),
      attackerHpLeft: Math.round(attackerHpLeft),
      defenderHpLeft: Math.round(defenderHpLeft),
    });

    if (defenderHpLeft <= 0.001) {
      outcome = 'attackerWin';
      break;
    }
    if (attackerHpLeft <= 0.001) {
      outcome = 'defenderWin';
      break;
    }

    const attackerShare = attackerHpLeft / attacker.maxHp;
    const defenderShare = defenderHpLeft / defender.maxHp;
    if (attackerShare < ROUT_THRESHOLD && input.rng.chance(0.35 * (1.05 - attackerMorale))) {
      outcome = 'defenderWin';
      break;
    }
    if (defenderShare < ROUT_THRESHOLD && input.rng.chance(0.4 * (1.05 - defenderMorale))) {
      outcome = 'attackerWin';
      break;
    }
  }

  if (outcome === 'stalemate') {
    const attackerShare = sideTotalHp(attacker) / attacker.maxHp;
    const defenderShare = sideTotalHp(defender) / defender.maxHp;
    if (attackerShare > defenderShare + 0.2) outcome = 'attackerWin';
    else outcome = 'defenderWin';
  }

  const attackerSurvivors = outcome === 'attackerWin' ? sideArmy(attacker) : {};
  const defenderSurvivors = outcome === 'attackerWin' ? {} : sideArmy(defender);

  return {
    outcome,
    attackerSurvivors,
    defenderSurvivors,
    attackerLosses: lossesBetween(input.attacker, attackerSurvivors),
    defenderLosses: lossesBetween(input.defender, defenderSurvivors),
    rounds,
  };
}

export interface BattleForecast {
  attackerPower: number;
  defenderPower: number;
  /** 0..1 rough chance for the attacker to win. */
  attackerChance: number;
  ratio: number;
}

/** Used by the UI to preview an assault without randomness. */
export function forecastBattle(params: {
  attacker: Army;
  defender: Army;
  attackerTerrainMod: number;
  defenderTerrainBonus: number;
  defenderStructureBonus: number;
}): BattleForecast {
  const attackerDps =
    firepower(params.attacker) * params.attackerTerrainMod * armourMitigation(armyAvgArmor(params.defender));
  const defenderDps =
    firepower(params.defender) *
    params.defenderTerrainBonus *
    params.defenderStructureBonus *
    DEFENDER_EDGE *
    armourMitigation(armyAvgArmor(params.attacker));
  const attackerHp = armyHp(params.attacker);
  const defenderHp = armyHp(params.defender);

  const attackPower = attackerDps * (attackerHp / 1000 + 0.2);
  const defensePower = defenderDps * (defenderHp / 1000 + 0.2);
  const ratio = defenderDps > 0 ? attackerDps / defenderDps : 10;
  const attackerChance = Math.max(0, Math.min(1, (ratio - 0.6) / 1.1));
  return {
    attackerPower: Math.round(attackPower),
    defenderPower: Math.round(defensePower),
    attackerChance,
    ratio,
  };
}

/** Free capture used when a territory has no garrison at all. */
export function canCaptureUnguarded(attacker: Army): boolean {
  return armyCount(attacker) > 0;
}
