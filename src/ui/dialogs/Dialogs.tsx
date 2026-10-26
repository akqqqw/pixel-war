import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { Modal } from '@/ui/components/Modal';
import { Toggle } from '@/ui/components/Toggle';
import { formatGameDate } from '@/core/time/gameDate';
import { countryDef } from '@/data/countries';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useGameStore((state) => state.settings);
  const setSetting = useGameStore((state) => state.setSetting);
  const toggleFullscreen = useGameStore((state) => state.toggleFullscreen);
  const exitToMenu = useGameStore((state) => state.exitToMenu);
  const saveGame = useGameStore((state) => state.saveGame);
  const inGame = useGameStore.getState().screen === 'game';

  return (
    <Modal
      title="Настройки"
      onClose={onClose}
      size="small"
      footer={
        <>
          {inGame && (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => void saveGame()}>
                Сохранить
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  exitToMenu();
                  onClose();
                }}
              >
                В главное меню
              </button>
            </>
          )}
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Готово
          </button>
        </>
      }
    >
      <div className="settings-row">
        <div>
          <div>Названия территорий на карте</div>
          <div className="tiny muted">Показывать подписи регионов</div>
        </div>
        <Toggle
          checked={settings.labels}
          onChange={(value) => setSetting('labels', value)}
          label="Названия территорий"
        />
      </div>
      <div className="settings-row">
        <div>
          <div>Эффекты сражений</div>
          <div className="tiny muted">Взрывы, дым и вспышки</div>
        </div>
        <Toggle
          checked={settings.effects}
          onChange={(value) => setSetting('effects', value)}
          label="Эффекты"
        />
      </div>
      <div className="settings-row">
        <div>
          <div>Автосохранение</div>
          <div className="tiny muted">Каждые 30 игровых часов</div>
        </div>
        <Toggle
          checked={settings.autosave}
          onChange={(value) => setSetting('autosave', value)}
          label="Автосохранение"
        />
      </div>
      <div className="settings-row">
        <div>
          <div>Полный экран</div>
          <div className="tiny muted">Удобнее на ноутбуке и планшете</div>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={toggleFullscreen}>
          Переключить
        </button>
      </div>
      <div className="tiny muted">
        Управление: перетаскивание карты — мышь или палец, колесо/щипок — масштаб, клик — выбор территории.
        Пробел — пауза, 1/2/3 — скорость.
      </div>
    </Modal>
  );
}

export function SavesDialog({ onClose, onDelete }: { onClose: () => void; onDelete: (slot: string) => void }) {
  const saves = useGameStore((state) => state.saves);
  const loadGame = useGameStore((state) => state.loadGame);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <Modal title="Сохранения" onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Закрыть</button>}>
      {saves.length === 0 && <div className="small muted">Сохранений пока нет. Начните новую партию — прогресс сохранится автоматически.</div>}
      <div className="stack">
        {saves.map((save) => (
          <div className="save-row" key={save.slot}>
            <div className="save-row__meta">
              <div className="save-row__label">{save.label}</div>
              <div className="tiny muted">
                {countryDef(save.countryId)?.shortName ?? save.countryId} · {formatGameDate(save.tick)} ·{' '}
                {save.ownedTerritories} терр. · сложность: {save.difficulty}
                {save.slot === 'auto' ? ' · авто' : ''}
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy === save.slot}
              onClick={() => {
                setBusy(save.slot);
                void loadGame(save.slot).then((ok) => {
                  setBusy(null);
                  if (ok) onClose();
                });
              }}
            >
              Загрузить
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => onDelete(save.slot)} aria-label="Удалить сохранение">
              ✕
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Обучение" onClose={onClose} size="wide" footer={<button type="button" className="btn btn--primary" onClick={onClose}>Понятно</button>}>
      <div className="stack small">
        <div>
          <strong style={{ color: 'var(--amber)' }}>1. Выберите свою территорию</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Клик по территории на карте открывает правую панель: население, доход, гарнизон и инфраструктура.
            Камера двигается перетаскиванием, масштаб — колесом мыши или щипком.
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--amber)' }}>2. Развивайте экономику</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Каждая территория приносит деньги, металл, нефть и энергию. Кнопка «Развивать» повышает уровень
            инфраструктуры: больше дохода и крепче оборона. Недостаток денег замедляет производство,
            нехватка топлива тормозит марши.
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--amber)' }}>3. Производите технику</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            На своей территории в правой панели выберите технику: ОБТ, БТР, БМП, САУ или РСЗО. Очередь — до
            3 единиц на территорию. Готовая техника попадает в гарнизон.
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--amber)' }}>4. Захватывайте регионы</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            В правой панели нажмите «Перебросить войска», выберите подразделения и цель. Прибытие на чужую
            территорию с гарнизоном запускает бой; пустая территория переходит без боя (переход по правилам
            клеточного автомата Конвея — контроль закрепляется только заселённой клеткой).
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--amber)' }}>5. Следите за ИИ и дипломатией</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Соседи развиваются и атакуют. Вкладка «Дипломатия» показывает отношения; объявляйте войны и
            предлагайте мир. Агрессия снижает репутацию и портит отношения.
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--amber)' }}>6. Победа</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Захватите все территории мира (мировое господство) или уничтожьте все вражеские государства
            (военная победа). Если вы потеряете все территории — поражение.
          </p>
        </div>
        <div className="divider" />
        <div className="tiny muted">
          Сохранение: кнопка «Сохранить» в верхней панели или автосохранение каждые 30 игровых часов.
          Продолжить партию можно из главного меню.
        </div>
      </div>
    </Modal>
  );
}
