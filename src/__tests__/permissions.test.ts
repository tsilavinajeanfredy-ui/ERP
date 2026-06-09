/**
 * Tests unitaires — Logique RBAC (usePermissions)
 * Vérifie que chaque rôle accède uniquement aux écrans et actions autorisés.
 */

// Reproduction de la logique RBAC de hooks.ts pour tests isolés
type ScreenName = 'Dashboard' | 'Audit' | 'Referential' | 'Reception' | 'Laboratory' |
  'Production' | 'Stocks' | 'Inventory' | 'Mrp' | 'PurchasingImport' | 'PurchasingLocal' |
  'Admin' | 'Rh' | 'Shipping' | 'Fnc' | 'Complaints' | 'ReceptionPF' | 'PlanningLogistique' |
  'AdminUsers' | 'EdgeFunctionTest' | 'Maintenance' | 'Metrology';

const SCREEN_ACCESS: Record<string, ScreenName[]> = {
  ADMIN: ['Dashboard', 'Audit', 'Referential', 'Reception', 'ReceptionPF', 'Laboratory',
    'Production', 'Stocks', 'Inventory', 'Mrp', 'PurchasingImport', 'PurchasingLocal',
    'PlanningLogistique', 'Admin', 'AdminUsers', 'EdgeFunctionTest', 'Complaints', 'Rh', 'Fnc', 'Shipping', 'Maintenance', 'Metrology'],
  DPI: ['Dashboard', 'Audit', 'Referential', 'Production', 'Stocks', 'Inventory', 'PurchasingLocal', 'PlanningLogistique'],
  RQ: ['Dashboard', 'Audit', 'Referential', 'Reception', 'ReceptionPF', 'Laboratory', 'Complaints'],
  TLAB: ['Dashboard', 'Referential', 'Laboratory', 'Reception', 'ReceptionPF'],
  RPROD: ['Dashboard', 'Referential', 'Production', 'Stocks', 'Mrp', 'ReceptionPF', 'PlanningLogistique'],
  MAGA: ['Dashboard', 'Referential', 'Reception', 'ReceptionPF', 'Stocks', 'Inventory', 'PlanningLogistique'],
  RACH: ['Dashboard', 'Referential', 'PurchasingImport', 'PurchasingLocal', 'PlanningLogistique'],
  PLAN: ['Dashboard', 'Referential', 'Mrp', 'Production', 'Stocks', 'PlanningLogistique', 'ReceptionPF'],
  RH: ['Dashboard', 'Rh'],
  COMPTA: ['Dashboard', 'Referential', 'Stocks', 'PurchasingImport', 'PurchasingLocal'],
};

function canAccessScreen(role: string, screen: ScreenName): boolean {
  if (role === 'SUPER_ADMIN') return true;
  const effectiveRole = (role === 'DSI' || role === 'ADMIN') ? 'ADMIN' : role;
  return SCREEN_ACCESS[effectiveRole]?.includes(screen) ?? false;
}

describe('RBAC — Contrôle d\'accès aux écrans', () => {
  test('SUPER_ADMIN accède à tous les écrans', () => {
    expect(canAccessScreen('SUPER_ADMIN', 'Admin')).toBe(true);
    expect(canAccessScreen('SUPER_ADMIN', 'Audit')).toBe(true);
    expect(canAccessScreen('SUPER_ADMIN', 'Laboratory')).toBe(true);
  });

  test('TLAB n\'accède pas à Admin ni à Stocks', () => {
    expect(canAccessScreen('TLAB', 'Admin')).toBe(false);
    expect(canAccessScreen('TLAB', 'Stocks')).toBe(false);
  });

  test('TLAB accède à Laboratory et Dashboard', () => {
    expect(canAccessScreen('TLAB', 'Laboratory')).toBe(true);
    expect(canAccessScreen('TLAB', 'Dashboard')).toBe(true);
  });

  test('COMPTA n\'accède pas à la Production ni au Labo', () => {
    expect(canAccessScreen('COMPTA', 'Production')).toBe(false);
    expect(canAccessScreen('COMPTA', 'Laboratory')).toBe(false);
  });

  test('DSI est traité comme ADMIN', () => {
    expect(canAccessScreen('DSI', 'Admin')).toBe(true);
    expect(canAccessScreen('DSI', 'Audit')).toBe(true);
  });

  test('RH accède au module RH et au dashboard', () => {
    expect(canAccessScreen('RH', 'Rh')).toBe(true);
    expect(canAccessScreen('RH', 'Dashboard')).toBe(true);
    expect(canAccessScreen('RH', 'Production')).toBe(false);
  });

  test('Rôle inconnu n\'accède à rien', () => {
    expect(canAccessScreen('INCONNU', 'Dashboard')).toBe(false);
  });
});
