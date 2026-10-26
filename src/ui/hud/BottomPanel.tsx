import { useState } from 'react';
import { BALANCE } from '@/core/sim/balance';
import {
  BUILDINGS,
  TAB_LABELS,
  TAB_ORDER,
  buildingEffect,
  buildingsOfTab,
  type BuildingTab,
} from '@/core/buildings/buildings';
import { useGameStore } from '@/store/gameStore';
import { attackStrength, territoryEffects } from '@/core/sim/effects';
import { canBuild, maxRecruit } from '@/core/sim/actions';
import { formatPopulation, formatSigned } from '@/ui/helpers/format';
import {
  activeWars,
  isBorder,
  playerCountry,
  selectedStatic,
  selectedTerritory,
  territoryDefense,
} from '@/ui/helpers/game';

/** How many soldiers one click of the recruit button asks for. */
const RECRUIT_STEP = 25;

export function BottomPanel() {
  const [tab, setTab] = useState<BuildingTab>('economy');
  const game = useGameStore((state) => state.game);
  const revision = useGameStore((state) => state.revision);
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const buildingChoice = useGameStore((state) => state.buildingChoice);
  const transferFrom = useGameStore((state) => state.transferFrom);
  const chooseBuilding = useGameStore((state) => state.chooseBuilding);
  const recruitHere = useGameStore((state) => state.recruitHere);
  const startTransfer = useGameStore((state) => state.startTransfer);
  const cancelTransfer = useGameStore((state) => state.cancelTransfer);
  const declareWarOn = useGameStore((state) => state.declareWarOn);
  const makePeaceWith = useGameStore((state) => state.makePeaceWith);
  void revision;

  const country = playerCountry(game);
  const territory = selectedTerritory(game, selectedId);
  const staticTerritory = selectedStatic(game, selectedId);
  const isOwn = !!territory && territory.owner === country?.id;
  const effects = territory ? territoryEffects(territory) : null;
  const wars = activeWars(game);
  const cards = buildingsOfTab(tab);

  if (!game || !country) return null;

  // How hard the strongest own army next to the selected region can push.
  const borderAttack =
    staticTerritory && !isOwn
      ? staticTerritory.neighbors
          .filter((id) => game.territories[id]?.owner === country.id)
          .reduce((best, id) => Math.max(best, attackStrength(game, id)), 0)
      : 0;
  const recruitAmount = Math.min(RECRUIT_STEP, selectedId ? maxRecruit(game, selectedId) : 0);
  const recruitCost = Math.round(recruitAmount * BALANCE.recruitCost);
  const canRecruit =
    isOwn && recruitAmount >= 1 && country.money >= recruitCost && game.status === 'playing';

  return (
    <section className="bottom">
      <div className="bottom__tabs">
        {TAB_ORDER.map((value) => (
          <button
            key={value}
            type="button"
            className={`tab ${tab === value ? 'tab--active' : ''}`}
            onClick={() => setTab(value)}
          >
            {TAB_LABELS[value]}
          </button>
        ))}
        <div className="bottom__hint">
          {buildingChoice
            ? `Кликните по своей территории, чтобы построить: ${BUILDINGS[buildingChoice].name}`
            : transferFrom
              ? 'Кликните по соседней своей территории, чтобы перебросить половину армии'
              : wars.length > 0
                ? `Война: ${wars.map((countryInWar) => countryInWar.shortName).join(', ')}`
                : 'Мирное время — развивайте экономику'}
        </div>
      </div>

      <div className="bottom__body">
        <div className="cards">
          {cards.map((def) => {
            const owned = territory?.buildings.filter((building) => building.kind === def.kind).length ?? 0;
            const check = selectedId ? canBuild(game, country.id, selectedId, def.kind) : { ok: false, message: '' };
            const affordable = country.money >= def.cost;
            const active = buildingChoice === def.kind;
            return (
              <button
                key={def.kind}
                type="button"
                className={`card ${active ? 'card--active' : ''} ${!affordable ? 'card--poor' : ''}`}
                title={`${def.name}. ${def.desc}`}
                onClick={() => chooseBuilding(active ? null : def.kind)}
              >
                <span className="card__head">
                  <span className="card__name">{def.name}</span>
                  <span className="card__cost">{def.cost} ₽</span>
                </span>
                <span className="card__effect">{buildingEffect(def)}</span>
                <span className="card__meta">
                  {owned}/{def.limit} · {def.tab === 'security' ? `радиус ${def.radius}` : def.desc}
                </span>
                {!check.ok && isOwn && check.message ? <span className="card__warn">{check.message}</span> : null}
                {active ? <span className="card__active-hint">выбрано — кликните по территории</span> : null}
              </button>
            );
          })}
        </div>

        <div className="selection">
          {!territory || !staticTerritory ? (
            <p className="selection__empty">Кликните по территории на карте</p>
          ) : (
            <>
              <div className="selection__head">
                <span className="selection__dot" style={{ background: game.countries[territory.owner ?? '']?.color }} />
                <strong>{staticTerritory.name}</strong>
                <span className="selection__owner">
                  {territory.owner ? game.countries[territory.owner]?.shortName : 'нейтральная'}
                </span>
                {isBorder(game, staticTerritory.id) ? <span className="tag">граница</span> : null}
              </div>
              <div className="selection__stats">
                <span>Люди {formatPopulation(territory.population)}</span>
                <span>Армия {Math.round(territory.army)}</span>
                <span>Доход {formatSigned(territory.income)} ₽/ч</span>
                <span>Оборона {territoryDefense(game, staticTerritory.id)}</span>
                {effects && effects.buildings > 0 ? <span>Зданий {effects.buildings}</span> : null}
                {!isOwn && borderAttack > 0 ? (
                  <span className={borderAttack > territoryDefense(game, staticTerritory.id) ? 'selection__push' : ''}>
                    Ваша граница {Math.round(borderAttack)}
                  </span>
                ) : null}
              </div>
              <div className="selection__actions">
                {isOwn ? (
                  <>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      disabled={!canRecruit}
                      onClick={() => selectedId && recruitHere(selectedId, recruitAmount)}
                      title="Призвать армию из населения"
                    >
                      Призвать +{recruitAmount} ({recruitCost} ₽)
                    </button>
                    {transferFrom === selectedId ? (
                      <button type="button" className="btn btn--sm" onClick={cancelTransfer}>
                        Отменить переброску
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--sm"
                        onClick={() => selectedId && startTransfer(selectedId)}
                        title="Перебросить половину армии на соседнюю свою территорию"
                      >
                        Перебросить
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    {territory.owner && !country.warWith.includes(territory.owner) ? (
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        onClick={() => territory.owner && declareWarOn(territory.owner)}
                      >
                        Объявить войну
                      </button>
                    ) : null}
                    {territory.owner && country.warWith.includes(territory.owner) ? (
                      <>
                        <span className="tag tag--war">война</span>
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => territory.owner && makePeaceWith(territory.owner)}
                        >
                          Мир
                        </button>
                      </>
                    ) : null}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
