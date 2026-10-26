import type { LandUnitType } from '@/core/units/unitTypes';
import { createCanvas, context, dot, mixHex, px, shade, type PixelCanvas } from '@/game/sprites/canvas';

/** All ground vehicles are painted top-down, facing north, on a 32×32 grid. */
export const UNIT_SPRITE_SIZE = 32;

interface PaintOptions {
  tint: string;
  frame: 0 | 1;
}

interface HullPalette {
  body: string;
  light: string;
  mid: string;
  dark: string;
  track: string;
  tread: string;
  steel: string;
  accent: string;
}

function hullColors(tint: string): HullPalette {
  // Vehicles keep their own military paint; the faction colour shows up as stripes.
  const body = mixHex('#71804f', tint, 0.22);
  return {
    body,
    light: shade(body, 0.26),
    mid: shade(body, 0.06),
    dark: shade(body, -0.44),
    track: '#252b20',
    tread: '#55604a',
    steel: '#b9c6cf',
    accent: mixHex(tint, '#ffffff', 0.35),
  };
}

/** 1px dark outline makes every vehicle readable on any terrain. */
function applyOutline(canvas: PixelCanvas, outline = '#10140e'): PixelCanvas {
  const ctx = context(canvas);
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height);
  const source = new Uint8ClampedArray(data.data);
  const alphaAt = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    return source[(y * width + x) * 4 + 3] ?? 0;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(x, y) > 40) continue;
      const nearOpaque =
        alphaAt(x - 1, y) > 120 || alphaAt(x + 1, y) > 120 || alphaAt(x, y - 1) > 120 || alphaAt(x, y + 1) > 120;
      if (!nearOpaque) continue;
      const index = (y * width + x) * 4;
      const hex = outline.replace('#', '');
      data.data[index] = parseInt(hex.slice(0, 2), 16);
      data.data[index + 1] = parseInt(hex.slice(2, 4), 16);
      data.data[index + 2] = parseInt(hex.slice(4, 6), 16);
      data.data[index + 3] = 235;
    }
  }
  const out = createCanvas(width, height);
  context(out).putImageData(data, 0, 0);
  return out;
}

function drawTracks(
  ctx: CanvasRenderingContext2D,
  palette: HullPalette,
  left: number,
  right: number,
  top: number,
  bottom: number,
  frame: 0 | 1,
): void {
  for (const x of [left, right]) {
    px(ctx, x, top, 6, bottom - top, palette.track);
    // tread links shift by 2px between frames so movement reads as animation
    const offset = frame === 0 ? 0 : 2;
    for (let y = top + 1; y < bottom - 1; y += 3) {
      const ty = y + ((offset + (y - top)) % 3 === 0 ? 1 : 0);
      px(ctx, x + 1, ty, 4, 1, palette.tread);
    }
    px(ctx, x + 2, top + 1, 2, bottom - top - 2, shade(palette.track, 0.12));
    px(ctx, x, top, 6, 1, '#0d100b');
    px(ctx, x, bottom - 1, 6, 1, '#0d100b');
  }
}

function drawWheels(
  ctx: CanvasRenderingContext2D,
  palette: HullPalette,
  left: number,
  right: number,
  top: number,
  bottom: number,
  frame: 0 | 1,
  count = 4,
): void {
  const step = (bottom - top) / count;
  for (const x of [left, right]) {
    px(ctx, x, top, 4, bottom - top, palette.track);
    for (let i = 0; i < count; i += 1) {
      const y = Math.round(top + i * step + 0.5);
      px(ctx, x + 1, y, 2, Math.max(2, Math.round(step) - 2), palette.tread);
      dot(ctx, x + 1 + (frame === 0 ? 0 : 1), y + 1, '#6c7763');
    }
    px(ctx, x, top, 4, 1, '#0d100b');
    px(ctx, x, bottom - 1, 4, 1, '#0d100b');
  }
}

function drawHull(
  ctx: CanvasRenderingContext2D,
  palette: HullPalette,
  left: number,
  right: number,
  top: number,
  bottom: number,
): void {
  px(ctx, left, top, right - left, bottom - top, palette.body);
  px(ctx, left, top, right - left, 1, palette.light);
  px(ctx, left + 1, top + 1, 1, bottom - top - 2, palette.light);
  px(ctx, left, bottom - 1, right - left, 1, palette.dark);
  px(ctx, right - 2, top + 1, 1, bottom - top - 2, palette.dark);
  // rivets
  for (let y = top + 3; y < bottom - 2; y += 4) {
    dot(ctx, left + 2, y, palette.dark);
    dot(ctx, right - 3, y, palette.dark);
  }
}

function drawGun(
  ctx: CanvasRenderingContext2D,
  x: number,
  yTop: number,
  yBottom: number,
  width: number,
): void {
  px(ctx, x, yTop, width, yBottom - yTop, '#262c22');
  px(ctx, x, yTop, width, 1, '#59634f');
  px(ctx, x + width - 1, yTop, 1, yBottom - yTop, '#12160f');
  px(ctx, x, yTop - 1, width, 1, '#0f120c');
}

function drawTurret(
  ctx: CanvasRenderingContext2D,
  palette: HullPalette,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  px(ctx, x, y, w, h, palette.mid);
  px(ctx, x, y, w, 1, palette.light);
  px(ctx, x, y, 1, h, palette.light);
  px(ctx, x, y + h - 1, w, 1, palette.dark);
  px(ctx, x + w - 1, y, 1, h, palette.dark);
}

function paintMainBattleTank(ctx: CanvasRenderingContext2D, p: HullPalette, frame: 0 | 1): void {
  drawTracks(ctx, p, 3, 23, 5, 28, frame);
  drawHull(ctx, p, 9, 23, 5, 27);
  px(ctx, 10, 5, 12, 2, p.light);
  // sloped glacis
  px(ctx, 11, 7, 10, 1, p.mid);
  // skirt armour
  px(ctx, 9, 12, 2, 13, p.dark);
  px(ctx, 21, 12, 2, 13, p.dark);
  drawTurret(ctx, p, 11, 10, 10, 12);
  px(ctx, 13, 12, 6, 1, p.light);
  px(ctx, 14, 15, 4, 3, shade(p.mid, 0.16));
  drawGun(ctx, 15, 1, 11, 2);
  px(ctx, 15, 1, 2, 2, p.dark);
  // commander sight + antenna
  px(ctx, 12, 12, 2, 2, p.steel);
  px(ctx, 22, 17, 1, 4, '#aab4a0');
  // faction stripe on the rear deck
  px(ctx, 10, 24, 12, 1, p.accent);
  px(ctx, 10, 26, 12, 1, p.dark);
}

function paintLightTank(ctx: CanvasRenderingContext2D, p: HullPalette, frame: 0 | 1): void {
  drawTracks(ctx, p, 4, 24, 8, 27, frame);
  drawHull(ctx, p, 10, 22, 7, 26);
  px(ctx, 11, 7, 10, 1, p.light);
  drawTurret(ctx, p, 12, 11, 8, 9);
  px(ctx, 13, 12, 6, 1, p.light);
  drawGun(ctx, 15, 3, 11, 2);
  px(ctx, 13, 16, 3, 2, p.steel);
  px(ctx, 11, 23, 10, 1, p.accent);
}

function paintApc(ctx: CanvasRenderingContext2D, p: HullPalette, frame: 0 | 1): void {
  drawWheels(ctx, p, 3, 25, 8, 27, frame, 4);
  drawHull(ctx, p, 8, 24, 7, 27);
  px(ctx, 9, 7, 14, 2, p.light);
  // sloped front
  px(ctx, 10, 9, 12, 1, p.mid);
  // roof hatches and stowage
  px(ctx, 11, 11, 4, 4, p.mid);
  px(ctx, 17, 11, 5, 3, p.dark);
  px(ctx, 11, 17, 10, 5, p.mid);
  px(ctx, 12, 18, 8, 1, p.light);
  px(ctx, 17, 20, 3, 2, p.steel);
  drawGun(ctx, 15, 3, 8, 2);
  px(ctx, 10, 24, 12, 1, p.accent);
}

function paintIfv(ctx: CanvasRenderingContext2D, p: HullPalette, frame: 0 | 1): void {
  drawTracks(ctx, p, 4, 24, 8, 27, frame);
  drawHull(ctx, p, 9, 23, 7, 26);
  px(ctx, 10, 7, 12, 2, p.light);
  drawTurret(ctx, p, 12, 12, 8, 7);
  px(ctx, 13, 13, 6, 1, p.light);
  drawGun(ctx, 14, 5, 12, 2);
  // ATGM rails
  px(ctx, 11, 15, 2, 4, p.dark);
  px(ctx, 19, 15, 2, 4, p.dark);
  dot(ctx, 11, 14, p.steel);
  dot(ctx, 19, 14, p.steel);
  px(ctx, 11, 23, 10, 1, p.accent);
}

function paintSpg(ctx: CanvasRenderingContext2D, p: HullPalette, frame: 0 | 1): void {
  drawTracks(ctx, p, 3, 24, 6, 28, frame);
  drawHull(ctx, p, 9, 23, 6, 27);
  // rear casemate
  px(ctx, 11, 15, 10, 11, p.mid);
  px(ctx, 11, 15, 10, 1, p.light);
  px(ctx, 11, 15, 1, 11, p.light);
  px(ctx, 20, 15, 1, 11, p.dark);
  px(ctx, 12, 17, 8, 2, p.dark);
  // very long barrel over the bow
  drawGun(ctx, 15, 1, 18, 2);
  px(ctx, 13, 6, 6, 3, p.mid);
  px(ctx, 14, 7, 4, 1, p.steel);
  px(ctx, 12, 23, 8, 1, p.accent);
  px(ctx, 12, 25, 8, 1, p.dark);
}

function paintMlrs(ctx: CanvasRenderingContext2D, p: HullPalette, frame: 0 | 1): void {
  drawTracks(ctx, p, 3, 24, 6, 28, frame);
  drawHull(ctx, p, 9, 23, 6, 27);
  // armoured cab at the front
  px(ctx, 10, 6, 12, 6, p.mid);
  px(ctx, 10, 6, 12, 1, p.light);
  px(ctx, 11, 7, 10, 2, shade(p.mid, 0.22));
  px(ctx, 12, 10, 3, 1, '#8fa07a');
  px(ctx, 17, 10, 3, 1, '#8fa07a');
  // launcher pack
  px(ctx, 10, 13, 12, 12, shade(p.body, -0.22));
  px(ctx, 10, 13, 12, 1, p.dark);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const tx = 11 + col * 4;
      const ty = 14 + row * 4;
      px(ctx, tx, ty, 3, 3, '#1b1f16');
      px(ctx, tx, ty, 3, 1, '#545e46');
      dot(ctx, tx + 1, ty + 1, '#2b3126');
    }
  }
  px(ctx, 10, 26, 12, 1, p.accent);
}

export function renderUnitSprite(type: LandUnitType, options: PaintOptions): PixelCanvas {
  const canvas = createCanvas(UNIT_SPRITE_SIZE, UNIT_SPRITE_SIZE);
  const ctx = context(canvas);
  const palette = hullColors(options.tint);

  switch (type) {
    case 'mbt':
      paintMainBattleTank(ctx, palette, options.frame);
      break;
    case 'lightTank':
      paintLightTank(ctx, palette, options.frame);
      break;
    case 'apc':
      paintApc(ctx, palette, options.frame);
      break;
    case 'ifv':
      paintIfv(ctx, palette, options.frame);
      break;
    case 'spg':
      paintSpg(ctx, palette, options.frame);
      break;
    case 'mlrs':
      paintMlrs(ctx, palette, options.frame);
      break;
    default:
      break;
  }

  const outlined = applyOutline(canvas);

  // Compose shadow + outlined vehicle so the sprite casts a readable drop shadow.
  const composed = createCanvas(UNIT_SPRITE_SIZE, UNIT_SPRITE_SIZE);
  const cctx = context(composed);
  cctx.fillStyle = 'rgba(0,0,0,0.22)';
  cctx.fillRect(5, 10, 22, 18);
  cctx.drawImage(outlined, 0, 0);
  return composed;
}

/** Texture keys used by the Phaser scene. */
export function unitTextureKey(type: LandUnitType, frame: 0 | 1, tint: string): string {
  return `unit-${type}-${frame}-${tint.replace('#', '')}`;
}
