import { useGameStore } from '@/store/gameStore';
import { formatGameDate } from '@/core/time/gameDate';
import { formatMoney, formatPopulation, formatSigned } from '@/ui/helpers/format';
import { playerCountry, playerTotals } from '@/ui/helpers/game';
import type { GameSpeed } from '@/core/state/types';

const SPEEDS: { value: GameSpeed; label: string; title: string }[] = [
  { value: 0, label: '❚❚', title: 'Пауза' },
  { value: 1, label: '×1', title: 'Обычная скорость' },
  { value: 2, label: '×2', title: 'Ускорение ×2' },
  { value: 4, label: '×4', title: 'Ускорение ×4' },
];

interface TopBarProps {
  onMenu: () => void;
}

export function TopBar({ onMenu }: TopBarProps) {
  const game = useGameStore((state) => state.game);
  const revision = useGameStore((state) => state.revision);
  const setSpeed = useGameStore((state) => state.setSpeed);
  const country = playerCountry(game);
  const totals = playerTotals(game);
  void revision;
  if (!game || !country) return null;

  return (
    <header className="topbar">
      <div className="topbar__country">
        <span className="topbar__flag" style={{ background: country.color }} />
        <span className="topbar__name">{country.shortName}</span>
      </div>

      <div className="topbar__stats">
        <span className="stat" title="Деньги и доход в час">
          <span className="stat__label">₽</span>
          <strong>{formatMoney(country.money)}</strong>
          <span className={country.income >= 0 ? 'stat__delta stat__delta--up' : 'stat__delta stat__delta--down'}>
            {formatSigned(country.income)}
          </span>
        </span>
        <span className="stat" title="Население">
          <span className="stat__label">Люди</span>
          <strong>{formatPopulation(totals.population)}</strong>
        </span>
        <span className="stat" title="Армия">
          <span className="stat__label">Армия</span>
          <strong>{Math.round(totals.army)}</strong>
        </span>
        <span className="stat stat--dim" title="Территории">
          <span className="stat__label">Земли</span>
          <strong>
            {totals.territories}/{game.world.territories.length}
          </strong>
        </span>
      </div>

      <div className="topbar__right">
        <span className="topbar__date">{formatGameDate(game.tick)}</span>
        <div className="speeds">
          {SPEEDS.map((speed) => (
            <button
              key={speed.value}
              type="button"
              title={speed.title}
              className={`speed ${game.speed === speed.value ? 'speed--active' : ''}`}
              onClick={() => setSpeed(speed.value)}
            >
              {speed.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onMenu} title="Меню партии">
          ☰
        </button>
      </div>
    </header>
  );
}
