import type Phaser from 'phaser';
import type { BuildingKind } from '@/core/buildings/buildings';
import type { GameState } from '@/core/state/types';
import type { WorldData } from '@/core/world/world';
import { TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import { TILE_PIXELS, createCanvas, context, paintTerrainLayer, px } from '@/game/sprites/terrainPainter';

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
    const owner = state.tileOwner[index] ?? -1;
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

/** Small pixel glyphs for the eight structures. 14×14, drawn once. */
export function ensureBuildingTextures(scene: Phaser.Scene): void {
  const glyphs: Record<BuildingKind, (ctx: CanvasRenderingContext2D) => void> = {
    city: (ctx) => {
      px(ctx, 2, 5, 4, 8, '#c9d3dc');
      px(ctx, 7, 3, 5, 10, '#e2eaf2');
      px(ctx, 3, 7, 1, 1, '#3d4b5a');
      px(ctx, 4, 7, 1, 1, '#3d4b5a');
      px(ctx, 8, 5, 1, 1, '#3d4b5a');
      px(ctx, 10, 5, 1, 1, '#3d4b5a');
      px(ctx, 2, 4, 4, 1, '#8fa0b1');
      px(ctx, 7, 2, 5, 1, '#b9c9d8');
    },
    factory: (ctx) => {
      px(ctx, 1, 6, 12, 7, '#9aa4ad');
      px(ctx, 2, 4, 3, 2, '#6f7a84');
      px(ctx, 8, 3, 2, 3, '#6f7a84');
      px(ctx, 2, 8, 2, 2, '#3d4b5a');
      px(ctx, 6, 8, 2, 2, '#3d4b5a');
      px(ctx, 10, 8, 2, 2, '#3d4b5a');
      px(ctx, 1, 12, 12, 1, '#5d6873');
    },
    port: (ctx) => {
      px(ctx, 1, 9, 12, 3, '#b6a06a');
      px(ctx, 3, 4, 1, 5, '#7c6a44');
      px(ctx, 9, 5, 1, 4, '#7c6a44');
      px(ctx, 2, 4, 5, 1, '#e6d7a8');
      px(ctx, 6, 3, 6, 1, '#e6d7a8');
      px(ctx, 1, 12, 12, 1, '#2b6f95');
    },
    tankPlant: (ctx) => {
      px(ctx, 1, 7, 12, 6, '#7d8a74');
      px(ctx, 2, 5, 4, 2, '#5c6756');
      px(ctx, 3, 9, 8, 3, '#5a6a4c');
      px(ctx, 6, 8, 2, 3, '#3f4a37');
      px(ctx, 5, 3, 1, 3, '#4d5745');
    },
    missile: (ctx) => {
      px(ctx, 5, 2, 4, 8, '#b7bcc2');
      px(ctx, 6, 1, 2, 2, '#e2e6ea');
      px(ctx, 3, 10, 8, 2, '#6c7480');
      px(ctx, 6, 10, 2, 3, '#d1653f');
      px(ctx, 3, 12, 8, 1, '#4b535d');
    },
    airfield: (ctx) => {
      px(ctx, 1, 3, 12, 9, '#555f68');
      px(ctx, 3, 5, 8, 1, '#d9e2ea');
      px(ctx, 6, 6, 2, 4, '#d9e2ea');
      px(ctx, 3, 11, 2, 1, '#d9e2ea');
      px(ctx, 9, 11, 2, 1, '#d9e2ea');
      px(ctx, 1, 12, 12, 1, '#3a424a');
    },
    aa: (ctx) => {
      px(ctx, 2, 10, 10, 2, '#5f6a4f');
      px(ctx, 6, 4, 2, 6, '#8d9a7c');
      px(ctx, 3, 3, 8, 2, '#b4c1a3');
      px(ctx, 4, 2, 2, 1, '#d3dcc4');
      px(ctx, 8, 2, 2, 1, '#d3dcc4');
    },
    barricade: (ctx) => {
      px(ctx, 1, 6, 12, 3, '#7d6a4c');
      px(ctx, 1, 6, 3, 3, '#b3443c');
      px(ctx, 5, 6, 3, 3, '#d9cfb4');
      px(ctx, 9, 6, 3, 3, '#b3443c');
      px(ctx, 2, 9, 2, 4, '#5f5138');
      px(ctx, 10, 9, 2, 4, '#5f5138');
      px(ctx, 1, 5, 12, 1, '#4a4030');
    },
  };

  for (const [kind, paint] of Object.entries(glyphs) as [BuildingKind, (ctx: CanvasRenderingContext2D) => void][]) {
    const key = buildingTextureKey(kind);
    if (scene.textures.exists(key)) continue;
    const canvas = createCanvas(14, 14);
    paint(context(canvas));
    scene.textures.addCanvas(key, canvas);
  }
}

export { TILE_PIXELS };
