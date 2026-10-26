import type { Resources } from '@/core/types';
import { LAND_UNIT_TYPES, LAND_UNITS, type LandUnitDef, type LandUnitType } from '@/core/units/unitTypes';

/** A stack of units. Always use the helpers below so values stay non-negative integers. */
export type Army = Partial<Record<LandUnitType, number>>;

export function makeArmy(entries?: Partial<Record<LandUnitType, number>>): Army {
  const army: Army = {};
  if (!entries) return army;
  for (const type of LAND_UNIT_TYPES) {
    const count = Math.floor(entries[type] ?? 0);
    if (count > 0) army[type] = count;
  }
  return army;
}

export function cloneArmy(army: Army): Army {
  return makeArmy(army);
}

export function armyCount(army: Army | null | undefined): number {
  if (!army) return 0;
  let total = 0;
  for (const type of LAND_UNIT_TYPES) total += Math.max(0, Math.floor(army[type] ?? 0));
  return total;
}

export function isArmyEmpty(army: Army | null | undefined): boolean {
  return armyCount(army) === 0;
}

export function armyEntries(army: Army): { type: LandUnitType; def: LandUnitDef; count: number }[] {
  const out: { type: LandUnitType; def: LandUnitDef; count: number }[] = [];
  for (const type of LAND_UNIT_TYPES) {
    const count = Math.max(0, Math.floor(army[type] ?? 0));
    if (count > 0) out.push({ type, def: LAND_UNITS[type], count });
  }
  return out;
}

export function addArmy(target: Army, delta: Army): Army {
  for (const type of LAND_UNIT_TYPES) {
    const next = Math.max(0, Math.floor((target[type] ?? 0) + (delta[type] ?? 0)));
    if (next > 0) target[type] = next;
    else delete target[type];
  }
  return target;
}

export function subtractArmy(target: Army, delta: Army): Army {
  const negative: Army = {};
  for (const type of LAND_UNIT_TYPES) {
    if (delta[type]) negative[type] = -(delta[type] as number);
  }
  return addArmy(target, negative);
}

export function scaleArmy(army: Army, factor: number): Army {
  const out: Army = {};
  for (const type of LAND_UNIT_TYPES) {
    const count = Math.floor((army[type] ?? 0) * factor);
    if (count > 0) out[type] = count;
  }
  return out;
}

/** Stacked combat value — used for AI decisions and the battle preview. */
export function armyPower(army: Army, hpMultiplier = 1): number {
  let power = 0;
  for (const { def, count } of armyEntries(army)) {
    power += count * (def.attack * 1.6 + (def.hp * hpMultiplier) / 6);
  }
  return Math.round(power);
}

export function armyHp(army: Army): number {
  let hp = 0;
  for (const { def, count } of armyEntries(army)) hp += count * def.hp;
  return hp;
}

export function armyAvgArmor(army: Army): number {
  const total = armyCount(army);
  if (total === 0) return 0;
  let armor = 0;
  for (const { def, count } of armyEntries(army)) armor += def.armor * count;
  return armor / total;
}

export function armyUpkeep(army: Army): Resources {
  const out: Resources = { money: 0, metal: 0, oil: 0, energy: 0 };
  for (const { def, count } of armyEntries(army)) {
    out.money += (def.upkeep.money ?? 0) * count;
    out.metal += (def.upkeep.metal ?? 0) * count;
    out.oil += (def.upkeep.oil ?? 0) * count;
    out.energy += (def.upkeep.energy ?? 0) * count;
  }
  return out;
}

export function armyCompositionLabel(army: Army): string {
  const entries = armyEntries(army);
  if (entries.length === 0) return 'нет войск';
  return entries.map((e) => `${e.def.shortName}×${e.count}`).join(', ');
}

export function mergeArmies(a: Army, b: Army): Army {
  return addArmy(cloneArmy(a), b);
}

/** Splits an army by a fraction, returning the detached part (never mutates input). */
export function splitArmy(army: Army, fraction: number): { taken: Army; rest: Army } {
  const taken = scaleArmy(army, Math.max(0, Math.min(1, fraction)));
  const rest = cloneArmy(army);
  subtractArmy(rest, taken);
  return { taken, rest };
}
