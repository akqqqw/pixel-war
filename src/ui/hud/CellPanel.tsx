import { upgradeCost } from '@/core/buildings/buildings';
import { mobilizeMax } from '@/core/sim/army';
import { useGameStore } from '@/store/gameStore';
import { BuildingIcon } from '@/ui/components/BuildingIcon';
import { formatMoney } from '@/ui/helpers/format';
import { cellInfo, playerCountry } from '@/ui/helpers/game';

/** Compact context menu for the selected cell — never covers the map. */
export function CellPanel() {
  const game = useGameStore((state) => state.game);
  const revision = useGameStore((state) => state.revision);
  const selectedCell = useGameStore((state) => state.selectedCell);
  const selectCell = useGameStore((state) => state.selectCell);
  const upgradeAt = useGameStore((state) => state.upgradeAt);
  const demolishAt = useGameStore((state) => state.demolishAt);
  const mobilizeRegion = useGameStore((state) => state.mobilizeRegion);
  const beginStrike = useGameStore((state) => state.beginStrike);
  const declareWarOn = useGameStore((state) => state.declareWarOn);
  const makePeaceWith = useGameStore((state) => state.makePeaceWith);
  void revision;

  const info = cellInfo(game, selectedCell);
  const country = playerCountry(game);
  if (!game || !info || !country || selectedCell === null) return null;

  const building = info.building;
  const def = info.buildingDef;
  const nextCost = building && def ? upgradeCost(building.kind, building.level) : 0;
  const canUpgrade = !!building && !!def && building.level < def.maxLevel && country.money >= nextCost;
  const maxMobilize = info.regionId ? mobilizeMax(game, country.id, info.regionId) : 0;
  const atWar = info.owner ? country.warWith.includes(info.owner.id) : false;

  return (
    <aside className="cell-panel">
      <header className="cell-panel__head">
        <span className="cell-panel__dot" style={{ background: info.owner?.color ?? '#3a4a5e' }} />
        <span className="cell-panel__region">{info.regionName}</span>
        <span className="cell-panel__owner">{info.owner ? info.owner.shortName : 'нейтрально'}</span>
        <button
          type="button"
          className="icon-btn icon-btn--tiny"
          onClick={() => selectCell(null)}
          title="Закрыть"
        >
          ✕
        </button>
      </header>

      <div className="cell-panel__stats">
        <span title="Солдаты в этой клетке">⚔️ {formatMoney(info.army)}</span>
        <span title="Оборона с учётом рельефа, баррикад и танков">🛡 {info.defense}</span>
        {info.regionId ? (
          <span title="Солдаты всего региона">регион {formatMoney(info.regionArmy)}</span>
        ) : null}
      </div>

      {building && def ? (
        <div className="cell-panel__building">
          <BuildingIcon kind={building.kind} size={22} />
          <div className="cell-panel__building-body">
            <strong>
              {def.name} · ур. {building.level}
            </strong>
            <span className="tiny muted">{info.buildingEffect}</span>
          </div>
        </div>
      ) : null}

      <div className="cell-panel__actions">
        {info.isOwn && building ? (
          <>
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={!canUpgrade}
              onClick={() => upgradeAt(building.id)}
              title={`Улучшить до ур. ${building.level + 1}`}
            >
              Улучшить · {def ? formatMoney(nextCost) : ''}
            </button>
            {building.kind === 'missile' || building.kind === 'airfield' ? (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => beginStrike(building.id)}
                title="Выбрать цель на карте"
              >
                {building.kind === 'missile' ? 'Удар ракетой' : 'Авиаудар'}
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => demolishAt(building.id)}>
              Удалить
            </button>
          </>
        ) : null}

        {info.isOwn && !building && info.regionId ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            disabled={maxMobilize <= 0}
            onClick={() => mobilizeRegion(info.regionId!)}
            title="Превратить население региона в солдат за золото"
          >
            Мобилизация +{formatMoney(maxMobilize)}
          </button>
        ) : null}

        {!info.isOwn && info.owner ? (
          <>
            {atWar ? (
              <button type="button" className="btn btn--sm" onClick={() => makePeaceWith(info.owner!.id)}>
                Мир
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--danger btn--sm"
                onClick={() => declareWarOn(info.owner!.id)}
              >
                Война
              </button>
            )}
          </>
        ) : null}
      </div>
    </aside>
  );
}
