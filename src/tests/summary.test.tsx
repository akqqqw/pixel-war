// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Sparkline } from '@/ui/components/Sparkline';
import { VictoryModal } from '@/ui/hud/VictoryModal';
import { runTick } from '@/core/sim/simulation';
import { useGameStore } from '@/store/gameStore';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function render(element: React.ReactElement): void {
  act(() => {
    root.render(element);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  localStorage.clear();
  act(() => {
    useGameStore.setState({ screen: 'menu', game: null, clock: null, saves: [], notices: [] });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('campaign summary', () => {
  it('draws one line per country', () => {
    const samples = Array.from({ length: 6 }, (_, index) => ({
      tick: index * 20,
      share: [0.4 - index * 0.02, 0.3, 0.3 + index * 0.02],
    }));
    render(
      <Sparkline
        samples={samples}
        series={[
          { id: 'a', color: '#f00', highlight: true, alive: true },
          { id: 'b', color: '#0f0', highlight: false, alive: false },
          { id: 'c', color: '#00f', highlight: false, alive: true },
        ]}
      />,
    );
    expect(container.querySelectorAll('polyline')).toHaveLength(3);
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe('');
  });

  it('asks for more history instead of drawing an empty chart', () => {
    render(<Sparkline samples={[]} series={[{ id: 'a', color: '#f00', highlight: true, alive: true }]} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container.textContent).toContain('График появится');
  });

  it('shows the graph and the standings when the campaign is over', () => {
    act(() => {
      useGameStore.getState().startNewGame('aquilonia', 'normal');
    });
    const game = useGameStore.getState().game!;
    for (let i = 0; i < 45; i += 1) runTick(game);
    game.status = 'victory';
    game.victory = {
      kind: 'military',
      countryId: game.playerCountryId,
      title: 'Военная победа',
      description: 'Все вражеские государства уничтожены.',
    };
    act(() => {
      useGameStore.setState({ revision: useGameStore.getState().revision + 1 });
    });
    render(<VictoryModal />);
    expect(container.textContent).toContain('Военная победа');
    expect(container.querySelector('.modal')).not.toBeNull();
    expect(container.querySelectorAll('polyline').length).toBe(game.countryOrder.length);
    expect(container.textContent).toContain('Захвачено клеток');
    expect(container.querySelector('.victory__legend')!.textContent).toContain('%');
  });
});
