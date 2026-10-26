import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  BUILDING_KINDS,
  TAB_LABELS,
  TAB_ORDER,
  buildingEffect,
  buildingsOfTab,
} from '@/core/buildings/buildings';
import { canBuild, build } from '@/core/sim/actions';
import { countKind, defenseStrength, securityDefense, territoryEffects } from '@/core/sim/effects';
import { createGame } from '@/core/state/createGame';

function setup(seed = 314) {
  const game = createGame({ seed, playerCountryId: 'aquilonia', difficulty: 'normal' });
  const playerId = game.playerCountryId;
  const country = game.countries[playerId]!;
  const owned = Object.values(game.territories).filter((t) => t.owner === playerId);
  const empty = owned.filter((t) => t.buildings.length === 0);
  const coastal = owned.find(
    (t) => game.world.territories.find((s) => s.id === t.id)?.isCoastal && t.buildings.length === 0,
  );
  return { game, playerId, country, owned, empty, coastal };
}

describe('buildings', () => {
  it('splits into the three bottom-panel tabs', () => {
    expect(TAB_ORDER).toEqual(['economy', 'weapons', 'security']);
    expect(TAB_LABELS.economy).toBe('Экономика');
    expect(TAB_LABELS.weapons).toBe('Оружие');
    expect(TAB_LABELS.security).toBe('Безопасность');

    expect(buildingsOfTab('economy').map((b) => b.kind)).toEqual(['factory', 'city', 'port']);
    expect(buildingsOfTab('weapons').map((b) => b.kind)).toEqual(['missile', 'tankPlant', 'airfield']);
    expect(buildingsOfTab('security').map((b) => b.kind)).toEqual(['aa', 'barricade']);
    expect(new Set(BUILDING_KINDS).size).toBe(8);
  });

  it('gives every structure a price, a limit and a readable effect', () => {
    for (const kind of BUILDING_KINDS) {
      const def = BUILDINGS[kind];
      expect(def.cost).toBeGreaterThan(0);
      expect(def.limit).toBeGreaterThan(0);
      expect(def.name.length).toBeGreaterThan(0);
      expect(buildingEffect(def).length).toBeGreaterThan(0);
    }
    expect(BUILDINGS.port.coastal).toBe(true);
    expect(BUILDINGS.aa.radius).toBeGreaterThan(0);
    expect(BUILDINGS.barricade.radius).toBeGreaterThan(0);
    expect(BUILDINGS.aa.defense).toBeGreaterThan(0);
    expect(BUILDINGS.barricade.defense).toBeGreaterThan(0);
  });

  it('builds only on own, affordable territories', () => {
    const { game, playerId, country } = setup();
    const foreign = Object.values(game.territories).find((t) => t.owner !== playerId)!;
    expect(canBuild(game, playerId, foreign.id, 'factory').ok).toBe(false);

    const own = Object.values(game.territories).find((t) => t.owner === playerId)!;
    country.money = 0;
    const poor = canBuild(game, playerId, own.id, 'factory');
    expect(poor.ok).toBe(false);
    expect(poor.message).toContain('₽');

    country.money = 5000;
    expect(canBuild(game, playerId, own.id, 'factory').ok).toBe(true);
  });

  it('requires a coast for the port', () => {
    const { game, playerId, country, owned } = setup();
    country.money = 5000;
    const inland = owned.find((t) => !game.world.territories.find((s) => s.id === t.id)?.isCoastal);
    if (inland) expect(canBuild(game, playerId, inland.id, 'port').ok).toBe(false);
    const coastal = owned.find((t) => game.world.territories.find((s) => s.id === t.id)?.isCoastal);
    if (coastal) expect(canBuild(game, playerId, coastal.id, 'port').ok).toBe(true);
  });

  it('respects per-territory limits', () => {
    const { game, playerId, country, empty } = setup();
    country.money = 100_000;
    const territory = empty[0]!;
    const limit = BUILDINGS.barricade.limit;
    for (let i = 0; i < limit; i += 1) {
      expect(build(game, playerId, territory.id, 'barricade').ok).toBe(true);
    }
    expect(countKind(territory, 'barricade')).toBe(limit);
    const over = canBuild(game, playerId, territory.id, 'barricade');
    expect(over.ok).toBe(false);
    expect(over.message).toContain('Лимит');
  });

  it('charges money and applies the structure effects', () => {
    const { game, playerId, country, empty } = setup();
    country.money = 50_000;
    const territory = empty[0]!;
    const moneyBefore = country.money;
    const baseEffects = territoryEffects(territory);

    expect(build(game, playerId, territory.id, 'factory').ok).toBe(true);
    expect(country.money).toBeCloseTo(moneyBefore - BUILDINGS.factory.cost, 1);
    const withFactory = territoryEffects(territory);
    expect(withFactory.buildingIncome).toBeGreaterThan(baseEffects.buildingIncome);

    expect(build(game, playerId, territory.id, 'city').ok).toBe(true);
    const withCity = territoryEffects(territory);
    expect(withCity.populationPerTick).toBeGreaterThan(withFactory.populationPerTick);
    expect(withCity.populationCap).toBeGreaterThan(withFactory.populationCap);

    expect(build(game, playerId, territory.id, 'aa').ok).toBe(true);
    const withAa = territoryEffects(territory);
    expect(withAa.hasAA).toBe(true);
    expect(withAa.defense).toBeGreaterThan(withCity.defense);

    expect(build(game, playerId, territory.id, 'missile').ok).toBe(true);
    expect(territoryEffects(territory).hasMissile).toBe(true);
    expect(game.missileReady[territory.buildings.at(-1)!.id]).toBeGreaterThan(game.tick);
    expect(country.stats.buildings).toBe(4);
    expect(game.events.some((event) => event.kind === 'build')).toBe(true);
  });

  it('makes the security radius matter on the map', () => {
    const { game, playerId, country, empty } = setup();
    country.money = 50_000;
    const territory = empty[0]!;
    const defenceBefore = defenseStrength(game, territory.id);
    expect(securityDefense(game, territory.id)).toBe(0);

    expect(build(game, playerId, territory.id, 'barricade').ok).toBe(true);
    expect(securityDefense(game, territory.id)).toBeCloseTo(BUILDINGS.barricade.defense!, 5);
    expect(defenseStrength(game, territory.id)).toBeGreaterThan(defenceBefore);

    // Outside the radius nothing is protected.
    const far = Object.values(game.territories).find(
      (candidate) => candidate.owner === playerId && candidate.id !== territory.id && securityDefense(game, candidate.id) === 0,
    );
    if (far) expect(defenseStrength(game, far.id)).toBeGreaterThan(0);

    // AA is capped together with the barricade.
    expect(build(game, playerId, territory.id, 'aa').ok).toBe(true);
    expect(securityDefense(game, territory.id)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('keeps every structure pinned to its own territory tile', () => {
    const { game, playerId, country, empty } = setup();
    country.money = 50_000;
    const territory = empty[0]!;
    const staticTerritory = game.world.territories.find((t) => t.id === territory.id)!;
    for (const kind of ['factory', 'city', 'barricade'] as const) build(game, playerId, territory.id, kind);
    for (const building of territory.buildings) {
      expect(staticTerritory.tiles).toContain(building.tile);
      expect(game.world.tileTerritory[building.tile]).toBe(staticTerritory.index);
    }
  });
});
