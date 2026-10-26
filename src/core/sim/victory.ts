import { pushEvent } from '@/core/sim/events';
import type { GameState } from '@/core/state/types';

/** Domination = every territory, military = all rivals eliminated. */
export function checkVictory(state: GameState): void {
  if (state.status !== 'playing') return;
  const player = state.countries[state.playerCountryId];
  if (!player) return;

  const owned = Object.values(state.territories).filter((territory) => territory.owner === player.id).length;
  const total = state.world.territories.length;

  if (owned === 0 || !player.alive) {
    state.status = 'defeat';
    state.speed = 0;
    state.victory = {
      kind: 'military',
      countryId: player.id,
      title: 'Поражение',
      description: 'Вы потеряли все территории. Кампания окончена.',
    };
    pushEvent(state, 'defeat', 'Все территории потеряны.', player.id);
    return;
  }

  const rivals = Object.values(state.countries).filter((country) => country.id !== player.id && country.alive);
  if (rivals.length === 0 || owned === total) {
    const domination = owned === total;
    state.status = 'victory';
    state.speed = 0;
    state.victory = {
      kind: domination ? 'domination' : 'military',
      countryId: player.id,
      title: domination ? 'Мировое господство' : 'Военная победа',
      description: domination
        ? 'Каждая территория мира под вашим контролем.'
        : 'Все вражеские государства уничтожены.',
    };
    pushEvent(state, 'victory', state.victory.title, player.id);
  }
}
