import { describe, expect, it } from 'vitest';
import { BALANCE, TICK_MS } from '@/core/sim/balance';
import { countryTotals } from '@/core/sim/economy';
import { GameClock, MAX_TICKS_PER_FRAME, runTick } from '@/core/sim/simulation';
import { createGame } from '@/core/state/createGame';
import { checkVictory } from '@/core/sim/victory';
import { territoryEffects } from '@/core/sim/effects';

function game(seed = 90210, difficulty: 'easy' | 'normal' | 'hard' = 'normal') {
  return createGame({ seed, playerCountryId: 'aquilonia', difficulty });
}

describe('simulation loop', () => {
  it('advances one hour per tick', () => {
    const state = game();
    const before = state.countries[state.playerCountryId]!.money;
    runTick(state);
    expect(state.tick).toBe(1);
    expect(state.countries[state.playerCountryId]!.money).toBeGreaterThan(before);
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
    expect(clock.advance(TICK_MS)).toBe(1);
    expect(state.tick).toBe(1);
    expect(clock.advance(TICK_MS / 2)).toBe(0);
    expect(clock.advance(TICK_MS / 2)).toBe(1);

    state.speed = 4;
    expect(clock.advance(TICK_MS)).toBe(4);
    expect(state.tick).toBe(6);

    // A tab switch must not fast-forward the whole campaign.
    const jumped = clock.advance(10 * 60 * 1000);
    expect(jumped).toBeLessThanOrEqual(MAX_TICKS_PER_FRAME * 4);
  });

  it('never breaks the invariants while running unattended', () => {
    const state = game(4711, 'easy');
    for (let i = 0; i < 300; i += 1) runTick(state);
    for (const territory of Object.values(state.territories)) {
      expect(territory.population).toBeGreaterThan(0);
      expect(territory.army).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(territory.army)).toBe(true);
      const effects = territoryEffects(territory);
      expect(effects.populationCap).toBeGreaterThanOrEqual(BALANCE.basePopulationCap);
      for (const building of territory.buildings) {
        expect(building.tile).toBeGreaterThanOrEqual(0);
        expect(building.tile).toBeLessThan(state.world.width * state.world.height);
      }
    }
    for (const country of Object.values(state.countries)) {
      expect(country.money).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(country.income)).toBe(true);
      for (const enemyId of country.warWith) expect(state.countries[enemyId]).toBeTruthy();
    }
    expect(state.tick).toBe(300);
    expect(state.status).toBe('playing');
  });

  it('lets the AI fight for real on hard', () => {
    const state = game(4711, 'hard');
    const playerId = state.playerCountryId;
    const start = Object.values(state.territories).filter((t) => t.owner === playerId).length;
    for (let i = 0; i < 400; i += 1) {
      runTick(state);
      if (state.status !== 'playing') break;
    }
    const now = Object.values(state.territories).filter((t) => t.owner === playerId).length;
    expect(now).toBeLessThan(start);
    expect(state.events.some((event) => event.kind === 'war')).toBe(true);
  });

  it('never lets the AI spend money it does not own', () => {
    const state = game(4242, 'hard');
    for (let i = 0; i < 200; i += 1) {
      runTick(state);
      for (const country of Object.values(state.countries)) {
        expect(country.money).toBeGreaterThanOrEqual(0);
        const totals = countryTotals(state, country.id);
        if (country.isPlayer) continue;
        for (const territory of Object.values(state.territories)) {
          if (territory.owner !== country.id) continue;
          expect(territory.army).toBeLessThanOrEqual(totals.army + 1e-6);
        }
      }
      if (state.status !== 'playing') break;
    }
  });

  it('gives every AI country the same rules as the player', () => {
    const state = game(808, 'hard');
    for (let i = 0; i < 260; i += 1) runTick(state);
    const countries = Object.values(state.countries).filter((c) => c.alive);
    expect(countries.length).toBeGreaterThan(1);
    for (const country of countries) {
      const totals = countryTotals(state, country.id);
      expect(totals.territories).toBeGreaterThan(0);
      expect(totals.army).toBeGreaterThan(0);
      // Nobody can hold armies for free: the upkeep is the same for everyone.
      expect(totals.army * BALANCE.armyUpkeep).toBeLessThan(totals.population * BALANCE.taxRate + 400);
    }
    expect(state.countries[state.playerCountryId]).toBeTruthy();
  });

  it('declares victory when the map is conquered and defeat when all is lost', () => {
    const won = game();
    const playerId = won.playerCountryId;
    for (const territory of Object.values(won.territories)) territory.owner = playerId;
    checkVictory(won);
    expect(won.status).toBe('victory');
    expect(won.victory?.kind).toBe('domination');
    expect(won.speed).toBe(0);

    const lost = game();
    for (const territory of Object.values(lost.territories)) {
      if (territory.owner === lost.playerCountryId) territory.owner = Object.keys(lost.countries).find(
        (id) => id !== lost.playerCountryId,
      )!;
    }
    checkVictory(lost);
    expect(lost.status).toBe('defeat');
    expect(lost.victory?.title).toBe('Поражение');
  });

  it('cannot be defeated and victorious at the same time', () => {
    const state = game();
    state.status = 'victory';
    checkVictory(state);
    expect(state.status).toBe('victory');
  });
});
