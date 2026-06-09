/**
 * Tests — Module FCQ (Fiche de Contrôle Qualité)
 * Vérifie la logique de statut, validation, et transitions d'état.
 */

import type { FcqStatus, FcqDossier } from '../lib/database.types';

// ─── Logique métier FCQ (extraite / reproduite pour tests isolés) ─────────────

type FcqStatusTransition = {
  from: FcqStatus;
  to: FcqStatus;
  allowedRoles: string[];
};

const FCQ_TRANSITIONS: FcqStatusTransition[] = [
  { from: 'EN_ATTENTE', to: 'EN_COURS',  allowedRoles: ['TLAB', 'RQ', 'ADMIN', 'SUPER_ADMIN'] },
  { from: 'EN_COURS',   to: 'COMPLET',   allowedRoles: ['TLAB', 'RQ', 'ADMIN', 'SUPER_ADMIN'] },
  { from: 'COMPLET',    to: 'VALIDE',    allowedRoles: ['RQ', 'ADMIN', 'SUPER_ADMIN'] },
  { from: 'EN_ATTENTE', to: 'COMPLET',   allowedRoles: [] }, // Transition invalide
];

function canTransition(from: FcqStatus, to: FcqStatus, role: string): boolean {
  const transition = FCQ_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!transition) return false;
  return transition.allowedRoles.includes(role);
}

function computeFcqCompletion(dossier: Pick<FcqDossier, 'param_count' | 'ok_count'>): number {
  if (!dossier.param_count || dossier.param_count === 0) return 0;
  return Math.round(((dossier.ok_count ?? 0) / dossier.param_count) * 100);
}

function isFcqValid(dossier: Pick<FcqDossier, 'status' | 'param_count' | 'ok_count'>): boolean {
  return dossier.status === 'VALIDE' && computeFcqCompletion(dossier) === 100;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FCQ — Transitions d\'état', () => {
  test('TLAB peut passer EN_ATTENTE → EN_COURS', () => {
    expect(canTransition('EN_ATTENTE', 'EN_COURS', 'TLAB')).toBe(true);
  });

  test('TLAB peut passer EN_COURS → COMPLET', () => {
    expect(canTransition('EN_COURS', 'COMPLET', 'TLAB')).toBe(true);
  });

  test('TLAB ne peut PAS valider (COMPLET → VALIDE)', () => {
    expect(canTransition('COMPLET', 'VALIDE', 'TLAB')).toBe(false);
  });

  test('RQ peut valider (COMPLET → VALIDE)', () => {
    expect(canTransition('COMPLET', 'VALIDE', 'RQ')).toBe(true);
  });

  test('ADMIN peut valider', () => {
    expect(canTransition('COMPLET', 'VALIDE', 'ADMIN')).toBe(true);
  });

  test('Transition invalide retourne false (EN_ATTENTE → COMPLET)', () => {
    expect(canTransition('EN_ATTENTE', 'COMPLET', 'RQ')).toBe(false);
  });

  test('Rôle RPROD ne peut effectuer aucune transition FCQ', () => {
    expect(canTransition('EN_ATTENTE', 'EN_COURS', 'RPROD')).toBe(false);
    expect(canTransition('EN_COURS', 'COMPLET', 'RPROD')).toBe(false);
    expect(canTransition('COMPLET', 'VALIDE', 'RPROD')).toBe(false);
  });
});

describe('FCQ — Calcul de complétion', () => {
  test('0 paramètre → 0%', () => {
    expect(computeFcqCompletion({ param_count: 0, ok_count: 0 })).toBe(0);
  });

  test('null param_count → 0%', () => {
    expect(computeFcqCompletion({ param_count: null as unknown as number, ok_count: 0 })).toBe(0);
  });

  test('tous ok → 100%', () => {
    expect(computeFcqCompletion({ param_count: 10, ok_count: 10 })).toBe(100);
  });

  test('moitié ok → 50%', () => {
    expect(computeFcqCompletion({ param_count: 10, ok_count: 5 })).toBe(50);
  });

  test('arrondi correct (7/10 → 70%)', () => {
    expect(computeFcqCompletion({ param_count: 10, ok_count: 7 })).toBe(70);
  });

  test('arrondi correct (1/3 → 33%)', () => {
    expect(computeFcqCompletion({ param_count: 3, ok_count: 1 })).toBe(33);
  });
});

describe('FCQ — Validation globale', () => {
  test('dossier VALIDE à 100% est valide', () => {
    expect(isFcqValid({ status: 'VALIDE', param_count: 5, ok_count: 5 })).toBe(true);
  });

  test('dossier COMPLET (non encore validé) n\'est pas valide', () => {
    expect(isFcqValid({ status: 'COMPLET', param_count: 5, ok_count: 5 })).toBe(false);
  });

  test('dossier VALIDE mais incomplet n\'est pas valide', () => {
    expect(isFcqValid({ status: 'VALIDE', param_count: 5, ok_count: 3 })).toBe(false);
  });
});
