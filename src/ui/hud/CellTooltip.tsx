import { useGameStore } from '@/store/gameStore';
import { cellInfo } from '@/ui/helpers/game';
import { formatMoney } from '@/ui/helpers/format';

/**
 * One-line readout of the cell under the pointer. It lives in the corner so the
 * map never carries permanent numbers, and it stays hidden for the cell that is
 * already described by the context card.
 */
export function CellTooltip() {
  const game = useGameStore((state) => state.game);
  const hoverCell = useGameStore((state) => state.hoverCell);
  const selectedCell = useGameStore((state) => state.selectedCell);
  const revision = useGameStore((state) => state.revision);
  void revision;

  if (hoverCell === null || hoverCell === selectedCell) return null;
  const info = cellInfo(game, hoverCell);
  if (!info) return null;
  if (!info.land) {
    return (
      <div className="cell-tip">
        <span className="muted">Море</span>
      </div>
    );
  }

  return (
    <div className="cell-tip">
      <span className="cell-tip__dot" style={{ background: info.owner?.color ?? '#3a4a5e' }} />
      <span className="cell-tip__region">{info.regionName}</span>
      <span className="cell-tip__owner">{info.owner ? info.owner.shortName : 'нейтрально'}</span>
      <span className="cell-tip__sep">·</span>
      <span title="Солдаты в клетке">⚔️ {formatMoney(info.army)}</span>
      <span title="Оборона клетки">🛡 {info.defense}</span>
      {info.buildingDef ? (
        <>
          <span className="cell-tip__sep">·</span>
          <span title={info.buildingEffect ?? ''}>
            {info.buildingDef.short} {info.building ? `ур. ${info.building.level}` : ''}
          </span>
        </>
      ) : null}
    </div>
  );
}
