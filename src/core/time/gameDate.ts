/** One game tick is one hour of world time; the campaign starts in spring 2026. */
export const START_YEAR = 2026;
export const START_MONTH = 2; // March (0-based)
export const START_DAY = 1;
export const START_HOUR = 8;

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export interface GameDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
}

export function gameDateParts(tick: number): GameDateParts {
  const totalHours = tick + START_HOUR;
  const dayOffset = Math.floor(totalHours / 24);
  const hour = ((totalHours % 24) + 24) % 24;
  const date = new Date(Date.UTC(START_YEAR, START_MONTH, START_DAY + dayOffset, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour,
  };
}

export function formatGameDate(tick: number): string {
  const parts = gameDateParts(tick);
  return `${pad(parts.day)} ${MONTHS[parts.month]} ${parts.year}, ${pad(parts.hour)}:00`;
}

export function formatGameDateShort(tick: number): string {
  const parts = gameDateParts(tick);
  return `${pad(parts.day)}.${pad(parts.month + 1)}.${parts.year}`;
}

export function formatGameClock(tick: number): string {
  const parts = gameDateParts(tick);
  return `${pad(parts.hour)}:00`;
}

export function formatTicksAsDuration(ticks: number): string {
  const rounded = Math.max(0, Math.ceil(ticks));
  if (rounded < 24) return `${rounded} ч`;
  const days = Math.floor(rounded / 24);
  const hours = rounded % 24;
  return hours === 0 ? `${days} дн.` : `${days} дн. ${hours} ч`;
}

export function formatMonthShort(month: number): string {
  return MONTHS_SHORT[((month % 12) + 12) % 12] as string;
}
