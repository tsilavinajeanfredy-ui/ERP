/**
 * Tests — Offline Storage Queue
 * Vérifie l'enfilage, défilage et persistance des opérations hors-ligne.
 */

import {
  getOfflineQueue,
  enqueueOfflineOperation,
  removeOfflineOperation,
  clearOfflineQueue,
  incrementRetry,
  type OfflineOperation,
} from '../lib/offlineStorage';

// ─── Mock localStorage ────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    (key: string) => store[key] ?? null,
    setItem:    (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear:      () => { store = {}; },
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock, writable: true });

// ─── Mock react-native complètement pour éviter TurboModuleRegistry ──────────
// On ne fait PAS jest.requireActual('react-native') car cela charge les modules
// natifs (SettingsManager, etc.) incompatibles avec l'environnement Jest Node.
jest.mock('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  AsyncStorage: {
    getItem:    jest.fn(),
    setItem:    jest.fn(),
    removeItem: jest.fn(),
  },
  AppState: { addEventListener: jest.fn(), removeEventListener: jest.fn() },
  Alert: { alert: jest.fn() },
  NativeModules: {},
  NativeEventEmitter: jest.fn(() => ({ addListener: jest.fn(), removeAllListeners: jest.fn() })),
}));

beforeEach(async () => {
  localStorageMock.clear();
  await clearOfflineQueue();
});

describe("Offline Storage — File d'attente", () => {
  test('file vide au départ', async () => {
    const queue = await getOfflineQueue();
    expect(queue).toEqual([]);
  });

  test('enqueue ajoute une opération à la file', async () => {
    await enqueueOfflineOperation({
      table: 'inventory_counts',
      type: 'INSERT',
      payload: { depot_id: 'dep-1', article_id: 'art-1', qty_real: 42 },
    });

    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].table).toBe('inventory_counts');
    expect(queue[0].type).toBe('INSERT');
    expect(queue[0].payload.qty_real).toBe(42);
    expect(queue[0].retries).toBe(0);
    expect(queue[0].id).toMatch(/^offline_/);
  });

  test("plusieurs opérations s'empilent dans l'ordre", async () => {
    await enqueueOfflineOperation({ table: 'lots', type: 'INSERT', payload: { code: 'L001' } });
    await enqueueOfflineOperation({ table: 'lots', type: 'UPDATE', payload: { code: 'L001', status: 'VALIDE' } });

    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].type).toBe('INSERT');
    expect(queue[1].type).toBe('UPDATE');
  });

  test("removeOfflineOperation supprime l'opération par id", async () => {
    await enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: { ref: 'FNC-001' } });
    const queue = await getOfflineQueue();
    const id = queue[0].id;

    await removeOfflineOperation(id);
    const after = await getOfflineQueue();
    expect(after).toHaveLength(0);
  });

  test('removeOfflineOperation ne supprime pas les autres', async () => {
    await enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: { ref: 'FNC-001' } });
    await enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: { ref: 'FNC-002' } });
    const [op1, op2] = await getOfflineQueue();

    await removeOfflineOperation(op1.id);
    const after = await getOfflineQueue();
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(op2.id);
  });

  test('clearOfflineQueue vide entièrement la file', async () => {
    await enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: {} });
    await enqueueOfflineOperation({ table: 'lots', type: 'INSERT', payload: {} });
    await clearOfflineQueue();

    const queue = await getOfflineQueue();
    expect(queue).toHaveLength(0);
  });

  test('incrementRetry incrémente le compteur de tentatives', async () => {
    await enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: {} });
    const [op] = await getOfflineQueue();
    expect(op.retries).toBe(0);

    await incrementRetry(op.id);
    await incrementRetry(op.id);

    const [updated] = await getOfflineQueue();
    expect(updated.retries).toBe(2);
  });

  test('les ids sont uniques', async () => {
    await Promise.all([
      enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: { n: 1 } }),
      enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: { n: 2 } }),
      enqueueOfflineOperation({ table: 'fnc', type: 'INSERT', payload: { n: 3 } }),
    ]);
    const queue = await getOfflineQueue();
    const ids = queue.map((op) => op.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
