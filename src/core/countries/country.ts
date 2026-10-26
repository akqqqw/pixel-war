import type { CountryId } from '@/core/types';

export interface CountryBonus {
  name: string;
  description: string;
  /** Extra starting money. */
  money?: number;
  /** Extra starting army in the capital. */
  capitalArmy?: number;
  /** Multiplier for the starting population. */
  populationMultiplier?: number;
  /** Extra starting buildings in the capital. */
  capitalBuildings?: string[];
}

export interface CountryDef {
  id: CountryId;
  name: string;
  shortName: string;
  capitalName: string;
  motto: string;
  description: string;
  colors: { primary: string; accent: string };
  bonus: CountryBonus;
}
