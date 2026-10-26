import { clamp, createRng, type Rng } from '@/core/rng';
import type { CountryId } from '@/core/types';
import { TERRAIN, TERRAIN_INFO, type TerrainCode } from '@/core/world/terrain';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TERRITORY_COUNT,
  type SeaZone,
  type TerritoryStatic,
  type WorldData,
  tileIndex,
  tileX,
  tileY,
} from '@/core/world/world';
import { CITY_NAMES, SEA_ZONE_NAMES, TERRITORY_NAMES } from '@/data/worldNames';

export interface CountrySeedInfo {
  id: CountryId;
  capitalName: string;
}

interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** 1 = continent, 0 = small island. */
  weight: number;
}

/** Hand-authored silhouette of the home world; keeps land masses connected for stage 1. */
const CONTINENTS: readonly Blob[] = [
  { cx: 33, cy: 27, rx: 26, ry: 16, weight: 1 },
  { cx: 30, cy: 54, rx: 18, ry: 12, weight: 1 },
  { cx: 60, cy: 35, rx: 11, ry: 8, weight: 0.9 },
  { cx: 88, cy: 31, rx: 24, ry: 15, weight: 1 },
  { cx: 92, cy: 56, rx: 17, ry: 11, weight: 1 },
  { cx: 64, cy: 62, rx: 7, ry: 5, weight: 0.7 },
  { cx: 15, cy: 13, rx: 4, ry: 3, weight: 0.6 },
  { cx: 112, cy: 13, rx: 5, ry: 4, weight: 0.6 },
  { cx: 74, cy: 68, rx: 4, ry: 3, weight: 0.5 },
];

function noise2(x: number, y: number, seed: number): number {
  return (
    Math.sin(x * 1.7 + y * 0.9 + seed) * 0.5 +
    Math.sin(x * 0.61 - y * 1.31 + seed * 1.7) * 0.3 +
    Math.sin(x * 3.1 + y * 2.7 + seed * 2.3) * 0.2
  );
}

interface LandField {
  landness: number;
  continentality: number;
}

function landField(x: number, y: number, seed: number): LandField {
  let best = -Infinity;
  for (let i = 0; i < CONTINENTS.length; i += 1) {
    const blob = CONTINENTS[i] as Blob;
    const nx = (x - blob.cx) / blob.rx;
    const ny = (y - blob.cy) / blob.ry;
    const d = Math.sqrt(nx * nx + ny * ny);
    const wobble = noise2(x * 0.21, y * 0.21, seed + i * 17) * (0.2 + 0.1 * blob.weight);
    const value = (1 + wobble - d) * blob.weight;
    if (value > best) best = value;
  }
  return { landness: best, continentality: clamp(best * 2.2, 0, 1) };
}

function makeTerrain(width: number, height: number, seed: number) {
  const terrain = new Uint8Array(width * height);
  const elevation = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);
  const river = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = tileIndex(x, y, width);
      const field = landField(x, y, seed);
      const elevNoise = noise2(x * 0.19, y * 0.19, seed + 41) * 0.5 + noise2(x * 0.51, y * 0.47, seed + 83) * 0.22;
      const moistNoise = noise2(x * 0.13, y * 0.15, seed + 131) * 0.5 + 0.5;
      const elev = clamp(0.22 + field.continentality * 0.62 + elevNoise * 0.34, 0, 1);
      const moist = clamp(moistNoise + (field.landness > 0 ? 0.12 : 0.2), 0, 1);
      elevation[idx] = elev;
      moisture[idx] = moist;

      if (field.landness <= 0) {
        terrain[idx] = TERRAIN.Ocean;
        continue;
      }

      const polar = y <= 6 || y >= height - 7;
      if (elev > 0.84) terrain[idx] = TERRAIN.Mountain;
      else if (elev > 0.68) terrain[idx] = TERRAIN.Hills;
      else if (polar) terrain[idx] = TERRAIN.Tundra;
      else if (moist < 0.42) terrain[idx] = TERRAIN.Desert;
      else if (moist > 0.62) terrain[idx] = TERRAIN.Forest;
      else terrain[idx] = TERRAIN.Plains;
    }
  }

  // Shallow water belts around coasts make the pixel-art shoreline readable.
  const shallow = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = tileIndex(x, y, width);
      if (terrain[idx] !== TERRAIN.Ocean) continue;
      let nearLand = false;
      for (let dy = -2; dy <= 2 && !nearLand; dy += 1) {
        for (let dx = -2; dx <= 2 && !nearLand; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const code = terrain[tileIndex(nx, ny, width)] as TerrainCode;
          if (TERRAIN_INFO[code].land) nearLand = true;
        }
      }
      if (nearLand) shallow[idx] = 1;
    }
  }
  shallow.forEach((flag, i) => {
    if (flag) terrain[i] = TERRAIN.Shallow;
  });

  // Rivers: springs on high ground flow downhill until they reach water.
  const rng = createRng(seed ^ 0x9e3779b9);
  let springs = 0;
  let guard = 0;
  while (springs < 7 && guard < 400) {
    guard += 1;
    const x = 6 + rng.int(width - 12);
    const y = 6 + rng.int(height - 12);
    const idx = tileIndex(x, y, width);
    const code = terrain[idx] as TerrainCode;
    if (!TERRAIN_INFO[code].land || elevation[idx] < 0.7) continue;
    let cx = x;
    let cy = y;
    for (let step = 0; step < 70; step += 1) {
      const cur = tileIndex(cx, cy, width);
      if (!TERRAIN_INFO[terrain[cur] as TerrainCode].land) break;
      river[cur] = 1;
      moisture[cur] = clamp(moisture[cur] + 0.12, 0, 1);
      let bx = cx;
      let by = cy;
      let best = elevation[cur];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 1 || ny < 1 || nx >= width - 1 || ny >= height - 1) continue;
          const e = elevation[tileIndex(nx, ny, width)];
          if (e < best) {
            best = e;
            bx = nx;
            by = ny;
          }
        }
      }
      if (bx === cx && by === cy) {
        // Local minimum: carve towards the map centre so the river still reaches the sea.
        bx = cx + Math.sign(width / 2 - cx);
        by = cy + (rng.chance(0.3) ? Math.sign(height / 2 - cy) : 0);
        if (terrain[tileIndex(clamp(bx, 1, width - 2), clamp(by, 1, height - 2), width)] === TERRAIN.Ocean) break;
      }
      cx = clamp(bx, 1, width - 2);
      cy = clamp(by, 1, height - 2);
    }
    springs += 1;
  }

  return { terrain, elevation, moisture, river };
}

function landTileList(terrain: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < terrain.length; i += 1) {
    if (TERRAIN_INFO[terrain[i] as TerrainCode].land) out.push(i);
  }
  return out;
}

/** Farthest-point sampling gives well-spread, roughly equal territory sizes. */
function pickSeeds(tiles: readonly number[], count: number, width: number, rng: Rng): number[] {
  if (tiles.length === 0) return [];
  const seeds: number[] = [tiles[rng.int(tiles.length)] as number];
  const minDist = new Float64Array(tiles.length).fill(Infinity);
  while (seeds.length < count) {
    const last = seeds[seeds.length - 1] as number;
    const lx = tileX(last, width);
    const ly = tileY(last, width);
    let bestIndex = -1;
    let bestDist = -1;
    for (let i = 0; i < tiles.length; i += 1) {
      const tile = tiles[i] as number;
      const dx = tileX(tile, width) - lx;
      const dy = tileY(tile, width) - ly;
      const d = dx * dx + dy * dy;
      if (d < minDist[i]!) minDist[i] = d;
      if (minDist[i]! > bestDist) {
        bestDist = minDist[i]!;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    seeds.push(tiles[bestIndex] as number);
  }
  return seeds;
}

function floodAssign(
  seeds: readonly number[],
  width: number,
  height: number,
  terrain: Uint8Array,
): Int16Array {
  const owner = new Int16Array(width * height).fill(-1);
  const queue: number[] = [];
  seeds.forEach((tile, region) => {
    owner[tile] = region;
    queue.push(tile);
  });
  let head = 0;
  while (head < queue.length) {
    const tile = queue[head++] as number;
    const region = owner[tile]!;
    const x = tileX(tile, width);
    const y = tileY(tile, width);
    const around: number[] = [];
    if (x > 0) around.push(tile - 1);
    if (x < width - 1) around.push(tile + 1);
    if (y > 0) around.push(tile - width);
    if (y < height - 1) around.push(tile + width);
    for (const next of around) {
      if (owner[next] !== -1) continue;
      if (!TERRAIN_INFO[terrain[next] as TerrainCode].land) continue;
      owner[next] = region;
      queue.push(next);
    }
  }
  return owner;
}

function borderShares(owner: Int16Array, width: number, height: number, region: number): Map<number, number> {
  const shares = new Map<number, number>();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = tileIndex(x, y, width);
      if (owner[idx] !== region) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const other = owner[tileIndex(nx, ny, width)]!;
        if (other < 0 || other === region) continue;
        shares.set(other, (shares.get(other) ?? 0) + 1);
      }
    }
  }
  return shares;
}

/** Any land tile that no seed reached is attached to the closest region. */
function fillOrphanLand(owner: Int16Array, width: number, height: number, terrain: Uint8Array): void {
  const queue: number[] = [];
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i]! >= 0) queue.push(i);
  }
  let head = 0;
  while (head < queue.length) {
    const tile = queue[head++] as number;
    const region = owner[tile]!;
    const x = tileX(tile, width);
    const y = tileY(tile, width);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = tileIndex(nx, ny, width);
        if (owner[next]! >= 0) continue;
        if (!TERRAIN_INFO[terrain[next] as TerrainCode].land) continue;
        owner[next] = region;
        queue.push(next);
      }
    }
  }
}

function mergeSmallRegions(
  owner: Int16Array,
  width: number,
  height: number,
  regionCount: number,
  minTiles: number,
): void {
  const sizes = new Int32Array(regionCount);
  for (let i = 0; i < owner.length; i += 1) {
    const region = owner[i]!;
    if (region >= 0) sizes[region]! += 1;
  }
  for (let region = 0; region < regionCount; region += 1) {
    if (sizes[region]! === 0 || sizes[region]! >= minTiles) continue;
    const shares = borderShares(owner, width, height, region);
    let target = -1;
    let bestShare = 0;
    for (const [other, share] of shares) {
      if (sizes[other]! < minTiles && sizes[other]! <= sizes[region]!) continue;
      if (share > bestShare) {
        bestShare = share;
        target = other;
      }
    }
    if (target < 0) continue;
    for (let i = 0; i < owner.length; i += 1) {
      if (owner[i] === region) {
        owner[i] = target;
        sizes[target]! += 1;
      }
    }
    sizes[region] = 0;
  }
}

function dominantTerrain(mix: Partial<Record<TerrainCode, number>>): TerrainCode {
  let bestCode: TerrainCode = TERRAIN.Plains;
  let bestCount = -1;
  for (const key of Object.keys(mix) as unknown as TerrainCode[]) {
    const count = mix[key] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestCode = Number(key) as TerrainCode;
    }
  }
  return bestCode;
}

const FERTILITY: Record<number, number> = {
  [TERRAIN.Plains]: 1,
  [TERRAIN.Forest]: 0.72,
  [TERRAIN.Hills]: 0.6,
  [TERRAIN.Mountain]: 0.28,
  [TERRAIN.Desert]: 0.34,
  [TERRAIN.Tundra]: 0.36,
  [TERRAIN.Shallow]: 0,
  [TERRAIN.Ocean]: 0,
};

function territoryEconomy(
  tiles: readonly number[],
  terrain: Uint8Array,
  river: Uint8Array,
  mix: Partial<Record<TerrainCode, number>>,
  isCapital: boolean,
  hasRiver: boolean,
  rng: Rng,
): { population: number } {
  const size = Math.max(1, tiles.length);
  let popWeight = 0;
  let riverTiles = 0;
  for (const tile of tiles) {
    popWeight += FERTILITY[terrain[tile] as TerrainCode] ?? 0.4;
    if (river[tile]) riverTiles += 1;
  }
  const share = (code: TerrainCode): number => (mix[code] ?? 0) / size;
  const fertility = popWeight / size;
  const jitter = 0.9 + rng.next() * 0.2;
  const population = Math.round(
    (240_000 + fertility * 2_600_000 + size * 20_000) * (isCapital ? 1.8 : 1) * jitter,
  );

  void share;
  void hasRiver;
  void riverTiles;
  return { population };
}

function bfsDistances(adjacency: ReadonlyMap<string, readonly string[]>, start: string): Map<string, number> {
  const dist = new Map<string, number>([[start, 0]]);
  const queue: string[] = [start];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head++] as string;
    const d = dist.get(current) ?? 0;
    for (const next of adjacency.get(current) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      queue.push(next);
    }
  }
  return dist;
}

function makeSeaZones(terrain: Uint8Array, width: number, height: number): SeaZone[] {
  const visited = new Uint8Array(width * height);
  const zones: SeaZone[] = [];
  for (let start = 0; start < terrain.length; start += 1) {
    if (visited[start]) continue;
    const code = terrain[start] as TerrainCode;
    if (TERRAIN_INFO[code].land) continue;
    const component: number[] = [];
    const queue: number[] = [start];
    visited[start] = 1;
    let head = 0;
    while (head < queue.length) {
      const tile = queue[head++] as number;
      component.push(tile);
      const x = tileX(tile, width);
      const y = tileY(tile, width);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = tileIndex(nx, ny, width);
        if (visited[next]) continue;
        if (TERRAIN_INFO[terrain[next] as TerrainCode].land) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    if (component.length < 120) continue;
    let sx = 0;
    let sy = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (const tile of component) {
      const x = tileX(tile, width);
      const y = tileY(tile, width);
      sx += x;
      sy += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    zones.push({
      id: `sea-${zones.length}`,
      name: SEA_ZONE_NAMES[zones.length % SEA_ZONE_NAMES.length] as string,
      centroid: { x: sx / component.length, y: sy / component.length },
      bounds: { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 },
    });
  }
  if (zones.length === 0) {
    zones.push({
      id: 'sea-0',
      name: SEA_ZONE_NAMES[0] as string,
      centroid: { x: width / 2, y: height / 2 },
      bounds: { x: 0, y: 0, width, height },
    });
  }
  return zones;
}

export interface GenerateWorldOptions {
  seed: number;
  countries: readonly CountrySeedInfo[];
}

export function generateWorld(options: GenerateWorldOptions): WorldData {
  const { seed, countries } = options;
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const rng = createRng(seed >>> 0);
  const { terrain, elevation, moisture, river } = makeTerrain(width, height, seed);

  let landTiles = landTileList(terrain);
  if (landTiles.length < 500) {
    // Extremely unlikely, but never ship a broken map.
    return generateWorld({ seed: seed + 7919, countries });
  }

  const seedCount = TERRITORY_COUNT + 4;
  let seeds = pickSeeds(landTiles, seedCount, width, rng);
  let owner = floodAssign(seeds, width, height, terrain);
  mergeSmallRegions(owner, width, height, seeds.length, 6);
  fillOrphanLand(owner, width, height, terrain);
  // Isolated land specks nobody could reach become shallow water, so every land
  // tile on the final map belongs to exactly one territory.
  let reclaimed = 0;
  for (let i = 0; i < owner.length; i += 1) {
    if (owner[i]! >= 0) continue;
    if (!TERRAIN_INFO[terrain[i] as TerrainCode].land) continue;
    terrain[i] = TERRAIN.Shallow;
    elevation[i] = Math.min(elevation[i] ?? 0.2, 0.2);
    moisture[i] = 1;
    reclaimed += 1;
  }

  // Compact the region ids so only used regions remain.
  const used = new Map<number, number>();
  for (let i = 0; i < owner.length; i += 1) {
    const region = owner[i]!;
    if (region < 0) continue;
    if (!used.has(region)) used.set(region, used.size);
  }
  const regionIds = [...used.keys()].sort((a, b) => {
    const ca = seeds[a] as number;
    const cb = seeds[b] as number;
    return ca - cb;
  });
  const remap = new Map<number, number>();
  regionIds.forEach((region, index) => remap.set(region, index));
  const remapped = new Int16Array(owner.length).fill(-1);
  for (let i = 0; i < owner.length; i += 1) {
    const region = owner[i]!;
    if (region < 0) continue;
    remapped[i] = remap.get(region) ?? -1;
  }
  owner = remapped;
  const regionCount = regionIds.length;

  // Territory tiles, centroids, city spot.
  const tilesByRegion: number[][] = Array.from({ length: regionCount }, () => []);
  for (let i = 0; i < owner.length; i += 1) {
    const region = owner[i]!;
    if (region >= 0) tilesByRegion[region]!.push(i);
  }

  const territoryDrafts = tilesByRegion.map((tiles, index) => {
    let sx = 0;
    let sy = 0;
    const mix: Partial<Record<TerrainCode, number>> = {};
    let hasRiver = false;
    let coastal = false;
    for (const tile of tiles) {
      const x = tileX(tile, width);
      const y = tileY(tile, width);
      sx += x;
      sy += y;
      const code = terrain[tile] as TerrainCode;
      mix[code] = (mix[code] ?? 0) + 1;
      if (river[tile]) hasRiver = true;
      if (!coastal) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!TERRAIN_INFO[terrain[tileIndex(nx, ny, width)] as TerrainCode].land) coastal = true;
        }
      }
    }
    const centroid = { x: sx / Math.max(1, tiles.length), y: sy / Math.max(1, tiles.length) };
    let cityTile = tiles[0] as number;
    let bestDist = Infinity;
    for (const tile of tiles) {
      const dx = tileX(tile, width) - centroid.x;
      const dy = tileY(tile, width) - centroid.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        cityTile = tile;
      }
    }
    return { index, tiles, centroid, mix, hasRiver, coastal, cityTile };
  });

  // Sort regions west-to-east so naming feels geographically stable.
  territoryDrafts.sort((a, b) => (a.centroid.y - b.centroid.y) || (a.centroid.x - b.centroid.x));

  const names = [...TERRITORY_NAMES];
  const cityNames = [...CITY_NAMES];
  const draftToId = new Map<number, string>();
  const territories: TerritoryStatic[] = territoryDrafts.map((draft, order) => {
    const id = `t${order}`;
    draftToId.set(draft.index, id);
    const dominant = dominantTerrain(draft.mix);
    const isCapital = false;
    const econ = territoryEconomy(draft.tiles, terrain, river, draft.mix, isCapital, draft.hasRiver, rng);
    const name = names[order % names.length] as string;
    const cityName = cityNames[order % cityNames.length] as string;
    return {
      id,
      index: order,
      name,
      region: `Регион ${order + 1}`,
      tiles: draft.tiles,
      neighbors: [],
      seaBoundaries: [],
      centroid: draft.centroid,
      cityTile: draft.cityTile,
      cityName,
      dominantTerrain: dominant,
      terrainMix: draft.mix,
      population: econ.population,
      isCoastal: draft.coastal,
      hasRiver: draft.hasRiver,
      initialOwner: null,
      isCapital: false,
    };
  });

  // Re-index the tile map by the final territory order so `tileTerritory[i]`
  // always points at `territories[i]` (regions were sorted for naming above).
  const regionToOrder = new Map<number, number>();
  territoryDrafts.forEach((draft, order) => regionToOrder.set(draft.index, order));
  for (let i = 0; i < owner.length; i += 1) {
    const region = owner[i]!;
    if (region < 0) continue;
    owner[i] = regionToOrder.get(region) ?? -1;
  }

  // Adjacency (8-neighbourhood so diagonal touching coast counts as a border).
  const adjacency = new Map<string, Set<string>>();
  territories.forEach((t) => adjacency.set(t.id, new Set()));
  const seaAdjacency = new Map<string, Set<string>>();
  territories.forEach((t) => seaAdjacency.set(t.id, new Set()));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = tileIndex(x, y, width);
      const region = owner[idx]!;
      if (region < 0) continue;
      const from = draftToId.get(region);
      if (!from) continue;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const otherRegion = owner[tileIndex(nx, ny, width)]!;
        if (otherRegion < 0 || otherRegion === region) continue;
        const to = draftToId.get(otherRegion);
        if (!to) continue;
        adjacency.get(from)!.add(to);
        adjacency.get(to)!.add(from);
      }
    }
  }

  territories.forEach((t) => {
    t.neighbors = [...(adjacency.get(t.id) ?? [])].sort();
  });

  // Sea routes keep island territories reachable without a navy.
  territories.forEach((t) => {
    if (!t.isCoastal) return;
    const candidates = territories
      .filter((other) => other.id !== t.id && other.isCoastal && !t.neighbors.includes(other.id))
      .map((other) => ({
        other,
        d: Math.hypot(other.centroid.x - t.centroid.x, other.centroid.y - t.centroid.y),
      }))
      .filter((c) => c.d < 26)
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    for (const { other } of candidates) {
      if (!seaAdjacency.get(t.id)!.has(other.id)) {
        seaAdjacency.get(t.id)!.add(other.id);
        seaAdjacency.get(other.id)!.add(t.id);
        t.neighbors.push(other.id);
        other.neighbors.push(t.id);
      }
    }
  });

  territories.forEach((t) => {
    t.neighbors = [...new Set(t.neighbors)].sort();
    t.seaBoundaries = [...(seaAdjacency.get(t.id) ?? [])].sort();
  });

  assignCountries(territories, countries, rng);
  normalizeCapitalNames(territories, countries);
  normalizeTerritoryNames(territories);

  const seaZones = makeSeaZones(terrain, width, height);

  return {
    seed,
    width,
    height,
    terrain,
    elevation,
    moisture,
    river,
    tileTerritory: owner,
    territories,
    seaZones,
    landTiles: landTiles.length - reclaimed,
  };
}

/** Splits the map between countries with a multi-source BFS + repair pass. */
function assignCountries(
  territories: TerritoryStatic[],
  countries: readonly CountrySeedInfo[],
  rng: Rng,
): void {
  if (countries.length === 0) return;
  const graph = new Map<string, string[]>();
  for (const t of territories) graph.set(t.id, [...t.neighbors]);
  const capitalCandidates = territories.filter((t) => t.tiles.length >= 40 && !t.seaBoundaries.length);
  const candidates = capitalCandidates.length >= countries.length ? capitalCandidates : territories;

  // Farthest-point sampling on the territory graph for spread-out capitals.
  const capitals: string[] = [];
  const first = rng.pick(candidates).id;
  capitals.push(first);
  while (capitals.length < countries.length) {
    let bestId: string | null = null;
    let bestScore = -1;
    for (const t of candidates) {
      if (capitals.includes(t.id)) continue;
      const score = Math.min(
        ...capitals.map((capital) => bfsDistances(graph, capital).get(t.id) ?? 999),
      );
      if (score > bestScore) {
        bestScore = score;
        bestId = t.id;
      }
    }
    if (!bestId) break;
    capitals.push(bestId);
  }

  const ownerByTerritory = new Map<string, CountryId>();
  const queue: { id: string; country: CountryId }[] = capitals.map((id, index) => {
    const countryId = countries[index]?.id ?? countries[0]!.id;
    ownerByTerritory.set(id, countryId);
    return { id, country: countryId };
  });
  let head = 0;
  while (head < queue.length) {
    const { id, country } = queue[head++] as { id: string; country: CountryId };
    for (const next of graph.get(id) ?? []) {
      if (ownerByTerritory.has(next)) continue;
      ownerByTerritory.set(next, country);
      queue.push({ id: next, country });
    }
  }

  // Contiguity repair: an isolated cluster always joins the nearest owner via land border.
  for (const t of territories) {
    if (ownerByTerritory.has(t.id)) continue;
    for (const next of graph.get(t.id) ?? []) {
      const owner = ownerByTerritory.get(next);
      if (owner) {
        ownerByTerritory.set(t.id, owner);
        break;
      }
    }
    if (!ownerByTerritory.has(t.id)) ownerByTerritory.set(t.id, countries[0]!.id);
  }

  // Balance: keep every nation viable and nobody dominant from turn one.
  // Greedy local search over border territories, scored by deviation from an even split.
  const quota = Math.ceil(territories.length * 0.42);
  const minimum = Math.max(4, Math.floor(territories.length / (countries.length * 2.5)));
  const counts = new Map<CountryId, number>();
  const recount = (): void => {
    counts.clear();
    for (const country of countries) counts.set(country.id, 0);
    for (const country of ownerByTerritory.values()) counts.set(country, (counts.get(country) ?? 0) + 1);
  };
  const score = (): number => {
    const mean = territories.length / countries.length;
    let value = 0;
    for (const country of countries) {
      const count = counts.get(country.id) ?? 0;
      value += (count - mean) ** 2;
      if (count < minimum) value += (minimum - count) * 60;
      if (count > quota) value += (count - quota) * 60;
    }
    return value;
  };

  recount();
  for (let pass = 0; pass < 120; pass += 1) {
    recount();
    const currentScore = score();
    let bestScore = currentScore - 1e-6;
    let bestTerritory: TerritoryStatic | null = null;
    let bestRecipient: CountryId | null = null;
    for (const t of territories) {
      const donor = ownerByTerritory.get(t.id);
      if (!donor || capitals.includes(t.id)) continue;
      if ((counts.get(donor) ?? 0) <= 1) continue;
      for (const neighbourId of graph.get(t.id) ?? []) {
        const recipient = ownerByTerritory.get(neighbourId);
        if (!recipient || recipient === donor) continue;
        counts.set(donor, (counts.get(donor) ?? 0) - 1);
        counts.set(recipient, (counts.get(recipient) ?? 0) + 1);
        const candidate = score();
        counts.set(donor, (counts.get(donor) ?? 0) + 1);
        counts.set(recipient, (counts.get(recipient) ?? 0) - 1);
        if (candidate < bestScore) {
          bestScore = candidate;
          bestTerritory = t;
          bestRecipient = recipient;
        }
      }
    }
    if (!bestTerritory || !bestRecipient) break;
    ownerByTerritory.set(bestTerritory.id, bestRecipient);
  }

  for (const t of territories) {
    t.initialOwner = ownerByTerritory.get(t.id) ?? null;
    t.isCapital = capitals.includes(t.id);
  }
  // Guarantee at least one capital per country and exactly one per country.
  for (const country of countries) {
    const owned = territories.filter((t) => t.initialOwner === country.id);
    const hasCapital = owned.some((t) => t.isCapital);
    if (!hasCapital && owned.length > 0) {
      const pick = [...owned].sort((a, b) => b.population - a.population)[0]!;
      pick.isCapital = true;
    }
  }
  for (const t of territories) {
    if (!t.isCapital) continue;
    const owner = t.initialOwner;
    if (!owner) {
      t.isCapital = false;
      continue;
    }
    const sameCountryCapitals = territories.filter((x) => x.isCapital && x.initialOwner === owner);
    if (sameCountryCapitals.length > 1 && sameCountryCapitals[0] !== t) t.isCapital = false;
  }
}

function normalizeCapitalNames(
  territories: TerritoryStatic[],
  countries: readonly CountrySeedInfo[],
): void {
  for (const country of countries) {
    const capital = territories.find((t) => t.isCapital && t.initialOwner === country.id);
    if (capital) {
      capital.cityName = country.capitalName;
      capital.name = country.capitalName;
    }
  }
}

function normalizeTerritoryNames(territories: TerritoryStatic[]): void {
  const cityNames = new Set<string>();
  for (const t of territories) {
    if (t.isCapital) cityNames.add(t.cityName);
  }
  const pool = CITY_NAMES.filter((name) => !cityNames.has(name));
  let cursor = 0;
  let n = 1;
  for (const t of territories) {
    t.region = `Регион ${n++}`;
    if (t.isCapital) continue;
    if (cityNames.has(t.cityName) || !t.cityName) {
      t.cityName = pool[cursor++ % pool.length] as string;
      cityNames.add(t.cityName);
    } else {
      cityNames.add(t.cityName);
    }
  }
}

/** Cheap structural validation used by tests and by the save/load guard. */
export function validateWorld(world: WorldData): string[] {
  const problems: string[] = [];
  if (world.territories.length < 20 || world.territories.length > 30) {
    problems.push(`unexpected territory count ${world.territories.length}`);
  }
  const ids = new Set(world.territories.map((t) => t.id));
  for (const t of world.territories) {
    if (t.tiles.length === 0) problems.push(`${t.id} has no tiles`);
    for (const n of t.neighbors) {
      if (!ids.has(n)) problems.push(`${t.id} references missing neighbour ${n}`);
    }
    if (!t.initialOwner) problems.push(`${t.id} has no owner`);
  }
  const adjacency = new Map(world.territories.map((t) => [t.id, t.neighbors]));
  const reached = bfsDistances(adjacency, world.territories[0]!.id);
  if (reached.size !== world.territories.length) {
    problems.push(`graph not connected: ${reached.size}/${world.territories.length}`);
  }
  return problems;
}
