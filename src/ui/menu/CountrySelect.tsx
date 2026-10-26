import { useState } from 'react';
import { COUNTRIES } from '@/data/countries';
import { useGameStore } from '@/store/gameStore';
import type { Difficulty } from '@/core/state/types';

const DIFFICULTIES: { value: Difficulty; label: string; hint: string }[] = [
  { value: 'easy', label: 'Лёгкая', hint: 'ИИ осторожен' },
  { value: 'normal', label: 'Обычная', hint: 'ИИ воюет расчётливо' },
  { value: 'hard', label: 'Сложная', hint: 'ИИ давит с первых часов' },
];

export function CountrySelect() {
  const pendingCountry = useGameStore((state) => state.pendingCountry);
  const chooseCountry = useGameStore((state) => state.chooseCountry);
  const startNewGame = useGameStore((state) => state.startNewGame);
  const setScreen = useGameStore((state) => state.setScreen);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  return (
    <main className="select">
      <header className="select__head">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setScreen('menu')}>
          ← Назад
        </button>
        <h1>Выбор государства</h1>
      </header>

      <div className="select__countries">
        {COUNTRIES.map((country) => {
          const active = country.id === pendingCountry;
          return (
            <button
              key={country.id}
              type="button"
              className={`country ${active ? 'country--active' : ''}`}
              style={{ borderColor: active ? country.colors.primary : undefined }}
              onClick={() => chooseCountry(country.id)}
            >
              <span className="country__flag" style={{ background: country.colors.primary }} />
              <span className="country__name">{country.name}</span>
              <span className="country__motto">{country.motto}</span>
              <span className="country__desc">{country.description}</span>
              <span className="country__bonus">
                <strong>{country.bonus.name}</strong>
                <span>{country.bonus.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="select__footer">
        <div className="difficulty">
          {DIFFICULTIES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`chip ${difficulty === option.value ? 'chip--active' : ''}`}
              title={option.hint}
              onClick={() => setDifficulty(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => startNewGame(pendingCountry, difficulty)}
        >
          Начать кампанию
        </button>
      </div>
    </main>
  );
}
