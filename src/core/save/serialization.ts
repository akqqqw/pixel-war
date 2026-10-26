import type { GameState } from '@/core/state/types';
import { SAVE_VERSION } from '@/core/state/types';
import type { SeaZone, TerritoryStatic, WorldData } from '@/core/world/world';

/** Typed arrays are base64-encoded so the whole save fits comfortably in IndexedDB. */
export interface SerializedWorld {
  seed: number;
  width: number;
  height: number;
  terrain: string;
  elevation: string;
  moisture: string;
  river: string;
  tileTerritory: string;
  territories: TerritoryStatic[];
  seaZones: SeaZone[];
  landTiles: number;
  encoding: 'base64';
}

export type SerializedGame = Omit<GameState, 'world'> & { world: SerializedWorld; saveVersion: number };

function encodeBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function encodeUint8(array: Uint8Array): string {
  return encodeBytes(array);
}

export function decodeUint8(value: string): Uint8Array {
  return decodeBytes(value);
}

export function encodeFloat32(array: Float32Array): string {
  return encodeBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
}

export function decodeFloat32(value: string): Float32Array {
  const bytes = decodeBytes(value);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Float32Array(copy.buffer);
}

export function encodeInt16(array: Int16Array): string {
  return encodeBytes(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
}

export function decodeInt16(value: string): Int16Array {
  const bytes = decodeBytes(value);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Int16Array(copy.buffer);
}

export function serializeGame(state: GameState): SerializedGame {
  const { world, ...rest } = state;
  return {
    ...rest,
    saveVersion: SAVE_VERSION,
    world: {
      seed: world.seed,
      width: world.width,
      height: world.height,
      terrain: encodeUint8(world.terrain),
      elevation: encodeFloat32(world.elevation),
      moisture: encodeFloat32(world.moisture),
      river: encodeUint8(world.river),
      tileTerritory: encodeInt16(world.tileTerritory),
      territories: world.territories,
      seaZones: world.seaZones,
      landTiles: world.landTiles,
      encoding: 'base64',
    },
  };
}

export function deserializeWorld(data: SerializedWorld): WorldData {
  return {
    seed: data.seed,
    width: data.width,
    height: data.height,
    terrain: decodeUint8(data.terrain),
    elevation: decodeFloat32(data.elevation),
    moisture: decodeFloat32(data.moisture),
    river: decodeUint8(data.river),
    tileTerritory: decodeInt16(data.tileTerritory),
    territories: data.territories,
    seaZones: data.seaZones,
    landTiles: data.landTiles,
  };
}

export function deserializeGame(data: SerializedGame): GameState {
  if (!data || typeof data !== 'object') throw new Error('Повреждённые данные сохранения');
  const { world, saveVersion: _saveVersion, ...rest } = data;
  if (!world || world.encoding !== 'base64') throw new Error('Неизвестный формат карты');
  return {
    ...(rest as Omit<GameState, 'world'>),
    world: deserializeWorld(world),
  };
}
