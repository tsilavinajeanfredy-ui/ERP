import * as React from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, ActionButton, AnimatedPage, FormModal } from '../components/Ui';
import { useDocuments } from '../lib/hooks';

export function DocumentsScreen() {
  const { data: documents = [], isPending: loading } = useDocuments();
  const [uploadModalVisible, setUploadModalVisible] = React.useState(false);

  const DOCUMENT_CATEGORIES = [
    { label: 'Contrat', value: 'CONTRAT' },
    { label: 'Certificat', value: 'CERTIFICAT' },
    { label: 'Fiche technique', value: 'FICHE_TECHNIQUE' },
    { label: 'Devis', value: 'DEVIS' },
    { label: 'Facture', value: 'FACTURE' },
    { label: 'Rapport', value: 'RAPPORT' },
  ];

  return (
    <AnimatedPage>
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={s.header}>
          <View>
            <Text style={s.title}>Gestion documentaire</Text>
            <Text style={s.subTitle}>Documents · Contrats · Certificats · Fiches techniques</Text>
          </View>
          <ActionButton label="Uploader" icon="upload" onPress={() => setUploadModalVisible(true)} variant="primary" />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={C.green} />
        ) : documents.length === 0 ? (
          <View style={{ padding: 60, alignItems: 'center' }}>
            <MaterialCommunityIcons name="file-document-outline" size={64} color="#E9ECEF" />
            <Text style={{ marginTop: 16, color: '#888', fontSize: 14 }}>Aucun document. Cliquez sur "Uploader" pour ajouter.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {DOCUMENT_CATEGORIES.map(cat => {
              const catDocs = documents.filter((d: any) => d.category === cat.value);
              if (catDocs.length === 0) return null;
              return (
                <View key={cat.value} style={s.sectionCard}>
                  <Text style={s.sectionTitle}>{cat.label} ({catDocs.length})</Text>
                  {catDocs.map((doc: any) => (
                    <View key={doc.id} style={s.docItem}>
                      <MaterialCommunityIcons name="file-outline" size={20} color={C.info} />
                      <View style={{ flex: 1 }}>
                        <Text style={s.docName}>{doc.name}</Text>
                        <Text style={s.docMeta}>
                          {doc.mime_type || '—'} · {(doc.file_size / 1024).toFixed(0)} KB
                        </Text>
                      </View>
                      <TouchableOpacity>
                        <MaterialCommunityIcons name="download" size={20} color="#6C757D" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <FormModal
        visible={uploadModalVisible}
        title="Uploader un document"
        onClose={() => setUploadModalVisible(false)}
        onSave={() => setUploadModalVisible(false)}
        hideSaveButton
      >
        <Text style={{ fontSize: 13, color: '#6C757D', textAlign: 'center', padding: 20 }}>
          Fonctionnalité d'upload disponible via le sélecteur de fichiers natif.
        </Text>
      </FormModal>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 2 },
  grid: { gap: 16 },
  sectionCard: { backgroundColor: '#FFF', borderRadius: 8, borderWidth: 1, borderColor: '#E9ECEF', padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#495057', marginBottom: 12, letterSpacing: 0.5 },
  docItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  docName: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  docMeta: { fontSize: 11, color: '#ADB5BD', marginTop: 1 },
});
