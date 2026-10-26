import { create } from 'zustand';
import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import { deserializeGame, serializeGame } from '@/core/save/serialization';
import { build, demolishBuilding, upgradeBuilding } from '@/core/sim/actions';
import { armyInCells, mobilize, mobilizeMax } from '@/core/sim/army';
import { declareWar, makePeace } from '@/core/sim/diplomacy';
import { regionOfCell } from '@/core/world/cells';
import {
  activeOffensive,
  buildFlowField,
  regionCellsOwned,
  retreatOffensive,
  startOffensive,
  stopOffensive,
} from '@/core/sim/orders';
import type { ActionResult } from '@/core/sim/result';
import { GameClock } from '@/core/sim/simulation';
import { findBuilding, fireMissile, launchAirStrike } from '@/core/sim/strikes';
import { createGame, sanitizeGame } from '@/core/state/createGame';
import type { Difficulty, GameSpeed, GameState } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';
import { AUTO_SAVE_SLOT, deleteSave as removeSave, listSaves, loadSave, writeSave, type SaveMeta } from '@/services/saveGame';

export type Screen = 'menu' | 'countrySelect' | 'game';

export interface Notice {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'danger';
}

export interface Settings {
  autosave: boolean;
}

/** Direction chosen by the player: the slider is open until it is confirmed. */
export interface OrderDraft {
  sourceRegionId: TerritoryId;
  targetCell: number;
}

interface GameStore {
  screen: Screen;
  game: GameState | null;
  clock: GameClock | null;
  revision: number;
  saves: SaveMeta[];
  settings: Settings;
  notices: Notice[];
  /** Selected map cell — the only selection the interface needs. */
  selectedCell: number | null;
  buildingChoice: BuildingKind | null;
  orderDraft: OrderDraft | null;
  /** Missile or airfield waiting for a target cell. */
  strikeBuildingId: string | null;
  pendingCountry: CountryId;
  loading: boolean;
  lastAutosaveTick: number;
  lastStatus: string;
  /** Id of the push that was running on the previous tick. */
  lastOrderId: string | null;

  bootstrap: () => Promise<void>;
  refreshSaves: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  chooseCountry: (countryId: CountryId) => void;
  startNewGame: (countryId: CountryId, difficulty: Difficulty) => void;
  continueGame: () => Promise<boolean>;
  loadGame: (slot: string) => Promise<boolean>;
  saveGame: (label?: string) => Promise<boolean>;
  deleteSave: (slot: string) => Promise<void>;
  exitToMenu: () => void;

  advance: (dtMs: number) => void;
  setSpeed: (speed: GameSpeed) => void;
  togglePause: () => void;

  selectCell: (cell: number | null) => void;
  chooseBuilding: (kind: BuildingKind | null) => void;
  placeAt: (cell: number) => ActionResult;
  upgradeAt: (buildingId: string) => ActionResult;
  demolishAt: (buildingId: string) => ActionResult;

  mobilizeRegion: (regionId: TerritoryId) => ActionResult;

  draftOffensive: (targetCell: number) => ActionResult;
  confirmOffensive: (share: number) => ActionResult;
  cancelDraft: () => void;
  stopPush: () => ActionResult;
  retreatPush: () => ActionResult;

  beginStrike: (buildingId: string) => void;
  fireAt: (cell: number) => ActionResult;
  cancelStrike: () => void;

  declareWarOn: (countryId: CountryId) => ActionResult;
  makePeaceWith: (countryId: CountryId) => ActionResult;
  setAutosave: (enabled: boolean) => void;
  pushNotice: (text: string, kind?: Notice['kind']) => void;
  dismissNotice: (id: string) => void;
}

const SETTINGS_KEY = 'pixel-war-settings-v3';
const DEFAULT_SETTINGS: Settings = { autosave: true };

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable — settings stay in memory
  }
}

function nextNotice(text: string, kind: Notice['kind'] = 'info'): Notice {
  return { id: `n${Date.now()}${Math.random().toString(16).slice(2, 6)}`, text, kind };
}

/** Region that holds the cell, or null for water and out-of-map indices. */
function regionAt(state: GameState, cell: number): TerritoryId | null {
  const region = regionOfCell(state.world, cell);
  return region ? region.id : null;
}

export const useGameStore = create<GameStore>()((set, get) => ({
  screen: 'menu',
  game: null,
  clock: null,
  revision: 0,
  saves: [],
  settings: loadSettings(),
  notices: [],
  selectedCell: null,
  buildingChoice: null,
  orderDraft: null,
  strikeBuildingId: null,
  pendingCountry: 'aquilonia',
  loading: false,
  lastAutosaveTick: 0,
  lastStatus: 'playing',
  lastOrderId: null,

  /** Opens the menu and quietly restores the autosave of the previous session. */
  bootstrap: async () => {
    await get().refreshSaves();
    const state = get();
    if (state.game || state.screen !== 'menu') return;
    const autosave = state.saves.find((save) => save.slot === AUTO_SAVE_SLOT);
    if (autosave) await state.loadGame(AUTO_SAVE_SLOT);
  },

  refreshSaves: async () => {
    try {
      const saves = await listSaves();
      set({ saves });
    } catch {
      set({ saves: [] });
    }
  },

  setScreen: (screen) => set({ screen }),

  chooseCountry: (countryId) => set({ pendingCountry: countryId, screen: 'countrySelect' }),

  startNewGame: (countryId, difficulty) => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const game = createGame({ seed, playerCountryId: countryId, difficulty });
    const clock = new GameClock(game);
    set({
      game,
      clock,
      screen: 'game',
      revision: get().revision + 1,
      selectedCell: null,
      buildingChoice: null,
      orderDraft: null,
      strikeBuildingId: null,
      notices: [],
      lastAutosaveTick: 0,
      lastStatus: game.status,
      lastOrderId: null,
    });
    void get().refreshSaves();
  },

  continueGame: async () => {
    const autosave = get().saves.find((save) => save.slot === AUTO_SAVE_SLOT);
    const newest = autosave ?? get().saves[0];
    if (!newest) return false;
    return get().loadGame(newest.slot);
  },

  loadGame: async (slot) => {
    set({ loading: true });
    try {
      const game = await loadSave(slot);
      if (!game) {
        set({ loading: false });
        get().pushNotice('Сохранение не найдено.', 'danger');
        return false;
      }
      sanitizeGame(game);
      set({
        game,
        clock: new GameClock(game),
        screen: 'game',
        revision: get().revision + 1,
        selectedCell: null,
        buildingChoice: null,
        orderDraft: null,
        strikeBuildingId: null,
        notices: [],
        loading: false,
        lastAutosaveTick: game.tick,
        lastStatus: game.status,
        lastOrderId: null,
      });
      get().pushNotice('Партия загружена.', 'success');
      return true;
    } catch (error) {
      set({ loading: false });
      get().pushNotice(`Не удалось загрузить: ${(error as Error).message}`, 'danger');
      return false;
    }
  },

  saveGame: async (label) => {
    const game = get().game;
    if (!game) return false;
    const slot = label === 'Автосохранение' ? AUTO_SAVE_SLOT : `manual-${Date.now()}`;
    const country = game.countries[game.playerCountryId];
    const name = label ?? `${country?.shortName ?? 'Партия'} · ${game.tick} тик`;
    try {
      await writeSave(slot, name, game);
      await get().refreshSaves();
      if (slot !== AUTO_SAVE_SLOT) get().pushNotice('Сохранено.', 'success');
      return true;
    } catch (error) {
      get().pushNotice(`Ошибка сохранения: ${(error as Error).message}`, 'danger');
      return false;
    }
  },

  deleteSave: async (slot) => {
    await removeSave(slot);
    await get().refreshSaves();
  },

  exitToMenu: () => {
    if (get().game) void get().saveGame('Автосохранение');
    set({ screen: 'menu', buildingChoice: null, orderDraft: null, strikeBuildingId: null });
    void get().refreshSaves();
  },

  advance: (dtMs) => {
    const { clock, game } = get();
    if (!clock || !game) return;
    const ticks = clock.advance(dtMs);
    if (ticks === 0) return;
    set({ revision: get().revision + 1 });
    // The push ended on its own (peace, dead front or no reachable target).
    const order = playerOffensive(game);
    if (!order && get().lastOrderId) {
      get().pushNotice('Наступление остановлено.', 'info');
    }
    set({ lastOrderId: order?.id ?? null });
    const autosave = get().settings.autosave;
    if (autosave && game.status === 'playing' && game.tick - get().lastAutosaveTick >= 40) {
      set({ lastAutosaveTick: game.tick });
      void get().saveGame('Автосохранение');
    }
    if (game.status !== 'playing' && game.status !== get().lastStatus) {
      set({ lastStatus: game.status });
      void get().saveGame('Автосохранение');
    }
  },

  setSpeed: (speed) => {
    const game = get().game;
    if (!game) return;
    game.speed = speed;
    get().clock?.reset();
    set({ revision: get().revision + 1 });
  },

  togglePause: () => {
    const game = get().game;
    if (!game) return;
    get().setSpeed(game.speed === 0 ? 1 : 0);
  },

  selectCell: (cell) => set({ selectedCell: cell }),

  chooseBuilding: (kind) => set({ buildingChoice: kind, orderDraft: null, strikeBuildingId: null }),

  placeAt: (cell) => {
    const { game, buildingChoice } = get();
    if (!game || !buildingChoice) return { ok: false, message: 'Сначала выберите здание.' };
    const regionId = regionAt(game, cell);
    if (!regionId) {
      get().pushNotice('Здесь нельзя строить.', 'danger');
      return { ok: false, message: 'Здесь нельзя строить.' };
    }
    const result = build(game, game.playerCountryId, regionId, buildingChoice, cell);
    if (result.ok) {
      set({ revision: get().revision + 1, selectedCell: cell });
      const def = BUILDINGS[buildingChoice];
      get().pushNotice(`${def.name} построен.`, 'success');
      const built = game.regions[regionId]?.buildings.filter((b) => b.kind === buildingChoice).length ?? 0;
      if (built >= def.limit) set({ buildingChoice: null });
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  upgradeAt: (buildingId) => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const found = findBuilding(game, buildingId);
    const result = upgradeBuilding(game, game.playerCountryId, buildingId);
    if (result.ok) set({ revision: get().revision + 1 });
    else if (result.message) get().pushNotice(result.message, 'danger');
    if (result.ok && found) get().pushNotice('Улучшено.', 'success');
    return result;
  },

  demolishAt: (buildingId) => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const result = demolishBuilding(game, game.playerCountryId, buildingId);
    if (result.ok) set({ revision: get().revision + 1 });
    else if (result.message) get().pushNotice(result.message, 'danger');
    return result;
  },

  mobilizeRegion: (regionId) => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const countryId = game.playerCountryId;
    const max = mobilizeMax(game, countryId, regionId);
    if (max <= 0) {
      const message = 'Некому или нечем мобилизоваться.';
      get().pushNotice(message, 'danger');
      return { ok: false, message };
    }
    const result = mobilize(game, countryId, regionId, max);
    if (result.ok) {
      set({ revision: get().revision + 1 });
      get().pushNotice(`Мобилизовано ${max} солдат.`, 'success');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  draftOffensive: (targetCell) => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const selected = get().selectedCell;
    if (selected === null) return { ok: false, message: 'Сначала выберите свою клетку.' };
    const regionId = regionAt(game, selected);
    if (!regionId) return { ok: false, message: 'Наступать можно только со своей земли.' };
    const index = game.countryOrder.indexOf(game.playerCountryId);
    if ((game.cellOwner[selected] ?? -1) !== index) {
      return { ok: false, message: 'Наступать можно только со своей земли.' };
    }
    const targetOwner = game.cellOwner[targetCell] ?? -1;
    if (targetOwner === index) return { ok: false, message: 'Это уже ваша клетка.' };
    if (regionCellsOwned(game, regionId, game.playerCountryId) === 0) {
      return { ok: false, message: 'В регионе нет ваших клеток.' };
    }
    const dist = buildFlowField(game, index, targetCell);
    let front = 0;
    for (let cell = 0; cell < dist.length; cell += 1) {
      if ((dist[cell] ?? -1) === 1 && (game.cellOwner[cell] ?? -1) === index) front += 1;
    }
    if (front === 0) return { ok: false, message: 'К этой клетке нет сухопутного фронта.' };
    set({ orderDraft: { sourceRegionId: regionId, targetCell }, buildingChoice: null, strikeBuildingId: null });
    return { ok: true };
  },

  confirmOffensive: (share) => {
    const game = get().game;
    const draft = get().orderDraft;
    if (!game || !draft) return { ok: false, message: 'Не выбрано направление.' };
    const result = startOffensive(game, game.playerCountryId, draft.sourceRegionId, draft.targetCell, share);
    if (result.ok) {
      set({ revision: get().revision + 1, orderDraft: null, selectedCell: draft.targetCell });
      get().pushNotice('Наступление началось.', 'success');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  cancelDraft: () => set({ orderDraft: null }),

  stopPush: () => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const result = stopOffensive(game, game.playerCountryId);
    if (result.ok) {
      set({ revision: get().revision + 1 });
      get().pushNotice('Наступление остановлено.', 'info');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  retreatPush: () => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const result = retreatOffensive(game, game.playerCountryId);
    if (result.ok) set({ revision: get().revision + 1 });
    else if (result.message) get().pushNotice(result.message, 'danger');
    return result;
  },

  beginStrike: (buildingId) => set({ strikeBuildingId: buildingId, buildingChoice: null, orderDraft: null }),

  fireAt: (cell) => {
    const game = get().game;
    const buildingId = get().strikeBuildingId;
    if (!game || !buildingId) return { ok: false, message: 'Не выбрано оружие.' };
    const building = findBuilding(game, buildingId);
    if (!building) return { ok: false, message: 'Установка не найдена.' };
    const result =
      building.kind === 'missile'
        ? fireMissile(game, game.playerCountryId, buildingId, cell)
        : launchAirStrike(game, game.playerCountryId, buildingId, cell);
    if (result.ok) {
      set({ revision: get().revision + 1, strikeBuildingId: null });
      get().pushNotice(building.kind === 'missile' ? 'Ракета запущена.' : 'Самолёты вылетели.', 'success');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  cancelStrike: () => set({ strikeBuildingId: null }),

  declareWarOn: (countryId) => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const result = declareWar(game, game.playerCountryId, countryId);
    if (result.ok) {
      set({ revision: get().revision + 1 });
      get().pushNotice('Война объявлена.', 'danger');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  makePeaceWith: (countryId) => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const result = makePeace(game, game.playerCountryId, countryId);
    if (result.ok) {
      set({ revision: get().revision + 1 });
      get().pushNotice('Мир заключён.', 'success');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  setAutosave: (enabled) => {
    const settings: Settings = { ...get().settings, autosave: enabled };
    persistSettings(settings);
    set({ settings });
  },

  pushNotice: (text, kind = 'info') => {
    set({ notices: [...get().notices, nextNotice(text, kind)].slice(-3) });
  },

  dismissNotice: (id) => set({ notices: get().notices.filter((notice) => notice.id !== id) }),
}));

/** Convenience selectors used by the interface. */
export function playerOffensive(state: GameState | null) {
  if (!state) return null;
  return activeOffensive(state, state.playerCountryId);
}

export function playerArmy(state: GameState | null): number {
  if (!state) return 0;
  return armyInCells(state, state.playerCountryId);
}

export { serializeGame, deserializeGame };
