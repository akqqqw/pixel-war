import { create } from 'zustand';
import { createRng, clamp } from '@/core/rng';
import type { CountryId, Resources, TerritoryId } from '@/core/types';
import { RESOURCE_KEYS } from '@/core/types';
import type { BattleReport, Difficulty, GameSpeed, GameState } from '@/core/state/types';
import { createGame, createWorld } from '@/core/state/createGame';
import { GameClock } from '@/core/sim/simulation';
import {
  commandCancelProduction,
  commandDeclareWar,
  commandProposePeace,
  commandQueueUnit,
  commandSendArmy,
  commandUpgradeEconomy,
  type CommandResult,
} from '@/core/sim/commands';
import { pushEvent } from '@/core/sim/events';
import { formatGameDate } from '@/core/time/gameDate';
import type { Army } from '@/core/units/army';
import { LAND_UNITS, type LandUnitType } from '@/core/units/unitTypes';
import {
  AUTO_SAVE_SLOT,
  listSaves,
  loadSave,
  writeSave,
  deleteSave as removeSave,
  type SaveMeta,
} from '@/services/saveGame';

export type Screen = 'menu' | 'countrySelect' | 'game';

export interface Notice {
  id: string;
  text: string;
  kind: 'info' | 'success' | 'danger' | 'battle';
}

export interface GameSettings {
  labels: boolean;
  effects: boolean;
  autosave: boolean;
}

const SETTINGS_KEY = 'pixel-war-settings-v1';
const TUTORIAL_KEY = 'pixel-war-tutorial-done';

const DEFAULT_SETTINGS: GameSettings = { labels: true, effects: true, autosave: true };

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings are nice-to-have; ignore storage failures (private mode).
  }
}

function tutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

interface CameraTarget {
  territoryId: TerritoryId;
  nonce: number;
}

interface GameStore {
  screen: Screen;
  game: GameState | null;
  clock: GameClock | null;
  revision: number;
  saves: SaveMeta[];
  settings: GameSettings;
  selectedTerritoryId: TerritoryId | null;
  selectedUnitType: LandUnitType | null;
  cameraTarget: CameraTarget | null;
  notices: Notice[];
  battleReport: BattleReport | null;
  tutorialStep: number;
  lastSeenEventIndex: number;
  lastSeenBattleId: string | null;
  lastAutosaveTick: number;
  loading: boolean;
  pendingCountry: CountryId | null;
  /** Speed to restore when an auto-pause (battle report) closes. */
  resumeSpeed: GameSpeed | null;
  lastStatus: string;

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
  selectTerritory: (id: TerritoryId | null) => void;
  focusTerritory: (id: TerritoryId) => void;
  selectUnitType: (unit: LandUnitType | null) => void;
  sendArmy: (from: TerritoryId, to: TerritoryId, army: Army) => boolean;
  queueUnit: (territoryId: TerritoryId, unit: LandUnitType) => boolean;
  cancelProduction: (itemId: string) => void;
  upgradeEconomy: (territoryId: TerritoryId) => void;
  declareWar: (target: CountryId) => void;
  proposePeace: (target: CountryId) => void;
  pushNotice: (text: string, kind?: Notice['kind']) => void;
  dismissNotice: (id: string) => void;
  closeBattleReport: () => void;
  openLastBattle: () => void;
  setSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  startTutorial: () => void;
  advanceTutorial: () => void;
  closeTutorial: () => void;
  toggleFullscreen: () => void;
}

let noticeCounter = 0;

function toResultNotice(result: CommandResult): Notice | null {
  if (result.ok) return null;
  return { id: `notice-${noticeCounter++}`, text: result.error ?? 'Не удалось выполнить приказ', kind: 'danger' };
}

function sanitizeCountryResources(game: GameState): void {
  for (const country of Object.values(game.countries)) {
    for (const key of RESOURCE_KEYS) {
      const value = country.resources[key];
      if (!Number.isFinite(value) || value < 0) country.resources[key] = Math.max(0, value || 0);
    }
    for (const key of RESOURCE_KEYS) {
      if (!Number.isFinite(country.income[key])) country.income[key] = 0;
    }
  }
}

export const useGameStore = create<GameStore>()((set, get) => ({
  screen: 'menu',
  game: null,
  clock: null,
  revision: 0,
  saves: [],
  settings: loadSettings(),
  selectedTerritoryId: null,
  selectedUnitType: null,
  cameraTarget: null,
  notices: [],
  battleReport: null,
  tutorialStep: 0,
  lastSeenEventIndex: 0,
  lastSeenBattleId: null,
  lastAutosaveTick: 0,
  loading: false,
  pendingCountry: null,
  resumeSpeed: null,
  lastStatus: 'playing',

  bootstrap: async () => {
    await get().refreshSaves();
  },

  refreshSaves: async () => {
    const saves = await listSaves();
    set({ saves });
  },

  setScreen: (screen) => set({ screen }),

  chooseCountry: (countryId) => set({ pendingCountry: countryId, screen: 'countrySelect' }),

  startNewGame: (countryId, difficulty) => {
    const seed = Math.floor(Math.random() * 1_000_000_000);
    const game = createGame({ seed, playerCountryId: countryId, difficulty });
    const clock = new GameClock(game);
    const capital = game.countries[countryId]?.capitalTerritoryId ?? game.selectedTerritoryId;
    set({
      game,
      clock,
      screen: 'game',
      revision: get().revision + 1,
      selectedTerritoryId: capital,
      selectedUnitType: 'mbt',
      cameraTarget: capital ? { territoryId: capital, nonce: Date.now() } : null,
      notices: [],
      battleReport: null,
      tutorialStep: tutorialCompleted() ? 0 : 1,
      lastSeenEventIndex: game.events.length,
      lastSeenBattleId: null,
      lastAutosaveTick: 0,
    });
    void get().refreshSaves();
  },

  continueGame: async () => {
    const saves = get().saves;
    const auto = saves.find((save) => save.slot === AUTO_SAVE_SLOT);
    const newest = auto ?? saves[0];
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
      sanitizeCountryResources(game);
      const clock = new GameClock(game);
      set({
        game,
        clock,
        screen: 'game',
        revision: get().revision + 1,
        selectedTerritoryId: game.selectedTerritoryId ?? game.countries[game.playerCountryId]?.capitalTerritoryId ?? null,
        selectedUnitType: 'mbt',
        cameraTarget: game.selectedTerritoryId
          ? { territoryId: game.selectedTerritoryId, nonce: Date.now() }
          : null,
        notices: [],
        battleReport: null,
        tutorialStep: 0,
        lastSeenEventIndex: game.events.length,
        lastSeenBattleId: game.battles[0]?.id ?? null,
        lastAutosaveTick: game.tick,
        loading: false,
      });
      get().pushNotice('Партия загружена.', 'success');
      return true;
    } catch (error) {
      set({ loading: false });
      get().pushNotice(`Не удалось загрузить сохранение: ${(error as Error).message}`, 'danger');
      return false;
    }
  },

  saveGame: async (label) => {
    const game = get().game;
    if (!game) return false;
    const slot = label === 'Автосохранение' ? AUTO_SAVE_SLOT : `manual-${Date.now()}`;
    const country = game.countries[game.playerCountryId];
    const name = label ?? `${country?.name ?? 'Партия'} — ${formatGameDate(game.tick)}`;
    try {
      await writeSave(slot, name, game);
      await get().refreshSaves();
      if (slot !== AUTO_SAVE_SLOT) get().pushNotice('Партия сохранена.', 'success');
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
    set({ screen: 'menu', tutorialStep: 0, battleReport: null });
    void get().saveGame('Автосохранение');
    void get().refreshSaves();
  },

  advance: (dtMs) => {
    const { clock, game } = get();
    if (!clock || !game) return;
    const beforeEventId = game.nextIds.event;
    const beforeBattle = game.battles[0]?.id ?? null;
    const ticks = clock.advance(dtMs);
    if (ticks === 0) {
      if (game.status !== get().lastStatus) set({ lastStatus: game.status });
      return;
    }

    sanitizeCountryResources(game);
    const notices: Notice[] = [];
    const newEvents = game.events.filter((event) => Number(event.id.slice(1)) >= beforeEventId);
    const playerId = game.playerCountryId;
    for (const event of newEvents) {
      if (notices.length >= 3) break;
      const relevant =
        event.countryId === playerId ||
        event.previousOwnerId === playerId ||
        event.kind === 'victory';
      if (!relevant) continue;
      if (event.kind === 'system') continue;
      notices.push({
        id: `notice-${noticeCounter++}`,
        text: `${formatGameDate(event.tick)} · ${event.message}`,
        kind: event.kind === 'capture' ? 'success' : event.kind === 'battle' ? 'battle' : 'info',
      });
    }

    const newBattleId = game.battles[0]?.id ?? null;
    const battle = newBattleId && newBattleId !== beforeBattle ? game.battles[0] : null;
    const battleInvolvesPlayer =
      !!battle &&
      (battle.attackerCountry === playerId || battle.defenderCountry === playerId);

    const shouldOpenReport = battleInvolvesPlayer && !get().battleReport;
    if (shouldOpenReport && game.speed > 0) {
      // Reports cover the map, so the battle pauses the war until acknowledged.
      set({ resumeSpeed: game.speed });
      game.speed = 0;
    }

    set({
      revision: get().revision + 1,
      notices: [...get().notices, ...notices].slice(-4),
      lastSeenEventIndex: game.events.length,
      battleReport: shouldOpenReport ? battle : get().battleReport,
      lastStatus: game.status,
    });

    const autosave = get().settings.autosave;
    if (autosave && game.tick - get().lastAutosaveTick >= 30 && game.status === 'playing') {
      set({ lastAutosaveTick: game.tick });
      void get().saveGame('Автосохранение');
    }
    if (game.status !== 'playing') {
      void get().saveGame('Автосохранение');
    }
  },

  setSpeed: (speed) => {
    const game = get().game;
    if (!game) return;
    game.speed = speed;
    set({ revision: get().revision + 1 });
  },

  selectTerritory: (id) => set({ selectedTerritoryId: id }),

  focusTerritory: (id) =>
    set({
      selectedTerritoryId: id,
      cameraTarget: { territoryId: id, nonce: Date.now() },
    }),

  selectUnitType: (unit) => set({ selectedUnitType: unit }),

  sendArmy: (from, to, army) => {
    const game = get().game;
    if (!game) return false;
    const result = commandSendArmy(game, { countryId: game.playerCountryId, from, to, army });
    const notice = toResultNotice(result);
    if (notice) {
      set({ notices: [...get().notices, notice].slice(-4) });
      return false;
    }
    set({ revision: get().revision + 1 });
    return true;
  },

  queueUnit: (territoryId, unit) => {
    const game = get().game;
    if (!game) return false;
    const result = commandQueueUnit(game, { countryId: game.playerCountryId, territoryId, unit });
    const notice = toResultNotice(result);
    if (notice) {
      set({ notices: [...get().notices, notice].slice(-4) });
      return false;
    }
    const label = LAND_UNITS[unit].shortName;
    get().pushNotice(`Заказ принят: ${label}.`, 'info');
    set({ revision: get().revision + 1 });
    return true;
  },

  cancelProduction: (itemId) => {
    const game = get().game;
    if (!game) return;
    commandCancelProduction(game, { countryId: game.playerCountryId, itemId });
    set({ revision: get().revision + 1 });
  },

  upgradeEconomy: (territoryId) => {
    const game = get().game;
    if (!game) return;
    const result = commandUpgradeEconomy(game, { countryId: game.playerCountryId, territoryId });
    const notice = toResultNotice(result);
    if (notice) set({ notices: [...get().notices, notice].slice(-4) });
    set({ revision: get().revision + 1 });
  },

  declareWar: (target) => {
    const game = get().game;
    if (!game) return;
    const result = commandDeclareWar(game, { countryId: game.playerCountryId, target });
    const notice = toResultNotice(result);
    if (notice) set({ notices: [...get().notices, notice].slice(-4) });
    set({ revision: get().revision + 1 });
  },

  proposePeace: (target) => {
    const game = get().game;
    if (!game) return;
    const rng = createRng(game.rngState ^ game.tick ^ 0x9e37);
    const result = commandProposePeace(game, { countryId: game.playerCountryId, target }, rng);
    const notice = toResultNotice(result);
    if (notice) set({ notices: [...get().notices, notice].slice(-4) });
    else get().pushNotice('Мирный договор подписан.', 'success');
    set({ revision: get().revision + 1 });
  },

  pushNotice: (text, kind = 'info') =>
    set({ notices: [...get().notices, { id: `notice-${noticeCounter++}`, text, kind }].slice(-4) }),

  dismissNotice: (id) => set({ notices: get().notices.filter((notice) => notice.id !== id) }),

  closeBattleReport: () => {
    const resume = get().resumeSpeed;
    const game = get().game;
    if (game && resume && game.speed === 0) game.speed = resume;
    set({ battleReport: null, resumeSpeed: null, revision: get().revision + 1 });
  },

  openLastBattle: () => {
    const game = get().game;
    const playerId = game?.playerCountryId;
    const battle = game?.battles.find(
      (report) => report.attackerCountry === playerId || report.defenderCountry === playerId,
    );
    if (battle) set({ battleReport: battle });
  },

  setSetting: (key, value) => {
    const settings = { ...get().settings, [key]: value };
    persistSettings(settings);
    set({ settings, revision: get().revision + 1 });
  },

  startTutorial: () => set({ tutorialStep: 1 }),

  advanceTutorial: () => {
    const step = get().tutorialStep;
    if (step <= 0) return;
    if (step >= 6) {
      get().closeTutorial();
      return;
    }
    set({ tutorialStep: step + 1 });
  },

  closeTutorial: () => {
    try {
      localStorage.setItem(TUTORIAL_KEY, '1');
    } catch {
      // Ignore storage failures.
    }
    set({ tutorialStep: 0 });
  },

  toggleFullscreen: () => {
    const element = document.documentElement;
    if (!document.fullscreenElement) {
      void element.requestFullscreen?.().catch(() => undefined);
    } else {
      void document.exitFullscreen?.().catch(() => undefined);
    }
  },
}));

/** Preview helper used by the UI: income minus upkeep for the player. */
export function playerNetIncome(game: GameState): Resources {
  const country = game.countries[game.playerCountryId];
  return country ? country.income : { money: 0, metal: 0, oil: 0, energy: 0 };
}

export function resourceTone(value: number): 'positive' | 'negative' {
  return value >= 0 ? 'positive' : 'negative';
}

/** Used by "new game" to preview a random world before committing. */
export function previewWorld(seed: number) {
  return createWorld(seed);
}

export function addEventToState(game: GameState, message: string): void {
  pushEvent(game, 'system', message);
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, 0.55, 5);
}
