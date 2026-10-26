import { BALANCE } from '@/core/sim/balance';
import { armyCap } from '@/core/sim/actions';
import { countryIncome, territoryEffects, territoryIncome } from '@/core/sim/effects';
import type { GameState, TerritoryState } from '@/core/state/types';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Population and army growth for one territory. */
export function growTerritory(territory: TerritoryState): void {
  const effects = territoryEffects(territory);
  const passive = territory.population * BALANCE.populationGrowth;
  const growth = passive + effects.populationPerTick;
  // The cap limits growth, it never shrinks an already larger population.
  const next =
    territory.population >= effects.populationCap
      ? territory.population
      : Math.min(effects.populationCap, territory.population + growth);
  territory.population = round1(Math.max(5, next));
  if (effects.armyPerTick > 0) {
    territory.army = round1(Math.min(armyCap(territory), territory.army + effects.armyPerTick));
  }
}

export interface EconomyReport {
  income: Record<string, number>;
}

/** One hour of the economy: taxes, buildings, growth, upkeep. */
export function runEconomyTick(state: GameState): EconomyReport {
  const income: Record<string, number> = {};

  for (const territory of Object.values(state.territories)) {
    if (!territory.owner) continue;
    growTerritory(territory);
    territory.income = round1(territoryIncome(state, territory));
  }

  for (const country of Object.values(state.countries)) {
    if (!country.alive) continue;
    const net = countryIncome(state, country.id);
    income[country.id] = net;
    country.income = net;
    const next = country.money + net;
    if (next < 0) {
      // Empty treasury: soldiers go home until the budget balances again.
      country.money = 0;
      country.unpaid = true;
      for (const territory of Object.values(state.territories)) {
        if (territory.owner !== country.id) continue;
        territory.army = round1(Math.max(0, territory.army * (1 - BALANCE.unpaidAttrition)));
      }
    } else {
      country.money = round1(next);
      country.unpaid = false;
    }
  }

  return { income };
}

/** Total population and army of a country — used by the HUD and the AI. */
export function countryTotals(state: GameState, countryId: string): { population: number; army: number; territories: number } {
  let population = 0;
  let army = 0;
  let territories = 0;
  for (const territory of Object.values(state.territories)) {
    if (territory.owner !== countryId) continue;
    population += territory.population;
    army += territory.army;
    territories += 1;
  }
  return { population, army, territories };
}
