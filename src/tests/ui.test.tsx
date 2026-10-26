// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// Phaser needs WebGL and a real canvas; the scene is covered by the painter tests.
vi.mock('@/game/PhaserGame', () => ({
  createPhaserGame: () => ({ scale: { refresh: () => undefined }, destroy: () => undefined }),
}));
vi.mock('@/game/scenes/WorldScene', () => ({ WorldScene: class {} }));

import { useGameStore } from '@/store/gameStore';
import { useUiStore } from '@/ui/state/uiStore';
import { MainMenu } from '@/ui/menu/MainMenu';
import { CountrySelect } from '@/ui/menu/CountrySelect';
import { GameScreen } from '@/ui/hud/GameScreen';
import { LeftPanel } from '@/ui/hud/LeftPanel';
import { RightPanel } from '@/ui/hud/RightPanel';
import { TopBar } from '@/ui/hud/TopBar';
import { BottomBar } from '@/ui/hud/BottomBar';
import { MapOverlay } from '@/ui/hud/MapOverlay';
import { BattleReportModal } from '@/ui/hud/BattleReportModal';
import { VictoryModal } from '@/ui/hud/VictoryModal';
import { SendArmyDialog } from '@/ui/hud/SendArmyDialog';
import { Tutorial } from '@/ui/hud/Tutorial';
import { EventToasts } from '@/ui/hud/EventToasts';
import { HelpDialog, SavesDialog, SettingsDialog } from '@/ui/dialogs/Dialogs';
import { createGame } from '@/core/state/createGame';
import type { Difficulty } from '@/core/state/types';
import { runTick } from '@/core/sim/simulation';
import { commandQueueUnit, commandSendArmy, commandUpgradeEconomy } from '@/core/sim/commands';
import { makeArmy } from '@/core/units/army';
import { findOrderPath } from '@/core/sim/path';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function findButton(text: string): HTMLButtonElement | undefined {
  return ([...document.querySelectorAll('button')] as HTMLButtonElement[]).find(
    (button) => button.textContent?.trim() === text,
  );
}

function renderUi(node: React.ReactNode): string {
  container = document.createElement('div');
  document.body.appendChild(container);
  const localRoot = createRoot(container);
  root = localRoot;
  act(() => {
    localRoot.render(node);
  });
  return container.innerHTML;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

function installGame(difficulty: Difficulty = 'normal') {
  const game = createGame({ seed: 9091, playerCountryId: 'aquilonia', difficulty });
  useGameStore.setState({
    game,
    clock: null,
    screen: 'game',
    revision: 1,
    selectedTerritoryId: game.countries[game.playerCountryId]?.capitalTerritoryId ?? null,
    notices: [],
    battleReport: null,
    tutorialStep: 0,
    settings: { labels: true, effects: true, autosave: false },
  });
  return game;
}

describe('UI with real game data', () => {
  beforeEach(() => {
    useUiStore.setState({ dialog: null, leftOpen: false, rightOpen: false, });
  });

  it('renders the main menu and country selection', async () => {
    useGameStore.setState({ screen: 'menu', saves: [], game: null });
    const menu = renderUi(<MainMenu />);
    expect(menu).toContain('Мировое');
    expect(menu).toContain('Новая игра');
    expect(menu).toContain('Продолжить');
    act(() => root?.unmount());
    root = null;
    container?.remove();

    const select = renderUi(<CountrySelect />);
    expect(select).toContain('Выбор государства');
    expect(select).toContain('Аквилония');
    expect(select).toContain('Начать кампанию');
    expect(select).toContain('Сложность ИИ');
    await useGameStore.getState().refreshSaves();
  });

  it('renders the full HUD for an owned territory', () => {
    const game = installGame();
    const markup = renderUi(
      <>
        <TopBar onToggleLeft={() => undefined} onToggleRight={() => undefined} />
        <LeftPanel />
        <RightPanel />
        <BottomBar onToggleLeft={() => undefined} onToggleRight={() => undefined} />
        <MapOverlay />
        <Tutorial />
        <EventToasts />
      </>,
    );
    const capital = game.world.territories.find(
      (territory) => territory.id === game.countries[game.playerCountryId]!.capitalTerritoryId,
    )!;
    expect(markup).toContain('Республика Аквилония');
    expect(markup).toContain(capital.name);
    expect(markup).toContain('Гарнизон');
    expect(markup).toContain('Перебросить');
    expect(markup).toContain('Производство');
    expect(markup).toContain('ОБТ');
    expect(markup).not.toContain('undefined');
  });

  it('produces, develops and attacks from the right panel', () => {
    const game = installGame();
    const player = game.countries[game.playerCountryId]!;
    player.resources = { money: 5000, metal: 5000, oil: 5000, energy: 5000 };
    const capital = player.capitalTerritoryId!;
    const productionBefore = game.production.length;
    const levelBefore = game.territories[capital]!.economyLevel;

    const markup = renderUi(<RightPanel />);
    expect(markup).toContain('Управление');
    expect(markup).toContain('Развивать');
    act(() => {
      const cards = [...document.querySelectorAll('button.unit-card')] as HTMLButtonElement[];
      expect(cards.length).toBeGreaterThan(0);
      const enabled = cards.find((card) => !card.disabled);
      expect(enabled).toBeDefined();
      enabled!.click();
    });
    expect(game.production.length).toBe(productionBefore + 1);

    act(() => {
      const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
      const upgrade = buttons.find((button) => button.textContent?.includes('Развивать'));
      expect(upgrade).toBeDefined();
      upgrade!.click();
    });
    expect(game.territories[capital]!.economyLevel).toBe(Math.min(3, levelBefore + 1));
  });

  it('opens the send dialog and dispatches troops', () => {
    const game = installGame();
    const player = game.countries[game.playerCountryId]!;
    const capital = player.capitalTerritoryId!;
    game.territories[capital]!.garrison = makeArmy({ mbt: 4 });
    act(() => {
      renderUi(<GameScreen />);
    });
    act(() => {
      const buttons = [...document.querySelectorAll('button')] as HTMLButtonElement[];
      const send = buttons.find((button) => button.textContent?.trim() === 'Перебросить');
      expect(send).toBeDefined();
      send!.click();
    });
    expect(document.body.innerHTML).toContain('Переброска войск');

    act(() => {
      const all = [...document.querySelectorAll('button')] as HTMLButtonElement[];
      const allButton = all.find((button) => button.textContent?.trim() === 'Все');
      allButton?.click();
    });
    act(() => {
      const all = [...document.querySelectorAll('button')] as HTMLButtonElement[];
      const confirm = all.find((button) => button.textContent?.trim() === 'Отправить приказ');
      expect(confirm?.disabled).toBe(false);
      confirm!.click();
    });
    expect(Object.values(game.groups).length).toBe(1);
  });

  it('renders the battle report modal after a real fight', () => {
    const game = installGame();
    const playerId = game.playerCountryId;
    const player = game.countries[playerId]!;
    const source = player.capitalTerritoryId!;
    const target = game.world.territories.find(
      (territory) =>
        game.territories[territory.id]!.owner !== playerId &&
        !!findOrderPath(game, playerId, source, territory.id),
    )!;
    game.territories[source]!.garrison = makeArmy({ mbt: 6, ifv: 3 });
    commandSendArmy(game, { countryId: playerId, from: source, to: target.id, army: makeArmy({ mbt: 6 }) });
    let playerReport = null as (typeof game.battles)[number] | null;
    for (let i = 0; i < 300 && !playerReport; i += 1) {
      runTick(game);
      playerReport =
        game.battles.find(
          (report) => report.attackerCountry === playerId || report.defenderCountry === playerId,
        ) ?? null;
    }
    expect(playerReport).not.toBeNull();

    useGameStore.setState({ battleReport: playerReport! });
    const markup = renderUi(<BattleReportModal />);
    expect(markup).toContain('Боевое донесение');
    expect(markup).toContain('Раунд');
    expect(markup).toContain(playerReport!.territoryName);
  });

  it('renders settings, help, saves and the send dialog', () => {
    installGame();
    const markup = renderUi(
      <>
        <SettingsDialog onClose={() => undefined} />
        <HelpDialog onClose={() => undefined} />
        <SavesDialog onClose={() => undefined} onDelete={() => undefined} />
        <SendArmyDialog onClose={() => undefined} />
      </>,
    );
    expect(markup).toContain('Настройки');
    expect(markup).toContain('Обучение');
    expect(markup).toContain('Сохранения');
    expect(markup).toContain('Переброска войск');
  });

  it('renders victory and defeat screens', () => {
    const game = installGame();
    game.status = 'victory';
    game.victory = {
      kind: 'domination',
      countryId: game.playerCountryId,
      title: 'Мировое господство',
      description: 'Все территории под контролем.',
    };
    const markup = renderUi(<VictoryModal />);
    expect(markup).toContain('Победа');
    expect(markup).toContain('Мировое господство');

    act(() => root?.unmount());
    root = null;
    container?.remove();
    game.status = 'defeat';
    useGameStore.setState({ revision: 12 });
    const defeat = renderUi(<VictoryModal />);
    expect(defeat).toContain('Поражение');
  });

  it('shows foreign territory actions for hostile land', () => {
    const game = installGame('hard');
    const playerId = game.playerCountryId;
    const foreign = game.world.territories.find(
      (territory) => game.territories[territory.id]!.owner !== playerId,
    )!;
    useGameStore.setState({ selectedTerritoryId: foreign.id });
    const markup = renderUi(
      <>
        <RightPanel />
        <BottomBar onToggleLeft={() => undefined} onToggleRight={() => undefined} />
      </>,
    );
    expect(markup).toContain(foreign.name);
    expect(markup).toContain('Атаковать');
    expect(markup).toContain('Оборона');
  });

  it('keeps working through a policy tick loop and re-renders', () => {
    const game = installGame();
    const player = game.countries[game.playerCountryId]!;
    player.resources = { money: 3000, metal: 3000, oil: 3000, energy: 3000 };
    act(() => {
      commandQueueUnit(game, {
        countryId: player.id,
        territoryId: player.capitalTerritoryId!,
        unit: 'apc',
      });
      commandUpgradeEconomy(game, { countryId: player.id, territoryId: player.capitalTerritoryId! });
      for (let i = 0; i < 40; i += 1) runTick(game);
      useGameStore.setState({ revision: 20 });
    });
    const markup = renderUi(<LeftPanel />);
    expect(markup).toContain('Армия');
    expect(markup).toContain('Гарнизоны');
    expect(markup).toContain('Производство');
    // the queued APC finished during the tick loop and joined the garrison
    expect(game.production.filter((item) => item.country === player.id).length).toBe(0);
    act(() => {
      findButton('Экономика')?.click();
    });
    expect(document.body.innerHTML).toContain('Инфраструктура');
  });

  it('renders the empty selection state and tutorial steps', () => {
    installGame();
    useGameStore.setState({ selectedTerritoryId: null, tutorialStep: 2 });
    const markup = renderUi(
      <>
        <RightPanel />
        <Tutorial />
      </>,
    );
    expect(markup).toContain('Кликните по региону');
    expect(markup).toContain('Обучение');
  });
});
