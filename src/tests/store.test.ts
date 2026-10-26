// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { BUILDINGS } from '@/core/buildings/buildings';
import { playerOffensive, useGameStore } from '@/store/gameStore';
import { regionOfCell } from '@/core/world/cells';

function store() {
  return useGameStore.getState();
}

function ownCellWithSpace(): number {
  const state = store();
  const game = state.game!;
  const index = game.countryOrder.indexOf(game.playerCountryId);
  for (let cell = 0; cell < game.cellOwner.length; cell += 1) {
    if ((game.cellOwner[cell] ?? -1) !== index) continue;
    const region = regionOfCell(game.world, cell);
    if (!region) continue;
    const regionState = game.regions[region.id];
    if (!regionState) continue;
    if (regionState.buildings.some((building) => building.cell === cell)) continue;
    return cell;
  }
  throw new Error('no free own cell');
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
      selectedCell: null,
      buildingChoice: null,
      orderDraft: null,
      strikeBuildingId: null,
      loading: false,
      lastAutosaveTick: 0,
      lastStatus: 'playing',
    });
  });

  it('starts a campaign and wires the clock to it', () => {
    store().startNewGame('draconia', 'easy');
    expect(store().screen).toBe('game');
    expect(store().game?.playerCountryId).toBe('draconia');
    expect(store().clock).not.toBeNull();

    const tick = store().game!.tick;
    store().advance(500);
    expect(store().game!.tick).toBe(tick + 1);

    store().togglePause();
    expect(store().game!.speed).toBe(0);
    store().advance(5000);
    expect(store().game!.tick).toBe(tick + 1);
  });

  it('builds on the selected own cell and refuses a foreign one', () => {
    store().startNewGame('aquilonia', 'normal');
    const game = store().game!;
    const country = game.countries[game.playerCountryId]!;
    country.money = 10_000;
    const cell = ownCellWithSpace();

    const regionId = regionOfCell(game.world, cell)!.id;
    const builtBefore = game.regions[regionId]!.buildings.length;
    store().selectCell(cell);
    store().chooseBuilding('factory');
    const result = store().placeAt(cell);
    expect(result.ok).toBe(true);
    expect(game.regions[regionId]!.buildings.length).toBe(builtBefore + 1);
    expect(country.money).toBeLessThan(10_000);

    // A cell of another country cannot be built on.
    const foreign = (() => {
      const index = game.countryOrder.indexOf(game.playerCountryId);
      for (let c = 0; c < game.cellOwner.length; c += 1) {
        const owner = game.cellOwner[c] ?? -1;
        if (owner >= 0 && owner !== index && regionOfCell(game.world, c)) return c;
      }
      return -1;
    })();
    store().chooseBuilding('factory');
    const denied = store().placeAt(foreign);
    expect(denied.ok).toBe(false);
    expect(store().notices.length).toBeGreaterThan(0);
    expect(BUILDINGS.factory.cost).toBeGreaterThan(0);
  });

  it('mobilises the region of the selected cell', () => {
    store().startNewGame('velDania'.toLowerCase(), 'normal');
    const game = store().game!;
    const cell = ownCellWithSpace();
    const regionId = regionOfCell(game.world, cell)!.id;
    const region = game.regions[regionId]!;
    region.population = 900;
    region.lastMobilizeTick = -99;
    game.tick = 500;
    const country = game.countries[game.playerCountryId]!;
    country.money = 10_000;
    const territory = game.world.territories.find((entry) => entry.id === regionId)!;
    for (const tile of territory.tiles) game.cellArmy[tile] = 0;
    const result = store().mobilizeRegion(regionId);
    expect(result.ok).toBe(true);
    expect(region.population).toBeLessThan(900);
  });

  it('drafts and confirms an offensive from the selected cell', () => {
    store().startNewGame('aquilonia', 'normal');
    const game = store().game!;
    const index = game.countryOrder.indexOf(game.playerCountryId);
    let own = -1;
    let enemy = -1;
    const width = game.world.width;
    for (let cell = 0; cell < game.cellOwner.length && enemy < 0; cell += 1) {
      if ((game.cellOwner[cell] ?? -1) !== index) continue;
      const x = cell % width;
      const y = (cell / width) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const next = (y + dy) * width + (x + dx);
        const owner = game.cellOwner[next] ?? -1;
        if (owner >= 0 && owner !== index) {
          own = cell;
          enemy = next;
          break;
        }
      }
    }
    expect(own).toBeGreaterThanOrEqual(0);
    store().selectCell(own);
    expect(store().draftOffensive(enemy).ok).toBe(true);
    expect(store().orderDraft?.targetCell).toBe(enemy);
    expect(store().confirmOffensive(0.5).ok).toBe(true);
    expect(store().orderDraft).toBeNull();
    expect(playerOffensive(store().game)).not.toBeNull();
    expect(store().stopPush().ok).toBe(true);
    expect(playerOffensive(store().game)).toBeNull();
  });

  it('restores the autosave when the page is opened again', async () => {
    store().startNewGame('aquilonia', 'normal');
    store().advance(1500);
    const tick = store().game!.tick;
    expect(await store().saveGame('Автосохранение')).toBe(true);

    // Simulate a reload: the state is gone, only the storage remains.
    useGameStore.setState({ screen: 'menu', game: null, clock: null, selectedCell: null });
    await store().bootstrap();

    expect(store().screen).toBe('game');
    expect(store().game?.tick).toBe(tick);
    expect(store().clock).not.toBeNull();
  });

  it('keeps selection and notices in sync', () => {
    store().startNewGame('aquilonia', 'normal');
    expect(store().selectedCell).toBeNull();
    store().selectCell(42);
    expect(store().selectedCell).toBe(42);
    store().pushNotice('тест');
    expect(store().notices).toHaveLength(1);
    const id = store().notices[0]!.id;
    store().dismissNotice(id);
    expect(store().notices).toHaveLength(0);
  });
});
