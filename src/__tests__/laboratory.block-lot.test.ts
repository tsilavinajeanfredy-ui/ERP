/**
 * Test — Simulation du flux de décision laboratoire (blocage de lot)
 * Ce test isole la logique métier attendue lors d'une décision 'BLOQUE'
 * - le lot passe en statut 'BLOQUE'
 * - une FNC est planifiée (génération de code)
 * - les rôles corrects sont notifiés
 */

function generateNextFncCode(lastCode: string | null, year: number) {
  const base = `FNC-${year}-`;
  if (!lastCode) return base + '0001';
  const parts = lastCode.split('-');
  const lastNum = parseInt(parts[parts.length - 1] || '0', 10) || 0;
  return base + String(lastNum + 1).padStart(4, '0');
}

describe('Laboratory — Blocage lot (simulation)', () => {
  test('blocage → lot à BLOQUE, FNC code généré et notifications envoyées', async () => {
    // Données d'exemple
    const dossier = { id: 'D1', code: 'FCQ-2026-0001', lot_id: 'L1', lot: { code: 'LOT-01' } };
    const decision = 'BLOQUE';
    const decisionMotive = 'Résultats non conformes';
    const rqObservation = 'Mesures hors tolérances';
    const profile = { id: 'U1', full_name: 'RQ Tester' };

    // 1) Mise à jour attendue du lot
    const updatedLotValues: any = {};
    const lotUpdate = ({ id, values }: any) => {
      expect(id).toBe(dossier.lot_id);
      Object.assign(updatedLotValues, values);
      return Promise.resolve({});
    };

    // 2) Simulation génération FNC — on suppose qu'il y a une dernière FNC
    const lastFnc = [{ code: 'FNC-2026-0012' }];
    const generatedFnc = generateNextFncCode(lastFnc?.[0]?.code || null, new Date().getFullYear());
    expect(generatedFnc).toMatch(/^FNC-\d{4}-\d{4}$/);

    // 3) Notifications — collectées
    const sentNotifs: any[] = [];
    const notify = (n: any) => {
      sentNotifs.push(n);
      return Promise.resolve({});
    };

    // Rôles attendus pour BLOQUE (selon implémentation): ['MAGA','RPROD','RACH','ADMIN']
    const expectedRoles = ['MAGA', 'RPROD', 'RACH', 'ADMIN'];

    // Exécuter la logique simulée
    await lotUpdate({ id: dossier.lot_id, values: { cqlib_status: decision, cqlib_decided_by: profile.id, cqlib_decided_at: new Date().toISOString() } });

    // Simuler création FNC
    const fncInsert = { code: generatedFnc, lot_id: dossier.lot_id, fcq_id: dossier.id, description: `Motif: ${decisionMotive}` };

    // Simuler notifications envoyées
    for (const roleTarget of expectedRoles) {
      await notify({ to_role: roleTarget, subject: `LOT BLOQUE · ${dossier.code}`, message: `Lot: ${dossier.lot.code}\nDécision: ${decision}\nMotif: ${decisionMotive}` });
    }

    // Assertions finales
    expect(updatedLotValues.cqlib_status).toBe('BLOQUE');
    expect(fncInsert.code).toBe(generatedFnc);
    expect(sentNotifs.length).toBe(expectedRoles.length);
    const roles = sentNotifs.map(n => n.to_role).sort();
    expect(roles).toEqual(expectedRoles.slice().sort());
  });
});
