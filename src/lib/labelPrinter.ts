import * as Print from 'expo-print';
import { Platform } from 'react-native';

const STATUS_LABELS: Record<string, string> = {
  EN_ATTENTE: 'EN ATTENTE',
  QUARANTAINE: 'QUARANTAINE',
  LIBERE: 'LIBÉRÉ',
  BLOQUE: 'BLOQUÉ',
};

const statusLabelOf = (status?: string) =>
  STATUS_LABELS[(status || '').toUpperCase()] || status || 'QUARANTAINE';

const statusColorOf = (status?: string): string => {
  switch ((status || '').toUpperCase()) {
    case 'LIBERE':
      return '#28A745';
    case 'BLOQUE':
      return '#DC3545';
    case 'QUARANTAINE':
      return '#D4A017';
    case 'EN_ATTENTE':
      return '#0D6EFD';
    default:
      return '#D4A017';
  }
};

const escapeHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function printThermalLabel(lotData: {
  code: string;
  article: string;
  qty: string | number;
  unit: string;
  date: string;
  supplier?: string;
  status?: string;
  operator?: string;
  title?: string;
  qrData?: string;
}) {
  const title = lotData.title || 'GSI — RÉCEPTION MATIÈRE PREMIÈRE';
  const statusLabel = statusLabelOf(lotData.status);
  const statusColor = statusColorOf(lotData.status);
  const qrData = encodeURIComponent(lotData.qrData || lotData.code);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @page { size: 100mm 70mm; margin: 2mm; }
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; width: 100mm; height: 70mm; overflow: hidden; }
          body {
            font-family: 'Helvetica', 'Arial', sans-serif;
            color: #1A1A1A;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page {
            width: 96mm;
            height: 66mm;
            padding: 0;
            overflow: hidden;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .card {
            border: 1.4px solid #1A1A1A;
            border-radius: 4px;
            padding: 7px 8px;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
          .header {
            border-bottom: 1px solid #DDD;
            padding-bottom: 4px;
            margin-bottom: 6px;
          }
          .header-text {
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
            color: #1A1A1A;
          }
          .main { display: flex; flex-direction: row; justify-content: space-between; gap: 8px; align-items: flex-start; }
          .text-side { flex: 1; min-width: 0; }
          .lbl { font-size: 7px; font-weight: 700; color: #8A8A8A; letter-spacing: 0.4px; margin-top: 4px; }
          .lbl:first-child { margin-top: 0; }
          .val { font-size: 9px; color: #1A1A1A; margin-top: 1px; word-break: break-word; line-height: 1.15; }
          .val-strong { font-size: 13px; font-weight: 800; color: #000; margin-top: 1px; line-height: 1.1; }
          .badge {
            display: inline-block;
            margin-top: 6px;
            padding: 2px 7px;
            border-radius: 3px;
            color: #FFF;
            font-size: 10px;
            font-weight: 800;
            background: ${statusColor};
            border: 1px solid ${statusColor};
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .qr-side { text-align: center; }
          .qr-img { width: 110px; height: 110px; display: block; }
          .qr-sub { font-size: 8px; color: #8A8A8A; margin-top: 2px; }
          .footer {
            border-top: 1px solid #DDD;
            margin-top: 8px;
            padding-top: 6px;
            text-align: center;
          }
          .footer-text { font-size: 8px; color: #8A8A8A; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header"><div class="header-text">${escapeHtml(title)}</div></div>
          <div class="main">
            <div class="text-side">
              <div class="lbl">ARTICLE</div>
              <div class="val">${escapeHtml(lotData.article) || '—'}</div>
              <div class="lbl">N° LOT</div>
              <div class="val-strong">${escapeHtml(lotData.code)}</div>
              <div class="lbl">QUANTITÉ</div>
              <div class="val">${escapeHtml(lotData.qty)} ${escapeHtml(lotData.unit)}</div>
              <div class="lbl">FOURNISSEUR</div>
              <div class="val">${escapeHtml(lotData.supplier) || '—'}</div>
              <div class="badge">${escapeHtml(statusLabel)}</div>
            </div>
            <div class="qr-side">
              <img class="qr-img" src="${qrUrl}" />
              <div class="qr-sub">Scanner pour FCQ</div>
            </div>
          </div>
          <div class="footer">
            <div class="footer-text">Réception : ${escapeHtml(lotData.date)}${lotData.operator ? ' · ' + escapeHtml(lotData.operator) : ''}</div>
          </div>
        </div>
      </body>
    </html>
  `;

  if (Platform.OS === 'web') {
    printHtmlOnWeb(html);
    return;
  }

  try {
    await Print.printAsync({
      html,
    });
  } catch (error) {
    console.error("Erreur d'impression d'étiquette:", error);
  }
}

// Sur le web, expo-print imprime parfois toute la page de l'app au lieu du
// seul contenu fourni. On imprime donc l'étiquette dans un iframe isolé.
function printHtmlOnWeb(html: string) {
  if (typeof document === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    // léger délai pour laisser le navigateur terminer le rendu/impression
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 800);
  };

  const triggerPrint = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.focus();
    win.print();
    cleanup();
  };

  // Attendre le chargement complet de l'iframe (images QR incluses) avant
  // d'imprimer. On attend explicitement les <img> pour éviter un QR manquant.
  const waitForImagesThenPrint = () => {
    const win = iframe.contentWindow;
    const idoc = win?.document;
    if (!idoc) {
      cleanup();
      return;
    }
    const images = Array.from(idoc.images || []);
    const pending = images.filter((img) => !img.complete);
    if (pending.length === 0) {
      setTimeout(triggerPrint, 150);
      return;
    }
    let remaining = pending.length;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTimeout(triggerPrint, 150);
    };
    pending.forEach((img) => {
      const onDone = () => {
        remaining -= 1;
        if (remaining <= 0) finish();
      };
      img.addEventListener('load', onDone);
      img.addEventListener('error', onDone);
    });
    // garde-fou : imprimer au plus tard après 2,5 s même si une image bloque
    setTimeout(finish, 2500);
  };

  if (iframe.contentWindow?.document.readyState === 'complete') {
    waitForImagesThenPrint();
  } else {
    iframe.onload = waitForImagesThenPrint;
  }
}
