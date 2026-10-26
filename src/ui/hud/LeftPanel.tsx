import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';

import { armyCount } from '@/core/units/army';
import { LAND_UNITS, UNIT_LIST } from '@/core/units/unitTypes';
import { MAX_ECONOMY_LEVEL, economyUpgradeCost } from '@/core/economy/economy';
import { MAX_QUEUE_PER_TERRITORY, unitCostWithEconomy } from '@/core/sim/production';
import { formatGameDateShort, formatTicksAsDuration } from '@/core/time/gameDate';
import { canAfford } from '@/core/types';
import {
  isAtWar,
  ownedTerritories,
  playerCountry,
  relationLabel,
  relationTone,
  sortedGarrison,
  territoryMeta,
  totalArmy,
  useGameSnapshot,
} from '@/ui/helpers/game';
import { formatInt, formatResource } from '@/ui/helpers/format';
import { uiIcon, unitIconUrl } from '@/ui/helpers/icons';
import type { Resources } from '@/core/types';

type Tab = 'army' | 'economy' | 'diplomacy' | 'log';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'army', label: 'Армия', icon: 'army' },
  { id: 'economy', label: 'Экономика', icon: 'factory' },
  { id: 'diplomacy', label: 'Дипломатия', icon: 'flag' },
  { id: 'log', label: 'Журнал', icon: 'paper' },
];

function costLine(cost: Resources): string {
  const parts: string[] = [];
  if (cost.money) parts.push(`${formatInt(cost.money)} ₽`);
  if (cost.metal) parts.push(`${formatInt(cost.metal)} MT`);
  if (cost.oil) parts.push(`${formatInt(cost.oil)} OIL`);
  if (cost.energy) parts.push(`${formatInt(cost.energy)} kW`);
  return parts.join(' · ');
}

export function LeftPanel() {
  const game = useGameSnapshot();
  const [tab, setTab] = useState<Tab>('army');
  if (!game) return null;
  const player = playerCountry(game);
  if (!player) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab ${tab === item.id ? 'tab--active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            <img src={uiIcon(item.icon)} alt="" />
            {item.label}
          </button>
        ))}
      </div>
      <div className="side-scroll">
        {tab === 'army' && <ArmyTab />}
        {tab === 'economy' && <EconomyTab />}
        {tab === 'diplomacy' && <DiplomacyTab />}
        {tab === 'log' && <LogTab />}
      </div>
    </div>
  );
}

function ArmyTab() {
  const game = useGameSnapshot();
  const queueUnit = useGameStore((state) => state.queueUnit);
  const cancelProduction = useGameStore((state) => state.cancelProduction);
  const focusTerritory = useGameStore((state) => state.focusTerritory);
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  if (!game) return null;
  const player = playerCountry(game);
  if (!player) return null;

  const selected = selectedId ? game.territories[selectedId] : undefined;
  const owned = ownedTerritories(game, player.id);
  const fallbackFactory =
    (player.capitalTerritoryId && owned.some((territory) => territory.id === player.capitalTerritoryId)
      ? player.capitalTerritoryId
      : null) ??
    [...owned].sort(
      (a, b) => (game.territories[b.id]?.economyLevel ?? 1) - (game.territories[a.id]?.economyLevel ?? 1),
    )[0]?.id ??
    null;
  const factoryId = selected && selected.owner === player.id ? selectedId : fallbackFactory;
  const factory = factoryId ? territoryMeta(game, factoryId) : null;
  const factoryUsesFallback = !selected || selected.owner !== player.id;
  const queue = game.production.filter((item) => item.country === player.id);
  const queueFull =
    !!factoryId &&
    queue.filter((item) => item.territoryId === factoryId).length >= MAX_QUEUE_PER_TERRITORY;
  const army = totalArmy(game, player.id);
  const garrisons = ownedTerritories(game, player.id)
    .map((territory) => ({ territory, state: game.territories[territory.id]! }))
    .filter((entry) => armyCount(entry.state.garrison) > 0)
    .sort((a, b) => armyCount(b.state.garrison) - armyCount(a.state.garrison));

  return (
    <>
      <div className="panel__section">
        <div className="row row--between">
          <span className="label">Производство</span>
          <span className="tiny muted">{factory ? factory.name : 'нет завода'}</span>
        </div>
        {factoryUsesFallback && (
          <div className="tiny muted" style={{ margin: '4px 0 6px' }}>
            Выберите свою территорию на карте, иначе заказ уйдёт в столицу.
          </div>
        )}
        <div className="unit-grid">
          {UNIT_LIST.map((unit) => {
            const cost = factoryId
              ? unitCostWithEconomy(game, factoryId, unit.id)
              : unit.cost;
            const affordable = canAfford(player.resources, cost);
            return (
              <button
                key={unit.id}
                type="button"
                className="unit-card"
                disabled={!factoryId || !affordable || queueFull}
                title={`${unit.name}: ${unit.description}`}
                onClick={() => {
                  if (factoryId) queueUnit(factoryId, unit.id);
                }}
              >
                <img src={unitIconUrl(unit.id, player.color)} alt="" />
                <div>
                  <div className="unit-card__name">{unit.shortName}</div>
                  <div className="unit-card__cost">{costLine(cost)}</div>
                  <div className="unit-card__cost">
                    {formatTicksAsDuration(unit.buildTime)} · атака {unit.attack}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          Очередь: {queue.length} · в производстве {queue.length > 0 ? 'идёт работа' : 'пусто'}
        </div>
      </div>

      {queue.length > 0 && (
        <div className="panel__section">
          <div className="label" style={{ marginBottom: 5 }}>
            Очередь производства
          </div>
          <div className="list">
            {queue.map((item) => {
              const meta = territoryMeta(game, item.territoryId);
              const progress = 1 - item.ticksLeft / item.totalTicks;
              return (
                <div className="static-row" key={item.id}>
                  <img src={unitIconUrl(item.unit, player.color)} alt="" width={20} height={20} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row row--between">
                      <span>
                        {LAND_UNITS[item.unit].shortName} · {meta?.name ?? '—'}
                      </span>
                      <span className="tiny muted">{formatTicksAsDuration(item.ticksLeft)}</span>
                    </div>
                    <div className="progress-bar progress-bar--green" style={{ marginTop: 3, height: 4 }}>
                      <div className="progress-bar__fill" style={{ width: `${Math.min(100, progress * 100)}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => cancelProduction(item.id)}
                    title="Отменить заказ (возврат 60%)"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel__section">
        <div className="row row--between">
          <span className="label">Армия</span>
          <span className="tiny muted">
            {army.total} ед. · сила {formatInt(army.power)}
          </span>
        </div>
        <div className="army-line" style={{ flexWrap: 'wrap' }}>
          {sortedGarrison(army.army).map((entry) => (
            <span className="tag" key={entry.type}>
              {LAND_UNITS[entry.type].shortName} ×{entry.count}
            </span>
          ))}
          {army.total === 0 && <span className="tiny muted">Вся техника уничтожена.</span>}
        </div>
      </div>

      <div className="panel__section">
        <div className="label" style={{ marginBottom: 5 }}>
          Гарнизоны
        </div>
        <div className="list">
          {garrisons.map(({ territory, state }) => (
            <button
              key={territory.id}
              type="button"
              className={`list-row ${selectedId === territory.id ? 'list-row--active' : ''}`}
              onClick={() => focusTerritory(territory.id)}
            >
              <span className="list-row__dot" style={{ background: player.color }} />
              <span className="list-row__name">{territory.name}</span>
              <span className="tiny muted">{armyCount(state.garrison)} ед.</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel__section">
        <div className="label" style={{ marginBottom: 5 }}>
          В пути
        </div>
        {Object.values(game.groups).filter((group) => group.country === player.id).length === 0 && (
          <div className="tiny muted">Все подразделения в гарнизонах.</div>
        )}
        {Object.values(game.groups)
          .filter((group) => group.country === player.id)
          .map((group) => {
            const target = group.order?.targetTerritoryId
              ? territoryMeta(game, group.order.targetTerritoryId)
              : null;
            const progress = group.movement
              ? Math.min(1, group.movement.progress / Math.max(1, group.movement.milliseconds))
              : 0;
            const hop = group.movement
              ? group.movement.step / Math.max(1, group.movement.path.length - 1)
              : 0;
            return (
              <div className="static-row" key={group.id}>
                <img src={unitIconUrl('apc', player.color)} alt="" width={20} height={20} />
                <div style={{ flex: 1 }}>
                  <div className="tiny">
                    {armyCount(group.army)} ед. → {target?.name ?? '—'}
                  </div>
                  <div className="progress-bar" style={{ height: 4, marginTop: 3 }}>
                    <div
                      className="progress-bar__fill"
                      style={{ width: `${Math.min(100, (hop + progress / Math.max(1, group.movement?.path.length ?? 2)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </>
  );
}

function EconomyTab() {
  const game = useGameSnapshot();
  const upgradeEconomy = useGameStore((state) => state.upgradeEconomy);
  const focusTerritory = useGameStore((state) => state.focusTerritory);
  if (!game) return null;
  const player = playerCountry(game);
  if (!player) return null;
  const territories = ownedTerritories(game, player.id).sort(
    (a, b) => (game.territories[b.id]?.population ?? 0) - (game.territories[a.id]?.population ?? 0),
  );

  return (
    <>
      <div className="panel__section">
        <div className="label" style={{ marginBottom: 4 }}>
          Доход державы (в час)
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {(['money', 'metal', 'oil', 'energy'] as const).map((key) => (
            <div key={key} className="resource" style={{ minWidth: 0 }}>
              <img src={uiIcon(key)} alt="" />
              <div>
                <div className="resource__value">{formatResource(player.income[key])}</div>
                <div className="tiny muted">/час</div>
              </div>
            </div>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 6 }}>
          {player.deficit.money && '⚠ Дефицит денег: производство замедлено. '}
          {player.deficit.metal && '⚠ Дефицит металла. '}
          {player.deficit.oil && '⚠ Дефицит топлива: марши медленнее. '}
          {player.deficit.energy && '⚠ Дефицит энергии: заводы работают хуже.'}
          {!player.deficit.money && !player.deficit.metal && !player.deficit.oil && !player.deficit.energy &&
            'Баланс ресурсов в норме.'}
        </div>
      </div>

      <div className="panel__section">
        <div className="label" style={{ marginBottom: 5 }}>
          Инфраструктура ({territories.length})
        </div>
        <div className="list">
          {territories.map((territory) => {
            const state = game.territories[territory.id]!;
            const isCapital = player.capitalTerritoryId === territory.id;
            const cost = economyUpgradeCost(state.economyLevel);
            const maxed = state.economyLevel >= MAX_ECONOMY_LEVEL;
            const affordable = canAfford(player.resources, cost);
            return (
              <div className="static-row" key={territory.id} style={{ alignItems: 'flex-start' }}>
                <span className="list-row__dot" style={{ background: player.color, marginTop: 5 }} />
                <button
                  type="button"
                  className="list-row__name"
                  style={{ background: 'none', border: 0, color: 'inherit', textAlign: 'left', cursor: 'pointer', padding: 0 }}
                  onClick={() => focusTerritory(territory.id)}
                >
                  <div>
                    {territory.name} {isCapital ? '★' : ''}
                  </div>
                  <div className="tiny muted">
                    ур. {state.economyLevel}/{MAX_ECONOMY_LEVEL} · доход {formatResource(
                      state.lastYield.money + state.lastYield.metal + state.lastYield.oil + state.lastYield.energy,
                    )} · {formatInt(state.population)} чел.
                  </div>
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  disabled={maxed || !affordable}
                  title={maxed ? 'Максимальный уровень' : `Улучшить: ${cost.money} ₽, ${cost.metal} MT`}
                  onClick={() => upgradeEconomy(territory.id)}
                >
                  {maxed ? 'MAX' : `↑ ур.${state.economyLevel + 1}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function DiplomacyTab() {
  const game = useGameSnapshot();
  const declareWar = useGameStore((state) => state.declareWar);
  const proposePeace = useGameStore((state) => state.proposePeace);
  if (!game) return null;
  const player = playerCountry(game);
  if (!player) return null;

  return (
    <>
      <div className="panel__section">
        <div className="row row--between">
          <span className="label">Репутация</span>
          <strong style={{ color: player.reputation > 50 ? 'var(--green)' : 'var(--amber)' }}>
            {Math.round(player.reputation)}/100
          </strong>
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Захваты территорий снижают репутацию и ухудшают отношения с соседями.
        </div>
      </div>

      <div className="panel__section">
        <div className="label" style={{ marginBottom: 5 }}>
          Державы
        </div>
        <div className="list">
          {Object.values(game.countries)
            .filter((country) => country.id !== player.id)
            .map((country) => {
              const war = isAtWar(game, player.id, country.id);
              const relation = player.relations[country.id] ?? 0;
              const count = ownedTerritories(game, country.id).length;
              return (
                <div key={country.id} className="static-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div className="row row--between">
                    <span className="row" style={{ gap: 6 }}>
                      <span className="list-row__dot" style={{ background: country.color }} />
                      <strong style={{ fontSize: 11 }}>{country.name}</strong>
                    </span>
                    <span className={`tag ${war ? 'tag--war' : ''}`}>{war ? 'война' : country.alive ? 'мир' : 'уничтожено'}</span>
                  </div>
                  <div className="row row--between tiny">
                    <span className="muted">
                      {count} терр. · {relationLabel(relation)}
                    </span>
                    <span style={{ color: relationTone(relation) }}>{Math.round(relation)}</span>
                  </div>
                  <div className="power-bar" style={{ height: 5 }}>
                    <div
                      className="power-bar__attacker"
                      style={{
                        width: `${Math.abs(relation)}%`,
                        marginLeft: relation < 0 ? `${100 - Math.abs(relation)}%` : 0,
                        background: relation < 0 ? 'linear-gradient(90deg,#8a3a32,#ee6a58)' : 'linear-gradient(90deg,#3f8f4c,#79d17f)',
                      }}
                    />
                  </div>
                  {country.alive && (
                    <div className="row" style={{ gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn--sm btn--danger"
                        disabled={war}
                        onClick={() => declareWar(country.id)}
                      >
                        Война
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm"
                        disabled={!war}
                        onClick={() => proposePeace(country.id)}
                      >
                        Мир
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}

function LogTab() {
  const game = useGameSnapshot();
  if (!game) return null;
  const events = [...game.events].reverse().slice(0, 60);
  return (
    <div className="panel__section">
      <div className="label" style={{ marginBottom: 5 }}>
        Сводка командования
      </div>
      {events.length === 0 && <div className="tiny muted">Событий пока нет.</div>}
      {events.map((event) => (
        <div className={`log-entry log-entry--${event.kind}`} key={event.id}>
          <span className="log-entry__tick">{formatGameDateShort(event.tick)}</span>
          <span className="log-entry__text">{event.message}</span>
        </div>
      ))}
    </div>
  );
}

