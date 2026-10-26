/** Eight structures of Pixel World War: three tabs, three levels each. */

export type BuildingTab = 'economy' | 'weapons' | 'security';

export type BuildingKind =
  | 'factory'
  | 'city'
  | 'port'
  | 'missile'
  | 'tankPlant'
  | 'airfield'
  | 'aa'
  | 'barricade';

export interface BuildingDef {
  kind: BuildingKind;
  name: string;
  /** Short label for the compact cards. */
  short: string;
  tab: BuildingTab;
  cost: number;
  /** How many can stand on one region. */
  limit: number;
  maxLevel: number;
  /** Gold per second at level 1 (scaled by level). */
  income?: number;
  /** People per second at level 1 (scaled by level). */
  population?: number;
  /** Radius of action, map cells. */
  radius?: number;
  /** Extra defence inside the radius, 0..1 at level 1 (scaled by level). */
  defense?: number;
  /** Missile interception chance inside the radius, 0..1 at level 1. */
  intercept?: number;
  /** Damage of one strike at level 1. */
  damage?: number;
  /** Extra attack for friendly cells inside the radius, 0..1 at level 1. */
  attack?: number;
  /** Needs a coast to be placed. */
  coastal?: boolean;
  /** Short line shown on the card. */
  desc: string;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  city: {
    kind: 'city',
    name: 'Город',
    short: 'Город',
    tab: 'economy',
    cost: 800,
    limit: 3,
    maxLevel: 3,
    population: 5,
    income: 5,
    desc: 'Растит население и поднимает его предел.',
  },
  factory: {
    kind: 'factory',
    name: 'Завод',
    short: 'Завод',
    tab: 'economy',
    cost: 500,
    limit: 3,
    maxLevel: 3,
    income: 15,
    desc: 'Производит деньги для казны.',
  },
  port: {
    kind: 'port',
    name: 'Морской порт',
    short: 'Порт',
    tab: 'economy',
    cost: 1200,
    limit: 2,
    maxLevel: 3,
    income: 35,
    coastal: true,
    desc: 'Морская торговля. Только у воды.',
  },
  tankPlant: {
    kind: 'tankPlant',
    name: 'Завод сборки танков',
    short: 'Танки',
    tab: 'weapons',
    cost: 900,
    limit: 2,
    maxLevel: 3,
    desc: 'Собирает танки: сильнее атака и оборона.',
  },
  missile: {
    kind: 'missile',
    name: 'Ракетная установка',
    short: 'Ракеты',
    tab: 'weapons',
    cost: 1400,
    limit: 2,
    maxLevel: 3,
    radius: 24,
    damage: 140,
    desc: 'Ручной удар по врагу в радиусе. Есть перезарядка.',
  },
  airfield: {
    kind: 'airfield',
    name: 'Взлётная площадка',
    short: 'Авиация',
    tab: 'weapons',
    cost: 1100,
    limit: 2,
    maxLevel: 3,
    radius: 20,
    damage: 90,
    attack: 0.15,
    desc: 'Самолёты для ударов и усиления атаки рядом.',
  },
  aa: {
    kind: 'aa',
    name: 'ПВО',
    short: 'ПВО',
    tab: 'security',
    cost: 1000,
    limit: 3,
    maxLevel: 3,
    radius: 8,
    intercept: 0.7,
    defense: 0.1,
    desc: 'Сбивает ракеты и ослабляет авиаудары.',
  },
  barricade: {
    kind: 'barricade',
    name: 'Баррикада',
    short: 'Баррикада',
    tab: 'security',
    cost: 400,
    limit: 4,
    maxLevel: 3,
    radius: 4,
    defense: 0.35,
    desc: 'Усиливает оборону клеток в радиусе.',
  },
};

export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];

export const TAB_LABELS: Record<BuildingTab, string> = {
  economy: 'Экономика',
  weapons: 'Оружие',
  security: 'Безопасность',
};

export const TAB_ORDER: readonly BuildingTab[] = ['economy', 'weapons', 'security'];

const TAB_CONTENT: Record<BuildingTab, readonly BuildingKind[]> = {
  economy: ['factory', 'city', 'port'],
  weapons: ['missile', 'tankPlant', 'airfield'],
  security: ['aa', 'barricade'],
};

export function buildingsOfTab(tab: BuildingTab): BuildingDef[] {
  return TAB_CONTENT[tab].map((kind) => BUILDINGS[kind]);
}

/** Level multiplier: 1 → ×1, 2 → ×1.5, 3 → ×2.25. */
export function levelFactor(level: number): number {
  return Math.pow(1.5, Math.max(0, level - 1));
}

/** Price of the next level. */
export function upgradeCost(kind: BuildingKind, level: number): number {
  return Math.round(BUILDINGS[kind].cost * 0.9 * Math.pow(1.6, Math.max(0, level - 1)));
}

export function buildingIncome(kind: BuildingKind, level: number): number {
  return Math.round((BUILDINGS[kind].income ?? 0) * levelFactor(level) * 10) / 10;
}

export function buildingPopulation(kind: BuildingKind, level: number): number {
  return Math.round((BUILDINGS[kind].population ?? 0) * levelFactor(level) * 10) / 10;
}

export function buildingDefense(kind: BuildingKind, level: number): number {
  return Math.round((BUILDINGS[kind].defense ?? 0) * levelFactor(level) * 1000) / 1000;
}

export function buildingRadius(kind: BuildingKind, level: number): number {
  const base = BUILDINGS[kind].radius ?? 0;
  if (!base) return 0;
  return Math.round(base * (1 + (level - 1) * 0.15));
}

export function buildingDamage(kind: BuildingKind, level: number): number {
  return Math.round((BUILDINGS[kind].damage ?? 0) * levelFactor(level));
}

export function buildingIntercept(kind: BuildingKind, level: number): number {
  return Math.round((BUILDINGS[kind].intercept ?? 0) * levelFactor(level) * 1000) / 1000;
}

/** Compact effect line for the cards and the context menu. */
export function buildingEffect(kind: BuildingKind, level = 1): string {
  const def = BUILDINGS[kind];
  const parts: string[] = [];
  if (def.income) parts.push(`+${buildingIncome(kind, level)} зол/с`);
  if (def.population) parts.push(`+${buildingPopulation(kind, level)} люд/с`);
  if (def.intercept) {
    parts.push(`перехват ${Math.round(Math.min(0.95, buildingIntercept(kind, level)) * 100)}%`);
  }
  if (def.defense && kind === 'barricade') {
    parts.push(`оборона +${Math.round(buildingDefense(kind, level) * 100)}%`);
  }
  if (def.attack) parts.push(`атака +${Math.round(def.attack * levelFactor(level) * 100)}%`);
  if (def.damage) parts.push(`урон ${buildingDamage(kind, level)}`);
  if (kind === 'tankPlant') parts.push('производит танки');
  if (def.radius) parts.push(`радиус ${buildingRadius(kind, level)}`);
  return parts.join(' · ');
}
