// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { COUNTRIES } from '@/data/countries';
import { createGame } from '@/core/state/createGame';
import { useGameStore } from '@/store/gameStore';
import { BottomPanel } from '@/ui/hud/BottomPanel';
import { MainMenu } from '@/ui/menu/MainMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(element: React.ReactElement): void {
  act(() => {
    root.render(element);
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll('button')];
  const found = buttons.find((button) => (button.textContent ?? '').includes(text));
  if (!found) throw new Error(`Кнопка «${text}» не найдена: ${buttons.map((b) => b.textContent).join(' | ')}`);
  return found as HTMLButtonElement;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  act(() => {
    useGameStore.setState({
      screen: 'menu',
      game: null,
      clock: null,
      saves: [],
      notices: [],
      selectedTerritoryId: null,
      buildingChoice: null,
      transferFrom: null,
      pendingCountry: 'aquilonia',
    });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('interface', () => {
  it('opens the new campaign flow from the main menu', () => {
    render(<App />);
    expect(container.textContent).toContain('МИРОВОЕ');
    expect(container.textContent).toContain('Пиксельная военная стратегия');

    act(() => buttonByText('Новая игра').click());
    expect(useGameStore.getState().screen).toBe('countrySelect');
    expect(container.textContent).toContain('Выбор государства');
  });

  it('shows every country with its bonus and starts the chosen one', () => {
    render(<App />);
    act(() => buttonByText('Новая игра').click());

    for (const country of COUNTRIES) expect(container.textContent).toContain(country.name);
    for (const country of COUNTRIES) expect(container.textContent).toContain(country.bonus.name);
    expect(container.querySelectorAll('.country')).toHaveLength(COUNTRIES.length);

    const draconia = COUNTRIES.find((country) => country.id === 'draconia')!;
    act(() => buttonByText(draconia.name).click());
    expect(useGameStore.getState().pendingCountry).toBe('draconia');

    act(() => buttonByText('Начать кампанию').click());
    const state = useGameStore.getState();
    expect(state.screen).toBe('game');
    expect(state.game).not.toBeNull();
    expect(state.game!.playerCountryId).toBe('draconia');
    expect(state.selectedTerritoryId).toBe(state.game!.countries.draconia!.capitalTerritoryId);
  });

  it('has a single bottom panel with the three tabs', () => {
    const game = createGame({ seed: 31337, playerCountryId: 'aquilonia', difficulty: 'normal' });
    useGameStore.setState({
      game,
      selectedTerritoryId: game.countries.aquilonia!.capitalTerritoryId,
      screen: 'game',
    });
    render(<BottomPanel />);

    const tabs = [...container.querySelectorAll('.tab')].map((tab) => tab.textContent);
    expect(tabs).toEqual(['Экономика', 'Оружие', 'Безопасность']);
    expect(container.querySelectorAll('.bottom')).toHaveLength(1);

    // Economy tab: the three profit structures.
    expect(container.textContent).toContain('Завод');
    expect(container.textContent).toContain('Город');
    expect(container.textContent).toContain('Морской порт');
    expect(container.textContent).toContain('₽');

    act(() => buttonByText('Оружие').click());
    expect(container.textContent).toContain('Ракетная установка');
    expect(container.textContent).toContain('Завод сборки танков');
    expect(container.textContent).toContain('Взлётная площадка');

    act(() => buttonByText('Безопасность').click());
    expect(container.textContent).toContain('ПВО');
    expect(container.textContent).toContain('Баррикада');
    expect(container.textContent).toContain('радиус');
  });

  it('places a chosen structure on the selected territory and charges for it', () => {
    const game = createGame({ seed: 31337, playerCountryId: 'aquilonia', difficulty: 'normal' });
    game.countries.aquilonia!.money = 5000;
    useGameStore.setState({
      game,
      selectedTerritoryId: game.countries.aquilonia!.capitalTerritoryId,
      screen: 'game',
      buildingChoice: null,
    });
    render(<BottomPanel />);

    act(() => buttonByText('Город').click());
    expect(useGameStore.getState().buildingChoice).toBe('city');
    expect(container.textContent).toContain('кликните по территории');

    const moneyBefore = game.countries.aquilonia!.money;
    let result = { ok: false } as { ok: boolean };
    act(() => {
      result = useGameStore.getState().buildHere(useGameStore.getState().selectedTerritoryId!);
    });
    expect(result.ok).toBe(true);
    expect(game.countries.aquilonia!.money).toBeLessThan(moneyBefore);
    const capital = game.territories[game.countries.aquilonia!.capitalTerritoryId!]!;
    expect(capital.buildings.some((building) => building.kind === 'city')).toBe(true);

    const notice = useGameStore.getState().notices.at(-1);
    expect(notice?.text).toContain('Город');
  });

  it('refuses to build without a selected structure', () => {
    const game = createGame({ seed: 31337, playerCountryId: 'aquilonia', difficulty: 'normal' });
    useGameStore.setState({ game, selectedTerritoryId: game.countries.aquilonia!.capitalTerritoryId });
    const result = useGameStore.getState().buildHere(game.countries.aquilonia!.capitalTerritoryId!);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('здание');
  });

  it('shows the army and the recruit action on an own territory', () => {
    const game = createGame({ seed: 31337, playerCountryId: 'aquilonia', difficulty: 'normal' });
    useGameStore.setState({
      game,
      selectedTerritoryId: game.countries.aquilonia!.capitalTerritoryId,
      buildingChoice: null,
    });
    render(<BottomPanel />);
    expect(container.textContent).toContain('Армия');
    expect(container.textContent).toContain('Оборона');
    expect(buttonByText('Призвать').disabled).toBe(false);

    const capital = game.territories[game.countries.aquilonia!.capitalTerritoryId!]!;
    const armyBefore = capital.army;
    act(() => buttonByText('Призвать').click());
    expect(capital.army).toBeGreaterThan(armyBefore);
  });

  it('offers war and peace on foreign territories', () => {
    const game = createGame({ seed: 31337, playerCountryId: 'aquilonia', difficulty: 'normal' });
    const foreign = Object.values(game.territories).find((t) => t.owner === 'draconia')!;
    useGameStore.setState({ game, selectedTerritoryId: foreign.id, buildingChoice: null });
    render(<BottomPanel />);
    expect(container.textContent).toContain('Дракония');
    expect(() => buttonByText('Призвать')).toThrow();

    act(() => buttonByText('Объявить войну').click());
    expect(game.countries.aquilonia!.warWith).toContain('draconia');
    expect(game.countries.draconia!.warWith).toContain('aquilonia');
    expect(container.textContent).toContain('война');

    act(() => buttonByText('Мир').click());
    expect(game.countries.aquilonia!.warWith).not.toContain('draconia');
  });

  it('explains the rules from the menu', () => {
    render(<MainMenu />);
    act(() => buttonByText('Как играть').click());
    expect(container.textContent).toContain('Жизни');
    expect(container.textContent).toContain('клетк');
  });
});
