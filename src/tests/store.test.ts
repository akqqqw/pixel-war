// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDINGS } from '@/core/buildings/buildings';
import { useGameStore } from '@/store/gameStore';

function store() {
  return useGameStore.getState();
}

describe('game store', () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({
      screen: 'menu',
      game: null,
      clock: null,
      saves: [],
      notices: [],
      selectedTerritoryId: null,
      buildingChoice: null,
      transferFrom: null,
      loading: false,
      lastAutosaveTick: 0,
      lastStatus: 'playing',
    });
  });

  it('starts a campaign and wires the clock to it', () => {
    store().startNewGame('draconia', 'easy');
    const state = store();
    expect(state.screen).toBe('game');
    expect(state.game?.playerCountryId).toBe('draconia');
    expect(state.clock).not.toBeNull();

    const tick = state.game!.tick;
    store().advance(1000);
    expect(store().game!.tick).toBe(tick + 1);

    store().setSpeed(0);
    store().advance(5000);
    expect(store().game!.tick).toBe(tick + 1);
  });

  it('builds and recruits through the same actions the panel uses', () => {
    store().startNewGame('veldania', 'normal');
    const game = store().game!;
    const capital = game.countries[game.playerCountryId]!.capitalTerritoryId!;
    game.countries[game.playerCountryId]!.money = 5000;
    store().selectTerritory(capital);

    store().chooseBuilding('factory');
    expect(store().buildingChoice).toBe('factory');
    const built = store().buildHere(capital);
    expect(built.ok).toBe(true);
    expect(game.territories[capital]!.buildings.some((b) => b.kind === 'factory')).toBe(true);
    expect(store().notices.at(-1)?.text).toContain(BUILDINGS.factory.name);

    const army = game.territories[capital]!.army;
    expect(store().recruitHere(capital, 10).ok).toBe(true);
    expect(game.territories[capital]!.army).toBeCloseTo(army + 10, 1);

    store().chooseBuilding(null);
    expect(store().buildHere(capital).ok).toBe(false);
  });

  it('declares war and peace from the selection', () => {
    store().startNewGame('aquilonia', 'normal');
    const game = store().game!;
    const enemy = Object.values(game.countries).find((country) => !country.isPlayer)!;
    store().selectTerritory(Object.values(game.territories).find((t) => t.owner === enemy.id)!.id);

    expect(store().declareWarOn(enemy.id).ok).toBe(true);
    expect(game.countries[game.playerCountryId]!.warWith).toContain(enemy.id);
    expect(game.countries[enemy.id]!.warWith).toContain(game.playerCountryId);

    expect(store().makePeaceWith(enemy.id).ok).toBe(true);
    expect(game.countries[game.playerCountryId]!.warWith).not.toContain(enemy.id);
  });

  it('saves on demand and reloads the campaign from the menu', async () => {
    store().startNewGame('aquilonia', 'easy');
    for (let i = 0; i < 3; i += 1) store().advance(1000);
    const tick = store().game!.tick;

    expect(await store().saveGame('Ручное')).toBe(true);
    await store().refreshSaves();
    expect(store().saves.length).toBeGreaterThan(0);

    store().exitToMenu();
    expect(store().screen).toBe('menu');

    const resumed = await store().continueGame();
    expect(resumed).toBe(true);
    expect(store().screen).toBe('game');
    expect(store().game!.tick).toBeGreaterThanOrEqual(tick);
  });

  it('moves army between neighbouring own territories', () => {
    store().startNewGame('draconia', 'normal');
    const game = store().game!;
    const playerId = game.playerCountryId;
    const owned = Object.values(game.territories).filter((t) => t.owner === playerId);
    const pair = owned
      .map((territory) => ({
        from: territory,
        to: game.world.territories
          .find((t) => t.id === territory.id)!
          .neighbors.map((id) => game.territories[id]!)
          .find((other) => other?.owner === playerId),
      }))
      .find((entry) => !!entry.to);
    expect(pair).toBeTruthy();
    const { from, to } = pair!;
    const target = to!;
    const before = target.army;

    store().startTransfer(from.id);
    expect(store().transferFrom).toBe(from.id);
    const result = store().finishTransfer(target.id);
    expect(result.ok).toBe(true);
    expect(target.army).toBeGreaterThan(before);
    expect(store().transferFrom).toBeNull();
  });
});
