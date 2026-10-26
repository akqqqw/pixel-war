import { BUILDINGS, levelFactor } from '@/core/buildings/buildings';
import { BALANCE, TICK_SECONDS } from '@/core/sim/balance';
import { populationCap, regionPopulationGrowth } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import type { BuildingInstance, GameState } from '@/core/state/types';

/** Gold price of one tank and one aircraft, and how long a factory needs. */
export const TANK_COST = 6;
export const AIRCRAFT_COST = 10;
const TANK_INTERVAL_TICKS = 8;
const AIRCRAFT_INTERVAL_TICKS = 12;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Population growth: passive growth plus the cities of the region, up to the cap. */
export function growRegion(region: { population: number; buildings: BuildingInstance[] }): void {
  const growth = regionPopulationGrowth(region);
  const cap = populationCap(region);
  if (region.population >= cap) return;
  region.population = round1(Math.min(cap, region.population + growth * TICK_SECONDS));
}

/**
 * Tank plants and airfields turn gold into hardware. Production never runs on
 * credit: without money in the treasury the line simply waits.
 */
export function produceHardware(state: GameState, countryId: string): void {
  const country = state.countries[countryId];
  if (!country) return;
  let tanks = 0;
  let aircraft = 0;
  for (const region of Object.values(state.regions)) {
    if (region.owner !== countryId) continue;
    for (const building of region.buildings) {
      if (building.kind === 'tankPlant') {
        const interval = Math.max(2, Math.round(TANK_INTERVAL_TICKS / levelFactor(building.level)));
        if (state.tick + 1 < building.readyAtTick) continue;
        if (country.money < TANK_COST) continue;
        country.money = round1(country.money - TANK_COST);
        tanks += 1;
        building.readyAtTick = state.tick + interval;
      } else if (building.kind === 'airfield') {
        const interval = Math.max(3, Math.round(AIRCRAFT_INTERVAL_TICKS / levelFactor(building.level)));
        if (state.tick + 1 < building.readyAtTick) continue;
        if (country.money < AIRCRAFT_COST) continue;
        country.money = round1(country.money - AIRCRAFT_COST);
        aircraft += 1;
        building.readyAtTick = state.tick + interval;
      }
    }
  }
  if (tanks > 0) country.tanks += tanks;
  if (aircraft > 0) country.aircraft += aircraft;
}

/** One economy tick: growth, income, upkeep and hardware production. */
export function runEconomyTick(state: GameState): void {
  for (const region of Object.values(state.regions)) {
    if (!region.owner) continue;
    growRegion(region);
  }

  for (const country of Object.values(state.countries)) {
    if (!country.alive) continue;
    produceHardware(state, country.id);

    let gross = 0;
    for (const region of Object.values(state.regions)) {
      if (region.owner !== country.id) continue;
      gross += region.population * BALANCE.taxPerCitizenPerSecond;
      for (const building of region.buildings) {
        if (BUILDINGS[building.kind].income) {
          gross +=
            (BUILDINGS[building.kind].income ?? 0) *
            Math.pow(1.5, building.level - 1);
        }
      }
    }
    const upkeep = country.army * BALANCE.armyUpkeepPerSoldierPerSecond;
    const income = gross - upkeep;
    country.income = Math.round(income * 10) / 10;
    const next = country.money + income * TICK_SECONDS;
    if (next < 0) {
      // The treasury is empty: soldiers desert until the budget balances again.
      country.money = 0;
      country.unpaid = true;
      const desertion = 1 - 0.03;
      for (let cell = 0; cell < state.cellArmy.length; cell += 1) {
        const owner = state.cellOwner[cell] ?? -1;
        if (owner < 0) continue;
        if (state.countryOrder[owner] !== country.id) continue;
        state.cellArmy[cell] = round1((state.cellArmy[cell] ?? 0) * desertion);
      }
      if (!state.events.some((event) => event.tick === state.tick && event.text.includes('опустела'))) {
        pushEvent(state, 'mobilize', `Казна ${country.shortName} опустела — армия расходится.`, country.id);
      }
    } else {
      country.money = round1(next);
      country.unpaid = false;
    }
  }
}

/** Total number of structures of a country — used by the AI and the menu. */
export function countStructures(state: GameState, countryId: string): number {
  let count = 0;
  for (const region of Object.values(state.regions)) {
    if (region.owner === countryId) count += region.buildings.length;
  }
  return count;
}
