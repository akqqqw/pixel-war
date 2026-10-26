import type { CountryId, Resources, TerritoryId } from '@/core/types';
import { RESOURCE_KEYS, zeroResources } from '@/core/types';
import type { GameState, ProductionItem } from '@/core/state/types';
import { LAND_UNITS, type LandUnitType } from '@/core/units/unitTypes';
import { addArmy } from '@/core/units/army';
import { countryName, pushEvent, territoryName } from '@/core/sim/events';

export const MAX_QUEUE_PER_TERRITORY = 3;

export function productionSpeed(state: GameState, countryId: CountryId, territoryId: TerritoryId): number {
  const country = state.countries[countryId];
  const ts = state.territories[territoryId];
  if (!country || !ts) return 1;
  let speed = 1 + (ts.economyLevel - 1) * 0.3;
  if (country.deficit.money) speed *= 0.55;
  if (country.deficit.energy) speed *= 0.8;
  if (country.deficit.oil) speed *= 0.85;
  if (country.deficit.metal) speed *= 0.7;
  return Math.max(0.15, speed);
}

export function queueSizeFor(state: GameState, territoryId: TerritoryId): number {
  return state.production.filter((item) => item.territoryId === territoryId).length;
}

export function refundCost(cost: Resources, fraction: number): Partial<Resources> {
  const refund: Partial<Resources> = {};
  for (const key of RESOURCE_KEYS) {
    const value = Math.floor(cost[key] * fraction);
    if (value > 0) refund[key] = value;
  }
  return refund;
}

export function runProductionTick(state: GameState, dtTicks: number): void {
  const remaining: ProductionItem[] = [];
  for (const item of state.production) {
    const country = state.countries[item.country];
    const ts = state.territories[item.territoryId];
    if (!country || !country.alive || !ts || ts.owner !== item.country) {
      if (country) {
        const refund = refundCost(LAND_UNITS[item.unit].cost, 0.5);
        for (const key of RESOURCE_KEYS) country.resources[key] += refund[key] ?? 0;
      }
      pushEvent(
        state,
        'production',
        `Производство в «${territoryName(state, item.territoryId)}» прервано — территория потеряна.`,
        item.country,
      );
      continue;
    }
    const speed = productionSpeed(state, item.country, item.territoryId);
    item.ticksLeft -= dtTicks * speed;
    if (item.ticksLeft > 0) {
      remaining.push(item);
      continue;
    }
    addArmy(ts.garrison, { [item.unit]: 1 });
    country.stats.produced += 1;
    if (country.isPlayer) {
      pushEvent(
        state,
        'production',
        `Готов новый ${LAND_UNITS[item.unit].name} — «${territoryName(state, item.territoryId)}».`,
        country.id,
      );
    }
  }
  state.production = remaining;
}

export function unitCostWithEconomy(state: GameState, territoryId: TerritoryId, unit: LandUnitType): Resources {
  const base = LAND_UNITS[unit].cost;
  const ts = state.territories[territoryId];
  const discount = ts ? Math.min(0.2, (ts.economyLevel - 1) * 0.08) : 0;
  const cost: Resources = zeroResources();
  for (const key of RESOURCE_KEYS) cost[key] = Math.round(base[key] * (1 - discount));
  return cost;
}

export function describeCountryProduction(state: GameState, countryId: CountryId): number {
  return state.production.filter((item) => item.country === countryId).length;
}

export function productionLabel(state: GameState, item: ProductionItem): string {
  return `${countryName(state, item.country)}: ${LAND_UNITS[item.unit].shortName}`;
}
