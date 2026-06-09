/**
 * Tests unitaires — Génération de codes séquentiels (getNextCode fallback client)
 */

// Reproduction du fallback client-side de supabase.ts
function buildNextCode(
  prefix: string,
  existingCodes: string[],
  padLength = 3
): string {
  const year = new Date().getFullYear();
  const searchPattern = `${prefix}-${year}-`;

  let maxSuffix = 0;
  for (const code of existingCodes) {
    if (code.startsWith(searchPattern)) {
      const parts = code.split('-');
      const lastPart = parts[parts.length - 1];
      const num = parseInt(lastPart, 10);
      if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
    }
  }
  const nextNum = maxSuffix + 1;
  return `${prefix}-${year}-${nextNum.toString().padStart(padLength, '0')}`;
}

describe('getNextCode — fallback client-side', () => {
  const year = new Date().getFullYear();

  test('génère le premier code quand la liste est vide', () => {
    expect(buildNextCode('FNC', [])).toBe(`FNC-${year}-001`);
  });

  test('incrémente correctement à partir des codes existants', () => {
    const existing = [`FNC-${year}-001`, `FNC-${year}-002`, `FNC-${year}-003`];
    expect(buildNextCode('FNC', existing)).toBe(`FNC-${year}-004`);
  });

  test('trouve le max même si les codes sont désordonnés', () => {
    const existing = [`FNC-${year}-005`, `FNC-${year}-002`, `FNC-${year}-009`];
    expect(buildNextCode('FNC', existing)).toBe(`FNC-${year}-010`);
  });

  test('ignore les codes d\'un autre préfixe', () => {
    const existing = [`DA-${year}-001`, `DA-${year}-010`];
    expect(buildNextCode('FNC', existing)).toBe(`FNC-${year}-001`);
  });

  test('ignore les codes d\'une autre année', () => {
    const existing = [`FNC-${year - 1}-099`];
    expect(buildNextCode('FNC', existing)).toBe(`FNC-${year}-001`);
  });

  test('respecte le padLength personnalisé', () => {
    expect(buildNextCode('OF', [], 4)).toBe(`OF-${year}-0001`);
  });
});
