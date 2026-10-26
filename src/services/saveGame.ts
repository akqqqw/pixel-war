import type { GameState } from '@/core/state/types';
import { deserializeGame, serializeGame } from '@/core/save/serialization';

const DB_NAME = 'pixel-war';
const DB_VERSION = 1;
const STORE = 'saves';
export const AUTO_SAVE_SLOT = 'auto';

export interface SaveMeta {
  slot: string;
  label: string;
  updatedAt: number;
  tick: number;
  countryId: string;
  difficulty: string;
  ownedTerritories: number;
}

interface SaveRecord extends SaveMeta {
  /** JSON produced by serializeGame — stored as text so the schema stays explicit. */
  data: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;
const memoryFallback = new Map<string, SaveRecord>();
let fallbackActive = false;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      fallbackActive = true;
      reject(new Error('IndexedDB недоступен'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'slot' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      fallbackActive = true;
      reject(request.error ?? new Error('Не удалось открыть IndexedDB'));
    };
  });
  return dbPromise;
}

function countOwned(state: GameState): number {
  return Object.values(state.territories).filter((t) => t.owner === state.playerCountryId).length;
}

export async function writeSave(
  slot: string,
  label: string,
  state: GameState,
): Promise<SaveMeta> {
  const record: SaveRecord = {
    slot,
    label,
    updatedAt: Date.now(),
    tick: state.tick,
    countryId: state.playerCountryId,
    difficulty: state.difficulty,
    ownedTerritories: countOwned(state),
    data: serializeGame(state),
  };
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Ошибка записи'));
    });
  } catch {
    fallbackActive = true;
    memoryFallback.set(slot, record);
  }
  const { data: _data, ...meta } = record;
  return meta;
}

export async function listSaves(): Promise<SaveMeta[]> {
  const collect = (records: SaveRecord[]): SaveMeta[] =>
    records
      .map(({ data: _data, ...meta }) => meta)
      .sort((a, b) => b.updatedAt - a.updatedAt);

  try {
    const db = await openDatabase();
    const records = await new Promise<SaveRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result as SaveRecord[]);
      request.onerror = () => reject(request.error ?? new Error('Ошибка чтения'));
    });
    return collect(records);
  } catch {
    fallbackActive = true;
    return collect([...memoryFallback.values()]);
  }
}

export async function loadSave(slot: string): Promise<GameState | null> {
  let record: SaveRecord | undefined;
  try {
    const db = await openDatabase();
    record = await new Promise<SaveRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(slot);
      request.onsuccess = () => resolve(request.result as SaveRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Ошибка чтения'));
    });
  } catch {
    fallbackActive = true;
    record = memoryFallback.get(slot);
  }
  if (!record) return null;
  return deserializeGame(record.data);
}

export async function deleteSave(slot: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Ошибка удаления'));
    });
  } catch {
    fallbackActive = true;
    memoryFallback.delete(slot);
  }
}

export function isPersistenceFallback(): boolean {
  return fallbackActive;
}
