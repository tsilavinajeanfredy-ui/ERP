const fs = require('fs');
let code = fs.readFileSync('src/screens/ProductionScreen.tsx', 'utf8');

// 1. Add useNotification import
code = code.replace(
  "useSaveForecasts } from '../lib/hooks';",
  "useSaveForecasts, useNotification } from '../lib/hooks';"
);

// 2. Add notify hook
code = code.replace(
  "const queryClient = useQueryClient();",
  "const queryClient = useQueryClient();\n  const notify = useNotification();"
);

// 3. Update handleCloseOrder
code = code.replace(
  /completed_at: new Date\(closeFormData\.completed_at\)\.toISOString\(\),\s*\}\)\s*\.eq\('id', closeTargetOrder\.id\);\s*if \(error\) throw error;\s*mutation\.mutate\(\{[\s\S]*?type: 'UPDATE'\s*\}\);\s*setCloseModalVisible\(false\);/,
  `completed_at: new Date(closeFormData.completed_at).toISOString(),
        })
        .eq('id', closeTargetOrder.id);
      if (error) throw error;
      mutation.mutate({
        id: closeTargetOrder.id,
        values: {
          status: 'CLOTURE',
          qty_produced: parseFloat(closeFormData.qty_produced),
          qty_rejected: parseFloat(closeFormData.qty_rejected || '0'),
          completed_at: new Date(closeFormData.completed_at).toISOString(),
        },
        type: 'UPDATE'
      });

      const year = new Date().getFullYear();
      let rpfCode = \`RPF-\${year}-AUTO\`;
      try {
        const { getNextCode } = require('../lib/supabase');
        rpfCode = await getNextCode(\`RPF-GEN\`, 'lots', 'code');
      } catch {}

      const { error: lotError } = await supabase.from('lots').insert({
        code: rpfCode,
        article_id: closeTargetOrder.product_id,
        qty_received: parseFloat(closeFormData.qty_produced),
        qty_current: parseFloat(closeFormData.qty_produced),
        unit: closeTargetOrder.product?.unit || 'kg',
        cqlib_status: 'EN_ATTENTE',
        reception_date: new Date().toISOString().split('T')[0],
      });
      
      if (lotError) throw lotError;

      notify.mutate({
        to_role: 'MAGA',
        subject: 'Nouveau lot PF en attente',
        message: \`L'OF \${closeTargetOrder.code} a été clôturé. Le lot \${rpfCode} est en attente de validation en Réception PF.\`,
        type: 'internal',
        category: 'STOCK',
        metadata: { category: 'STOCK', screen: 'ReceptionPF' }
      });

      setCloseModalVisible(false);`
);

// 4. Add handleExportBomPdf
code = code.replace(
  "generatePdf(htmlContent, `OF_${order.code}.pdf`);\n  };",
  `generatePdf(htmlContent, \`OF_\${order.code}.pdf\`);
  };

  const handleExportBomPdf = async (bom) => {
    try {
      const { data: lines, error } = await supabase
        .from('bom_lines')
        .select('*, component:articles(*)')
        .eq('bom_header_id', bom.id)
        .order('sort_order', { ascending: true });
        
      if (error) throw error;
      
      const productName = bom.product ? getProductName(bom.product) : 'Produit inconnu';
      
      let linesHtml = '';
      if (lines && lines.length > 0) {
        linesHtml = \`
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #F8F9FA;">
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: left;">Composant</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: left;">Code</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">Quantité</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">Unité</th>
                <th style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">%</th>
              </tr>
            </thead>
            <tbody>
              \${lines.map(l => \`
                <tr>
                  <td style="padding: 10px; border: 1px solid #DEE2E6;">\${l.component ? getProductName(l.component) : '—'}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6;">\${l.component?.code || '—'}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">\${l.qty || 0}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">\${l.unit || '—'}</td>
                  <td style="padding: 10px; border: 1px solid #DEE2E6; text-align: right;">\${l.pct ? l.pct + '%' : '—'}</td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        \`;
      } else {
        linesHtml = '<p>Aucun composant défini pour cette nomenclature.</p>';
      }

      const htmlContent = getPdfTemplate(
        \`Fiche Technique : \${bom.code}\`,
        \`
        <div class="summary-card">
          <strong>Produit :</strong> \${productName}<br />
          <strong>Version :</strong> \${bom.version || 1}<br />
          <strong>Taille de lot standard :</strong> \${bom.batch_size_kg || '—'} kg<br />
          <strong>Statut :</strong> <span class="badge badge-\${bom.status === 'VALIDE' ? 'ok' : 'info'}">\${bom.status}</span>
        </div>
        
        <h3>Composition (Nomenclature)</h3>
        \${linesHtml}
        
        \${bom.notes ? \`
          <div style="margin-top: 30px; padding: 15px; background-color: #F8F9FA; border-left: 4px solid #005BBB;">
            <strong>Observations / Instructions :</strong><br/>
            <p style="margin-top: 8px; white-space: pre-wrap;">\${bom.notes}</p>
          </div>
        \` : ''}
        
        <table style="margin-top: 50px; width: 100%;">
          <tr>
            <td style="border: none; text-align: center; width: 50%;"><strong>Visa R&D / Formulation</strong><br /><br /><br /><br />_____________________</td>
            <td style="border: none; text-align: center; width: 50%;"><strong>Visa Direction Technique</strong><br /><br /><br /><br />_____________________</td>
          </tr>
        </table>
        \`
      );

      generatePdf(htmlContent, \`Fiche_Technique_\${bom.code}.pdf\`);
    } catch (err) {
      console.error(err);
      Alert.alert('Erreur', 'Impossible de générer la fiche technique.');
    }
  };`
);

// 5. Add printer icon desktop
code = code.replace(
  '<MaterialCommunityIcons name="chevron-right" size={16} color="#ADB5BD" />\n                    {(profile?.role === \'ADMIN\' || profile?.role === \'SUPER_ADMIN\') && (',
  `<TouchableOpacity
                      onPress={(e) => {
                        if (Platform.OS === 'web') { (e as any).stopPropagation?.(); }
                        handleExportBomPdf(bom);
                      }}
                      style={{ padding: 4 }}
                    >
                      <MaterialCommunityIcons name="printer" size={17} color="#005BBB" />
                    </TouchableOpacity>
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#ADB5BD" />
                    {(profile?.role === 'ADMIN' || profile?.role === 'SUPER_ADMIN') && (`
);

// 6. Add printer icon mobile
code = code.replace(
  '<MaterialCommunityIcons name="chevron-right" size={16} color="#ADB5BD" />\n                    {(profile?.role === \'ADMIN\' || profile?.role === \'SUPER_ADMIN\') && (',
  `<TouchableOpacity
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
);

fs.writeFileSync('src/screens/ProductionScreen.tsx', code, 'utf8');
console.log('Patch applied successfully.');
