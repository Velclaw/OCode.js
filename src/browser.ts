export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; }
/** Safely get localStorage; returns null during SSR or when storage is blocked. */
export function getLocalStorage(): StorageLike | null {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    const storage = globalThis.localStorage, probe = "__ocode_storage_probe__";
    storage.setItem(probe, probe); storage.removeItem(probe); return storage;
  } catch { return null; }
}
export function readStorage<T>(storage: StorageLike, key: string, fallback: T): T {
  try { const raw = storage.getItem(key); return raw === null ? fallback : JSON.parse(raw) as T; } catch { return fallback; }
}
export function writeStorage(storage: StorageLike, key: string, value: unknown): boolean {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
export function removeStorage(storage: StorageLike, key: string): boolean {
  try { storage.removeItem(key); return true; } catch { return false; }
}
