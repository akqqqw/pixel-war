/**
 * One place for every tunable number of Pixel World War.
 * All rates are per real second unless the name says otherwise.
 */

/** Logic tick. The battle and economy advance twice a second at ×1 speed. */
export const TICK_MS = 500;
export const TICK_SECONDS = TICK_MS / 1000;

export const BALANCE = {
  // ---------- economy ----------
  /** Gold per second from one citizen. */
  taxPerCitizenPerSecond: 0.004,
  /** Gold per second each soldier costs. */
  armyUpkeepPerSoldierPerSecond: 0.012,
  /** Population a region grows on its own, people per second. */
  basePopulationGrowth: 0.2,
  /** Population capacity of a region without cities. */
  basePopulationCap: 2200,
  /** Extra capacity for every city level in the region. */
  cityPopulationCap: 800,
  /** Citizens that leave the region when one soldier is mobilised. */
  populationPerSoldier: 1,
  /** Gold price of one mobilised soldier. */
  mobilizeCostPerSoldier: 0.6,
  /** Biggest single mobilisation, share of the region population. */
  mobilizeSharePerAction: 0.35,
  /** Ticks between two mobilisations in the same region. */
  mobilizeCooldownTicks: 3,
  /** Below this population a region stops feeding the army. */
  minMobilizePopulation: 60,
  /** Soldiers a region can hold per 100 citizens (0.35 = 35 %). */
  garrisonRatio: 0.35,

  // ---------- cell combat ----------
  /** Share of a cell's army that joins the attack every tick. */
  attackCommitShare: 0.6,
  /** Attack must exceed defence by this factor to take a cell. */
  captureRatio: 1.05,
  /** Share of the defence a captured cell costs the attacker. */
  captureLossShare: 0.85,
  /** Losses of the defender when a cell holds, share of the attack. */
  defenderLossOnHold: 0.35,
  /** Losses of the attackers when a cell holds, share of the defence. */
  attackerLossOnHold: 0.22,
  /** Share of a beaten garrison that retreats to a friendly neighbour. */
  retreatShare: 0.25,
  /** Militia defence every land cell has without soldiers. */
  cellMilitiaDefense: 1.2,
  /** How strongly terrain shapes defences (1 = full TERRAIN_INFO bonus). */
  terrainWeight: 0.75,
  /** Fortification bonus from barricades, additive per covering structure. */
  maxFortDefense: 1.5,

  // ---------- army flow ----------
  /** Part of the ordered share that leaves a cell every tick. */
  marchRate: 0.5,
  /** Ticks without a single capture before the push looks for another border. */
  offensiveStallTicks: 24,

  // ---------- military modifiers ----------
  tankAttackBonus: 0.004,
  tankDefenseBonus: 0.0025,
  maxTankAttackBonus: 0.8,
  maxTankDefenseBonus: 0.6,
  airfieldAttackBonus: 0.15,
  maxAirfieldAttackBonus: 0.45,

  // ---------- strikes ----------
  missileDamage: 140,
  missileCooldownTicks: 16,
  airStrikeDamage: 90,
  airStrikeCooldownTicks: 12,
  /** Damage is spread over this square radius around the target (0 = one cell). */
  airStrikeSpread: 1,
  /** Chance a single AA battery intercepts a missile. */
  aaInterceptChance: 0.7,
  /** Overlapping AA batteries can never block more than this. */
  maxInterceptChance: 0.9,
  /** AA also softens air strikes by this much inside its radius. */
  aaAirStrikeReduction: 0.5,

  // ---------- world / start ----------
  startMoney: 2500,
  startPopulation: 1500,
  startArmy: 420,
  startCapitalPopulation: 3200,
  startCapitalArmy: 180,
  /** Population a captured region keeps. */
  capturedPopulationShare: 0.75,
  /** Share of buildings that survive a capture. */
  capturedBuildingShare: 0.5,

  // ---------- AI ----------
  /** One point of the campaign graph every N ticks (20 ticks = 10 seconds). */
  historyInterval: 20,
  /** Points kept in the graph — older samples are dropped. */
  historyLength: 180,
  aiInterval: { easy: 18, normal: 12, hard: 8 },
  earlyWarTick: { easy: 260, normal: 180, hard: 110 },
  aiWarRatio: { easy: 1.9, normal: 1.45, hard: 1.2 },
  aiOffensiveShare: { easy: 0.5, normal: 0.7, hard: 0.9 },
} as const;

export type Balance = typeof BALANCE;
