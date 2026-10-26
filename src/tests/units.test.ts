import { describe, expect, it } from 'vitest';
import {
  addArmy,
  armyAvgArmor,
  armyCount,
  armyPower,
  armyUpkeep,
  cloneArmy,
  isArmyEmpty,
  makeArmy,
  mergeArmies,
  scaleArmy,
  splitArmy,
  subtractArmy,
} from '@/core/units/army';
import { LAND_UNITS, UNIT_LIST } from '@/core/units/unitTypes';

describe('army helpers', () => {
  it('sanitises input values', () => {
    const army = makeArmy({ mbt: 2.9, apc: -3, spg: Number.NaN });
    expect(army).toEqual({ mbt: 2 });
    expect(armyCount(army)).toBe(2);
  });

  it('never goes negative', () => {
    const army = makeArmy({ mbt: 2 });
    subtractArmy(army, makeArmy({ mbt: 5 }));
    expect(armyCount(army)).toBe(0);
    expect(army.mbt).toBeUndefined();
  });

  it('merges without mutating inputs', () => {
    const a = makeArmy({ mbt: 1 });
    const b = makeArmy({ apc: 2 });
    const merged = mergeArmies(a, b);
    expect(merged).toEqual({ mbt: 1, apc: 2 });
    expect(a).toEqual({ mbt: 1 });
    expect(b).toEqual({ apc: 2 });
  });

  it('splits armies by fraction and keeps the rest', () => {
    const army = makeArmy({ mbt: 4, apc: 3 });
    const { taken, rest } = splitArmy(army, 0.5);
    expect(taken).toEqual({ mbt: 2, apc: 1 });
    expect(rest).toEqual({ mbt: 2, apc: 2 });
    expect(armyCount(rest) + armyCount(taken)).toBe(armyCount(army));
  });

  it('computes power, armour, upkeep and emptiness', () => {
    const army = makeArmy({ mbt: 2, apc: 1 });
    expect(isArmyEmpty(army)).toBe(false);
    expect(isArmyEmpty({})).toBe(true);
    expect(armyPower(army)).toBeGreaterThan(armyPower(makeArmy({ apc: 1 })));
    expect(armyAvgArmor(army)).toBeGreaterThan(0);
    const upkeep = armyUpkeep(army);
    expect(upkeep.money).toBeGreaterThan(0);
    expect(upkeep.oil).toBeGreaterThan(0);
    expect(scaleArmy(army, 0)).toEqual({});
    expect(cloneArmy(army)).toEqual(army);
    expect(addArmy(makeArmy(), army)).toEqual(army);
  });

  it('every unit definition has sane stats', () => {
    expect(UNIT_LIST.length).toBeGreaterThanOrEqual(6);
    for (const unit of UNIT_LIST) {
      expect(unit.hp).toBeGreaterThan(0);
      expect(unit.attack).toBeGreaterThan(0);
      expect(unit.armor).toBeGreaterThanOrEqual(0);
      expect(unit.buildTime).toBeGreaterThan(0);
      expect(unit.cost.money).toBeGreaterThan(0);
      expect(unit.cost.metal).toBeGreaterThan(0);
      expect(unit.sprite.width).toBe(32);
      expect(unit.sprite.height).toBe(32);
    }
    expect(LAND_UNITS.mbt.attack).toBeGreaterThan(LAND_UNITS.apc.attack);
    expect(LAND_UNITS.mlrs.range).toBeGreaterThan(LAND_UNITS.mbt.range);
  });
});
