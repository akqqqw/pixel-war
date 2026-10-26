import type { GameEvent, GameState } from '@/core/state/types';

/** Adds a message to the world log shown in the HUD. */
export function pushEvent(
  state: GameState,
  kind: GameEvent['kind'],
  text: string,
  countryId?: string,
  cell?: number,
): void {
  const event: GameEvent = {
    id: `e${state.nextIds.event}`,
    tick: state.tick,
    kind,
    text,
  };
  state.nextIds.event += 1;
  if (countryId) event.countryId = countryId;
  if (cell !== undefined) event.cell = cell;
  state.events.push(event);
  if (state.events.length > 120) state.events.splice(0, state.events.length - 120);
}
