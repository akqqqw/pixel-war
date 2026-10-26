// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { deserializeGame, serializeGame } from '@/core/save/serialization';
import { runTick } from '@/core/sim/simulation';
import { startOffensive, activeOffensive } from '@/core/sim/orders';
import { createGame } from '@/core/state/createGame';
import { SAVE_VERSION } from '@/core/state/types';
import { AUTO_SAVE_SLOT, deleteSave, listSaves, loadSave, writeSave } from '@/services/saveGame';
import type { GameState } from '@/core/state/types';

function played(seed = 606): GameState {
  const state = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  for (let i = 0; i < 25; i += 1) runTick(state);
  return state;
}

describe('save serialisation', () => {
  it('round-trips the whole cell state', () => {
    const state = played();
    state.speed = 2;
    const restored = deserializeGame(serializeGame(state));

    expect(restored.tick).toBe(state.tick);
    expect(restored.speed).toBe(2);
    expect(restored.playerCountryId).toBe(state.playerCountryId);
    expect(Array.from(restored.cellOwner)).toEqual(Array.from(state.cellOwner));
    expect(restored.cellArmy.length).toBe(state.cellArmy.length);
    for (let cell = 0; cell < state.cellArmy.length; cell += 1) {
      expect(restored.cellArmy[cell]).toBeCloseTo(state.cellArmy[cell] ?? 0, 3);
    }
    for (const country of Object.values(state.countries)) {
      const copy = restored.countries[country.id];
      expect(copy).toBeTruthy();
      expect(copy!.money).toBeCloseTo(country.money, 3);
      expect(copy!.tanks).toBe(country.tanks);
      expect(copy!.warWith).toEqual(country.warWith);
    }
    for (const region of Object.values(state.regions)) {
      const copy = restored.regions[region.id];
      expect(copy).toBeTruthy();
      expect(copy!.owner).toBe(region.owner);
      expect(copy!.buildings.length).toBe(region.buildings.length);
    }
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(3);
  });

  it('keeps an active offensive after a reload', () => {
    const state = played(707);
    const player = state.playerCountryId;
    const playerIndex = state.countryOrder.indexOf(player);
    const width = state.world.width;
    let mine = -1;
    let target = -1;
    for (let cell = 0; cell < state.cellOwner.length && target < 0; cell += 1) {
      if ((state.cellOwner[cell] ?? -1) !== playerIndex) continue;
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
        if (owner >= 0 && owner !== playerIndex) {
          mine = cell;
          target = next;
          break;
        }
      }
    }
    const regionId = state.world.territories[state.world.tileTerritory[mine] ?? -1]!.id;
    const result = startOffensive(state, player, regionId, target, 0.6);
    expect(result.ok).toBe(true);

    const restored = deserializeGame(serializeGame(state));
    const order = activeOffensive(restored, player);
    expect(order).not.toBeNull();
    expect(order!.targetCell).toBe(target);
    expect(order!.share).toBeCloseTo(0.6, 3);
  });

  it('resets the transient map version on load', () => {
    const state = played(333);
    state.mapVersion = 42;
    const restored = deserializeGame(serializeGame(state));
    expect(restored.mapVersion).toBe(0);
    // A broken value never reaches the renderer.
    const raw = JSON.parse(serializeGame(state)) as Record<string, unknown>;
    raw.mapVersion = 'брак';
    expect(deserializeGame(JSON.stringify(raw)).mapVersion).toBe(0);
  });

  it('repairs a broken save instead of crashing', () => {
    const state = played(909);
    const raw = JSON.parse(serializeGame(state)) as Record<string, unknown>;
    raw.cellArmy = [];
    (raw.countries as Record<string, { money: number; population: number }>)[
      state.playerCountryId
    ].money = -500;
    (raw.countries as Record<string, { money: number; population: number }>)[
      state.playerCountryId
    ].population = Number.NaN;
    const restored = deserializeGame(JSON.stringify(raw));
    expect(restored.countries[restored.playerCountryId]!.money).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(restored.countries[restored.playerCountryId]!.population)).toBe(true);
    expect(restored.cellArmy.length).toBe(restored.world.width * restored.world.height);
  });

  it('writes, lists, loads and deletes saves in IndexedDB', async () => {
    const state = played(120);
    const meta = await writeSave('test-slot', 'Проверка', state);
    expect(meta.ownedCells).toBeGreaterThan(0);

    const saves = await listSaves();
    expect(saves.some((save) => save.slot === 'test-slot')).toBe(true);

    const loaded = await loadSave('test-slot');
    expect(loaded).not.toBeNull();
    expect(loaded!.tick).toBe(state.tick);
    expect(Array.from(loaded!.cellOwner)).toEqual(Array.from(state.cellOwner));

    await deleteSave('test-slot');
    const after = await listSaves();
    expect(after.some((save) => save.slot === 'test-slot')).toBe(false);
  });

  it('uses the autosave slot name', async () => {
    const state = played(121);
    await writeSave(AUTO_SAVE_SLOT, 'Авто', state);
    const saves = await listSaves();
    expect(saves.some((save) => save.slot === AUTO_SAVE_SLOT)).toBe(true);
    await deleteSave(AUTO_SAVE_SLOT);
  });
});

describe('save service guards', () => {
  beforeEach(async () => {
    await deleteSave('guard-slot');
  });

  it('returns null for a missing slot', async () => {
    expect(await loadSave('nothing-here')).toBeNull();
  });
});
