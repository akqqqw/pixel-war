import { describe, expect, it } from 'vitest';
import { createCanvas, context } from '@/game/sprites/terrainPainter';
import { paintTerrainLayer, TILE_PIXELS } from '@/game/sprites/terrainPainter';
import { BUILDING_GLYPHS, GLYPH_SIZE, buildingGlyphCanvas } from '@/game/sprites/buildingGlyphs';
import { BUILDING_KINDS } from '@/core/buildings/buildings';
import { createWorld } from '@/core/state/createGame';

function opaquePixels(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let count = 0;
  for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) count += 1;
  return count;
}

describe('pixel art layers', () => {
  it('paints a full-size terrain layer with land and water', () => {
    const world = createWorld(4242);
    const canvas = paintTerrainLayer(world);
    expect(canvas.width).toBe(world.width * TILE_PIXELS);
    expect(canvas.height).toBe(world.height * TILE_PIXELS);
    expect(opaquePixels(canvas)).toBeGreaterThan(canvas.width * canvas.height * 0.5);
  });

  it('draws every structure glyph without empty cells', () => {
    expect(BUILDING_KINDS).toHaveLength(Object.keys(BUILDING_GLYPHS).length);
    for (const kind of BUILDING_KINDS) {
      const canvas = buildingGlyphCanvas(kind);
      expect(canvas.width).toBe(GLYPH_SIZE);
      expect(opaquePixels(canvas)).toBeGreaterThan(10);
    }
  });

  it('creates offscreen canvases that can be reused', () => {
    const canvas = createCanvas(4, 4);
    const ctx = context(canvas);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(0, 0, 2, 2);
    expect(opaquePixels(canvas)).toBe(4);
  });
});
