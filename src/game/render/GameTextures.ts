import Phaser from 'phaser';
import type { GameState } from '@/core/state/types';
import type { WorldData } from '@/core/world/world';
import { TILE_PIXELS, paintTerrainLayer } from '@/game/sprites/terrainPainter';
import { renderUnitSprite, unitTextureKey } from '@/game/sprites/unitSprites';
import { cityTextureKey, renderCitySprite } from '@/game/sprites/citySprites';
import { LAND_UNIT_TYPES } from '@/core/units/unitTypes';
import { createCanvas, hexToRgb, mixHex, rgbToHex } from '@/game/sprites/canvas';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';

export function terrainTextureKey(seed: number): string {
  return `terrain-${seed}`;
}

export function ownerTextureKey(seed: number): string {
  return `owners-${seed}`;
}

export function ensureTerrainTexture(scene: Phaser.Scene, world: WorldData): string {
  const key = terrainTextureKey(world.seed);
  if (scene.textures.exists(key)) return key;
  const canvas = paintTerrainLayer(world);
  scene.textures.addCanvas(key, canvas);
  return key;
}

export interface OwnerLayer {
  key: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: Phaser.Textures.CanvasTexture;
}

/** One pixel per tile; the scene scales it up 8× with nearest-neighbour filtering. */
export function ensureOwnerLayer(scene: Phaser.Scene, world: WorldData): OwnerLayer {
  const key = ownerTextureKey(world.seed);
  const existing = scene.textures.exists(key)
    ? (scene.textures.get(key) as Phaser.Textures.CanvasTexture)
    : null;
  if (existing) {
    const canvas = existing.getSourceImage() as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('owner layer context missing');
    return { key, canvas, ctx, texture: existing };
  }
  const canvas = createCanvas(world.width, world.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('owner layer context missing');
  const texture = scene.textures.addCanvas(key, canvas) as Phaser.Textures.CanvasTexture;
  return { key, canvas, ctx, texture };
}

/**
 * Fills one pixel per tile with the owner's colour. Reduced alpha over water
 * keeps the terrain readable underneath the political map instead of turning
 * the world into flat coloured blobs.
 */
export function repaintOwnerLayer(
  _scene: Phaser.Scene,
  world: WorldData,
  game: GameState,
  layer: OwnerLayer,
): void {
  const { ctx } = layer;
  ctx.clearRect(0, 0, world.width, world.height);
  for (const territory of world.territories) {
    const state = game.territories[territory.id];
    if (!state) continue;
    const country = game.countries[state.owner];
    if (!country) continue;
    const base =
      state.unrest > 0.05 ? mixHex(country.color, '#ffe9a8', state.unrest * 0.3) : country.color;
    const rgb = hexToRgb(base);
    for (const tile of territory.tiles) {
      const x = tile % world.width;
      const y = Math.floor(tile / world.width);
      const water = !TERRAIN_INFO[world.terrain[tile] as TerrainCode]?.land;
      // Land keeps a readable sovereignty tint, shallow seas a lighter wash.
      ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${water ? 0.26 : 0.42})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  layer.texture.refresh();
}

export function ensureUnitTextures(scene: Phaser.Scene, countryTints: readonly string[]): void {
  const unique = [...new Set(countryTints)];
  for (const tint of unique) {
    for (const type of LAND_UNIT_TYPES) {
      for (const frame of [0, 1] as const) {
        const key = unitTextureKey(type, frame, tint);
        if (scene.textures.exists(key)) continue;
        const canvas = renderUnitSprite(type, { tint, frame });
        scene.textures.addCanvas(key, canvas);
      }
    }
    for (const capital of [true, false]) {
      const key = cityTextureKey(tint, capital);
      if (scene.textures.exists(key)) continue;
      scene.textures.addCanvas(key, renderCitySprite(tint, capital));
    }
  }
}

/** Additive white flash texture for selection / recent captures. */
export function flashTextureKey(): string {
  return 'pixel-white';
}

export function ensureUtilityTextures(scene: Phaser.Scene): void {
  const key = flashTextureKey();
  if (scene.textures.exists(key)) return;
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1, 1);
  scene.textures.addCanvas(key, canvas);
}

export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - amount;
  return rgbToHex({ r: r * factor, g: g * factor, b: b * factor });
}

export { TILE_PIXELS };
