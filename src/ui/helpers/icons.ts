import type { LandUnitType } from '@/core/units/unitTypes';
import { canvasToDataUrl } from '@/game/sprites/canvas';
import { iconDataUrl } from '@/game/sprites/uiIcons';
import { renderUnitSprite } from '@/game/sprites/unitSprites';

const unitCache = new Map<string, string>();

/** Pixel unit icon painted in the country's colours. */
export function unitIconUrl(type: LandUnitType, tint: string): string {
  const key = `${type}-${tint}`;
  const cached = unitCache.get(key);
  if (cached) return cached;
  const url = canvasToDataUrl(renderUnitSprite(type, { tint, frame: 0 }));
  unitCache.set(key, url);
  return url;
}

export function uiIcon(name: string): string {
  return iconDataUrl(name);
}
