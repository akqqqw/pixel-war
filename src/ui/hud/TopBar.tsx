import { useGameStore } from '@/store/gameStore';
import { formatArmy, formatMoney, formatPopulation, formatSigned } from '@/ui/helpers/format';
import { playerCountry, playerStats } from '@/ui/helpers/game';
import type { GameSpeed } from '@/core/state/types';

const SPEEDS: { value: GameSpeed; label: string; title: string }[] = [
  { value: 1, label: '×1', title: 'Обычная скорость' },
  { value: 2, label: '×2', title: 'Ускорение ×2' },
  { value: 4, label: '×4', title: 'Ускорение ×4' },
];

interface TopBarProps {
  onMenu: () => void;
}

/** One slim translucent strip: money, people, army, land share, pause. */
export function TopBar({ onMenu }: TopBarProps) {
  const game = useGameStore((state) => state.game);
  const revision = useGameStore((state) => state.revision);
  const setSpeed = useGameStore((state) => state.setSpeed);
  const togglePause = useGameStore((state) => state.togglePause);
  const setSound = useGameStore((state) => state.setSound);
  const soundOn = useGameStore((state) => state.settings.sound);
  void revision;

  const country = playerCountry(game);
  const stats = playerStats(game);
  if (!game || !country) return null;
  const paused = game.speed === 0;

  return (
    <header className="topbar">
      <div className="topbar__country" title={country.name}>
        <span className="topbar__flag" style={{ background: country.color }} />
        <span className="topbar__name">{country.shortName}</span>
      </div>

      <div className="topbar__stats">
        <span className="stat" title={`Казна. Доход ${formatSigned(country.income)} в секунду`}>
          <span className="stat__icon">💰</span>
          <strong>{formatMoney(stats.money)}</strong>
          <span className={country.income >= 0 ? 'stat__delta stat__delta--up' : 'stat__delta stat__delta--down'}>
            {formatSigned(country.income, 0)}
          </span>
        </span>
        <span className="stat" title="Население государства">
          <span className="stat__icon">👥</span>
          <strong>{formatPopulation(stats.population)}</strong>
        </span>
        <span className="stat" title="Армия в клетках">
          <span className="stat__icon">⚔️</span>
          <strong>{formatArmy(stats.army)}</strong>
        </span>
        <span className="stat" title="Доля земли">
          <span className="stat__icon">🌍</span>
          <strong>{Math.round(stats.share * 1000) / 10}%</strong>
        </span>
        {stats.tanks > 0 ? (
          <span className="stat stat--dim" title="Танки: усиливают атаку и оборону">
            <span className="stat__icon">🚜</span>
            <strong>{formatArmy(stats.tanks)}</strong>
          </span>
        ) : null}
        {stats.aircraft > 0 ? (
          <span className="stat stat--dim" title="Самолёты для авиаударов">
            <span className="stat__icon">✈</span>
            <strong>{formatArmy(stats.aircraft)}</strong>
          </span>
        ) : null}
      </div>

      <div className="topbar__right">
        <button
          type="button"
          className={`icon-btn ${paused ? 'icon-btn--active' : ''}`}
          onClick={togglePause}
          title={paused ? 'Продолжить (пробел)' : 'Пауза (пробел)'}
        >
          {paused ? '▶' : '❚❚'}
        </button>
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
        <button
          type="button"
          className={`icon-btn ${soundOn ? '' : 'icon-btn--muted'}`}
          onClick={() => setSound(!soundOn)}
          title={soundOn ? 'Выключить звук' : 'Включить звук'}
          aria-pressed={soundOn}
        >
          {soundOn ? '🔊' : '🔇'}
        </button>
        <button type="button" className="icon-btn" onClick={onMenu} title="Меню и сохранения">
          ☰
        </button>
      </div>
    </header>
  );
}
