/**
 * Tests du module de génération PDF
 */

import { escapeHtml, getPdfTemplate } from '../lib/pdf';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

describe('PDF Utility — getPdfTemplate', () => {
  it('génère un template HTML valide avec titre', () => {
    const html = getPdfTemplate('Rapport Test', '<p>Contenu</p>');
    expect(html).toContain('Rapport Test');
    expect(html).toContain('<p>Contenu</p>');
    expect(html).toContain('GSI ERP');
    expect(html).toContain('</html>');
  });

  it('inclut le watermark si fourni', () => {
    const html = getPdfTemplate('Doc', '', { watermark: 'CONFIDENTIEL' });
    expect(html).toContain('CONFIDENTIEL');
    expect(html).toContain('watermark');
  });

  it('génère en format paysage si demandé', () => {
    const html = getPdfTemplate('Doc', '', { orientation: 'landscape' });
    expect(html).toContain('landscape');
  });

  it('inclut les numéros de page par défaut', () => {
    const html = getPdfTemplate('Doc', '');
    expect(html).toContain('pageNumber');
    expect(html).toContain('totalPages');
  });
});

describe('PDF Utility — escapeHtml', () => {
  it('échappe les caractères HTML spéciaux', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('retourne la chaîne vide inchangée', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('retourne le texte normal inchangé', () => {
    expect(escapeHtml('Texte normal sans symboles')).toBe('Texte normal sans symboles');
  });
});
