const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const filePath = path.resolve(__dirname, '../modele_heures_decembre_2025.xlsx');
if (!fs.existsSync(filePath)) {
  console.error('Fichier non trouvé:', filePath);
  process.exit(1);
}

const workbook = XLSX.readFile(filePath, { cellDates: true });
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
if (aoa.length === 0) {
  console.log('Fichier vide');
  process.exit(0);
}

const headerRow = aoa[0].map((v) => String(v || '').trim());
const parseDateHeader = (v) => {
  const clean = String(v || '').split('\n')[0].trim();
  const m = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    return d.toISOString().slice(0, 10);
  }
  const num = Number(clean);
  if (!isNaN(num) && num > 0) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return null;
};

const dateCols = headerRow
  .map((h, i) => ({ h, i, iso: parseDateHeader(h) }))
  .filter((o) => o.iso)
  .map((o) => ({ index: o.i, header: o.h, dateISO: o.iso }));

const idxMat = headerRow.findIndex((h) => /matricule/i.test(h));
const idxNom = headerRow.findIndex((h) => /nom/i.test(h));
const idxSection = headerRow.findIndex((h) => /section/i.test(h));
const idxNote = headerRow.findIndex((h) => /note/i.test(h));

const sampleRows = aoa.slice(1, 6).map((row) => row.slice(0, Math.max(headerRow.length, 10)).map((cell) => String(cell || '')));

console.log('Fichier analysé:', filePath);
console.log('Feuille:', sheetName);
console.log('Nombre de lignes:', aoa.length - 1);
console.log('En-têtes (première ligne):', headerRow);
console.log('Index colonne matricule:', idxMat);
console.log('Index colonne nom:', idxNom);
console.log('Index colonne section:', idxSection);
console.log('Index colonne note:', idxNote);
console.log('Colonnes de date détectées:', dateCols.map((c) => ({ index: c.index, header: c.header, dateISO: c.dateISO })));
console.log('Aperçu 5 premières lignes:');
for (let i = 0; i < sampleRows.length; i++) {
  console.log(`  ligne ${i + 2}:`, sampleRows[i]);
}

if (idxMat === -1) {
  console.log('⚠️ Colonne matricule non détectée. Vérifiez le header.');
}
if (dateCols.length === 0) {
  console.log('⚠️ Aucune colonne de date détectée. Le format attendu est JJ/MM/AAAA ou valeur Excel sérialisée.');
}
