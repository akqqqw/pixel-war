/** One central place for every tunable number of the simplified game. */

/** World time: one tick is one hour. */
export const TICK_MS = 1000;

export const BALANCE = {
  /** Money per tick from one thousand people. */
  taxRate: 0.01,
  /** Money per tick each army point costs. */
  armyUpkeep: 0.09,
  /** Passive population growth per tick (share of the current population). */
  populationGrowth: 0.0008,
  /** Base population capacity of a territory (thousands). */
  basePopulationCap: 5000,
  /** Extra capacity per city (thousands). */
  cityPopulationCap: 3000,
  /** How much population one army point takes to raise. */
  populationPerArmy: 0.4,
  /** Army a territory can support per one thousand people. */
  armyCapRatio: 0.06,
  /** Money price of one recruited army point. */
  recruitCost: 6,
  /** Terrain defence multiplier (1 = plains). */
  terrainDefense: 1,
  /** Population counts towards defence this much per thousand people. */
  populationDefense: 0.02,
  /** How much of its army a territory brings to defence (the rest is in reserve). */
  defenseArmyWeight: 0.6,
  /** Army difference needed to convert one cell. */
  armyPerFlip: 8,
  /** Security structures never add more than this to defence. */
  maxSecurityDefense: 0.5,
  /** Terrain defence is compressed towards 1 so hills are not fortresses. */
  terrainDefenseWeight: 0.6,
  /** Max cells a country can convert per border pair each tick. */
  maxFlipsPerBorder: 3,
  /** Army the attacking supplier loses per converted cell. */
  flipAttrition: 1,
  /** Army the defending territory loses per converted cell. */
  defenderFlipArmyLoss: 0.6,
  /** Share of the defending population lost per converted cell. */
  defenderFlipPopLoss: 0.004,
  /** Share of tiles the new owner needs to take the whole territory. */
  captureShare: 0.55,
  /** Missile damage. */
  missileDamage: 16,
  /** Ticks between missile launches. */
  missileCooldown: 18,
  /** Territory hops a missile can reach. */
  missileRange: 2,
  /** Chance an AA battery shoots a missile down. */
  aaInterceptChance: 0.7,
  /** Share of the loser's army that retreats instead of dying. */
  retreatShare: 0.4,
  /** Share of buildings destroyed when a territory changes hands. */
  buildingLossChance: 0.5,
  /** Start money for every country. */
  startMoney: 520,
  /** Start army per ordinary territory. */
  startArmy: 40,
  /** Start army in the capital. */
  startCapitalArmy: 90,
  /** Population is stored in thousands: static world population / this. */
  populationScale: 1000,
  /** Minimum army a territory needs before it can push cells. */
  minAttackArmy: 6,
  /** Share of the army disbanded each tick while the treasury is empty. */
  unpaidAttrition: 0.03,
  /** AI think interval in ticks. */
  aiInterval: { easy: 20, normal: 14, hard: 9 },
  /** Peace offer acceptance margin. */
  peaceArmyRatio: 1.3,
} as const;
