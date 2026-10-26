import { useMemo, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import type { TerritoryId } from '@/core/types';
import { armyCount, armyPower, makeArmy, type Army } from '@/core/units/army';
import { LAND_UNIT_TYPES, LAND_UNITS, type LandUnitType } from '@/core/units/unitTypes';
import { findOrderPath } from '@/core/sim/path';
import { Modal } from '@/ui/components/Modal';
import {
  isAtWar,
  playerCountry,
  territoryAttackForecast,
  territoryDefense,
  territoryMeta,
  useGameSnapshot,
} from '@/ui/helpers/game';
import { formatInt } from '@/ui/helpers/format';
import { unitIconUrl } from '@/ui/helpers/icons';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';

interface SendArmyDialogProps {
  initialFrom?: TerritoryId;
  initialTo?: TerritoryId;
  onClose: () => void;
}

export function SendArmyDialog({ initialFrom, initialTo, onClose }: SendArmyDialogProps) {
  const game = useGameSnapshot();
  const sendArmy = useGameStore((state) => state.sendArmy);
  const player = game ? playerCountry(game) : null;

  const sources = useMemo(() => {
    if (!game || !player) return [];
    return game.world.territories
      .filter((territory) => {
        const state = game.territories[territory.id];
        if (state?.owner !== player.id || armyCount(state.garrison) === 0) return false;
        if (!initialTo) return true;
        return !!findOrderPath(game, player.id, territory.id, initialTo);
      })
      .map((territory) => ({
        id: territory.id,
        name: territory.name,
        hops: initialTo ? (findOrderPath(game, player.id, territory.id, initialTo)?.length ?? 99) - 1 : 0,
      }))
      .sort((a, b) => a.hops - b.hops);
  }, [game, player, initialTo]);

  const [sourceId, setSourceId] = useState<TerritoryId | null>(() => {
    if (initialFrom && game?.territories[initialFrom]?.owner === player?.id) return initialFrom;
    if (initialTo) {
      const candidates = sources[0];
      return candidates?.id ?? null;
    }
    return sources[0]?.id ?? null;
  });
  const [targetId, setTargetId] = useState<TerritoryId | null>(initialTo ?? null);
  const [army, setArmy] = useState<Army>({});

  const sourceState = sourceId && game ? game.territories[sourceId] : null;
  const sourceMeta = game && sourceId ? territoryMeta(game, sourceId) : null;

  const targets = useMemo(() => {
    if (!game || !player || !sourceId) return [];
    return game.world.territories
      .filter((territory) => territory.id !== sourceId)
      .map((territory) => {
        const path = findOrderPath(game, player.id, sourceId, territory.id);
        const state = game.territories[territory.id];
        return {
          id: territory.id,
          name: territory.name,
          hops: path ? path.length - 1 : Number.POSITIVE_INFINITY,
          ownerId: state?.owner ?? null,
          owner: state ? game.countries[state.owner] : undefined,
          garrison: state?.garrison ?? {},
          defense: territoryDefense(game, territory.id),
        };
      })
      .filter((entry) => Number.isFinite(entry.hops))
      .sort((a, b) => {
        if (a.hops !== b.hops) return a.hops - b.hops;
        return a.name.localeCompare(b.name);
      });
  }, [game, player, sourceId]);

  // Ensure a sensible target once a source exists.
  const resolvedTargetId =
    targetId && targets.some((target) => target.id === targetId)
      ? targetId
      : (targets.find((target) => target.ownerId !== player?.id)?.id ?? targets[0]?.id ?? null);
  const target = targets.find((entry) => entry.id === resolvedTargetId) ?? null;
  const targetMeta = game && target ? territoryMeta(game, target.id) : null;
  const targetCountry = target?.owner;
  const war = game && targetCountry && player ? isAtWar(game, player.id, targetCountry.id) : false;

  const selectedArmy = makeArmy(army);
  const selectedCount = armyCount(selectedArmy);
  const forecast = game && resolvedTargetId && selectedCount > 0
    ? territoryAttackForecast(game, selectedArmy, resolvedTargetId)
    : null;
  const defenderGarrisonCount = target ? armyCount(target.garrison) : 0;
  const attackerPower = armyPower(selectedArmy, 1);

  const adjust = (type: LandUnitType, delta: number): void => {
    const available = sourceState?.garrison[type] ?? 0;
    const next = Math.max(0, Math.min(available, (army[type] ?? 0) + delta));
    setArmy((prev) => {
      const copy: Army = { ...prev };
      if (next > 0) copy[type] = next;
      else delete copy[type];
      return copy;
    });
  };

  const selectAll = (fraction: number): void => {
    if (!sourceState) return;
    const next: Army = {};
    for (const type of LAND_UNIT_TYPES) {
      const count = sourceState.garrison[type] ?? 0;
      const take = fraction >= 1 ? count : Math.floor(count * fraction);
      if (take > 0) next[type] = take;
    }
    setArmy(next);
  };

  if (!game || !player) return null;

  const confirm = (): void => {
    if (!sourceId || !resolvedTargetId || selectedCount === 0) return;
    const ok = sendArmy(sourceId, resolvedTargetId, selectedArmy);
    if (ok) onClose();
  };

  return (
    <Modal
      title="Переброска войск"
      onClose={onClose}
      size="wide"
      footer={
        <>
          <div className="tiny muted" style={{ marginRight: 'auto' }}>
            {sourceMeta ? `Из «${sourceMeta.name}»` : 'Выберите источник'} →{' '}
            {targetMeta ? `«${targetMeta.name}»` : 'выберите цель'} ·{' '}
            {selectedCount > 0 ? `${selectedCount} ед. техники` : 'войска не выбраны'}
            {target && target.ownerId !== player.id && !war && ' · будет объявлена война!'}
          </div>
          <button type="button" className="btn" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!sourceId || !resolvedTargetId || selectedCount === 0}
            onClick={confirm}
          >
            Отправить приказ
          </button>
        </>
      }
    >
      {sources.length === 0 && (
        <div className="small muted">
          Нет доступных войск. Произведите технику на своих территориях — она появится в гарнизоне.
        </div>
      )}
      {sources.length > 0 && (
        <div className="send-grid">
          <div className="stack" style={{ gap: 8 }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                1. Откуда
              </div>
              <div className="list">
                {sources.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={`send-target ${source.id === sourceId ? 'send-target--active' : ''}`}
                    onClick={() => {
                      setSourceId(source.id);
                      setArmy({});
                    }}
                  >
                    <span className="list-row__dot" style={{ background: player.color }} />
                    <span className="send-target__name">{source.name}</span>
                    <span className="tiny muted">
                      {armyCount(game.territories[source.id]?.garrison ?? {})} ед.
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                2. Состав отряда
              </div>
              <div className="stack" style={{ gap: 3 }}>
                {LAND_UNIT_TYPES.filter((type) => (sourceState?.garrison[type] ?? 0) > 0).map((type) => {
                  const available = sourceState?.garrison[type] ?? 0;
                  const chosen = army[type] ?? 0;
                  return (
                    <div className="row row--between" key={type} style={{ gap: 6 }}>
                      <span className="row" style={{ gap: 6, fontSize: 11 }}>
                        <img src={unitIconUrl(type, player.color)} alt="" width={22} height={22} />
                        {LAND_UNITS[type].name}
                      </span>
                      <span className="stepper">
                        <button type="button" onClick={() => adjust(type, -1)} disabled={chosen === 0}>
                          −
                        </button>
                        <span className="stepper__value">{chosen}</span>
                        <button type="button" onClick={() => adjust(type, 1)} disabled={chosen >= available}>
                          +
                        </button>
                        <span className="tiny muted" style={{ marginLeft: 3 }}>
                          /{available}
                        </span>
                      </span>
                    </div>
                  );
                })}
                {sourceState && armyCount(sourceState.garrison) === 0 && (
                  <span className="tiny muted">Гарнизон пуст.</span>
                )}
              </div>
              <div className="row" style={{ gap: 6, marginTop: 6 }}>
                <button type="button" className="btn btn--sm" onClick={() => selectAll(1)}>
                  Все
                </button>
                <button type="button" className="btn btn--sm" onClick={() => selectAll(0.5)}>
                  Половина
                </button>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setArmy({})}>
                  Сброс
                </button>
              </div>
            </div>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>
                3. Куда
              </div>
              <div className="list" style={{ maxHeight: 190, overflowY: 'auto' }}>
                {targets.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`send-target ${entry.id === resolvedTargetId ? 'send-target--active' : ''} ${
                      entry.ownerId !== player.id ? 'send-target--hostile' : ''
                    }`}
                    onClick={() => setTargetId(entry.id)}
                  >
                    <span className="list-row__dot" style={{ background: entry.owner?.color ?? '#555' }} />
                    <span className="send-target__name">{entry.name}</span>
                    <span className="tiny muted">
                      {entry.hops === 1 ? 'рядом' : `${entry.hops} перех.`}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {target && targetMeta && (
              <div className="stack" style={{ gap: 6 }}>
                <div className="tiny muted">
                  {targetCountry?.name ?? 'нейтральная'} ·{' '}
                  {TERRAIN_INFO[targetMeta.dominantTerrain as TerrainCode].name} · гарнизон{' '}
                  {defenderGarrisonCount} ед.
                </div>
                <div className="power-preview">
                  <div className="power-preview__side">
                    <span className="tiny muted">Наш отряд</span>
                    <span className="power-preview__value">{formatInt(attackerPower)}</span>
                  </div>
                  <span className="tiny muted">→</span>
                  <div className="power-preview__side power-preview__side--right">
                    <span className="tiny muted">Оборона</span>
                    <span className="power-preview__value" style={{ color: 'var(--blue)' }}>
                      {formatInt(target.defense)}
                    </span>
                  </div>
                </div>
                <div className="power-bar" style={{ height: 8 }}>
                  <div
                    className="power-bar__attacker"
                    style={{ width: `${Math.min(100, (attackerPower / Math.max(1, attackerPower + target.defense)) * 100)}%` }}
                  />
                  <div
                    className="power-bar__defender"
                    style={{ flex: 1 }}
                  />
                </div>
                <div className="tiny">
                  {defenderGarrisonCount === 0 ? (
                    <span style={{ color: 'var(--green)' }}>Гарнизона нет — территория будет занята без боя.</span>
                  ) : (
                    <span className="muted">
                      Шанс успеха ≈{' '}
                      <strong style={{ color: 'var(--amber)' }}>
                        {forecast ? Math.round(forecast.attackerChance * 100) : 0}%
                      </strong>{' '}
                      · бой начнётся при прибытии
                    </span>
                  )}
                </div>
                {target.ownerId !== player.id && !war && (
                  <div className="tiny" style={{ color: 'var(--red)' }}>
                    Внимание: атака чужой территории объявит войну.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
