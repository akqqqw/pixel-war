import { useState } from 'react';
import {
  BUILDINGS,
  TAB_LABELS,
  TAB_ORDER,
  buildingEffect,
  buildingsOfTab,
  type BuildingTab,
} from '@/core/buildings/buildings';
import { useGameStore } from '@/store/gameStore';
import { BuildingIcon } from '@/ui/components/BuildingIcon';
import { playerCountry } from '@/ui/helpers/game';
import { formatMoney } from '@/ui/helpers/format';

/**
 * Slim bottom bar. The three tabs open a short horizontal strip of buildings
 * above the bar; picking one arms the placement mode and the map stays visible.
 */
export function BottomPanel() {
  const [tab, setTab] = useState<BuildingTab | null>(null);
  const game = useGameStore((state) => state.game);
  const revision = useGameStore((state) => state.revision);
  const buildingChoice = useGameStore((state) => state.buildingChoice);
  const strikeBuildingId = useGameStore((state) => state.strikeBuildingId);
  const orderDraft = useGameStore((state) => state.orderDraft);
  const chooseBuilding = useGameStore((state) => state.chooseBuilding);
  const cancelStrike = useGameStore((state) => state.cancelStrike);
  const cancelDraft = useGameStore((state) => state.cancelDraft);
  void revision;

  const country = playerCountry(game);
  if (!game || !country) return null;

  const toggle = (value: BuildingTab): void => {
    setTab((current) => (current === value ? null : value));
    chooseBuilding(null);
  };

  const cards = tab ? buildingsOfTab(tab) : [];
  const hint = buildingChoice
    ? `Кликните по своей клетке: ${BUILDINGS[buildingChoice].name}`
    : strikeBuildingId
      ? 'Кликните по вражеской клетке — цель удара'
      : orderDraft
        ? 'Выберите силу удара и подтвердите наступление'
        : null;

  return (
    <section className="bottom">
      {tab && cards.length > 0 ? (
        <div className="strip">
          {cards.map((def) => {
            const affordable = country.money >= def.cost;
            const active = buildingChoice === def.kind;
            return (
              <button
                key={def.kind}
                type="button"
                className={`strip-card ${active ? 'strip-card--active' : ''} ${affordable ? '' : 'strip-card--poor'}`}
                title={`${def.name}. ${def.desc}`}
                onClick={() => chooseBuilding(active ? null : def.kind)}
              >
                <BuildingIcon kind={def.kind} size={20} dim={!affordable} />
                <span className="strip-card__body">
                  <span className="strip-card__name">{def.name}</span>
                  <span className="strip-card__effect">{buildingEffect(def.kind)}</span>
                </span>
                <span className="strip-card__cost">{formatMoney(def.cost)}</span>
              </button>
            );
          })}
          <button type="button" className="strip-close" onClick={() => setTab(null)} title="Свернуть">
            ✕
          </button>
        </div>
      ) : null}

      <div className="bottom__bar">
        <div className="bottom__tabs">
          {TAB_ORDER.map((value) => (
            <button
              key={value}
              type="button"
              className={`tab ${tab === value ? 'tab--active' : ''}`}
              onClick={() => toggle(value)}
            >
              {TAB_LABELS[value]}
            </button>
          ))}
        </div>
        <div className="bottom__hint">
          {hint ? (
            <span className="bottom__hint-text">
              {hint}
              <button
                type="button"
                className="icon-btn icon-btn--tiny"
                onClick={() => {
                  cancelDraft();
                  cancelStrike();
                  chooseBuilding(null);
                }}
                title="Отменить режим"
              >
                ✕
              </button>
            </span>
          ) : (
            <span className="bottom__hint-text muted">Выберите свою клетку, затем вражескую — и задайте силу удара</span>
          )}
        </div>
      </div>
    </section>
  );
}
