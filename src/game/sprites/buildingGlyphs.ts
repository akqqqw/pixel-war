import type { BuildingKind } from '@/core/buildings/buildings';
import { context, createCanvas, px } from '@/game/sprites/terrainPainter';

/** 14×14 pixel glyphs shared by the Phaser textures and the React cards. */
export const GLYPH_SIZE = 14;

export const BUILDING_GLYPHS: Record<BuildingKind, (ctx: CanvasRenderingContext2D) => void> = {
    city: (ctx: CanvasRenderingContext2D) => {
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


/** Paints a structure glyph into any 2D context. */
export function paintBuilding(ctx: CanvasRenderingContext2D, kind: BuildingKind): void {
  BUILDING_GLYPHS[kind](ctx);
}

/** Off-screen canvas with the glyph, used by the interface. */
export function buildingGlyphCanvas(kind: BuildingKind): HTMLCanvasElement {
  const canvas = createCanvas(GLYPH_SIZE, GLYPH_SIZE);
  paintBuilding(context(canvas), kind);
  return canvas;
}
