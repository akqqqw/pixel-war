import { ACHIEVEMENTS } from '@/services/achievements';
import { localBestScore, platform } from '@/services/platform';
import { useGameStore } from '@/store/gameStore';
import { territoryShare } from '@/core/sim/effects';

/** Compact goal list inside the party menu — no separate screen. */
export function Achievements() {
  const unlocked = useGameStore((state) => state.achievements);
  const game = useGameStore((state) => state.game);
  const done = new Set(unlocked);
  const share = game ? Math.round(territoryShare(game, game.playerCountryId) * 1000) / 10 : 0;
  const best = localBestScore('land_share');

  return (
    <div className="menu-section">
      <div className="menu-section__title">
        Достижения · {done.size}/{ACHIEVEMENTS.length}
      </div>
      <ul className="achievements">
        {ACHIEVEMENTS.map((entry) => {
          const has = done.has(entry.id);
          return (
            <li key={entry.id} className={`achievement ${has ? 'achievement--done' : ''}`} title={entry.description}>
              <span className="achievement__mark">{has ? '✓' : entry.mark}</span>
              <span className="achievement__body">
                <span className="achievement__name">{entry.name}</span>
                <span className="tiny muted">{entry.description}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="achievements__board tiny muted">
        Земля в этой партии: {share}% · лучший результат: {best}% ·{' '}
        {platform.hasCloud ? 'облачные сохранения включены' : 'локальные сохранения'}
      </div>
    </div>
  );
}
