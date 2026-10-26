import { useEffect, useState } from 'react';
import { playerOffensive, useGameStore } from '@/store/gameStore';

const STORAGE_KEY = 'pixel-war-coach-v1';

interface Step {
  title: string;
  text: string;
  /** Turns green as soon as the player really does it. */
  done: (snapshot: {
    ownSelected: boolean;
    hasOrder: boolean;
    built: number;
  }) => boolean;
}

const STEPS: Step[] = [
  {
    title: 'Своя клетка',
    text: 'Нажмите на клетку своего цвета — откроется карточка с армией и мобилизацией.',
    done: (snapshot) => snapshot.ownSelected,
  },
  {
    title: 'Направление удара',
    text: 'Теперь нажмите на соседнюю вражескую клетку: появится ползунок «Отправить армию».',
    done: (snapshot) => snapshot.hasOrder,
  },
  {
    title: 'Экономика',
    text: 'Внизу три вкладки. Выберите завод на вкладке «Экономика» и поставьте его на своей клетке.',
    done: (snapshot) => snapshot.built > 0,
  },
];

function readDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'done';
  } catch {
    return false;
  }
}

function rememberDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'done');
  } catch {
    // Storage unavailable — the coach simply appears next launch again.
  }
}

/**
 * First-campaign coaching: three short cards that tick themselves off when the
 * player performs the action. It disappears for good once all three are done.
 */
export function Coach() {
  const game = useGameStore((state) => state.game);
  const selectedCell = useGameStore((state) => state.selectedCell);
  const revision = useGameStore((state) => state.revision);
  const [finished, setFinished] = useState(readDone);
  const [step, setStep] = useState(0);
  void revision;

  const ownSelected =
    !!game &&
    selectedCell !== null &&
    (game.cellOwner[selectedCell] ?? -1) === game.countryOrder.indexOf(game.playerCountryId);
  const hasOrder = !!playerOffensive(game) || useGameStore.getState().orderDraft !== null;
  const built = game ? game.countries[game.playerCountryId]?.stats.built ?? 0 : 0;

  const values = { ownSelected, hasOrder, built };

  useEffect(() => {
    if (finished) return;
    // Jump to the first unfinished step so the card always shows the next move.
    const next = STEPS.findIndex((entry) => !entry.done(values));
    if (next === -1) {
      setFinished(true);
      rememberDone();
      return;
    }
    setStep(next);
  }, [finished, ownSelected, hasOrder, built]);

  if (finished || !game || game.status !== 'playing') return null;
  const current = STEPS[step];
  if (!current) return null;

  return (
    <div className="coach" role="status">
      <div className="coach__head">
        <span className="coach__dots">
          {STEPS.map((entry, index) => (
            <i
              key={entry.title}
              className={`coach__dot ${entry.done(values) ? 'coach__dot--done' : ''} ${
                index === step ? 'coach__dot--active' : ''
              }`}
            />
          ))}
        </span>
        <span className="coach__title">{current.title}</span>
        <button
          type="button"
          className="icon-btn icon-btn--tiny"
          onClick={() => {
            setFinished(true);
            rememberDone();
          }}
          title="Скрыть обучение"
        >
          ✕
        </button>
      </div>
      <p className="coach__text">{current.text}</p>
    </div>
  );
}
