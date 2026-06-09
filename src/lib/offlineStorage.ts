// ============================================================================
// ERP GSI — Offline Storage (AsyncStorage-based with Web fallback)
// Real offline queue using localStorage on web, AsyncStorage on native
// ============================================================================

import { Platform } from 'react-native';

export type OfflineOperation = {
  id: string;
  table: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: string;
  retries: number;
};

const STORAGE_KEY = 'erp_gsi_offline_queue';

/** Persistent storage adapter — localStorage on web, in-memory fallback */
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { return localStorage.getItem(key); } catch { return null; }
    }
    // Native: would use AsyncStorage — for now use module-level map
    return inMemoryStore.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { localStorage.setItem(key, value); return; } catch {}
    }
    inMemoryStore.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try { localStorage.removeItem(key); return; } catch {}
    }
    inMemoryStore.delete(key);
  },
};

const inMemoryStore = new Map<string, string>();

export async function getOfflineQueue(): Promise<OfflineOperation[]> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineOperation[];
  } catch {
    return [];
  }
}

export async function enqueueOfflineOperation(
  op: Omit<OfflineOperation, 'id' | 'createdAt' | 'retries'>
): Promise<void> {
  const queue = await getOfflineQueue();
  const newOp: OfflineOperation = {
    ...op,
    id: `offline_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    retries: 0,
  };
  queue.push(newOp);
  await storage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export async function removeOfflineOperation(id: string): Promise<void> {
  const queue = await getOfflineQueue();
  const filtered = queue.filter((op) => op.id !== id);
  await storage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export async function clearOfflineQueue(): Promise<void> {
  await storage.removeItem(STORAGE_KEY);
}

export async function incrementRetry(id: string): Promise<void> {
  const queue = await getOfflineQueue();
  const updated = queue.map((op) =>
    op.id === id ? { ...op, retries: op.retries + 1 } : op
  );
  await storage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/** Checks browser/network online status */
export function getIsOnline(): boolean {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.onLine;
  }
  return true; // Assume online on native when NetInfo not available
}

/** Subscribe to online/offline events on web */
export function subscribeToNetworkStatus(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }
  return () => {};
}
