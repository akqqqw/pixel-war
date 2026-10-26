// @vitest-environment jsdom
import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/App';
import { useGameStore } from '@/store/gameStore';
import { TopBar } from '@/ui/hud/TopBar';
import { BottomPanel } from '@/ui/hud/BottomPanel';
import { CellPanel } from '@/ui/hud/CellPanel';
import { CellTooltip } from '@/ui/hud/CellTooltip';
import { formatMoney } from '@/ui/helpers/format';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(element: ReactElement): void {
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

function startGame(): void {
  act(() => {
    useGameStore.getState().startNewGame('aquilonia', 'normal');
  });
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
      selectedCell: null,
      buildingChoice: null,
      orderDraft: null,
      strikeBuildingId: null,
      pendingCountry: 'aquilonia',
      loading: false,
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
    expect(container.textContent).toContain('PIXEL');
    expect(container.textContent).toContain('WORLD WAR');
    act(() => {
      buttonByText('Новая игра').click();
    });
    expect(container.textContent).toContain('Выбор государства');
    act(() => {
      buttonByText('Начать кампанию').click();
    });
    expect(useGameStore.getState().screen).toBe('game');
  });

  it('shows the four numbers and the pause button in the top bar', () => {
    startGame();
    render(<TopBar onMenu={() => undefined} />);
    const text = container.textContent ?? '';
    const stats = useGameStore.getState().game!;
    expect(text).toContain(formatMoney(stats.countries[stats.playerCountryId]!.money));
    expect(text).toContain('%');
    expect(text).toContain('💰');
    expect(text).toContain('⚔️');
    act(() => {
      buttonByText('❚❚').click();
    });
    expect(useGameStore.getState().game!.speed).toBe(0);
    act(() => {
      buttonByText('▶').click();
    });
    expect(useGameStore.getState().game!.speed).toBe(1);
  });

  it('opens a building tab and arms the placement mode', () => {
    startGame();
    render(<BottomPanel />);
    expect(container.querySelector('.strip')).toBeNull();
    act(() => {
      buttonByText('Экономика').click();
    });
    expect(container.textContent).toContain('Завод');
    expect(container.textContent).toContain('Морской порт');
    act(() => {
      buttonByText('Завод').click();
    });
    expect(useGameStore.getState().buildingChoice).toBe('factory');
    act(() => {
      buttonByText('Оружие').click();
    });
    expect(useGameStore.getState().buildingChoice).toBeNull();
    expect(container.textContent).toContain('Ракетная установка');
    act(() => {
      buttonByText('Безопасность').click();
    });
    expect(container.textContent).toContain('ПВО');
    expect(container.textContent).toContain('Баррикада');
    act(() => {
      buttonByText('Безопасность').click();
    });
    expect(container.querySelector('.strip')).toBeNull();
  });

  it('shows a one-line tooltip for the cell under the pointer', () => {
    startGame();
    const game = useGameStore.getState().game!;
    const index = game.countryOrder.indexOf(game.playerCountryId);
    let cell = -1;
    for (let c = 0; c < game.cellOwner.length && cell < 0; c += 1) {
      if (game.cellOwner[c] === index) cell = c;
    }
    render(<CellTooltip />);
    expect(container.querySelector('.cell-tip')).toBeNull();
    act(() => {
      useGameStore.getState().setHoverCell(cell);
    });
    const tip = container.querySelector('.cell-tip');
    expect(tip).not.toBeNull();
    expect(tip!.textContent).toContain('⚔️');
    // Selecting the same cell hides the duplicate readout.
    act(() => {
      useGameStore.getState().selectCell(cell);
    });
    expect(container.querySelector('.cell-tip')).toBeNull();
    // Water is reported as sea.
    const water = Array.from({ length: game.cellOwner.length }, (_, i) => i).find(
      (i) => (game.world.tileTerritory[i] ?? -1) < 0,
    )!;
    act(() => {
      useGameStore.getState().selectCell(null);
      useGameStore.getState().setHoverCell(water);
    });
    expect(container.querySelector('.cell-tip')!.textContent).toContain('Море');
  });

  it('describes the selected cell in a compact panel', () => {
    startGame();
    const game = useGameStore.getState().game!;
    const index = game.countryOrder.indexOf(game.playerCountryId);
    let cell = -1;
    for (let c = 0; c < game.cellOwner.length && cell < 0; c += 1) {
      if (game.cellOwner[c] !== index) continue;
      const regionIndex = game.world.tileTerritory[c] ?? -1;
      const region = regionIndex >= 0 ? game.regions[game.world.territories[regionIndex]!.id] : null;
      if (region?.buildings.some((building) => building.cell === c)) continue;
      cell = c;
    }
    expect(cell).toBeGreaterThanOrEqual(0);
    act(() => {
      useGameStore.getState().selectCell(cell);
    });
    render(<CellPanel />);
    expect(container.querySelector('.cell-panel')).not.toBeNull();
    expect(container.textContent).toContain('Мобилизация');
    act(() => {
      buttonByText('✕').click();
    });
    expect(useGameStore.getState().selectedCell).toBeNull();
  });
});
