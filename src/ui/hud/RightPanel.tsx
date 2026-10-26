import { useGameStore } from '@/store/gameStore';
import { canAfford } from '@/core/types';
import { armyCount, armyPower } from '@/core/units/army';
import { LAND_UNITS, UNIT_LIST } from '@/core/units/unitTypes';
import { economyUpgradeCost, MAX_ECONOMY_LEVEL } from '@/core/economy/economy';
import { MAX_QUEUE_PER_TERRITORY, unitCostWithEconomy } from '@/core/sim/production';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import { formatTicksAsDuration } from '@/core/time/gameDate';
import {
  isAtWar,
  playerCountry,
  sortedGarrison,
  territoryAttackForecast,
  territoryDefense,
  territoryMeta,
  useGameSnapshot,
} from '@/ui/helpers/game';
import { formatInt, formatPercent, formatPopulation, formatResource } from '@/ui/helpers/format';
import { unitIconUrl } from '@/ui/helpers/icons';
import { useUiStore } from '@/ui/state/uiStore';

export function RightPanel() {
  const game = useGameSnapshot();
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const openSend = useUiStore((state) => state.openSend);
  const upgradeEconomy = useGameStore((state) => state.upgradeEconomy);
  const queueUnit = useGameStore((state) => state.queueUnit);
  const declareWar = useGameStore((state) => state.declareWar);
  const proposePeace = useGameStore((state) => state.proposePeace);

  if (!game) return null;
  const player = playerCountry(game);
  if (!player) return null;

  if (!selectedId) {
    return (
      <div className="side-scroll">
        <div className="panel">
          <div className="panel__head">Территория</div>
          <div className="panel__body">
            <p className="small muted" style={{ marginTop: 0 }}>
              Кликните по региону на карте, чтобы увидеть население, доход, гарнизон и доступные действия.
            </p>
            <div className="tiny muted">
              Перетаскивание — движение камеры. Колесо или щипок — масштаб. Выбранная территория подсвечивается.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const state = game.territories[selectedId];
  const meta = territoryMeta(game, selectedId);
  if (!state || !meta) return null;
  const owner = game.countries[state.owner];
  const isMine = state.owner === player.id;
  const isCapital = owner?.capitalTerritoryId === meta.id;
  const terrain = TERRAIN_INFO[meta.dominantTerrain as TerrainCode];
  const garrison = sortedGarrison(state.garrison);
  const garrisonPower = armyPower(state.garrison);
  const defense = territoryDefense(game, meta.id);
  const fleet = Object.values(game.groups).filter((group) => group.country === player.id);
  const strikeGroup = fleet
    .filter((group) => group.order?.targetTerritoryId === meta.id)
    .reduce((sum, group) => sum + armyPower(group.army), 0);
  const attackForecast = territoryAttackForecast(game, state.garrison, meta.id);
  const war = owner ? isAtWar(game, player.id, owner.id) : false;
  const upgradeCost = economyUpgradeCost(state.economyLevel);
  const canUpgrade = isMine && state.economyLevel < MAX_ECONOMY_LEVEL && canAfford(player.resources, upgradeCost);
  const queue = game.production.filter((item) => item.territoryId === meta.id);
  const queueFull = queue.length >= MAX_QUEUE_PER_TERRITORY;

  return (
    <div className="side-scroll">
      <div className="panel">
        <div className="panel__head">
          <span>{meta.name}</span>
          <span className="tag" style={{ color: owner?.accent, borderColor: owner?.color }}>
            {owner?.name ?? 'нейтральная'}
          </span>
        </div>
        <div className="panel__body stack" style={{ gap: 7 }}>
          <div className="row wrap" style={{ gap: 5 }}>
            <span className="tag">{terrain.name}</span>
            {isCapital && <span className="tag tag--gold">столица</span>}
            {meta.isCoastal && <span className="tag">побережье</span>}
            {meta.hasRiver && <span className="tag">река</span>}
            {meta.seaBoundaries.length > 0 && <span className="tag">морской путь</span>}
          </div>
          <div className="row row--between small">
            <span className="muted">Население</span>
            <strong>{formatPopulation(state.population)}</strong>
          </div>
          <div className="row row--between small">
            <span className="muted">Инфраструктура</span>
            <strong>
              ур. {state.economyLevel}/{MAX_ECONOMY_LEVEL}
            </strong>
          </div>
          <div className="row row--between small">
            <span className="muted">Доход в час</span>
            <strong>
              {formatResource(state.lastYield.money)} ₽ · {formatResource(state.lastYield.metal)} MT ·{' '}
              {formatResource(state.lastYield.oil)} OIL · {formatResource(state.lastYield.energy)} kW
            </strong>
          </div>
          {state.unrest > 0.02 && (
            <div className="tiny" style={{ color: 'var(--amber)' }}>
              Нестабильность: {formatPercent(state.unrest)} — доход снижен после захвата.
            </div>
          )}
          <div className="row row--between small">
            <span className="muted">Оборона</span>
            <strong>
              {formatInt(defense)} · рельеф ×{terrain.defenseBonus.toFixed(2)} · инфраструктура +
              {Math.round((state.economyLevel - 1) * 12 + (isCapital ? 15 : 0))}%
            </strong>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <span>Гарнизон</span>
          <span className="tiny">{armyCount(state.garrison)} ед. · сила {formatInt(garrisonPower)}</span>
        </div>
        <div className="panel__body">
          {garrison.length === 0 && <div className="tiny muted">Территория без защиты. Её можно занять без боя.</div>}
          {garrison.map((entry) => (
            <div className="army-line" key={entry.type}>
              <img src={unitIconUrl(entry.type, owner?.color ?? '#888')} alt="" />
              <span style={{ flex: 1 }}>{LAND_UNITS[entry.type].name}</span>
              <strong>×{entry.count}</strong>
            </div>
          ))}
        </div>
      </div>

      {isMine && (
        <div className="panel">
          <div className="panel__head">
            <span>Управление</span>
          </div>
          <div className="panel__body stack" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn--primary"
              disabled={armyCount(state.garrison) === 0}
              onClick={() => openSend(meta.id)}
            >
              Перебросить войска
            </button>
            <button
              type="button"
              className="btn"
              disabled={!canUpgrade}
              title={`${formatInt(upgradeCost.money ?? 0)} ₽ + ${formatInt(upgradeCost.metal ?? 0)} MT`}
              onClick={() => upgradeEconomy(meta.id)}
            >
              {state.economyLevel >= MAX_ECONOMY_LEVEL
                ? 'Инфраструктура MAX'
                : `Развивать · ${formatInt(upgradeCost.money ?? 0)} ₽ / ${formatInt(upgradeCost.metal ?? 0)} MT`}
            </button>

            <div className="divider" />
            <div className="row row--between">
              <span className="label">Производство</span>
              <span className="tiny muted">
                {queue.length}/{MAX_QUEUE_PER_TERRITORY}
              </span>
            </div>
            <div className="unit-grid">
              {UNIT_LIST.map((unit) => {
                const cost = unitCostWithEconomy(game, meta.id, unit.id);
                const ok = canAfford(player.resources, cost);
                return (
                  <button
                    key={unit.id}
                    type="button"
                    className="unit-card"
                    disabled={!ok || queueFull}
                    title={`${unit.name} — ${formatTicksAsDuration(unit.buildTime)}`}
                    onClick={() => queueUnit(meta.id, unit.id)}
                  >
                    <img src={unitIconUrl(unit.id, player.color)} alt="" />
                    <div>
                      <div className="unit-card__name">{unit.shortName}</div>
                      <div className="unit-card__cost">
                        {formatInt(cost.money)} ₽ · {formatInt(cost.metal)} MT
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {queue.length > 0 && (
              <div className="stack" style={{ gap: 4 }}>
                {queue.map((item) => (
                  <div className="row row--between tiny" key={item.id}>
                    <span>{LAND_UNITS[item.unit].shortName}</span>
                    <span className="muted">{formatTicksAsDuration(item.ticksLeft)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!isMine && owner && (
        <div className="panel">
          <div className="panel__head">
            <span>Разведка и атака</span>
            <span className={`tag ${war ? 'tag--war' : ''}`}>{war ? 'война' : 'мир'}</span>
          </div>
          <div className="panel__body stack" style={{ gap: 8 }}>
            <div className="power-preview">
              <div className="power-preview__side">
                <span className="tiny muted">Наш удар (в пути)</span>
                <span className="power-preview__value">{formatInt(strikeGroup)}</span>
              </div>
              <span className="tiny muted">vs</span>
              <div className="power-preview__side power-preview__side--right">
                <span className="tiny muted">Оборона</span>
                <span className="power-preview__value" style={{ color: 'var(--blue)' }}>
                  {formatInt(defense)}
                </span>
              </div>
            </div>
            <div className="tiny muted">
              Прогноз при полном гарнизоне цели: шанс успеха ≈{' '}
              <strong style={{ color: 'var(--amber)' }}>{Math.round(attackForecast.attackerChance * 100)}%</strong>
              {armyCount(state.garrison) === 0 && ' · гарнизона нет, территория падёт без боя'}
            </div>
            <button type="button" className="btn btn--danger" onClick={() => openSend(undefined, meta.id)}>
              Атаковать территорию
            </button>
            {!war && (
              <button type="button" className="btn" onClick={() => declareWar(owner.id)}>
                Объявить войну {owner.name}
              </button>
            )}
            {war && (
              <button type="button" className="btn" onClick={() => proposePeace(owner.id)}>
                Предложить мир
              </button>
            )}
            <div className="tiny muted">
              Отправка войск на чужую землю автоматически начинает войну. Репутация при захвате падает.
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel__head">
          <span>Действие на карте</span>
        </div>
        <div className="panel__body">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => useGameStore.getState().focusTerritory(meta.id)}
          >
            Приблизить территорию
          </button>
          <div className="tiny muted" style={{ marginTop: 6 }}>
            Соседи: {meta.neighbors.map((id) => game.world.territories.find((t) => t.id === id)?.name).filter(Boolean).slice(0, 3).join(', ')}
          </div>
        </div>
      </div>
    </div>
  );
}
