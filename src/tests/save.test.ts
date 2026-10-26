import { beforeEach, describe, expect, it } from 'vitest';
import { createGame } from '@/core/state/createGame';
import { deserializeGame, serializeGame } from '@/core/save/serialization';
import { runTick } from '@/core/sim/simulation';
import { AUTO_SAVE_SLOT, deleteSave, listSaves, loadSave, writeSave } from '@/services/saveGame';
import { makeArmy } from '@/core/units/army';

function newGame() {
  return createGame({ seed: 1357, playerCountryId: 'veldania', difficulty: 'normal' });
}

describe('save serialization', () => {
  it('round-trips the world and the state', () => {
    const game = newGame();
    for (let i = 0; i < 25; i += 1) runTick(game);
    const serialized = serializeGame(game);
    const json = JSON.stringify(serialized);
    const restored = deserializeGame(JSON.parse(json));

    expect(restored.seed).toBe(game.seed);
    expect(restored.tick).toBe(game.tick);
    expect(restored.playerCountryId).toBe(game.playerCountryId);
    expect(restored.countries[game.playerCountryId]!.resources.money).toBeCloseTo(
      game.countries[game.playerCountryId]!.resources.money,
      5,
    );
    expect(restored.world.terrain).toEqual(game.world.terrain);
    expect(Array.from(restored.world.elevation)).toEqual(Array.from(game.world.elevation));
    expect(Array.from(restored.world.tileTerritory)).toEqual(Array.from(game.world.tileTerritory));
    expect(restored.world.territories).toEqual(game.world.territories);
    expect(restored.territories).toEqual(game.territories);
    expect(restored.groups).toEqual(game.groups);
    expect(restored.production).toEqual(game.production);
  });

  it('continues simulating correctly after a load', () => {
    const game = newGame();
    for (let i = 0; i < 15; i += 1) runTick(game);
    const restored = deserializeGame(JSON.parse(JSON.stringify(serializeGame(game))));
    const territory = restored.world.territories[0]!;
    restored.territories[territory.id]!.garrison = makeArmy({ mbt: 3 });
    for (let i = 0; i < 15; i += 1) runTick(restored);
    expect(restored.tick).toBe(game.tick + 15);
    expect(Number.isFinite(restored.countries[restored.playerCountryId]!.resources.money)).toBe(true);
  });

  it('rejects corrupt data', () => {
    expect(() => deserializeGame({} as never)).toThrow();
  });
});

describe('save service', () => {
  beforeEach(async () => {
    const saves = await listSaves();
    await Promise.all(saves.map((save) => deleteSave(save.slot)));
  });

  it('writes, lists, loads and deletes saves (memory fallback in Node)', async () => {
    const game = newGame();
    runTick(game);
    const meta = await writeSave(AUTO_SAVE_SLOT, 'Автосохранение', game);
    expect(meta.slot).toBe(AUTO_SAVE_SLOT);
    expect(meta.ownedTerritories).toBeGreaterThan(0);

    const list = await listSaves();
    expect(list.some((save) => save.slot === AUTO_SAVE_SLOT)).toBe(true);

    const loaded = await loadSave(AUTO_SAVE_SLOT);
    expect(loaded).not.toBeNull();
    expect(loaded!.tick).toBe(game.tick);
    expect(loaded!.world.territories.length).toBe(game.world.territories.length);

    await deleteSave(AUTO_SAVE_SLOT);
    expect((await listSaves()).some((save) => save.slot === AUTO_SAVE_SLOT)).toBe(false);
    expect(await loadSave(AUTO_SAVE_SLOT)).toBeNull();
  });
});
