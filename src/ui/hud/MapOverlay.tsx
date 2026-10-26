import { useEffect, useRef } from 'react';
import { useGameStore } from '@/store/gameStore';
import { useGameSnapshot, playerCountry, territoryDefense } from '@/ui/helpers/game';
import { formatInt } from '@/ui/helpers/format';
import { emitCameraCommand } from '@/game/bridge';
import { useUiStore } from '@/ui/state/uiStore';

function Minimap() {
  const game = useGameSnapshot();
  const revision = useGameStore((state) => state.revision);
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const focusTerritory = useGameStore((state) => state.focusTerritory);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !game) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = game.world;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = '168px';
    canvas.style.height = `${Math.round((height / width) * 168)}px`;
    const image = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i += 1) {
      const region = game.world.tileTerritory[i] ?? -1;
      const r = image.data;
      if (region < 0) {
        r[i * 4] = 16;
        r[i * 4 + 1] = 32;
        r[i * 4 + 2] = 54;
        r[i * 4 + 3] = 255;
        continue;
      }
      const territory = game.world.territories[region];
      const state = territory ? game.territories[territory.id] : undefined;
      const country = state ? game.countries[state.owner] : undefined;
      if (!country) continue;
      const hex = country.color.replace('#', '');
      r[i * 4] = parseInt(hex.slice(0, 2), 16);
      r[i * 4 + 1] = parseInt(hex.slice(2, 4), 16);
      r[i * 4 + 2] = parseInt(hex.slice(4, 6), 16);
      r[i * 4 + 3] = 255;
      if (territory && territory.id === selectedId) {
        r[i * 4] = 255;
        r[i * 4 + 1] = 240;
        r[i * 4 + 2] = 180;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [game, selectedId, revision]);

  return (
    <div
      className="minimap"
      title="Мини-карта: кликните, чтобы перейти"
      onMouseDown={(event) => {
        const canvas = canvasRef.current;
        if (!canvas || !game) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.floor(((event.clientX - rect.left) / rect.width) * game.world.width);
        const y = Math.floor(((event.clientY - rect.top) / rect.height) * game.world.height);
        if (x < 0 || y < 0 || x >= game.world.width || y >= game.world.height) return;
        const region = game.world.tileTerritory[y * game.world.width + x] ?? -1;
        if (region < 0) return;
        const territory = game.world.territories[region];
        if (territory) focusTerritory(territory.id);
      }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

export function MapOverlay() {
  const game = useGameSnapshot();
  const player = game ? playerCountry(game) : null;
  const selectedId = useGameStore((state) => state.selectedTerritoryId);
  const focusTerritory = useGameStore((state) => state.focusTerritory);
  const meta = game && selectedId ? game.world.territories.find((t) => t.id === selectedId) : undefined;
  const selectedState = selectedId && game ? game.territories[selectedId] : undefined;

  return (
    <div className="map-overlay">
      <div className="map-overlay__top">
        <div className="map-hint">
          <strong style={{ color: 'var(--amber)' }}>Управление</strong>
          <div style={{ marginTop: 2 }}>
            Тяните карту мышью или пальцем · колесо/щипок — масштаб · клик — выбрать территорию.
            {meta && selectedState && (
              <div style={{ marginTop: 4 }}>
                Выбрано: <strong>{meta.name}</strong> · оборона {formatInt(territoryDefense(game!, meta.id))}
                {' · '}
                {game?.countries[selectedState.owner]?.name ?? '—'}
              </div>
            )}
          </div>
        </div>
        <Minimap />
      </div>
      <div className="map-overlay__bottom">
        <div className="map-hint" style={{ maxWidth: 240 }}>
          {player?.deficit.oil && <div style={{ color: 'var(--amber)' }}>⚠ Нет топлива: марши замедлены</div>}
          {player?.deficit.money && <div style={{ color: 'var(--amber)' }}>⚠ Нет денег: производство замедлено</div>}
          {!player?.deficit.oil && !player?.deficit.money && (
            <div className="muted">Совет: развивайте инфраструктуру и держите гарнизоны на границах.</div>
          )}
        </div>
        <div className="zoom-controls">
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => emitCameraCommand({ type: 'zoomOut' })} title="Уменьшить">
            −
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => emitCameraCommand({ type: 'zoomIn' })} title="Увеличить">
            +
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => {
              const capital = player?.capitalTerritoryId;
              if (capital) focusTerritory(capital);
            }}
            title="К столице"
          >
            ⌂
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => useUiStore.getState().openDialog({ type: 'help' })}
            title="Обучение"
          >
            ?
          </button>
        </div>
      </div>
    </div>
  );
}
