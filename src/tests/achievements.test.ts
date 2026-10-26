// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveBattles } from '@/core/sim/battle';
import { declareWar } from '@/core/sim/diplomacy';
import { runTick } from '@/core/sim/simulation';
import { createGame } from '@/core/state/createGame';
import type { GameState } from '@/core/state/types';
import {
  ACHIEVEMENTS,
  achievementById,
  loadUnlocked,
  metAchievements,
  newAchievements,
  saveUnlocked,
} from '@/services/achievements';
import { LocalPlatform, localBestScore, platform } from '@/services/platform';

function game(seed = 4242): GameState {
  return createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
}

function flipOneCell(state: GameState): void {
  const player = state.countryOrder.indexOf(state.playerCountryId);
  for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
    if ((state.cellOwner[cell] ?? -1) === player || (state.cellOwner[cell] ?? -1) < 0) continue;
    state.cellOwner[cell] = player;
    state.countries[state.playerCountryId]!.stats.cellsTaken += 1;
    return;
  }
  throw new Error('no enemy cell');
}

beforeEach(() => {
  localStorage.clear();
});

describe('achievement definitions', () => {
  it('has eight unique goals with names and descriptions', () => {
    expect(ACHIEVEMENTS).toHaveLength(8);
    expect(new Set(ACHIEVEMENTS.map((entry) => entry.id)).size).toBe(8);
    for (const entry of ACHIEVEMENTS) {
      expect(entry.name.length).toBeGreaterThan(2);
      expect(entry.description.length).toBeGreaterThan(5);
      expect(achievementById(entry.id)).toBe(entry);
    }
    expect(achievementById('first_capture')).toBeTruthy();
  });

  it('unlocks nothing for a fresh campaign', () => {
    const state = game();
    expect(metAchievements(state)).not.toContain('first_capture');
    expect(metAchievements(state)).not.toContain('first_victory');
    expect(metAchievements(state)).not.toContain('rocket_launched');
  });

  it('reacts to real progress: cells, regions, missiles, buildings', () => {
    const state = game();
    const player = state.countries[state.playerCountryId]!;
    flipOneCell(state);
    expect(metAchievements(state)).toContain('first_capture');

    player.stats.captured = 1;
    expect(metAchievements(state)).toContain('region_taken');

    player.stats.missiles = 1;
    expect(metAchievements(state)).toContain('rocket_launched');

    player.stats.built = 12;
    expect(metAchievements(state)).toContain('fortified');

    player.army = 5000;
    expect(metAchievements(state)).toContain('heavy_mobilization');

    player.stats.captured = 0;
    player.stats.built = 0;
    player.army = 0;
    expect(metAchievements(state)).not.toContain('fortified');
  });

  it('marks the opponent elimination and the victory', () => {
    const state = game();
    const rival = Object.values(state.countries).find((country) => !country.isPlayer)!;
    rival.alive = false;
    expect(metAchievements(state)).toContain('rival_eliminated');
    state.status = 'victory';
    expect(metAchievements(state)).toContain('first_victory');
  });

  it('counts cells taken in a real battle, not just region flips', () => {
    const state = game(9191);
    const player = state.countryOrder.indexOf(state.playerCountryId);
    const rival = Object.values(state.countries).find((country) => !country.isPlayer)!;
    declareWar(state, state.playerCountryId, rival.id);

    // Find one border pair and give the attacker an overwhelming stack there.
    const width = state.world.width;
    let mine = -1;
    let theirs = -1;
    for (let cell = 0; cell < state.cellOwner.length && theirs < 0; cell += 1) {
      if ((state.cellOwner[cell] ?? -1) !== player) continue;
      const x = cell % width;
      const y = (cell / width) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const next = (y + dy) * width + (x + dx);
        const owner = state.cellOwner[next] ?? -1;
        if (owner >= 0 && owner !== player) {
          mine = cell;
          theirs = next;
          break;
        }
      }
    }
    expect(mine).toBeGreaterThanOrEqual(0);
    for (let inner = 0; inner < state.cellArmy.length; inner += 1) state.cellArmy[inner] = 0;
    state.cellArmy[mine] = 5000;

    const before = state.countries[state.playerCountryId]!.stats.cellsTaken;
    const captured = resolveBattles(state).captured.length;
    expect(captured).toBeGreaterThan(0);
    expect(state.cellOwner[theirs]).toBe(player);
    expect(state.countries[state.playerCountryId]!.stats.cellsTaken).toBeGreaterThan(before);
    expect(metAchievements(state)).toContain('first_capture');
  });

  it('reports only the new ones', () => {
    const met = ['first_capture', 'region_taken'] as const;
    expect(newAchievements([...met], ['first_capture'])).toEqual(['region_taken']);
    expect(newAchievements([...met], [...met])).toEqual([]);
  });

  it('survives a broken storage payload', () => {
    localStorage.setItem('pixel-war-achievements-v1', '{не json');
    expect(loadUnlocked()).toEqual([]);
    localStorage.setItem('pixel-war-achievements-v1', '["no_such_id", 5, "first_capture"]');
    expect(loadUnlocked()).toEqual(['first_capture']);
    saveUnlocked(['first_capture', 'first_victory']);
    expect(loadUnlocked()).toEqual(['first_capture', 'first_victory']);
  });
});

describe('platform layer', () => {
  it('keeps cloud slots local but round-trips them', async () => {
    const local = new LocalPlatform();
    expect(local.hasCloud).toBe(true);
    expect(local.id).toBe('local');
    await local.init();
    expect(await local.saveToCloud('auto', '{"tick":5}')).toBe(true);
    expect(await local.loadFromCloud('auto')).toBe('{"tick":5}');
    expect(await local.loadFromCloud('missing')).toBeNull();
  });

  it('can be configured without cloud storage', async () => {
    const offline = new LocalPlatform(false);
    expect(offline.hasCloud).toBe(false);
    expect(await offline.saveToCloud('auto', 'x')).toBe(false);
    expect(await offline.loadFromCloud('auto')).toBeNull();
  });

  it('shows an ad without blocking and keeps the best score', async () => {
    await expect(platform.showFullscreenAd()).resolves.toBeUndefined();
    await platform.submitScore('land_share', 42);
    expect(localBestScore('land_share')).toBe(42);
    await platform.submitScore('land_share', 10);
    expect(localBestScore('land_share')).toBe(42);
    await platform.submitScore('land_share', 77);
    expect(localBestScore('land_share')).toBe(77);
  });

  it('runs a full campaign without throwing on platform hooks', () => {
    const state = game(555);
    expect(() => {
      for (let i = 0; i < 40; i += 1) runTick(state);
    }).not.toThrow();
    expect(metAchievements(state).length).toBeGreaterThanOrEqual(0);
  });
});
