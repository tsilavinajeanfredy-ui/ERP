/**
 * Tests — Module FNC (Fiche de Non-Conformité)
 * Vérifie la logique de sévérité, workflow de traitement, et clôture.
 */

import type { FncStatus, FncSeverity } from '../lib/database.types';

// ─── Logique métier FNC ───────────────────────────────────────────────────────

type FncStatusTransition = {
  from: FncStatus;
  to: FncStatus;
  allowedRoles: string[];
};

const FNC_TRANSITIONS: FncStatusTransition[] = [
  { from: 'OUVERTE',    to: 'EN_COURS',  allowedRoles: ['RQ', 'ADMIN', 'SUPER_ADMIN', 'TLAB'] },
  { from: 'EN_COURS',   to: 'A_VALIDER', allowedRoles: ['RQ', 'ADMIN', 'SUPER_ADMIN', 'TLAB'] },
  { from: 'A_VALIDER',  to: 'CLOTUREE', allowedRoles: ['RQ', 'ADMIN', 'SUPER_ADMIN'] },
  { from: 'A_VALIDER',  to: 'EN_COURS',  allowedRoles: ['RQ', 'ADMIN', 'SUPER_ADMIN'] }, // Renvoi
];

function canFncTransition(from: FncStatus, to: FncStatus, role: string): boolean {
  return FNC_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.allowedRoles.includes(role)
  );
}

const SEVERITY_SCORE: Record<FncSeverity, number> = {
  MINEURE: 1,
  MAJEURE: 2,
  CRITIQUE: 3,
};

function computeFncRiskScore(severity: FncSeverity, occurrences: number): number {
  return SEVERITY_SCORE[severity] * occurrences;
}

function isFncEscalationRequired(severity: FncSeverity, occurrences: number): boolean {
  return computeFncRiskScore(severity, occurrences) >= 6;
}

function formatFncRef(year: number, sequence: number, site: string): string {
  return `FNC-${site}-${year}-${String(sequence).padStart(4, '0')}`;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FNC — Transitions de statut', () => {
  test('RQ peut ouvrir → en cours', () => {
    expect(canFncTransition('OUVERTE', 'EN_COURS', 'RQ')).toBe(true);
  });

  test('TLAB peut passer en cours → à valider', () => {
    expect(canFncTransition('EN_COURS', 'A_VALIDER', 'TLAB')).toBe(true);
  });

  test('TLAB ne peut PAS clôturer', () => {
    expect(canFncTransition('A_VALIDER', 'CLOTUREE', 'TLAB')).toBe(false);
  });

  test('RQ peut clôturer', () => {
    expect(canFncTransition('A_VALIDER', 'CLOTUREE', 'RQ')).toBe(true);
  });

  test('RQ peut renvoyer en cours depuis A_VALIDER', () => {
    expect(canFncTransition('A_VALIDER', 'EN_COURS', 'RQ')).toBe(true);
  });

  test('Rôle RPROD n\'a aucun droit FNC', () => {
    expect(canFncTransition('OUVERTE', 'EN_COURS', 'RPROD')).toBe(false);
  });

  test('Transition impossible retourne false', () => {
    expect(canFncTransition('OUVERTE', 'CLOTUREE', 'ADMIN')).toBe(false);
  });
});

describe('FNC — Score de risque', () => {
  test('MINEURE × 1 = 1', () => {
    expect(computeFncRiskScore('MINEURE', 1)).toBe(1);
  });

  test('CRITIQUE × 3 = 9', () => {
    expect(computeFncRiskScore('CRITIQUE', 3)).toBe(9);
  });

  test('MAJEURE × 2 = 4', () => {
    expect(computeFncRiskScore('MAJEURE', 2)).toBe(4);
  });
});

describe('FNC — Escalade obligatoire', () => {
  test('CRITIQUE × 2 → escalade (score 6)', () => {
    expect(isFncEscalationRequired('CRITIQUE', 2)).toBe(true);
  });

  test('MAJEURE × 3 → escalade (score 6)', () => {
    expect(isFncEscalationRequired('MAJEURE', 3)).toBe(true);
  });

  test('MINEURE × 5 → pas d\'escalade (score 5)', () => {
    expect(isFncEscalationRequired('MINEURE', 5)).toBe(false);
  });

  test('CRITIQUE × 1 → pas d\'escalade (score 3)', () => {
    expect(isFncEscalationRequired('CRITIQUE', 1)).toBe(false);
  });
});

describe('FNC — Format de référence', () => {
  test('format correct avec padding', () => {
    expect(formatFncRef(2026, 1, 'GSI')).toBe('FNC-GSI-2026-0001');
  });

  test('format correct sequence ≥ 1000', () => {
    expect(formatFncRef(2026, 1234, 'GSI')).toBe('FNC-GSI-2026-1234');
  });
});
