/** Terrain codes are stored as bytes in the world tile grid. */
export const TERRAIN = {
  Ocean: 0,
  Shallow: 1,
  Plains: 2,
  Forest: 3,
  Hills: 4,
  Mountain: 5,
  Desert: 6,
  Tundra: 7,
} as const;

export type TerrainCode = (typeof TERRAIN)[keyof typeof TERRAIN];

export interface TerrainInfo {
  code: TerrainCode;
  name: string;
  land: boolean;
  /** Pixel-art palette: darkest -> base -> highlight (used by the map renderer). */
  palette: readonly [string, string, string];
  /** Multiplier applied to a defender's firepower in this terrain. */
  defenseBonus: number;
  /** Multiplier applied to an attacker's firepower coming into this terrain. */
  attackModifier: number;
  /** Affects unit movement / transfer time. */
  moveCost: number;
  water: boolean;
}

export const TERRAIN_INFO: Record<TerrainCode, TerrainInfo> = {
  [TERRAIN.Ocean]: {
    code: TERRAIN.Ocean,
    name: 'Океан',
    land: false,
    palette: ['#0b1e3a', '#0f2a4f', '#164273'],
    defenseBonus: 1,
    attackModifier: 1,
    moveCost: 1,
    water: true,
  },
  [TERRAIN.Shallow]: {
    code: TERRAIN.Shallow,
    name: 'Мелководье',
    land: false,
    palette: ['#173f63', '#1d567f', '#2b6f96'],
    defenseBonus: 1,
    attackModifier: 1,
    moveCost: 1,
    water: true,
  },
  [TERRAIN.Plains]: {
    code: TERRAIN.Plains,
    name: 'Равнины',
    land: true,
    palette: ['#3d5a2b', '#557a37', '#6f9645'],
    defenseBonus: 1,
    attackModifier: 1.08,
    moveCost: 1,
    water: false,
  },
  [TERRAIN.Forest]: {
    code: TERRAIN.Forest,
    name: 'Леса',
    land: true,
    palette: ['#1f3f24', '#2c5730', '#3d7039'],
    defenseBonus: 1.2,
    attackModifier: 0.9,
    moveCost: 1.5,
    water: false,
  },
  [TERRAIN.Hills]: {
    code: TERRAIN.Hills,
    name: 'Холмы',
    land: true,
    palette: ['#4a4630', '#625c3d', '#7b744c'],
    defenseBonus: 1.28,
    attackModifier: 0.92,
    moveCost: 1.6,
    water: false,
  },
  [TERRAIN.Mountain]: {
    code: TERRAIN.Mountain,
    name: 'Горы',
    land: true,
    palette: ['#3a3a42', '#4f4f59', '#6b6b76'],
    defenseBonus: 1.45,
    attackModifier: 0.78,
    moveCost: 2.2,
    water: false,
  },
  [TERRAIN.Desert]: {
    code: TERRAIN.Desert,
    name: 'Пустыня',
    land: true,
    palette: ['#8a6f3c', '#b0904f', '#cdac66'],
    defenseBonus: 0.95,
    attackModifier: 0.95,
    moveCost: 1.3,
    water: false,
  },
  [TERRAIN.Tundra]: {
    code: TERRAIN.Tundra,
    name: 'Тундра',
    land: true,
    palette: ['#4b5b58', '#61736e', '#7d8f88'],
    defenseBonus: 1.12,
    attackModifier: 0.9,
    moveCost: 1.4,
    water: false,
  },
};

export function isLand(code: TerrainCode): boolean {
  return TERRAIN_INFO[code]?.land ?? false;
}

export function terrainName(code: TerrainCode): string {
  return TERRAIN_INFO[code]?.name ?? 'Неизвестно';
}
