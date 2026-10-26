import { canvasToDataUrl, createCanvas, context, dot, px, shade, type PixelCanvas } from '@/game/sprites/canvas';

const ICON_SIZE = 16;

function iconCanvas(): { canvas: PixelCanvas; ctx: CanvasRenderingContext2D } {
  const canvas = createCanvas(ICON_SIZE, ICON_SIZE);
  return { canvas, ctx: context(canvas) };
}

function coinIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  const gold = '#f2c94c';
  px(ctx, 5, 3, 6, 10, shade(gold, -0.35));
  px(ctx, 4, 4, 8, 8, shade(gold, -0.2));
  px(ctx, 5, 4, 6, 7, gold);
  px(ctx, 5, 4, 6, 1, shade(gold, 0.4));
  px(ctx, 6, 5, 1, 5, shade(gold, -0.45));
  px(ctx, 9, 5, 1, 5, shade(gold, -0.45));
  px(ctx, 7, 6, 2, 1, shade(gold, -0.45));
  px(ctx, 7, 8, 2, 1, shade(gold, -0.45));
  dot(ctx, 12, 11, shade(gold, -0.1));
  dot(ctx, 13, 12, shade(gold, -0.3));
  return canvas;
}

function metalIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  const steel = '#9fb3c8';
  const steelLight = '#cfdae6';
  const steelDark = '#65788c';
  const drawIngot = (x: number, y: number, w: number, light: string, mid: string, dark: string): void => {
    px(ctx, x, y + 1, w, 2, mid);
    px(ctx, x + 1, y, w - 2, 1, light);
    px(ctx, x, y + 3, w, 1, dark);
  };
  drawIngot(2, 9, 12, steelLight, steel, steelDark);
  drawIngot(4, 6, 9, steelLight, steel, steelDark);
  drawIngot(6, 3, 6, steelLight, steel, steelDark);
  return canvas;
}

function oilIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  const barrel = '#3f4a3a';
  const barrelLight = '#5e6b57';
  px(ctx, 4, 4, 8, 11, barrel);
  px(ctx, 4, 4, 2, 11, barrelLight);
  px(ctx, 5, 3, 6, 1, barrelLight);
  px(ctx, 4, 6, 8, 1, '#22281f');
  px(ctx, 4, 11, 8, 1, '#22281f');
  px(ctx, 6, 8, 4, 2, '#1c2018');
  // oil drop
  px(ctx, 11, 8, 3, 3, '#f0a63c');
  px(ctx, 12, 6, 1, 2, '#f0a63c');
  px(ctx, 11, 9, 3, 1, '#c07f24');
  return canvas;
}

function energyIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  const bolt = '#66e0ff';
  const rows = [
    '.....####',
    '....####.',
    '...####..',
    '..####...',
    '.######..',
    '...####..',
    '...###...',
    '..###....',
    '..##.....',
    '..#......',
  ];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] !== '#') continue;
      px(ctx, 5 + x, 3 + y, 1, 1, row[x - 1] === '#' ? shade(bolt, -0.28) : bolt);
    }
  });
  dot(ctx, 6, 5, '#d8fbff');
  return canvas;
}

function armyIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  const body = '#7d8f5b';
  px(ctx, 2, 6, 12, 6, shade(body, -0.35));
  px(ctx, 3, 7, 10, 4, body);
  px(ctx, 4, 4, 5, 3, shade(body, 0.1));
  px(ctx, 6, 2, 2, 3, '#3a4230');
  px(ctx, 2, 12, 12, 1, '#2b3325');
  px(ctx, 3, 7, 1, 4, shade(body, 0.35));
  return canvas;
}

function factoryIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  const wall = '#8d8d8d';
  px(ctx, 2, 7, 12, 7, shade(wall, -0.2));
  px(ctx, 2, 6, 12, 1, shade(wall, 0.3));
  for (let i = 0; i < 3; i += 1) {
    px(ctx, 3 + i * 4, 3 + (i % 2), 2, 4, shade(wall, 0.1));
  }
  px(ctx, 7, 10, 2, 4, '#2f2f2f');
  return canvas;
}

function flagIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  px(ctx, 4, 2, 1, 12, '#c9c2ae');
  px(ctx, 5, 3, 8, 5, '#d7dddf');
  px(ctx, 5, 5, 8, 2, '#5f6f80');
  px(ctx, 5, 3, 8, 1, '#ffffff');
  return canvas;
}

function paperIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  px(ctx, 3, 2, 10, 12, '#e7e2d2');
  px(ctx, 3, 2, 10, 1, '#b9b3a0');
  for (let y = 5; y < 12; y += 2) px(ctx, 5, y, 6, 1, '#8d8877');
  return canvas;
}

function speedIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  px(ctx, 3, 7, 5, 2, '#c9c2ae');
  px(ctx, 7, 7, 4, 2, '#e0dac9');
  px(ctx, 9, 3, 3, 2, '#e0dac9');
  px(ctx, 3, 11, 9, 1, '#8d8877');
  return canvas;
}

function shieldIcon(): PixelCanvas {
  const { canvas, ctx } = iconCanvas();
  const steel = '#93a3b5';
  px(ctx, 4, 2, 8, 2, steel);
  px(ctx, 3, 3, 10, 5, steel);
  px(ctx, 4, 8, 8, 3, steel);
  px(ctx, 6, 11, 4, 2, steel);
  px(ctx, 5, 4, 2, 6, shade(steel, 0.25));
  px(ctx, 9, 4, 2, 6, shade(steel, -0.25));
  return canvas;
}

const cache = new Map<string, string>();

const painters: Record<string, () => PixelCanvas> = {
  money: coinIcon,
  metal: metalIcon,
  oil: oilIcon,
  energy: energyIcon,
  army: armyIcon,
  factory: factoryIcon,
  flag: flagIcon,
  paper: paperIcon,
  speed: speedIcon,
  shield: shieldIcon,
};

/** Data URL for a pixel UI icon; cached because React re-renders the HUD often. */
export function iconDataUrl(name: string): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const painter = painters[name] ?? shieldIcon;
  const url = canvasToDataUrl(painter());
  cache.set(name, url);
  return url;
}
