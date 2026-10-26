import type { CountryDef } from '@/core/countries/country';

export const COUNTRIES: readonly CountryDef[] = [
  {
    id: 'aquilonia',
    name: 'Республика Аквилония',
    shortName: 'Аквилония',
    capitalName: 'Норд-Аквилон',
    motto: 'Порядок. Флот. Процветание.',
    description:
      'Морская торговая республика с сильной экономикой и современной армией. Идеальный выбор для игрока, который любит развивать государство и побеждать расчётом.',
    colors: { primary: '#3f81d8', accent: '#9fd0ff' },
    bonus: {
      name: 'Торговый флот',
      description: '+15% к доходу, стартовый запас денег',
      resources: { money: 900, metal: 260, oil: 180, energy: 120 },
    },
  },
  {
    id: 'draconia',
    name: 'Драконская Федерация',
    shortName: 'Дракония',
    capitalName: 'Драконхейм',
    motto: 'Сталь решает всё.',
    description:
      'Милитаризованная федерация с мощной бронетехникой. Начинает с дополнительными танками, но уступает в экономике.',
    colors: { primary: '#d1473f', accent: '#ffb199' },
    bonus: {
      name: 'Железный кулак',
      description: 'Дополнительные танки и БМП в столице',
      resources: { money: 700, metal: 420, oil: 240, energy: 110 },
      capitalUnits: { mbt: 2, ifv: 2 },
    },
  },
  {
    id: 'veldania',
    name: 'Вельданская Конфедерация',
    shortName: 'Вельдания',
    capitalName: 'Вельд-Град',
    motto: 'Земля кормит, заводы куют.',
    description:
      'Промышленная конфедерация с богатыми рудными регионами. Много металла для производства техники.',
    colors: { primary: '#46a05e', accent: '#b6f0a8' },
    bonus: {
      name: 'Рудный край',
      description: 'Большой запас металла на старте',
      resources: { money: 780, metal: 520, oil: 200, energy: 140 },
      capitalUnits: { ifv: 1, spg: 1 },
    },
  },
];

export function countryDef(id: string): CountryDef | undefined {
  return COUNTRIES.find((country) => country.id === id);
}
