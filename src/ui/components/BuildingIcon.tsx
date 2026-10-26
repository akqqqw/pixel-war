import { useEffect, useRef } from 'react';
import { BUILDING_GLYPHS, GLYPH_SIZE } from '@/game/sprites/buildingGlyphs';
import type { BuildingKind } from '@/core/buildings/buildings';

interface BuildingIconProps {
  kind: BuildingKind;
  size?: number;
  dim?: boolean;
}

/** Pixel glyph rendered into a small canvas, scaled with nearest-neighbour. */
export function BuildingIcon({ kind, size = 20, dim = false }: BuildingIconProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, GLYPH_SIZE, GLYPH_SIZE);
    BUILDING_GLYPHS[kind](ctx);
  }, [kind]);

  return (
    <canvas
      ref={ref}
      className="pixel-icon"
      width={GLYPH_SIZE}
      height={GLYPH_SIZE}
      style={{ width: size, height: size, opacity: dim ? 0.45 : 1 }}
      aria-hidden="true"
    />
  );
}
