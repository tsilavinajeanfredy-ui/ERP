import { markAsSageSynced, getPendingSyncRecords, countPendingSyncRecords } from '../lib/sage';

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

const mockSupabase = jest.requireMock('../lib/supabase').supabase;

function mockChain(result: any) {
  const builder: any = {
    select: jest.fn().mockImplementation(() => builder),
    update: jest.fn().mockImplementation(() => builder),
    eq: jest.fn().mockImplementation(() => builder),
    then: jest.fn().mockImplementation((onFulfilled) => Promise.resolve(result).then(onFulfilled)),
  };
  mockSupabase.from.mockReturnValue(builder);
}

describe('SAGE Sync', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marque un enregistrement comme synchronisé', async () => {
    mockChain({ error: null });

    await markAsSageSynced('lots', 'lot-123');
    expect(mockSupabase.from).toHaveBeenCalledWith('lots');
  });

  it('récupère les enregistrements en attente', async () => {
    mockChain({ data: [{ id: '1', code: 'LOT-001', sage_synced: false }, { id: '2', code: 'LOT-002', sage_synced: false }], error: null });

    const p = await getPendingSyncRecords('lots');
    expect(p).toHaveLength(2);
    expect(p[0].code).toBe('LOT-001');
  });

  it('compte le total en attente toutes tables', async () => {
    mockChain({ data: [{ id: '1', sage_synced: false }, { id: '2', sage_synced: false }], error: null });

    expect(await countPendingSyncRecords()).toBe(8); // 4 tables × 2
  });

  it('gère les erreurs', async () => {
    mockChain({ data: null, error: new Error('DB Error') });

    expect(await getPendingSyncRecords('lots')).toEqual([]);
  });
});
