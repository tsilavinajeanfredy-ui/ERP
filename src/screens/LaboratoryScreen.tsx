import * as React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  Alert,
  TextInput,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  C,
  KpiCard,
  ActionButton,
  AnimatedPage,
  FormModal,
  FormInput,
  FormSelect,
  SectionTitle,
  ExportOverlay,
  PaginationControls,
} from '../components';
import {
  useInstruments,
  useFcqDossiers,
  useUserProfile,
  useMutation,
  useNotification,
  useLots,
  usePermissions,
  useQcSpecifications,
  useCalibrationLog,
  useDepots,
} from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '../lib/i18n';
import { playNotificationSound } from '../lib/notificationSound';
import { generatePdf, getPdfTemplate } from '../lib/pdf';
import { supabase } from '../lib/supabase';
import { N } from '../lib/notifIcons';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  EN_ATTENTE: { label: 'En attente', color: C.gold },
  EN_COURS: { label: 'En cours', color: C.info },
  COMPLET: { label: 'Complet', color: C.warn },
  VALIDE: { label: 'Validé', color: C.ok },
};

const EMPTY_ARRAY: any[] = [];

// ─── Paramètres d'analyse par défaut (standards laboratoire) ─────────────────
// Ces paramètres sont pré-chargés quand aucune spec QC n'est définie pour l'article
const DEFAULT_ANALYSIS_PARAMS: Array<{ name: string; unit: string; group: string }> = [
  // Physico-chimique savon
  { name: 'TFM', unit: '%', group: 'Savon' },
  { name: 'Humidité', unit: '%', group: 'Général' },
  { name: 'pH', unit: '', group: 'Général' },
  { name: 'NaCl', unit: '%', group: 'Savon' },
  { name: 'NaOH libre', unit: '%', group: 'Savon' },
  { name: 'Matière active', unit: '%', group: 'Savon' },
  { name: 'Graisse libre', unit: '%', group: 'Savon' },
  { name: 'Dureté', unit: '°f', group: 'Eau' },
  { name: 'Température', unit: '°C', group: 'Général' },
  { name: 'Densité', unit: 'g/cm³', group: 'Général' },
  { name: 'Couleur', unit: '', group: 'Général' },
  { name: 'Odeur', unit: '', group: 'Général' },
  // Physicochimique huile/gras
  { name: "Indice d'acide", unit: 'mg KOH/g', group: 'Huile/Gras' },
  { name: 'Indice de peroxyde', unit: 'meq/kg', group: 'Huile/Gras' },
  { name: 'Alcalinité libre', unit: '%', group: 'Huile/Gras' },
  { name: 'Insaponifiable', unit: '%', group: 'Huile/Gras' },
  { name: 'Point de fusion', unit: '°C', group: 'Huile/Gras' },
  // Microbiologie
  { name: 'Flore aérobie totale', unit: 'UFC/g', group: 'Microbiologie' },
  { name: 'Coliformes totaux', unit: 'UFC/g', group: 'Microbiologie' },
  { name: 'Salmonelles', unit: '/25g', group: 'Microbiologie' },
  { name: 'Levures et moisissures', unit: 'UFC/g', group: 'Microbiologie' },
  // Mécanique / emballage
  { name: 'Poids net', unit: 'g', group: 'Emballage' },
  { name: 'Résistance à la compression', unit: 'N', group: 'Emballage' },
  { name: 'Épaisseur film', unit: 'µm', group: 'Emballage' },
];

// ─── Types d'analyse prédéfinis (saisie manuelle rapide) ─────────────────────
const ANALYSIS_TYPE_PRESETS: Array<{ label: string; icon: string; params: string[] }> = [
  {
    label: 'Physico-chimique savon',
    icon: 'flask-outline',
    params: ['TFM', 'Humidité', 'pH', 'NaCl', 'NaOH libre'],
  },
  {
    label: 'Physico-chimique huile/gras',
    icon: 'oil',
    params: ['Alcalinité libre', "Indice d'acide", 'Indice de peroxyde', "Taux d'humidité", 'TFM'],
  },
  {
    label: 'Microbiologique',
    icon: 'bacteria-outline',
    params: ['Flore aérobie totale', 'Coliformes totaux', 'Salmonelles', 'Levures et moisissures'],
  },
  {
    label: 'Organoleptique',
    icon: 'eye-outline',
    params: ['Couleur', 'Odeur', 'Texture', 'Aspect visuel'],
  },
  {
    label: 'Emballage / Conditionnement',
    icon: 'package-variant',
    params: ['Poids net', 'Résistance à la compression', 'Épaisseur film', 'Fermeture étanche'],
  },
  {
    label: 'Eau de process',
    icon: 'water-outline',
    params: ['pH', 'Dureté', 'Température', 'Conductivité', 'Turbidité'],
  },
];

// Paramètres affichés par défaut (sous-ensemble prioritaire)
const DEFAULT_VISIBLE_PARAM_NAMES = ['TFM', 'Humidité', 'pH', 'NaCl'];

const buildFreeKey = (name: string) => `__free__${name}`;
const extractParamName = (key: string) => key.replace(/^__free__/, '');
const FREE_NORM_PREFIX = '__freenorm__';

const appendPresetParams = (
  existing: Array<{
    key: string;
    name: string;
    unit: string;
    value: string;
    isDefault: boolean;
    norm?: string;
  }>,
  presetNames: string[],
) => {
  const known = new Set(existing.map((p) => p.name.trim().toLowerCase()));
  const toAdd = presetNames
    .filter((pName) => !known.has(pName.trim().toLowerCase()))
    .map((pName) => {
      const defP = DEFAULT_ANALYSIS_PARAMS.find((p) => p.name === pName);
      return {
        key: buildFreeKey(pName),
        name: pName,
        unit: defP?.unit ?? '',
        value: '',
        isDefault: !!defP,
        norm: '',
      };
    });
  return [...existing, ...toAdd];
};

export function LaboratoryScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 992;
  const { profile } = useUserProfile();
  const notify = useNotification();
  const { t } = useTranslation();
  const [page, setPage] = React.useState(0);
  const limit = 20;

  const { data: instruments = EMPTY_ARRAY, isPending: instLoading } = useInstruments();
  const {
    data: dossiers = EMPTY_ARRAY,
    count: dossiersCount,
    isPending: dossLoading,
  } = useFcqDossiers(page, limit);
  const { data: lots = EMPTY_ARRAY } = useLots(0, 100, 'QUARANTAINE');
  const { data: depots = [] } = useDepots();
  const [selId, setSelId] = React.useState<string | null>(null);

  const [modalVisible, setModalVisible] = React.useState(false);
  const [formData, setFormData] = React.useState<any>({});

  // État local pour la saisie des résultats techniques
  const [results, setResults] = React.useState<Record<string, string>>({});
  // État local pour les paramètres libres (quand aucune spec n'est définie)
  const [freeParams, setFreeParams] = React.useState<
    Array<{
      key: string;
      name: string;
      unit: string;
      value: string;
      isDefault: boolean;
      norm?: string;
    }>
  >([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
  const [calibModalVisible, setCalibModalVisible] = React.useState(false);
  const [calibFormData, setCalibFormData] = React.useState<any>({});
  const { data: calibLog = [] } = useCalibrationLog();
  const calibMutation = useMutation('calibration_log', () => setCalibModalVisible(false));

  const queryClient = useQueryClient();
  const mutation = useMutation('fcq_dossiers', () => setModalVisible(false));
  const lotMutation = useMutation('lots');

  // États locaux pour la prise de décision RQ (Module CQ-LIB)
  const [controlledQty, setControlledQty] = React.useState('');
  const [decisionMotive, setDecisionMotive] = React.useState('');
  const [rqObservation, setRqObservation] = React.useState('');
  const [controllerName, setControllerName] = React.useState('');

  // ⚠️ Ces hooks DOIVENT être appelés AVANT tout return conditionnel (Rules of Hooks)
  // La dérivation de specRef depuis dossiers/selId est faite ici de manière stable
  const dossier = dossiers.find((d: any) => d.id === selId);
  const specRef = dossier?.lot?.article?.spec_ref;
  const { data: specs = EMPTY_ARRAY, isPending: specsLoading } = useQcSpecifications(
    specRef || undefined,
  );

  // Mise à jour des résultats lors de la sélection d'un dossier
  // ⚠️ Ne PAS mettre `dossiers` en dépendance — cela crée une boucle infinie
  // car TanStack Query retourne un nouveau tableau à chaque refetch.
  // On utilise uniquement selId + la valeur stable dossier.results.
  const dossierResultsJson = dossier ? JSON.stringify(dossier.results) : null;
  React.useEffect(() => {
    if (dossier && dossier.results) {
      setResults(dossier.results);
      // Restaurer les paramètres libres si stockés dans results sous clé __free__*
      const free: Array<{
        key: string;
        name: string;
        unit: string;
        value: string;
        isDefault: boolean;
        norm?: string;
      }> = [];
      Object.entries(dossier.results).forEach(([k, v]) => {
        if (k.startsWith('__free__')) {
          const name = extractParamName(k);
          const defParam = DEFAULT_ANALYSIS_PARAMS.find((p) => p.name === name);
          const normKey = `__freenorm__${name}`;
          const normValue = dossier.results[normKey] || '';
          free.push({
            key: k,
            name,
            unit: defParam?.unit ?? '',
            value: String(v),
            isDefault: !!defParam,
            norm: String(normValue),
          });
        }
      });
      if (free.length > 0) setFreeParams(free);
      else setFreeParams([]);
    } else {
      setResults({});
      setFreeParams([]);
    }
  }, [selId, dossierResultsJson]);

  // Auto-initialiser les paramètres par défaut quand les specs sont chargées et vides
  // et que le dossier n'a pas encore de résultats sauvegardés
  React.useEffect(() => {
    if (!dossier || dossier.status === 'VALIDE') return;
    if (specsLoading) return;
    if (specs.length > 0) return; // Les specs QC définissent les paramètres

    // Ne réinitialiser que si aucun paramètre libre n'existe déjà (sauvegardé ou local)
    const hasSavedFree = Object.keys(dossier.results || {}).some((k) => k.startsWith('__free__'));
    if (hasSavedFree) return; // Déjà des paramètres sauvegardés → ne pas écraser
    if (freeParams.length > 0) return; // Déjà initialisés localement

    // Initialiser avec les paramètres par défaut visibles
    const defaults = DEFAULT_ANALYSIS_PARAMS.filter((p) =>
      DEFAULT_VISIBLE_PARAM_NAMES.includes(p.name),
    ).map((p) => ({
      key: buildFreeKey(p.name),
      name: p.name,
      unit: p.unit,
      value: '',
      isDefault: true,
    }));
    setFreeParams(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dossier?.id, dossier?.status, specsLoading, specs.length]);

  // Synchronisation des états de décision avec les données du dossier sélectionné
  React.useEffect(() => {
    if (dossier) {
      setControlledQty(
        dossier.quantite_controlee
          ? dossier.quantite_controlee.toString()
          : dossier.lot?.qty_received
            ? dossier.lot.qty_received.toString()
            : '',
      );
      setDecisionMotive(dossier.motif_decision || '');
      setRqObservation(dossier.observation_rq || '');
      setControllerName(dossier.controleur_nom || profile?.full_name || '');
    } else {
      setControlledQty('');
      setDecisionMotive('');
      setRqObservation('');
      setControllerName('');
    }
  }, [selId, dossier?.id, profile?.full_name]);

  // ─── Rappels automatiques étalonnage ────────────────────────────────────────
  // Envoi de notifications in-app dès le chargement si des instruments approchent de l'échéance
  React.useEffect(() => {
    if (!supabase || instruments.length === 0 || !profile?.id) return;
    const today = new Date();

    const toNotify = instruments.filter((inst) => {
      if (!inst.next_calibration_at) return false;
      const next = new Date(inst.next_calibration_at);
      const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 86400));
      // Rappel à J-30, J-15, J-7, J-3, J-0 (échu)
      return diffDays <= 30;
    });

    if (toNotify.length === 0) return;

    (async () => {
      for (const inst of toNotify) {
        const next = new Date(inst.next_calibration_at!);
        const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 86400));
        const isOverdue = diffDays < 0;
        const rolesToNotify = ['TLAB', 'RQ'];

        // Éviter doublon : vérifier si une notif similaire a déjà été envoyée aujourd'hui
        const todayStr = today.toISOString().split('T')[0];
        const { data: existing } = await supabase!
          .from('notifications')
          .select('id')
          .eq('metadata->>instrument_id', inst.id)
          .eq('metadata->>notif_date', todayStr)
          .maybeSingle();
        if (existing) continue; // déjà notifié aujourd'hui pour cet instrument

        for (const role of rolesToNotify) {
          await supabase!.from('notifications').insert({
            role,
            title: isOverdue
              ? `[LABO] ⚠ Instrument échu : ${inst.code}`
              : `[LABO] Étalonnage à planifier : ${inst.code}`,
            message: isOverdue
              ? `L'instrument "${inst.name}" (${inst.code}) est ÉCHU depuis ${Math.abs(diffDays)} jour(s). Saisie FCQ bloquée selon règle §4.5.`
              : `L'instrument "${inst.name}" (${inst.code}) doit être étalonné dans ${diffDays} jour(s) (échéance : ${next.toLocaleDateString('fr-FR')}).`,
            type: isOverdue ? 'error' : diffDays <= 7 ? 'warning' : 'info',
            metadata: {
              category: 'QUALITY',
              screen: 'LaboratoryScreen',
              instrument_id: inst.id,
              notif_date: todayStr,
            },
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instruments.length, profile?.id]);

  const { canPerformAction } = usePermissions();
  const canValidate = canPerformAction('validate_fcq');
  const canCreateFcq = canPerformAction('create_fcq');

  const instOkCount = instruments.filter((i) => i.status === 'ETALONNE').length;

  const [decisionFilter, setDecisionFilter] = React.useState<'ALL' | 'EN_ATTENTE' | 'LIBERE' | 'BLOQUE'>('EN_ATTENTE');
  const filteredDossiers = React.useMemo(() => {
    if (decisionFilter === 'ALL') return dossiers;
    if (decisionFilter === 'EN_ATTENTE') {
      return dossiers.filter((d: any) => {
        const dec = String(d.decision || '').toUpperCase();
        return dec === '' || dec === 'EN_ATTENTE' || dec === 'NULL';
      });
    }
    return dossiers.filter((d: any) => String(d.decision || '').toUpperCase() === decisionFilter);
  }, [dossiers, decisionFilter]);

  // ─── Garde de chargement (après tous les hooks) ─────────────────────────────────
  if (instLoading || dossLoading) {
    return (
      <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={C.green} />
      </View>
    );
  }

  const handleAdd = () => {
    // Règle §10.3.8 : Vérifier si des instruments sont opérationnels avant de commencer
    const operationalInstruments = instruments.filter((i) => i.status === 'ETALONNE');
    if (operationalInstruments.length === 0) {
      Alert.alert(
        'Accès Bloqué',
        "Aucun instrument n'est à jour d'étalonnage. Saisie FCQ impossible (Règle §4.5).",
      );
      return;
    }

    const year = new Date().getFullYear();
    const count = dossiers.length + 1;
    const generatedCode = `FCQ-${year}-${count.toString().padStart(4, '0')}`;

    setFormData({
      code: generatedCode,
      status: 'EN_ATTENTE',
      created_at: new Date().toISOString(),
    });
    setModalVisible(true);
  };

  const handleSave = () => {
    if (!formData.code || !formData.lot_id) return;
    mutation.mutate({ values: formData, type: 'INSERT' });
    notify.mutate({
      to_role: 'ADMIN',
      subject: 'Nouveau dossier FCQ créé',
      message: `Un nouveau dossier qualité laboratoire a été créé${profile?.full_name ? ' par ' + profile.full_name : ''}.`,
      type: 'internal',
      category: 'QUALITY',
      metadata: { category: 'QUALITY', screen: 'Laboratory' },
    });
  };

  // Sauvegarder les résultats en brouillon sans changer le statut
  const handleSaveDraft = () => {
    if (!dossier) return;
    const merged = { ...(dossier.results || {}), ...results };
    mutation.mutate({
      id: dossier.id,
      values: { results: merged },
      type: 'UPDATE',
    });
  };

  const handleCompleteAnalysis = () => {
    if (!dossier) return;

    // Règle §4.5 : Bloquer si l'instrument utilisé n'est plus conforme
    const inst = instruments.find((i) => i.id === dossier.instrument_id);
    if (inst && inst.status !== 'ETALONNE') {
      Alert.alert(
        'Conformité',
        "L'instrument utilisé est hors période d'étalonnage. Résultats non validables.",
      );
      return;
    }

    // Fusionner les résultats existants + les valeurs locales pour ne rien perdre
    const merged = { ...(dossier.results || {}), ...results };
    mutation.mutate({
      id: dossier.id,
      values: {
        status: 'COMPLET',
        results: merged,
      },
      type: 'UPDATE',
    });
  };

  const renderResultInput = (spec: any) => {
    // Priorité de lecture (du plus frais au plus ancien) :
    // 1. State local results (saisie en cours)
    // 2. dossier.results tel que retourné par Supabase (après save)
    // Cela garantit que les valeurs restent visibles après libération/blocage.
    const savedVal = dossier?.results?.[spec.id];
    const localVal = results[spec.id];
    const rawVal =
      localVal !== undefined && localVal !== ''
        ? localVal
        : savedVal !== undefined && savedVal !== null && savedVal !== ''
          ? String(savedVal)
          : undefined;

    const val = parseFloat(rawVal || '0');
    const isOut =
      rawVal !== undefined && rawVal !== '' && (val < spec.min_value || val > spec.max_value);
    const isEmpty = rawVal === undefined || rawVal === '';
    const isReadOnly = dossier?.status === 'VALIDE';

    // Placeholder descriptif : indique la fourchette cible pour guider le technicien
    const hintPlaceholder = `ex: ${((spec.min_value + spec.max_value) / 2).toFixed(4)}`;

    return (
      <View key={spec.id} style={s.resRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.resLabel}>
            {spec.parameter_name} ({spec.unit})
          </Text>
          <Text style={s.resSpec}>
            {t('target')}: {spec.min_value.toFixed(3)} - {spec.max_value.toFixed(3)}
          </Text>
        </View>
        {isReadOnly ? (
          <View
            style={[
              s.resInput,
              {
                justifyContent: 'center',
                backgroundColor: isEmpty ? '#F8F9FA' : isOut ? '#FFF5F5' : '#F0FFF4',
                borderColor: isEmpty ? '#D1D9E0' : isOut ? C.err : C.ok,
              },
            ]}
          >
            <Text
              style={{
                textAlign: 'right',
                fontWeight: '800',
                fontSize: 14,
                color: isEmpty ? '#ADB5BD' : isOut ? C.err : '#15803D',
              }}
            >
              {isEmpty ? '—' : `${rawVal}`}
            </Text>
          </View>
        ) : (
          <TextInput
            style={[s.resInput, isOut && s.resInputError, isEmpty && { borderColor: '#C0CAD4' }]}
            value={rawVal ?? ''}
            onChangeText={(t) => setResults({ ...results, [spec.id]: t })}
            keyboardType="numeric"
            placeholder={hintPlaceholder}
            placeholderTextColor="#AAB4BE"
            editable={true}
          />
        )}
        <View style={s.resStatus}>
          <MaterialCommunityIcons
            name={isOut ? 'alert-circle' : !isEmpty ? 'check-circle' : 'circle-outline'}
            size={20}
            color={isOut ? C.err : !isEmpty ? C.ok : C.textMuted}
          />
        </View>
      </View>
    );
  };

  const renderFreeParamsEditor = () => (
    <>
      {/* En-tête de colonne */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 4, marginBottom: 4, gap: 8 }}>
        <Text
          style={{ flex: 1, fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5 }}
        >
          PARAMÈTRE
        </Text>
        <Text
          style={{
            width: 90,
            fontSize: 10,
            fontWeight: '800',
            color: '#9CA3AF',
            letterSpacing: 0.5,
            textAlign: 'center',
          }}
        >
          VALEUR
        </Text>
        <Text
          style={{
            width: 44,
            fontSize: 10,
            fontWeight: '800',
            color: '#9CA3AF',
            letterSpacing: 0.5,
            textAlign: 'center',
          }}
        >
          UNITÉ
        </Text>
        <View style={{ width: 28 }} />
      </View>

      {/* Lignes de paramètres */}
      {freeParams.map((param, idx) => {
        const isReadOnly = dossier?.status === 'VALIDE';
        const hasValue = param.value !== '';
        return (
          <View
            key={param.key}
            style={[
              s.resRow,
              {
                marginBottom: 6,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: hasValue ? '#F0FFF4' : '#FAFAFA',
                borderLeftWidth: 3,
                borderLeftColor: hasValue ? C.ok : param.isDefault ? C.info : '#E5E7EB',
                borderRadius: 6,
                paddingHorizontal: 10,
                paddingVertical: 8,
              },
            ]}
          >
            {/* Nom du paramètre */}
            <View style={{ flex: 1 }}>
              {isReadOnly || param.isDefault ? (
                <View style={{ flexDirection: 'column', gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {param.isDefault && (
                      <View
                        style={{
                          backgroundColor: '#EEF2FF',
                          paddingHorizontal: 5,
                          paddingVertical: 2,
                          borderRadius: 4,
                        }}
                      >
                        <Text style={{ fontSize: 9, fontWeight: '700', color: C.info }}>STD</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#1A1A1A' }}>
                      {param.name}
                    </Text>
                  </View>
                  {isReadOnly ? (
                    param.norm ? (
                      <Text style={{ fontSize: 11, color: '#6B7280', fontStyle: 'italic' }}>
                        Norme: {param.norm}
                      </Text>
                    ) : null
                  ) : (
                    <TextInput
                      style={{
                        fontSize: 11,
                        color: '#6B7280',
                        fontStyle: 'italic',
                        paddingVertical: 0,
                        marginTop: 2,
                        borderBottomWidth: 1,
                        borderBottomColor: '#E5E7EB',
                      }}
                      value={param.norm || ''}
                      onChangeText={(txt) => {
                        const updated = [...freeParams];
                        updated[idx] = { ...updated[idx], norm: txt };
                        setFreeParams(updated);
                        const newResults = { ...results };
                        newResults[`__freenorm__${param.name}`] = txt;
                        setResults(newResults);
                      }}
                      placeholder={(() => {
                        const matchSpec = specs.find((sp) => sp.parameter_name === param.name);
                        return matchSpec
                          ? `${matchSpec.min_value} – ${matchSpec.max_value}${matchSpec.unit ? ' ' + matchSpec.unit : ''}`
                          : 'Norme (min – max)';
                      })()}
                      placeholderTextColor="#AAB4BE"
                    />
                  )}
                </View>
              ) : (
                <View style={{ flexDirection: 'column', gap: 2 }}>
                  <TextInput
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: '#1A1A1A',
                      borderBottomWidth: 1,
                      borderBottomColor: '#D1D9E0',
                      paddingVertical: 2,
                    }}
                    value={param.name ?? ''}
                    onChangeText={(txt) => {
                      const newKey = buildFreeKey(txt || `param_${idx}`);
                      const updated = [...freeParams];
                      const oldName = updated[idx].name;
                      updated[idx] = { ...updated[idx], name: txt, key: newKey };
                      setFreeParams(updated);
                      const newResults = { ...results };
                      delete newResults[param.key];
                      delete newResults[`__freenorm__${oldName}`];
                      newResults[newKey] = param.value;
                      if (param.norm) newResults[`__freenorm__${txt}`] = param.norm;
                      setResults(newResults);
                    }}
                    placeholder="Nom du paramètre"
                    placeholderTextColor="#AAB4BE"
                  />
                  <TextInput
                    style={{
                      fontSize: 11,
                      color: '#6B7280',
                      fontStyle: 'italic',
                      paddingVertical: 0,
                      marginTop: 2,
                      borderBottomWidth: 1,
                      borderBottomColor: '#E5E7EB',
                    }}
                    value={param.norm || ''}
                    onChangeText={(txt) => {
                      const updated = [...freeParams];
                      updated[idx] = { ...updated[idx], norm: txt };
                      setFreeParams(updated);
                      const newResults = { ...results };
                      newResults[`__freenorm__${param.name}`] = txt;
                      setResults(newResults);
                    }}
                    placeholder={(() => {
                      const matchSpec = specs.find((sp) => sp.parameter_name === param.name);
                      return matchSpec
                        ? `${matchSpec.min_value} – ${matchSpec.max_value}${matchSpec.unit ? ' ' + matchSpec.unit : ''}`
                        : 'Norme (min – max)';
                    })()}
                    placeholderTextColor="#AAB4BE"
                  />
                </View>
              )}
            </View>

            {/* Valeur */}
            {isReadOnly ? (
              <View
                style={[
                  s.resInput,
                  {
                    justifyContent: 'center',
                    backgroundColor: hasValue ? '#F0FFF4' : '#F8F9FA',
                    borderColor: hasValue ? C.ok : '#D1D9E0',
                    width: 90,
                  },
                ]}
              >
                <Text
                  style={{
                    textAlign: 'right',
                    fontWeight: '800',
                    fontSize: 14,
                    color: hasValue ? '#15803D' : '#ADB5BD',
                  }}
                >
                  {param.value || '—'}
                </Text>
              </View>
            ) : (
              <TextInput
                style={[s.resInput, { borderColor: hasValue ? C.ok : '#D1D9E0', width: 90 }]}
                value={param.value ?? ''}
                onChangeText={(txt) => {
                  const updated = [...freeParams];
                  updated[idx] = { ...updated[idx], value: txt };
                  setFreeParams(updated);
                  setResults({ ...results, [param.key]: txt });
                }}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#AAB4BE"
              />
            )}

            {/* Unité */}
            <View style={{ width: 44, alignItems: 'center' }}>
              <Text style={{ fontSize: 12, color: '#6C757D', fontWeight: '600' }}>
                {(param as any).unit || ''}
              </Text>
            </View>

            {/* Supprimer (seulement pour les paramètres non-standard, non-validé) */}
            {!isReadOnly && !param.isDefault ? (
              <TouchableOpacity
                onPress={() => {
                  const updated = freeParams.filter((_, i) => i !== idx);
                  setFreeParams(updated);
                  const newResults = { ...results };
                  delete newResults[param.key];
                  setResults(newResults);
                }}
                style={{ padding: 4, width: 28, alignItems: 'center' }}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={18} color={C.err} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 28, alignItems: 'center' }}>
                <MaterialCommunityIcons
                  name={hasValue ? 'check-circle' : 'circle-outline'}
                  size={18}
                  color={hasValue ? C.ok : '#D1D9E0'}
                />
              </View>
            )}
          </View>
        );
      })}

      {/* Séparateur + ajout de paramètres additionnels */}
      {dossier?.status !== 'VALIDE' && (
        <View style={{ marginTop: 12, gap: 8 }}>
          {/* Chargement rapide par type d'analyse */}
          <View
            style={{
              backgroundColor: '#F0F9FF',
              borderRadius: 8,
              padding: 10,
              marginBottom: 4,
              borderLeftWidth: 3,
              borderLeftColor: '#0284C7',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#0284C7', marginBottom: 8 }}>
              CHARGER UN TYPE D'ANALYSE
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ANALYSIS_TYPE_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.label}
                  onPress={() => {
                    const toAdd = preset.params
                      .filter((pName) => !freeParams.some((fp) => fp.name === pName))
                      .map((pName) => {
                        const defP = DEFAULT_ANALYSIS_PARAMS.find((p) => p.name === pName);
                        const key = buildFreeKey(pName);
                        return {
                          key,
                          name: pName,
                          unit: defP?.unit ?? '',
                          value: '',
                          isDefault: !!defP,
                        };
                      });
                    setFreeParams((prev) => [...prev, ...toAdd]);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 16,
                    backgroundColor: '#E0F2FE',
                    borderWidth: 1,
                    borderColor: '#7DD3FC',
                  }}
                >
                  <MaterialCommunityIcons name={preset.icon as any} size={13} color="#0284C7" />
                  <Text style={{ fontSize: 11, color: '#0284C7', fontWeight: '700' }}>
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Ajouter depuis la liste prédéfinie */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {DEFAULT_ANALYSIS_PARAMS.filter(
              (p) => !freeParams.some((fp) => fp.name === p.name),
            ).map((p) => (
              <TouchableOpacity
                key={p.name}
                onPress={() => {
                  const key = buildFreeKey(p.name);
                  setFreeParams((prev) => [
                    ...prev,
                    { key, name: p.name, unit: p.unit, value: '', isDefault: true },
                  ]);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 16,
                  backgroundColor: '#F0F9FF',
                  borderWidth: 1,
                  borderColor: '#BAE6FD',
                }}
              >
                <MaterialCommunityIcons name="plus" size={12} color="#0284C7" />
                <Text style={{ fontSize: 11, color: '#0284C7', fontWeight: '700' }}>
                  {p.name}
                  {p.unit ? ` (${p.unit})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* Ajouter paramètre libre personnalisé */}
          <TouchableOpacity
            onPress={() => {
              const key = buildFreeKey(`param_${Date.now()}`);
              setFreeParams((prev) => [
                ...prev,
                { key, name: '', unit: '', value: '', isDefault: false },
              ]);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              padding: 10,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: '#9CA3AF',
              borderStyle: 'dashed',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="pencil-plus-outline" size={16} color="#6C757D" />
            <Text style={{ fontSize: 13, color: '#6C757D', fontWeight: '600' }}>
              Ajouter un paramètre personnalisé
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );

  const generateFcqPdf = async () => {
    if (!dossier || !dossier.lot) return;

    setIsGeneratingPdf(true);

    try {
      let resultsHtml = '';

      const freeParamsHtml = freeParams
        .map(
          (param) => `
            <tr>
              <td class="bold">${param.name}</td>
              <td>${param.norm ? param.norm : 'Standard'}</td>
              <td class="text-right bold" style="color: #1E8E3E;">${param.value || 'N/A'} ${param.unit || ''}</td>
              <td class="text-center">
                <span class="badge badge-info">INFO</span>
              </td>
            </tr>
          `,
        )
        .join('');

      if (specs.length > 0) {
        resultsHtml =
          specs
            .map((spec) => {
              const rawPdf = results[spec.id];
              const val = parseFloat(rawPdf || '0');
              const isOut =
                rawPdf !== undefined &&
                rawPdf !== '' &&
                !isNaN(val) &&
                (val < spec.min_value || val > spec.max_value);
              const status = isOut ? 'NON CONFORME' : 'CONFORME';
              const badgeClass = isOut ? 'badge-err' : 'badge-ok';
              return `
            <tr>
              <td class="bold">${spec.parameter_name}</td>
              <td>${spec.min_value.toFixed(3)} - ${spec.max_value.toFixed(3)} ${spec.unit || ''}</td>
              <td class="text-right bold" style="color: ${isOut ? '#DC3545' : '#1E8E3E'};">${results[spec.id] || 'N/A'}</td>
              <td class="text-center">
                <span class="badge ${badgeClass}">${status}</span>
              </td>
            </tr>
          `;
            })
            .join('') + freeParamsHtml;
      } else if (freeParams.length > 0) {
        resultsHtml = freeParams
          .map((param) => {
            return `
            <tr>
              <td class="bold">${param.name}</td>
              <td>Standard</td>
              <td class="text-right bold" style="color: #1E8E3E;">${param.value || 'N/A'} ${param.unit || ''}</td>
              <td class="text-center">
                <span class="badge badge-info">INFO</span>
              </td>
            </tr>
          `;
          })
          .join('');
      } else {
        resultsHtml = `<tr><td colspan="4" class="text-center">Aucun paramètre analysé</td></tr>`;
      }

      const htmlContent = getPdfTemplate(
        dossier.decision === 'LIBERE'
          ? 'CERTIFICAT DE CONFORMITÉ QUALITÉ'
          : "RAPPORT D'ANALYSE ET DE BLOCAGE",
        `
        <div class="summary-grid">
          <div class="summary-card">
            <div class="summary-label">Référence Article</div>
            <div class="summary-value" style="font-size: 11pt;">${dossier.lot?.article?.code || 'N/A'}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">N° Lot Interne</div>
            <div class="summary-value" style="font-size: 11pt;">${dossier.lot?.code || 'N/A'}</div>
          </div>
          <div class="summary-card">
            <div class="summary-label">Statut Final</div>
            <div class="summary-value">
               <span class="badge ${dossier.decision === 'LIBERE' ? 'badge-ok' : 'badge-err'}" style="font-size: 12pt; padding: 6pt 12pt;">
                ${dossier.decision || 'EN ATTENTE'}
               </span>
            </div>
          </div>
        </div>

        <div style="background: #F8F9FA; padding: 15px; border-radius: 8px; margin-bottom: 25px; font-size: 10pt; line-height: 1.6;">
          <strong>Désignation :</strong> ${dossier.lot?.article?.name || 'N/A'}<br />
          <strong>Instrument de mesure :</strong> ${instruments.find((i) => i.id === dossier.instrument_id)?.name || 'Non renseigné'}<br />
          <strong>Date de l'analyse :</strong> ${new Date(dossier.created_at).toLocaleDateString('fr-FR')}<br />
          <strong>Opérateur :</strong> ${profile?.full_name || 'N/A'}
        </div>

        <h3 style="color: #1E513B; border-left: 4px solid #1E513B; padding-left: 10px; margin-bottom: 15px;">RÉSULTATS DES TESTS PHYSICO-CHIMIQUES</h3>
        <table>
          <thead>
            <tr>
              <th style="width: 30%;">Paramètre</th>
              <th style="width: 30%;">Spécification / Tolérance</th>
              <th style="width: 20%;" class="text-right">Valeur Trouvée</th>
              <th style="width: 20%;" class="text-center">Évaluation</th>
            </tr>
          </thead>
          <tbody>
            ${resultsHtml}
          </tbody>
        </table>

        ${
          dossier.notes
            ? `
          <div style="margin-top: 20px; font-size: 10pt; border-top: 1pt solid #E9ECEF; padding-top: 15px;">
            <strong>Observations :</strong><br />
            ${dossier.notes}
          </div>
        `
            : ''
        }

        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
          <div style="width: 45%; border: 0.5pt solid #E9ECEF; padding: 15px; border-radius: 6pt;">
            <div style="font-size: 8pt; color: #6C757D; text-transform: uppercase; margin-bottom: 40px;">Visa Technicien Laboratoire</div>
            <div style="font-size: 10pt; font-weight: 700;">${profile?.full_name || ''}</div>
          </div>
          <div style="width: 45%; border: 0.5pt solid #1E513B; padding: 15px; border-radius: 6pt; background: #F0FFF4;">
            <div style="font-size: 8pt; color: #1E513B; text-transform: uppercase; margin-bottom: 40px;">Décision Responsable Qualité</div>
            <div style="font-size: 10pt; font-weight: 700; color: #1E513B;">DÉCISION : ${dossier.decision || 'N/A'}</div>
          </div>
        </div>
        `,
        {
          watermark:
            dossier.decision === 'LIBERE'
              ? 'CONFORME'
              : dossier.decision === 'BLOQUE'
                ? 'REJETÉ'
                : 'BROUILLON',
          orientation: 'portrait',
        },
      );

      await generatePdf(htmlContent, `Rapport_FCQ_${dossier.code}.pdf`);
    } catch (error) {
      console.error('Erreur lors de la génération ou du partage du PDF:', error);
      Alert.alert('Erreur', 'Impossible de générer ou partager le rapport PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };
  const handleDecision = (decision: 'LIBERE' | 'BLOQUE') => {
    if (!dossier || !dossier.lot_id) return;

    if (!decisionMotive.trim()) {
      Alert.alert(
        'Motif obligatoire',
        'Veuillez renseigner le motif de la décision (libération ou blocage).',
      );
      return;
    }

    const parsedQty = parseFloat(controlledQty);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      Alert.alert(
        'Quantité invalide',
        'Veuillez renseigner une quantité contrôlée valide supérieure à 0.',
      );
      return;
    }

    if (!controllerName.trim()) {
      Alert.alert('Nom obligatoire', 'Veuillez renseigner le nom du contrôleur RQ.');
      return;
    }

    // ── Vérification specs réelles de l'article ────────────────────────────
    // Si aucune spec n'est définie MAIS le TLAB a saisi des paramètres libres → autoriser
    // Si aucune spec et aucun paramètre libre → avertir (non bloquant) pour une libération
    if (specs.length === 0 && decision === 'LIBERE') {
      const hasFreeData = Object.keys(results).some(
        (k) => k.startsWith('__free__') && results[k] !== '',
      );
      if (!hasFreeData) {
        // Avertissement non bloquant : le RQ peut quand même libérer avec motif obligatoire
        const msg = `Aucune spécification QC ni paramètre d'analyse saisi pour cet article.\n\nVoulez-vous libérer ce lot quand même (libération sur motif uniquement) ?`;
        if (Platform.OS === 'web') {
          const ok = window.confirm(msg);
          if (!ok) return;
        } else {
          Alert.alert('Libération sans analyse', msg, [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Libérer quand même', onPress: () => _executerDecision(decision, []) },
          ]);
          return;
        }
      }
    }

    // ── Calcul de conformité selon les specs de CET article précisément ───
    const outOfSpecParams = specs.filter((spec) => {
      const rawVal = results[spec.id];
      if (rawVal === undefined || rawVal === '') return false;
      const val = parseFloat(rawVal);
      return !isNaN(val) && (val < spec.min_value || val > spec.max_value);
    });

    const emptyMandatoryParams = specs.filter((spec) => {
      const rawVal = results[spec.id];
      return rawVal === undefined || rawVal === '';
    });

    // ── Cohérence décision / résultats ────────────────────────────────────
    if (decision === 'LIBERE') {
      // Bloquer libération si des paramètres sont hors cible
      if (outOfSpecParams.length > 0) {
        const paramNames = outOfSpecParams
          .map(
            (s) => `• ${s.parameter_name} (cible: ${s.min_value}–${s.max_value} ${s.unit || ''})`,
          )
          .join('\n');
        Alert.alert(
          'Libération impossible',
          `${outOfSpecParams.length} paramètre(s) hors spécification pour cet article :\n\n${paramNames}\n\nCorrigez les valeurs ou choisissez BLOCAGE du lot.`,
        );
        return;
      }
      // Avertir si des paramètres ne sont pas saisis
      if (emptyMandatoryParams.length > 0) {
        const paramNames = emptyMandatoryParams.map((s) => `• ${s.parameter_name}`).join('\n');
        const doConfirm = () => {
          _executerDecision(decision, outOfSpecParams);
        };
        if (Platform.OS === 'web') {
          const ok = window.confirm(
            `${emptyMandatoryParams.length} paramètre(s) non saisi(s) :\n\n${paramNames}\n\nConfirmer la libération quand même ?`,
          );
          if (ok) _executerDecision(decision, outOfSpecParams);
        } else {
          Alert.alert(
            'Paramètres non saisis',
            `${emptyMandatoryParams.length} paramètre(s) n'ont pas de valeur :\n\n${paramNames}\n\nConfirmer la libération quand même ?`,
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Confirmer', style: 'default', onPress: doConfirm },
            ],
          );
        }
        return;
      }
    }

    if (decision === 'BLOQUE') {
      // Si le RQ bloque malgré des résultats conformes → demander confirmation
      if (outOfSpecParams.length === 0 && specs.length > 0 && emptyMandatoryParams.length === 0) {
        const doConfirm = () => _executerDecision(decision, outOfSpecParams);
        if (Platform.OS === 'web') {
          const ok = window.confirm(
            `Tous les paramètres de cet article sont conformes aux spécifications.\n\nVous choisissez quand même de BLOQUER ce lot.\n\nConfirmer ?`,
          );
          if (ok) _executerDecision(decision, outOfSpecParams);
        } else {
          Alert.alert(
            'Blocage avec résultats conformes',
            `Tous les paramètres de cet article sont conformes. Confirmer le blocage ?`,
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Bloquer quand même', style: 'destructive', onPress: doConfirm },
            ],
          );
        }
        return;
      }
    }

    _executerDecision(decision, outOfSpecParams);
  };

  // Exécution effective de la décision (séparée pour éviter la duplication)
  const _executerDecision = (decision: 'LIBERE' | 'BLOQUE', outOfSpecParams: any[]) => {
    if (!dossier) return;
    const parsedQty = parseFloat(controlledQty);

    // 1. Clôturer le dossier d'analyse avec toutes les données RQ
    // ⚠️ On fusionne dossier.results (déjà en base) + state local results
    // pour garantir que les valeurs restent visibles après décision (évite N/A).
    const finalResults = {
      ...(dossier.results || {}),
      ...Object.fromEntries(
        Object.entries(results).filter(([_, v]) => v !== undefined && v !== ''),
      ),
    };

    // 1. Clôturer le dossier FCQ en premier — le reste est chaîné dans onSuccess
    mutation.mutate(
      {
        id: dossier.id,
        values: {
          decision,
          status: 'VALIDE',
          results: finalResults,
          motif_decision: decisionMotive,
          observation_rq: rqObservation,
          controleur_nom: controllerName,
          quantite_controlee: parsedQty,
          out_of_spec_count: outOfSpecParams.length,
          validator_id: profile?.id,
          validator_signed_at: new Date().toISOString(),
          validated_at: new Date().toISOString(),
        },
        type: 'UPDATE',
      },
      {
        onSuccess: () => {
          // 2. Mise à jour du statut du lot — chaîné après succès FCQ
          lotMutation.mutate(
            {
              id: dossier.lot_id,
              values: {
                cqlib_status: decision,
                cqlib_decided_by: profile?.id,
                cqlib_decided_at: new Date().toISOString(),
              },
              type: 'UPDATE',
            },
            {
              onSuccess: async () => {
                // Enregistrement de l'historique dans la table de traçabilité qualité
                try {
                  const now = new Date();
                  const actionDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
                  const actionTime = now.toTimeString().split(' ')[0]; // HH:MM:SS
                  await supabase?.from('quality_traceability_logs').insert({
                    lot_id: dossier.lot_id,
                    fcq_id: dossier.id,
                    user_id: profile?.id,
                    username: controllerName || profile?.full_name || 'Responsable Qualité',
                    action_date: actionDate,
                    action_time: actionTime,
                    decision: String(decision),
                    motif: decisionMotive,
                    comment: rqObservation || null,
                    previous_status: String(dossier.lot?.cqlib_status || 'QUARANTAINE'),
                    final_status: String(decision),
                  });
                } catch (err) {
                  console.error("Erreur d'insertion dans la traçabilité qualité :", err);
                }

                // Générer le PDF après la validation
                await generateFcqPdf();

                // 3. Ouverture automatique de FNC sur lot bloqué
                // La FNC est créée directement en base via RPC pour garantir l'unicité du code
                // et éviter le double-insert (trigger auto_create_fnc_on_block + mutation front)
                if (decision === 'BLOQUE') {
                  try {
                    const year = new Date().getFullYear();
                    // Chercher le dernier numéro de FNC existant pour générer le prochain sans collision
                    const { data: lastFnc } = await supabase!
                      .from('fnc')
                      .select('code')
                      .like('code', `FNC-${year}-%`)
                      .order('code', { ascending: false })
                      .limit(1);
                    const lastNum = lastFnc?.[0]?.code
                      ? parseInt(lastFnc[0].code.split('-').pop() || '0', 10)
                      : 0;
                    const nextNum = String(lastNum + 1).padStart(4, '0');
                    const generatedFncCode = `FNC-${year}-${nextNum}`;

                    const { error: fncErr } = await supabase!.from('fnc').insert({
                      code: generatedFncCode,
                      lot_id: dossier.lot_id,
                      fcq_id: dossier.id,
                      severity: 'MAJEURE',
                      description: `NC détectée lors de l'analyse ${dossier.code}. Passage automatique en statut BLOQUÉ. Motif : ${decisionMotive}. Observation : ${rqObservation || 'Aucune'}.`,
                      status: 'OUVERTE',
                      opened_by: profile?.id ?? null,
                      opened_at: new Date().toISOString(),
                    });
                    if (fncErr) {
                      // Code déjà pris (rare) → log seulement, ne pas bloquer la décision qualité
                      console.warn('[FNC] Création FNC échouée (conflit code?):', fncErr.message);
                    }
                  } catch (err) {
                    console.error('[FNC] Erreur création FNC automatique:', err);
                  }
                }

                // 🔔 4. Notifications de décision qualité (LIBÉRÉ / BLOQUÉ)
                // ─────────────────────────────────────────────────────────
                const lotCode = dossier.lot?.code || dossier.code;
                const articleName = dossier.lot?.article?.name || dossier.lot?.article?.code || '';

                const decisionPrefix = decision === 'LIBERE' ? N.released : N.blocked;
                const decisionLabel =
                  decision === 'LIBERE' ? 'LOT LIBERE — Conforme' : 'LOT BLOQUE — Non-conforme';
                const notifSubject = `${decisionPrefix} ${decisionLabel} · ${dossier.code}`;
                const notifMessage = [
                  `Lot : ${lotCode}`,
                  articleName && `Article : ${articleName}`,
                  `Décision : ${decision}`,
                  decisionMotive && `Motif : ${decisionMotive}`,
                  rqObservation && `Observation : ${rqObservation}`,
                ]
                  .filter(Boolean)
                  .join('\n');

                // Rôles à notifier selon la décision
                // Note: 'DG' ajouté via migration 058 — inclus après confirmation enum user_role
                const rolesDecision =
                  decision === 'LIBERE'
                    ? ['MAGA', 'RPROD', 'PLAN', 'RACH', 'ADMIN']
                    : ['MAGA', 'RPROD', 'RACH', 'ADMIN'];

                for (const roleTarget of rolesDecision) {
                  notify.mutate({
                    to_role: roleTarget as any,
                    subject: notifSubject,
                    message: notifMessage,
                    type: decision === 'LIBERE' ? 'success' : 'error',
                    category: 'QUALITY',
                    metadata: {
                      category: 'QUALITY',
                      decision,
                      fcq_id: dossier.id,
                      lot_id: dossier.lot_id,
                      screen: 'Laboratory',
                    },
                  });
                }

                // Son local immédiat pour le valideur lui-même
                playNotificationSound(decision === 'LIBERE' ? 'release' : 'critical');

                // 5. Mettre à jour automatiquement le statut du bon d'entrée lié
                let bonEntreeId = dossier.lot?.bon_entree_id;
                if (!bonEntreeId) {
                  try {
                    const { data: lotData, error: lotErr } = await supabase!
                      .from('lots')
                      .select('bon_entree_id')
                      .eq('id', dossier.lot_id)
                      .single();
                    if (!lotErr && lotData?.bon_entree_id) bonEntreeId = lotData.bon_entree_id;
                  } catch (err) {
                    console.warn("[BE] impossible de récupérer le bon d'entrée lié", err);
                  }
                }

                if (bonEntreeId) {
                  try {
                    const { data: siblingLots = [], error: siblingsError } = await supabase!
                      .from('lots')
                      .select('cqlib_status')
                      .eq('bon_entree_id', bonEntreeId);
                    if (!siblingsError) {
                      const statuses = (siblingLots as any[]).map((l: any) =>
                        String(l.cqlib_status || '')
                          .trim()
                          .toUpperCase(),
                      );
                      const newBeStatus = statuses.some((s) => s === 'BLOQUE')
                        ? 'BLOQUE'
                        : statuses.every((s) => s === 'LIBERE')
                          ? 'LIBERE'
                          : 'QUARANTAINE';

                      await supabase!
                        .from('bons_entree')
                        .update({ status: newBeStatus })
                        .eq('id', bonEntreeId);
                    }
                  } catch (err) {
                    console.warn('[BE] mise à jour automatique échouée', err);
                  }
                }

                // 6. Mouvement de stock + notifications expédition/non-conforme selon décision
                try {
                  const lotFull = dossier.lot as any;
                  const articleId = lotFull?.article_id || null;
                  const articleType = lotFull?.article?.article_type || '';

                  // Pour un lot libéré → forcer le dépôt selon article_type :
                  //   PF  → D-103-PF  (dépôt produits finis)
                  //   EMB → D-103-EMB (dépôt emballages)
                  //   MP  → D-103-MP  (dépôt matières premières)
                  //   SF  → dépôt du lot (semi-fini, pas de dépôt dédié standard)
                  let depotId = lotFull?.depot_id || null;
                  if (decision === 'LIBERE') {
                    const matchedDepot = (depots as any[]).find(
                      (d: any) => d.depot_type === articleType,
                    );
                    if (matchedDepot) depotId = matchedDepot.id;
                  }

                  const qty = parseFloat(
                    String(lotFull?.qty_current ?? lotFull?.qty_received ?? 0),
                  );
                  const unit = lotFull?.unit || 'kg';
                  const lotCode = lotFull?.code || dossier.code;
                  const articleName = lotFull?.article?.name || '';

                  if (decision === 'LIBERE' && articleId && qty > 0) {
                    // Créer un mouvement d'ENTREE en stock pour rendre le lot disponible
                    const { error: mvtErr } = await supabase!.from('stock_movements').insert({
                      lot_id: dossier.lot_id,
                      article_id: articleId,
                      depot_to_id: depotId,
                      movement_type: 'ENTREE',
                      qty,
                      unit,
                      reference_doc: dossier.code,
                      notes: `Libération FCQ ${dossier.code} — lot ${lotCode} conforme, intégré en stock.`,
                      performed_by: profile?.id || null,
                    });
                    if (mvtErr) {
                      console.warn('[Stock] Mouvement ENTREE échoué :', mvtErr.message);
                    } else {
                      // Mettre à jour le depot_id du lot vers le dépôt cible (MP, EMB, PF, SF)
                      if (depotId) {
                        await supabase!.from('lots').update({ depot_id: depotId }).eq('id', dossier.lot_id);
                      }
                      queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
                      queryClient.invalidateQueries({ queryKey: ['stock_movements_full'] });
                      queryClient.invalidateQueries({ queryKey: ['stock_card'] });
                      queryClient.invalidateQueries({ queryKey: ['lots'] });
                    }

                    // Notifier expédition (MAGA / PLAN) que le lot est disponible en stock
                    for (const r of ['MAGA', 'PLAN'] as const) {
                      await supabase!.from('notifications').insert({
                        user_id: null,  // ✅ FIX: Permet les notifications basées sur les rôles
                        role: r,
                        title: `[STOCK] Lot ${lotCode} disponible en stock`,
                        message: `Lot ${lotCode} (${articleName}) libéré par le laboratoire.\nQuantité disponible : ${qty} ${unit}. Mouvement d'entrée enregistré.`,
                        type: 'success',
                        metadata: {
                          category: 'STOCK',
                          screen: 'StocksScreen',
                          lot_id: dossier.lot_id,
                          decision: 'LIBERE',
                        },
                      });
                    }
                  } else if (decision === 'BLOQUE') {
                    // Notifier non-conforme : RACH (pour retour fournisseur) + RPROD (pour ajustement plan)
                    for (const r of ['RACH', 'RPROD'] as const) {
                      await supabase!.from('notifications').insert({
                        user_id: null,  // ✅ FIX: Permet les notifications basées sur les rôles
                        role: r,
                        title: `[NC] Lot ${lotCode} bloqué — non conforme`,
                        message: `Lot ${lotCode} (${articleName}) déclaré NON CONFORME.\nFiche NC créée automatiquement. Action corrective requise.`,
                        type: 'error',
                        metadata: {
                          category: 'QUALITY',
                          screen: 'ComplaintsScreen',
                          lot_id: dossier.lot_id,
                          decision: 'BLOQUE',
                        },
                      });
                    }
                  }
                } catch (err) {
                  console.warn('[Décision] Mouvement / notification post-décision échoué :', err);
                }

                queryClient.invalidateQueries({ queryKey: ['lots'] });
                queryClient.invalidateQueries({ queryKey: ['fcq_dossiers'] });
                queryClient.invalidateQueries({ queryKey: ['bons_entree'] });
                setSelId(null);
              },
            },
          );
        }, // end onSuccess fcq mutation
      },
    );
  };
  return (
    <AnimatedPage>
      {isGeneratingPdf && <ExportOverlay visible={true} progress={0.5} />}
      {/* Simple overlay for PDF generation */}
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        {/* Header */}
        <View
          style={[
            s.headerRow,
            isMobile && { flexDirection: 'column', alignItems: 'flex-start', gap: 16 },
          ]}
        >
          <View>
            <Text style={s.title}>{t('lab_qc_title')}</Text>
            <Text style={s.subTitle}>{t('lab_qc_sub')}</Text>
          </View>
          <View style={s.actions}>
            <ActionButton
              label={t('calibration_planning')}
              onPress={() => setCalibModalVisible(true)}
            />
            {canCreateFcq && (
              <ActionButton label={t('new_analysis')} onPress={handleAdd} variant="primary" />
            )}
          </View>
        </View>

        <View style={[s.mainGrid, isMobile && { flexDirection: 'column' }]}>
          {/* Left: Instruments */}
          <View style={[s.leftCol, isMobile && { width: '100%' }]}>
            <KpiCard
              label={t('instruments_ok')}
              value={`${instOkCount}/${instruments.length}`}
              sub={t('ready_for_analysis')}
              color={instOkCount === instruments.length ? C.ok : C.gold}
            />

            <View style={{ height: 20 }} />
            <SectionTitle>ÉTALONNAGE INSTRUMENTS</SectionTitle>

            {/* Bannière rappels : instruments expirant dans les 30 jours */}
            {(() => {
              const today = new Date();
              const soon = instruments.filter((inst) => {
                if (!inst.next_calibration_at) return false;
                const next = new Date(inst.next_calibration_at);
                const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 86400));
                return diffDays >= 0 && diffDays <= 30 && inst.status === 'ETALONNE';
              });
              const overdue = instruments.filter(
                (inst) => inst.status === 'ECHU' || inst.status === 'A_ETALONNER',
              );
              if (soon.length === 0 && overdue.length === 0) return null;
              return (
                <View style={{ marginBottom: 12 }}>
                  {overdue.length > 0 && (
                    <View
                      style={{
                        backgroundColor: '#FFF5F5',
                        borderWidth: 1,
                        borderColor: '#F5C6CB',
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 8,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <MaterialCommunityIcons name="alert-circle" size={18} color={C.err} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.err, flex: 1 }}>
                        {overdue.length} instrument{overdue.length > 1 ? 's' : ''} échu
                        {overdue.length > 1 ? 's' : ''} — saisie FCQ bloquée
                      </Text>
                    </View>
                  )}
                  {soon.length > 0 && (
                    <View
                      style={{
                        backgroundColor: '#FFFBF0',
                        borderWidth: 1,
                        borderColor: '#FFE8A1',
                        borderRadius: 8,
                        padding: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <MaterialCommunityIcons name="clock-alert-outline" size={18} color={C.gold} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#856404', flex: 1 }}>
                        {soon.length} instrument{soon.length > 1 ? 's' : ''} à étalonner dans ≤ 30
                        jours
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}

            <View style={s.card}>
              {instruments.map((inst, i) => {
                const today = new Date();
                const nextDate = inst.next_calibration_at
                  ? new Date(inst.next_calibration_at)
                  : null;
                const daysLeft = nextDate
                  ? Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 86400))
                  : null;
                const isOverdue = inst.status === 'ECHU' || inst.status === 'A_ETALONNER';
                const isSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 30 && !isOverdue;
                return (
                  <View key={inst.id} style={[s.instRow, i < instruments.length - 1 && s.borderB]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.instId}>{inst.code}</Text>
                      <Text style={s.instName}>{inst.name}</Text>
                      {nextDate && (
                        <Text
                          style={{
                            fontSize: 10,
                            color: isOverdue ? C.err : isSoon ? C.gold : '#ADB5BD',
                            marginTop: 2,
                          }}
                        >
                          {isOverdue
                            ? `⚠ Échu depuis ${Math.abs(daysLeft ?? 0)}j`
                            : isSoon
                              ? `⏱ Dans ${daysLeft}j`
                              : `Prochain : ${nextDate.toLocaleDateString('fr-FR')}`}
                        </Text>
                      )}
                    </View>
                    <View
                      style={[
                        s.statusDot,
                        { backgroundColor: inst.status === 'ETALONNE' ? C.ok : C.err },
                      ]}
                    />
                  </View>
                );
              })}
            </View>
          </View>

          {/* Right: Dossiers */}
          <View style={[s.rightCol, isMobile && { width: '100%' }]}>
            <View style={s.tableCard}>
              <View style={s.tableHeader}>
                <Text style={s.tableTitle}>{t('pending_release')}</Text>
                <Text style={s.tableSub}>{t('analysis_decision')}</Text>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  padding: 12,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <TouchableOpacity
                    onPress={() => setDecisionFilter('EN_ATTENTE')}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: decisionFilter === 'EN_ATTENTE' ? '#D97706' : '#F8F9FA',
                    }}
                  >
                    <Text
                      style={{
                        color: decisionFilter === 'EN_ATTENTE' ? '#FFF' : '#6C757D',
                        fontWeight: '700',
                      }}
                    >
                      En attente
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDecisionFilter('ALL')}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: decisionFilter === 'ALL' ? '#111' : '#F8F9FA',
                    }}
                  >
                    <Text
                      style={{
                        color: decisionFilter === 'ALL' ? '#FFF' : '#6C757D',
                        fontWeight: '700',
                      }}
                    >
                      Tous
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDecisionFilter('LIBERE')}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: decisionFilter === 'LIBERE' ? C.ok : '#F8F9FA',
                    }}
                  >
                    <Text
                      style={{
                        color: decisionFilter === 'LIBERE' ? '#FFF' : '#6C757D',
                        fontWeight: '700',
                      }}
                    >
                      Libéré
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setDecisionFilter('BLOQUE')}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      backgroundColor: decisionFilter === 'BLOQUE' ? C.err : '#F8F9FA',
                    }}
                  >
                    <Text
                      style={{
                        color: decisionFilter === 'BLOQUE' ? '#FFF' : '#6C757D',
                        fontWeight: '700',
                      }}
                    >
                      Bloqué
                    </Text>
                  </TouchableOpacity>
                </View>
                <View />
              </View>

              {filteredDossiers.map((d, idx) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => setSelId(selId === d.id ? null : d.id)}
                  style={[
                    s.tr,
                    selId === d.id && s.trActive,
                    idx === dossiers.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Text style={s.tdCode}>{d.code}</Text>
                      <View
                        style={[
                          s.miniBadge,
                          {
                            backgroundColor:
                              d.fcq_type === 'FCQ-MP'
                                ? '#EBF5FB'
                                : d.fcq_type === 'FCQ-SAV'
                                  ? '#FFF0F6'
                                  : d.fcq_type === 'FCQ-VAI'
                                    ? '#F0FFF4'
                                    : d.fcq_type === 'FCQ-BOU'
                                      ? '#FFFBF0'
                                      : d.fcq_type === 'FCQ-COR'
                                        ? '#FFF5EE'
                                        : '#F8F9FA',
                            borderColor:
                              d.fcq_type === 'FCQ-MP'
                                ? '#AED6F1'
                                : d.fcq_type === 'FCQ-SAV'
                                  ? '#F1A7C7'
                                  : d.fcq_type === 'FCQ-VAI'
                                    ? '#A9DFBF'
                                    : d.fcq_type === 'FCQ-BOU'
                                      ? '#F9E79F'
                                      : d.fcq_type === 'FCQ-COR'
                                        ? '#FAD7A0'
                                        : '#E9ECEF',
                          },
                        ]}
                      >
                        <Text style={s.miniBadgeText}>{d.fcq_type || 'FCQ'}</Text>
                      </View>
                    </View>
                    <Text style={s.tdArticle}>{d.lot?.article?.name}</Text>
                    <Text style={s.tdLot}>Lot: {d.lot?.code}</Text>
                  </View>

                  <View style={{ width: 140, alignItems: 'flex-end', gap: 8 }}>
                    <View
                      style={[
                        s.statusBadge,
                        { backgroundColor: STATUS_MAP[d.status]?.color + '15' },
                      ]}
                    >
                      <Text style={[s.statusText, { color: STATUS_MAP[d.status]?.color }]}>
                        {STATUS_MAP[d.status]?.label}
                      </Text>
                    </View>
                    {d.decision && (
                      <Text
                        style={[s.decisionText, { color: d.decision === 'LIBERE' ? C.ok : C.err }]}
                      >
                        {d.decision}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}

              <PaginationControls
                currentPage={page}
                totalItems={dossiersCount}
                limit={limit}
                onPageChange={(p) => setPage(p)}
                loading={dossLoading}
              />
            </View>

            {/* Detail View (Responsive) */}
            {dossier &&
              (() => {
                // Calculate QC Result based on test specifications
                const hasConformityIssues = specs.some((spec) => {
                  const rawVal = results[spec.id];
                  if (rawVal === undefined || rawVal === '') return false; // champ vide = non saisi, pas hors cible
                  const val = parseFloat(rawVal);
                  return !isNaN(val) && (val < spec.min_value || val > spec.max_value);
                });
                // Vérifie si au moins un résultat a été saisi
                const hasAnyResult = specs.some((spec) => {
                  const rawVal = results[spec.id];
                  return rawVal !== undefined && rawVal !== '';
                });
                // Statut EN_ATTENTE si dossier pas encore complété ou aucun résultat saisi
                const isWaiting =
                  dossier.status === 'EN_ATTENTE' ||
                  (!hasAnyResult && dossier.status !== 'VALIDE' && dossier.status !== 'COMPLET');
                const qcResultLabel = isWaiting
                  ? 'EN ATTENTE'
                  : hasConformityIssues
                    ? 'NON CONFORME'
                    : 'CONFORME';
                const qcResultColor = isWaiting ? C.gold : hasConformityIssues ? C.err : C.ok;

                const isArticleMP =
                  dossier.fcq_type === 'FCQ-MP' || dossier.lot?.article?.article_type === 'MP';
                const articleTypeLabel = isArticleMP ? 'Matière Première' : 'Produit Fini';

                return (
                  <View style={s.detailCard}>
                    <View style={s.detailHeader}>
                      <Text style={s.detailTitle}>Fiche Contrôle Qualité — {dossier.code}</Text>
                      <TouchableOpacity onPress={() => setSelId(null)}>
                        <MaterialCommunityIcons name="close" size={20} color="#666" />
                      </TouchableOpacity>
                    </View>

                    <View style={s.detailContent}>
                      {/* section 1 : Informations Générales de l'Article et Lot */}
                      <SectionTitle>1. CARACTÉRISTIQUES DE L'ARTICLE & LOT</SectionTitle>
                      <View style={s.metaGrid}>
                        <View style={s.metaItem}>
                          <Text style={s.metaLabel}>Type d'article :</Text>
                          <Text style={s.metaValue}>{articleTypeLabel}</Text>
                        </View>
                        <View style={s.metaItem}>
                          <Text style={s.metaLabel}>Référence Article :</Text>
                          <Text
                            style={[
                              s.metaValue,
                              {
                                fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace',
                                fontWeight: 'bold',
                              },
                            ]}
                          >
                            {dossier.lot?.article?.code || 'N/A'}
                          </Text>
                        </View>
                        <View style={s.metaItem}>
                          <Text style={s.metaLabel}>Désignation :</Text>
                          <Text style={s.metaValue}>{dossier.lot?.article?.name || 'N/A'}</Text>
                        </View>
                        <View style={s.metaItem}>
                          <Text style={s.metaLabel}>Code / N° Lot :</Text>
                          <Text
                            style={[
                              s.metaValue,
                              {
                                fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace',
                                color: C.info,
                                fontWeight: 'bold',
                              },
                            ]}
                          >
                            {dossier.lot?.code || 'N/A'}
                          </Text>
                        </View>
                        <View style={s.metaItem}>
                          <Text style={s.metaLabel}>Unité de mesure :</Text>
                          <Text style={s.metaValue}>
                            {dossier.lot?.unit || dossier.lot?.article?.unit || 'kg'}
                          </Text>
                        </View>
                        <View style={s.metaItem}>
                          <Text style={s.metaLabel}>Date Réception / Prod :</Text>
                          <Text style={s.metaValue}>
                            {new Date(
                              dossier.lot?.reception_date ||
                                dossier.lot?.created_at ||
                                dossier.created_at,
                            ).toLocaleDateString('fr-FR')}
                          </Text>
                        </View>
                      </View>

                      <View style={{ height: 20 }} />

                      {/* section 2 : Résultats des Analyses du Laboratoire */}
                      <SectionTitle>2. ANALYSE PHYSICO-CHIMIQUE & RÉSULTATS</SectionTitle>
                      <View style={s.qcResultHeader}>
                        <Text style={s.qcResultLabel}>Résultat Global Contrôle :</Text>
                        <Text style={[s.qcResultValue, { color: qcResultColor }]}>
                          {qcResultLabel}
                        </Text>
                      </View>

                      <View style={s.resContainer}>
                        {specsLoading ? (
                          <ActivityIndicator size="small" color={C.info} style={{ padding: 20 }} />
                        ) : specs.length > 0 ? (
                          <>
                            {specs.map(renderResultInput)}
                            <View
                              style={{
                                marginTop: 16,
                                borderTopWidth: 1,
                                borderTopColor: '#E5E7EB',
                                paddingTop: 14,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '800',
                                  color: '#9CA3AF',
                                  letterSpacing: 0.5,
                                  marginBottom: 8,
                                }}
                              >
                                PARAMÈTRES ADDITIONNELS (HORS SPÉCIFICATION)
                              </Text>
                              {renderFreeParamsEditor()}
                            </View>
                          </>
                        ) : (
                          // Aucune spec QC définie : saisie libre avec paramètres par défaut
                          <View>
                            {/* En-tête info */}
                            <View
                              style={{
                                backgroundColor: '#EEF2FF',
                                borderRadius: 6,
                                padding: 10,
                                marginBottom: 12,
                                borderLeftWidth: 3,
                                borderLeftColor: C.info,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: '#1A56DB',
                                  fontWeight: '700',
                                  marginBottom: 2,
                                }}
                              >
                                Paramètres d'analyse — saisie manuelle
                              </Text>
                              <Text style={{ fontSize: 11, color: '#374151' }}>
                                Les paramètres ci-dessous sont pré-remplis avec les valeurs
                                standards du laboratoire. Modifiez les noms ou valeurs selon
                                l'article, et ajoutez d'autres mesures si nécessaire.
                              </Text>
                            </View>

                            {renderFreeParamsEditor()}
                          </View>
                        )}
                      </View>

                      <View style={{ height: 24 }} />

                      {/* section 3 : Décision de Validation (Technicien puis RQ) */}
                      {dossier.status !== 'VALIDE' ? (
                        <View>
                          {/* Actions Technicien Laboratoire */}
                          {dossier.status !== 'COMPLET' && canCreateFcq && (
                            <View
                              style={{
                                marginBottom: 24,
                                padding: 16,
                                backgroundColor: '#FFFDF5',
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: '#FFEAA7',
                              }}
                            >
                              <SectionTitle>{t('technician_action')}</SectionTitle>
                              <Text style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
                                Renseignez toutes les valeurs physiques. Enregistrez en brouillon à
                                tout moment, puis finalisez quand la saisie est complète.
                              </Text>
                              <View style={{ flexDirection: 'row', gap: 10 }}>
                                <ActionButton
                                  label="Sauvegarder brouillon"
                                  onPress={handleSaveDraft}
                                  icon="content-save-outline"
                                  variant="secondary"
                                  loading={mutation.isPending}
                                />
                                <ActionButton
                                  label={t('finalize_entry')}
                                  onPress={handleCompleteAnalysis}
                                  variant="primary"
                                  icon="check-all"
                                  loading={mutation.isPending}
                                />
                              </View>
                            </View>
                          )}

                          {/* Formulaire Responsable Qualité (RQ) */}
                          {canValidate ? (
                            <View style={s.rqFormCard}>
                              <SectionTitle>
                                3. FORMULAIRE DE DÉCISION CQ-LIB (RESPONSABLE QUALITÉ)
                              </SectionTitle>

                              <View style={s.formField}>
                                <Text style={s.fieldLabel}>Quantité contrôlée *</Text>
                                <TextInput
                                  style={s.formTextInput}
                                  value={controlledQty ?? ''}
                                  onChangeText={setControlledQty}
                                  keyboardType="numeric"
                                  placeholder="Entrer la quantité exacte contrôlée"
                                />
                              </View>

                              <View style={s.formField}>
                                <Text style={s.fieldLabel}>Nom du Contrôleur RQ *</Text>
                                <TextInput
                                  style={s.formTextInput}
                                  value={controllerName ?? ''}
                                  onChangeText={setControllerName}
                                  placeholder="Entrer le nom complet du contrôleur"
                                />
                              </View>

                              <View style={s.formField}>
                                <Text style={s.fieldLabel}>
                                  Motif de Libération ou de Blocage *
                                </Text>
                                <TextInput
                                  style={[
                                    s.formTextInput,
                                    { borderColor: decisionMotive.trim() ? '#D1D9E0' : C.gold },
                                  ]}
                                  value={decisionMotive ?? ''}
                                  onChangeText={setDecisionMotive}
                                  placeholder="Saisir le motif détaillé de la décision (strictement obligatoire)"
                                />
                              </View>

                              <View style={s.formField}>
                                <Text style={s.fieldLabel}>
                                  Commentaire / Observations additionnelles
                                </Text>
                                <TextInput
                                  style={[s.formTextInput, { height: 60 }]}
                                  value={rqObservation ?? ''}
                                  onChangeText={setRqObservation}
                                  placeholder="Observations libres ou notes techniques..."
                                  multiline
                                />
                              </View>

                              <View style={s.formField}>
                                <Text style={s.fieldLabel}>Date et Heure de Validation</Text>
                                <Text style={s.autoTimestamp}>
                                  Automatique lors de la décision finale
                                </Text>
                              </View>

                              <View style={{ height: 16 }} />

                              {/* ── Bilan de conformité par specs de cet article ── */}
                              {specs.length > 0 ? (
                                <View
                                  style={{
                                    backgroundColor: hasConformityIssues ? '#FFF5F5' : '#F0FFF4',
                                    borderRadius: 8,
                                    padding: 12,
                                    marginBottom: 12,
                                    borderLeftWidth: 3,
                                    borderLeftColor: hasConformityIssues ? C.err : C.ok,
                                    borderWidth: 1,
                                    borderColor: hasConformityIssues ? '#FECACA' : '#BBF7D0',
                                  }}
                                >
                                  <View
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                  >
                                    <MaterialCommunityIcons
                                      name={
                                        specs.some((sp) => {
                                          const v = parseFloat(results[sp.id] || '');
                                          return (
                                            !isNaN(v) && (v < sp.min_value || v > sp.max_value)
                                          );
                                        })
                                          ? 'alert-circle'
                                          : 'check-circle'
                                      }
                                      size={16}
                                      color={
                                        specs.some((sp) => {
                                          const v = parseFloat(results[sp.id] || '');
                                          return (
                                            !isNaN(v) && (v < sp.min_value || v > sp.max_value)
                                          );
                                        })
                                          ? C.err
                                          : C.ok
                                      }
                                    />
                                    <Text
                                      style={{ fontSize: 13, color: '#333', fontWeight: '500' }}
                                    >
                                      {specs.some((sp) => {
                                        const v = parseFloat(results[sp.id] || '');
                                        return !isNaN(v) && (v < sp.min_value || v > sp.max_value);
                                      })
                                        ? `${
                                            specs.filter((sp) => {
                                              const v = parseFloat(results[sp.id] || '');
                                              return (
                                                !isNaN(v) && (v < sp.min_value || v > sp.max_value)
                                              );
                                            }).length
                                          } paramètre(s) HORS SPEC - "${dossier.lot?.article?.name}"`
                                        : `Tous les paramètres conformes aux spécifications de "${dossier.lot?.article?.name}"`}
                                    </Text>
                                  </View>
                                  {hasConformityIssues &&
                                    specs
                                      .filter((sp) => {
                                        const v = parseFloat(results[sp.id] || '');
                                        return !isNaN(v) && (v < sp.min_value || v > sp.max_value);
                                      })
                                      .map((sp) => (
                                        <Text
                                          key={sp.id}
                                          style={{ fontSize: 11, color: C.err, marginBottom: 2 }}
                                        >
                                          {`• ${sp.parameter_name}: ${results[sp.id]} (cible ${sp.min_value}–${sp.max_value} ${sp.unit || ''})`}
                                        </Text>
                                      ))}
                                </View>
                              ) : (
                                <View
                                  style={{
                                    backgroundColor: '#EEF2FF',
                                    padding: 12,
                                    borderRadius: 6,
                                    marginBottom: 12,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 8,
                                  }}
                                >
                                  <MaterialCommunityIcons
                                    name="information-outline"
                                    size={20}
                                    color={C.info}
                                  />
                                  <Text
                                    style={{
                                      fontSize: 13,
                                      color: '#1E3A8A',
                                      flex: 1,
                                      lineHeight: 20,
                                    }}
                                  >
                                    {`Aucune spécification QC standardisée pour cet article. Le TLAB peut avoir saisi des paramètres libres ci-dessus. La décision de libération ou de blocage est à votre discrétion.`}
                                  </Text>
                                </View>
                              )}

                              {/* Résumé des champs manquants pour aider l'utilisateur */}
                              {(!controlledQty.trim() ||
                                !controllerName.trim() ||
                                !decisionMotive.trim()) && (
                                <View
                                  style={{
                                    backgroundColor: '#FFF8E1',
                                    borderRadius: 8,
                                    padding: 10,
                                    marginBottom: 16,
                                  }}
                                >
                                  <View
                                    style={{
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 8,
                                      marginBottom: 4,
                                    }}
                                  >
                                    <MaterialCommunityIcons
                                      name="alert-outline"
                                      size={16}
                                      color="#856404"
                                    />
                                    <Text
                                      style={{ fontSize: 12, color: '#856404', fontWeight: '600' }}
                                    >
                                      Champs requis avant validation :
                                    </Text>
                                  </View>
                                  <Text style={{ fontSize: 12, color: '#856404' }}>
                                    - Quantité contrôlée{'\n'}- Décision (Libéré / Bloqué){'\n'}-
                                    Motif détaillé
                                  </Text>
                                </View>
                              )}

                              <View style={s.decActions}>
                                <ActionButton
                                  label={t('export')}
                                  onPress={generateFcqPdf}
                                  icon="file-pdf-box"
                                  disabled={isGeneratingPdf}
                                />
                                <ActionButton
                                  label={t('release_lot')}
                                  onPress={() => handleDecision('LIBERE')}
                                  variant="primary"
                                  icon="check-decagram"
                                  disabled={mutation.isPending || lotMutation.isPending}
                                />
                                <ActionButton
                                  label={t('block_lot')}
                                  onPress={() => handleDecision('BLOQUE')}
                                  icon="close-octagon"
                                  disabled={mutation.isPending || lotMutation.isPending}
                                />
                              </View>
                            </View>
                          ) : (
                            <View style={s.restrictedBox}>
                              {dossier.status === 'COMPLET' ? (
                                <View
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                                >
                                  <MaterialCommunityIcons name="sync" size={16} color="#1A1A1A" />
                                  <Text
                                    style={{ fontSize: 13, color: '#1A1A1A', fontWeight: '600' }}
                                  >
                                    Analyse transmise au Responsable Qualité
                                  </Text>
                                </View>
                              ) : (
                                <Text style={s.restrictedText}>
                                  Validation réservée aux Responsables Qualité (RQ).
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                      ) : (
                        <View style={s.validationDetailsCard}>
                          <SectionTitle>3. RAPPORTS ET DÉCISION CQ-LIB ENREGISTRÉE</SectionTitle>

                          <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Décision Finale :</Text>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                alignSelf: 'flex-start',
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 8,
                                backgroundColor: dossier.decision === 'LIBERE' ? C.bgOk : C.bgErr,
                              }}
                            >
                              <MaterialCommunityIcons
                                name={
                                  dossier.decision === 'LIBERE' ? 'check-circle' : 'close-circle'
                                }
                                size={18}
                                color={dossier.decision === 'LIBERE' ? C.ok : C.err}
                              />
                              <Text
                                style={{
                                  fontSize: 14,
                                  fontWeight: '800',
                                  color: dossier.decision === 'LIBERE' ? C.ok : C.err,
                                }}
                              >
                                {dossier.decision === 'LIBERE' ? 'LOT LIBÉRÉ' : 'LOT BLOQUÉ'}
                              </Text>
                            </View>
                          </View>

                          <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Quantité Contrôlée :</Text>
                            <Text style={s.detailValue}>
                              {dossier.quantite_controlee || dossier.lot?.qty_received || 'N/A'}{' '}
                              {dossier.lot?.unit || 'kg'}
                            </Text>
                          </View>

                          <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Contrôleur Qualité :</Text>
                            <Text style={s.detailValue}>
                              {dossier.controleur_nom || 'Responsable Qualité'}
                            </Text>
                          </View>

                          <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Motif de la Décision :</Text>
                            <Text style={[s.detailValue, { fontStyle: 'italic', color: '#333' }]}>
                              {dossier.motif_decision || 'Aucun motif renseigné'}
                            </Text>
                          </View>

                          {dossier.observation_rq ? (
                            <View style={s.detailRow}>
                              <Text style={s.detailLabel}>Observations RQ :</Text>
                              <Text style={s.detailValue}>{dossier.observation_rq}</Text>
                            </View>
                          ) : null}

                          <View style={s.detailRow}>
                            <Text style={s.detailLabel}>Date de Validation :</Text>
                            <Text style={s.detailValue}>
                              {dossier.validated_at || dossier.validator_signed_at
                                ? new Date(
                                    dossier.validated_at || dossier.validator_signed_at,
                                  ).toLocaleString('fr-FR')
                                : 'N/A'}
                            </Text>
                          </View>

                          <View style={{ height: 16 }} />
                          <ActionButton
                            label="Télécharger Certificat PDF"
                            onPress={generateFcqPdf}
                            icon="file-pdf-box"
                            variant="secondary"
                          />
                        </View>
                      )}
                    </View>
                  </View>
                );
              })()}
          </View>
        </View>
      </ScrollView>

      <FormModal
        visible={modalVisible}
        title={t('new_analysis')}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        loading={mutation.isPending}
      >
        <FormInput
          label={t('analysis_code')}
          value={formData.code ?? ''}
          editable={false}
          style={{ backgroundColor: '#F1F3F5', color: '#6C757D' }}
        />
        <FormSelect
          label={t('lot_to_analyze')}
          value={formData.lot_id ?? ''}
          options={lots.map((l) => ({ label: `${l.code} - ${l.article?.name}`, value: l.id }))}
          onSelect={(v) => setFormData({ ...formData, lot_id: v })}
        />
        <FormSelect
          label={t('analysis_type')}
          value={formData.fcq_type ?? ''}
          options={[
            { label: 'FCQ-MP — Matière Première', value: 'FCQ-MP' },
            { label: 'FCQ-SAV — Savon', value: 'FCQ-SAV' },
            { label: 'FCQ-PAP — Papier / Emballage', value: 'FCQ-PAP' },
            { label: 'FCQ-VAI — Vaisselle / Détergent', value: 'FCQ-VAI' },
            { label: 'FCQ-ENC — Encre / Colorant', value: 'FCQ-ENC' },
            { label: 'FCQ-COR — Corps gras / Huile', value: 'FCQ-COR' },
            { label: 'FCQ-BOU — Bougie / Cire', value: 'FCQ-BOU' },
            { label: 'FCQ-PF — Produit Fini', value: 'FCQ-PF' },
            { label: 'FCQ-SF — Semi-Fini', value: 'FCQ-SF' },
            { label: 'FCQ-EAU — Eau de process', value: 'FCQ-EAU' },
            { label: 'FCQ-AUTRE — Autre', value: 'FCQ-AUTRE' },
          ]}
          onSelect={(v) => setFormData({ ...formData, fcq_type: v })}
        />
        <FormSelect
          label={t('instrument_used')}
          value={formData.instrument_id ?? ''}
          options={instruments.map((i) => ({ label: i.name, value: i.id }))}
          onSelect={(v) => setFormData({ ...formData, instrument_id: v })}
        />
        <FormInput
          label={t('notes_obs')}
          value={formData.notes ?? ''}
          onChangeText={(val) => setFormData({ ...formData, notes: val })}
        />
      </FormModal>
      {/* Calibration Management Modal */}
      <FormModal
        visible={calibModalVisible}
        title="Gestion des Étalonnages"
        onClose={() => setCalibModalVisible(false)}
        onSave={() => {
          if (
            !calibFormData.instrument_id ||
            !calibFormData.calibration_date ||
            !calibFormData.next_due_date
          ) {
            Alert.alert('Champs manquants', 'Veuillez remplir tous les champs obligatoires.');
            return;
          }
          calibMutation.mutate({
            values: {
              instrument_id: calibFormData.instrument_id,
              calibrated_by: profile?.id,
              calibration_date: calibFormData.calibration_date,
              next_due_date: calibFormData.next_due_date,
              standard_used: calibFormData.standard_used,
              standard_type: calibFormData.standard_type,
              result: calibFormData.result,
              notes: calibFormData.notes,
            },
            type: 'INSERT',
          });
        }}
        loading={calibMutation.isPending}
      >
        <FormSelect
          label="Instrument *"
          value={calibFormData.instrument_id ?? ''}
          options={instruments.map((i) => ({ label: `${i.code} - ${i.name}`, value: i.id }))}
          onSelect={(v) => setCalibFormData({ ...calibFormData, instrument_id: v })}
        />
        <FormInput
          label="Date d'étalonnage *"
          value={calibFormData.calibration_date ?? ''}
          onChangeText={(v) => setCalibFormData({ ...calibFormData, calibration_date: v })}
          placeholder="YYYY-MM-DD"
        />
        <FormInput
          label="Prochaine échéance *"
          value={calibFormData.next_due_date ?? ''}
          onChangeText={(v) => setCalibFormData({ ...calibFormData, next_due_date: v })}
          placeholder="YYYY-MM-DD"
        />
        <FormInput
          label="Étalon utilisé"
          value={calibFormData.standard_used ?? ''}
          onChangeText={(v) => setCalibFormData({ ...calibFormData, standard_used: v })}
        />
        <FormSelect
          label="Type d'étalon"
          value={calibFormData.standard_type ?? ''}
          options={[
            { label: 'Certifié', value: 'CERTIFIE' },
            { label: 'Interne', value: 'INTERNE' },
          ]}
          onSelect={(v) => setCalibFormData({ ...calibFormData, standard_type: v })}
        />
        <FormSelect
          label="Résultat"
          value={calibFormData.result ?? ''}
          options={[
            { label: 'Conforme', value: 'CONFORME' },
            { label: 'Non conforme', value: 'NON_CONFORME' },
          ]}
          onSelect={(v) => setCalibFormData({ ...calibFormData, result: v })}
        />
        <FormInput
          label="Remarques"
          value={calibFormData.notes ?? ''}
          onChangeText={(v) => setCalibFormData({ ...calibFormData, notes: v })}
          multiline
        />
      </FormModal>

      {/* Calibration History Modal */}
      <FormModal
        visible={false} // accessible via un sous-modal
        title="Historique d'étalonnage"
        onClose={() => {}}
        onSave={() => {}}
        hideSaveButton
      >
        {calibLog.slice(0, 10).map((log: any) => (
          <View
            key={log.id}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: '#F1F3F5',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600' }}>{log.instrument?.code}</Text>
            <Text style={{ fontSize: 12, color: '#6C757D' }}>
              {new Date(log.calibration_date).toLocaleDateString()} →{' '}
              {new Date(log.next_due_date).toLocaleDateString()}
            </Text>
          </View>
        ))}
      </FormModal>
    </AnimatedPage>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 24 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  subTitle: { fontSize: 13, color: '#6C757D', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 12 },
  mainGrid: { flexDirection: 'row', gap: 24 },
  leftCol: { width: 300 },
  rightCol: { flex: 1 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ADB5BD',
    letterSpacing: 1,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    padding: 16,
  },
  instRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  borderB: { borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  instId: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ADB5BD',
    fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace',
  },
  instName: { fontSize: 13, color: '#1A1A1A', marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  tableCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    overflow: 'hidden',
  },
  tableHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#F8F9FA' },
  tableTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  tableSub: { fontSize: 12, color: '#6C757D', marginTop: 2 },
  tr: {
    flexDirection: 'row',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
    alignItems: 'center',
  },
  trActive: { backgroundColor: '#F8F9FA' },
  tdCode: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ADB5BD',
    fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace',
  },
  tdArticle: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },
  tdLot: { fontSize: 11, color: '#6C757D', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },
  decisionText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  miniBadge: {
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  miniBadgeText: { fontSize: 9, fontWeight: '800', color: '#1A1A1A' },
  detailCard: {
    marginTop: 24,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  detailTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  detailContent: { padding: 20 },
  detailRow: { flexDirection: 'row', marginBottom: 12 },
  detailLabel: { width: 150, fontSize: 13, color: '#6C757D' },
  detailValue: { flex: 1, fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  decActions: { flexDirection: 'row', gap: 12 },
  restrictedBox: { padding: 12, backgroundColor: '#F8F9FA', borderRadius: 6, alignItems: 'center' },
  restrictedText: { fontSize: 12, color: '#6C757D', fontStyle: 'italic' },
  closedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
  },
  closedText: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  resContainer: { backgroundColor: '#F8F9FA', borderRadius: 8, padding: 12, gap: 8 },
  resRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  resLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A' },
  resSpec: { fontSize: 11, color: '#6C757D', marginTop: 2 },
  resInput: {
    width: 100,
    height: 36,
    borderWidth: 1,
    borderColor: '#D1D9E0',
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    textAlign: 'right',
    fontWeight: '600',
  },
  resInputError: { borderColor: C.err, color: C.err, backgroundColor: '#FFF5F5' },
  resStatus: { width: 40, alignItems: 'flex-end' },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: '#F8F9FA',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  metaItem: { width: '48%', marginBottom: 8 },
  metaLabel: { fontSize: 11, color: '#6C757D', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginTop: 2 },
  qcResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  qcResultLabel: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', marginRight: 8 },
  qcResultValue: { fontSize: 14, fontWeight: '800' },
  rqFormCard: {
    backgroundColor: '#FFF8F5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE8D6',
    padding: 16,
  },
  formField: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#495057', marginBottom: 4 },
  formTextInput: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CED4DA',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  autoTimestamp: { fontSize: 13, color: '#6C757D', fontStyle: 'italic' },
  validationDetailsCard: {
    backgroundColor: '#F4FBF7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D3F9E8',
    padding: 16,
  },
});
