import { describe, expect, it } from 'vitest';
import { createGame } from '@/core/state/createGame';
import { GameClock, runTick } from '@/core/sim/simulation';
import { RESOURCE_KEYS } from '@/core/types';
import { armyCount } from '@/core/units/army';
import { checkVictory } from '@/core/sim/victory';

function invariants(game: ReturnType<typeof createGame>): void {
  const territoryIds = new Set(game.world.territories.map((territory) => territory.id));
  for (const territory of game.world.territories) {
    const state = game.territories[territory.id];
    expect(state, territory.id).toBeDefined();
    expect(state!.owner).toBeTruthy();
    expect(game.countries[state!.owner], `${territory.id} owner`).toBeDefined();
    expect(Number.isFinite(state!.population)).toBe(true);
    expect(state!.population).toBeGreaterThan(0);
  }
  for (const [groupId, group] of Object.entries(game.groups)) {
    expect(territoryIds.has(group.territoryId), groupId).toBe(true);
    expect(armyCount(group.army)).toBeGreaterThan(0);
    if (group.movement) {
      for (const step of group.movement.path) expect(territoryIds.has(step)).toBe(true);
    }
  }
  for (const country of Object.values(game.countries)) {
    for (const key of RESOURCE_KEYS) {
      expect(country.resources[key]).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(country.resources[key])).toBe(true);
    }
  }
  for (const item of game.production) {
    expect(territoryIds.has(item.territoryId)).toBe(true);
    expect(item.ticksLeft).toBeGreaterThanOrEqual(0);
  }
}

describe('simulation loop', () => {
  it('runs hundreds of ticks without breaking invariants', () => {
    const game = createGame({ seed: 2024, playerCountryId: 'draconia', difficulty: 'normal' });
    for (let i = 0; i < 400; i += 1) {
      runTick(game, 1000);
      if (game.status !== 'playing') break;
    }
    invariants(game);
    expect(game.tick).toBeGreaterThan(0);
    expect(game.events.length).toBeGreaterThan(0);
  }, 30000);

  it('AI builds armies and fights using the same rules', () => {
    const game = createGame({ seed: 31337, playerCountryId: 'veldania', difficulty: 'hard' });
    for (let i = 0; i < 500; i += 1) {
      runTick(game, 1000);
      if (game.status !== 'playing') break;
    }
    invariants(game);
    const aiCountries = Object.values(game.countries).filter((country) => !country.isPlayer);
    const producedTotal = aiCountries.reduce((sum, country) => sum + country.stats.produced, 0);
    expect(producedTotal).toBeGreaterThan(0);
    const captures = aiCountries.reduce((sum, country) => sum + country.stats.captured, 0);
    expect(captures).toBeGreaterThan(0);
    expect(game.battles.length).toBeGreaterThan(0);
  }, 30000);

  it('game clock honours speed and pause', () => {
    const game = createGame({ seed: 12, playerCountryId: 'aquilonia', difficulty: 'easy' });
    const clock = new GameClock(game);
    game.speed = 1;
    expect(clock.advance(2500)).toBe(2);
    game.speed = 0;
    expect(clock.advance(5000)).toBe(0);
    game.speed = 4;
    expect(clock.advance(1000)).toBe(4);
  });

  it('detects defeat when the player owns nothing', () => {
    const game = createGame({ seed: 5, playerCountryId: 'aquilonia', difficulty: 'easy' });
    const playerId = game.playerCountryId;
    for (const territory of game.world.territories) {
      const state = game.territories[territory.id]!;
      if (state.owner === playerId) {
        const other = Object.values(game.countries).find((country) => country.id !== playerId)!;
        state.owner = other.id;
      }
    }
    game.countries[playerId]!.alive = false;
    checkVictory(game);
    expect(game.status).toBe('defeat');
    expect(game.victory?.kind).toBe('none');
  });

  it('detects world domination', () => {
    const game = createGame({ seed: 6, playerCountryId: 'aquilonia', difficulty: 'easy' });
    const playerId = game.playerCountryId;
    for (const territory of game.world.territories) {
      game.territories[territory.id]!.owner = playerId;
    }
    for (const country of Object.values(game.countries)) {
      if (country.id !== playerId) country.alive = false;
    }
    checkVictory(game);
    expect(game.status).toBe('victory');
    expect(game.victory?.kind).toBe('domination');
  });
});
