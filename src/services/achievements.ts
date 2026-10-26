import { territoryShare } from '@/core/sim/effects';
import type { GameState } from '@/core/state/types';
import type { AchievementId } from '@/services/platform';

export interface AchievementDef {
  id: AchievementId;
  name: string;
  description: string;
  /** Short mark shown in the list instead of an icon font glyph. */
  mark: string;
}

/** Eight goals — enough to guide a first campaign without a wall of text. */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_capture',
    name: 'Первая кровь',
    description: 'Захватите первую клетку.',
    mark: '1',
  },
  {
    id: 'region_taken',
    name: 'Наступление удалось',
    description: 'Захватите целый регион.',
    mark: '2',
  },
  {
    id: 'half_world',
    name: 'Полмира',
    description: 'Контролируйте 50 % земли.',
    mark: '3',
  },
  {
    id: 'rival_eliminated',
    name: 'Без соперника',
    description: 'Уничтожьте государство.',
    mark: '4',
  },
  {
    id: 'first_victory',
    name: 'Победитель',
    description: 'Выиграйте кампанию.',
    mark: '5',
  },
  {
    id: 'rocket_launched',
    name: 'Ракетчик',
    description: 'Запустите ракету.',
    mark: '6',
  },
  {
    id: 'heavy_mobilization',
    name: 'Всеобщая мобилизация',
    description: 'Держите армию от 5 000 солдат.',
    mark: '7',
  },
  {
    id: 'fortified',
    name: 'Крепость',
    description: 'Постройте 12 зданий за кампанию.',
    mark: '8',
  },
];

const STORAGE_KEY = 'pixel-war-achievements-v1';

export function loadUnlocked(): AchievementId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const known = new Set(ACHIEVEMENTS.map((entry) => entry.id));
    return parsed.filter((id): id is AchievementId => typeof id === 'string' && known.has(id as AchievementId));
  } catch {
    return [];
  }
}

export function saveUnlocked(ids: AchievementId[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Private mode: progress lives only in memory for this session.
  }
}

/**
 * Pure check of the player's progress. Returns the achievements that are met;
 * the caller decides which of them are new. Cheap enough to run every tick, but
 * the store only calls it a few times per second.
 */
export function metAchievements(state: GameState): AchievementId[] {
  const player = state.countries[state.playerCountryId];
  if (!player) return [];
  const met: AchievementId[] = [];
  if (player.stats.cellsTaken > 0) met.push('first_capture');
  if (player.stats.captured > 0) met.push('region_taken');
  if (territoryShare(state, player.id) >= 0.5) met.push('half_world');
  if (Object.values(state.countries).some((country) => country.id !== player.id && !country.alive)) {
    met.push('rival_eliminated');
  }
  if (state.status === 'victory') met.push('first_victory');
  if (player.stats.missiles > 0) met.push('rocket_launched');
  if (player.army >= 5000) met.push('heavy_mobilization');
  if (player.stats.built >= 12) met.push('fortified');
  return met;
}

/** Achievements in `met` that are not unlocked yet. */
export function newAchievements(met: AchievementId[], unlocked: AchievementId[]): AchievementId[] {
  const known = new Set(unlocked);
  return met.filter((id) => !known.has(id));
}

export function achievementById(id: AchievementId): AchievementDef | undefined {
  return ACHIEVEMENTS.find((entry) => entry.id === id);
}
