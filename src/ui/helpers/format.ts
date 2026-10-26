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

/** 45 200 -> "45 тыс.", 2 300 000 -> "2,30 млн". */
export function formatPopulation(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(2).replace('.', ',')} млн`;
  if (safe >= 10_000) return `${Math.round(safe / 1000)} тыс.`;
  if (safe >= 1000) return `${(safe / 1000).toFixed(1).replace('.', ',')} тыс.`;
  return formatInt(safe);
}

export function formatArmy(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  return formatInt(safe);
}
