import { useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { COUNTRIES } from '@/data/countries';
import type { CountryDef } from '@/core/countries/country';
import type { Difficulty } from '@/core/state/types';
import type { CountryId, Resources } from '@/core/types';
import { DEFAULT_STARTING_RESOURCES } from '@/core/state/createGame';
import { Panel } from '@/ui/components/Panel';
import { uiIcon } from '@/ui/helpers/icons';
import { formatInt } from '@/ui/helpers/format';

const DIFFICULTIES: { id: Difficulty; name: string; description: string }[] = [
  { id: 'easy', name: 'Лёгкий', description: 'ИИ развивается медленно и редко атакует.' },
  { id: 'normal', name: 'Средний', description: 'Сбалансированная экономика и армия.' },
  { id: 'hard', name: 'Сложный', description: 'ИИ быстро расширяется и использует разные войска.' },
];

function startingResources(country: CountryDef): Resources {
  const resources = { ...DEFAULT_STARTING_RESOURCES };
  if (country.bonus.resources) {
    for (const key of Object.keys(resources) as (keyof Resources)[]) {
      resources[key] += country.bonus.resources[key] ?? 0;
    }
  }
  return resources;
}

export function CountrySelect() {
  const setScreen = useGameStore((state) => state.setScreen);
  const startNewGame = useGameStore((state) => state.startNewGame);
  const pendingCountry = useGameStore((state) => state.pendingCountry);
  const [selected, setSelected] = useState<CountryId>(pendingCountry ?? COUNTRIES[0]!.id);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  const country = COUNTRIES.find((item) => item.id === selected) ?? COUNTRIES[0]!;
  const resources = startingResources(country);

  return (
    <div className="screen">
      <div className="screen__head">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScreen('menu')}>
          ← Назад
        </button>
        <div>
          <h1 className="screen__title">Выбор государства</h1>
          <div className="tiny muted">Три вымышленные державы на упрощённой карте мира. Каждая начинает с 9–10 территорий.</div>
        </div>
      </div>

      <div className="country-grid">
        {COUNTRIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`country-card ${item.id === selected ? 'country-card--active' : ''}`}
            onClick={() => setSelected(item.id)}
          >
            <div
              className="country-card__flag"
              style={{ background: `linear-gradient(180deg, ${item.colors.accent}, ${item.colors.primary})` }}
            >
              {item.shortName}
            </div>
            <div>
              <h2 className="country-card__name">{item.name}</h2>
              <div className="tiny muted" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Столица: {item.capitalName}
              </div>
            </div>
            <div className="country-card__desc">{item.description}</div>
            <div className="tiny" style={{ color: 'var(--muted)' }}>
              «{item.motto}»
            </div>
            <div className="bonus-box">
              <strong>{item.bonus.name}</strong>
              {item.bonus.description}
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 16, marginTop: 18 }}>
        <Panel title="Сложность ИИ">
          <div className="difficulty-row" style={{ margin: 0 }}>
            {DIFFICULTIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`btn ${difficulty === item.id ? 'btn--primary' : ''}`}
                onClick={() => setDifficulty(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            {DIFFICULTIES.find((item) => item.id === difficulty)?.description}
          </div>
          <div className="divider" />
          <div className="small muted">
            ИИ не получает бонусных ресурсов: он строит технику и развивает территории по тем же правилам,
            что и игрок. Сложность меняет темп решений и агрессивность.
          </div>
        </Panel>

        <Panel title="Стартовые условия">
          <div className="row wrap" style={{ gap: 10 }}>
            {(['money', 'metal', 'oil', 'energy'] as const).map((key) => (
              <div className="resource" key={key} style={{ minWidth: 108 }}>
                <img src={uiIcon(key)} alt="" />
                <div className="stack" style={{ gap: 0 }}>
                  <span className="resource__value">{formatInt(resources[key])}</span>
                  <span className="tiny muted">
                    {key === 'money' ? 'деньги' : key === 'metal' ? 'металл' : key === 'oil' ? 'нефть' : 'энергия'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <div className="small">
            <div className="row row--between">
              <span className="muted">Территории</span>
              <strong>9–10</strong>
            </div>
            <div className="row row--between">
              <span className="muted">Стартовая армия</span>
              <strong>гарнизоны + техника столицы</strong>
            </div>
            <div className="row row--between">
              <span className="muted">Столица</span>
              <strong>{country.capitalName}</strong>
            </div>
          </div>
        </Panel>
      </div>

      <div className="row" style={{ marginTop: 18, justifyContent: 'flex-end', gap: 12 }}>
        <div className="small muted">
          Вы: <strong style={{ color: country.colors.primary }}>{country.shortName}</strong> · сложность:{' '}
          {DIFFICULTIES.find((item) => item.id === difficulty)?.name}
        </div>
        <button
          type="button"
          className="btn btn--primary"
          style={{ padding: '12px 22px', fontSize: 14 }}
          onClick={() => startNewGame(country.id, difficulty)}
        >
          Начать кампанию ▶
        </button>
      </div>
    </div>
  );
}
