/**
 * Tests unitaires — Logique de retry sur conflit de code (23505)
 */

type MutationType = 'INSERT' | 'UPDATE' | 'DELETE';

interface RetryResult {
  attempts: number;
  finalCode: string;
  success: boolean;
}

// Simulation de la logique de retry de useMutation
function simulateInsertWithRetry(
  initialCode: string,
  failOnCodes: Set<string>,
  maxAttempts = 3
): RetryResult {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = initialCode;

    if (attempt > 0) {
      const parts = code.split('-');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num)) {
        parts[parts.length - 1] = String(num + attempt).padStart(lastPart.length, '0');
        code = parts.join('-');
      }
    }

    if (!failOnCodes.has(code)) {
      return { attempts: attempt + 1, finalCode: code, success: true };
    }
    lastError = new Error(`Code ${code} déjà existant (23505)`);
  }

  return { attempts: maxAttempts, finalCode: '', success: false };
}

describe('useMutation — retry sur doublon 23505', () => {
  test('réussit au premier essai si le code est libre', () => {
    const result = simulateInsertWithRetry('FNC-2026-001', new Set());
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.finalCode).toBe('FNC-2026-001');
  });

  test('incrémente et réussit au deuxième essai', () => {
    const result = simulateInsertWithRetry('FNC-2026-001', new Set(['FNC-2026-001']));
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.finalCode).toBe('FNC-2026-002');
  });

  test('incrémente et réussit au troisième essai', () => {
    const taken = new Set(['FNC-2026-001', 'FNC-2026-002']);
    const result = simulateInsertWithRetry('FNC-2026-001', taken);
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(3);
    expect(result.finalCode).toBe('FNC-2026-003');
  });

  test('échoue après 3 tentatives si tous les codes sont pris', () => {
    const taken = new Set(['FNC-2026-001', 'FNC-2026-002', 'FNC-2026-003']);
    const result = simulateInsertWithRetry('FNC-2026-001', taken);
    expect(result.success).toBe(false);
  });
});
