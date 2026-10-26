import { useState } from 'react';
import { regionArmy } from '@/core/sim/effects';
import { useGameStore, playerOffensive } from '@/store/gameStore';
import { formatMoney } from '@/ui/helpers/format';

/**
 * Two slim bars: the share slider while a direction is being chosen, and the
 * controls of the running push (stop / retreat).
 */
export function OrderPanel() {
  const game = useGameStore((state) => state.game);
  const revision = useGameStore((state) => state.revision);
  const draft = useGameStore((state) => state.orderDraft);
  const confirmOffensive = useGameStore((state) => state.confirmOffensive);
  const cancelDraft = useGameStore((state) => state.cancelDraft);
  const stopPush = useGameStore((state) => state.stopPush);
  const retreatPush = useGameStore((state) => state.retreatPush);
  const [share, setShare] = useState(60);
  void revision;

  const order = playerOffensive(game);
  if (!game) return null;

  if (draft) {
    const available = regionArmy(game, draft.sourceRegionId);
    const send = Math.floor((available * share) / 100);
    return (
      <div className="order-panel">
        <div className="order-panel__row">
          <span className="order-panel__label">Отправить армию</span>
          <input
            className="slider"
            type="range"
            min={10}
            max={100}
            step={10}
            value={share}
            onChange={(event) => setShare(Number(event.target.value))}
            aria-label="Доля армии"
          />
          <strong className="order-panel__share">{share}%</strong>
          <span className="muted tiny">{formatMoney(send)} солдат</span>
        </div>
        <div className="order-panel__row">
          <button type="button" className="btn btn--primary btn--sm" onClick={() => confirmOffensive(share / 100)}>
            В атаку
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={cancelDraft}>
            Отмена
          </button>
        </div>
      </div>
    );
  }

  if (order) {
    return (
      <div className="order-panel order-panel--active">
        <span className="order-panel__label">
          Наступление · доставлено {formatMoney(order.delivered)}
        </span>
        <button type="button" className="btn btn--sm" onClick={stopPush}>
          Стоп
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={retreatPush}>
          Отойти
        </button>
      </div>
    );
  }

  return null;
}
