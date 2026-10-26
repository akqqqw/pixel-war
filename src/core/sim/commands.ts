import { clamp, type Rng } from '@/core/rng';
import type { CountryId, Resources, TerritoryId } from '@/core/types';
import { RESOURCE_KEYS, canAfford, payResources } from '@/core/types';
import type { GameState, UnitGroup } from '@/core/state/types';
import { armyCount, makeArmy, subtractArmy, type Army } from '@/core/units/army';
import { LAND_UNITS, type LandUnitType } from '@/core/units/unitTypes';
import { economyUpgradeCost, MAX_ECONOMY_LEVEL } from '@/core/economy/economy';
import { declareWarInternal, makePeaceInternal, territoryStatic } from '@/core/sim/combat';
import { countryName, pushEvent } from '@/core/sim/events';
import { findOrderPath, travelMilliseconds } from '@/core/sim/path';
import { MAX_QUEUE_PER_TERRITORY, unitCostWithEconomy } from '@/core/sim/production';

export interface CommandResult {
  ok: boolean;
  error?: string;
}

const OK: CommandResult = { ok: true };

function fail(error: string): CommandResult {
  return { ok: false, error };
}

export function canPay(bank: Resources, cost: Partial<Resources>): boolean {
  return canAfford(bank, cost);
}

export function subtractCost(bank: Resources, cost: Partial<Resources>): void {
  for (const key of RESOURCE_KEYS) bank[key] = Math.max(0, bank[key] - (cost[key] ?? 0));
}

/** Moves units from a garrison into a new marching group. */
export function commandSendArmy(
  state: GameState,
  params: { countryId: CountryId; from: TerritoryId; to: TerritoryId; army: Army },
): CommandResult {
  const country = state.countries[params.countryId];
  const from = state.territories[params.from];
  const to = state.territories[params.to];
  if (!country || !from || !to) return fail('Неизвестная территория.');
  if (from.owner !== params.countryId) return fail('Эта территория вам не принадлежит.');
  if (params.from === params.to) return fail('Войска уже находятся здесь.');

  const army = makeArmy(params.army);
  if (armyCount(army) === 0) return fail('Не выбрано ни одного подразделения.');
  for (const [type, count] of Object.entries(army) as [LandUnitType, number][]) {
    if ((from.garrison[type] ?? 0) < count) {
      return fail(`В гарнизоне недостаточно: ${LAND_UNITS[type].shortName}.`);
    }
  }

  const path = findOrderPath(state, params.countryId, params.from, params.to);
  if (!path || path.length < 2) {
    return fail('Нет пути по своей территории к этой цели. Сначала захватите соседний регион.');
  }

  subtractArmy(from.garrison, army);

  const group: UnitGroup = {
    id: `g${state.nextIds.group++}`,
    country: params.countryId,
    territoryId: params.from,
    army,
    order: {
      kind: to.owner === params.countryId ? 'move' : 'attack',
      targetTerritoryId: params.to,
    },
    movement: {
      path,
      step: 1,
      progress: 0,
      milliseconds: travelMilliseconds(state.world, path[0] as TerritoryId, path[1] as TerritoryId, army, country),
      originTerritoryId: params.from,
    },
    intent: to.owner === params.countryId ? 'move' : 'attack',
    arrivedAtTick: state.tick,
  };
  state.groups[group.id] = group;

  if (country.isPlayer) {
    const targetStat = territoryStatic(state, params.to);
    pushEvent(
      state,
      'system',
      `Приказ принят: ${armyCount(army)} ед. техники выдвигаются в «${targetStat?.name ?? '—'}».`,
      params.countryId,
    );
  }

  return OK;
}

export function commandQueueUnit(
  state: GameState,
  params: { countryId: CountryId; territoryId: TerritoryId; unit: LandUnitType },
): CommandResult {
  const country = state.countries[params.countryId];
  const ts = state.territories[params.territoryId];
  if (!country || !ts) return fail('Неизвестная территория.');
  if (ts.owner !== params.countryId) return fail('Производство доступно только на своей территории.');
  if (state.production.filter((i) => i.territoryId === params.territoryId).length >= MAX_QUEUE_PER_TERRITORY) {
    return fail('Очередь производства переполнена (максимум 3).');
  }
  const cost = unitCostWithEconomy(state, params.territoryId, params.unit);
  if (!canAfford(country.resources, cost)) return fail('Не хватает ресурсов для производства.');
  payResources(country.resources, cost);
  state.production.push({
    id: `p${state.nextIds.production++}`,
    country: params.countryId,
    territoryId: params.territoryId,
    unit: params.unit,
    ticksLeft: LAND_UNITS[params.unit].buildTime,
    totalTicks: LAND_UNITS[params.unit].buildTime,
  });
  return OK;
}

export function commandCancelProduction(
  state: GameState,
  params: { countryId: CountryId; itemId: string },
): CommandResult {
  const item = state.production.find((i) => i.id === params.itemId);
  if (!item || item.country !== params.countryId) return fail('Заказ не найден.');
  const country = state.countries[params.countryId];
  if (!country) return fail('Государство не найдено.');
  const base = LAND_UNITS[item.unit].cost;
  for (const key of RESOURCE_KEYS) country.resources[key] += Math.floor(base[key] * 0.6);
  state.production = state.production.filter((i) => i.id !== params.itemId);
  return OK;
}

export function commandUpgradeEconomy(
  state: GameState,
  params: { countryId: CountryId; territoryId: TerritoryId },
): CommandResult {
  const country = state.countries[params.countryId];
  const ts = state.territories[params.territoryId];
  if (!country || !ts) return fail('Неизвестная территория.');
  if (ts.owner !== params.countryId) return fail('Это не ваша территория.');
  if (ts.economyLevel >= MAX_ECONOMY_LEVEL) return fail('Инфраструктура уже максимального уровня.');
  const cost = economyUpgradeCost(ts.economyLevel);
  if (!canAfford(country.resources, cost)) return fail('Не хватает средств на развитие инфраструктуры.');
  payResources(country.resources, cost);
  ts.economyLevel = clamp(ts.economyLevel + 1, 1, MAX_ECONOMY_LEVEL);
  ts.population = Math.round(ts.population * 1.12);
  if (country.isPlayer) {
    const stat = territoryStatic(state, params.territoryId);
    pushEvent(
      state,
      'economy',
      `Инфраструктура «${stat?.name ?? ''}» улучшена до уровня ${ts.economyLevel}.`,
      country.id,
    );
  }
  return OK;
}

export function commandDeclareWar(
  state: GameState,
  params: { countryId: CountryId; target: CountryId },
): CommandResult {
  const country = state.countries[params.countryId];
  const target = state.countries[params.target];
  if (!country || !target || country.id === target.id) return fail('Неверная цель.');
  if (!target.alive) return fail('Этого государства больше не существует.');
  if (country.warWith.includes(target.id)) return fail('Вы уже в состоянии войны.');
  declareWarInternal(state, country.id, target.id);
  return OK;
}

export function peaceWouldBeAccepted(
  state: GameState,
  aiCountryId: CountryId,
  otherId: CountryId,
  rng: Rng,
): boolean {
  const ai = state.countries[aiCountryId];
  const other = state.countries[otherId];
  if (!ai || !other) return false;
  const aiCount = Object.values(state.territories).filter((t) => t.owner === aiCountryId).length;
  const otherCount = Object.values(state.territories).filter((t) => t.owner === otherId).length;
  const losing = aiCount <= otherCount;
  const warWeariness = 0.25 + (losing ? 0.4 : 0) + clamp(ai.relations[otherId] ?? 0, -100, 100) / 400;
  return rng.chance(clamp(warWeariness, 0.08, 0.95));
}

export function commandProposePeace(
  state: GameState,
  params: { countryId: CountryId; target: CountryId },
  rng: Rng,
): CommandResult {
  const country = state.countries[params.countryId];
  const target = state.countries[params.target];
  if (!country || !target) return fail('Неверная цель.');
  if (!country.warWith.includes(target.id)) return fail('Вы не воюете с этой державой.');
  if (!peaceWouldBeAccepted(state, target.id, country.id, rng)) {
    pushEvent(
      state,
      'diplomacy',
      `${countryName(state, target.id)} отклоняет мирное предложение.`,
      params.countryId,
    );
    return fail('Противник отклоняет мирное предложение.');
  }
  makePeaceInternal(state, country.id, target.id);
  return OK;
}
