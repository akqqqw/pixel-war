import { hash2d } from '@/core/rng';
import { TERRAIN, TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import type { WorldData } from '@/core/world/world';
import { createCanvas, context, dot, mixHex, px, shade, type PixelCanvas } from '@/game/sprites/canvas';

export const TILE_PIXELS = 8;

function tileHash(x: number, y: number, seed: number, salt = 0): number {
  return hash2d(x * 3 + salt, y * 5 + salt * 7, seed);
}

function fillTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  color: string,
): void {
  px(ctx, ox, oy, TILE_PIXELS, TILE_PIXELS, color);
}

function paintOcean(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
  elevated: boolean,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Ocean].palette;
  fillTile(ctx, ox, oy, elevated ? palette[2] : palette[1]);
  const h = tileHash(x, y, seed, 1);
  if (h > 0.72) {
    const wy = 1 + Math.floor(tileHash(x, y, seed, 2) * 6);
    px(ctx, ox + 1, oy + wy, 3, 1, palette[2]);
    px(ctx, ox + 5, oy + ((wy + 3) % 7), 2, 1, shade(palette[2], 0.1));
  }
  if (h < 0.18) {
    px(ctx, ox + 2, oy + 4, 2, 1, shade(palette[1], -0.18));
  }
}

function paintShallow(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Shallow].palette;
  fillTile(ctx, ox, oy, palette[1]);
  const h = tileHash(x, y, seed, 3);
  if (h > 0.5) {
    const wy = 1 + Math.floor(tileHash(x, y, seed, 4) * 5);
    px(ctx, ox + 1, oy + wy, 4, 1, palette[2]);
  }
  if (h < 0.25) {
    px(ctx, ox + 4, oy + 2, 2, 1, shade(palette[1], -0.15));
  }
}

function paintPlains(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Plains].palette;
  const variant = tileHash(x, y, seed, 60);
  fillTile(ctx, ox, oy, palette[1]);
  // gentle grass speckle so large plains never look flat
  for (let i = 0; i < 3; i += 1) {
    const sx = ox + Math.floor(tileHash(x + i, y, seed, 61 + i) * 7);
    const sy = oy + Math.floor(tileHash(x, y + i, seed, 71 + i) * 7);
    dot(ctx, sx, sy, i === 0 ? palette[0] : palette[2]);
  }
  if (variant < 0.2) {
    // ploughed strips
    px(ctx, ox, oy + 2, 8, 1, shade(palette[1], -0.14));
    px(ctx, ox, oy + 4, 8, 1, palette[2]);
    px(ctx, ox, oy + 6, 8, 1, shade(palette[1], -0.1));
  } else if (variant < 0.45) {
    // grass tufts
    for (let i = 0; i < 3; i += 1) {
      const gx = ox + 1 + Math.floor(tileHash(x + i * 3, y, seed, 80 + i) * 5);
      const gy = oy + 1 + Math.floor(tileHash(x, y + i * 5, seed, 90 + i) * 5);
      px(ctx, gx, gy, 1, 2, palette[2]);
      dot(ctx, gx + 1, gy + 1, shade(palette[2], 0.15));
      dot(ctx, gx - 1, gy + 3, palette[0]);
    }
  } else if (variant < 0.58) {
    // lone bush
    const bx = ox + 2 + Math.floor(tileHash(x, y, seed, 100) * 4);
    const by = oy + 3;
    px(ctx, bx, by, 3, 2, palette[2]);
    dot(ctx, bx + 1, by - 1, shade(palette[2], 0.2));
    px(ctx, bx, by + 2, 3, 1, palette[0]);
    dot(ctx, bx + 2, by + 1, shade(palette[1], -0.2));
  } else if (variant > 0.92) {
    // small pond
    px(ctx, ox + 2, oy + 3, 4, 3, '#2e6d95');
    px(ctx, ox + 3, oy + 4, 2, 1, '#4a8fb5');
    dot(ctx, ox + 2, oy + 6, '#1c4a68');
  }
  if (variant > 0.72 && variant < 0.8) {
    const fx = ox + 2 + Math.floor(tileHash(x, y, seed, 101) * 4);
    const fy = oy + 2 + Math.floor(tileHash(x, y, seed, 102) * 4);
    dot(ctx, fx, fy, '#e8d96a');
    dot(ctx, fx + 1, fy, '#b9a94e');
  }
}

function paintForest(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Forest].palette;
  fillTile(ctx, ox, oy, palette[0]);
  for (let i = 0; i < 4; i += 1) {
    const dx = ox + Math.floor(tileHash(x + i, y, seed, 110 + i) * 8);
    const dy = oy + Math.floor(tileHash(x, y + i, seed, 120 + i) * 8);
    dot(ctx, dx, dy, shade(palette[0], 0.16));
  }
  const variant = tileHash(x, y, seed, 10);
  const trees = variant < 0.3 ? 1 : variant < 0.7 ? 2 : 3;
  for (let i = 0; i < trees; i += 1) {
    const size = 2 + Math.floor(tileHash(x + i * 7, y, seed, 130 + i) * 2);
    const tx = ox + Math.floor(tileHash(x + i * 3, y, seed, 140 + i) * (7 - size));
    const ty = oy + Math.floor(tileHash(x, y + i * 3, seed, 150 + i) * (5 - Math.min(2, size)));
    px(ctx, tx, ty, size + 1, size, palette[1]);
    px(ctx, tx, ty, size, 1, palette[2]);
    dot(ctx, tx + 1, ty + 1, shade(palette[2], 0.18));
    px(ctx, tx + size - 1, ty + 1, 1, size - 1, palette[0]);
    px(ctx, tx + Math.floor(size / 2), ty + size, 1, 1, '#3b2b1c');
  }
}

function paintHills(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Hills].palette;
  const variant = tileHash(x, y, seed, 30);
  const grass = '#55633c';
  fillTile(ctx, ox, oy, mixHex(palette[1], grass, 0.45));
  for (let i = 0; i < 3; i += 1) {
    const sx = ox + Math.floor(tileHash(x + i, y, seed, 160 + i) * 8);
    const sy = oy + Math.floor(tileHash(x, y + i, seed, 170 + i) * 8);
    dot(ctx, sx, sy, mixHex(palette[0], grass, 0.4));
  }

  const drawHill = (bx: number, by: number, w: number, h: number): void => {
    px(ctx, bx, by + h, w, 1, palette[0]);
    for (let row = 0; row < h; row += 1) {
      const inset = Math.floor((row / Math.max(1, h)) * (w / 2));
      const rowWidth = Math.max(1, w - inset * 2);
      px(ctx, bx + inset, by + row, rowWidth, 1, row < h * 0.5 ? palette[2] : palette[1]);
    }
    dot(ctx, bx + Math.floor(w / 2), by, shade(palette[2], 0.22));
    px(ctx, bx + 1, by + h + 1, Math.max(2, w - 2), 1, shade(palette[0], -0.15));
  };

  if (variant < 0.3) {
    drawHill(ox + 1, oy + 2, 5, 3);
    drawHill(ox + 5, oy + 4, 3, 2);
  } else if (variant < 0.55) {
    drawHill(ox + 2, oy + 1, 4, 4);
  } else if (variant < 0.72) {
    drawHill(ox, oy + 4, 4, 2);
    drawHill(ox + 3, oy + 1, 4, 3);
  } else if (variant < 0.88) {
    drawHill(ox + 1, oy + 1, 6, 4);
  } else {
    drawHill(ox + 1, oy + 3, 3, 2);
    drawHill(ox + 4, oy + 2, 3, 3);
    drawHill(ox + 6, oy + 5, 2, 1);
  }
  if (variant > 0.55 && variant < 0.7) {
    dot(ctx, ox + 6, oy + 6, '#8b8577');
    dot(ctx, ox + 7, oy + 6, '#6a655a');
  }
}

function paintMountain(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
  snowy: boolean,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Mountain].palette;
  fillTile(ctx, ox, oy, shade(palette[1], -0.1));
  const peakHeight = 5 + Math.round(tileHash(x, y, seed, 40) * 2);
  const top = oy + 1;
  for (let row = 0; row < peakHeight; row += 1) {
    const width = 1 + Math.round((row / peakHeight) * 6);
    const left = ox + 4 - Math.floor(width / 2);
    if (snowy && row < 2) {
      px(ctx, left, top + row, width, 1, '#e8ecef');
    } else {
      px(ctx, left, top + row, Math.ceil(width / 2), 1, palette[2]);
      px(ctx, left + Math.ceil(width / 2), top + row, Math.floor(width / 2), 1, palette[0]);
    }
  }
  px(ctx, ox + 1, oy + 7, 6, 1, shade(palette[0], -0.2));
  if (tileHash(x, y, seed, 41) > 0.6) {
    dot(ctx, ox + 5, oy + 2, '#cfd4d8');
  }
}

function paintDesert(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Desert].palette;
  const variant = tileHash(x, y, seed, 50);
  fillTile(ctx, ox, oy, palette[1]);
  for (let i = 0; i < 4; i += 1) {
    const dx = ox + Math.floor(tileHash(x + i, y, seed, 51 + i) * 7);
    const dy = oy + Math.floor(tileHash(x, y + i, seed, 61 + i) * 7);
    dot(ctx, dx, dy, i % 2 === 0 ? palette[2] : palette[0]);
  }
  if (variant < 0.45) {
    // dune crest
    const dy = oy + 2 + Math.floor(variant * 8);
    px(ctx, ox + 1, dy, 6, 1, shade(palette[2], 0.12));
    px(ctx, ox + 2, dy + 1, 5, 1, shade(palette[1], -0.16));
    dot(ctx, ox + 6, dy - 1, palette[2]);
  } else if (variant < 0.62) {
    // rocky outcrop
    px(ctx, ox + 2, oy + 3, 4, 2, '#8f8069');
    px(ctx, ox + 3, oy + 2, 2, 1, '#a2917a');
    px(ctx, ox + 2, oy + 5, 4, 1, '#6c5f4d');
  } else if (variant > 0.9) {
    // dry shrub
    px(ctx, ox + 4, oy + 4, 1, 2, '#6d6a3a');
    dot(ctx, ox + 3, oy + 4, '#8a8b4a');
    dot(ctx, ox + 5, oy + 3, '#7d7c40');
  }
}

function paintTundra(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  seed: number,
  x: number,
  y: number,
): void {
  const palette = TERRAIN_INFO[TERRAIN.Tundra].palette;
  const variant = tileHash(x, y, seed, 70);
  fillTile(ctx, ox, oy, palette[1]);
  for (let i = 0; i < 4; i += 1) {
    const sx = ox + Math.floor(tileHash(x + i, y, seed, 180 + i) * 8);
    const sy = oy + Math.floor(tileHash(x, y + i, seed, 190 + i) * 8);
    dot(ctx, sx, sy, variant > 0.5 ? '#e2ebe8' : palette[0]);
  }
  if (variant < 0.4) {
    px(ctx, ox + 2, oy + 3, 4, 2, palette[0]);
    px(ctx, ox + 2, oy + 2, 3, 1, palette[2]);
    px(ctx, ox + 3, oy + 5, 3, 1, shade(palette[0], -0.2));
  } else if (variant > 0.62) {
    px(ctx, ox + 3, oy + 4, 2, 1, '#e6efec');
    px(ctx, ox + 1, oy + 6, 2, 1, '#d3dedb');
  }
}

function paintRiverTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  horizontal: boolean,
): void {
  const water = '#2f6f9e';
  const waterLight = '#4b93bd';
  const bank = '#7f8f63';
  if (horizontal) {
    px(ctx, ox, oy + 2, 8, 1, bank);
    px(ctx, ox, oy + 3, 8, 3, water);
    px(ctx, ox, oy + 5, 8, 1, '#1d4f74');
    px(ctx, ox + 2, oy + 3, 3, 1, waterLight);
  } else {
    px(ctx, ox + 2, oy, 1, 8, bank);
    px(ctx, ox + 3, oy, 3, 8, water);
    px(ctx, ox + 5, oy, 1, 8, '#1d4f74');
    px(ctx, ox + 3, oy + 2, 1, 3, waterLight);
  }
}

/** Paints the whole terrain into one crisp canvas (1 world pixel = 1 texture pixel). */
export function paintTerrainLayer(world: WorldData): PixelCanvas {
  const pixel = TILE_PIXELS;
  const canvas = createCanvas(world.width * pixel, world.height * pixel);
  const ctx = context(canvas);
  const seed = world.seed >>> 0;

  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const idx = y * world.width + x;
      const code = world.terrain[idx] as TerrainCode;
      const ox = x * pixel;
      const oy = y * pixel;
      const elevation = world.elevation[idx] ?? 0.4;
      switch (code) {
        case TERRAIN.Ocean:
          paintOcean(ctx, ox, oy, seed, x, y, elevation > 0.18);
          break;
        case TERRAIN.Shallow:
          paintShallow(ctx, ox, oy, seed, x, y);
          break;
        case TERRAIN.Plains:
          paintPlains(ctx, ox, oy, seed, x, y);
          break;
        case TERRAIN.Forest:
          paintForest(ctx, ox, oy, seed, x, y);
          break;
        case TERRAIN.Hills:
          paintHills(ctx, ox, oy, seed, x, y);
          break;
        case TERRAIN.Mountain:
          paintMountain(ctx, ox, oy, seed, x, y, elevation > 0.9);
          break;
        case TERRAIN.Desert:
          paintDesert(ctx, ox, oy, seed, x, y);
          break;
        case TERRAIN.Tundra:
          paintTundra(ctx, ox, oy, seed, x, y);
          break;
        default:
          fillTile(ctx, ox, oy, '#557a37');
          break;
      }
    }
  }

  // Rivers after terrain so they read as water on top of ground.
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const idx = y * world.width + x;
      if (!world.river[idx]) continue;
      const left = x > 0 && world.river[idx - 1];
      const right = x < world.width - 1 && world.river[idx + 1];
      paintRiverTile(ctx, x * pixel, y * pixel, Boolean(left || right));
    }
  }

  // Low-frequency shading patches so neighbouring tiles never look identical.
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const idx = y * world.width + x;
      if (!TERRAIN_INFO[world.terrain[idx] as TerrainCode].land) continue;
      const patch = hash2d(x >> 1, y >> 1, seed + 7);
      if (patch > 0.82) {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
      } else if (patch < 0.18) {
        ctx.fillStyle = 'rgba(0,0,0,0.055)';
        ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
      }
    }
  }

  // Shorelines: sand on land edges, foam on water edges.
  const sand = '#c2b07a';
  const sandDark = '#a08f5f';
  const foam = '#bfe6ef';
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      const idx = y * world.width + x;
      const code = world.terrain[idx] as TerrainCode;
      const land = TERRAIN_INFO[code].land;
      const ox = x * pixel;
      const oy = y * pixel;
      const isWater = (nx: number, ny: number): boolean => {
        if (nx < 0 || ny < 0 || nx >= world.width || ny >= world.height) return false;
        return !TERRAIN_INFO[world.terrain[ny * world.width + nx] as TerrainCode].land;
      };
      if (land) {
        if (isWater(x, y - 1)) {
          px(ctx, ox, oy, 8, 1, sand);
          px(ctx, ox, oy + 1, 8, 1, sandDark);
        }
        if (isWater(x, y + 1)) {
          px(ctx, ox, oy + 6, 8, 2, sand);
        }
        if (isWater(x - 1, y)) {
          px(ctx, ox, oy, 1, 8, sand);
        }
        if (isWater(x + 1, y)) {
          px(ctx, ox + 7, oy, 1, 8, sand);
        }
        if (!!world.river[idx]) {
          // keep river mouths wet
          px(ctx, ox, oy, 8, 8, mixHex(sand, '#2f6f9e', 0.05));
        }
      } else if (code === TERRAIN.Shallow) {
        let foamDrawn = false;
        if (!isWater(x, y - 1) && y > 0) {
          px(ctx, ox, oy, 8, 1, foam);
          foamDrawn = true;
        }
        if (!isWater(x, y + 1) && y < world.height - 1) {
          px(ctx, ox, oy + 7, 8, 1, foam);
          foamDrawn = true;
        }
        if (!isWater(x - 1, y) && x > 0) {
          px(ctx, ox, oy, 1, 8, foam);
          foamDrawn = true;
        }
        if (!isWater(x + 1, y) && x < world.width - 1) {
          px(ctx, ox + 7, oy, 1, 8, foam);
          foamDrawn = true;
        }
        if (foamDrawn) {
          px(ctx, ox + 2, oy + 4, 2, 1, shade(foam, 0.2));
        }
      }
    }
  }

  return canvas;
}
