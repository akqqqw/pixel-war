// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { deserializeGame, serializeGame } from '@/core/save/serialization';
import { createGame } from '@/core/state/createGame';
import { SAVE_VERSION } from '@/core/state/types';
import { runTick } from '@/core/sim/simulation';
import { AUTO_SAVE_SLOT, deleteSave, listSaves, loadSave, writeSave } from '@/services/saveGame';

function played(seed = 606) {
  const state = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  for (let i = 0; i < 25; i += 1) runTick(state);
  return state;
}

describe('save serialisation', () => {
  it('round-trips the whole state', () => {
    const state = played();
    state.speed = 2;
    const restored = deserializeGame(serializeGame(state));

    expect(restored.version).toBe(SAVE_VERSION);
    expect(restored.tick).toBe(state.tick);
    expect(restored.speed).toBe(2);
    expect(restored.playerCountryId).toBe(state.playerCountryId);
    expect(restored.status).toBe(state.status);
    expect(restored.tileOwner).toBeInstanceOf(Int16Array);
    expect(Array.from(restored.tileOwner)).toEqual(Array.from(state.tileOwner));
    expect(restored.territories).toEqual(state.territories);
    expect(restored.countries).toEqual(state.countries);
    expect(restored.missileReady).toEqual(state.missileReady);
    expect(restored.world.territories.length).toBe(state.world.territories.length);
  });

  it('keeps the simulation running after a reload', () => {
    const state = played();
    const restored = deserializeGame(serializeGame(state));
    restored.speed = 1;
    const before = restored.tick;
    runTick(restored);
    expect(restored.tick).toBe(before + 1);
    expect(restored.countries[restored.playerCountryId]!.money).toBeGreaterThanOrEqual(0);
  });

  it('rejects saves from another version or broken payloads', () => {
    const raw = JSON.parse(serializeGame(played()));
    raw.version = SAVE_VERSION + 1;
    expect(() => deserializeGame(JSON.stringify(raw))).toThrow(/версия/i);

    const noMap = JSON.parse(serializeGame(played()));
    delete noMap.tileOwner;
    expect(() => deserializeGame(JSON.stringify(noMap))).toThrow(/карт/i);

    expect(() => deserializeGame('null')).toThrow();
  });

  it('repairs impossible numbers instead of loading them', () => {
    const raw = JSON.parse(serializeGame(played()));
    const playerId = raw.playerCountryId as string;
    raw.countries[playerId].money = -500;
    raw.countries[playerId].warWith = [playerId, 'unknown'];
    const territoryId = Object.keys(raw.territories)[0]!;
    raw.territories[territoryId].population = -20;
    raw.territories[territoryId].army = -5;
    raw.tick = -3;
    raw.speed = 7;

    const state = deserializeGame(JSON.stringify(raw));
    expect(state.countries[playerId]!.money).toBe(0);
    expect(state.countries[playerId]!.warWith).toEqual([]);
    expect(state.territories[territoryId]!.population).toBeGreaterThan(0);
    expect(state.territories[territoryId]!.army).toBe(0);
    expect(state.tick).toBe(0);
    expect(state.speed).toBe(1);
  });

  it('trims the event log so saves stay small', () => {
    const state = played();
    for (let i = 0; i < 200; i += 1) {
      state.events.push({ id: `e${i}`, tick: i, kind: 'war', text: 'x', countryId: state.playerCountryId });
    }
    const restored = deserializeGame(serializeGame(state));
    expect(restored.events.length).toBeLessThanOrEqual(60);
  });
});

describe('IndexedDB persistence', () => {
  beforeEach(async () => {
    await deleteSave(AUTO_SAVE_SLOT);
    await deleteSave('slot-1');
  });

  it('stores, lists and loads a campaign', async () => {
    const state = played();
    const meta = await writeSave('slot-1', 'Тест', state);
    expect(meta.slot).toBe('slot-1');
    expect(meta.tick).toBe(state.tick);
    expect(meta.ownedTerritories).toBeGreaterThan(0);

    const saves = await listSaves();
    expect(saves.map((save) => save.slot)).toContain('slot-1');

    const loaded = await loadSave('slot-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.tick).toBe(state.tick);
    expect(loaded!.tileOwner.length).toBe(state.tileOwner.length);
  });

  it('overwrites an autosave slot instead of duplicating it', async () => {
    const state = played();
    await writeSave(AUTO_SAVE_SLOT, 'Авто', state);
    for (let i = 0; i < 5; i += 1) runTick(state);
    await writeSave(AUTO_SAVE_SLOT, 'Авто', state);

    const saves = (await listSaves()).filter((save) => save.slot === AUTO_SAVE_SLOT);
    expect(saves).toHaveLength(1);
    expect(saves[0]!.tick).toBe(state.tick);
  });

  it('returns null for an empty slot and forgets deleted saves', async () => {
    expect(await loadSave('missing')).toBeNull();
    await writeSave('slot-1', 'Тест', played());
    await deleteSave('slot-1');
    expect(await loadSave('slot-1')).toBeNull();
    expect((await listSaves()).map((save) => save.slot)).not.toContain('slot-1');
  });
});
