/**
 * BonSignatureModal.tsx
 * Modal de triple signature électronique pour BT (Bon de Transfert) et BS (Bon de Sortie).
 * Workflow : EMETTEUR → RECEPTEUR → RESPONSABLE_STOCK
 */
import * as React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, FormModal, ActionButton } from './Ui';
import SignaturePad from './SignaturePad';
import { useMovementSignatures, useMovementSignatureStatus, useSignMovement } from '../lib/hooks/signatures';
import { useUserProfile, usePermissions } from '../lib/hooks';

type SignatureRole = 'EMETTEUR' | 'RECEPTEUR' | 'RESPONSABLE_STOCK';

const ROLE_LABELS: Record<SignatureRole, string> = {
  EMETTEUR: 'Émetteur',
  RECEPTEUR: 'Récepteur',
  RESPONSABLE_STOCK: 'Responsable Stock',
};

const ROLE_ICONS: Record<SignatureRole, string> = {
  EMETTEUR: 'account-arrow-right',
  RECEPTEUR: 'account-arrow-left',
  RESPONSABLE_STOCK: 'shield-account',
};

const ROLE_ORDER: SignatureRole[] = ['EMETTEUR', 'RECEPTEUR', 'RESPONSABLE_STOCK'];

interface BonSignatureModalProps {
  visible: boolean;
  onClose: () => void;
  movementId: string;
  movementRef: string;
  movementType: 'TRANSFERT' | 'SORTIE' | 'ENTREE';
  onComplete?: () => void; // appelé quand les 3 signatures sont obtenues
}

export function BonSignatureModal({
  visible,
  onClose,
  movementId,
  movementRef,
  movementType,
  onComplete,
}: BonSignatureModalProps) {
  const { profile } = useUserProfile();
  const { role: userRole } = usePermissions();
  const [activeRole, setActiveRole] = React.useState<SignatureRole | null>(null);
  const [sigNote, setSigNote] = React.useState('');

  const { data: signatures = [], isLoading } = useMovementSignatures(movementId);
  const { data: status } = useMovementSignatureStatus(movementId);
  const signMutation = useSignMovement();

  const signedRoles = new Set(signatures.map(s => s.role));

  // Prochaine signature à obtenir
  const nextRole = ROLE_ORDER.find(r => !signedRoles.has(r)) ?? null;

  // Rôle que l'utilisateur courant peut signer
  const canUserSign = (role: SignatureRole): boolean => {
    if (signedRoles.has(role)) return false;
    if (!profile) return false;
    switch (role) {
      case 'EMETTEUR':           return true; // tout le monde peut être émetteur
      case 'RECEPTEUR':          return signedRoles.has('EMETTEUR');
      case 'RESPONSABLE_STOCK':  return signedRoles.has('RECEPTEUR') && ['MAGA', 'ADMIN', 'SUPER_ADMIN'].includes(userRole);
    }
  };

  const handleSign = (signatureData: string) => {
    if (!activeRole || !movementId) return;
    signMutation.mutate(
      { movementId, role: activeRole, signatureData, notes: sigNote || undefined },
      {
        onSuccess: () => {
          setActiveRole(null);
          setSigNote('');
          // Vérifier si toutes les signatures sont obtenues
          if (signedRoles.size + 1 >= 3) {
            onComplete?.();
          }
        },
        onError: (err: any) => {
          Alert.alert('Erreur', err.message || 'Impossible d\'enregistrer la signature');
        },
      }
    );
  };

  const isComplete = signedRoles.size >= 3;
  const docLabel = movementType === 'TRANSFERT' ? 'BT' : movementType === 'SORTIE' ? 'BS' : 'BE';

  return (
    <FormModal
      visible={visible}
      onClose={onClose}
      onSave={() => {}}
      hideSaveButton={true}
      title={`Signatures — ${docLabel} ${movementRef}`}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 600 }}>
        {/* En-tête statut */}
        <View style={styles.statusBanner}>
          <MaterialCommunityIcons
            name={isComplete ? 'check-circle' : 'clock-outline'}
            size={20}
            color={isComplete ? C.green : C.gold}
          />
          <Text style={[styles.statusText, { color: isComplete ? C.green : C.gold }]}>
            {isComplete
              ? 'Document signé — verrouillé'
              : `${signedRoles.size}/3 signatures — en attente de ${nextRole ? ROLE_LABELS[nextRole] : '...'}`}
          </Text>
        </View>

        {/* Liste des 3 signatures */}
        {ROLE_ORDER.map((role, idx) => {
          const sig = signatures.find(s => s.role === role);
          const isSigned = !!sig;
          const isNext = nextRole === role;
          const canSign = canUserSign(role);

          return (
            <View key={role} style={[styles.sigRow, isSigned && styles.sigRowDone, isNext && !isSigned && styles.sigRowNext]}>
              {/* Numéro */}
              <View style={[styles.stepCircle, isSigned && styles.stepCircleDone]}>
                {isSigned
                  ? <MaterialCommunityIcons name="check" size={14} color="#fff" />
                  : <Text style={styles.stepNum}>{idx + 1}</Text>
                }
              </View>

              {/* Contenu */}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons
                    name={ROLE_ICONS[role] as any}
                    size={16}
                    color={isSigned ? C.green : isNext ? C.gold : C.textMuted}
                  />
                  <Text style={[styles.roleLabel, isSigned && { color: C.green }]}>
                    {ROLE_LABELS[role]}
                  </Text>
                </View>
                {isSigned && sig && (
                  <Text style={styles.sigMeta}>
                    {sig.profile?.full_name || 'Utilisateur'} — {new Date(sig.signed_at).toLocaleString('fr-FR')}
                  </Text>
                )}
                {!isSigned && isNext && (
                  <Text style={styles.sigPending}>En attente de signature</Text>
                )}
                {!isSigned && !isNext && (
                  <Text style={styles.sigLocked}>En attente de l'étape précédente</Text>
                )}
              </View>

              {/* Bouton signer */}
              {!isSigned && canSign && (
                <TouchableOpacity
                  style={styles.signBtn}
                  onPress={() => setActiveRole(role)}
                >
                  <MaterialCommunityIcons name="draw" size={14} color="#fff" />
                  <Text style={styles.signBtnText}>Signer</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}

        {/* Zone de signature active */}
        {activeRole && !signMutation.isPending && (
          <View style={styles.padContainer}>
            <Text style={styles.padTitle}>
              Signature : {ROLE_LABELS[activeRole]}
            </Text>
            <Text style={styles.padHint}>Dessinez votre signature dans le cadre ci-dessous</Text>
            <View style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, overflow: 'hidden', height: 200 }}>
              <SignaturePad
                onOK={handleSign}
                onEmpty={() => {}}
                confirmText="Valider la signature"
                clearText="Effacer"
              />
            </View>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setActiveRole(null)}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        )}

        {signMutation.isPending && (
          <View style={{ alignItems: 'center', padding: 20 }}>
            <ActivityIndicator color={C.primary} />
            <Text style={{ color: C.textMuted, marginTop: 8 }}>Enregistrement de la signature...</Text>
          </View>
        )}

        {isLoading && !signatures.length && (
          <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
        )}

        {/* Résumé si complet */}
        {isComplete && (
          <View style={styles.completeBanner}>
            <MaterialCommunityIcons name="lock-check" size={20} color={C.green} />
            <Text style={styles.completeText}>
              Document verrouillé — PDF peut être généré avec les 3 signatures
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={{ marginTop: 8 }}>
        <ActionButton
          icon="close"
          label="Fermer"
          color={C.textMuted}
          onPress={onClose}
        />
      </View>
    </FormModal>
  );
}

const styles = StyleSheet.create({
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sigRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  sigRowDone: {
    backgroundColor: '#F0FFF4',
    borderColor: '#86EFAC',
  },
  sigRowNext: {
    borderColor: C.gold,
    backgroundColor: '#FFFBEB',
  },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E9ECEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleDone: {
    backgroundColor: C.green,
  },
  stepNum: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6C757D',
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212529',
  },
  sigMeta: {
    fontSize: 11,
    color: C.green,
    marginTop: 2,
  },
  sigPending: {
    fontSize: 11,
    color: C.gold,
    marginTop: 2,
  },
  sigLocked: {
    fontSize: 11,
    color: '#ADB5BD',
    marginTop: 2,
  },
  signBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 7,
  },
  signBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  padContainer: {
    marginTop: 12,
    padding: 14,
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  padTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212529',
    marginBottom: 4,
  },
  padHint: {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: 10,
  },
  cancelBtn: {
    marginTop: 10,
    alignItems: 'center',
    padding: 10,
  },
  cancelBtnText: {
    color: C.textMuted,
    fontSize: 13,
  },
  completeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FFF4',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  completeText: {
    fontSize: 13,
    color: C.green,
    flex: 1,
  },
});
