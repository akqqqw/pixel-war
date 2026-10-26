import { useEffect } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Modal } from '@/ui/components/Modal';
import { formatGameDate } from '@/core/time/gameDate';

interface MenuDialogProps {
  onClose: () => void;
  onExit: () => void;
}

export function MenuDialog({ onClose, onExit }: MenuDialogProps) {
  const saves = useGameStore((state) => state.saves);
  const settings = useGameStore((state) => state.settings);
  const setAutosave = useGameStore((state) => state.setAutosave);
  const saveGame = useGameStore((state) => state.saveGame);
  const loadGame = useGameStore((state) => state.loadGame);
  const deleteSave = useGameStore((state) => state.deleteSave);
  const refreshSaves = useGameStore((state) => state.refreshSaves);

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
      <div className="menu-section">
        <div className="menu-section__title">Сохранения</div>
        {saves.length === 0 ? (
          <p className="muted small">Пока нет сохранений. Автосохранение пишется каждые 40 игровых часов.</p>
        ) : (
          <ul className="saves">
            {saves.slice(0, 6).map((save) => (
              <li key={save.slot} className="saves__row">
                <div>
                  <div>{save.label}</div>
                  <div className="tiny muted">
                    {formatGameDate(save.tick)} · земель {save.ownedTerritories}
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
      </div>
    </Modal>
  );
}
