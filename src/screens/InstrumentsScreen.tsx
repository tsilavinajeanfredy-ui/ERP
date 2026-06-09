import * as React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { AnimatedPage, ActionButton, DataTable, FormModal, FormInput } from '../components/Ui';
import { useInstruments, useMutation, usePermissions, confirmAction } from '../lib/hooks';
import { useTranslation } from '../lib/i18n';

export function InstrumentsScreen() {
  const { data: instruments = [], isPending } = useInstruments();
  const mutation = useMutation('instruments');
  const { canAccessScreen, role } = usePermissions();
  const { t } = useTranslation();

  const [modalVisible, setModalVisible] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [type, setType] = React.useState('');
  const [tolerance, setTolerance] = React.useState('0.05');

  React.useEffect(() => {
    if (!editing) return;
    setCode(editing.code || '');
    setName(editing.name || '');
    setType(editing.type || '');
    setTolerance(editing.tolerance ? String(editing.tolerance) : '0.05');
  }, [editing]);

  const openCreate = () => {
    setEditing(null);
    setCode(''); setName(''); setType(''); setTolerance('0.05');
    setModalVisible(true);
  };

  const openEdit = (inst: any) => {
    setEditing(inst);
    setModalVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = { code, name, type, tolerance: parseFloat(tolerance) } as any;
      if (editing) {
        await mutation.mutateAsync({ id: editing.id, values, type: 'UPDATE' });
      } else {
        await mutation.mutateAsync({ values, type: 'INSERT' });
      }
      setModalVisible(false);
      setEditing(null);
    } catch (err: any) {
      Alert.alert('Erreur', err?.message || 'Impossible d\'enregistrer');
    }
  };

  const handleDelete = (inst: any) => {
    confirmAction(
      'Supprimer l\'instrument',
      `Voulez-vous vraiment supprimer ${inst.name} (${inst.code}) ?`,
      async () => {
        try {
          await mutation.mutateAsync({ id: inst.id, type: 'DELETE' });
        } catch (err: any) {
          Alert.alert('Erreur', err?.message || 'Échec suppression');
        }
      }
    );
  };

  const canManage = ['ADMIN', 'RQ', 'TLAB'].includes(role || '');

  const columns = [
    { key: 'code', label: t('code'), flex: 1.2 },
    { key: 'name', label: t('designation'), flex: 2 },
    { key: 'type', label: t('type'), flex: 1 },
    { key: 'next_calibration_at', label: t('next_due'), flex: 1, render: (it: any) => <Text style={{ textAlign: 'left' }}>{it.next_calibration_at ? new Date(it.next_calibration_at).toLocaleDateString('fr-FR') : '—'}</Text> },
    { key: 'tolerance', label: 'Tolérance', flex: 1, render: (it: any) => <Text style={{ textAlign: 'right', fontWeight: '700' }}>± {it.tolerance || 0.05} g</Text> },
    { key: 'actions', label: '', flex: 0.8, render: (it: any) => (
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        {canManage && (
          <ActionButton label="" icon="pencil" variant="secondary" onPress={() => openEdit(it)} />
        )}
        {canManage && (
          <ActionButton label="" icon="delete" variant="secondary" onPress={() => handleDelete(it)} />
        )}
      </View>
    ) },
  ];

  return (
    <AnimatedPage>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Instruments</Text>
          {canManage && <ActionButton label="Ajouter" icon="plus" onPress={openCreate} />}
        </View>

        <DataTable data={instruments} columns={columns} />

        <FormModal visible={modalVisible} title={editing ? 'Modifier Instrument' : 'Nouvel Instrument'} onClose={() => { setModalVisible(false); setEditing(null); }} onSave={handleSave}>
          <FormInput label="Code" value={code} onChangeText={setCode} placeholder="INS-0001" />
          <FormInput label="Désignation" value={name} onChangeText={setName} placeholder="Balance analytique" />
          <FormInput label="Type / Marque" value={type} onChangeText={setType} placeholder="Sartorius" />
          <FormInput label="Tolérance (g)" value={tolerance} onChangeText={setTolerance} keyboardType="decimal-pad" />
        </FormModal>
      </View>
    </AnimatedPage>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
});

export default InstrumentsScreen;
