/** 12345 -> "12 345" */
export function formatInt(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Money with one decimal only when it matters. */
export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (Math.abs(safe) >= 1000) return formatInt(safe);
  return (Math.round(safe * 10) / 10).toString();
}

export function formatSigned(value: number, digits = 1): string {
  const safe = Number.isFinite(value) ? value : 0;
  const rounded = Math.round(safe * 10 ** digits) / 10 ** digits;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** Population is stored in thousands: 240 -> "240 тыс." */
export function formatPopulation(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  if (safe >= 1000) return `${(safe / 1000).toFixed(2).replace('.', ',')} млн`;
  return `${formatInt(safe)} тыс.`;
}

export function formatArmy(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  return formatInt(safe);
}
