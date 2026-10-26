import { createCanvas, context, dot, px, shade, type PixelCanvas } from '@/game/sprites/canvas';

const CITY_SIZE = 32;

/**
 * Top-down-ish pixel city: a few blocky buildings with lit windows.
 * Capitals get a tower, a wall ring and a banner in the owner's colour.
 */
export function renderCitySprite(tint: string, capital: boolean): PixelCanvas {
  const canvas = createCanvas(CITY_SIZE, CITY_SIZE);
  const ctx = context(canvas);
  const roof = shade(tint, -0.18);
  const roofLight = shade(tint, 0.16);
  const wall = '#b9b09a';
  const wallShadow = '#8a8270';
  const wallLight = '#ded6c2';
  const window = '#f6d97a';
  const windowDim = '#c9a95e';

  // ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(5, 24, 22, 5);

  if (capital) {
    // outer wall ring
    px(ctx, 4, 14, 24, 2, '#6f6a5c');
    px(ctx, 4, 14, 2, 12, '#6f6a5c');
    px(ctx, 26, 14, 2, 12, '#6f6a5c');
    for (let x = 6; x < 26; x += 4) px(ctx, x, 12, 2, 3, '#7c7768');
    // side houses
    px(ctx, 6, 18, 6, 7, wall);
    px(ctx, 6, 17, 6, 2, roof);
    px(ctx, 21, 19, 6, 6, wall);
    px(ctx, 21, 18, 6, 2, roof);
    // central keep
    px(ctx, 12, 8, 9, 18, wall);
    px(ctx, 12, 8, 2, 18, wallLight);
    px(ctx, 19, 8, 2, 18, wallShadow);
    px(ctx, 12, 6, 9, 3, roof);
    px(ctx, 13, 4, 7, 2, roofLight);
    // tower top + banner
    px(ctx, 15, 1, 2, 5, '#dcd6c5');
    px(ctx, 17, 1, 4, 3, tint);
    dot(ctx, 20, 1, roofLight);
    // windows
    for (let y = 10; y < 24; y += 4) {
      px(ctx, 13, y, 1, 1, window);
      px(ctx, 15, y, 1, 1, windowDim);
      px(ctx, 18, y, 1, 1, window);
    }
    px(ctx, 6, 20, 1, 1, windowDim);
    px(ctx, 9, 20, 1, 1, window);
    px(ctx, 23, 21, 1, 1, windowDim);
    px(ctx, 25, 22, 1, 1, window);
  } else {
    // three small buildings
    px(ctx, 7, 13, 8, 12, wall);
    px(ctx, 7, 13, 2, 12, wallLight);
    px(ctx, 13, 13, 2, 12, wallShadow);
    px(ctx, 6, 11, 10, 3, roof);
    px(ctx, 7, 11, 8, 1, roofLight);
    px(ctx, 8, 16, 1, 1, window);
    px(ctx, 11, 16, 1, 1, windowDim);
    px(ctx, 8, 20, 1, 1, windowDim);
    px(ctx, 11, 20, 1, 1, window);

    px(ctx, 16, 17, 9, 8, wall);
    px(ctx, 16, 17, 2, 8, wallLight);
    px(ctx, 23, 17, 2, 8, wallShadow);
    px(ctx, 15, 15, 11, 3, roof);
    px(ctx, 16, 15, 9, 1, roofLight);
    px(ctx, 18, 19, 1, 1, window);
    px(ctx, 21, 19, 1, 1, windowDim);
    px(ctx, 18, 22, 1, 1, windowDim);

    px(ctx, 10, 22, 12, 3, '#5c5749');
    px(ctx, 10, 22, 12, 1, '#7c7768');
  }

  // little flag pole accent in the owner's colour (readability at small zoom)
  px(ctx, 5, 25, 3, 1, tint);
  return canvas;
}

export function cityTextureKey(tint: string, capital: boolean): string {
  return `city-${capital ? 'cap' : 'town'}-${tint.replace('#', '')}`;
}
