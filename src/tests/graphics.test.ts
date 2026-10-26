import { describe, expect, it } from 'vitest';
import { createWorld } from '@/core/state/createGame';
import { paintTerrainLayer, TILE_PIXELS } from '@/game/sprites/terrainPainter';
import { renderUnitSprite } from '@/game/sprites/unitSprites';
import { renderCitySprite } from '@/game/sprites/citySprites';
import { iconDataUrl } from '@/game/sprites/uiIcons';
import { LAND_UNIT_TYPES } from '@/core/units/unitTypes';
import { mixHex, paintRows, px, shade } from '@/game/sprites/canvas';

interface PixelStats {
  opaque: number;
  colors: Set<string>;
  signature: string;
}

function stats(canvas: { width: number; height: number; getContext: (type: '2d') => unknown }): PixelStats {
  const ctx = canvas.getContext('2d') as {
    getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
  };
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let opaque = 0;
  const colors = new Set<string>();
  let signature = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) < 8) continue;
    opaque += 1;
    colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    signature = (signature * 31 + (data[i] ?? 0) + (data[i + 1] ?? 0) * 3 + (data[i + 2] ?? 0) * 7) % 1_000_000_007;
  }
  return { opaque, colors, signature: String(signature) };
}

describe('pixel art painters', () => {
  it('paints the whole terrain with a varied palette', () => {
    const world = createWorld(321);
    const canvas = paintTerrainLayer(world) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    expect(canvas.width).toBe(world.width * TILE_PIXELS);
    expect(canvas.height).toBe(world.height * TILE_PIXELS);
    const result = stats(canvas);
    expect(result.opaque).toBeGreaterThan(world.width * world.height * TILE_PIXELS * TILE_PIXELS * 0.9);
    expect(result.colors.size).toBeGreaterThanOrEqual(30);
  });

  it('paints distinct unit sprites for every unit type', () => {
    const signatures = new Map<string, string>();
    for (const type of LAND_UNIT_TYPES) {
      const canvas = renderUnitSprite(type, { tint: '#3f81d8', frame: 0 }) as unknown as {
        width: number;
        height: number;
        getContext: (type: '2d') => unknown;
      };
      expect(canvas.width).toBe(32);
      expect(canvas.height).toBe(32);
      const result = stats(canvas);
      expect(result.opaque, type).toBeGreaterThan(80);
      expect(result.opaque, type).toBeLessThan(32 * 32);
      signatures.set(type, result.signature);
    }
    expect(new Set(signatures.values()).size).toBe(LAND_UNIT_TYPES.length);
  });

  it('animates tank treads between the two frames', () => {
    const first = renderUnitSprite('mbt', { tint: '#3f81d8', frame: 0 }) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    const second = renderUnitSprite('mbt', { tint: '#3f81d8', frame: 1 }) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    expect(stats(first).signature).not.toBe(stats(second).signature);
  });

  it('tints units with the owner colour', () => {
    const blue = renderUnitSprite('mbt', { tint: '#3f81d8', frame: 0 }) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    const red = renderUnitSprite('mbt', { tint: '#d1473f', frame: 0 }) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    expect(stats(blue).signature).not.toBe(stats(red).signature);
  });

  it('paints city sprites and differentiates capitals', () => {
    const town = renderCitySprite('#46a05e', false) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    const capital = renderCitySprite('#46a05e', true) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    expect(stats(town).opaque).toBeGreaterThan(150);
    expect(stats(capital).opaque).toBeGreaterThan(stats(town).opaque);
    expect(stats(capital).signature).not.toBe(stats(town).signature);
  });

  it('builds UI icon data URLs', () => {
    for (const name of ['money', 'metal', 'oil', 'energy', 'army', 'factory', 'flag', 'paper', 'speed', 'shield']) {
      const url = iconDataUrl(name);
      expect(url.startsWith('data:image/png;base64,')).toBe(true);
      expect(url.length).toBeGreaterThan(200);
      expect(iconDataUrl(name)).toBe(url);
    }
  });

  it('exposes reusable colour and row helpers', () => {
    expect(shade('#808080', 0.5)).toBe('#c0c0c0');
    expect(shade('#808080', -0.5)).toBe('#404040');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    const canvas = paintRows(['.#.', '###'], { '#': '#ff0000' }) as unknown as {
      width: number;
      height: number;
      getContext: (type: '2d') => unknown;
    };
    expect(canvas.width).toBe(3);
    expect(canvas.height).toBe(2);
    expect(stats(canvas).opaque).toBe(4);
    const direct = px as unknown as (ctx: unknown, x: number, y: number, w: number, h: number, color: string) => void;
    expect(typeof direct).toBe('function');
  });
});
