import { territoryShare } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import type { GameState } from '@/core/state/types';

/** Domination = the whole land map, military = every rival eliminated. */
export function checkVictory(state: GameState): void {
  if (state.status !== 'playing') return;
  const player = state.countries[state.playerCountryId];
  if (!player) return;

  const share = territoryShare(state, player.id);
  if (share <= 0 || !player.alive) {
    state.status = 'defeat';
    state.speed = 0;
    state.victory = {
      kind: 'defeat',
      countryId: player.id,
      title: 'Поражение',
      description: 'Вы потеряли все клетки. Кампания окончена.',
    };
    pushEvent(state, 'defeat', 'Все территории потеряны.', player.id);
    return;
  }

  const rivals = Object.values(state.countries).filter(
    (country) => country.id !== player.id && country.alive,
  );
  if (rivals.length === 0 || share >= 0.999) {
    const domination = share >= 0.999;
    state.status = 'victory';
    state.speed = 0;
    state.victory = {
      kind: domination ? 'domination' : 'military',
      countryId: player.id,
      title: domination ? 'Мировое господство' : 'Военная победа',
      description: domination
        ? 'Каждая клетка мира под вашим контролем.'
        : 'Все вражеские государства уничтожены.',
    };
    pushEvent(state, 'victory', state.victory.title, player.id);
  }
}
