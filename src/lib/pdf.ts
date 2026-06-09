import { Platform } from 'react-native';

export interface PdfOptions {
  orientation?: 'portrait' | 'landscape';
  watermark?: string;
  showPageNumbers?: boolean;
}

export const generatePdf = async (htmlContent: string, fileName: string, _options: PdfOptions = {}) => {
  try {
    if (Platform.OS === 'web') {
      // Créer un blob HTML et déclencher le téléchargement + impression
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // Ouvrir dans une nouvelle fenêtre et imprimer
      const printWindow = window.open(url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.focus();
          printWindow.print();
          // Libérer la mémoire après l'impression
          printWindow.onafterprint = () => {
            URL.revokeObjectURL(url);
          };
        };
      } else {
        // Fallback si popup bloqué : téléchargement direct
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.html`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } else {
      // Import dynamique : expo-print et expo-sharing ont du code natif
      // qui ne doit pas être bundlé sur web.
      const Print   = await import('expo-print');
      const Sharing = await import('expo-sharing');
      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Exporter ${fileName}`,
          UTI: 'com.adobe.pdf',
        });
      }
    }
  } catch (err) {
    console.error('Erreur lors de la génération du PDF:', err);
  }
};

const getLogoUrl = () => {
  if (Platform.OS === 'web') {
    return window.location.origin + '/photos/login.png';
  }
  return 'https://erp.gsi.mg/photos/login.png';
};

export const escapeHtml = (unsafe: string) => {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const getPdfTemplate = (title: string, bodyHtml: string, options: PdfOptions = {}) => {
  const logoUrl = getLogoUrl();
  const { orientation = 'portrait', watermark, showPageNumbers = true } = options;
  const safeTitle = escapeHtml(title);
  
  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${safeTitle}</title>
        <style>
          @page {
            size: A4 ${orientation};
            margin: 20mm;
            @bottom-right {
              content: "Page " counter(page) " sur " counter(pages);
              font-size: 8pt;
              color: #ADB5BD;
            }
          }
          
          body { 
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; 
            padding: 0; 
            margin: 0;
            color: #1A1A1A; 
            line-height: 1.4;
            font-size: 11pt;
          }

          /* Watermark */
          ${watermark ? `
          .watermark {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(-45deg);
            font-size: 80pt;
            color: rgba(200, 200, 200, 0.15);
            z-index: -1000;
            white-space: nowrap;
            pointer-events: none;
            font-weight: bold;
            text-transform: uppercase;
          }
          ` : ''}

          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: center; 
            border-bottom: 2px solid #1E513B; 
            padding-bottom: 15px; 
            margin-bottom: 25px; 
          }
          
          .logo-container { display: flex; align-items: center; gap: 15px; }
          .logo { width: 60px; height: 60px; object-fit: contain; }
          .logo-text { color: #1E513B; font-size: 18pt; font-weight: 900; letter-spacing: -0.5px; }
          
          .header-info { display: flex; gap: 20px; align-items: center; }
          .qr-code { width: 65px; height: 65px; border: 1px solid #E9ECEF; padding: 2px; border-radius: 4px; }
          .company-info { text-align: right; font-size: 8pt; color: #495057; line-height: 1.2; }
          
          h1 { color: #1A1A1A; font-size: 20pt; margin: 0 0 5px 0; font-weight: 800; }
          .doc-ref { font-size: 9pt; color: #6C757D; margin-bottom: 25px; display: flex; justify-content: space-between; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; table-layout: auto; }
          th { background-color: #F8F9FA; border-bottom: 1.5pt solid #1E513B; text-align: left; padding: 10px 8px; color: #1E513B; text-transform: uppercase; font-weight: 700; font-size: 8pt; letter-spacing: 0.5px; }
          td { border-bottom: 0.5pt solid #E9ECEF; padding: 10px 8px; color: #1A1A1A; vertical-align: top; }
          tr:nth-child(even) { background-color: #FAFBFC; }
          
          .footer { 
            position: fixed;
            bottom: 0;
            width: 100%;
            font-size: 8pt; 
            color: #ADB5BD; 
            text-align: center; 
            border-top: 0.5pt solid #E9ECEF; 
            padding-top: 10px;
            background: white;
          }

          /* Helpers */
          .badge { padding: 3pt 6pt; border-radius: 4pt; font-size: 8pt; font-weight: 700; display: inline-block; text-transform: uppercase; }
          .badge-info { background: #E8F0FE; color: #1A56DB; }
          .badge-ok { background: #E6F4EA; color: #1E8E3E; }
          .badge-err { background: #FDEAEA; color: #DC3545; }
          .badge-gold { background: #FEF3C7; color: #D97706; }
          
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .bold { font-weight: 700; }
          
          .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
          .summary-card { background: #F8F9FA; padding: 12px; border-radius: 6pt; border: 0.5pt solid #E9ECEF; }
          .summary-label { font-size: 8pt; color: #6C757D; text-transform: uppercase; font-weight: 700; margin-bottom: 4px; }
          .summary-value { font-size: 14pt; color: #1E513B; font-weight: 800; }
          
          .print-only { display: none; }
          @media print {
            .print-only { display: block; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${watermark ? `<div class="watermark">${watermark}</div>` : ''}

        <div class="header">
          <div class="logo-container">
            <img src="${logoUrl}" class="logo" />
            <span class="logo-text">GSI ERP</span>
          </div>
          <div class="header-info">
            <img src="https://quickchart.io/qr?text=gsi-erp://lot/${encodeURIComponent(title)}&size=150" class="qr-code" />
            <div class="company-info">
              <strong>SIPROMAD - POLE INDUSTRIEL</strong><br />
              Zone Industrielle, Antananarivo<br />
              www.sipromad.com<br />
              Imprimé le : ${new Date().toLocaleString('fr-FR')}
            </div>
          </div>
        </div>

        <h1>${safeTitle}</h1>
        
        <div class="doc-ref">
          <span>Réf: DOC-GSI-${Date.now().toString().slice(-6)}</span>
        </div>
        
        <div class="content">
          ${bodyHtml}
        </div>
        
        <div class="footer">
          Document confidentiel généré par GSI ERP — Reproduction interdite sans autorisation.<br />
          ${showPageNumbers ? 'Page <span class="pageNumber"></span> sur <span class="totalPages"></span>' : ''}
        </div>

        <script>
          if (typeof window !== 'undefined') {
            const pageNumbers = document.querySelectorAll('.pageNumber');
            const totalPages = document.querySelectorAll('.totalPages');
          }
        </script>
      </body>
    </html>
  `;
};

// ─── Document Generators ─────────────────────────────────────────────────────

export interface LineItem {
  ref: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice?: number;
  total?: number;
}

function tableRows(items: LineItem[]): string {
  return items.map(i => `
    <tr>
      <td>${escapeHtml(i.ref)}</td>
      <td>${escapeHtml(i.description)}</td>
      <td class="text-right">${i.qty}</td>
      <td>${escapeHtml(i.unit)}</td>
      ${i.unitPrice !== undefined ? `<td class="text-right">${i.unitPrice.toFixed(2)}</td>` : ''}
      ${i.total !== undefined ? `<td class="text-right">${i.total.toFixed(2)}</td>` : ''}
    </tr>
  `).join('');
}

/**
 * Bon de Transport (BT)
 */
export function getBtTemplate(data: {
  ref: string;
  transporter: string;
  vehicle: string;
  driver: string;
  date: string;
  origin: string;
  destination: string;
  items: LineItem[];
  notes?: string;
}): string {
  return getPdfTemplate(`BON DE TRANSPORT ${data.ref}`, `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Transporteur</div>
        <div class="summary-value" style="font-size:11pt">${escapeHtml(data.transporter)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Véhicule</div>
        <div class="summary-value" style="font-size:11pt">${escapeHtml(data.vehicle)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Chauffeur</div>
        <div class="summary-value" style="font-size:11pt">${escapeHtml(data.driver)}</div>
      </div>
    </div>
    <table>
      <tr><th colspan="2">Parcours</th></tr>
      <tr><td><strong>Origine</strong></td><td>${escapeHtml(data.origin)}</td></tr>
      <tr><td><strong>Destination</strong></td><td>${escapeHtml(data.destination)}</td></tr>
      <tr><td><strong>Date</strong></td><td>${data.date}</td></tr>
    </table>
    <table>
      <tr><th>Réf.</th><th>Désignation</th><th class="text-right">Qté</th><th>Unité</th></tr>
      ${tableRows(data.items)}
    </table>
    ${data.notes ? `<p><strong>Notes :</strong> ${escapeHtml(data.notes)}</p>` : ''}
    <br/>
    <table style="border:none; margin-top:30px">
      <tr>
        <td style="border:none; text-align:center"><strong>Signature Expéditeur</strong><br/><br/>_______________</td>
        <td style="border:none; text-align:center"><strong>Signature Transporteur</strong><br/><br/>_______________</td>
        <td style="border:none; text-align:center"><strong>Signature Destinataire</strong><br/><br/>_______________</td>
      </tr>
    </table>
  `);
}

/**
 * Bon de Sortie (BS)
 */
export function getBsTemplate(data: {
  ref: string;
  date: string;
  requester: string;
  depot: string;
  destination: string;
  items: LineItem[];
  notes?: string;
}): string {
  return getPdfTemplate(`BON DE SORTIE ${data.ref}`, `
    <div class="summary-card">
      <strong>DEMANDEUR :</strong> ${escapeHtml(data.requester)}<br/>
      <strong>DÉPÔT :</strong> ${escapeHtml(data.depot)}<br/>
      <strong>DESTINATION :</strong> ${escapeHtml(data.destination)}<br/>
      <strong>DATE :</strong> ${data.date}
    </div>
    <table>
      <tr><th>Réf.</th><th>Désignation</th><th class="text-right">Qté</th><th>Unité</th></tr>
      ${tableRows(data.items)}
    </table>
    ${data.notes ? `<p><strong>Notes :</strong> ${escapeHtml(data.notes)}</p>` : ''}
    <br/>
    <table style="border:none; margin-top:30px">
      <tr>
        <td style="border:none; text-align:center"><strong>Visa Magasinier</strong><br/><br/>_______________</td>
        <td style="border:none; text-align:center"><strong>Visa Demandeur</strong><br/><br/>_______________</td>
      </tr>
    </table>
  `, { orientation: 'portrait' });
}

/**
 * Procès-Verbal (PV)
 */
export function getPvTemplate(data: {
  ref: string;
  title: string;
  date: string;
  location: string;
  participants: string[];
  objective: string;
  sections: { heading: string; content: string }[];
  conclusion: string;
  nextActions: { action: string; owner: string; deadline: string }[];
}): string {
  const parts = data.sections.map(s => `
    <h3>${escapeHtml(s.heading)}</h3>
    <p>${s.content}</p>
  `).join('');

  const actions = data.nextActions.map(a => `
    <tr>
      <td>${escapeHtml(a.action)}</td>
      <td>${escapeHtml(a.owner)}</td>
      <td>${a.deadline}</td>
    </tr>
  `).join('');

  return getPdfTemplate(`PROCÈS-VERBAL ${data.ref}`, `
    <div class="summary-card">
      <strong>TITRE :</strong> ${escapeHtml(data.title)}<br/>
      <strong>DATE :</strong> ${data.date}<br/>
      <strong>LIEU :</strong> ${escapeHtml(data.location)}<br/>
      <strong>OBJECTIF :</strong> ${escapeHtml(data.objective)}
    </div>
    <h3>Participants</h3>
    <ul>${data.participants.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
    ${parts}
    <h3>Conclusion</h3>
    <p>${data.conclusion}</p>
    <h3>Actions à Suivre</h3>
    <table>
      <tr><th>Action</th><th>Responsable</th><th>Échéance</th></tr>
      ${actions || '<tr><td colspan="3" style="text-align:center">Aucune action planifiée</td></tr>'}
    </table>
    <br/>
    <table style="border:none; margin-top:30px">
      <tr>
        <td style="border:none; text-align:center"><strong>Rédacteur</strong><br/><br/>_______________</td>
        <td style="border:none; text-align:center"><strong>Approbateur</strong><br/><br/>_______________</td>
      </tr>
    </table>
  `);
}

/**
 * Fiche Contrôle Qualité (FCQ)
 */
export function getFcqTemplate(data: {
  ref: string;
  lotCode: string;
  articleName: string;
  articleType: string;
  analyst: string;
  date: string;
  instrument: string;
  results: { param: string; target: string; measured: string; unit: string; conform: boolean }[];
  decision: string;
  notes?: string;
}): string {
  const resultRows = data.results.map(r => `
    <tr>
      <td>${escapeHtml(r.param)}</td>
      <td>${escapeHtml(r.target)}</td>
      <td>${escapeHtml(r.measured)}</td>
      <td>${escapeHtml(r.unit)}</td>
      <td><span class="badge ${r.conform ? 'badge-ok' : 'badge-err'}">${r.conform ? 'CONFORME' : 'N/C'}</span></td>
    </tr>
  `).join('');

  return getPdfTemplate(`Fiche Contrôle Qualité ${data.ref}`, `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Lot</div>
        <div class="summary-value" style="font-size:11pt">${escapeHtml(data.lotCode)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Article</div>
        <div class="summary-value" style="font-size:11pt">${escapeHtml(data.articleName)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Décision</div>
        <div class="summary-value" style="font-size:11pt">${escapeHtml(data.decision)}</div>
      </div>
    </div>
    <table>
      <tr><th>Paramètre</th><th>Cible</th><th>Mesuré</th><th>Unité</th><th>Statut</th></tr>
      ${resultRows}
    </table>
    <p><strong>Analyste :</strong> ${escapeHtml(data.analyst)}<br/>
    <strong>Instrument :</strong> ${escapeHtml(data.instrument)}<br/>
    <strong>Date :</strong> ${data.date}</p>
    ${data.notes ? `<p><strong>Notes :</strong> ${escapeHtml(data.notes)}</p>` : ''}
    <br/>
    <table style="border:none; margin-top:30px">
      <tr>
        <td style="border:none; text-align:center"><strong>Visa Technicien</strong><br/><br/>_______________</td>
        <td style="border:none; text-align:center"><strong>Visa Resp. Qualité</strong><br/><br/>_______________</td>
      </tr>
    </table>
  `);
}

/**
 * Bon d'Expédition (BE)
 */
export function getBeTemplate(data: {
  ref: string;
  date: string;
  client: string;
  depot: string;
  transporter?: string;
  items: LineItem[];
  notes?: string;
}): string {
  return getPdfTemplate(`BON D'EXPÉDITION ${data.ref}`, `
    <div class="summary-card">
      <strong>CLIENT :</strong> ${escapeHtml(data.client)}<br/>
      <strong>DÉPÔT :</strong> ${escapeHtml(data.depot)}<br/>
      ${data.transporter ? `<strong>TRANSPORTEUR :</strong> ${escapeHtml(data.transporter)}<br/>` : ''}
      <strong>DATE :</strong> ${data.date}
    </div>
    <table>
      <tr><th>Réf.</th><th>Désignation</th><th class="text-right">Qté</th><th>Unité</th></tr>
      ${tableRows(data.items)}
    </table>
    ${data.notes ? `<p><strong>Notes :</strong> ${escapeHtml(data.notes)}</p>` : ''}
    <br/>
    <table style="border:none; margin-top:30px">
      <tr>
        <td style="border:none; text-align:center"><strong>Visa Magasinier</strong><br/><br/>_______________</td>
        <td style="border:none; text-align:center"><strong>Visa Client</strong><br/><br/>_______________</td>
      </tr>
    </table>
  `);
}
