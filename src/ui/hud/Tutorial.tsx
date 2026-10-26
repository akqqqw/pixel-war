import { useGameStore } from '@/store/gameStore';

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Добро пожаловать, главнокомандующий',
    text: 'Вы управляете одной из трёх держав. Цель — мировое господство: захватить все территории или уничтожить противников. Карту можно тащить мышью или пальцем, а масштаб менять колесом или щипком.',
  },
  {
    title: 'Выберите свою территорию',
    text: 'Клик по региону открывает правую панель: население, доход, укрепления и гарнизон. Зелёная точка — ваша земля, красная — чужая.',
  },
  {
    title: 'Развивайте экономику',
    text: 'Нажмите «Развивать» в правой панели, чтобы поднять уровень инфраструктуры: вырастут доход и оборона. Деньги, металл, нефть и энергия приходят каждый игровой час.',
  },
  {
    title: 'Производите технику',
    text: 'В блоке производства выберите ОБТ, БТР, БМП, САУ или РСЗО. Заказ стоит ресурсов и времени; готовая машина встаёт в гарнизон.',
  },
  {
    title: 'Захватывайте территории',
    text: 'Нажмите «Перебросить войска», выберите состав отряда и цель. Если на цели есть гарнизон — начнётся бой; пустая территория переходит под контроль без боя.',
  },
  {
    title: 'Побеждайте',
    text: 'Следите за дипломатией и журналом событий, держите оборону границ и наращивайте армию. Победа — когда вся карта или все враги под вашим контролем. Удачи!',
  },
];

export function Tutorial() {
  const step = useGameStore((state) => state.tutorialStep);
  const advance = useGameStore((state) => state.advanceTutorial);
  const close = useGameStore((state) => state.closeTutorial);
  if (step <= 0) return null;
  const current = STEPS[Math.min(step - 1, STEPS.length - 1)];
  if (!current) return null;

  return (
    <div className="tutorial">
      <div className="tutorial__card">
        <div className="row row--between">
          <span className="tutorial__step">
            Обучение · шаг {step} из {STEPS.length}
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={close}>
            Пропустить
          </button>
        </div>
        <h3 className="tutorial__title">{current.title}</h3>
        <p className="tutorial__text">{current.text}</p>
        <div className="row row--between" style={{ marginTop: 10 }}>
          <div className="row" style={{ gap: 3 }}>
            {STEPS.map((_, index) => (
              <span
                key={index}
                style={{
                  width: 8,
                  height: 8,
                  background: index + 1 <= step ? 'var(--amber)' : '#2a4560',
                  display: 'block',
                }}
              />
            ))}
          </div>
          <button type="button" className="btn btn--primary btn--sm" onClick={advance}>
            {step >= STEPS.length ? 'Начать кампанию' : 'Далее →'}
          </button>
        </div>
      </div>
    </div>
  );
}
