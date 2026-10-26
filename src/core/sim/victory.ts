import type { GameState, VictoryInfo } from '@/core/state/types';
import { pushEvent } from '@/core/sim/events';

export function territoryCount(state: GameState, countryId: string): number {
  let count = 0;
  for (const ts of Object.values(state.territories)) {
    if (ts.owner === countryId) count += 1;
  }
  return count;
}

export function checkVictory(state: GameState): void {
  if (state.status !== 'playing') return;
  const player = state.countries[state.playerCountryId];
  if (!player) return;

  const playerTerritories = territoryCount(state, player.id);
  const totalTerritories = state.world.territories.length;

  if (!player.alive || playerTerritories === 0) {
    state.status = 'defeat';
    state.victory = {
      kind: 'none',
      countryId: player.id,
      title: 'Государство пало',
      description: 'Вы потеряли все территории. Мир принадлежит другим.',
    };
    pushEvent(state, 'victory', 'Поражение: ваше государство потеряло все территории.', player.id);
    return;
  }

  if (playerTerritories >= totalTerritories) {
    state.status = 'victory';
    state.victory = {
      kind: 'domination',
      countryId: player.id,
      title: 'Мировое господство',
      description: `Все ${totalTerritories} территорий мира под вашим контролем.`,
    };
    pushEvent(state, 'victory', 'Победа! Мировое господство достигнуто.', player.id);
    return;
  }

  const livingOthers = Object.values(state.countries).filter((c) => c.id !== player.id && c.alive);
  if (livingOthers.length === 0) {
    state.status = 'victory';
    state.victory = {
      kind: 'military',
      countryId: player.id,
      title: 'Военная победа',
      description: 'Все вражеские государства уничтожены.',
    };
    pushEvent(state, 'victory', 'Победа! Все вражеские государства уничтожены.', player.id);
  }
}

export function victoryProgress(state: GameState): { owned: number; total: number; percent: number } {
  const owned = territoryCount(state, state.playerCountryId);
  const total = state.world.territories.length;
  return { owned, total, percent: total > 0 ? Math.round((owned / total) * 100) : 0 };
}

export function victoryHint(state: GameState): string {
  return `Под вашим контролем ${territoryCount(state, state.playerCountryId)} из ${state.world.territories.length} территорий. Захватите остальные, чтобы победить.`;
}

export function isVictory(info: VictoryInfo | null): boolean {
  return !!info && info.kind !== 'none';
}
