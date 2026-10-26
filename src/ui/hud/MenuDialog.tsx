import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Modal } from '@/ui/components/Modal';
import { formatGameDate } from '@/core/time/gameDate';
import { Sparkline } from '@/ui/components/Sparkline';
import { countCells } from '@/core/sim/regions';
import { territoryShare } from '@/core/sim/effects';

interface MenuDialogProps {
  onClose: () => void;
  onExit: () => void;
}

export function MenuDialog({ onClose, onExit }: MenuDialogProps) {
  const saves = useGameStore((state) => state.saves);
  const settings = useGameStore((state) => state.settings);
  const setAutosave = useGameStore((state) => state.setAutosave);
  const setSound = useGameStore((state) => state.setSound);
  const saveGame = useGameStore((state) => state.saveGame);
  const loadGame = useGameStore((state) => state.loadGame);
  const deleteSave = useGameStore((state) => state.deleteSave);
  const refreshSaves = useGameStore((state) => state.refreshSaves);
  const game = useGameStore((state) => state.game);

  useEffect(() => {
    void refreshSaves();
  }, [refreshSaves]);

  return (
    <Modal
      title="Партия"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onExit}>
            В главное меню
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void saveGame()}>
            Сохранить
          </button>
        </>
      }
    >
      {game && game.history.length > 1 ? (
        <div className="menu-section">
          <div className="menu-section__title">Ход войны</div>
          <Sparkline
            samples={game.history}
            height={90}
            series={game.countryOrder.map((id) => {
              const entry = game.countries[id]!;
              return {
                id,
                color: entry.color,
                highlight: entry.id === game.playerCountryId,
                alive: entry.alive,
              };
            })}
          />
          <div className="victory__legend">
            {game.countryOrder.map((id) => {
              const entry = game.countries[id]!;
              return (
                <span key={id} className="victory__legend-item">
                  <i style={{ background: entry.color }} />
                  {entry.shortName} {Math.round(territoryShare(game, id) * 1000) / 10}% ·{' '}
                  {countCells(game, id)} клеток
                </span>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="menu-section">
        <div className="menu-section__title">Сохранения</div>
        {saves.length === 0 ? (
          <p className="muted small">Пока нет сохранений. Автосохранение пишется каждые 40 тиков.</p>
        ) : (
          <ul className="saves">
            {saves.slice(0, 6).map((save) => (
              <li key={save.slot} className="saves__row">
                <div>
                  <div>{save.label}</div>
                  <div className="tiny muted">
                    {formatGameDate(save.tick)} · клеток {save.ownedCells}
                  </div>
                </div>
                <div className="saves__actions">
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void loadGame(save.slot).then((ok) => ok && onClose())}
                  >
                    Загрузить
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => void deleteSave(save.slot)}
                    aria-label="Удалить сохранение"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="menu-section">
        <label className="row row--between">
          <span>Автосохранение</span>
          <input
            type="checkbox"
            checked={settings.autosave}
            onChange={(event) => setAutosave(event.target.checked)}
          />
        </label>
        <label className="row row--between">
          <span>Звук</span>
          <input
            type="checkbox"
            checked={settings.sound}
            onChange={(event) => setSound(event.target.checked)}
          />
        </label>
      </div>
    </Modal>
  );
}
