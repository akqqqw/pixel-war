import type Phaser from 'phaser';
import type { BuildingKind } from '@/core/buildings/buildings';
import type { GameState } from '@/core/state/types';
import type { WorldData } from '@/core/world/world';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import { BUILDING_GLYPHS, GLYPH_SIZE } from '@/game/sprites/buildingGlyphs';
import { TILE_PIXELS, createCanvas, context, paintTerrainLayer } from '@/game/sprites/terrainPainter';

export function terrainTextureKey(seed: number): string {
  return `terrain-${seed}`;
}

export function ownerTextureKey(seed: number): string {
  return `owners-${seed}`;
}

export function buildingTextureKey(kind: BuildingKind): string {
  return `building-${kind}`;
}

export function ensureTerrainTexture(scene: Phaser.Scene, world: WorldData): string {
  const key = terrainTextureKey(world.seed);
  if (scene.textures.exists(key)) return key;
  scene.textures.addCanvas(key, paintTerrainLayer(world));
  return key;
}

export interface OwnerLayer {
  key: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  texture: Phaser.Textures.CanvasTexture;
}

/** One pixel per tile; scaled up 8× with nearest-neighbour filtering. */
export function ensureOwnerLayer(scene: Phaser.Scene, world: WorldData): OwnerLayer {
  const key = ownerTextureKey(world.seed);
  if (scene.textures.exists(key)) {
    const texture = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
    const canvas = texture.getSourceImage() as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('owner layer context missing');
    return { key, canvas, ctx, image: ctx.createImageData(world.width, world.height), texture };
  }
  const canvas = createCanvas(world.width, world.height);
  const ctx = context(canvas);
  const texture = scene.textures.addCanvas(key, canvas) as Phaser.Textures.CanvasTexture;
  return { key, canvas, ctx, image: ctx.createImageData(world.width, world.height), texture };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

/**
 * Paints the political layer straight into an ImageData buffer: countries tint
 * their tiles, water keeps a much lighter wash so the coastline stays readable.
 */
export function repaintOwnerLayer(world: WorldData, state: GameState, layer: OwnerLayer): void {
  const { image } = layer;
  const data = image.data;
  const palette = state.countryOrder.map((id) => {
    const country = state.countries[id];
    return hexToRgb(country?.color ?? '#888888');
  });
  const water = new Uint8Array(world.width * world.height);
  for (let index = 0; index < water.length; index += 1) {
    const info = TERRAIN_INFO[world.terrain[index] as TerrainCode];
    water[index] = info && !info.land ? 1 : 0;
  }
  for (let index = 0; index < data.length / 4; index += 1) {
    const owner = state.cellOwner[index] ?? -1;
    const offset = index * 4;
    const color = owner >= 0 ? palette[owner] : undefined;
    if (!color) {
      data[offset + 3] = 0;
      continue;
    }
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = water[index] ? 46 : 108;
  }
  layer.ctx.putImageData(image, 0, 0);
  layer.texture.refresh();
}

export function ensureBuildingTextures(scene: Phaser.Scene): void {
  for (const kind of Object.keys(BUILDING_GLYPHS) as BuildingKind[]) {
    const key = buildingTextureKey(kind);
    if (scene.textures.exists(key)) continue;
    const canvas = createCanvas(GLYPH_SIZE, GLYPH_SIZE);
    BUILDING_GLYPHS[kind](context(canvas));
    scene.textures.addCanvas(key, canvas);
  }
}

export { TILE_PIXELS };
