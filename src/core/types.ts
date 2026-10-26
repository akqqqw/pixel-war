/** Generic resource bundle used across the whole game. All values are game units. */
export interface Resources {
  money: number;
  metal: number;
  oil: number;
  energy: number;
}

export type ResourceKey = keyof Resources;

export const RESOURCE_KEYS: readonly ResourceKey[] = ['money', 'metal', 'oil', 'energy'];

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  money: 'Деньги',
  metal: 'Металл',
  oil: 'Нефть',
  energy: 'Энергия',
};

export const RESOURCE_SHORT: Record<ResourceKey, string> = {
  money: '₽',
  metal: 'MT',
  oil: 'OIL',
  energy: 'kW',
};

export type CountryId = string;
export type TerritoryId = string;

export function zeroResources(): Resources {
  return { money: 0, metal: 0, oil: 0, energy: 0 };
}

export function cloneResources(r: Resources): Resources {
  return { money: r.money, metal: r.metal, oil: r.oil, energy: r.energy };
}

export function addResources(target: Resources, delta: Partial<Resources>): void {
  if (delta.money) target.money += delta.money;
  if (delta.metal) target.metal += delta.metal;
  if (delta.oil) target.oil += delta.oil;
  if (delta.energy) target.energy += delta.energy;
}

export function sumResources(list: readonly Resources[]): Resources {
  const out = zeroResources();
  for (const r of list) addResources(out, r);
  return out;
}

export function canAfford(have: Resources, cost: Partial<Resources>): boolean {
  return RESOURCE_KEYS.every((key) => (have[key] ?? 0) + 1e-9 >= (cost[key] ?? 0));
}

export function payResources(bank: Resources, cost: Partial<Resources>): boolean {
  if (!canAfford(bank, cost)) return false;
  for (const key of RESOURCE_KEYS) bank[key] = Math.max(0, bank[key] - (cost[key] ?? 0));
  return true;
}

/** Keeps every resource inside sane, non-negative bounds. */
export function sanitizeResources(r: Resources): void {
  for (const key of RESOURCE_KEYS) {
    const value = r[key];
    r[key] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
}
