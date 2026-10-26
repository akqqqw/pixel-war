import { BALANCE } from '@/core/sim/balance';
import {
  countryArmy,
  countryPopulation,
  recomputeFortification,
  regionArmy,
  regionIncome,
  territoryShare,
} from '@/core/sim/effects';
import { pushEvent } from '@/core/sim/events';
import type { GameState, RegionState } from '@/core/state/types';
import { countryIndexOf } from '@/core/state/types';
import type { CountryId, TerritoryId } from '@/core/types';

export interface OwnershipChange {
  regionId: TerritoryId;
  from: CountryId | null;
  to: CountryId;
}

function dominantOwner(state: GameState, region: RegionState): CountryId | null {
  const territory = state.world.territories.find((entry) => entry.id === region.id);
  if (!territory) return region.owner;
  const counts = new Map<number, number>();
  for (const cell of territory.tiles) {
    const owner = state.cellOwner[cell] ?? -1;
    if (owner < 0) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  let bestIndex = -1;
  let bestCount = 0;
  for (const [index, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestIndex = index;
    }
  }
  if (bestIndex < 0) return null;
  // Hysteresis: the region only flips when most of its cells changed hands.
  if (bestCount / Math.max(1, territory.tiles.length) < 0.5) return region.owner;
  return state.countryOrder[bestIndex] ?? null;
}

/** Structures standing on lost cells are destroyed, the rest change owner with the region. */
function settleBuildings(state: GameState, region: RegionState, owner: CountryId, keepShare: number): void {
  const ownerIndex = countryIndexOf(state, owner);
  const survivors = region.buildings.filter((building) => {
    const cellOwner = state.cellOwner[building.cell] ?? -1;
    if (cellOwner !== ownerIndex) return false;
    return Math.random() < keepShare;
  });
  region.buildings = survivors;
}

function relocateCapital(state: GameState, country: { capitalRegionId: TerritoryId | null; id: CountryId }): void {
  const owned = Object.values(state.regions)
    .filter((region) => region.owner === country.id)
    .sort((a, b) => b.population - a.population);
  country.capitalRegionId = owned[0]?.id ?? null;
}

/**
 * Recomputes region ownership from the cell map and handles the consequences of
 * a lost region: population loss, destroyed structures, relocating capitals and
 * elimination of a country that has no cells left.
 */
export function refreshRegionOwnership(state: GameState): OwnershipChange[] {
  const changes: OwnershipChange[] = [];

  for (const region of Object.values(state.regions)) {
    const owner = dominantOwner(state, region);
    if (!owner || owner === region.owner) continue;
    const previous = region.owner;
    const previousCountry = previous ? state.countries[previous] : null;
    const nextCountry = state.countries[owner];
    if (!nextCountry) continue;

    region.owner = owner;
    region.capturedAtTick = state.tick;
    region.population = Math.max(40, Math.round(region.population * BALANCE.capturedPopulationShare));
    settleBuildings(state, region, owner, BALANCE.capturedBuildingShare);

    if (previousCountry) {
      previousCountry.stats.lost += 1;
      if (previousCountry.capitalRegionId === region.id) relocateCapital(state, previousCountry);
      const stillOwned = Object.values(state.regions).some((entry) => entry.owner === previous);
      if (!stillOwned) {
        previousCountry.alive = false;
        previousCountry.capitalRegionId = null;
        previousCountry.army = 0;
        for (const country of Object.values(state.countries)) {
          country.warWith = country.warWith.filter((id) => id !== previous);
        }
        pushEvent(state, 'capture', `${previousCountry.name} потеряла последнюю территорию.`, previous ?? undefined);
      }
    }

    nextCountry.stats.captured += 1;
    if (!nextCountry.capitalRegionId) nextCountry.capitalRegionId = region.id;
    pushEvent(
      state,
      'capture',
      `${nextCountry.shortName} заняла регион ${region.id.toUpperCase()}.`,
      owner,
      state.world.territories.find((entry) => entry.id === region.id)?.tiles[0],
    );
    changes.push({ regionId: region.id, from: previous, to: owner });
  }

  if (changes.length > 0) {
    recomputeFortification(state);
    for (const order of state.orders) {
      if (!order.active) continue;
      // The push survives a lost region as long as the country still holds a
      // single cell there; the soldiers themselves live on the cells.
      const territory = state.world.territories.find((entry) => entry.id === order.sourceRegionId);
      const index = countryIndexOf(state, order.countryId);
      const holdsCell =
        !!territory && index >= 0 && territory.tiles.some((cell) => (state.cellOwner[cell] ?? -1) === index);
      if (!holdsCell) order.active = false;
    }
  }
  return changes;
}

/** Refreshes every derived number the interface and the AI read. */
export function refreshTotals(state: GameState): void {
  for (const region of Object.values(state.regions)) {
    region.army = Math.round(regionArmy(state, region.id) * 10) / 10;
    region.income = regionIncome(region);
  }
  sampleHistory(state);
  for (const country of Object.values(state.countries)) {
    country.army = Math.round(countryArmy(state, country.id) * 10) / 10;
    country.population = Math.round(countryPopulation(state, country.id));
    const index = countryIndexOf(state, country.id);
    let gross = 0;
    if (index >= 0) {
      for (const region of Object.values(state.regions)) {
        if (region.owner === country.id) gross += region.income;
      }
    }
    const upkeep = country.army * BALANCE.armyUpkeepPerSoldierPerSecond;
    country.income = Math.round((gross - upkeep) * 10) / 10;
  }
}

/**
 * Keeps a coarse graph of the war: one point every `historyInterval` ticks with
 * the land share of each country. Old points fall out, so a save stays small.
 */
function sampleHistory(state: GameState): void {
  if (!Array.isArray(state.history)) state.history = [];
  if (state.tick <= 0 || state.tick % BALANCE.historyInterval !== 0) return;
  const share = state.countryOrder.map((id) => Math.round(territoryShare(state, id) * 1000) / 1000);
  const last = state.history[state.history.length - 1];
  if (last && last.tick === state.tick) return;
  state.history.push({ tick: state.tick, share });
  if (state.history.length > BALANCE.historyLength) state.history.splice(0, state.history.length - BALANCE.historyLength);
}

/** Land cells of a country. */
export function countCells(state: GameState, countryId: CountryId): number {
  const index = countryIndexOf(state, countryId);
  if (index < 0) return 0;
  let count = 0;
  for (let cell = 0; cell < state.cellOwner.length; cell += 1) {
    if (state.cellOwner[cell] === index) count += 1;
  }
  return count;
}
