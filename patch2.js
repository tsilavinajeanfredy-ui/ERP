const fs = require('fs');

// Patch pdf.ts
let pdfPath = 'src/lib/pdf.ts';
let pdfCode = fs.readFileSync(pdfPath, 'utf8');
pdfCode = pdfCode.replace(
  /<span>Édition: Enterprise Pro Max<\/span>\s*/,
  ''
);
fs.writeFileSync(pdfPath, pdfCode, 'utf8');

// Patch ProductionScreen.tsx
let prodPath = 'src/screens/ProductionScreen.tsx';
let prodCode = fs.readFileSync(prodPath, 'utf8');

// 1. Remove the second (size 18) printer icon from desktop row
const secondIconStr = `                    <TouchableOpacity
                      onPress={(e) => {
                        if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                        handleExportBomPdf(bom);
                      }}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons name="printer" size={18} color="#005BBB" />
                    </TouchableOpacity>\n`;
prodCode = prodCode.replace(secondIconStr, '');

// 2. Add the size 18 printer icon to mobile row
const mobileChevronStr = `                    <MaterialCommunityIcons name="chevron-right" size={16} color="#ADB5BD" />\n                    {(profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN') && (`
const mobilePrinterStr = `                    <TouchableOpacity
                      onPress={(e) => {
                        if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                        handleExportBomPdf(bom);
                      }}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons name="printer" size={18} color="#005BBB" />
                    </TouchableOpacity>
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#ADB5BD" />
                    {(profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN') && (`

let lastIdx = prodCode.lastIndexOf(mobileChevronStr);
if (lastIdx !== -1) {
    prodCode = prodCode.substring(0, lastIdx) + mobilePrinterStr + prodCode.substring(lastIdx + mobileChevronStr.length);
}

fs.writeFileSync(prodPath, prodCode, 'utf8');
console.log('Fixed PDF and ProductionScreen');
