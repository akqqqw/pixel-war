import { pushEvent } from '@/core/sim/events';
import { fail, OK, type ActionResult } from '@/core/sim/result';
import type { GameState } from '@/core/state/types';
import type { CountryId } from '@/core/types';

/** War and peace are symmetric: both sides always share the same state. */
export function declareWar(state: GameState, a: CountryId, b: CountryId): ActionResult {
  if (a === b) return fail('Нельзя объявить войну себе.');
  const first = state.countries[a];
  const second = state.countries[b];
  if (!first || !second) return fail('Государство не найдено.');
  if (!first.alive || !second.alive) return fail('Государство уже уничтожено.');
  if (first.warWith.includes(b)) return OK;
  first.warWith.push(b);
  if (!second.warWith.includes(a)) second.warWith.push(a);
  pushEvent(state, 'war', `${first.shortName} объявила войну ${second.shortName}.`, a);
  return OK;
}

export function makePeace(state: GameState, a: CountryId, b: CountryId): ActionResult {
  const first = state.countries[a];
  const second = state.countries[b];
  if (!first || !second) return fail('Государство не найдено.');
  if (!first.warWith.includes(b)) return fail('Вы и так не в состоянии войны.');
  first.warWith = first.warWith.filter((id) => id !== b);
  second.warWith = second.warWith.filter((id) => id !== a);
  for (const order of state.orders) {
    if (order.countryId !== a || !order.active) continue;
    const target = state.cellOwner[order.targetCell] ?? -1;
    if (target >= 0 && state.countryOrder[target] === b) order.active = false;
  }
  pushEvent(state, 'peace', `${first.shortName} и ${second.shortName} заключили мир.`, a);
  return OK;
}
