import { sanitizeGame } from '@/core/state/createGame';
import { SAVE_VERSION, type GameState } from '@/core/state/types';

export interface SerializedGame extends Omit<GameState, 'tileOwner'> {
  tileOwner: number[];
}

export function serializeGame(state: GameState): string {
  const copy: SerializedGame = {
    ...state,
    tileOwner: Array.from(state.tileOwner),
    events: state.events.slice(-60),
  };
  return JSON.stringify(copy);
}

export function deserializeGame(raw: string): GameState {
  const parsed = JSON.parse(raw) as SerializedGame;
  if (!parsed || typeof parsed !== 'object') throw new Error('Повреждённое сохранение');
  if (parsed.version !== SAVE_VERSION) {
    throw new Error(`Несовместимая версия сохранения (${parsed.version}). Начните новую кампанию.`);
  }
  if (!Array.isArray(parsed.tileOwner)) throw new Error('В сохранении нет карты');
  const state: GameState = {
    ...parsed,
    tileOwner: Int16Array.from(parsed.tileOwner),
  };
  if (!state.countryOrder || state.countryOrder.length === 0) {
    throw new Error('В сохранении нет государств');
  }
  sanitizeGame(state);
  return state;
}
