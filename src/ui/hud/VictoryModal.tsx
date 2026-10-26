import { useGameStore } from '@/store/gameStore';
import { Modal } from '@/ui/components/Modal';
import { formatGameDate } from '@/core/time/gameDate';
import { formatPopulation } from '@/ui/helpers/format';
import { playerCountry, playerStats } from '@/ui/helpers/game';

export function VictoryModal() {
  const game = useGameStore((state) => state.game);
  const exitToMenu = useGameStore((state) => state.exitToMenu);
  const setScreen = useGameStore((state) => state.setScreen);
  const country = playerCountry(game);
  if (!game || game.status === 'playing') return null;
  const won = game.status === 'victory';
  const stats = playerStats(game);

  return (
    <Modal
      title={won ? 'Победа' : 'Поражение'}
      onClose={exitToMenu}
      size="small"
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={exitToMenu}>
            В главное меню
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setScreen('countrySelect')}>
            Новая кампания
          </button>
        </>
      }
    >
      <div className={`victory victory--${won ? 'win' : 'loss'}`}>
        <div className="victory__eyebrow">{won ? 'Кампания завершена' : 'Кампания провалена'}</div>
        <h3>{game.victory?.title ?? (won ? 'Победа' : 'Поражение')}</h3>
        <p>{game.victory?.description ?? 'Партия окончена.'}</p>
      </div>
      <dl className="facts">
        <div>
          <dt>Государство</dt>
          <dd>{country?.name ?? '—'}</dd>
        </div>
        <div>
          <dt>Дата</dt>
          <dd>{formatGameDate(game.tick)}</dd>
        </div>
        <div>
          <dt>Земли</dt>
          <dd>{Math.round(stats.share * 1000) / 10}%</dd>
        </div>
        <div>
          <dt>Население</dt>
          <dd>{formatPopulation(stats.population)}</dd>
        </div>
        <div>
          <dt>Захвачено клеток</dt>
          <dd>{country?.stats.captured ?? 0}</dd>
        </div>
        <div>
          <dt>Построено зданий</dt>
          <dd>{country?.stats.built ?? 0}</dd>
        </div>
      </dl>
    </Modal>
  );
}
