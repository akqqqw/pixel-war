import { useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/store/gameStore';
import { createWorld } from '@/core/state/createGame';
import { paintTerrainLayer } from '@/game/sprites/terrainPainter';
import { formatGameDateShort } from '@/core/time/gameDate';
import { countryDef } from '@/data/countries';
import { HelpDialog, SettingsDialog, SavesDialog } from '@/ui/dialogs/Dialogs';
import { Modal } from '@/ui/components/Modal';

const MENU_SEED = 20260926;

export function MainMenu() {
  const saves = useGameStore((state) => state.saves);
  const setScreen = useGameStore((state) => state.setScreen);
  const continueGame = useGameStore((state) => state.continueGame);
  const deleteSave = useGameStore((state) => state.deleteSave);
  const loading = useGameStore((state) => state.loading);
  const [dialog, setDialog] = useState<'help' | 'settings' | 'saves' | null>(null);
  const [about, setAbout] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [backdropReady, setBackdropReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const world = createWorld(MENU_SEED);
      const terrain = paintTerrainLayer(world);
      canvas.width = 512;
      canvas.height = 320;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrain, 0, 0, 512, 320);
      setBackdropReady(true);
    }, 40);
    return () => window.clearTimeout(timer);
  }, []);

  const newest = saves[0];
  const newestCountry = newest ? countryDef(newest.countryId)?.shortName ?? newest.countryId : null;

  return (
    <div className="menu">
      <div className="menu__backdrop" aria-hidden>
        <canvas ref={canvasRef} style={{ opacity: backdropReady ? 1 : 0, transition: 'opacity 600ms ease' }} />
      </div>
      <div className="menu__vignette" aria-hidden />

      <div className="menu__content">
        <div className="menu__title-block">
          <div className="menu__eyebrow">Pixel War · Grand Strategy</div>
          <h1 className="menu__title">
            Мировое
            <br />
            господство
            <span>Pixel War</span>
          </h1>
          <p className="menu__subtitle">
            Пиксельная военная стратегия о захвате мира. Развивайте экономику, стройте технику,
            перебрасывайте армии и превращайте чужие границы в свои.
          </p>
          <div className="row small muted" style={{ gap: 12 }}>
            <span>Этап 1 · играбельный прототип</span>
            <span>·</span>
            <span>24+ территории</span>
            <span>·</span>
            <span>3 державы</span>
          </div>
        </div>

        <div className="panel menu__panel">
          <div className="panel__head">
            <span>Командный пункт</span>
          </div>
          <div className="panel__body stack">
            <button type="button" className="btn btn--primary" onClick={() => setScreen('countrySelect')}>
              ▶ Новая игра
            </button>
            <button
              type="button"
              className="btn"
              disabled={!newest || loading}
              onClick={() => void continueGame()}
              title={newest ? 'Загрузить последнее сохранение' : 'Сохранений пока нет'}
            >
              ⏵ Продолжить
            </button>
            {newest && (
              <div className="tiny muted" style={{ marginTop: -4 }}>
                {newest.label} · {newestCountry} · {formatGameDateShort(newest.tick)} · {newest.ownedTerritories} терр.
              </div>
            )}
            <button type="button" className="btn" onClick={() => setDialog('saves')} disabled={saves.length === 0}>
              Сохранения ({saves.length})
            </button>
            <button type="button" className="btn" onClick={() => setDialog('help')}>
              Обучение
            </button>
            <button type="button" className="btn" onClick={() => setDialog('settings')}>
              Настройки
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setAbout(true)}>
              Об игре
            </button>
          </div>
        </div>
      </div>

      <div className="menu__version">v0.1.0 · Stage 1 prototype · работает локально</div>
      <div className="menu__hint">Совет: начните с экономики, затем соберите бронекулак</div>

      {dialog === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog === 'saves' && (
        <SavesDialog
          onClose={() => setDialog(null)}
          onDelete={(slot) => void deleteSave(slot)}
        />
      )}
      {about && (
        <Modal title="Об игре" onClose={() => setAbout(false)} size="small">
          <p className="small">
            <strong>Мировое господство: Pixel War</strong> — браузерная пиксельная стратегия в реальном времени.
            Вы управляете государством, развиваете инфраструктуру территорий, производите бронетехнику и
            захватываете соседние регионы. ИИ играет по тем же правилам и тратит те же ресурсы.
          </p>
          <ul className="small muted" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Карта генерируется процедурно: континенты, реки, горы, леса, пустыни.</li>
            <li>Захват территории возможен только после уничтожения гарнизона.</li>
            <li>Сохранение — в IndexedDB, автосохранение каждые 30 игровых часов.</li>
            <li>Технологии: TypeScript, Vite, React, Phaser 3, Zustand, Vitest.</li>
          </ul>
        </Modal>
      )}
    </div>
  );
}
