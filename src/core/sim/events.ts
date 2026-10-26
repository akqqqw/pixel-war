import type { CountryId, TerritoryId } from '@/core/types';
import type { GameEvent, GameEventKind, GameState } from '@/core/state/types';

export function pushEvent(
  state: GameState,
  kind: GameEventKind,
  message: string,
  countryId?: CountryId,
  extra?: { territoryId?: TerritoryId; previousOwnerId?: CountryId },
): GameEvent {
  const event: GameEvent = {
    id: `e${state.nextIds.event++}`,
    tick: state.tick,
    kind,
    message,
    ...(countryId ? { countryId } : {}),
    ...(extra?.territoryId ? { territoryId: extra.territoryId } : {}),
    ...(extra?.previousOwnerId ? { previousOwnerId: extra.previousOwnerId } : {}),
  };
  state.events.push(event);
  if (state.events.length > 120) state.events.splice(0, state.events.length - 120);
  return event;
}

export function countryName(state: GameState, id: CountryId): string {
  return state.countries[id]?.name ?? 'Неизвестная держава';
}

export function territoryName(state: GameState, id: TerritoryId): string {
  return state.world.territories.find((t) => t.id === id)?.name ?? 'Неизвестная территория';
}
