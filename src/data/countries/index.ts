import type { CountryDef } from '@/core/countries/country';

export const COUNTRIES: readonly CountryDef[] = [
  {
    id: 'aquilonia',
    name: 'Республика Аквилония',
    shortName: 'Аквилония',
    capitalName: 'Норд-Аквилон',
    motto: 'Торговля и порядок',
    description: 'Богатая морская республика: больше денег на старте и дешёвые порты.',
    colors: { primary: '#3f81d8', accent: '#9fd0ff' },
    bonus: {
      name: 'Торговый флот',
      description: '+300 ₽ на старте и порт в столице',
      money: 300,
      capitalBuildings: ['port'],
    },
  },
  {
    id: 'draconia',
    name: 'Драконская Федерация',
    shortName: 'Дракония',
    capitalName: 'Драконхейм',
    motto: 'Сталь решает всё',
    description: 'Военная федерация: сильная армия на старте, но меньше денег.',
    colors: { primary: '#d1473f', accent: '#ffb199' },
    bonus: {
      name: 'Железный кулак',
      description: '+40 армии в столице и завод сборки танков',
      capitalArmy: 40,
      capitalBuildings: ['tankPlant'],
    },
  },
  {
    id: 'veldania',
    name: 'Вельданская Конфедерация',
    shortName: 'Вельдания',
    capitalName: 'Вельд-Град',
    motto: 'Земля кормит, заводы куют',
    description: 'Промышленный край: больше населения и завод в столице.',
    colors: { primary: '#46a05e', accent: '#b6f0a8' },
    bonus: {
      name: 'Рудный край',
      description: '+25% населения на старте и завод в столице',
      capitalBuildings: ['factory'],
    },
  },
];

export function countryDef(id: string): CountryDef | undefined {
  return COUNTRIES.find((country) => country.id === id);
}
