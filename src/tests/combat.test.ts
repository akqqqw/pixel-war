import { describe, expect, it } from 'vitest';
import { createRng } from '@/core/rng';
import { forecastBattle, simulateBattle } from '@/core/combat/battle';
import { armyCount, makeArmy } from '@/core/units/army';

const baseInput = {
  attackerTerrainMod: 1,
  defenderTerrainBonus: 1,
  defenderStructureBonus: 1,
};

describe('battle simulation', () => {
  it('captures an undefended territory', () => {
    const result = simulateBattle({
      ...baseInput,
      attacker: makeArmy({ apc: 2 }),
      defender: {},
      rng: createRng(1),
    });
    expect(result.outcome).toBe('attackerWin');
    expect(result.attackerLosses).toEqual({});
    expect(armyCount(result.attackerSurvivors)).toBe(2);
  });

  it('overwhelming force wins with modest losses', () => {
    const result = simulateBattle({
      ...baseInput,
      attacker: makeArmy({ mbt: 8, ifv: 4 }),
      defender: makeArmy({ apc: 1 }),
      rng: createRng(7),
    });
    expect(result.outcome).toBe('attackerWin');
    expect(armyCount(result.defenderSurvivors)).toBe(0);
    expect(armyCount(result.attackerSurvivors)).toBeGreaterThan(0);
    expect(armyCount(result.attackerLosses)).toBeLessThan(6);
  });

  it('a strong entrenched defender holds the line', () => {
    const result = simulateBattle({
      attacker: makeArmy({ apc: 1 }),
      defender: makeArmy({ mbt: 6, spg: 2 }),
      attackerTerrainMod: 0.8,
      defenderTerrainBonus: 1.45,
      defenderStructureBonus: 1.4,
      rng: createRng(11),
    });
    expect(result.outcome).toBe('defenderWin');
    expect(armyCount(result.attackerSurvivors)).toBe(0);
    expect(armyCount(result.defenderSurvivors)).toBeGreaterThan(0);
  });

  it('losses never exceed the starting armies and hp never goes negative', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const attacker = makeArmy({ mbt: 1 + (seed % 4), lightTank: seed % 3 });
      const defender = makeArmy({ ifv: 1 + (seed % 5), apc: seed % 2 });
      const result = simulateBattle({
        ...baseInput,
        attacker,
        defender,
        rng: createRng(seed + 1),
      });
      for (const [type, initial] of Object.entries(attacker) as [keyof typeof attacker, number][]) {
        const losses = result.attackerLosses[type] ?? 0;
        expect(losses).toBeLessThanOrEqual(initial);
        expect(losses).toBeGreaterThanOrEqual(0);
        expect(result.attackerSurvivors[type] ?? 0).toBeLessThanOrEqual(initial);
      }
      for (const [type, initial] of Object.entries(defender) as [keyof typeof defender, number][]) {
        const losses = result.defenderLosses[type] ?? 0;
        expect(losses).toBeLessThanOrEqual(initial);
        expect(losses).toBeGreaterThanOrEqual(0);
      }
      expect(result.rounds.length).toBeLessThanOrEqual(10);
      for (const round of result.rounds) {
        expect(round.attackerHpLeft).toBeGreaterThanOrEqual(0);
        expect(round.defenderHpLeft).toBeGreaterThanOrEqual(0);
        expect(round.attackerDamage).toBeGreaterThanOrEqual(0);
        expect(round.defenderDamage).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('forecast favours the bigger army', () => {
    const weak = forecastBattle({
      ...baseInput,
      attacker: makeArmy({ apc: 1 }),
      defender: makeArmy({ mbt: 4 }),
    });
    const strong = forecastBattle({
      ...baseInput,
      attacker: makeArmy({ mbt: 8 }),
      defender: makeArmy({ apc: 1 }),
    });
    expect(weak.attackerChance).toBeLessThan(0.2);
    expect(strong.attackerChance).toBeGreaterThan(0.8);
    expect(strong.ratio).toBeGreaterThan(weak.ratio);
  });

  it('is deterministic for a given seed', () => {
    const run = () =>
      simulateBattle({
        ...baseInput,
        attacker: makeArmy({ mbt: 3, ifv: 2 }),
        defender: makeArmy({ lightTank: 3 }),
        rng: createRng(55),
      });
    expect(run()).toEqual(run());
  });
});
