import * as React from 'react';
import { View, StyleSheet, Text, Modal, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { pickSpreadsheet } from '../lib/filePicker';
import Papa from 'papaparse';
import { C, ActionButton } from './Ui';
import { supabase } from '../lib/supabase';

interface CsvImportModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  type: 'mp' | 'pf' | 'suppliers' | 'depots';
}

export function CsvImportModal({ visible, onClose, onSuccess, type }: CsvImportModalProps) {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<any[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);

  const handlePickFile = async () => {
    try {
      const file = await pickSpreadsheet();
      if (!file) return;

      const response = await fetch(file.uri);
      const csvString = await response.text();

      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setHeaders(results.meta.fields || []);
          setData(results.data);
        },
        error: (err: any) => {
          Alert.alert('Erreur', 'Impossible de lire le fichier CSV: ' + err.message);
        }
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la sélection du fichier.');
    }
  };

  const handleImport = async () => {
    if (data.length === 0) return;

    setLoading(true);
    try {
      // Mapping technique selon le type
      const table = (type === 'mp' || type === 'pf') ? 'articles' : type === 'suppliers' ? 'suppliers' : 'depots';
      
      // Préparation des données (on s'assure que les colonnes matchent la DB)
      // On force article_type selon l'onglet courant
      const processed = data.map(item => {
        const clean: any = { ...item };
        if (type === 'mp') clean.article_type = 'MP';
        if (type === 'pf') clean.article_type = 'PF';
        if (clean.active === undefined) clean.active = true;
        return clean;
      });

      const { error } = await (supabase as any)
        .from(table)
        .upsert(processed, { onConflict: 'code' });

      if (error) throw error;

      Alert.alert('Succès', `${data.length} enregistrements importés avec succès.`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error(error);
      Alert.alert('Erreur Import', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={s.overlay}>
        <View style={s.modal}>
          <View style={s.header}>
            <Text style={s.title}>Importation CSV ({type === 'mp' ? 'Matières Premières' : type === 'pf' ? 'Produits Finis' : type})</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.content}>
            {data.length === 0 ? (
              <View style={s.empty}>
                <MaterialCommunityIcons name="file-excel-outline" size={48} color={C.info} />
                <Text style={s.hint}>Sélectionnez un fichier CSV avec les colonnes :</Text>
                <Text style={s.columns}>
                  {(type === 'mp' || type === 'pf') 
                    ? 'code, name, family, unit, brand' 
                    : 'code, name, country, currency'}
                </Text>
                <ActionButton 
                  label="Choisir un fichier" 
                  icon="file-upload" 
                  onPress={handlePickFile} 
                  variant="primary" 
                />
              </View>
            ) : (
              <View>
                <Text style={s.previewTitle}>Aperçu ({data.length} lignes)</Text>
                <View style={s.previewTable}>
                  <View style={s.tableHeader}>
                    {headers.slice(0, 4).map(h => (
                      <Text key={h} style={s.headerCell}>{h}</Text>
                    ))}
                  </View>
                  {data.slice(0, 5).map((row, i) => (
                    <View key={i} style={s.tableRow}>
                      {headers.slice(0, 4).map(h => (
                        <Text key={h} style={s.cell} numberOfLines={1}>{row[h]}</Text>
                      ))}
                    </View>
                  ))}
                  {data.length > 5 && <Text style={s.more}>+ {data.length - 5} autres lignes...</Text>}
                </View>

                <View style={s.actions}>
                  <ActionButton 
                    label="Recommencer" 
                    onPress={() => setData([])} 
                    variant="secondary" 
                  />
                  <ActionButton 
                    label={loading ? "Importation..." : "Confirmer l'import"} 
                    icon={loading ? undefined : "check-circle"} 
                    onPress={handleImport} 
                    variant="primary" 
                    loading={loading}
                  />
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: '90%', maxWidth: 600, maxHeight: '80%', backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  title: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  content: { padding: 20 },
  empty: { alignItems: 'center', gap: 16, paddingVertical: 40 },
  hint: { fontSize: 14, color: '#666', textAlign: 'center' },
  columns: { fontSize: 12, color: C.info, fontWeight: '700', backgroundColor: '#F0F7FF', padding: 10, borderRadius: 8, textAlign: 'center' },
  previewTitle: { fontSize: 14, fontWeight: '700', marginBottom: 12, color: '#444' },
  previewTable: { borderWidth: 1, borderColor: '#EEE', borderRadius: 8, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#F8F9FA', padding: 8 },
  headerCell: { flex: 1, fontSize: 11, fontWeight: '800', color: '#666' },
  tableRow: { flexDirection: 'row', padding: 8, borderTopWidth: 1, borderTopColor: '#EEE' },
  cell: { flex: 1, fontSize: 11, color: '#444' },
  more: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 10, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 24, borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 20 },
});
