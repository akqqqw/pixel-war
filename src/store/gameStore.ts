import { create } from 'zustand';
import { BUILDINGS, type BuildingKind } from '@/core/buildings/buildings';
import { deserializeGame, serializeGame } from '@/core/save/serialization';
import {
  build,
  declareWar,
  makePeace,
  maxRecruit,
  moveArmy as moveArmyAction,
  recruit,
  type ActionResult,
} from '@/core/sim/actions';
import { GameClock } from '@/core/sim/simulation';
import { createGame, sanitizeGame } from '@/core/state/createGame';
import type { Difficulty, GameSpeed, GameState } from '@/core/state/types';
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

interface GameStore {
  screen: Screen;
  game: GameState | null;
  clock: GameClock | null;
  revision: number;
  saves: SaveMeta[];
  settings: Settings;
  notices: Notice[];
  selectedTerritoryId: string | null;
  buildingChoice: BuildingKind | null;
  transferFrom: string | null;
  pendingCountry: string;
  loading: boolean;
  lastAutosaveTick: number;
  lastStatus: string;

  bootstrap: () => Promise<void>;
  refreshSaves: () => Promise<void>;
  setScreen: (screen: Screen) => void;
  chooseCountry: (countryId: string) => void;
  startNewGame: (countryId: string, difficulty: Difficulty) => void;
  continueGame: () => Promise<boolean>;
  loadGame: (slot: string) => Promise<boolean>;
  saveGame: (label?: string) => Promise<boolean>;
  deleteSave: (slot: string) => Promise<void>;
  exitToMenu: () => void;

  advance: (dtMs: number) => void;
  setSpeed: (speed: GameSpeed) => void;
  selectTerritory: (id: string | null) => void;
  chooseBuilding: (kind: BuildingKind | null) => void;
  buildHere: (territoryId: string) => ActionResult;
  recruitHere: (territoryId: string, amount: number) => ActionResult;
  startTransfer: (territoryId: string) => void;
  cancelTransfer: () => void;
  finishTransfer: (toTerritoryId: string) => ActionResult;
  declareWarOn: (countryId: string) => ActionResult;
  makePeaceWith: (countryId: string) => ActionResult;
  setAutosave: (enabled: boolean) => void;
  pushNotice: (text: string, kind?: Notice['kind']) => void;
  dismissNotice: (id: string) => void;
}

const SETTINGS_KEY = 'pixel-war-settings-v2';
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

export const useGameStore = create<GameStore>()((set, get) => ({
  screen: 'menu',
  game: null,
  clock: null,
  revision: 0,
  saves: [],
  settings: loadSettings(),
  notices: [],
  selectedTerritoryId: null,
  buildingChoice: null,
  transferFrom: null,
  pendingCountry: 'aquilonia',
  loading: false,
  lastAutosaveTick: 0,
  lastStatus: 'playing',

  bootstrap: async () => {
    await get().refreshSaves();
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
    const capital = game.countries[countryId]?.capitalTerritoryId ?? null;
    set({
      game,
      clock,
      screen: 'game',
      revision: get().revision + 1,
      selectedTerritoryId: capital,
      buildingChoice: null,
      transferFrom: null,
      notices: [],
      lastAutosaveTick: 0,
      lastStatus: game.status,
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
        selectedTerritoryId: game.countries[game.playerCountryId]?.capitalTerritoryId ?? null,
        buildingChoice: null,
        transferFrom: null,
        notices: [],
        loading: false,
        lastAutosaveTick: game.tick,
        lastStatus: game.status,
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
    const name = label ?? `${country?.shortName ?? 'Партия'} · ход ${game.tick}`;
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
    set({ screen: 'menu', transferFrom: null, buildingChoice: null });
    void get().refreshSaves();
  },

  advance: (dtMs) => {
    const { clock, game } = get();
    if (!clock || !game) return;
    const ticks = clock.advance(dtMs);
    if (ticks === 0) return;
    set({ revision: get().revision + 1 });
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

  selectTerritory: (id) => set({ selectedTerritoryId: id }),

  chooseBuilding: (kind) => set({ buildingChoice: kind, transferFrom: null }),

  buildHere: (territoryId) => {
    const { game, buildingChoice } = get();
    if (!game || !buildingChoice) return { ok: false, message: 'Сначала выберите здание.' };
    const result = build(game, game.playerCountryId, territoryId, buildingChoice);
    if (result.ok) {
      set({ revision: get().revision + 1 });
      const def = BUILDINGS[buildingChoice];
      get().pushNotice(`${def.name} построен.`, 'success');
      // Keep the choice while the limit and money allow, so several can be placed.
      const territory = game.territories[territoryId];
      const owned = territory?.buildings.filter((b) => b.kind === buildingChoice).length ?? 0;
      if (!territory || owned >= def.limit) set({ buildingChoice: null });
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  recruitHere: (territoryId, amount) => {
    const game = get().game;
    if (!game) return { ok: false, message: 'Нет партии.' };
    const result = recruit(game, game.playerCountryId, territoryId, amount);
    if (result.ok) {
      set({ revision: get().revision + 1 });
      get().pushNotice('Армия пополнена.', 'success');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

  startTransfer: (territoryId) => set({ transferFrom: territoryId, buildingChoice: null }),
  cancelTransfer: () => set({ transferFrom: null }),

  finishTransfer: (toTerritoryId) => {
    const { game, transferFrom } = get();
    if (!game || !transferFrom) return { ok: false, message: 'Не выбрана исходная территория.' };
    const source = game.territories[transferFrom];
    const amount = Math.floor((source?.army ?? 0) * 0.5);
    const result = moveArmyAction(game, game.playerCountryId, transferFrom, toTerritoryId, amount);
    if (result.ok) {
      set({ revision: get().revision + 1, transferFrom: null });
      get().pushNotice(`Переброшено ${amount} армии.`, 'success');
    } else if (result.message) {
      get().pushNotice(result.message, 'danger');
    }
    return result;
  },

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

/** Helpers used by the UI. */
export function selectedTerritory(state: GameState | null, id: string | null) {
  if (!state || !id) return null;
  return state.territories[id] ?? null;
}

export function playerRecruitLimit(state: GameState | null, territoryId: string | null): number {
  if (!state || !territoryId) return 0;
  return Math.min(maxRecruit(state, territoryId), 25);
}

export { serializeGame, deserializeGame };
