import { useGameStore } from '@/store/gameStore';
import { Modal } from '@/ui/components/Modal';
import { formatGameDate } from '@/core/time/gameDate';
import { ownedTerritories, playerCountry, useGameSnapshot } from '@/ui/helpers/game';

export function VictoryModal() {
  const game = useGameSnapshot();
  const setScreen = useGameStore((state) => state.setScreen);
  const exitToMenu = useGameStore((state) => state.exitToMenu);
  if (!game || game.status === 'playing') return null;
  const player = playerCountry(game);
  const victory = game.victory;
  const won = game.status === 'victory';

  return (
    <Modal
      title={won ? 'Победа' : 'Поражение'}
      onClose={exitToMenu}
      closeOnBackdrop={false}
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
      <div
        style={{
          padding: 14,
          border: `2px solid ${won ? '#3c7a45' : '#8a3a32'}`,
          background: won
            ? 'linear-gradient(135deg, rgba(32,72,40,.85), rgba(10,20,33,.9))'
            : 'linear-gradient(135deg, rgba(74,26,22,.85), rgba(10,20,33,.9))',
        }}
      >
        <div className="menu__eyebrow" style={{ color: won ? 'var(--green)' : 'var(--red)' }}>
          {won ? 'Кампания завершена' : 'Кампания провалена'}
        </div>
        <h3 style={{ margin: '6px 0', fontSize: 20 }}>{victory?.title ?? (won ? 'Победа' : 'Поражение')}</h3>
        <p className="small muted" style={{ margin: 0 }}>
          {victory?.description ?? 'Партия завершена.'}
        </p>
      </div>
      <div className="stack small">
        <div className="row row--between">
          <span className="muted">Дата окончания</span>
          <strong>{formatGameDate(game.tick)}</strong>
        </div>
        <div className="row row--between">
          <span className="muted">Территорий под контролем</span>
          <strong>
            {player ? ownedTerritories(game, player.id).length : 0} / {game.world.territories.length}
          </strong>
        </div>
        <div className="row row--between">
          <span className="muted">Побед в сражениях</span>
          <strong>{player?.stats.battlesWon ?? 0}</strong>
        </div>
        <div className="row row--between">
          <span className="muted">Захвачено территорий</span>
          <strong>{player?.stats.captured ?? 0}</strong>
        </div>
      </div>
      <div className="tiny muted">
        Партия сохранена в автосейве — можно вернуться к ней позже или начать новую кампанию.
      </div>
    </Modal>
  );
}
