/**
 * Tests — Module Production (Ordres de Fabrication)
 * Vérifie la logique de statut, calcul TRS, et gestion des arrêts.
 */

type ProductionOrderStatus = 'PLANIFIE' | 'EN_COURS' | 'ARRETE' | 'TERMINE' | 'CLOTURE';

type ProductionOrder = {
  id: string;
  code: string;
  qty_planned: number;
  qty_produced: number | null;
  qty_rejected: number | null;
  status: ProductionOrderStatus;
  planned_date: string | null;
  started_at: string | null;
};

type ProductionStop = {
  id: string;
  of_id: string;
  motif: string;
  duree_min: number;
};

// ─── Logique métier OF ────────────────────────────────────────────────────────

const OF_STATUS_TRANSITIONS: Record<ProductionOrderStatus, ProductionOrderStatus[]> = {
  PLANIFIE: ['EN_COURS'],
  EN_COURS: ['ARRETE', 'TERMINE'],
  ARRETE:   ['EN_COURS'],
  TERMINE:  ['CLOTURE'],
  CLOTURE:  [],
};

function canTransitionOF(from: ProductionOrderStatus, to: ProductionOrderStatus, role: string): boolean {
  const allowed = OF_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) return false;
  // Only RPROD, PLAN, ADMIN, SUPER_ADMIN can manage production orders
  return ['RPROD', 'PLAN', 'ADMIN', 'SUPER_ADMIN'].includes(role);
}

function computeOFCompletion(order: Pick<ProductionOrder, 'qty_planned' | 'qty_produced'>): number {
  if (!order.qty_planned || order.qty_planned === 0) return 0;
  return Math.min(100, Math.round(((order.qty_produced ?? 0) / order.qty_planned) * 100));
}

function computeTRS(
  qtyProduced: number,
  qtyRejected: number,
  plannedTimeMin: number,
  totalStopMin: number,
  cycleTimeMin: number
): number {
  const availableTime = plannedTimeMin - totalStopMin;
  if (availableTime <= 0 || cycleTimeMin <= 0) return 0;
  const theoreticalQty = availableTime / cycleTimeMin;
  const qualityRate = qtyProduced > 0 ? (qtyProduced - qtyRejected) / qtyProduced : 0;
  const performanceRate = Math.min(1, qtyProduced / theoreticalQty);
  const availabilityRate = availableTime / plannedTimeMin;
  return Math.round(availabilityRate * performanceRate * qualityRate * 100);
}

function formatOFCode(site: string, year: number, sequence: number): string {
  return `OF-${site}-${year}-${String(sequence).padStart(4, '0')}`;
}

function getTotalStopTime(stops: ProductionStop[]): number {
  return stops.reduce((acc, s) => acc + s.duree_min, 0);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Production — Transitions de statut OF', () => {
  test('RPROD peut démarrer un OF planifié', () => {
    expect(canTransitionOF('PLANIFIE', 'EN_COURS', 'RPROD')).toBe(true);
  });

  test('RPROD peut arrêter un OF en cours', () => {
    expect(canTransitionOF('EN_COURS', 'ARRETE', 'RPROD')).toBe(true);
  });

  test('RPROD peut reprendre un OF arrêté', () => {
    expect(canTransitionOF('ARRETE', 'EN_COURS', 'RPROD')).toBe(true);
  });

  test('RPROD peut terminer un OF en cours', () => {
    expect(canTransitionOF('EN_COURS', 'TERMINE', 'RPROD')).toBe(true);
  });

  test('ADMIN peut clôturer un OF terminé', () => {
    expect(canTransitionOF('TERMINE', 'CLOTURE', 'ADMIN')).toBe(true);
  });

  test('RQ ne peut pas gérer les OF', () => {
    expect(canTransitionOF('PLANIFIE', 'EN_COURS', 'RQ')).toBe(false);
  });

  test('Impossible de passer directement PLANIFIE → TERMINE', () => {
    expect(canTransitionOF('PLANIFIE', 'TERMINE', 'RPROD')).toBe(false);
  });

  test('Impossible de rouvrir un OF clôturé', () => {
    expect(canTransitionOF('CLOTURE', 'TERMINE', 'ADMIN')).toBe(false);
  });
});

describe('Production — Taux de complétion', () => {
  test('0 planifié → 0%', () => {
    expect(computeOFCompletion({ qty_planned: 0, qty_produced: 0 })).toBe(0);
  });

  test('Complet → 100%', () => {
    expect(computeOFCompletion({ qty_planned: 500, qty_produced: 500 })).toBe(100);
  });

  test('Moitié → 50%', () => {
    expect(computeOFCompletion({ qty_planned: 1000, qty_produced: 500 })).toBe(50);
  });

  test('Dépassement plafonné à 100%', () => {
    expect(computeOFCompletion({ qty_planned: 100, qty_produced: 120 })).toBe(100);
  });

  test('Null qty_produced → 0%', () => {
    expect(computeOFCompletion({ qty_planned: 100, qty_produced: null })).toBe(0);
  });
});

describe('Production — Calcul TRS', () => {
  test('TRS parfait (aucun rejet, aucun arrêt)', () => {
    // 480 min planned, 0 stops, 1 min/pièce, 480 pièces produites, 0 rejet
    expect(computeTRS(480, 0, 480, 0, 1)).toBe(100);
  });

  test('Arrêts réduisent le TRS', () => {
    // 480 min planned, 60 min d'arrêt → disponibilité 87.5%
    const trs = computeTRS(420, 0, 480, 60, 1);
    expect(trs).toBeLessThan(90);
  });

  test('Rejets réduisent la qualité', () => {
    // 480 produits, 48 rejetés → qualité 90%
    const trs = computeTRS(480, 48, 480, 0, 1);
    expect(trs).toBe(90);
  });

  test('TRS 0 si temps disponible nul', () => {
    expect(computeTRS(100, 0, 60, 60, 1)).toBe(0);
  });
});

describe('Production — Arrêts de production', () => {
  const stops: ProductionStop[] = [
    { id: '1', of_id: 'OF-001', motif: 'Panne machine', duree_min: 30 },
    { id: '2', of_id: 'OF-001', motif: 'Changement série', duree_min: 15 },
    { id: '3', of_id: 'OF-001', motif: 'Approvisionnement MP', duree_min: 45 },
  ];

  test('Total arrêts calculé correctement', () => {
    expect(getTotalStopTime(stops)).toBe(90);
  });

  test('Aucun arrêt → 0', () => {
    expect(getTotalStopTime([])).toBe(0);
  });
});

describe('Production — Format code OF', () => {
  test('Format avec padding', () => {
    expect(formatOFCode('GSI', 2026, 1)).toBe('OF-GSI-2026-0001');
  });

  test('Format 4 chiffres', () => {
    expect(formatOFCode('GSI', 2026, 1234)).toBe('OF-GSI-2026-1234');
  });
});
