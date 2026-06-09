import * as React from 'react';
import { Alert } from 'react-native';
import { FormModal, FormInput, FormSelect, SectionTitle } from './Ui';
import { useMutation } from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { getNextCode } from '../lib/supabase';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Appelé après enregistrement réussi avec le nouvel ID fournisseur */
  onCreated?: (supplierId: string, supplierName: string) => void;
}

export function SupplierCreateModal({ visible, onClose, onCreated }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState<any>({ currency: 'MGA', active: true });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const supplierMutation = useMutation('suppliers');

  // Génère le code automatiquement à l'ouverture
  React.useEffect(() => {
    if (!visible) return;
    setForm({ currency: 'MGA', active: true });
    setError(null);
    getNextCode('FRN', 'suppliers', 'code')
      .then(code => setForm((f: any) => ({ ...f, code })))
      .catch(() => {});
  }, [visible]);

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      Alert.alert('Champs manquants', 'Code et Nom sont obligatoires.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await supplierMutation.mutateAsync(
        { values: { ...form, active: true }, type: 'INSERT' }
      );
      // INSERT avec .select() retourne un tableau
      const created = Array.isArray(result) ? result[0] : result;
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onCreated?.(created?.id ?? null, form.name);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Impossible d\'enregistrer le fournisseur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormModal
      visible={visible}
      title="Nouveau Fournisseur"
      onClose={onClose}
      onSave={handleSave}
      loading={loading}
      isError={!!error}
      errorMessage={error || undefined}
    >
      <SectionTitle>IDENTIFICATION</SectionTitle>
      <FormInput
        label="Code *"
        value={form.code || ''}
        onChangeText={(t: string) => setForm({ ...form, code: t.toUpperCase() })}
        placeholder="FRN-2025-001"
      />
      <FormInput
        label="Nom *"
        value={form.name || ''}
        onChangeText={(t: string) => setForm({ ...form, name: t })}
        placeholder="Nom du fournisseur"
      />
      <FormSelect
        label="Pays"
        value={form.country || ''}
        options={[
          { label: 'Madagascar', value: 'MG' },
          { label: 'France', value: 'FR' },
          { label: 'Chine', value: 'CN' },
          { label: 'Inde', value: 'IN' },
          { label: 'Afrique du Sud', value: 'ZA' },
          { label: 'Maurice', value: 'MU' },
          { label: 'Autre', value: 'OTHER' },
        ]}
        onSelect={(v: string) => setForm({ ...form, country: v })}
      />
      <FormSelect
        label="Devise"
        value={form.currency || 'MGA'}
        options={[
          { label: 'Ariary (MGA)', value: 'MGA' },
          { label: 'Euro (EUR)', value: 'EUR' },
          { label: 'Dollar USD', value: 'USD' },
          { label: 'Rand ZAR', value: 'ZAR' },
          { label: 'CNY (Yuan)', value: 'CNY' },
        ]}
        onSelect={(v: string) => setForm({ ...form, currency: v })}
      />

      <SectionTitle>CONTACT</SectionTitle>
      <FormInput
        label="Nom du contact"
        value={form.contact_name || ''}
        onChangeText={(t: string) => setForm({ ...form, contact_name: t })}
      />
      <FormInput
        label="Email"
        value={form.contact_email || ''}
        onChangeText={(t: string) => setForm({ ...form, contact_email: t })}
        keyboardType="email-address"
      />
      <FormInput
        label="Téléphone"
        value={form.contact_phone || ''}
        onChangeText={(t: string) => setForm({ ...form, contact_phone: t })}
        keyboardType="phone-pad"
      />
      <FormInput
        label="Délai de livraison (jours)"
        value={String(form.lead_time_days ?? '')}
        onChangeText={(t: string) => setForm({ ...form, lead_time_days: parseInt(t) || null })}
        keyboardType="number-pad"
        placeholder="Ex: 30"
      />
    </FormModal>
  );
}
