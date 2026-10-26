import { useGameStore } from '@/store/gameStore';
import type { GameSpeed } from '@/core/state/types';
import { armyCount } from '@/core/units/army';
import { LAND_UNITS } from '@/core/units/unitTypes';
import { formatGameClock, formatGameDateShort } from '@/core/time/gameDate';
import { isAtWar, playerCountry, sortedGarrison, territoryMeta, useGameSnapshot } from '@/ui/helpers/game';
import { unitIconUrl } from '@/ui/helpers/icons';
import { useUiStore } from '@/ui/state/uiStore';

const SPEEDS: { speed: GameSpeed; label: string; title: string }[] = [
  { speed: 0, label: '❚❚', title: 'Пауза' },
  { speed: 1, label: '×1', title: 'Обычная скорость' },
  { speed: 2, label: '×2', title: 'Ускорение ×2' },
  { speed: 4, label: '×4', title: 'Ускорение ×4' },
];

export function BottomBar({ onToggleLeft, onToggleRight }: { onToggleLeft: () => void; onToggleRight: () => void }) {
  const game = useGameSnapshot();
  const setSpeed = useGameStore((state) => state.setSpeed);
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const openSend = useUiStore((state) => state.openSend);
  const upgradeEconomy = useGameStore((state) => state.upgradeEconomy);
  if (!game) return null;
  const player = playerCountry(game);
  if (!player) return null;

  const state = selectedId ? game.territories[selectedId] : null;
  const meta = territoryMeta(game, selectedId);
  const owner = state ? game.countries[state.owner] : null;
  const isMine = state?.owner === player.id;
  const garrison = state ? sortedGarrison(state.garrison) : [];
  const movingGroups = Object.values(game.groups).filter((group) => group.country === player.id);
  const war = owner ? isAtWar(game, player.id, owner.id) : false;

  return (
    <footer className="botbar">
      <div className="botbar__section">
        <button type="button" className="btn btn--ghost btn--sm mobile-only" onClick={onToggleLeft}>
          Армия
        </button>
        <button type="button" className="btn btn--ghost btn--sm mobile-only" onClick={onToggleRight}>
          Регион
        </button>
      </div>

      <div className="botbar__section" style={{ minWidth: 0, flex: '1 1 320px' }}>
        {meta ? (
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 7 }}>
              <span className="list-row__dot" style={{ background: owner?.color ?? '#555' }} />
              <strong style={{ fontSize: 12 }}>{meta.name}</strong>
              <span className="tiny muted">
                {owner?.name ?? 'нейтральная'} · {armyCount(state?.garrison ?? {})} ед.
                {war ? ' · война' : ''}
              </span>
            </div>
            <div className="sel-army" style={{ marginTop: 3 }}>
              {garrison.length === 0 && <span className="tiny muted">Гарнизон отсутствует</span>}
              {garrison.slice(0, 5).map((entry) => (
                <span className="sel-army__chip" key={entry.type}>
                  <img src={unitIconUrl(entry.type, owner?.color ?? '#888')} alt="" />
                  {LAND_UNITS[entry.type].shortName} ×{entry.count}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <span className="small muted">Территория не выбрана — кликните по карте</span>
        )}
      </div>

      <div className="botbar__section">
        {isMine && (
          <>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={armyCount(state?.garrison ?? {}) === 0}
              onClick={() => selectedId && openSend(selectedId)}
            >
              Перебросить
            </button>
            <button type="button" className="btn btn--sm" onClick={() => selectedId && upgradeEconomy(selectedId)}>
              Развивать
            </button>
          </>
        )}
        {meta && !isMine && (
          <button type="button" className="btn btn--danger btn--sm" onClick={() => openSend(undefined, meta.id)}>
            Атаковать
          </button>
        )}
      </div>

      <div className="botbar__section" style={{ flex: '1 1 220px' }}>
        <span className="label">В пути</span>
        <div className="moving-groups">
          {movingGroups.length === 0 && <span className="tiny muted">нет приказов</span>}
          {movingGroups.slice(0, 4).map((group) => {
            const target = group.order?.targetTerritoryId
              ? territoryMeta(game, group.order.targetTerritoryId)
              : null;
            const progress = group.movement
              ? Math.min(1, group.movement.progress / Math.max(1, group.movement.milliseconds))
              : 0;
            return (
              <span className="moving-chip" key={group.id}>
                {armyCount(group.army)} ед. → {target?.name ?? '—'}
                <span className="moving-chip__bar">
                  <div style={{ width: `${progress * 100}%` }} />
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="botbar__section">
        <div className="speed-controls">
          {SPEEDS.map((item) => (
            <button
              key={item.speed}
              type="button"
              title={item.title}
              className={`speed-btn ${game.speed === item.speed ? 'speed-btn--active' : ''}`}
              onClick={() => setSpeed(item.speed)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="tiny muted" style={{ textAlign: 'right', lineHeight: 1.25 }}>
          <div>{formatGameDateShort(game.tick)}</div>
          <div>{formatGameClock(game.tick)}</div>
        </div>
      </div>
    </footer>
  );
}
