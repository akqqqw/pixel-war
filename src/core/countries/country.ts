import type { CountryId, Resources } from '@/core/types';
import type { LandUnitType } from '@/core/units/unitTypes';

export interface CountryBonus {
  name: string;
  description: string;
  resources?: Partial<Resources>;
  capitalUnits?: Partial<Record<LandUnitType, number>>;
}

export interface CountryDef {
  id: CountryId;
  name: string;
  shortName: string;
  capitalName: string;
  motto: string;
  description: string;
  /** Base palette; the renderer derives borders and highlights from it. */
  colors: { primary: string; accent: string };
  bonus: CountryBonus;
}

export interface CountryState {
  id: CountryId;
  /** null for neutral / rebel territories. */
  name: string;
  color: string;
  accent: string;
  capitalTerritoryId: string | null;
  isPlayer: boolean;
  /** Money income multiplier from national focus. */
  incomeBonus: number;
  /** Fraction of the map (territory count / total) — cached for the HUD. */
  territoryCount: number;
  alive: boolean;
}
