import type { Resources } from '@/core/types';

export type LandUnitType = 'mbt' | 'lightTank' | 'apc' | 'ifv' | 'spg' | 'mlrs';

export const LAND_UNIT_TYPES: readonly LandUnitType[] = ['mbt', 'lightTank', 'apc', 'ifv', 'spg', 'mlrs'];

export interface SpriteSpec {
  /** Native pixel-art frame size. */
  width: number;
  height: number;
  /** Body colour used by the procedural sprite painter. */
  body: string;
  /** Secondary colour (tracks, accents). */
  accent: string;
  /** Barrel / turret colour. */
  detail: string;
}

export interface LandUnitDef {
  id: LandUnitType;
  name: string;
  shortName: string;
  description: string;
  role: 'main' | 'recon' | 'support' | 'siege';
  cost: Resources;
  /** Game ticks needed to build one unit. */
  buildTime: number;
  /** Per-tick upkeep. */
  upkeep: Partial<Resources>;
  hp: number;
  attack: number;
  armor: number;
  /** Effective range in tiles (used by the battlefield preview). */
  range: number;
  /** Movement speed in tiles per second. */
  speed: number;
  /** Seconds between shots. */
  reload: number;
  morale: number;
  sprite: SpriteSpec;
}

export const LAND_UNITS: Record<LandUnitType, LandUnitDef> = {
  mbt: {
    id: 'mbt',
    name: 'Основной боевой танк',
    shortName: 'ОБТ',
    description: 'Тяжёлая броня и мощное орудие. Ядро любого наступления.',
    role: 'main',
    cost: { money: 260, metal: 120, oil: 40, energy: 12 },
    buildTime: 16,
    upkeep: { money: 0.5, metal: 0.09, oil: 0.18, energy: 0.03 },
    hp: 130,
    attack: 36,
    armor: 14,
    range: 2,
    speed: 0.9,
    reload: 2.6,
    morale: 80,
    sprite: { width: 32, height: 32, body: '#4f6b45', accent: '#2b3a26', detail: '#8fa07a' },
  },
  lightTank: {
    id: 'lightTank',
    name: 'Лёгкий танк',
    shortName: 'ЛТ',
    description: 'Быстрый и дешёвый. Хорош для рейдов и обхода обороны.',
    role: 'recon',
    cost: { money: 150, metal: 65, oil: 24, energy: 8 },
    buildTime: 10,
    upkeep: { money: 0.26, metal: 0.05, oil: 0.1, energy: 0.02 },
    hp: 82,
    attack: 23,
    armor: 7,
    range: 2,
    speed: 1.5,
    reload: 1.9,
    morale: 78,
    sprite: { width: 32, height: 32, body: '#6f7f4a', accent: '#37411f', detail: '#a9b87a' },
  },
  apc: {
    id: 'apc',
    name: 'Бронетранспортёр',
    shortName: 'БТР',
    description: 'Дешёвый разведывательный юнит. Быстро занимает пустые территории.',
    role: 'recon',
    cost: { money: 90, metal: 40, oil: 14, energy: 5 },
    buildTime: 7,
    upkeep: { money: 0.14, metal: 0.03, oil: 0.06, energy: 0.012 },
    hp: 64,
    attack: 11,
    armor: 6,
    range: 1,
    speed: 1.8,
    reload: 1.4,
    morale: 72,
    sprite: { width: 32, height: 32, body: '#5c6b53', accent: '#2c3527', detail: '#93a181' },
  },
  ifv: {
    id: 'ifv',
    name: 'Боевая машина пехоты',
    shortName: 'БМП',
    description: 'Универсальная машина поддержки с автопушкой.',
    role: 'support',
    cost: { money: 130, metal: 55, oil: 18, energy: 6 },
    buildTime: 8,
    upkeep: { money: 0.2, metal: 0.04, oil: 0.08, energy: 0.016 },
    hp: 74,
    attack: 19,
    armor: 7,
    range: 1.5,
    speed: 1.4,
    reload: 1.6,
    morale: 75,
    sprite: { width: 32, height: 32, body: '#55705a', accent: '#28352b', detail: '#8fb096' },
  },
  spg: {
    id: 'spg',
    name: 'Самоходная артиллерия',
    shortName: 'САУ',
    description: 'Дальнобойная поддержка: ослабляет гарнизон перед штурмом.',
    role: 'siege',
    cost: { money: 210, metal: 95, oil: 34, energy: 10 },
    buildTime: 13,
    upkeep: { money: 0.34, metal: 0.06, oil: 0.14, energy: 0.024 },
    hp: 70,
    attack: 44,
    armor: 4,
    range: 4,
    speed: 0.8,
    reload: 3.4,
    morale: 70,
    sprite: { width: 32, height: 32, body: '#6d6440', accent: '#332f1c', detail: '#a89c6b' },
  },
  mlrs: {
    id: 'mlrs',
    name: 'Реактивная система залпового огня',
    shortName: 'РСЗО',
    description: 'Залп по площади. Уничтожает большие гарнизоны, но уязвима в ближнем бою.',
    role: 'siege',
    cost: { money: 270, metal: 110, oil: 46, energy: 14 },
    buildTime: 17,
    upkeep: { money: 0.44, metal: 0.07, oil: 0.18, energy: 0.03 },
    hp: 64,
    attack: 58,
    armor: 3,
    range: 5,
    speed: 0.75,
    reload: 4.2,
    morale: 68,
    sprite: { width: 32, height: 32, body: '#6b5a3c', accent: '#2f2718', detail: '#a58c5f' },
  },
};

export const UNIT_LIST: readonly LandUnitDef[] = LAND_UNIT_TYPES.map((id) => LAND_UNITS[id]);

/** Units that can hold ground on their own when a territory has no garrison. */
export const GARRISON_FREE_CAPTURE: readonly LandUnitType[] = ['apc', 'ifv', 'lightTank', 'mbt', 'spg', 'mlrs'];
