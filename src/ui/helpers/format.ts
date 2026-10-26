import type { Resources } from '@/core/types';

const numberFormatter = new Intl.NumberFormat('ru-RU');

export function formatInt(value: number): string {
  return numberFormatter.format(Math.round(value));
}

export function formatResource(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toFixed(Math.abs(value) < 10 ? 1 : 0);
}

export function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}`;
}

export function formatPopulation(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} млн`;
  return `${Math.round(value / 1000)} тыс`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function resourceDelta(resources: Resources): string {
  return `${formatDelta(resources.money)} ₽`;
}

export function clampText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
