import { buildingDamage, buildingRadius } from '@/core/buildings/buildings';
import { BALANCE } from '@/core/sim/balance';
import { areAtWar } from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import { fail, OK, type ActionResult } from '@/core/sim/result';
import type { BuildingInstance, GameState, Strike } from '@/core/state/types';
import type { CountryId } from '@/core/types';
import { cellRadiusDistance, isLandCell } from '@/core/world/cells';

export function findBuilding(state: GameState, buildingId: string): BuildingInstance | null {
  for (const region of Object.values(state.regions)) {
    const found = region.buildings.find((building) => building.id === buildingId);
    if (found) return found;
  }
  return null;
}

export function buildingRegion(state: GameState, building: BuildingInstance): string | null {
  for (const region of Object.values(state.regions)) {
    if (region.buildings.some((entry) => entry.id === building.id)) return region.id;
  }
  return null;
}

/** True when the structure can fire right now. */
export function isReady(state: GameState, building: BuildingInstance): boolean {
  return state.tick >= building.readyAtTick;
}

function cooldownTicks(building: BuildingInstance): number {
  if (building.kind === 'missile') return BALANCE.missileCooldownTicks;
  if (building.kind === 'airfield') return BALANCE.airStrikeCooldownTicks;
  return 0;
}

function validateStrike(
  state: GameState,
  countryId: CountryId,
  building: BuildingInstance,
  targetCell: number,
): ActionResult {
  const country = state.countries[countryId];
  if (!country) return fail('Государство не найдено.');
  if (state.status !== 'playing') return fail('Кампания окончена.');
  if (building.kind !== 'missile' && building.kind !== 'airfield') return fail('Это не оружие.');
  const regionId = buildingRegion(state, building);
  if (!regionId || state.regions[regionId]?.owner !== countryId) return fail('Установка потеряна.');
  if (!isReady(state, building)) return fail('Установка перезаряжается.');
  if (!isLandCell(state.world, targetCell)) return fail('Целью должна быть земля.');
  const targetOwner = state.cellOwner[targetCell] ?? -1;
  if (targetOwner < 0) return fail('Целью должна быть земля.');
  const targetCountry = state.countryOrder[targetOwner]!;
  if (targetCountry === countryId) return fail('Нельзя бить по своим.');
  if (!areAtWar(state, countryId, targetCountry)) return fail('Сначала объявите войну.');
  const radius = buildingRadius(building.kind, building.level);
  if (cellRadiusDistance(state.world, building.cell, targetCell) > radius) {
    return fail(`Цель вне радиуса (${radius}).`);
  }
  if (building.kind === 'airfield' && country.aircraft < 1) return fail('Нет самолётов.');
  return OK;
}

function queueStrike(state: GameState, countryId: CountryId, building: BuildingInstance, targetCell: number): void {
  const strike: Strike = {
    id: `s${state.nextIds.strike}`,
    kind: building.kind === 'missile' ? 'missile' : 'air',
    countryId,
    fromCell: building.cell,
    targetCell,
    fireAtTick: state.tick,
    resolveAtTick: state.tick + 2,
    power: buildingDamage(building.kind, building.level),
  };
  state.nextIds.strike += 1;
  state.strikes.push(strike);
  building.readyAtTick = state.tick + cooldownTicks(building);
}

export function fireMissile(
  state: GameState,
  countryId: CountryId,
  buildingId: string,
  targetCell: number,
): ActionResult {
  const building = findBuilding(state, buildingId);
  if (!building || building.kind !== 'missile') return fail('Ракетная установка не найдена.');
  const check = validateStrike(state, countryId, building, targetCell);
  if (!check.ok) return check;
  queueStrike(state, countryId, building, targetCell);
  state.countries[countryId]!.stats.missiles += 1;
  return OK;
}

export function launchAirStrike(
  state: GameState,
  countryId: CountryId,
  buildingId: string,
  targetCell: number,
): ActionResult {
  const building = findBuilding(state, buildingId);
  if (!building || building.kind !== 'airfield') return fail('Взлётная площадка не найдена.');
  const check = validateStrike(state, countryId, building, targetCell);
  if (!check.ok) return check;
  const country = state.countries[countryId]!;
  country.aircraft -= 1;
  country.stats.airStrikes += 1;
  queueStrike(state, countryId, building, targetCell);
  return OK;
}

/** Chance the AA coverage of a cell shoots a missile down. */
export function interceptChance(state: GameState, cell: number): number {
  return Math.min(BALANCE.maxInterceptChance, state.cellAir[cell] ?? 0);
}

function damageCell(state: GameState, cell: number, damage: number): number {
  const army = state.cellArmy[cell] ?? 0;
  if (army <= 0) return 0;
  const applied = Math.min(army, damage);
  state.cellArmy[cell] = Math.round((army - applied) * 10) / 10;
  return applied;
}

/** Applies every strike that has reached its target this tick. */
export function resolveStrikes(state: GameState): void {
  if (state.strikes.length === 0) return;
  const remaining: Strike[] = [];
  for (const strike of state.strikes) {
    if (state.tick < strike.resolveAtTick) {
      remaining.push(strike);
      continue;
    }
    const owner = state.cellOwner[strike.targetCell] ?? -1;
    const targetCountry = owner >= 0 ? state.countryOrder[owner] : null;
    const attacker = state.countries[strike.countryId];
    if (!attacker || !targetCountry) continue;
    const target = state.countries[targetCountry];
    if (!target) continue;

    if (strike.kind === 'missile') {
      const intercept = interceptChance(state, strike.targetCell);
      if (Math.random() < intercept) {
        pushEvent(state, 'missile', `ПВО ${target.shortName} сбила ракету.`, targetCountry, strike.targetCell);
        continue;
      }
      const damage = Math.round(strike.power);
      const applied = damageCell(state, strike.targetCell, damage);
      pushEvent(
        state,
        'missile',
        `Ракета ${attacker.shortName}: ${Math.round(applied)} солдат уничтожено.`,
        strike.countryId,
        strike.targetCell,
      );
      continue;
    }

    const damage = Math.round(strike.power);
    let total = 0;
    const radius = BALANCE.airStrikeSpread;
    const width = state.world.width;
    const cx = strike.targetCell % width;
    const cy = (strike.targetCell / width) | 0;
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= state.world.width || ny >= state.world.height) continue;
        const cell = ny * width + nx;
        if ((state.cellOwner[cell] ?? -1) !== owner) continue;
        const reduction = Math.min(0.8, (state.cellAir[cell] ?? 0) * BALANCE.aaAirStrikeReduction);
        const spread = dx === 0 && dy === 0 ? damage : damage * 0.5;
        total += damageCell(state, cell, spread * (1 - reduction));
      }
    }
    pushEvent(
      state,
      'air',
      `Авиаудар ${attacker.shortName}: ${Math.round(total)} солдат уничтожено.`,
      strike.countryId,
      strike.targetCell,
    );
  }
  state.strikes = remaining;
}
