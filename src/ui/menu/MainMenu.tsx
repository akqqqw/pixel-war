import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { HelpDialog } from '@/ui/hud/HelpDialog';
import { formatGameDate } from '@/core/time/gameDate';

export function MainMenu() {
  const saves = useGameStore((state) => state.saves);
  const loading = useGameStore((state) => state.loading);
  const setScreen = useGameStore((state) => state.setScreen);
  const continueGame = useGameStore((state) => state.continueGame);
  const [helpOpen, setHelpOpen] = useState(false);
  const latest = saves.find((save) => save.slot === 'auto') ?? saves[0];

  return (
    <main className="menu">
      <div className="menu__inner">
        <p className="menu__eyebrow">Пиксельная военная стратегия</p>
        <h1 className="menu__title">
          PIXEL
          <br />
          WORLD WAR
        </h1>
        <p className="menu__subtitle">
          Экономика, оружие и безопасность. Ведите армию по клеткам, стройте города и заводы, держите оборону.
        </p>

        <div className="menu__buttons">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => setScreen('countrySelect')}>
            Новая игра
          </button>
          <button
            type="button"
            className="btn btn--lg"
            disabled={!latest || loading}
            onClick={() => void continueGame()}
            title={latest ? `Продолжить: ${latest.label}` : 'Нет сохранений'}
          >
            Продолжить
          </button>
          <button type="button" className="btn btn--ghost btn--lg" onClick={() => setHelpOpen(true)}>
            Как играть
          </button>
        </div>

        {latest ? (
          <p className="tiny muted menu__save">
            Последнее сохранение: {latest.label} · {formatGameDate(latest.tick)} · клеток {latest.ownedCells}
          </p>
        ) : (
          <p className="tiny muted menu__save">Сохранений пока нет — начните кампанию.</p>
        )}
      </div>
      <footer className="menu__foot">Три государства · тысячи клеток · полностью offline</footer>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </main>
  );
}
