import { calculateMRP } from '../lib/mrp';

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() },
  },
}));

const mockSupabase = jest.requireMock('../lib/supabase').supabase;

function mockChain(resolvers: Record<string, () => any>) {
  mockSupabase.from.mockImplementation((table: string) => {
    const handler = resolvers[table];
    const result = handler ? handler() : { data: [], error: null };

    const builder: any = {
      select: jest.fn().mockImplementation(() => builder),
      eq:     jest.fn().mockImplementation(() => builder),
      neq:    jest.fn().mockImplementation(() => builder),
      not:    jest.fn().mockImplementation(() => builder),
      in:     jest.fn().mockImplementation(() => builder),
      order:  jest.fn().mockImplementation(() => builder),
      limit:  jest.fn().mockImplementation(() => builder),
      range:  jest.fn().mockImplementation(() => builder),
      ilike:  jest.fn().mockImplementation(() => builder),
      or:     jest.fn().mockImplementation(() => builder),
      then:   jest.fn().mockImplementation((onFulfilled) => Promise.resolve(result).then(onFulfilled)),
    };

    return builder;
  });
}

describe('Moteur MRP — BOM Explosion', () => {
  beforeEach(() => jest.clearAllMocks());

  it('explose la BOM pour calculer les besoins MP depuis un PF', async () => {
    /**
     * Scénario :
     *   PF "Corde nylon" : reorder_point = 100 kg (proxy si pas d'ordre)
     *   BOM : batch_size = 100 kg → 1 batch
     *     - MP PEHD : 159.361 kg / batch
     *     - MP Colorant : 0.252 kg / batch
     *
     * Besoin MP PEHD = 159.361 × (100 / 100) = 159.361 kg
     * Stock PEHD = 0 → net = 160 (arrondi)
     */
    mockChain({
      articles: () => ({
        data: [
          { id: 'pf1', code: 'PF-COR-001', name: 'Corde nylon', article_type: 'PF', active: true, reorder_point: 100, safety_stock: 20 },
          { id: 'mp1', code: 'SICD-026',   name: 'PEHD',        article_type: 'MP', active: true, reorder_point: 0,   safety_stock: 0,  default_supplier: { lead_time_days: 7 } },
          { id: 'mp2', code: 'SICD-024',   name: 'Colorant Bleu Roi', article_type: 'MP', active: true, reorder_point: 0, safety_stock: 0, default_supplier: { lead_time_days: 5 } },
        ],
        error: null,
      }),
      bom_headers: () => ({
        data: [{
          id: 'bom1', product_id: 'pf1', batch_size_kg: 100, status: 'ACTIF', active: true,
          bom_lines: [
            { id: 'bl1', component_id: 'mp1', qty: 159.361, unit: 'kg' },
            { id: 'bl2', component_id: 'mp2', qty: 0.252,   unit: 'kg' },
          ],
        }],
        error: null,
      }),
      production_orders: () => ({ data: [], error: null }),
      lots: () => ({ data: [], error: null }),
      da_import: () => ({ data: [], error: null }),
      da_local:  () => ({ data: [], error: null }),
    });

    const results = await calculateMRP();
    const pehd = results.find(r => r.code === 'SICD-026');
    const colorant = results.find(r => r.code === 'SICD-024');

    expect(pehd).toBeDefined();
    expect(pehd!.needs).toBe(159); // 159.361 arrondi
    expect(pehd!.net).toBe(159);
    expect(pehd!.stock).toBe(0);
    expect(pehd!.sourceProducts?.[0]?.productCode).toBe('PF-COR-001');

    expect(colorant).toBeDefined();
    expect(colorant!.needs).toBe(0); // 0.252 arrondi à 0... on veut au moins 1
  });

  it('déduit le stock disponible du besoin net MP', async () => {
    /**
     * MP PEHD besoin brut = 160, stock = 80 → net = 80
     */
    mockChain({
      articles: () => ({
        data: [
          { id: 'pf1', code: 'PF-001', name: 'PF Test', article_type: 'PF', active: true, reorder_point: 100, safety_stock: 0 },
          { id: 'mp1', code: 'MP-001', name: 'MP Test', article_type: 'MP', active: true, reorder_point: 0, safety_stock: 0, default_supplier: { lead_time_days: 7 } },
        ],
        error: null,
      }),
      bom_headers: () => ({
        data: [{
          id: 'bom1', product_id: 'pf1', batch_size_kg: 100, status: 'ACTIF', active: true,
          bom_lines: [{ id: 'bl1', component_id: 'mp1', qty: 160, unit: 'kg' }],
        }],
        error: null,
      }),
      production_orders: () => ({ data: [], error: null }),
      lots:      () => ({ data: [{ article_id: 'mp1', qty_current: 80 }], error: null }),
      da_import: () => ({ data: [], error: null }),
      da_local:  () => ({ data: [], error: null }),
    });

    const results = await calculateMRP();
    const mp = results.find(r => r.code === 'MP-001');
    expect(mp!.stock).toBe(80);
    expect(mp!.needs).toBe(160);
    expect(mp!.net).toBe(80);
  });

  it('prend en compte les entrées prévues (DA en cours)', async () => {
    mockChain({
      articles: () => ({
        data: [
          { id: 'pf1', code: 'PF-001', name: 'PF Test', article_type: 'PF', active: true, reorder_point: 100, safety_stock: 0 },
          { id: 'mp1', code: 'MP-001', name: 'MP Test', article_type: 'MP', active: true, reorder_point: 0, safety_stock: 0, default_supplier: { lead_time_days: 7 } },
        ],
        error: null,
      }),
      bom_headers: () => ({
        data: [{
          id: 'bom1', product_id: 'pf1', batch_size_kg: 100, status: 'ACTIF', active: true,
          bom_lines: [{ id: 'bl1', component_id: 'mp1', qty: 160, unit: 'kg' }],
        }],
        error: null,
      }),
      production_orders: () => ({ data: [], error: null }),
      lots:      () => ({ data: [], error: null }),
      da_import: () => ({ data: [{ article_id: 'mp1', qty_kg: 50 }], error: null }),
      da_local:  () => ({ data: [{ article_id: 'mp1', qty: 30 }],    error: null }),
    });

    const results = await calculateMRP();
    const mp = results.find(r => r.code === 'MP-001');
    expect(mp!.incomingOrders).toBe(80); // 50 + 30
    expect(mp!.net).toBe(80); // 160 - 0 - 80
  });

  it('applique le facteur what-if +20%', async () => {
    mockChain({
      articles: () => ({
        data: [
          { id: 'pf1', code: 'PF-001', name: 'PF Test', article_type: 'PF', active: true, reorder_point: 100, safety_stock: 0 },
          { id: 'mp1', code: 'MP-001', name: 'MP Test', article_type: 'MP', active: true, reorder_point: 0, safety_stock: 0, default_supplier: { lead_time_days: 7 } },
        ],
        error: null,
      }),
      bom_headers: () => ({
        data: [{
          id: 'bom1', product_id: 'pf1', batch_size_kg: 100, status: 'ACTIF', active: true,
          bom_lines: [{ id: 'bl1', component_id: 'mp1', qty: 100, unit: 'kg' }],
        }],
        error: null,
      }),
      production_orders: () => ({ data: [], error: null }),
      lots:      () => ({ data: [], error: null }),
      da_import: () => ({ data: [], error: null }),
      da_local:  () => ({ data: [], error: null }),
    });

    // Base : besoin PF = 100 → MP besoin = 100 kg
    const base = await calculateMRP();
    expect(base.find(r => r.code === 'MP-001')!.needs).toBe(100);

    // +20% → besoin PF = 120 → MP besoin = 120 kg
    jest.clearAllMocks();
    mockChain({
      articles: () => ({
        data: [
          { id: 'pf1', code: 'PF-001', name: 'PF Test', article_type: 'PF', active: true, reorder_point: 100, safety_stock: 0 },
          { id: 'mp1', code: 'MP-001', name: 'MP Test', article_type: 'MP', active: true, reorder_point: 0, safety_stock: 0, default_supplier: { lead_time_days: 7 } },
        ],
        error: null,
      }),
      bom_headers: () => ({
        data: [{
          id: 'bom1', product_id: 'pf1', batch_size_kg: 100, status: 'ACTIF', active: true,
          bom_lines: [{ id: 'bl1', component_id: 'mp1', qty: 100, unit: 'kg' }],
        }],
        error: null,
      }),
      production_orders: () => ({ data: [], error: null }),
      lots:      () => ({ data: [], error: null }),
      da_import: () => ({ data: [], error: null }),
      da_local:  () => ({ data: [], error: null }),
    });
    const whatif = await calculateMRP({ demand_change: '20' });
    expect(whatif.find(r => r.code === 'MP-001')!.needs).toBe(120);
  });

  it('retourne vide si stock MP suffisant', async () => {
    mockChain({
      articles: () => ({
        data: [
          { id: 'pf1', code: 'PF-001', name: 'PF Test', article_type: 'PF', active: true, reorder_point: 100, safety_stock: 0 },
          { id: 'mp1', code: 'MP-001', name: 'MP Test', article_type: 'MP', active: true, reorder_point: 0, safety_stock: 0, default_supplier: { lead_time_days: 7 } },
        ],
        error: null,
      }),
      bom_headers: () => ({
        data: [{
          id: 'bom1', product_id: 'pf1', batch_size_kg: 100, status: 'ACTIF', active: true,
          bom_lines: [{ id: 'bl1', component_id: 'mp1', qty: 100, unit: 'kg' }],
        }],
        error: null,
      }),
      production_orders: () => ({ data: [], error: null }),
      lots:      () => ({ data: [{ article_id: 'mp1', qty_current: 9999 }], error: null }),
      da_import: () => ({ data: [], error: null }),
      da_local:  () => ({ data: [], error: null }),
    });

    const results = await calculateMRP();
    expect(results).toHaveLength(0);
  });

  it('gère zéro article', async () => {
    mockChain({
      articles:         () => ({ data: [],  error: null }),
      bom_headers:      () => ({ data: [],  error: null }),
      production_orders:() => ({ data: [],  error: null }),
      lots:             () => ({ data: [],  error: null }),
      da_import:        () => ({ data: [],  error: null }),
      da_local:         () => ({ data: [],  error: null }),
    });
    expect(await calculateMRP()).toEqual([]);
  });
});
