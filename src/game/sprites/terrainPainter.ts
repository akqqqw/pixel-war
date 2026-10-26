import { hash2d } from '@/core/rng';
import { TERRAIN, TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import type { WorldData } from '@/core/world/world';

/** Pixels per map tile in the painted terrain texture. */
export const TILE_PIXELS = 8;

export type PixelCanvas = HTMLCanvasElement;

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context unavailable');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function px(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/** Small helper: parses #rrggbb into an rgba string. */
function rgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Flat pixel map: one base colour per terrain plus a little ordered noise.
 * Deliberately simple — the political layer on top carries the information.
 */
export function paintTerrainLayer(world: WorldData): HTMLCanvasElement {
  const canvas = createCanvas(world.width * TILE_PIXELS, world.height * TILE_PIXELS);
  const ctx = context(canvas);
  const width = world.width;

  const isWaterAt = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= world.width || y >= world.height) return true;
    const info = TERRAIN_INFO[world.terrain[y * width + x] as TerrainCode];
    return !info || !info.land;
  };

  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const code = world.terrain[index] as TerrainCode;
      const info = TERRAIN_INFO[code] ?? TERRAIN_INFO[TERRAIN.Plains];
      const ox = x * TILE_PIXELS;
      const oy = y * TILE_PIXELS;
      px(ctx, ox, oy, TILE_PIXELS, TILE_PIXELS, info.palette[1]);

      // Two-tone dither keeps a flat map from looking like a solid fill.
      for (let step = 0; step < 3; step += 1) {
        const h = hash2d(x, y, 1000 + step * 37 + (world.seed % 997));
        if (h > 0.72) continue;
        const dx = Math.floor(hash2d(x, y, 2000 + step) * TILE_PIXELS);
        const dy = Math.floor(hash2d(x, y, 3000 + step) * TILE_PIXELS);
        px(ctx, ox + dx, oy + dy, 1, 1, step % 2 === 0 ? info.palette[0] : info.palette[2]);
      }

      if (info.land) {
        // Sandy rim and light surf where land meets water.
        const north = isWaterAt(x, y - 1);
        const south = isWaterAt(x, y + 1);
        const west = isWaterAt(x - 1, y);
        const east = isWaterAt(x + 1, y);
        if (north || south || west || east) {
          if (north) px(ctx, ox, oy, TILE_PIXELS, 1, rgba('#d8c38c', 0.85));
          if (south) px(ctx, ox, oy + TILE_PIXELS - 1, TILE_PIXELS, 1, rgba('#c9b47e', 0.85));
          if (west) px(ctx, ox, oy, 1, TILE_PIXELS, rgba('#d8c38c', 0.7));
          if (east) px(ctx, ox + TILE_PIXELS - 1, oy, 1, TILE_PIXELS, rgba('#c9b47e', 0.7));
        }
      } else if (info.water) {
        // A hint of waves along the shore.
        if (!isWaterAt(x, y - 1) || !isWaterAt(x - 1, y) || !isWaterAt(x + 1, y)) {
          px(ctx, ox, oy, TILE_PIXELS, 1, rgba('#cfe4f2', 0.35));
        }
      }

      if (world.river[index]) {
        px(ctx, ox + 2, oy, 4, TILE_PIXELS, '#2f6f9e');
        px(ctx, ox + 3, oy, 2, TILE_PIXELS, '#4a8fb5');
      }
    }
  }

  return canvas;
}
