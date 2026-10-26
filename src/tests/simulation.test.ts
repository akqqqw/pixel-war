import { describe, expect, it } from 'vitest';
import { TICK_MS } from '@/core/sim/balance';
import { countryPopulation, territoryShare } from '@/core/sim/effects';
import { GameClock, MAX_TICKS_PER_FRAME, runTick } from '@/core/sim/simulation';
import { createGame } from '@/core/state/createGame';
import { checkVictory } from '@/core/sim/victory';

function game(seed = 90210, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  return createGame({ seed, playerCountryId: 'aquilonia', difficulty });
}

describe('simulation loop', () => {
  it('advances one tick at a time and pays taxes', () => {
    const state = game();
    const country = state.countries[state.playerCountryId]!;
    country.army = 0;
    const money = country.money;
    const population = countryPopulation(state, country.id);
    runTick(state);
    expect(state.tick).toBe(1);
    expect(country.money).toBeGreaterThan(money);
    expect(countryPopulation(state, country.id)).toBeGreaterThan(population);
    expect(territoryShare(state, country.id)).toBeGreaterThan(0);
  });

  it('stops ticking after the game is over', () => {
    const state = game();
    state.status = 'victory';
    const tick = state.tick;
    runTick(state);
    expect(state.tick).toBe(tick);
  });

  it('converts real time into ticks and obeys the speed setting', () => {
    const state = game();
    const clock = new GameClock(state);

    state.speed = 0;
    expect(clock.advance(TICK_MS * 5)).toBe(0);
    expect(state.tick).toBe(0);

    state.speed = 1;
    clock.reset();
    expect(clock.advance(TICK_MS - 1)).toBe(0);
    expect(clock.advance(1)).toBe(1);
    expect(state.tick).toBe(1);

    state.speed = 2;
    clock.reset();
    expect(clock.advance(TICK_MS)).toBe(2);
  });

  it('never runs more than the frame budget of ticks', () => {
    const state = game();
    state.speed = 4;
    const clock = new GameClock(state);
    const ticks = clock.advance(60_000);
    expect(ticks).toBe(MAX_TICKS_PER_FRAME * 4);
  });

  it('lets the AI act on its own — no free money, but it builds and mobilises', () => {
    const state = game(1337, 'hard');
    const rival = Object.values(state.countries).find((country) => !country.isPlayer)!;
    const armyBefore = rival.army;
    for (let i = 0; i < 240; i += 1) runTick(state);
    expect(rival.alive).toBe(true);
    expect(rival.money).toBeGreaterThanOrEqual(0);
    expect(rival.army).not.toBe(armyBefore);
    const structures = Object.values(state.regions)
      .filter((region) => region.owner === rival.id)
      .reduce((sum, region) => sum + region.buildings.length, 0);
    expect(structures).toBeGreaterThan(0);
  });

  it('wins by domination and loses when every cell is gone', () => {
    const state = game(4242);
    const player = state.playerCountryId;
    const index = state.countryOrder.indexOf(player);
    for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
      if ((state.world.tileTerritory[cell] ?? -1) < 0) continue;
      state.cellOwner[cell] = index;
    }
    checkVictory(state);
    expect(state.status).toBe('victory');
    expect(state.speed).toBe(0);

    const lost = game(4242);
    const lostIndex = lost.countryOrder.indexOf(lost.playerCountryId);
    for (let cell = 0; cell < lost.cellOwner.length; cell += 1) {
      if (lost.cellOwner[cell] === lostIndex) lost.cellOwner[cell] = -1;
    }
    lost.status = 'playing';
    checkVictory(lost);
    expect(lost.status).toBe('defeat');
  });

  it('records the campaign graph and keeps it bounded', () => {
    const state = game(808);
    expect(state.history).toHaveLength(0);
    for (let i = 0; i < 60; i += 1) runTick(state);
    expect(state.history.length).toBeGreaterThan(1);
    const first = state.history[0]!;
    expect(first.share).toHaveLength(state.countryOrder.length);
    const total = first.share.reduce((sum, value) => sum + value, 0);
    expect(total).toBeGreaterThan(0.9);
    expect(total).toBeLessThanOrEqual(1.001);
    // Ticks grow monotonically and the buffer never exceeds the limit.
    for (let i = 1; i < state.history.length; i += 1) {
      expect(state.history[i]!.tick).toBeGreaterThan(state.history[i - 1]!.tick);
    }
    expect(state.history.length).toBeLessThanOrEqual(180);
  });

  it('keeps the whole world consistent over a long run', () => {
    const state = game(555);
    for (let i = 0; i < 300; i += 1) runTick(state);
    for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
      const owner = state.cellOwner[cell] ?? -1;
      if (owner < 0) continue;
      expect(state.countryOrder[owner]).toBeTruthy();
      expect(Number.isFinite(state.cellArmy[cell])).toBe(true);
      expect(state.cellArmy[cell]).toBeGreaterThanOrEqual(0);
    }
    for (const country of Object.values(state.countries)) {
      expect(country.money).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(country.population)).toBe(true);
    }
  });
});
