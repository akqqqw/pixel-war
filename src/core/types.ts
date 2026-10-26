export type CountryId = string;
export type TerritoryId = string;

/** Integer-safe helper used by the economy and the frontline. */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Money is the only stock resource; population and army live on territories. */
export function roundMoney(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value * 10) / 10) : 0;
}
