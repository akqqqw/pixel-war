/**
 * Every structure the player can buy. Three tabs: economy, weapons, security.
 * All numbers are deliberately readable in the UI — no hidden multipliers.
 */
export type BuildingTab = 'economy' | 'weapons' | 'security';

export type BuildingKind =
  | 'city'
  | 'factory'
  | 'port'
  | 'tankPlant'
  | 'missile'
  | 'airfield'
  | 'aa'
  | 'barricade';

export interface BuildingDef {
  kind: BuildingKind;
  tab: BuildingTab;
  name: string;
  short: string;
  desc: string;
  cost: number;
  /** Max number of these on a single territory. */
  limit: number;
  /** Money per tick. */
  income?: number;
  /** Population per tick (thousands of people). */
  population?: number;
  /** Army per tick. */
  army?: number;
  /** Effective radius in map tiles (security structures). */
  radius?: number;
  /** Extra defence for cells inside the radius, 0..1. */
  defense?: number;
  /** Attack bonus for the host territory, 0..1. */
  attack?: number;
  /** Intercepts incoming missiles inside the radius. */
  intercept?: boolean;
  /** Can only be built on a coastal territory. */
  coastal?: boolean;
}

export const BUILDINGS: Record<BuildingKind, BuildingDef> = {
  city: {
    kind: 'city',
    tab: 'economy',
    name: 'Город',
    short: 'Город',
    desc: 'Растит население и приносит налоги. Больше людей — больше армии.',
    cost: 260,
    limit: 3,
    income: 2,
    population: 2.5,
  },
  factory: {
    kind: 'factory',
    tab: 'economy',
    name: 'Завод',
    short: 'Завод',
    desc: 'Стабильный доход каждый час.',
    cost: 220,
    limit: 3,
    income: 4,
  },
  port: {
    kind: 'port',
    tab: 'economy',
    name: 'Морской порт',
    short: 'Порт',
    desc: 'Торговля с внешним миром. Строится только на побережье.',
    cost: 320,
    limit: 2,
    income: 6,
    coastal: true,
  },
  tankPlant: {
    kind: 'tankPlant',
    tab: 'weapons',
    name: 'Завод сборки танков',
    short: 'Танки',
    desc: 'Каждый час пополняет армию территории.',
    cost: 380,
    limit: 2,
    army: 0.6,
  },
  missile: {
    kind: 'missile',
    tab: 'weapons',
    name: 'Ракетная установка',
    short: 'Ракеты',
    desc: 'Автоматически бьёт по врагу в радиусе 2 территорий. ПВО сбивает ракеты.',
    cost: 420,
    limit: 2,
    radius: 2,
  },
  airfield: {
    kind: 'airfield',
    tab: 'weapons',
    name: 'Взлётная площадка',
    short: 'Авиация',
    desc: 'Усиливает атаку своей территории и соседних, добавляет армию.',
    cost: 400,
    limit: 2,
    army: 0.25,
    attack: 0.25,
    radius: 1,
  },
  aa: {
    kind: 'aa',
    tab: 'security',
    name: 'ПВО',
    short: 'ПВО',
    desc: 'Радиус 6 тайлов: сбивает ракеты и укрепляет оборону клеток.',
    cost: 320,
    limit: 2,
    radius: 6,
    defense: 0.2,
    intercept: true,
  },
  barricade: {
    kind: 'barricade',
    tab: 'security',
    name: 'Баррикада',
    short: 'Баррикада',
    desc: 'Радиус 4 тайла: враг почти не может перекрасить клетки внутри.',
    cost: 200,
    limit: 3,
    radius: 4,
    defense: 0.35,
  },
};

export const BUILDING_KINDS = Object.keys(BUILDINGS) as BuildingKind[];

export const TAB_LABELS: Record<BuildingTab, string> = {
  economy: 'Экономика',
  weapons: 'Оружие',
  security: 'Безопасность',
};

export const TAB_ORDER: readonly BuildingTab[] = ['economy', 'weapons', 'security'];

/** Cards are shown in design order: economy, then weapons, then security. */
const TAB_CONTENT: Record<BuildingTab, readonly BuildingKind[]> = {
  economy: ['factory', 'city', 'port'],
  weapons: ['missile', 'tankPlant', 'airfield'],
  security: ['aa', 'barricade'],
};

export function buildingsOfTab(tab: BuildingTab): BuildingDef[] {
  return TAB_CONTENT[tab].map((kind) => BUILDINGS[kind]).filter((def): def is BuildingDef => !!def);
}

export function buildingDef(kind: BuildingKind): BuildingDef {
  return BUILDINGS[kind];
}

/** Short, human readable effect line used on the build cards. */
export function buildingEffect(def: BuildingDef): string {
  const parts: string[] = [];
  if (def.income) parts.push(`+${def.income} ₽/ч`);
  if (def.population) parts.push(`+${def.population} тыс./ч`);
  if (def.army) parts.push(`+${def.army} армии/ч`);
  if (def.attack) parts.push(`атака +${Math.round(def.attack * 100)}%`);
  if (def.defense) parts.push(`оборона +${Math.round(def.defense * 100)}%`);
  if (def.intercept) parts.push('перехват ракет');
  if (def.radius && def.tab === 'security') parts.push(`радиус ${def.radius}`);
  if (def.tab === 'weapons' && def.kind === 'missile') parts.push('радиус 2 территории');
  return parts.join(' · ');
}
