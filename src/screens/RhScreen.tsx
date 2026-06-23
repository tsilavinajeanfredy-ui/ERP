import * as React from 'react';
import {
  ScrollView, StyleSheet, Text, View, TouchableOpacity, Modal,
  Platform, useWindowDimensions, TextInput, ActivityIndicator, Alert, FlatList,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as XLSX from 'xlsx';
import { pickSpreadsheet } from '../lib/filePicker';
import { C, AnimatedPage, ActionButton, FormInput, FormSelect } from '../components/Ui';
import {
  useUserProfile, useNotification, translatePgError,
  useRhPersonnel, useRhSections, useRhAffectations, useRhImportBatches,
  useRhConges, useRhCongesSoldes,
  useRhPointages, useCreatePointage, useUpdatePointage, useDeletePointage,
  RhPersonnelView, RhSection, RhSociete, RhConge, RhPointage,
} from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// ─── Types locaux ─────────────────────────────────────────────────────────────

type Personnel = {
  id: string;
  company: string;
  section: string;
  matricule: string;
  full_name: string;
  hire_date: string;
  contract_type: string;
  weekly_hours: number;
  overtime_hours: number;
  overtime_level: 'Normale' | 'Responsable' | 'Direction';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTRACT_OPTIONS = [
  { label: 'Permanent', value: 'FIXE' },
  { label: 'Temporaire', value: 'TEMPORAIRE' },
];

const normalizeKey = (k: string) =>
  k
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, '')
    .toLowerCase();

const resolveField = (row: Record<string, unknown>, choices: string[]) => {
  const n: Record<string, unknown> = {};
  Object.keys(row).forEach((key) => {
    n[normalizeKey(key)] = (row as Record<string, unknown>)[key];
  });
  for (const c of choices) {
    const v = n[normalizeKey(c)];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
};

// Conversion date Excel sérialisée
const parseExcelDate = (val: unknown): string => {
  if (!val && val !== 0) return '';
  const str = String(val).trim();
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      const [a, b, c] = parts;
      if (a.length === 4) return str.replace(/\//g, '-');
      if (c.length === 4) return `${c}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    }
    return str;
  }
  const num = Number(val);
  if (!isNaN(num) && num > 0) {
    const date = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  return str;
};

const parsePersonnelRow = (row: Record<string, any>, index: number): Personnel => {
  const get = (choices: string[]) => resolveField(row, choices);
  const weekly_hours = Number(
    get([
      'HeuresSemaine',
      'Heures S1',
      'HeuresHebdo',
      'Heures Hebdo',
      'H.HEBDO',
      'Hours',
      'WeeklyHours',
    ]) || 0,
  );
  const overtime_hours = Math.max(0, weekly_hours - 40);
  const overtime_level: Personnel['overtime_level'] =
    overtime_hours <= 0 ? 'Normale' : overtime_hours <= 10 ? 'Responsable' : 'Direction';
  return {
    id: `${Date.now()}-${index}`,
    company: get(['Societe', 'Société', 'Company', 'Entreprise', 'SOCIETE']) || 'NON RENSEIGNE',
    section: get(['Section', 'Departement', 'Service', 'SECTION']) || 'NON RENSEIGNE',
    matricule: get(['Matricule', 'MATRICULE', 'ID', 'Reference']) || `EMP-${index + 1}`,
    full_name:
      get(['Nom', 'NOM', 'NomPrenoms', 'Nom et Prenoms', 'NomPrenom', 'FullName', 'Full Name']) ||
      'Sans nom',
    hire_date: parseExcelDate(
      get(['DateEmbauche', 'Date Embauche', 'EMBAUCHE', 'HireDate', 'DateDeRecrutement']),
    ),
    contract_type: get(['Type', 'TYPE', 'TypeContrat', 'Type de contrat', 'Contrat']) || 'Fixe',
    weekly_hours,
    overtime_hours,
    overtime_level,
  };
};

const hasHireDate = (person: any) => {
  const dateValue = String(person.hire_date || person.date_embauche || '').trim();
  return dateValue.length > 0;
};

const normalizeCode = (v: string) =>
  v
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const splitFullName = (fullName: string) => {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  return { nom: parts[0] || '', prenoms: parts.slice(1).join(' ') || '' };
};

const getIsoWeek = (date: Date) => {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNr + 3);
  const firstThursday = tmp.valueOf();
  tmp.setUTCMonth(0, 1);
  if (tmp.getUTCDay() !== 4) tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay() + 7) % 7));
  return 1 + Math.ceil((firstThursday - tmp.valueOf()) / 604800000);
};

const getCurrentWeekLabel = () => {
  const d = new Date();
  return `S${getIsoWeek(d)}/${d.getFullYear()}`;
};
const parseKontractType = (v: string) => {
  const s = String(v || '')
    .toLowerCase()
    .trim();
  if (s.includes('temp') || s === 'temporaire') return 'TEMPORAIRE';
  return 'FIXE';
};

type HeuresRow = {
  id: string;
  matricule: string;
  nom_complet: string;
  personnel_id: string | null;
  semaine_label: string;
  annee: number;
  semaine_num: number;
  lundi: number;
  mardi: number;
  mercredi: number;
  jeudi: number;
  vendredi: number;
  samedi: number;
  dimanche: number;
  heures_totales: number;
  heures_supp: number;
  note: string;
  _error?: string;
};

// Format import "une ligne par jour" : Matricule | Nom Complet | Section | Date | Heures | Note
type HeuresRowJour = {
  id: string;
  matricule: string;
  nom_complet: string;
  section: string;
  personnel_id: string | null;
  date_travail: string; // ISO YYYY-MM-DD
  semaine_label: string;
  annee: number;
  semaine_num: number;
  heures: number;
  note: string;
  _error?: string;
};

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  EN_ATTENTE: { label: 'En attente', bg: '#FEF3C7', text: '#92400E', icon: 'clock-outline' },
  EN_ATTENTE_PLAN: {
    label: 'Att. valid. PLAN',
    bg: '#FEF9C3',
    text: '#78350F',
    icon: 'clipboard-clock-outline',
  },
  EN_ATTENTE_RH: {
    label: 'Att. valid. RH',
    bg: '#EDE9FE',
    text: '#5B21B6',
    icon: 'account-clock-outline',
  },
  APPROUVE: { label: 'Approuvé', bg: '#D1FAE5', text: '#065F46', icon: 'check-circle-outline' },
  REJETE: { label: 'Rejeté', bg: '#FEE2E2', text: '#991B1B', icon: 'close-circle-outline' },
  TERMINE: { label: 'Terminé', bg: '#E0E7FF', text: '#3730A3', icon: 'flag-checkered' },
};

const OT_CONFIG: Record<string, { label: string; color: string }> = {
  Normale: { label: 'Normale', color: '#15803D' },
  Responsable: { label: 'Resp. — justif.', color: '#D97706' },
  Direction: { label: 'Dir. — comité', color: '#BE123C' },
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

type Tab =
  | 'personnels'
  | 'affectations'
  | 'heures_sup'
  | 'saisie'
  | 'budget'
  | 'historique'
  | 'conges';

type RhRouteParams = { Rh: { tab?: Tab } | undefined };
type RhRouteProp   = RouteProp<RhRouteParams, 'Rh'>;

const CONGE_TYPE_OPTIONS = [
  { label: 'Congé payé', value: 'CONGE_PAYE' },
  { label: 'Maladie', value: 'MALADIE' },
  { label: 'Sans solde', value: 'SANS_SOLDE' },
  { label: 'Maternité', value: 'MATERNITE' },
  { label: 'Exceptionnel', value: 'EXCEPTIONNEL' },
  { label: 'Autre', value: 'AUTRE' },
];

const CONGE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONGE_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

// Workflow 2 niveaux (migration 067) : EN_ATTENTE → VALIDE_RH → VALIDE
// Anciens statuts REFUSE/VALIDE_PAR conservés pour rétrocompatibilité
const CONGE_STATUT_META: Record<string, { label: string; shortLabel: string; color: string; bg: string; icon: string }> = {
  EN_ATTENTE:  { label: 'En attente — validation RH', shortLabel: 'Attente RH',  color: '#92400E', bg: '#FEF3C7', icon: 'clock-outline' },
  VALIDE_RH:   { label: 'Validé RH — en attente DPI',  shortLabel: 'Attente DPI', color: '#1D4ED8', bg: '#DBEAFE', icon: 'check-circle-outline' },
  VALIDE:      { label: 'Validé définitivement',        shortLabel: 'Validé',      color: '#166534', bg: '#DCFCE7', icon: 'check-decagram-outline' },
  REFUSE_RH:   { label: 'Refusé par le RH',            shortLabel: 'Refusé (RH)', color: '#991B1B', bg: '#FEE2E2', icon: 'close-circle-outline' },
  REFUSE_DPI:  { label: 'Refusé par la DPI',           shortLabel: 'Refusé (DPI)',color: '#991B1B', bg: '#FEE2E2', icon: 'close-circle-outline' },
  // Rétrocompat anciens enregistrements
  REFUSE:      { label: 'Refusé',                       shortLabel: 'Refusé',      color: '#991B1B', bg: '#FEE2E2', icon: 'close-circle-outline' },
  ANNULE:      { label: 'Annulé',                       shortLabel: 'Annulé',      color: '#374151', bg: '#E5E7EB', icon: 'cancel' },
};

const diffDaysInclusive = (debut: string, fin: string): number => {
  if (!debut || !fin) return 0;
  const d1 = new Date(debut);
  const d2 = new Date(fin);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 < d1) return 0;
  return Math.round((d2.getTime() - d1.getTime()) / 86400000) + 1;
};

export function RhScreen() {
  const { profile } = useUserProfile();
  const { width } = useWindowDimensions();
  const isMobile = width < 900;
  const queryClient = useQueryClient();
  const notifMutation = useNotification();

  const role          = profile?.role;
  const isReadOnly    = role === 'DPI';
  const isRprod       = role === 'RPROD';
  const isTeamManager = role === 'RESPONSABLE' || role === 'CHEF_LIGNE';
  const userScope     = profile?.scope || null;

  // ── Navigation params → activeTab sync (fix sidebar navigation blocking) ──
  // useFocusEffect est nécessaire car quand on navigue vers le MÊME écran déjà monté,
  // useEffect seul peut ne pas se déclencher si React Navigation réutilise l'instance.
  const route     = useRoute<RhRouteProp>();
  const [activeTab, setActiveTab] = React.useState<Tab>(
    () => ((route.params as { tab?: string } | undefined)?.tab as Tab | undefined) ?? 'personnels'
  );

  // 1) Au focus (retour sur l'écran ou premier montage)
  useFocusEffect(
    React.useCallback(() => {
      const tab = (route.params as { tab?: string } | undefined)?.tab as Tab | undefined;
      if (tab) setActiveTab(tab);
    }, [route.params])
  );

  // 2) Pendant que l'écran est déjà visible (navigation sidebar → même écran)
  // useEffect sur route.params couvre les changements de params sans remontage
  React.useEffect(() => {
    const tab = (route.params as { tab?: string } | undefined)?.tab as Tab | undefined;
    if (tab) setActiveTab(tab);
  }, [route.params]);

  // Import state
  const [importPreview,  setImportPreview]  = React.useState<Personnel[]>([]);
  const [importError,    setImportError]    = React.useState<string | null>(null);
  const [importSuccess,  setImportSuccess]  = React.useState(false);
  const [importProgress, setImportProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [importErrors,   setImportErrors]   = React.useState<{ matricule: string; msg: string }[]>([]);
  const [showPreview,    setShowPreview]    = React.useState(false);

  // Smart sync state
  const [isSyncing,   setIsSyncing]   = React.useState(false);
  const [syncReport,  setSyncReport]  = React.useState<{
    inserted: number; updated: number; unchanged: number; errors: { matricule: string; msg: string }[];
  } | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = React.useState('');
  const [filterSociete, setFilterSociete] = React.useState('');
  const [filterSection, setFilterSection] = React.useState('');
  const [filterContrat, setFilterContrat] = React.useState<'' | 'FIXE' | 'TEMPORAIRE'>('');

  // Manual modal
  const [manualModalVisible, setManualModalVisible] = React.useState(false);
  const [manualForm, setManualForm] = React.useState<Partial<Personnel>>({
    company: '',
    section: '',
    matricule: '',
    full_name: '',
    hire_date: '',
    contract_type: 'Fixe',
    weekly_hours: 40,
  });

  // Reject modal
  const [rejectModal, setRejectModal] = React.useState<{ id: string } | null>(null);
  const [rejectComment, setRejectComment] = React.useState('');

  // Calendrier navigable
  const [calNav, setCalNav] = React.useState<{ year: number; month: number }>(() => {
    const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() };
  });

  // Edition acquis soldes + search + filtres + pagination
  const [editAcquisId, setEditAcquisId] = React.useState<string | null>(null);
  const [editAcquisVal, setEditAcquisVal] = React.useState('');
  const [soldesSearch, setSoldesSearch] = React.useState('');
  const [soldesSociete, setSoldesSociete] = React.useState('');
  const [soldesSection, setSoldesSection] = React.useState('');
  const [soldesPage, setSoldesPage] = React.useState(0);
  const SOLDES_PAGE_SIZE = 30;

  // ── Congés ─────────────────────────────────────────────────────────────────
  const [congeModalVisible, setCongeModalVisible] = React.useState(false);
  const [congeSaving, setCongeSaving] = React.useState(false);
  const [congeForm, setCongeForm] = React.useState<{
    personnel_id: string;
    type_conge: string;
    date_debut: string;
    date_fin: string;
    motif: string;
  }>({ personnel_id: '', type_conge: 'CONGE_PAYE', date_debut: '', date_fin: '', motif: '' });
  // « Pour qui ? » : seuls les responsables d'équipe peuvent demander pour un autre.
  const [congePourQui, setCongePourQui] = React.useState<'MOI' | 'EQUIPE'>('MOI');
  const [congeSelfId, setCongeSelfId] = React.useState<string>('');
  // level : indique si le refus est effectué au niveau RH (1er) ou DPI (2e)
  const [congeReject, setCongeReject] = React.useState<{ id: string; level: 'RH' | 'DPI' } | null>(null);
  const [congeRejectComment, setCongeRejectComment] = React.useState('');

  // ── CRUD Personnel modal ───────────────────────────────────────────────────
  const [crudModalVisible, setCrudModalVisible] = React.useState(false);
  const [crudEditId, setCrudEditId] = React.useState<string | null>(null);
  const [crudIsSaving, setCrudIsSaving] = React.useState(false);
  const [crudForm, setCrudForm] = React.useState<{
    matricule: string;
    nom: string;
    prenoms: string;
    societe_id: string;
    section_id: string;
    date_embauche: string;
    type_contrat: string;
  }>({
    matricule: '',
    nom: '',
    prenoms: '',
    societe_id: '',
    section_id: '',
    date_embauche: '',
    type_contrat: 'FIXE',
  });
  const [crudSocietes, setCrudSocietes] = React.useState<RhSociete[]>([]);
  const [crudSections, setCrudSections] = React.useState<RhSection[]>([]);
  const [filteredSections, setFilteredSections] = React.useState<RhSection[]>([]);

  // Pagination
  const [personnelPage, setPersonnelPage] = React.useState(0);
  const PERSONNEL_PAGE_SIZE = 30;

  // Affectation form
  const [assignFrom, setAssignFrom] = React.useState('');
  const [assignTo, setAssignTo] = React.useState('');
  const [assignDate, setAssignDate] = React.useState('');
  const [assignHours, setAssignHours] = React.useState<number>(8);
  const [assignNote, setAssignNote] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [rhSelectedIds, setRhSelectedIds] = React.useState<string[]>([]);

  // Budget form
  const [budgetSection, setBudgetSection] = React.useState('');
  const [budgetHeures, setBudgetHeures] = React.useState<number>(0);
  const [budgetPeriode, setBudgetPeriode] = React.useState('');

  // Pointages (Heures détaillées)
  const [pointagePeriodeFilter, setPointagePeriodeFilter] = React.useState<string>(getCurrentWeekLabel());
  const [pointageEvenementFilter, setPointageEvenementFilter] = React.useState<string>('');
  const [pointageSectionFilter, setPointageSectionFilter] = React.useState<string>('');
  const [pointageModalVisible, setPointageModalVisible] = React.useState(false);
  const [pointageForm, setPointageForm] = React.useState<Partial<RhPointage>>({
    section_id: '',
    periode: getCurrentWeekLabel(),
    evenement: 'Production',
    heures_normales: 0,
    heures_supp: 0,
    date_pointage: new Date().toISOString().split('T')[0],
  });

  // Saisie heures — période de paie 15→14
  const [saisieSemaine, setSaisieSemaine] = React.useState<string>(getCurrentWeekLabel()); // conservé pour compat récap
  const [saisiePersonnelId, setSaisiePersonnelId] = React.useState<string>('');
  const [saisieNormales, setSaisieNormales] = React.useState<string>('40');
  const [saisieSupp, setSaisieSupp] = React.useState<string>('0');
  const [saisieNote, setSaisieNote] = React.useState<string>('');
  const [saisieIsSaving, setSaisieIsSaving] = React.useState(false);
  const [saisieSuccess, setSaisieSuccess] = React.useState(false);

  // Saisie — filtre/recherche employé
  const [saisieSearch, setSaisieSearch] = React.useState('');
  const [saisieFilterSection, setSaisieFilterSection] = React.useState('');
  const [saisieFilterSociete, setSaisieFilterSociete] = React.useState('');
  const [saisiePageIndex, setSaisiePageIndex] = React.useState(0);

  // Scroll synchronisé pour la table de saisie (header dates <-> lignes employés)
  const headerScrollRef = React.useRef<ScrollView>(null);
  const rowScrollRefs = React.useRef<(ScrollView | null)[]>([]);
  const isSyncingScroll = React.useRef(false);
  const syncScrollX = React.useCallback((x: number, sourceIndex: number | 'header') => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (sourceIndex !== 'header') {
      headerScrollRef.current?.scrollTo({ x, animated: false });
    }
    rowScrollRefs.current.forEach((ref, idx) => {
      if (idx !== sourceIndex) ref?.scrollTo({ x, animated: false });
    });
    setTimeout(() => { isSyncingScroll.current = false; }, 50);
  }, []);

  // Période de paie active (15→14) — calculée à l'init
  const getActivePeriode = (): { debut: Date; fin: Date; label: string } => {
    const now = new Date();
    const day = now.getDate();
    let debut: Date;
    if (day >= 15) {
      debut = new Date(now.getFullYear(), now.getMonth(), 15);
    } else {
      debut = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    }
    const fin = new Date(debut.getFullYear(), debut.getMonth() + 1, 14);
    const label = debut.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return { debut, fin, label: label.charAt(0).toUpperCase() + label.slice(1) };
  };
  const [activePeriode, setActivePeriode] = React.useState<{
    debut: Date;
    fin: Date;
    label: string;
  }>(getActivePeriode);

  const navPeriode = React.useCallback((dir: -1 | 1) => {
    const d = new Date(activePeriode.debut);
    d.setMonth(d.getMonth() + dir);
    const fin = new Date(d.getFullYear(), d.getMonth() + 1, 14);
    const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    setActivePeriode({
      debut: d,
      fin,
      label: label.charAt(0).toUpperCase() + label.slice(1),
    });
  }, [activePeriode.debut]);

  // Génère la liste des dates de la période (debut inclus → fin inclus)
  const getPeriodeDates = (debut: Date, fin: Date): Date[] => {
    const dates: Date[] = [];
    const cur = new Date(debut);
    while (cur <= fin) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  };
  const periodeDates = React.useMemo(
    () => getPeriodeDates(activePeriode.debut, activePeriode.fin),
    [activePeriode],
  );

  // Données journalières chargées depuis Supabase pour la période active
  type JourData = { personnel_id: string; date_travail: string; heures: number; note: string };
  const [joursData, setJoursData] = React.useState<JourData[]>([]);
  const [joursLoading, setJoursLoading] = React.useState(false);

  // --- Budgets Planifiés ---
  const [plannedBudgets, setPlannedBudgets] = React.useState<any[]>([]);
  const [editBudgetModal, setEditBudgetModal] = React.useState<{visible: boolean, budget: any, newHeures: number}>({visible: false, budget: null, newHeures: 0});
  
  const loadPlannedBudgets = React.useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from('rh_budgets_active').select('*').order('created_at', { ascending: false });
    if (!error && data) setPlannedBudgets(data);
  }, []);

  React.useEffect(() => {
    loadPlannedBudgets();
  }, [loadPlannedBudgets]);

  const loadJoursData = React.useCallback(async () => {
    if (!supabase) return;
    setJoursLoading(true);
    const debut = activePeriode.debut.toISOString().slice(0, 10);
    const fin = activePeriode.fin.toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('rh_heures_journalieres')
      .select('personnel_id, date_travail, heures, note')
      .gte('date_travail', debut)
      .lte('date_travail', fin);
    if (!error && data) setJoursData(data as JourData[]);
    setJoursLoading(false);
  }, [activePeriode]);

  React.useEffect(() => {
    loadJoursData();
  }, [loadJoursData]);

  // Lookup rapide heures[personnelId][date] = heures
  const heuresMap = React.useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    for (const j of joursData) {
      if (!m[j.personnel_id]) m[j.personnel_id] = {};
      m[j.personnel_id][j.date_travail] = j.heures;
    }
    return m;
  }, [joursData]);

  // Total + supp par personnel sur la période (seuil mensuel ≈ 173.33h = 40h × 52/12)
  const SEUIL_MENSUEL = 173.33;
  const getTotaux = (pid: string) => {
    const total = Object.values(heuresMap[pid] ?? {}).reduce((a, b) => a + b, 0);
    return { total, supp: Math.max(0, total - SEUIL_MENSUEL) };
  };

  // Import heures journalières
  const [heuresPreview, setHeuresPreview] = React.useState<HeuresRow[]>([]);
  const [heuresImporting, setHeuresImporting] = React.useState(false);
  const [heuresImportDone, setHeuresImportDone] = React.useState<{
    ok: number;
    errors: { matricule: string; msg: string }[];
  } | null>(null);
  const [showHeuresPreview, setShowHeuresPreview] = React.useState(false);
  // Format "une ligne par jour"
  const [heuresJourPreview, setHeuresJourPreview] = React.useState<HeuresRowJour[]>([]);
  const [showHeuresJourPreview, setShowHeuresJourPreview] = React.useState(false);
  const [heuresImportDiagnostics, setHeuresImportDiagnostics] = React.useState<any>(null);
  // Modal CRUD saisie journée
  const [heuresCrudModal, setHeuresCrudModal] = React.useState<{
    visible: boolean;
    personnelId: string;
    personnelNom: string;
    dateISO: string;
    heuresCourantes: number;
    note: string;
  }>({
    visible: false,
    personnelId: '',
    personnelNom: '',
    dateISO: '',
    heuresCourantes: 0,
    note: '',
  });

  // ── Hooks ─────────────────────────────────────────────────────────────────

  const { data: personnel = [] } = useRhPersonnel();
  const { data: sections = [] } = useRhSections();
  const { data: demandes = [], refetch: refetchDemandes } = useRhAffectations();
  const { data: batches = [] } = useRhImportBatches();
  
  // Pointages hooks
  const { data: pointages = [], isPending: loadingPointages } = useRhPointages(
    pointagePeriodeFilter || undefined,
    pointageEvenementFilter || undefined,
    pointageSectionFilter || undefined
  );
  const createPointage = useCreatePointage();
  const updatePointage = useUpdatePointage();
  const deletePointage = useDeletePointage();
  const { data: conges = [] } = useRhConges();
  const { data: congeSoldes = [] } = useRhCongesSoldes();

  // ── Filters ───────────────────────────────────────────────────────────────

  // Agrégation automatique des heures par section (pour l'onglet Budget)
  const heuresParSection = React.useMemo(() => {
    const sectionMap: Record<string, { sectionId: string; nomSection: string; nbPersonnes: number; totalNormales: number; totalSupp: number }> = {};
    
    for (const p of personnel) {
      if (!p.actif || !p.section_id) continue;
      const { total, supp } = getTotaux(p.id);
      if (total === 0) continue;
      
      const sectionNom = p.section_nom || sections.find(s => s.id === p.section_id)?.nom || p.section_id;
      
      if (!sectionMap[p.section_id]) {
        sectionMap[p.section_id] = {
          sectionId: p.section_id,
          nomSection: sectionNom,
          nbPersonnes: 0,
          totalNormales: 0,
          totalSupp: 0,
        };
      }
      sectionMap[p.section_id].nbPersonnes += 1;
      sectionMap[p.section_id].totalNormales += Math.max(0, total - supp);
      sectionMap[p.section_id].totalSupp += supp;
    }
    
    return Object.values(sectionMap).sort((a, b) => a.nomSection.localeCompare(b.nomSection));
  }, [joursData, personnel, sections]);

  const mySection = React.useMemo(() => {
    if (!isRprod || !userScope) return null;
    return (
      sections.find(
        (s) =>
          s.code === userScope ||
          s.nom === userScope ||
          normalizeCode(s.nom) === normalizeCode(userScope),
      ) || null
    );
  }, [isRprod, userScope, sections]);

  // Section/équipe du responsable, utilisée pour scoper la liste des employés
  // sélectionnables lors d'une demande de congé « pour un membre de mon équipe ».
  const congeMySection = React.useMemo(() => {
    if (!isTeamManager || !userScope) return null;
    return (
      sections.find(
        (s) =>
          s.code === userScope ||
          s.nom === userScope ||
          normalizeCode(s.nom) === normalizeCode(userScope),
      ) || null
    );
  }, [isTeamManager, userScope, sections]);

  const congeTeamPersonnel = React.useMemo(() => {
    if (!isTeamManager) return [];
    return congeMySection
      ? personnel.filter((p) => p.section_id === congeMySection.id)
      : personnel;
  }, [isTeamManager, congeMySection, personnel]);

  const visiblePersonnel = React.useMemo(() => {
    let base =
      !isRprod || !mySection ? personnel : personnel.filter((p) => p.section_id === mySection.id);
    if (filterSociete) {
      base = base.filter((p) => p.societe_id === filterSociete);
    }
    if (filterSection) {
      base = base.filter((p) => p.section_id === filterSection);
    }
    if (filterContrat) {
      base = base.filter((p) => p.type_contrat === filterContrat);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      base = base.filter((p) =>
        p.nom_complet.toLowerCase().includes(q) ||
        p.matricule.toLowerCase().includes(q) ||
        p.section_nom.toLowerCase().includes(q)
      );
    }
    return [...base].sort((a, b) => {
      const aNum = parseInt(a.matricule, 10);
      const bNum = parseInt(b.matricule, 10);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.matricule.localeCompare(b.matricule);
    });
  }, [isRprod, mySection, personnel, searchQuery, filterSociete, filterSection, filterContrat]);

  // ── OT level helper (défini ici pour être accessible par les useMemos suivants) ──
  const getOtLevel = React.useCallback(
    (hs: number): 'Normale' | 'Responsable' | 'Direction' =>
      hs <= 0 ? 'Normale' : hs <= 10 ? 'Responsable' : 'Direction',
    [],
  );

  // Période: lignes calculées d'heures + heures supp pour l'onglet 'heures_sup'
  // NB: useMemo APRÈS visiblePersonnel pour éviter la boucle infinie
  const periodOtRows = React.useMemo(() => {
    return visiblePersonnel
      .map((p) => {
        const { total, supp } = getTotaux(p.id);
        return {
          id: p.id,
          personnel_id: p.id,
          matricule: p.matricule,
          nom_complet: p.nom_complet,
          section_nom: p.section_nom || '',
          total,
          supp,
        };
      })
      .filter((r) => r.total > 0 || r.supp > 0);
  }, [activePeriode, heuresMap, visiblePersonnel]);

  const periodOtCounts = React.useMemo(() => {
    const resp = periodOtRows.filter((r) => getOtLevel(r.supp) === 'Responsable').length;
    const dir = periodOtRows.filter((r) => getOtLevel(r.supp) === 'Direction').length;
    return { resp, dir };
  }, [periodOtRows, getOtLevel]);

  React.useEffect(() => {
    setPersonnelPage(0);
  }, [searchQuery, filterSociete, filterSection, filterContrat]);
  React.useEffect(() => {
    setSaisiePageIndex(0);
  }, [saisieSearch, saisieFilterSection, saisieFilterSociete]);

  const totalPages = Math.ceil(visiblePersonnel.length / PERSONNEL_PAGE_SIZE);
  const pagedPersonnel = visiblePersonnel.slice(
    personnelPage * PERSONNEL_PAGE_SIZE,
    (personnelPage + 1) * PERSONNEL_PAGE_SIZE,
  );

  const visibleDemandes = React.useMemo(() => {
    if (!isRprod || !mySection) return demandes;
    return demandes.filter(
      (d) => d.section_demandeur === mySection.id || d.section_fournisseur === mySection.id,
    );
  }, [isRprod, mySection, demandes]);

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const totalPersonnel = visiblePersonnel.length;
  const overtimeCount = visiblePersonnel.filter((p) => p.heures_supp_derniere_semaine > 0).length;
  const respOTCount = visiblePersonnel.filter(
    (p) => p.heures_supp_derniere_semaine > 10 && p.heures_supp_derniere_semaine <= 20,
  ).length;
  const dirOTCount = visiblePersonnel.filter((p) => p.heures_supp_derniere_semaine > 20).length;
  const pendingDemandes = demandes.filter((d) => d.statut === 'EN_ATTENTE').length;
  const pendingCongesRhCount  = conges.filter((c) => c.statut === 'EN_ATTENTE').length;
  const pendingCongesDpiCount = conges.filter((c) => c.statut === 'VALIDE_RH').length;
  const pendingCongesCount    = pendingCongesRhCount + pendingCongesDpiCount; // total en circuit
  const validesCount  = conges.filter((c) => c.statut === 'VALIDE').length;
  const refusesCount  = conges.filter((c) => ['REFUSE','REFUSE_RH','REFUSE_DPI'].includes(c.statut)).length;
  const totalBudgetH = visiblePersonnel.reduce(
    (acc, p) => acc + (p.heures_derniere_semaine || 0),
    0,
  );
  const totalSupH = visiblePersonnel.reduce(
    (acc, p) => acc + (p.heures_supp_derniere_semaine || 0),
    0,
  );

  // ── Helpers ───────────────────────────────────────────────────────────────

  const sectionOptions = React.useMemo(() => {
    return sections
      .filter((s, idx, arr) => arr.findIndex((x) => x.nom === s.nom) === idx)
      .map((s) => ({ label: s.nom, value: s.id }));
  }, [sections]);

  // Sections exclues de la liste d'affectation (services support/admin)
  const SECTIONS_EXCLUES_AFFECTATION = ['admin', 'chimie', 'direction', 'controle room', 'contrôle room', 'maintenance', 'securite', 'sécurité'];
  const sectionOptionsAffectation = React.useMemo(() => {
    return sections
      .filter((s, idx, arr) => arr.findIndex((x) => x.nom === s.nom) === idx)
      .filter((s) => !SECTIONS_EXCLUES_AFFECTATION.includes((s.nom || '').toLowerCase().trim()))
      .map((s) => ({ label: s.nom, value: s.id }));
  }, [sections]);
  const sectionById = Object.fromEntries(sections.map((s) => [s.id, s]));

  // Options for société/section filters
  const societeOptions = React.useMemo(() => {
    const seen = new Set<string>();
    const opts: { label: string; value: string }[] = [];
    for (const p of personnel) {
      if (p.societe_id && !seen.has(p.societe_id)) {
        seen.add(p.societe_id);
        opts.push({ label: p.societe_nom || p.societe_code, value: p.societe_id });
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label));
  }, [personnel]);

  const sectionFilterOptions = React.useMemo(() => {
    const base = filterSociete
      ? sections.filter((s) => s.societe_id === filterSociete)
      : sections;
    return base.map((s) => ({ label: s.nom, value: s.id }));
  }, [sections, filterSociete]);

  const setAlert = (msg: string) => {
    setImportError(msg);
    setTimeout(() => setImportError(null), 6000);
  };

  const invalidateAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['rh_personnel_view'] });
    await queryClient.invalidateQueries({ queryKey: ['rh_affectations_demandes'] });
    await queryClient.invalidateQueries({ queryKey: ['rh_sections'] });
    await queryClient.invalidateQueries({ queryKey: ['rh_import_batches'] });
  };

  // Charger sociétés et sections pour le modal CRUD
  React.useEffect(() => {
    if (!supabase) return;
    supabase
      .from('rh_societes')
      .select('id, code, nom, active')
      .eq('active', true)
      .then(({ data }: { data: any }) => {
        if (data) setCrudSocietes(data as RhSociete[]);
      });
    supabase
      .from('rh_sections')
      .select('id, societe_id, code, nom, active')
      .eq('active', true)
      .then(({ data }: { data: any }) => {
        if (data) setCrudSections(data as RhSection[]);
      });
  }, []);

  // ── ensureSociete / ensureSection  ────────────────────────────────────────
  // Utilise SELECT + INSERT séparé pour éviter le 409 Conflict du upsert
  // (Supabase upsert exige un index UNIQUE côté DB + header Prefer:resolution=merge-duplicates)

  const ensureSociete = async (
    companyName: string,
    cache: Map<string, RhSociete>,
  ): Promise<RhSociete> => {
    if (!supabase) throw new Error('Supabase not configured');
    const code = normalizeCode(companyName || 'NON RENSEIGNE');
    if (cache.has(code)) return cache.get(code)!;
    // 1. Chercher existant
    const { data: existing } = await supabase
      .from('rh_societes')
      .select('*')
      .eq('code', code)
      .maybeSingle();
    if (existing) {
      cache.set(code, existing as RhSociete);
      return existing as RhSociete;
    }
    // 2. Insérer — si race condition, re-chercher
    const { data: created, error } = await supabase
      .from('rh_societes')
      .insert({ code, nom: companyName })
      .select()
      .single();
    if (error) {
      // code 23505 = unique_violation : la ligne a été créée entre le select et l'insert
      if (error.code === '23505') {
        const { data: retry } = await supabase
          .from('rh_societes')
          .select('*')
          .eq('code', code)
          .maybeSingle();
        if (retry) {
          cache.set(code, retry as RhSociete);
          return retry as RhSociete;
        }
      }
      throw error;
    }
    cache.set(code, created as RhSociete);
    return created as RhSociete;
  };

  const ensureSection = async (
    sectionName: string, societeId: string,
    cache: Map<string, RhSection>
  ): Promise<RhSection> => {
    if (!supabase) throw new Error('Supabase not configured');
    const code     = normalizeCode(sectionName || 'NON RENSEIGNE');
    const cacheKey = `${societeId}:${code}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;
    const { data: existing } = await supabase
      .from('rh_sections').select('*').eq('societe_id', societeId).eq('code', code).maybeSingle();
    if (existing) { cache.set(cacheKey, existing as RhSection); return existing as RhSection; }
    const { data: created, error } = await supabase
      .from('rh_sections').insert({ societe_id: societeId, code, nom: sectionName }).select().single();
    if (error) {
      if (error.code === '23505') {
        const { data: retry } = await supabase.from('rh_sections').select('*').eq('societe_id', societeId).eq('code', code).maybeSingle();
        if (retry) { cache.set(cacheKey, retry as RhSection); return retry as RhSection; }
      }
      throw error;
    }
    cache.set(cacheKey, created as RhSection);
    return created as RhSection;
  };

  // ── safeUpsertPersonnel ───────────────────────────────────────────────────
  // Remplace le upsert Supabase pour éviter le 409.
  // Stratégie : SELECT par matricule → si existe UPDATE, sinon INSERT.

  const safeUpsertPersonnel = async (row: {
    matricule: string;
    nom: string;
    prenoms: string;
    societe_id: string;
    section_id: string;
    date_embauche: string;
    type_contrat: string;
    actif: boolean;
  }): Promise<string | null> => {
    if (!supabase) return null;
    const { data: existing } = await supabase
      .from('rh_personnels')
      .select('id')
      .eq('matricule', row.matricule)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('rh_personnels')
        .update({
          nom: row.nom,
          prenoms: row.prenoms,
          societe_id: row.societe_id,
          section_id: row.section_id,
          date_embauche: row.date_embauche,
          type_contrat: row.type_contrat,
          actif: row.actif,
        })
        .eq('id', (existing as any).id);
      if (error) throw error;
      return (existing as any).id;
    }
    const { data: created, error } = await supabase
      .from('rh_personnels')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;
    return (created as any).id;
  };

  // ── safeUpsertHeures ──────────────────────────────────────────────────────

  const safeUpsertHeures = async (row: {
    personnel_id: string;
    semaine_label: string;
    annee: number;
    semaine_num: number;
    heures_totales: number;
    import_batch_id: string;
  }) => {
    if (!supabase) return;
    const { data: existing } = await supabase
      .from('rh_heures_hebdo')
      .select('id')
      .eq('personnel_id', row.personnel_id)
      .eq('semaine_label', row.semaine_label)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('rh_heures_hebdo')
        .update({ heures_totales: row.heures_totales, import_batch_id: row.import_batch_id })
        .eq('id', (existing as any).id);
      if (error) console.warn('Heures update error:', error.message);
    } else {
      const { error } = await supabase.from('rh_heures_hebdo').insert(row);
      if (error) console.warn('Heures insert error:', error.message);
    }
  };

  // ── persistPersonnelBatch ────────────────────────────────────────────────

  const persistPersonnelBatch = async (items: Personnel[]) => {
    if (!supabase) throw new Error('Supabase not configured');
    const batchId = `IMPORT-${Date.now()}`;
    const weekLabel = getCurrentWeekLabel();
    const year = new Date().getFullYear();
    const weekNum = getIsoWeek(new Date());
    const errors: { matricule: string; msg: string }[] = [];

    const societeCache = new Map<string, RhSociete>();
    const sectionCache = new Map<string, RhSection>();

    // Pré-charger sociétés/sections distinctes (réduit les allers-retours)
    const distinctCompanies = [
      ...new Set(items.map((i) => normalizeCode(i.company || 'NON RENSEIGNE'))),
    ];
    for (const item of items) {
      const cKey = normalizeCode(item.company || 'NON RENSEIGNE');
      if (!societeCache.has(cKey)) {
        try {
          await ensureSociete(item.company || 'NON RENSEIGNE', societeCache);
        } catch {
          /* ignoré, sera capturé item par item */
        }
      }
    }
    for (const item of items) {
      const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
      if (!societe) continue;
      const sKey = `${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`;
      if (!sectionCache.has(sKey)) {
        try {
          await ensureSection(item.section || 'NON RENSEIGNE', societe.id, sectionCache);
        } catch {
          /* ignoré */
        }
      }
    }

    // Traiter ligne par ligne avec progression
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
        if (!societe) throw new Error(`Société introuvable : ${item.company}`);
        const section = sectionCache.get(
          `${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`,
        );
        if (!section) throw new Error(`Section introuvable : ${item.section}`);

        const { nom, prenoms } = splitFullName(item.full_name);
        const pid = await safeUpsertPersonnel({
          matricule: item.matricule,
          nom,
          prenoms,
          societe_id: societe.id,
          section_id: section.id,
          date_embauche: item.hire_date || new Date().toISOString().slice(0, 10),
          type_contrat: parseKontractType(item.contract_type),
          actif: true,
        });

        if (pid && !isNaN(Number(item.weekly_hours))) {
          await safeUpsertHeures({
            personnel_id: pid, semaine_label: weekLabel,
            annee: year, semaine_num: weekNum,
            heures_totales: item.weekly_hours, import_batch_id: batchId,
          });
        }
      } catch (e: unknown) {
        errors.push({ matricule: item.matricule, msg: translatePgError(e) });
      }
      setImportProgress({ done: i + 1, total: items.length });
    }

    setImportErrors(errors);
    await invalidateAll();

    // Notification interne aux RH
    try {
      notifMutation.mutate({
        to_role: 'RH',
        subject: 'Import personnel effectué',
        message: `${items.length - errors.length} employé(s) importé(s)${errors.length > 0 ? `, ${errors.length} erreur(s)` : ''}.`,
        type: 'internal',
        category: 'SYSTEM',
      });
    } catch (_) {
      /* non bloquant */
    }
  };

  // ── Export Excel ──────────────────────────────────────────────────────────

  const visiblePersonnelWithDates = React.useMemo(
    () => visiblePersonnel.filter(hasHireDate),
    [visiblePersonnel],
  );

  const exportExcel = () => {
    const rows = visiblePersonnelWithDates.map((p) => ({
      Matricule: p.matricule,
      Nom: p.nom_complet,
      Section: p.section_nom,
      Société: p.societe_nom,
      'Type contrat': p.type_contrat,
      'Date embauche': p.date_embauche,
      'H. hebdo': Number((p.heures_derniere_semaine ?? 0).toFixed(2)),
      'Heures Supplémentaires': Number((p.heures_supp_derniere_semaine ?? 0).toFixed(2)),
      Statut: p.actif ? 'Actif' : 'Inactif',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Personnel');
    XLSX.writeFile(wb, `Personnel_${getCurrentWeekLabel()}.xlsx`);
  };

  // ── CRUD: Ouvrir modal création ───────────────────────────────────────────
  const openCrudCreate = () => {
    setCrudEditId(null);
    setCrudForm({
      matricule: '',
      nom: '',
      prenoms: '',
      societe_id: '',
      section_id: '',
      date_embauche: new Date().toISOString().slice(0, 10),
      type_contrat: 'FIXE',
    });
    setFilteredSections([]);
    setCrudModalVisible(true);
  };

  // ── CRUD: Ouvrir modal édition ────────────────────────────────────────────
  const openCrudEdit = (p: RhPersonnelView) => {
    setCrudEditId(p.id);
    setCrudForm({
      matricule: p.matricule,
      nom: p.nom,
      prenoms: p.prenoms,
      societe_id: p.societe_id,
      section_id: p.section_id,
      date_embauche: p.date_embauche,
      type_contrat: p.type_contrat,
    });
    setFilteredSections(crudSections.filter((s) => s.societe_id === p.societe_id));
    setCrudModalVisible(true);
  };

  // ── CRUD: Changer société → filtrer sections ──────────────────────────────
  const onCrudSocieteChange = (societeId: string) => {
    setCrudForm((prev) => ({ ...prev, societe_id: societeId, section_id: '' }));
    setFilteredSections(crudSections.filter((s) => s.societe_id === societeId));
  };

  // ── CRUD: Sauvegarder ─────────────────────────────────────────────────────
  const handleCrudSave = async () => {
    if (!supabase) return;
    if (
      !crudForm.matricule.trim() ||
      !crudForm.nom.trim() ||
      !crudForm.prenoms.trim() ||
      !crudForm.societe_id ||
      !crudForm.section_id
    ) {
      setAlert('Veuillez remplir : Matricule, Nom, Prénom(s), Société et Section.');
      return;
    }
    setCrudIsSaving(true);
    try {
      const values = {
        matricule: crudForm.matricule.trim(),
        nom: crudForm.nom.trim().toUpperCase(),
        prenoms: crudForm.prenoms.trim(),
        societe_id: crudForm.societe_id,
        section_id: crudForm.section_id,
        date_embauche: crudForm.date_embauche || new Date().toISOString().slice(0, 10),
        type_contrat: crudForm.type_contrat || 'FIXE',
        actif: true,
      };
      if (crudEditId) {
        const { error } = await supabase.from('rh_personnels').update(values).eq('id', crudEditId);
        if (error) throw error;
      } else {
        const { data: existing } = await supabase
          .from('rh_personnels')
          .select('id')
          .eq('matricule', values.matricule)
          .maybeSingle();
        if (existing) throw new Error(`Matricule ${values.matricule} déjà existant.`);
        const { error } = await supabase.from('rh_personnels').insert(values);
        if (error) throw error;
      }
      await invalidateAll();
      setCrudModalVisible(false);
      setCrudEditId(null);
    } catch (err: unknown) {
      setAlert(translatePgError(err) || (err instanceof Error ? err.message : undefined) || 'Erreur lors de la sauvegarde.');
    } finally {
      setCrudIsSaving(false);
    }
  };

  // ── CRUD: Supprimer ───────────────────────────────────────────────────────
  const handleCrudDelete = (p: RhPersonnelView) => {
    if (!supabase) return;
    Alert.alert(
      'Supprimer le personnel',
      `Supprimer ${p.nom_complet} (${p.matricule}) ?\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase!.from('rh_personnels').delete().eq('id', p.id);
            if (error) setAlert(translatePgError(error) || error.message);
            else await invalidateAll();
          },
        },
      ],
    );
  };

  // ── CRUD: Activer / Désactiver ────────────────────────────────────────────
  const handleToggleActif = (p: RhPersonnelView) => {
    if (!supabase) return;
    const newActif = !p.actif;
    const label = newActif ? 'Activer' : 'Désactiver';
    Alert.alert(`${label} le personnel`, `${label} ${p.nom_complet} ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: label,
        onPress: async () => {
          const { error } = await supabase!
            .from('rh_personnels')
            .update({ actif: newActif })
            .eq('id', p.id);
          if (error) setAlert(translatePgError(error) || error.message);
          else await invalidateAll();
        },
      },
    ]);
  };

  // ── Désactiver un employé (legacy — gardé pour compatibilité) ─────────────
  const deactivatePersonnel = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('rh_personnels').update({ actif: false }).eq('id', id);
      if (error) throw error;
      await invalidateAll();
    } catch (err: unknown) {
      setAlert(translatePgError(err));
    }
  };

  // ── Parse file ────────────────────────────────────────────────────────────

  const parseFile = async (file: File | { uri: string; name: string }) => {
    try {
      let arrayBuffer: ArrayBuffer;
      if (Platform.OS === 'web' && file instanceof File) {
        arrayBuffer = await file.arrayBuffer();
      } else {
        const response = await fetch('uri' in file ? file.uri : '');
        arrayBuffer = await response.arrayBuffer();
      }
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Feuille introuvable.');
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], {
        defval: '',
      });
      if (!rows || rows.length === 0) throw new Error('Le fichier est vide.');
      // Reset complet à chaque nouveau fichier
      const parsed = rows.map((row, i) => parsePersonnelRow(row, i));
      const filtered = parsed.filter(
        (p) => p.matricule && p.full_name !== 'Sans nom' && hasHireDate(p),
      );
      setImportPreview(filtered);
      setImportSuccess(false);
      setImportErrors([]);
      setImportProgress(null);
      setShowPreview(true);
      setImportError(null);
    } catch (err: unknown) {
      setImportPreview([]);
      setShowPreview(false);
      setAlert(
        translatePgError(err) ||
          (err instanceof Error ? err.message : undefined) ||
          'Impossible de lire le fichier.',
      );
    }
  };

  const selectImportFile = async () => {
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;
      if (picked.file) {
        await parseFile(picked.file);
      } else {
        await parseFile({ uri: picked.uri, name: picked.name });
      }
    } catch (err: unknown) {
      setAlert((err as any)?.message || 'Erreur de sélection.');
    }
  };

  // ── Mise à jour intelligente (Smart Sync) ─────────────────────────────────
  // Lit le fichier Excel, charge tous les personnels existants en UNE SEULE
  // requête, compare champ par champ, et n'écrit que les nouveaux / modifiés.

  const handleSmartSync = async () => {
    try {
      setSyncReport(null);
      const picked = await pickSpreadsheet();
      if (!picked) return;
      if (picked.file) {
        await runSmartSync(picked.file);
      } else {
        await runSmartSync({ uri: picked.uri, name: picked.name });
      }
    } catch (err: unknown) {
      setAlert((err as any)?.message || 'Erreur de sélection.');
    }
  };

  const runSmartSync = async (file: File | { uri: string; name: string }) => {
    if (!supabase) return;
    setIsSyncing(true);
    try {
      // 1. Lire le fichier Excel
      let arrayBuffer: ArrayBuffer;
      if (Platform.OS === 'web' && file instanceof File) {
        arrayBuffer = await file.arrayBuffer();
      } else {
        const response = await fetch('uri' in file ? file.uri : '');
        arrayBuffer = await response.arrayBuffer();
      }
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Feuille introuvable.');
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], {
        defval: '',
      });
      if (!rows || rows.length === 0) throw new Error('Le fichier est vide.');

      const fileItems = rows
        .map((row, i) => parsePersonnelRow(row, i))
        .filter((p) => p.matricule && p.full_name !== 'Sans nom' && hasHireDate(p));

      // 2. Charger TOUS les personnels existants en UNE seule requête
      const { data: existingAll, error: fetchErr } = await supabase
        .from('rh_personnels')
        .select('id, matricule, nom, prenoms, societe_id, section_id, date_embauche, type_contrat');
      if (fetchErr) throw fetchErr;

      const existingMap = new Map<string, any>();
      (existingAll || []).forEach((p: any) => existingMap.set(String(p.matricule), p));

      // 3. Pré-charger sociétés et sections (mise en cache)
      const societeCache = new Map<string, RhSociete>();
      const sectionCache = new Map<string, RhSection>();

      for (const item of fileItems) {
        const cKey = normalizeCode(item.company || 'NON RENSEIGNE');
        if (!societeCache.has(cKey)) {
          try {
            await ensureSociete(item.company || 'NON RENSEIGNE', societeCache);
          } catch {
            /* ignoré */
          }
        }
      }
      for (const item of fileItems) {
        const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
        if (!societe) continue;
        const sKey = `${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`;
        if (!sectionCache.has(sKey)) {
          try {
            await ensureSection(item.section || 'NON RENSEIGNE', societe.id, sectionCache);
          } catch {
            /* ignoré */
          }
        }
      }

      // 4. Comparer et synchroniser — seulement nouveau ou modifié
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      const errors: { matricule: string; msg: string }[] = [];

      for (const item of fileItems) {
        try {
          const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
          if (!societe) throw new Error(`Société introuvable : ${item.company}`);
          const section = sectionCache.get(
            `${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`,
          );
          if (!section) throw new Error(`Section introuvable : ${item.section}`);

          const { nom, prenoms } = splitFullName(item.full_name);
          const contractType = parseKontractType(item.contract_type);
          const dateEmbauche = item.hire_date || new Date().toISOString().slice(0, 10);
          const existing = existingMap.get(String(item.matricule));

          if (!existing) {
            // ✅ Nouveau personnel → insérer
            const { error } = await supabase.from('rh_personnels').insert({
              matricule: item.matricule,
              nom,
              prenoms,
              societe_id: societe.id,
              section_id: section.id,
              date_embauche: dateEmbauche,
              type_contrat: contractType,
              actif: true,
            });
            if (error) throw error;
            inserted++;
          } else {
            // ✓ Personnel existant → comparer les champs
            const hasChanged =
              existing.nom !== nom ||
              existing.prenoms !== prenoms ||
              existing.societe_id !== societe.id ||
              existing.section_id !== section.id ||
              existing.type_contrat !== contractType ||
              (dateEmbauche && existing.date_embauche !== dateEmbauche);

            if (hasChanged) {
              // ⚠ Des champs ont changé → mettre à jour
              const { error } = await supabase
                .from('rh_personnels')
                .update({
                  nom,
                  prenoms,
                  societe_id: societe.id,
                  section_id: section.id,
                  date_embauche: dateEmbauche,
                  type_contrat: contractType,
                })
                .eq('id', existing.id);
              if (error) throw error;
              updated++;
            } else {
              // ⏩ Rien n'a changé → ignorer
              unchanged++;
            }
          }
        } catch (e: unknown) {
          errors.push({ matricule: item.matricule, msg: translatePgError(e) });
        }
      }

      await invalidateAll();
      setSyncReport({ inserted, updated, unchanged, errors });

      try {
        notifMutation.mutate({
          to_role: 'RH',
          subject: 'Mise à jour personnel effectuée',
          message: `Sync: ${inserted} nouveau(x), ${updated} mis à jour, ${unchanged} inchangé(s)${errors.length > 0 ? `, ${errors.length} erreur(s)` : ''}.`,
          type: 'internal',
          category: 'SYSTEM',
        });
      } catch (_) {
        /* non bloquant */
      }
    } catch (err: unknown) {
      setAlert(
        translatePgError(err) || (err as any)?.message || 'Erreur lors de la synchronisation.',
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmImport = async () => {
    if (importPreview.length === 0) {
      setAlert('Aucune donnée à confirmer.');
      return;
    }
    const invalid = importPreview.filter(
      (p) => !p.matricule || !p.full_name || p.full_name === 'Sans nom' || !hasHireDate(p),
    );
    if (invalid.length > 0) {
      setAlert(
        `${invalid.length} ligne(s) sans matricule, nom ou date embauche valide. Corrigez le fichier.`,
      );
      return;
    }
    setImportProgress({ done: 0, total: importPreview.length });
    try {
      await persistPersonnelBatch(importPreview);
      setImportSuccess(true);
    } catch (err: unknown) {
      setAlert(
        translatePgError(err) ||
          (err instanceof Error ? err.message : undefined) ||
          'Erreur lors de la sauvegarde.',
      );
    } finally {
      setImportProgress(null);
    }
  };

  const addManualPersonnel = async () => {
    if (!manualForm.matricule?.trim()) {
      setAlert('Le matricule est obligatoire.');
      return;
    }
    if (!manualForm.full_name?.trim()) {
      setAlert('Le nom complet est obligatoire.');
      return;
    }
    if (!manualForm.section?.trim()) {
      setAlert('La section est obligatoire.');
      return;
    }
    if (!manualForm.company?.trim()) {
      setAlert('La société est obligatoire.');
      return;
    }
    const record = parsePersonnelRow(
      {
        Societe: manualForm.company,
        Section: manualForm.section,
        Matricule: manualForm.matricule,
        'Nom et Prenoms': manualForm.full_name,
        'Date Embauche': manualForm.hire_date,
        Type: manualForm.contract_type,
        'Heures Hebdo': manualForm.weekly_hours ?? 40,
      },
      personnel.length,
    );
    try {
      setImportProgress({ done: 0, total: 1 });
      await persistPersonnelBatch([record]);
      setManualModalVisible(false);
      setManualForm({
        company: '',
        section: '',
        matricule: '',
        full_name: '',
        hire_date: '',
        contract_type: 'Fixe',
        weekly_hours: 40,
      });
    } catch (err: unknown) {
      setAlert(
        translatePgError(err) ||
          (err instanceof Error ? err.message : undefined) ||
          "Erreur lors de l'ajout.",
      );
    } finally {
      setImportProgress(null);
    }
  };

  // ── Affectation actions ───────────────────────────────────────────────────

  const toggleEmployee = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // ── Sélection multiple personnel (onglet Personnels) ───────────────────────
  const toggleRhSelect = (id: string) =>
    setRhSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleRhSelectAll = (ids: string[]) =>
    setRhSelectedIds((prev) =>
      ids.length > 0 && ids.every((id) => prev.includes(id))
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])],
    );

  const createAssignmentRequest = async () => {
    if (!assignFrom || !assignTo) {
      setAlert('Sélectionnez une section source et une section cible.');
      return;
    }
    if (assignFrom === assignTo) {
      setAlert('La section source et cible doivent être différentes.');
      return;
    }
    if (selectedIds.length === 0) {
      setAlert('Sélectionnez au moins un personnel.');
      return;
    }
    if (!supabase) {
      setAlert('Supabase non configuré.');
      return;
    }

    // ── Alerte H.Supp > 10h ──────────────────────────────────────────────────
    const selectedPersonnel = personnel.filter((p) => selectedIds.includes(p.id));
    const avecSuppEleve = selectedPersonnel.filter(
      (p) => (p.heures_supp_derniere_semaine ?? 0) > 10,
    );
    if (avecSuppEleve.length > 0) {
      const noms = avecSuppEleve
        .map((p) => `${p.nom_complet} (${p.heures_supp_derniere_semaine.toFixed(1)}h supp.)`)
        .join(', ');
      Alert.alert(
        '⚠ Heures supplémentaires élevées',
        `${avecSuppEleve.length} personnel(s) sélectionné(s) ont déjà plus de 10h supplémentaires cette semaine :\n\n${noms}\n\nVoulez-vous quand même créer la demande ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Créer quand même', style: 'destructive', onPress: () => _doCreateRequest() },
        ],
      );
      return;
    }
    await _doCreateRequest();
  };

  const _doCreateRequest = async () => {
    if (!supabase) return;
    try {
      const { data: demandeData, error: demandeError } = await supabase
        .from('rh_affectations_demandes')
        .insert({
          section_demandeur: assignFrom,
          section_fournisseur: assignTo,
          nb_personnes: selectedIds.length,
          date_debut: assignDate || new Date().toISOString().slice(0, 10),
          heures_par_jour: assignHours || 8,
          motif: assignNote || null,
          statut: 'EN_ATTENTE_PLAN',
          demande_par: profile?.id || null,
        })
        .select()
        .single();
      if (demandeError) throw demandeError;
      const demandeId = (demandeData as any).id;
      const { error: lineError } = await supabase.from('rh_affectations').insert(
        personnel
          .filter((p) => selectedIds.includes(p.id))
          .map((p) => ({
            demande_id: demandeId,
            personnel_id: p.id,
            date_debut: assignDate || new Date().toISOString().slice(0, 10),
            heures_par_jour: assignHours || 8,
            notes: assignNote || null,
          })),
      );
      if (lineError) throw lineError;
      await invalidateAll();
      const srcName = sectionById[assignFrom]?.nom || '';
      const dstName = sectionById[assignTo]?.nom || '';
      notifMutation.mutate({
        to_role: 'PLAN',
        subject: "Nouvelle demande d'affectation — validation requise",
        message: `${srcName} → ${dstName} (${selectedIds.length} pers.) demandée par ${profile?.full_name || 'un responsable'}.`,
        type: 'internal',
        category: 'SYSTEM',
      });
      setSelectedIds([]);
      setAssignTo('');
      setAssignFrom('');
      setAssignDate('');
      setAssignHours(8);
      setAssignNote('');
    } catch (err: unknown) {
      setAlert(translatePgError(err) || 'Erreur lors de la création.');
    }
  };

  // Validation PLAN : EN_ATTENTE_PLAN → EN_ATTENTE_RH (par RPROD ou ADMIN)
  const approuvePlan = async (id: string) => {
    if (!supabase) return;
    try {
      const req = demandes.find((d) => d.id === id);
      const src = sectionById[req?.section_demandeur || '']?.nom || '';
      const dst = sectionById[req?.section_fournisseur || '']?.nom || '';
      const { error } = await supabase
        .from('rh_affectations_demandes')
        .update({ statut: 'EN_ATTENTE_RH' })
        .eq('id', id);
      if (error) throw error;
      await invalidateAll();
      notifMutation.mutate({
        to_role: 'RH',
        subject: 'Affectation validée PLAN — en attente RH',
        message: `Demande ${src} → ${dst} (${req?.nb_personnes ?? '?'} pers.) validée par le PLAN. En attente de validation RH.`,
        type: 'internal',
        category: 'SYSTEM',
      });
      if (req?.demande_par) notifMutation.mutate({
        user_id: req.demande_par,
        subject: 'Votre demande d\'affectation est validée par le PLAN (étape 1/2)',
        message: `Demande ${src} → ${dst} (${req?.nb_personnes ?? '?'} pers.) : 1ère validation effectuée. En attente de la validation finale RH.`,
        type: 'internal',
        category: 'SYSTEM',
      } as any);
    } catch (err: unknown) {
      setAlert(translatePgError(err) || 'Erreur lors de la validation PLAN.');
    }
  };

  // Validation RH : EN_ATTENTE_RH → APPROUVE (par RH, ADMIN ou DPI)
  const approuveDemande = async (id: string) => {
    if (!supabase) return;
    try {
      const req = demandes.find((d) => d.id === id);
      const src = sectionById[req?.section_demandeur || '']?.nom || '';
      const dst = sectionById[req?.section_fournisseur || '']?.nom || '';
      const { error } = await supabase
        .from('rh_affectations_demandes')
        .update({
          statut: 'APPROUVE',
          approuve_par: profile?.id,
          approuve_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      await invalidateAll();
      notifMutation.mutate({
        to_role: 'RH',
        subject: 'Affectation approuvée',
        message: `Demande ${src} → ${dst} (${req?.nb_personnes ?? '?'} pers.) approuvée par ${profile?.full_name || 'un responsable'}.`,
        type: 'internal',
        category: 'SYSTEM',
      });
      if (req?.demande_par) notifMutation.mutate({
        user_id: req.demande_par,
        subject: 'Votre demande d\'affectation est approuvée ✅',
        message: `Demande ${src} → ${dst} (${req?.nb_personnes ?? '?'} pers.) approuvée définitivement par ${profile?.full_name || 'la RH'}.`,
        type: 'internal',
        category: 'SYSTEM',
      } as any);
    } catch (err: unknown) {
      setAlert(translatePgError(err) || "Erreur lors de l'approbation.");
    }
  };

  const rejectDemande = async () => {
    if (!rejectModal || !supabase) return;
    try {
      const req = demandes.find((d) => d.id === rejectModal.id);
      const src = sectionById[req?.section_demandeur || '']?.nom || '';
      const dst = sectionById[req?.section_fournisseur || '']?.nom || '';
      const { error } = await supabase
        .from('rh_affectations_demandes')
        .update({ statut: 'REJETE', commentaire_rejet: rejectComment || 'Rejeté sans commentaire' })
        .eq('id', rejectModal.id);
      if (error) throw error;
      await invalidateAll();
      notifMutation.mutate({
        to_role: 'RH',
        subject: 'Affectation rejetée',
        message: `Demande ${src} → ${dst} rejetée${rejectComment ? ` : ${rejectComment}` : '.'}`,
        type: 'internal',
        category: 'SYSTEM',
      });
      if (req?.demande_par) notifMutation.mutate({
        user_id: req.demande_par,
        subject: 'Votre demande d\'affectation a été rejetée',
        message: `Demande ${src} → ${dst} rejetée${rejectComment ? ` : ${rejectComment}` : '.'}`,
        type: 'internal',
        category: 'SYSTEM',
      } as any);
      setRejectModal(null);
      setRejectComment('');
    } catch (err: unknown) {
      setAlert(translatePgError(err) || 'Erreur lors du rejet.');
    }
  };

  const terminerDemande = async (id: string) => {
    if (!supabase) return;
    try {
      const req = demandes.find((d) => d.id === id);
      const src = sectionById[req?.section_demandeur || '']?.nom || '';
      const dst = sectionById[req?.section_fournisseur || '']?.nom || '';
      const { error } = await supabase
        .from('rh_affectations_demandes')
        .update({ statut: 'TERMINE' })
        .eq('id', id);
      if (error) throw error;
      await invalidateAll();
      notifMutation.mutate({
        to_role: 'RH',
        subject: 'Affectation terminée',
        message: `Demande ${src} → ${dst} (${req?.nb_personnes ?? '?'} pers.) marquée terminée.`,
        type: 'internal',
        category: 'SYSTEM',
      });
    } catch (err: unknown) {
      setAlert(translatePgError(err) || 'Erreur.');
    }
  };

  // ── Congés : handlers ───────────────────────────────────────────────────────
  const refreshConges = () => {
    queryClient.invalidateQueries({ queryKey: ['rh_conges'] });
    queryClient.invalidateQueries({ queryKey: ['rh_conges_soldes'] });
  };

  // Pré-remplit la demande avec l'identité du compte connecté (owner)
  const openCongeModal = () => {
    const matchedPersonnel = personnel.find((p) => {
      const fullName = `${p.nom} ${p.prenoms}`.trim().toLowerCase();
      const userName = (profile?.full_name || '').trim().toLowerCase();
      const userEmail = (profile?.email || '').trim().toLowerCase();
      return (
        (!!userName && fullName === userName) ||
        (!!userEmail &&
          [p.matricule, p.nom_complet]
            .filter(Boolean)
            .map((v) => String(v).trim().toLowerCase())
            .includes(userEmail))
      );
    });
    setCongeSelfId(matchedPersonnel?.id || '');
    setCongePourQui('MOI');
    setCongeForm({
      personnel_id: matchedPersonnel?.id || '',
      type_conge: 'CONGE_PAYE',
      date_debut: '',
      date_fin: '',
      motif: '',
    });
    setCongeModalVisible(true);
  };

  const submitConge = async () => {
    if (!supabase) { setAlert('Supabase non configuré.'); return; }
    if (!congeForm.personnel_id) {
      setAlert("Aucune fiche personnel associée à votre compte. Contactez le RH.");
      return;
    }
    // Garde-fou : seul un responsable d'équipe peut désigner un autre employé que lui-même.
    if (!isTeamManager && congeForm.personnel_id !== congeSelfId) {
      setAlert('Vous ne pouvez déposer une demande de congé que pour vous-même.');
      return;
    }
    if (
      isTeamManager &&
      congePourQui === 'EQUIPE' &&
      !congeTeamPersonnel.some((p) => p.id === congeForm.personnel_id)
    ) {
      setAlert("Cet employé n'appartient pas à votre équipe.");
      return;
    }
    if (!congeForm.date_debut || !congeForm.date_fin) {
      setAlert('Renseignez les dates de début et de fin.');
      return;
    }
    if (new Date(congeForm.date_fin) < new Date(congeForm.date_debut)) {
      setAlert('La date de fin doit être postérieure à la date de début.');
      return;
    }
    setCongeSaving(true);
    try {
      const nbJours = diffDaysInclusive(congeForm.date_debut, congeForm.date_fin);
      const emp = personnel.find((p) => p.id === congeForm.personnel_id);
      // Calcul préavis (recommandation interne — pas une obligation légale pour congé payé Madagascar)
      const today = new Date(); today.setHours(0,0,0,0);
      const debut = new Date(congeForm.date_debut);
      const preavisJours = Math.round((debut.getTime() - today.getTime()) / 86400000);
      const { error } = await supabase.from('rh_conges').insert({
        personnel_id: congeForm.personnel_id,
        type_conge:   congeForm.type_conge,
        date_debut:   congeForm.date_debut,
        date_fin:     congeForm.date_fin,
        nb_jours:     nbJours,
        motif:        congeForm.motif || null,
        statut:       'EN_ATTENTE',
        demande_par:  profile?.id || null,
        preavis_jours: preavisJours,
      });
      if (error) throw error;
      refreshConges();
      setCongeModalVisible(false);
      notifMutation.mutate({
        to_role: 'RH',
        subject: 'Nouvelle demande de congé — validation niveau 1',
        message: `${emp?.nom_complet || 'Un employé'} — ${CONGE_TYPE_LABEL[congeForm.type_conge]} du ${congeForm.date_debut} au ${congeForm.date_fin} (${nbJours} j). Préavis : ${preavisJours} j.`,
        type: 'internal',
        category: 'SYSTEM',
      });
    } catch (err: unknown) {
      setAlert(translatePgError(err) || (err instanceof Error ? err.message : undefined) || 'Erreur lors de la création.');
    } finally {
      setCongeSaving(false);
    }
  };

  /** Niveau 1 — validation RH : EN_ATTENTE → VALIDE_RH puis notif DPI */
  const validateCongeRh = async (c: RhConge) => {
    if (!supabase) return;
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from('rh_conges').update({
        statut: 'VALIDE_RH',
        valide_rh_par: profile?.id,
        valide_rh_par_nom: profile?.full_name || null,
        valide_rh_at: nowIso,
      }).eq('id', c.id);
      if (error) throw error;
      refreshConges();
      const nom = c.personnel ? `${c.personnel.nom} ${c.personnel.prenoms}` : 'Employé';
      notifMutation.mutate({ to_role: 'DPI', subject: 'Congé validé RH — validation finale requise',
        message: `Congé de ${nom} (${c.date_debut} → ${c.date_fin}) validé par ${profile?.full_name || 'le RH'}. En attente validation DPI.`,
        type: 'internal', category: 'SYSTEM' });
      if (c.demande_par) notifMutation.mutate({ user_id: c.demande_par,
        subject: 'Votre demande est validée par le RH (étape 1/2)',
        message: `${CONGE_TYPE_LABEL[c.type_conge] || 'Congé'} du ${c.date_debut} au ${c.date_fin} : 1ère validation effectuée. En attente de la validation finale DPI.`,
        type: 'internal', category: 'SYSTEM' } as any);
    } catch (err: unknown) { setAlert(translatePgError(err) || 'Erreur validation RH.'); }
  };

  /** Niveau 2 — validation DPI : VALIDE_RH → VALIDE (débit solde) */
  const validateCongeDpi = async (c: RhConge) => {
    if (!supabase) return;
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from('rh_conges').update({
        statut: 'VALIDE',
        valide_dpi_par: profile?.id,
        valide_dpi_par_nom: profile?.full_name || null,
        valide_dpi_at: nowIso,
      }).eq('id', c.id);
      if (error) throw error;
      // Tentative débit solde via RPC (silencieux si absent — géré par trigger DB)
      try { await supabase.rpc('rh_apply_conge_validation', { p_conge_id: c.id, p_validated_by: profile?.id || null }); } catch (_) {}
      refreshConges();
      const nom = c.personnel ? `${c.personnel.nom} ${c.personnel.prenoms}` : 'Employé';
      notifMutation.mutate({ to_role: 'RH', subject: 'Congé validé définitivement',
        message: `Congé de ${nom} (${c.date_debut} → ${c.date_fin}) validé définitivement par ${profile?.full_name || 'la DPI'}.`,
        type: 'internal', category: 'SYSTEM' });
      if (c.demande_par) notifMutation.mutate({ user_id: c.demande_par,
        subject: 'Votre congé est accordé ✅',
        message: `${CONGE_TYPE_LABEL[c.type_conge] || 'Congé'} du ${c.date_debut} au ${c.date_fin} validé définitivement. Solde mis à jour.`,
        type: 'internal', category: 'SYSTEM' } as any);
    } catch (err: unknown) { setAlert(translatePgError(err) || 'Erreur validation DPI.'); }
  };

  const refuseConge = async () => {
    if (!congeReject || !supabase) return;
    const isRhLevel = congeReject.level === 'RH';
    try {
      const c = conges.find((x) => x.id === congeReject.id);
      const nowIso = new Date().toISOString();
      const { error } = await supabase.from('rh_conges').update(
        isRhLevel
          ? { statut: 'REFUSE_RH',  valide_rh_par: profile?.id,  valide_rh_par_nom: profile?.full_name || null,  valide_rh_at: nowIso,  commentaire_rh:  congeRejectComment || 'Refusé sans commentaire' }
          : { statut: 'REFUSE_DPI', valide_dpi_par: profile?.id, valide_dpi_par_nom: profile?.full_name || null, valide_dpi_at: nowIso, commentaire_dpi: congeRejectComment || 'Refusé sans commentaire' }
      ).eq('id', congeReject.id);
      if (error) throw error;
      refreshConges();
      const nom = c?.personnel ? `${c.personnel.nom} ${c.personnel.prenoms}` : 'Employé';
      notifMutation.mutate({ to_role: isRhLevel ? 'RH' : 'DPI',
        subject: `Congé refusé (niveau ${isRhLevel ? 'RH' : 'DPI'})`,
        message: `Congé de ${nom} refusé${congeRejectComment ? ` : ${congeRejectComment}` : '.'}`,
        type: 'internal', category: 'SYSTEM' });
      if (c?.demande_par) notifMutation.mutate({ user_id: c.demande_par,
        subject: 'Votre demande de congé a été refusée',
        message: `${CONGE_TYPE_LABEL[c?.type_conge] || 'Congé'} du ${c?.date_debut} au ${c?.date_fin} refusé (niveau ${isRhLevel ? 'RH' : 'DPI'})${congeRejectComment ? ` : ${congeRejectComment}` : '.'}`,
        type: 'internal', category: 'SYSTEM' } as any);
      setCongeReject(null);
      setCongeRejectComment('');
    } catch (err: unknown) { setAlert(translatePgError(err) || 'Erreur lors du refus.'); }
  };

  /** Annulation par le demandeur ou un responsable RH/DPI tant que non clôturé */
  const cancelConge = (c: RhConge) => {
    if (!supabase) return;
    Alert.alert('Annuler la demande', 'Voulez-vous vraiment annuler cette demande de congé ?', [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui, annuler', style: 'destructive', onPress: async () => {
        try {
          const { error } = await supabase!.from('rh_conges').update({ statut: 'ANNULE' }).eq('id', c.id);
          if (error) throw error;
          refreshConges();
        } catch (err: unknown) { setAlert(translatePgError(err) || "Erreur lors de l'annulation."); }
      }},
    ]);
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  // (getOtLevel est défini plus haut, avant les useMemos)

  const OTBadge = ({ hs }: { hs: number }) => {
    const level = getOtLevel(hs);
    const cfg = OT_CONFIG[level];
    return (
      <View
        style={[styles.badge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}
      >
        <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    );
  };

  const StatusBadge = ({ statut }: { statut: string }) => {
    const cfg = STATUT_CONFIG[statut] || {
      label: statut,
      bg: '#F3F4F6',
      text: '#374151',
      icon: 'help-circle-outline',
    };
    return (
      <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.text + '33' }]}>
        <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.text} />
        <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
      </View>
    );
  };

  // ── Import heures journalières ────────────────────────────────────────────

  const parseSemaineLabel = (
    val: unknown,
  ): { label: string; annee: number; semaine_num: number } => {
    const raw = String(val ?? '').trim();
    // Format "S22/2026" ou "22/2026"
    const m1 = raw.match(/^S?(\d{1,2})[\/\-](\d{4})$/i);
    if (m1) {
      const num = parseInt(m1[1], 10);
      const yr = parseInt(m1[2], 10);
      return { label: `S${num}/${yr}`, annee: yr, semaine_num: num };
    }
    // Format date "DD/MM/YYYY" ou "YYYY-MM-DD"
    let d: Date | null = null;
    const m2 = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m2) d = new Date(parseInt(m2[3]), parseInt(m2[2]) - 1, parseInt(m2[1]));
    const m3 = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m3) d = new Date(parseInt(m3[1]), parseInt(m3[2]) - 1, parseInt(m3[3]));
    // Numéro Excel sérialisé
    const num = Number(raw);
    if (!isNaN(num) && num > 40000) d = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (d && !isNaN(d.getTime())) {
      const wk = getIsoWeek(d);
      return { label: `S${wk}/${d.getFullYear()}`, annee: d.getFullYear(), semaine_num: wk };
    }
    // Fallback semaine courante
    const now = new Date();
    const wk = getIsoWeek(now);
    return { label: `S${wk}/${now.getFullYear()}`, annee: now.getFullYear(), semaine_num: wk };
  };

  const handleImportHeures = async () => {
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;

      // Lire l'arrayBuffer selon la plateforme
      let arrayBuffer: ArrayBuffer;
      if (picked.file) {
        // Web — objet File natif
        arrayBuffer = await picked.file.arrayBuffer();
      } else {
        // Mobile — lire via fetch sur l'URI locale
        const res = await fetch(picked.uri);
        arrayBuffer = await res.arrayBuffer();
      }

      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (!raw.length) {
        setAlert('Fichier vide ou format non reconnu.');
        return;
      }

      const getVal = (row: Record<string, unknown>, keys: string[]): unknown => {
        for (const k of keys) {
          const found = Object.keys(row).find((rk) => rk.trim().toLowerCase() === k.toLowerCase());
          if (found !== undefined && row[found] !== '') return row[found];
        }
        return '';
      };
      const toH = (v: unknown) => Math.max(0, Number(v) || 0);

      const rows: HeuresRow[] = raw.map((r, i) => {
        const matricule = String(
          getVal(r, ['Matricule', 'matricule', 'MATRICULE', 'Mat', 'mat']) ?? '',
        ).trim();
        const lu = toH(getVal(r, ['Lundi', 'lundi', 'L', 'Mon', 'monday']));
        const ma = toH(getVal(r, ['Mardi', 'mardi', 'Ma', 'Tue', 'tuesday']));
        const me = toH(getVal(r, ['Mercredi', 'mercredi', 'Me', 'Wed', 'wednesday']));
        const je = toH(getVal(r, ['Jeudi', 'jeudi', 'J', 'Thu', 'thursday']));
        const ve = toH(getVal(r, ['Vendredi', 'vendredi', 'V', 'Fri', 'friday']));
        const sa = toH(getVal(r, ['Samedi', 'samedi', 'Sa', 'Sat', 'saturday']));
        const di = toH(getVal(r, ['Dimanche', 'dimanche', 'Di', 'Sun', 'sunday']));
        const total = lu + ma + me + je + ve + sa + di;
        const supp = Math.max(0, total - 40);
        const semVal = getVal(r, [
          'Semaine',
          'semaine',
          'Date',
          'date',
          'Week',
          'week',
          'Periode',
          'période',
        ]);
        const { label, annee, semaine_num } = parseSemaineLabel(semVal);
        const note = String(
          getVal(r, ['Note', 'note', 'Notes', 'Commentaire', 'commentaire']) ?? '',
        ).trim();
        const emp = personnel.find((p) => String(p.matricule).trim() === matricule);
        return {
          id: `h-${i}`,
          matricule,
          nom_complet: emp?.nom_complet ?? 'Inconnu',
          personnel_id: emp?.id ?? null,
          semaine_label: label,
          annee,
          semaine_num,
          lundi: lu,
          mardi: ma,
          mercredi: me,
          jeudi: je,
          vendredi: ve,
          samedi: sa,
          dimanche: di,
          heures_totales: total,
          heures_supp: supp,
          note,
          _error: !matricule ? 'Matricule manquant' : !emp ? 'Matricule introuvable' : undefined,
        };
      });
      setHeuresPreview(rows);
      setShowHeuresPreview(true);
      setHeuresImportDone(null);
    } catch (err: unknown) {
      setAlert(translatePgError(err) || 'Erreur lecture fichier.');
    }
  };

  const confirmImportHeures = async () => {
    if (!supabase || !heuresPreview.length) return;
    const valid = heuresPreview.filter((r) => !r._error && r.personnel_id);
    if (!valid.length) {
      setAlert('Aucune ligne valide à importer.');
      return;
    }
    setHeuresImporting(true);
    const errors: { matricule: string; msg: string }[] = [];
    let ok = 0;

    // Batch ID basé sur la période active (ex: IMPORT-2026-06)
    const batchId = `IMPORT-${activePeriode.debut.getFullYear()}-${String(activePeriode.debut.getMonth() + 1).padStart(2, '0')}`;

    // Pour chaque ligne du fichier, on upsert un enregistrement PAR JOUR
    // HeuresRow contient lundi→dimanche avec une semaine_label → on calcule les dates exactes
    for (const row of valid) {
      // Retrouver la date du lundi de la semaine (depuis semaine_label ex: S22/2026)
      const m = row.semaine_label.match(/^S(\d+)\/(\d{4})$/);
      if (!m) {
        errors.push({ matricule: row.matricule, msg: 'Format semaine invalide' });
        continue;
      }
      const weekNum = parseInt(m[1], 10);
      const year = parseInt(m[2], 10);
      // Calculer la date du lundi ISO de la semaine
      const jan4 = new Date(year, 0, 4);
      const lundi = new Date(jan4);
      lundi.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (weekNum - 1) * 7);

      const jourHeures = [
        { offset: 0, h: row.lundi },
        { offset: 1, h: row.mardi },
        { offset: 2, h: row.mercredi },
        { offset: 3, h: row.jeudi },
        { offset: 4, h: row.vendredi },
        { offset: 5, h: row.samedi },
        { offset: 6, h: row.dimanche },
      ].filter((j) => j.h > 0); // N'upsert que les jours avec heures

      for (const { offset, h } of jourHeures) {
        const d = new Date(lundi);
        d.setDate(lundi.getDate() + offset);
        const dateStr = d.toISOString().slice(0, 10);
        const { error } = await supabase.from('rh_heures_journalieres').upsert(
          {
            personnel_id: row.personnel_id,
            date_travail: dateStr,
            heures: h,
            note: row.note || null,
            import_batch_id: batchId,
            saisi_par: profile?.id,
          },
          { onConflict: 'personnel_id,date_travail' },
        );
        if (error) {
          errors.push({ matricule: row.matricule, msg: `${dateStr}: ${error.message}` });
        }
      }
      if (!errors.find((e) => e.matricule === row.matricule)) ok++;
    }

    // Notif si heures supp
    if (valid.some((r) => r.heures_supp > 0)) {
      notifMutation.mutate({
        to_role: 'RH',
        subject: `Import heures ${batchId} — H.Supp détectées`,
        message: `Import ${batchId} : ${ok} employé(s) importé(s), ${valid.filter((r) => r.heures_supp > 0).length} avec heures supplémentaires (seuil 173.33h/période).`,
        type: 'internal',
        category: 'SYSTEM',
      });
    }

    await loadJoursData();
    setHeuresImporting(false);
    setHeuresImportDone({ ok, errors });
    setShowHeuresPreview(false);
    setHeuresPreview([]);
  };

  // ── Généréation modèle Excel (une ligne/employé, une colonne/date) ────────
  const generateTemplateXlsx = () => {
    const fmtDate = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const joursAbbr = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];

    // En-tête : 3 colonnes fixes + une par date + Total + H.Supp + Note
    const dateHeader = periodeDates.map((d) => `${fmtDate(d)}\n${joursAbbr[d.getDay()]}`);
    const headerRow = [
      'Matricule',
      'Nom Complet',
      'Section',
      ...dateHeader,
      'Total Heures',
      'Heures Supp',
      'Note',
    ];
    const aoa: (string | number)[][] = [headerRow];

    // Lignes employés (ou 3 lignes vides si aucun chargé)
    const list =
      personnel.length > 0
        ? personnel
        : ([
            { matricule: '1024', nom_complet: 'Nom Prénom', section_nom: 'Section' },
          ] as typeof personnel);

    for (const p of list) {
      const heuresCols = periodeDates.map((d) => {
        const wd = d.getDay(); // 0=dim, 6=sam
        return wd === 0 || wd === 6 ? 0 : 8;
      });
      // Total et H.Supp comme formules texte — XLSX.js les évaluera côté Excel
      const nbDates = periodeDates.length;
      const firstDataCol = 4; // col D (1-indexed)
      const lastDataCol = firstDataCol + nbDates - 1;
      const colLetter = (n: number) => {
        let s = '';
        let x = n;
        while (x > 0) {
          const r = (x - 1) % 26;
          s = String.fromCharCode(65 + r) + s;
          x = Math.floor((x - 1) / 26);
        }
        return s;
      };
      // Row index: header = row 1, first data = row 2 etc — but aoa is 0-indexed
      const rowNum = aoa.length + 1; // excel 1-based
      const totalFormula = `=SUM(${colLetter(firstDataCol)}${rowNum}:${colLetter(lastDataCol)}${rowNum})`;
      const suppFormula = `=MAX(0,${colLetter(firstDataCol + nbDates)}${rowNum}-173.33)`;
      aoa.push([
        String(p.matricule),
        p.nom_complet,
        p.section_nom ?? '',
        ...heuresCols,
        totalFormula,
        suppFormula,
        '',
      ]);
    }

    // Ajouter 10 lignes vides
    for (let i = 0; i < 10; i++) {
      const rowNum = aoa.length + 1;
      const nbDates = periodeDates.length;
      const firstDataCol = 4;
      const lastDataCol = firstDataCol + nbDates - 1;
      const colLetter = (n: number) => {
        let s = '';
        let x = n;
        while (x > 0) {
          const r = (x - 1) % 26;
          s = String.fromCharCode(65 + r) + s;
          x = Math.floor((x - 1) / 26);
        }
        return s;
      };
      aoa.push([
        '',
        '',
        '',
        ...periodeDates.map(() => ''),
        `=SUM(${colLetter(firstDataCol)}${rowNum}:${colLetter(lastDataCol)}${rowNum})`,
        `=MAX(0,${colLetter(firstDataCol + nbDates)}${rowNum}-173.33)`,
        '',
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    // Largeurs colonnes
    const cols = [
      { wch: 11 },
      { wch: 30 },
      { wch: 16 },
      ...periodeDates.map(() => ({ wch: 10 })),
      { wch: 13 },
      { wch: 13 },
      { wch: 28 },
    ];
    ws['!cols'] = cols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Heures');
    const periodeStr = activePeriode.debut
      .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
      .replace(/\s/g, '_');
    XLSX.writeFile(wb, `fiche_heures_${periodeStr}.xlsx`);
  };

  // ── Import heures (format une ligne/employé, colonnes = dates) ───────────
  const handleImportHeuresJour = async () => {
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;

      let arrayBuffer: ArrayBuffer;
      if (picked.file) {
        arrayBuffer = await picked.file.arrayBuffer();
      } else {
        const res = await fetch(picked.uri);
        arrayBuffer = await res.arrayBuffer();
      }

      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // sheet_to_json ne marche pas bien ici car les en-têtes sont des dates
      // On lit en AOA (array of arrays) pour contrôler soi-même
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][];
      if (aoa.length < 2) {
        setAlert('Fichier vide ou format non reconnu.');
        return;
      }

      const headerIndex = aoa.findIndex((row) =>
        (row as unknown[]).some((cell) => /matricule/i.test(String(cell ?? ''))),
      );
      if (headerIndex < 0) {
        setAlert(
          'Impossible de trouver la ligne d\'en-tête. Vérifiez que le fichier contient une colonne Matricule.',
        );
        setHeuresImportDiagnostics({
          headerRow: [],
          dateCols: [],
          message: 'En-tête Matricule non trouvée.',
        });
        return;
      }

      const headerRow = (aoa[headerIndex] as unknown[]).map((v) => String(v ?? '').trim());

      // Détecter les colonnes de dates (format JJ/MM/AAAA ou date sérialisée Excel)
      const parseDateHeader = (v: string): string | null => {
        const clean = String(v ?? '')
          .split(/[\r\n]+/)[0]
          .trim();
        const m = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m)
          return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]))
            .toISOString()
            .slice(0, 10);
        const num = Number(clean);
        if (!isNaN(num) && num > 40000) {
          return new Date(Math.round((num - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
        }
        return null;
      };

      // Construire la map colIndex → dateISO
      const dateCols: { colIdx: number; dateISO: string }[] = [];
      headerRow.forEach((h, i) => {
        const iso = parseDateHeader(h);
        if (iso) dateCols.push({ colIdx: i, dateISO: iso });
      });

      if (dateCols.length === 0) {
        setHeuresImportDiagnostics({
          headerRow,
          dateCols: [],
          message: 'Aucune colonne de date trouvée. Vérifiez le format (ex: 15/12/2025).',
        });
        setAlert('Aucune colonne de date trouvée. Vérifiez le format (ex: 15/12/2025).');
        return;
      }

      const idxMatricule = headerRow.findIndex((h) => /matricule/i.test(h));
      const idxNom = headerRow.findIndex((h) => /nom/i.test(h));
      const idxNote = headerRow.findIndex((h) => /note/i.test(h));

      const dataRows = aoa.slice(headerIndex + 1);
      // Diagnostic: sample rows and missing matricules
      const sampleRows = dataRows
        .slice(0, 5)
        .map((r) => (r as unknown[]).map((c) => String(c ?? '')).slice(0, 10));
      const missingMatricules: string[] = [];
      dataRows.slice(0, 200).forEach((ligne) => {
        const matricule = String((ligne as unknown[])[idxMatricule] ?? '').trim();
        if (!matricule) return;
        const emp = personnel.find((p) => String(p.matricule).trim() === matricule);
        if (!emp && !missingMatricules.includes(matricule)) missingMatricules.push(matricule);
      });

      setHeuresImportDiagnostics({
        headerRow,
        dateCols,
        idxMatricule,
        idxNom,
        idxNote,
        sampleRows,
        missingMatricules,
      });

      // Une ligne → plusieurs HeuresRowJour (une par date avec heures > 0)
      const rows: HeuresRowJour[] = [];
      dataRows.forEach((ligne, li) => {
        const matricule = String((ligne as unknown[])[idxMatricule] ?? '').trim();
        if (!matricule) return; // ligne vide

        const nomComplet = idxNom >= 0 ? String((ligne as unknown[])[idxNom] ?? '').trim() : '';
        const note = idxNote >= 0 ? String((ligne as unknown[])[idxNote] ?? '').trim() : '';
        const emp = personnel.find((p) => String(p.matricule).trim() === matricule);

        for (const { colIdx, dateISO } of dateCols) {
          const rawH = (ligne as unknown[])[colIdx];
          const heures = Math.max(0, Number(rawH) || 0);
          if (heures <= 0) continue; // on n'importe que les jours avec heures

          const dateObj = new Date(dateISO);
          const wk = getIsoWeek(dateObj);
          const yr = dateObj.getFullYear();
          let _error: string | undefined;
          if (!emp) _error = 'Matricule introuvable';

          rows.push({
            id: `hj-${li}-${colIdx}`,
            matricule,
            nom_complet: emp?.nom_complet ?? nomComplet ?? 'Inconnu',
            section: emp?.section_nom ?? '',
            personnel_id: emp?.id ?? null,
            date_travail: dateISO,
            semaine_label: `S${wk}/${yr}`,
            annee: yr,
            semaine_num: wk,
            heures,
            note,
            _error,
          });
        }
      });

      if (rows.length === 0) {
        setAlert('Aucune heure trouvée dans le fichier (toutes les cellules sont vides ou 0).');
        return;
      }

      setHeuresJourPreview(rows);
      setShowHeuresJourPreview(true);
      setHeuresImportDone(null);
    } catch (err: unknown) {
      setAlert(translatePgError(err) || 'Erreur lecture fichier.');
    }
  };

  const confirmImportHeuresJour = async () => {
    if (!supabase || !heuresJourPreview.length) return;
    const valid = heuresJourPreview.filter((r) => !r._error && r.personnel_id && r.date_travail);
    if (!valid.length) {
      setAlert('Aucune ligne valide à importer.');
      return;
    }
    setHeuresImporting(true);

    const batchId = `IMPORT-${activePeriode.debut.getFullYear()}-${String(activePeriode.debut.getMonth() + 1).padStart(2, '0')}`;
    const validRows = valid.map((row) => ({
      personnel_id: row.personnel_id,
      date_travail: row.date_travail,
      heures: row.heures,
      note: row.note || null,
      import_batch_id: batchId,
      saisi_par: profile?.id,
    }));

    const { data, error } = await supabase
      .from('rh_heures_journalieres')
      .upsert(validRows, { onConflict: 'personnel_id,date_travail' });

    const errors: { matricule: string; msg: string }[] = [];
    let ok = 0;

    if (error) {
      // En cas d'erreur globale, on retente ligne par ligne pour isoler les échecs
      for (const row of valid) {
        const { error: rowError } = await supabase.from('rh_heures_journalieres').upsert(
          {
            personnel_id: row.personnel_id,
            date_travail: row.date_travail,
            heures: row.heures,
            note: row.note || null,
            import_batch_id: batchId,
            saisi_par: profile?.id,
          },
          { onConflict: 'personnel_id,date_travail' },
        );
        if (rowError)
          errors.push({
            matricule: row.matricule,
            msg: `${row.date_travail}: ${rowError.message}`,
          });
        else ok++;
      }
    } else {
      ok = validRows.length;
    }

    // Notif heures supp
    const avecSupp = valid.filter((r) => r.heures > 10);
    if (avecSupp.length > 0) {
      notifMutation.mutate({
        to_role: 'RH',
        subject: `Import heures ${batchId} — H.Supp détectées`,
        message: `Import ${batchId} : ${ok} ligne(s) importée(s), ${avecSupp.length} journée(s) > 10h.`,
        type: 'internal',
        category: 'SYSTEM',
      });
    }

    // Synchroniser tous les onglets + budget
    await loadJoursData();
    await invalidateAll();
    await queryClient.invalidateQueries({ queryKey: ['rh_heures_journalieres'] });
    await queryClient.invalidateQueries({ queryKey: ['rh_budget_heures'] });
    await queryClient.invalidateQueries({ queryKey: ['rh_personnel_view'] });

    setHeuresImporting(false);
    setHeuresImportDone({ ok, errors });
    setShowHeuresJourPreview(false);
    setHeuresJourPreview([]);
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <AnimatedPage>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        {/* ── Dynamic Header per Tab ── */}
        {(() => {
          const tabMeta: Record<string, { title: string; subtitle: string; icon: string; kpis: { label: string; value: number | string; color: string; icon: string }[] }> = {
            personnels: {
              title: 'Personnel',
              subtitle: isReadOnly ? 'Consultation des données RH (accès DPI)' : 'Gérez la liste du personnel et leurs contrats.',
              icon: 'account-group-outline',
              kpis: [
                { label: 'Total', value: totalPersonnel, color: '#1E513B', icon: 'account-group-outline' },
                { label: 'Heures sup.', value: overtimeCount, color: '#D97706', icon: 'clock-outline' },
                { label: 'Justif. resp.', value: respOTCount, color: '#BE123C', icon: 'account-tie' },
                { label: 'Dir. OT', value: dirOTCount, color: '#7C3AED', icon: 'clock-alert-outline' },
              ],
            },
            affectations: {
              title: 'Affectations',
              subtitle: 'Gérez les demandes d\'affectation inter-sections.',
              icon: 'swap-horizontal',
              kpis: [
                { label: 'En attente', value: pendingDemandes, color: '#D97706', icon: 'clock-outline' },
                { label: 'Personnel', value: totalPersonnel, color: '#1E513B', icon: 'account-group-outline' },
                { label: 'Demandes', value: visibleDemandes.length, color: '#2563EB', icon: 'send-clock-outline' },
              ],
            },
            heures_supp: {
              title: 'Heures Supplémentaires',
              subtitle: 'Suivi des heures supplémentaires par employé.',
              icon: 'clock-alert-outline',
              kpis: [
                { label: 'Avec H.Supp', value: overtimeCount, color: '#D97706', icon: 'clock-outline' },
                { label: 'Justif. resp.', value: respOTCount, color: '#BE123C', icon: 'account-tie' },
                { label: 'Dir. OT', value: dirOTCount, color: '#7C3AED', icon: 'clock-alert-outline' },
                { label: 'Total pers.', value: totalPersonnel, color: '#1E513B', icon: 'account-group-outline' },
              ],
            },
            saisie: {
              title: 'Saisie des Heures',
              subtitle: `Période : ${activePeriode.label}`,
              icon: 'calendar-edit',
              kpis: [
                { label: 'Employés actifs', value: personnel.filter(p => p.actif).length, color: '#0D9488', icon: 'account-check' },
                { label: 'Total heures', value: joursData.reduce((a, b) => a + b.heures, 0).toFixed(1) + 'h', color: '#2563EB', icon: 'clock-outline' },
                { label: 'Avec H.Supp', value: personnel.filter((p) => p.actif && getTotaux(p.id).supp > 0).length, color: '#D97706', icon: 'clock-alert-outline' },
                { label: 'Jours période', value: periodeDates.length, color: '#7C3AED', icon: 'calendar-range' },
              ],
            },
            budget: {
              title: 'Budget Heures',
              subtitle: `Récapitulatif par section — ${activePeriode.label}`,
              icon: 'chart-bar',
              kpis: [
                { label: 'Sections', value: heuresParSection.length, color: '#1E513B', icon: 'domain' },
                { label: 'Total H.Norm.', value: heuresParSection.reduce((a, s) => a + s.totalNormales, 0).toFixed(1) + 'h', color: '#15803D', icon: 'clock-check-outline' },
                { label: 'Total Heures Supplémentaires', value: heuresParSection.reduce((a, s) => a + s.totalSupp, 0).toFixed(1) + 'h', color: '#D97706', icon: 'clock-alert-outline' },
                { label: 'Budgets actifs', value: plannedBudgets.length, color: '#2563EB', icon: 'currency-usd' },
              ],
            },
            conges: {
              title: 'Congés',
              subtitle: 'Gestion des demandes de congé et soldes.',
              icon: 'beach',
              kpis: [
                { label: 'Attente RH', value: pendingCongesRhCount, color: '#D97706', icon: 'clock-outline' },
                { label: 'Attente DPI', value: pendingCongesDpiCount, color: '#1D4ED8', icon: 'account-clock-outline' },
                { label: 'Validés', value: validesCount, color: '#16A34A', icon: 'check-decagram-outline' },
                { label: 'Refusés', value: refusesCount, color: '#DC2626', icon: 'close-circle-outline' },
                { label: 'Total', value: conges.length, color: '#6D28D9', icon: 'beach' },
              ],
            },
            imports: {
              title: 'Imports & Historique',
              subtitle: 'Historique des imports de fichiers heures.',
              icon: 'file-import-outline',
              kpis: [
                { label: 'Batches', value: batches.length, color: '#1E513B', icon: 'database-import-outline' },
                { label: 'Personnel', value: totalPersonnel, color: '#2563EB', icon: 'account-group-outline' },
              ],
            },
          };

          const meta = tabMeta[activeTab] ?? tabMeta.personnels;
          return (
            <>
              <View style={styles.headerCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.screenTitle}>{meta.title}</Text>
                  <Text style={styles.screenSubtitle}>{meta.subtitle}</Text>
                </View>
                <View style={styles.iconCard}>
                  <MaterialCommunityIcons name={meta.icon as any} size={28} color="#FFF" />
                </View>
              </View>
              <View style={[styles.kpiRow, isMobile && { flexDirection: 'column' }]}>
                {meta.kpis.map((kpi) => (
                  <View key={kpi.label} style={[styles.kpiCard, isMobile && { width: '100%' }]}>
                    <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
                      <MaterialCommunityIcons name={kpi.icon as any} size={20} color={kpi.color} />
                    </View>
                    <View>
                      <Text style={styles.kpiValue}>{kpi.value}</Text>
                      <Text style={styles.kpiLabel}>{kpi.label}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          );
        })()}


        {/* Banners */}
        {isReadOnly && (
          <View style={styles.readOnlyBanner}>
            <MaterialCommunityIcons name="eye-outline" size={16} color="#92400E" />
            <Text style={styles.readOnlyText}>Mode consultation — Validation autorisée (DPI)</Text>
          </View>
        )}
        {isRprod && mySection && (
          <View style={styles.scopeBanner}>
            <MaterialCommunityIcons name="filter-outline" size={16} color="#1E40AF" />
            <Text style={styles.scopeText}>
              Section filtrée : <Text style={{ fontWeight: '800' }}>{mySection.nom}</Text>
            </Text>
          </View>
        )}
        {importError && (
          <View style={styles.alertBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#991B1B" />
            <Text style={styles.alertText}>{importError}</Text>
          </View>
        )}

        {/* ── TAB: PERSONNELS ── */}
        {activeTab === 'personnels' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Liste des personnels ({totalPersonnel})</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {!isReadOnly && (
                  <ActionButton label="Importer" icon="file-import" onPress={selectImportFile} variant="secondary" />
                )}
                {!isReadOnly && (
                  <ActionButton
                    label="Mettre à jour"
                    icon="sync"
                    variant="secondary"
                    loading={isSyncing}
                    onPress={handleSmartSync}
                  />
                )}
                <ActionButton label="Exporter Excel" icon="file-export" onPress={exportExcel} variant="secondary" />
                {!isReadOnly && (
                  <ActionButton label="Ajouter" icon="account-plus" onPress={openCrudCreate} />
                )}
              </View>
            </View>

            {/* Rapport de synchronisation */}
            {syncReport && (
              <View
                style={{
                  marginBottom: 12,
                  padding: 14,
                  borderRadius: 12,
                  backgroundColor: '#F0FDF4',
                  borderWidth: 1,
                  borderColor: '#86EFAC',
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}
                >
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color="#15803D" />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#15803D' }}>
                    Synchronisation terminée
                  </Text>
                  <TouchableOpacity
                    onPress={() => setSyncReport(null)}
                    style={{ marginLeft: 'auto' as any }}
                  >
                    <MaterialCommunityIcons name="close" size={16} color="#15803D" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                  <View
                    style={{
                      padding: 10,
                      backgroundColor: '#DCFCE7',
                      borderRadius: 8,
                      alignItems: 'center',
                      minWidth: 80,
                    }}
                  >
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#15803D' }}>
                      {syncReport.inserted}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#15803D', fontWeight: '600' }}>
                      Nouveaux
                    </Text>
                  </View>
                  <View
                    style={{
                      padding: 10,
                      backgroundColor: '#FEF9C3',
                      borderRadius: 8,
                      alignItems: 'center',
                      minWidth: 80,
                    }}
                  >
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#854D0E' }}>
                      {syncReport.updated}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#854D0E', fontWeight: '600' }}>
                      Mis à jour
                    </Text>
                  </View>
                  <View
                    style={{
                      padding: 10,
                      backgroundColor: '#F1F5F9',
                      borderRadius: 8,
                      alignItems: 'center',
                      minWidth: 80,
                    }}
                  >
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#475569' }}>
                      {syncReport.unchanged}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>
                      Inchangés
                    </Text>
                  </View>
                  {syncReport.errors.length > 0 && (
                    <View
                      style={{
                        padding: 10,
                        backgroundColor: '#FEE2E2',
                        borderRadius: 8,
                        alignItems: 'center',
                        minWidth: 80,
                      }}
                    >
                      <Text style={{ fontSize: 20, fontWeight: '900', color: '#991B1B' }}>
                        {syncReport.errors.length}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#991B1B', fontWeight: '600' }}>
                        Erreurs
                      </Text>
                    </View>
                  )}
                </View>
                {syncReport.errors.length > 0 && (
                  <View
                    style={{
                      marginTop: 10,
                      padding: 10,
                      backgroundColor: '#FEE2E2',
                      borderRadius: 8,
                    }}
                  >
                    {syncReport.errors.slice(0, 5).map((e, i) => (
                      <Text key={i} style={{ fontSize: 12, color: '#991B1B' }}>
                        • {e.matricule} : {e.msg}
                      </Text>
                    ))}
                    {syncReport.errors.length > 5 && (
                      <Text style={{ fontSize: 12, color: '#991B1B' }}>
                        ...et {syncReport.errors.length - 5} autre(s)
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Filtres Société / Section */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              {/* Filtre Société */}
              <View style={{ flex: 1, minWidth: 160 }}>
                <View style={styles.filterSelect}>
                  <MaterialCommunityIcons
                    name="office-building-outline"
                    size={15}
                    color="#94A3B8"
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[styles.filterSelectText, !filterSociete && { color: '#94A3B8' }]}
                    onPress={() => {}}
                  >
                    {filterSociete
                      ? societeOptions.find((o) => o.value === filterSociete)?.label || 'Société'
                      : 'Toutes les sociétés'}
                  </Text>
                  {filterSociete ? (
                    <TouchableOpacity
                      onPress={() => {
                        setFilterSociete('');
                        setFilterSection('');
                      }}
                    >
                      <MaterialCommunityIcons name="close-circle" size={15} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {/* Dropdown société */}
                {societeOptions.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ maxHeight: 0, overflow: 'hidden' }}
                  />
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {societeOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => {
                        setFilterSociete(filterSociete === opt.value ? '' : opt.value);
                        setFilterSection('');
                      }}
                      style={[
                        styles.filterChip,
                        filterSociete === opt.value && styles.filterChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          filterSociete === opt.value && styles.filterChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Filtre Section */}
              <View style={{ flex: 1, minWidth: 160 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {sectionFilterOptions.slice(0, 8).map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setFilterSection(filterSection === opt.value ? '' : opt.value)}
                      style={[styles.filterChip, filterSection === opt.value && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, filterSection === opt.value && styles.filterChipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Filtre Statut contrat */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <MaterialCommunityIcons name="card-account-details-outline" size={15} color="#64748B" />
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748B', marginRight: 4 }}>Statut :</Text>
              {([
                { label: 'Tous', value: '' },
                { label: 'PERMANANT', value: 'FIXE' },
                { label: 'TEMPORAIRE', value: 'TEMPORAIRE' },
              ] as const).map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setFilterContrat(opt.value)}
                  style={[
                    styles.filterChip,
                    filterContrat === opt.value && styles.filterChipActive,
                    opt.value === 'FIXE' && filterContrat !== 'FIXE' && { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
                    opt.value === 'TEMPORAIRE' && filterContrat !== 'TEMPORAIRE' && { borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
                  ]}
                >
                  <Text style={[
                    styles.filterChipText,
                    filterContrat === opt.value && styles.filterChipTextActive,
                    opt.value === 'FIXE' && filterContrat !== 'FIXE' && { color: '#1D4ED8' },
                    opt.value === 'TEMPORAIRE' && filterContrat !== 'TEMPORAIRE' && { color: '#92400E' },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Recherche */}
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher par nom, matricule ou section..."
                placeholderTextColor="#94A3B8"
                value={searchQuery ?? ''}
                onChangeText={setSearchQuery}
              />
              {searchQuery !== '' && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Import preview */}
            {showPreview && importPreview.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Aperçu — {importPreview.length} ligne(s)</Text>

                {/* Barre de progression */}
                {importProgress && (
                  <View style={{ marginBottom: 12 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginBottom: 6,
                      }}
                    >
                      <Text style={{ fontSize: 12, color: '#64748B' }}>Import en cours…</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>
                        {importProgress.done} / {importProgress.total}
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 999 }}>
                      <View
                        style={{
                          height: 6,
                          borderRadius: 999,
                          backgroundColor: C.green,
                          width:
                            `${Math.round((importProgress.done / importProgress.total) * 100)}%` as any,
                        }}
                      />
                    </View>
                  </View>
                )}

                <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                  <View style={[styles.table, { width: '100%' }]}>
                    <View style={[styles.tableRow, styles.tableHead]}>
                      {[
                        'Société',
                        'Section',
                        'Matricule',
                        'Nom',
                        'Embauche',
                        'Type',
                        'H.hebdo',
                      ].map((h) => (
                        <Text key={h} style={styles.thCell}>
                          {h}
                        </Text>
                      ))}
                    </View>
                    {importPreview.slice(0, 6).map((row) => (
                      <View key={row.id} style={styles.tableRow}>
                        <Text style={styles.tdCell}>{row.company}</Text>
                        <Text style={styles.tdCell}>{row.section}</Text>
                        <Text style={styles.tdCell}>{row.matricule}</Text>
                        <Text style={styles.tdCell}>{row.full_name}</Text>
                        <Text style={styles.tdCell}>{row.hire_date}</Text>
                        <Text style={styles.tdCell}>{row.contract_type}</Text>
                        <Text style={styles.tdCell}>{row.weekly_hours}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                {importPreview.length > 6 && (
                  <Text style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>
                    ...et {importPreview.length - 6} ligne(s) supplémentaire(s)
                  </Text>
                )}

                {/* Erreurs par ligne */}
                {importErrors.length > 0 && (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 10,
                      backgroundColor: '#FEF3C7',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#FCD34D',
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <MaterialCommunityIcons name="alert-outline" size={14} color="#92400E" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>
                        {importErrors.length} ligne(s) en erreur :
                      </Text>
                    </View>
                    {importErrors.slice(0, 5).map((e, i) => (
                      <Text key={i} style={{ fontSize: 12, color: '#92400E' }}>
                        {' '}
                        {e.matricule} : {e.msg}
                      </Text>
                    ))}
                    {importErrors.length > 5 && (
                      <Text style={{ fontSize: 12, color: '#92400E' }}>
                        ...et {importErrors.length - 5} autre(s)
                      </Text>
                    )}
                  </View>
                )}

                {/* Bannière succès */}
                {importSuccess && (
                  <View
                    style={{
                      marginTop: 12,
                      padding: 12,
                      backgroundColor: '#D1FAE5',
                      borderRadius: 10,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      borderWidth: 1,
                      borderColor: '#6EE7B7',
                    }}
                  >
                    <MaterialCommunityIcons name="check-circle-outline" size={18} color="#065F46" />
                    <Text style={{ color: '#065F46', fontSize: 13, fontWeight: '700', flex: 1 }}>
                      Import réussi — {importPreview.length - importErrors.length} ligne(s)
                      enregistrée(s)
                      {importErrors.length > 0 ? `, ${importErrors.length} erreur(s)` : ''}.
                    </Text>
                  </View>
                )}

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'flex-end',
                    gap: 10,
                    marginTop: 16,
                  }}
                >
                  <ActionButton
                    label="Fermer"
                    variant="secondary"
                    onPress={() => {
                      setImportPreview([]);
                      setShowPreview(false);
                      setImportSuccess(false);
                      setImportErrors([]);
                      setImportProgress(null);
                    }}
                  />
                  {!importSuccess && !importProgress && (
                    <ActionButton label="Confirmer l'import" icon="check" onPress={confirmImport} />
                  )}
                </View>
              </View>
            )}

            {/* Personnel — Tableau PC/Tablette */}
            {!isMobile && (
              <View style={styles.card}>
                <View style={styles.tableWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ flexGrow: 1, minWidth: 900 }}
                  >
                    <View style={{ flexGrow: 1, minWidth: 900, width: '100%' }}>
                      <View style={[styles.tableRowFull, styles.tableHead]}>
                        {/* Checkbox tout sélectionner */}
                        {!isReadOnly && (
                          <TouchableOpacity
                            onPress={() => toggleRhSelectAll(pagedPersonnel.map((p) => p.id))}
                            style={{ minWidth: 36, alignItems: 'center', justifyContent: 'center' }}
                          >
                            <MaterialCommunityIcons
                              name={
                                pagedPersonnel.length > 0 &&
                                pagedPersonnel.every((p) => rhSelectedIds.includes(p.id))
                                  ? 'checkbox-marked'
                                  : pagedPersonnel.some((p) => rhSelectedIds.includes(p.id))
                                    ? 'minus-box'
                                    : 'checkbox-blank-outline'
                              }
                              size={18}
                              color={rhSelectedIds.length > 0 ? '#2563EB' : '#94A3B8'}
                            />
                          </TouchableOpacity>
                        )}
                        <Text style={[styles.thCell, { flex: 0.6, minWidth: 50 }]}>Société</Text>
                        <Text style={[styles.thCell, { flex: 0.8, minWidth: 90 }]}>Statut</Text>
                        <Text style={[styles.thCell, { flex: 0.6, minWidth: 55 }]}>Matricule</Text>
                        <Text style={[styles.thCell, { flex: 2.5, minWidth: 200 }]}>Nom Prénom</Text>
                        <Text style={[styles.thCell, { minWidth: 120 }]}>Date Embauche</Text>
                        <Text style={[styles.thCell, { minWidth: 110 }]}>Section</Text>
                        {!isReadOnly && (
                          <Text style={[styles.thCell, { minWidth: 130 }]}>Actions</Text>
                        )}
                      </View>
                      {visiblePersonnel.length === 0 ? (
                        <View style={styles.emptyState}>
                          <MaterialCommunityIcons
                            name="account-off-outline"
                            size={40}
                            color="#CBD5E1"
                          />
                          <Text style={styles.emptyText}>
                            {searchQuery
                              ? `Aucun résultat pour "${searchQuery}"`
                              : `Aucun personnel${isRprod ? ' dans votre section' : ''}. Utilisez le bouton Importer.`}
                          </Text>
                        </View>
                      ) : (
                        <FlatList
                          data={pagedPersonnel}
                          keyExtractor={(p) => p.id}
                          scrollEnabled={false}
                          renderItem={({ item: p, index: idx }) => (
                            <View
                              style={[
                                styles.tableRowFull,
                                idx % 2 === 1 && styles.tableRowAlt,
                                !p.actif && { opacity: 0.5 },
                                rhSelectedIds.includes(p.id) && { backgroundColor: '#EFF6FF' },
                              ]}
                            >
                              {!isReadOnly && (
                                <TouchableOpacity
                                  onPress={() => toggleRhSelect(p.id)}
                                  style={{ minWidth: 36, alignItems: 'center', justifyContent: 'center' }}
                                >
                                  <MaterialCommunityIcons
                                    name={rhSelectedIds.includes(p.id) ? 'checkbox-marked' : 'checkbox-blank-outline'}
                                    size={18}
                                    color={rhSelectedIds.includes(p.id) ? '#2563EB' : '#CBD5E1'}
                                  />
                                </TouchableOpacity>
                              )}
                              <Text style={[styles.tdCell, { flex: 0.6, minWidth: 50 }]}>
                                {p.societe_code || '—'}
                              </Text>
                              {/* Statut : PERMANANT / TEMPORAIRE */}
                              <View
                                style={{
                                  flex: 0.8,
                                  minWidth: 90,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                }}
                              >
                                <View
                                  style={[
                                    styles.badge,
                                    {
                                      backgroundColor:
                                        p.type_contrat === 'FIXE' ? '#EFF6FF' : '#FFFBEB',
                                      borderColor:
                                        p.type_contrat === 'FIXE' ? '#BFDBFE' : '#FCD34D',
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.badgeText,
                                      { color: p.type_contrat === 'FIXE' ? '#1D4ED8' : '#92400E' },
                                    ]}
                                  >
                                    {p.type_contrat === 'FIXE' ? 'PERMANANT' : 'TEMPORAIRE'}
                                  </Text>
                                </View>
                              </View>
                              <Text style={[styles.tdCell, { flex: 0.6, minWidth: 55, fontWeight: '700' }]}>
                                {p.matricule}
                              </Text>
                              <Text
                                style={[styles.tdCell, { flex: 2.5, minWidth: 200 }]}
                                numberOfLines={1}
                                ellipsizeMode="tail"
                              >
                                {p.nom_complet}
                              </Text>
                              <Text style={[styles.tdCell, { minWidth: 120 }]}>
                                {p.date_embauche
                                  ? new Date(p.date_embauche).toLocaleDateString('fr-FR')
                                  : '—'}
                              </Text>
                              <Text style={[styles.tdCell, { minWidth: 110 }]}>
                                {p.section_nom}
                              </Text>
                              {!isReadOnly && (
                                <View
                                  style={{
                                    minWidth: 130,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 6,
                                  }}
                                >
                                  <TouchableOpacity
                                    onPress={() => openCrudEdit(p)}
                                    style={s_act.btn}
                                  >
                                    <MaterialCommunityIcons
                                      name="pencil-outline"
                                      size={15}
                                      color="#2563EB"
                                    />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => handleToggleActif(p)}
                                    style={[
                                      s_act.btn,
                                      { backgroundColor: p.actif ? '#FEF3C7' : '#D1FAE5' },
                                    ]}
                                  >
                                    <MaterialCommunityIcons
                                      name={
                                        p.actif ? 'account-off-outline' : 'account-check-outline'
                                      }
                                      size={15}
                                      color={p.actif ? '#D97706' : '#059669'}
                                    />
                                  </TouchableOpacity>
                                  {(role === 'ADMIN' || role === 'RH') && (
                                    <TouchableOpacity
                                      onPress={() => handleCrudDelete(p)}
                                      style={[s_act.btn, { backgroundColor: '#FEE2E2' }]}
                                    >
                                      <MaterialCommunityIcons name="trash-can-outline" size={15} color="#BE123C" />
                                    </TouchableOpacity>
                                  )}
                                </View>
                              )}
                            </View>
                          )}
                        />
                      )}
                    </View>
                  </ScrollView>
                </View>
                {totalPages > 1 && (
                  <View style={styles.paginationRow}>
                    <TouchableOpacity
                      style={[styles.pageBtn, personnelPage === 0 && styles.pageBtnDisabled]}
                      onPress={() => setPersonnelPage((p) => Math.max(0, p - 1))}
                      disabled={personnelPage === 0}
                    >
                      <MaterialCommunityIcons
                        name="chevron-left"
                        size={18}
                        color={personnelPage === 0 ? '#CBD5E1' : '#374151'}
                      />
                    </TouchableOpacity>
                    <Text style={styles.pageInfo}>
                      {personnelPage * PERSONNEL_PAGE_SIZE + 1}–
                      {Math.min((personnelPage + 1) * PERSONNEL_PAGE_SIZE, visiblePersonnel.length)}{' '}
                      / {visiblePersonnel.length}
                    </Text>
                    {Array.from({ length: totalPages }, (_, i) => i)
                      .filter((i) => Math.abs(i - personnelPage) <= 2)
                      .map((i) => (
                        <TouchableOpacity
                          key={i}
                          style={[
                            styles.pageNumBtn,
                            i === personnelPage && styles.pageNumBtnActive,
                          ]}
                          onPress={() => setPersonnelPage(i)}
                        >
                          <Text
                            style={[
                              styles.pageNumText,
                              i === personnelPage && styles.pageNumTextActive,
                            ]}
                          >
                            {i + 1}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    <TouchableOpacity
                      style={[
                        styles.pageBtn,
                        personnelPage >= totalPages - 1 && styles.pageBtnDisabled,
                      ]}
                      onPress={() => setPersonnelPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={personnelPage >= totalPages - 1}
                    >
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={personnelPage >= totalPages - 1 ? '#CBD5E1' : '#374151'}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ── Barre d'actions multi-sélection RH ── */}
            {!isReadOnly && rhSelectedIds.length > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#1E40AF',
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  marginTop: 12,
                  gap: 10,
                  flexWrap: 'wrap',
                }}
              >
                <MaterialCommunityIcons name="check-circle" size={18} color="#93C5FD" />
                <Text style={{ color: '#FFF', fontWeight: '700', flex: 1, fontSize: 13, minWidth: 140 }}>
                  {rhSelectedIds.length} personnel{rhSelectedIds.length > 1 ? 's' : ''} sélectionné{rhSelectedIds.length > 1 ? 's' : ''}
                </Text>

                {/* ── Bouton Détail ── */}
                <TouchableOpacity
                  onPress={() => {
                    const sel = personnel.filter((p) => rhSelectedIds.includes(p.id));
                    Alert.alert(
                      'Sélection',
                      `${sel.length} personnel(s) :\n${sel.slice(0, 5).map((p) => p.nom_complet).join('\n')}${sel.length > 5 ? '\n...' : ''}`,
                    );
                  }}
                  style={{ backgroundColor: '#3B82F6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '600' }}>Détail</Text>
                </TouchableOpacity>

                {/* ── Bouton Supprimer (ADMIN uniquement) ── */}
                {(role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'RH') && (
                  <TouchableOpacity
                    onPress={() => {
                      const sel = personnel.filter((p) => rhSelectedIds.includes(p.id));
                      const names = sel.slice(0, 5).map((p) => p.nom_complet).join('\n');
                      const extra = sel.length > 5 ? `\n… et ${sel.length - 5} autre(s)` : '';
                      confirmAction(
                        `Supprimer ${sel.length} personnel${sel.length > 1 ? 's' : ''} ?`,
                        `Cette action est irréversible.\n\n${names}${extra}`,
                        async () => {
                          if (!supabase) return;
                          let errCount = 0;
                          for (const p of sel) {
                            const { error } = await supabase
                              .from('rh_personnels')
                              .delete()
                              .eq('id', p.id);
                            if (error) errCount++;
                          }
                          setRhSelectedIds([]);
                          await invalidateAll();
                          if (errCount > 0) {
                            setAlert(`${errCount} suppression(s) ont échoué. Vérifiez les contraintes FK.`);
                          }
                        },
                        'danger',
                      );
                    }}
                    style={{
                      backgroundColor: '#DC2626',
                      borderRadius: 6,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '700' }}>
                      Supprimer ({rhSelectedIds.length})
                    </Text>
                  </TouchableOpacity>
                )}

                {/* ── Bouton Effacer sélection ── */}
                <TouchableOpacity
                  onPress={() => setRhSelectedIds([])}
                  style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ color: '#FFF', fontSize: 12 }}>✓ Effacer</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Personnel — Cartes Mobile */}
            {isMobile && (
              <View>
                {visiblePersonnel.length === 0 ? (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="account-off-outline" size={40} color="#CBD5E1" />
                    <Text style={styles.emptyText}>
                      {searchQuery
                        ? `Aucun résultat pour "${searchQuery}"`
                        : `Aucun personnel${isRprod ? ' dans votre section' : ''}. Utilisez le bouton Importer.`}
                    </Text>
                  </View>
                ) : (
                  <FlatList
                    data={pagedPersonnel}
                    keyExtractor={(p) => p.id}
                    scrollEnabled={false}
                    renderItem={({ item: p }) => (
                      <View style={[styles.mobileCard, !p.actif && { opacity: 0.5 }]}>
                        {/* Ligne 1 : Société + Badge statut */}
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 6,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: '#94A3B8',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                            }}
                          >
                            {p.societe_code || '—'}
                          </Text>
                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor: p.type_contrat === 'FIXE' ? '#EFF6FF' : '#FFFBEB',
                                borderColor: p.type_contrat === 'FIXE' ? '#BFDBFE' : '#FCD34D',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                { color: p.type_contrat === 'FIXE' ? '#1D4ED8' : '#92400E' },
                              ]}
                            >
                              {p.type_contrat === 'FIXE' ? 'PERMANANT' : 'TEMPORAIRE'}
                            </Text>
                          </View>
                        </View>
                        {/* Ligne 2 : Matricule + Nom */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: '800',
                              color: '#1E513B',
                              minWidth: 36,
                            }}
                          >
                            {p.matricule}
                          </Text>
                          <Text
                            style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 }}
                          >
                            {p.nom_complet}
                          </Text>
                        </View>
                        {/* Ligne 3 : Section + Date */}
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialCommunityIcons name="domain" size={12} color="#94A3B8" />
                            <Text style={{ fontSize: 12, color: '#475569' }}>{p.section_nom}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialCommunityIcons
                              name="calendar-outline"
                              size={12}
                              color="#94A3B8"
                            />
                            <Text style={{ fontSize: 12, color: '#475569' }}>
                              {p.date_embauche
                                ? new Date(p.date_embauche).toLocaleDateString('fr-FR')
                                : '—'}
                            </Text>
                          </View>
                          {p.heures_supp_derniere_semaine > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <MaterialCommunityIcons
                                name="clock-alert-outline"
                                size={12}
                                color="#D97706"
                              />
                              <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '700' }}>
                                +{p.heures_supp_derniere_semaine.toFixed(2)}h supp.
                              </Text>
                            </View>
                          )}
                        </View>
                        {/* Actions */}
                        {!isReadOnly && (
                          <View
                            style={{
                              flexDirection: 'row',
                              gap: 8,
                              borderTopWidth: 1,
                              borderColor: '#F1F5F9',
                              paddingTop: 8,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => openCrudEdit(p)}
                              style={[
                                s_act.btn,
                                {
                                  flex: 1,
                                  borderRadius: 8,
                                  height: 34,
                                  backgroundColor: '#EFF6FF',
                                },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name="pencil-outline"
                                size={16}
                                color="#2563EB"
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleToggleActif(p)}
                              style={[
                                s_act.btn,
                                {
                                  flex: 1,
                                  borderRadius: 8,
                                  height: 34,
                                  backgroundColor: p.actif ? '#FEF3C7' : '#D1FAE5',
                                },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={p.actif ? 'account-off-outline' : 'account-check-outline'}
                                size={16}
                                color={p.actif ? '#D97706' : '#059669'}
                              />
                            </TouchableOpacity>
                            {(role === 'ADMIN' || role === 'RH') && (
                              <TouchableOpacity
                                onPress={() => handleCrudDelete(p)}
                                style={[s_act.btn, { flex: 1, borderRadius: 8, height: 34, backgroundColor: '#FEE2E2' }]}
                              >
                                <MaterialCommunityIcons name="trash-can-outline" size={16} color="#BE123C" />
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    )}
                  />
                )}
                {totalPages > 1 && (
                  <View style={styles.paginationRow}>
                    <TouchableOpacity
                      style={[styles.pageBtn, personnelPage === 0 && styles.pageBtnDisabled]}
                      onPress={() => setPersonnelPage((p) => Math.max(0, p - 1))}
                      disabled={personnelPage === 0}
                    >
                      <MaterialCommunityIcons
                        name="chevron-left"
                        size={18}
                        color={personnelPage === 0 ? '#CBD5E1' : '#374151'}
                      />
                    </TouchableOpacity>
                    <Text style={styles.pageInfo}>
                      {personnelPage * PERSONNEL_PAGE_SIZE + 1}–
                      {Math.min((personnelPage + 1) * PERSONNEL_PAGE_SIZE, visiblePersonnel.length)}{' '}
                      / {visiblePersonnel.length}
                    </Text>
                    <TouchableOpacity
                      style={[
                        styles.pageBtn,
                        personnelPage >= totalPages - 1 && styles.pageBtnDisabled,
                      ]}
                      onPress={() => setPersonnelPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={personnelPage >= totalPages - 1}
                    >
                      <MaterialCommunityIcons
                        name="chevron-right"
                        size={18}
                        color={personnelPage >= totalPages - 1 ? '#CBD5E1' : '#374151'}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* ── TAB: AFFECTATIONS ── */}
        {activeTab === 'affectations' && (
          <View>
            {!isReadOnly && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Nouvelle demande d'affectation</Text>
                <FormSelect
                  label="Section source (qui prête)"
                  options={sectionOptionsAffectation}
                  value={assignFrom ?? ''}
                  onSelect={setAssignFrom}
                />
                <FormSelect
                  label="Section cible (qui reçoit)"
                  options={sectionOptionsAffectation.filter((o) => o.value !== assignFrom)}
                  value={assignTo ?? ''}
                  onSelect={setAssignTo}
                />
                <FormInput
                  label="Date de démarrage"
                  placeholder="JJ/MM/AAAA"
                  value={assignDate ?? ''}
                  onChangeText={setAssignDate}
                />
                <FormInput
                  label="Heures par jour"
                  placeholder="8"
                  value={String(assignHours)}
                  onChangeText={(t) => setAssignHours(Number(t.replace(/[^0-9]/g, '') || 8))}
                  keyboardType="numeric"
                />
                <FormInput
                  label="Motif / Commentaire"
                  placeholder="Précisez le besoin..."
                  value={assignNote ?? ''}
                  onChangeText={setAssignNote}
                />
                <Text style={styles.subLabel}>Sélectionner le personnel à affecter</Text>
                <View style={styles.selectionList}>
                  {!assignFrom ? (
                    <Text style={styles.hintText}>Sélectionnez d'abord la section source.</Text>
                  ) : visiblePersonnel.filter((p) => p.section_id === assignFrom).length === 0 ? (
                    <Text style={styles.hintText}>Aucun personnel dans cette section.</Text>
                  ) : (
                    visiblePersonnel
                      .filter((p) => p.section_id === assignFrom)
                      .map((p) => (
                        <TouchableOpacity
                          key={p.id}
                          style={[
                            styles.selectionItem,
                            selectedIds.includes(p.id) && styles.selectionItemActive,
                          ]}
                          onPress={() => toggleEmployee(p.id)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.selectionName}>{p.nom_complet}</Text>
                            <Text style={styles.selectionMeta}>
                              {p.matricule} · {p.type_contrat} · {p.heures_derniere_semaine}h/sem
                            </Text>
                          </View>
                          <MaterialCommunityIcons
                            name={
                              selectedIds.includes(p.id)
                                ? 'checkbox-marked-circle'
                                : 'checkbox-blank-circle-outline'
                            }
                            size={22}
                            color={selectedIds.includes(p.id) ? C.green : '#94A3B8'}
                          />
                        </TouchableOpacity>
                      ))
                  )}
                </View>
                {selectedIds.length > 0 && (
                  <Text
                    style={{ fontSize: 12, color: C.green, marginBottom: 12, fontWeight: '700' }}
                  >
                    {selectedIds.length} personnel(s) sélectionné(s)
                  </Text>
                )}
                <ActionButton
                  label="Créer la demande"
                  icon="send"
                  onPress={createAssignmentRequest}
                />
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Demandes ({visibleDemandes.length})</Text>
            </View>
            {visibleDemandes.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons
                  name="swap-horizontal-circle-outline"
                  size={40}
                  color="#CBD5E1"
                />
                <Text style={styles.emptyText}>Aucune demande d'affectation.</Text>
              </View>
            ) : (
              visibleDemandes.map((req) => {
                const src = sectionById[req.section_demandeur]?.nom || req.section_demandeur;
                const dst = sectionById[req.section_fournisseur]?.nom || req.section_fournisseur;
                const count = req.rh_affectations?.length ?? req.nb_personnes;

                // Validation PLAN : RPROD ou ADMIN, sur statut EN_ATTENTE_PLAN
                const canValidatePlan =
                  (role === 'ADMIN' || role === 'RPROD') &&
                  (req.statut as string) === 'EN_ATTENTE_PLAN';
                // Validation RH  : RH, ADMIN ou DPI, sur statut EN_ATTENTE_RH
                const canValidateRH =
                  (role === 'ADMIN' || role === 'RH' || role === 'DPI') &&
                  (req.statut as string) === 'EN_ATTENTE_RH';
                // Ancienne logique EN_ATTENTE conservée pour rétrocompatibilité
                const canValidateLegacy =
                  (role === 'ADMIN' || role === 'RH' || role === 'DPI') &&
                  req.statut === 'EN_ATTENTE';
                const canTerminate =
                  (role === 'ADMIN' || role === 'RH') && req.statut === 'APPROUVE';
                return (
                  <View key={req.id} style={styles.requestCard}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.requestTitle}>
                          {src} → {dst}
                        </Text>
                        <Text style={styles.requestMeta}>
                          {count} personne(s) · {req.date_debut}
                        </Text>
                      </View>
                      <StatusBadge statut={req.statut} />
                    </View>
                    {req.heures_par_jour > 0 && (
                      <Text style={styles.requestLine}>Heures/jour : {req.heures_par_jour}h</Text>
                    )}
                    {req.motif && <Text style={styles.requestLine}>Motif : {req.motif}</Text>}
                    {req.commentaire_rejet && (
                      <Text style={[styles.requestLine, { color: '#BE123C' }]}>
                        Motif rejet : {req.commentaire_rejet}
                      </Text>
                    )}
                    {req.approuve_at && (
                      <Text style={styles.requestLine}>
                        Traité le : {new Date(req.approuve_at).toLocaleDateString('fr-FR')}
                      </Text>
                    )}
                    {(canValidatePlan || canValidateRH || canValidateLegacy || canTerminate) && (
                      <View
                        style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}
                      >
                        {/* Étape 1 : validation PLAN (RPROD/ADMIN) */}
                        {canValidatePlan && (
                          <>
                            <ActionButton
                              label="Valider (PLAN)"
                              icon="clipboard-check-outline"
                              onPress={() => approuvePlan(req.id)}
                            />
                            <ActionButton
                              label="Rejeter"
                              icon="close-circle-outline"
                              variant="secondary"
                              onPress={() => {
                                setRejectModal({ id: req.id });
                                setRejectComment('');
                              }}
                            />
                          </>
                        )}
                        {/* Étape 2 : validation RH (RH/ADMIN/DPI) */}
                        {canValidateRH && (
                          <>
                            <ActionButton
                              label="Approuver (RH)"
                              icon="check-circle-outline"
                              onPress={() => approuveDemande(req.id)}
                            />
                            <ActionButton
                              label="Rejeter"
                              icon="close-circle-outline"
                              variant="secondary"
                              onPress={() => {
                                setRejectModal({ id: req.id });
                                setRejectComment('');
                              }}
                            />
                          </>
                        )}
                        {/* Rétrocompatibilité anciens statuts EN_ATTENTE */}
                        {canValidateLegacy && (
                          <>
                            <ActionButton
                              label="Approuver"
                              icon="check-circle-outline"
                              onPress={() => approuveDemande(req.id)}
                            />
                            <ActionButton
                              label="Rejeter"
                              icon="close-circle-outline"
                              variant="secondary"
                              onPress={() => {
                                setRejectModal({ id: req.id });
                                setRejectComment('');
                              }}
                            />
                          </>
                        )}
                        {canTerminate && (
                          <ActionButton
                            label="Marquer terminé"
                            icon="flag-checkered"
                            variant="secondary"
                            onPress={() => terminerDemande(req.id)}
                          />
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ── TAB: HEURES SUP ── */}
        {activeTab === 'heures_sup' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Suivi heures supplémentaires</Text>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <View
                  style={[styles.badge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}
                >
                  <MaterialCommunityIcons name="account-tie" size={11} color="#92400E" />
                  <Text style={[styles.badgeText, { color: '#92400E' }]}>
                    Resp : {activeTab === 'heures_sup' ? periodOtCounts.resp : respOTCount}
                  </Text>
                </View>
                <View
                  style={[styles.badge, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}
                >
                  <MaterialCommunityIcons name="shield-alert-outline" size={11} color="#991B1B" />
                  <Text style={[styles.badgeText, { color: '#991B1B' }]}>
                    Dir : {activeTab === 'heures_sup' ? periodOtCounts.dir : dirOTCount}
                  </Text>
                </View>

              </View>
            </View>

            {/* Légende */}
            <View style={[styles.card, { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }]}>
              {Object.entries(OT_CONFIG).map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: v.color }}
                  />
                  <Text style={{ fontSize: 12, color: '#475569' }}>{v.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={[styles.table, { width: '100%' }]}>
                  {/* En-tête — flex proportionnel pour remplir tout l'écran */}
                  <View style={[styles.tableHead, { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 0 }]}>
                    <Text style={[styles.thCell, { flex: 1 }]}>MATR.</Text>
                    <Text style={[styles.thCell, { flex: 2 }]}>NOM</Text>
                    <Text style={[styles.thCell, { flex: 1.5 }]}>SECTION</Text>
                    <Text style={[styles.thCell, { flex: 1 }]}>H.HEBDO</Text>
                    <Text style={[styles.thCell, { flex: 1.2 }]}>HEURES SUPP.</Text>
                    <Text style={[styles.thCell, { flex: 1.5 }]}>NIVEAU</Text>
                    <Text style={[styles.thCell, { flex: 2 }]}>JUSTIFICATION</Text>
                  </View>
                  {periodOtRows.length === 0 ? (
                    <View style={styles.emptyState}>
                      <MaterialCommunityIcons
                        name="clock-check-outline"
                        size={40}
                        color="#CBD5E1"
                      />
                      <Text style={styles.emptyText}>Aucune heure supplémentaire détectée.</Text>
                    </View>
                  ) : (
                    periodOtRows
                      .filter((r) => r.supp > 0)
                      .sort((a, b) => b.supp - a.supp)
                      .map((r) => {
                        const level = getOtLevel(r.supp);
                        const cfg = OT_CONFIG[level];
                        return (
                          <View
                            key={r.id}
                            style={[
                              styles.tableRow,
                              { borderTopWidth: 1, borderColor: '#F1F5F9' },
                              level === 'Direction' && { backgroundColor: '#FFF5F5' },
                              level === 'Responsable' && { backgroundColor: '#FFFBEB' },
                            ]}
                          >
                            <Text style={[styles.tdCell, { flex: 1 }]}>{r.matricule}</Text>
                            <Text
                              style={[styles.tdCell, { flex: 2 }]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {r.nom_complet}
                            </Text>
                            <Text style={[styles.tdCell, { flex: 1.5 }]} numberOfLines={1} ellipsizeMode="tail">{r.section_nom}</Text>
                            <Text style={[styles.tdCell, { flex: 1 }]}>
                              {r.total.toFixed(2)}h
                            </Text>
                            <Text
                              style={[
                                styles.tdCell,
                                { flex: 1.2, fontWeight: '700', color: cfg.color },
                              ]}
                            >
                              {r.supp.toFixed(2)}h
                            </Text>
                            <View style={{ flex: 1.5, justifyContent: 'center' }}>
                              <OTBadge hs={r.supp} />
                            </View>
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                flex: 2,
                              }}
                            >
                              {level === 'Direction' && (
                                <MaterialCommunityIcons
                                  name="alert-octagon-outline"
                                  size={13}
                                  color="#BE123C"
                                />
                              )}
                              {level === 'Responsable' && (
                                <MaterialCommunityIcons
                                  name="alert-outline"
                                  size={13}
                                  color="#D97706"
                                />
                              )}
                              <Text
                                style={[
                                  styles.tdCell,
                                  { flex: 1, minWidth: 0, color: '#64748B', fontStyle: 'italic' },
                                ]}
                              >
                                {level === 'Direction'
                                  ? 'Comité requis'
                                  : level === 'Responsable'
                                    ? 'Justification requise'
                                    : '—'}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                  )}
                </View>
            </View>

            <View style={[styles.kpiRow, isMobile && { flexDirection: 'column' }]}>
              {[
                {
                  label: 'Total Heures hebdo',
                  value: `${totalBudgetH}h`,
                  color: C.green,
                  icon: 'clock-outline',
                },
                {
                  label: 'Total Heures Supplémentaires',
                  value: `${totalSupH}h`,
                  color: '#D97706',
                  icon: 'clock-alert-outline',
                },
                {
                  label: 'Taux HS',
                  value:
                    totalBudgetH > 0 ? `${Math.round((totalSupH / totalBudgetH) * 100)}%` : '0%',
                  color: '#2563EB',
                  icon: 'percent',
                },
              ].map((kpi) => (
                <View key={kpi.label} style={[styles.kpiCard, isMobile && { width: '100%' }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
                    <MaterialCommunityIcons name={kpi.icon as any} size={20} color={kpi.color} />
                  </View>
                  <View>
                    <Text style={styles.kpiValue}>{kpi.value}</Text>
                    <Text style={styles.kpiLabel}>{kpi.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── TAB: SAISIE HEURES ── */}
        {activeTab === 'saisie' &&
          (() => {
            // ── états locaux inline (évite de polluer le scope global) ──────────
            // On les déclare dans un IIFE pour garder le composant propre
            // NB : ils sont déjà déclarés plus haut via useState ; ici on les consomme


            // Filtre + recherche sur les employés visibles dans cet onglet
            const filteredEmp = personnel
              .filter((p) => {
                if (!p.actif) return false;
                if (saisieFilterSociete && p.societe_id !== saisieFilterSociete) return false;
                if (saisieFilterSection && p.section_id !== saisieFilterSection) return false;
                if (saisieSearch) {
                  const q = saisieSearch.toLowerCase();
                  return (
                    p.nom_complet.toLowerCase().includes(q) ||
                    String(p.matricule).toLowerCase().includes(q)
                  );
                }
                return true;
              })
              .filter((p) => getTotaux(p.id).total > 0)
              .sort((a, b) => {
                const aNum = parseInt(a.matricule, 10);
                const bNum = parseInt(b.matricule, 10);
                if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
                return a.matricule.localeCompare(b.matricule);
              });

            // Pagination pour la saisie
            const totalPagesSaisie = Math.ceil(filteredEmp.length / PERSONNEL_PAGE_SIZE);
            const paginatedEmp = filteredEmp.slice(
              saisiePageIndex * PERSONNEL_PAGE_SIZE,
              (saisiePageIndex + 1) * PERSONNEL_PAGE_SIZE,
            );

            // ── Export Excel identique au modèle (une ligne/employé, colonnes dates) ──
            const exportExcelHeures = () => {
              const fmtDate = (d: Date) =>
                `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
              const joursAbbr = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
              const colLetter = (n: number) => {
                let s = '';
                let x = n;
                while (x > 0) {
                  const r = (x - 1) % 26;
                  s = String.fromCharCode(65 + r) + s;
                  x = Math.floor((x - 1) / 26);
                }
                return s;
              };
              const nbDates = periodeDates.length;
              const firstDataCol = 4;
              const lastDataCol = firstDataCol + nbDates - 1;
              const dateHeader = periodeDates.map((d) => `${fmtDate(d)}\n${joursAbbr[d.getDay()]}`);
              const headerRow = [
                'Matricule',
                'Nom Complet',
                'Section',
                ...dateHeader,
                'Total Heures',
                'Heures Supp',
                'Note',
              ];
              const aoa: (string | number)[][] = [headerRow];

              filteredEmp.forEach((p) => {
                const pHeures = heuresMap[p.id] ?? {};
                const { total, supp } = getTotaux(p.id);
                const heuresCols = periodeDates.map(
                  (d) => pHeures[d.toISOString().slice(0, 10)] ?? 0,
                );
                const rowNum = aoa.length + 1;
                aoa.push([
                  String(p.matricule),
                  p.nom_complet,
                  p.section_nom ?? '',
                  ...heuresCols,
                  `=SUM(${colLetter(firstDataCol)}${rowNum}:${colLetter(lastDataCol)}${rowNum})`,
                  `=MAX(0,${colLetter(firstDataCol + nbDates)}${rowNum}-173.33)`,
                  '',
                ]);
                // Supprimer les formules si on veut juste les valeurs calculées
                aoa[aoa.length - 1][3 + nbDates] = Number(total.toFixed(1));
                aoa[aoa.length - 1][3 + nbDates + 1] = Number(supp.toFixed(1));
              });

              const ws = XLSX.utils.aoa_to_sheet(aoa);
              ws['!cols'] = [
                { wch: 11 },
                { wch: 30 },
                { wch: 16 },
                ...periodeDates.map(() => ({ wch: 10 })),
                { wch: 13 },
                { wch: 13 },
                { wch: 28 },
              ];
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Heures');
              const periodeStr = activePeriode.debut
                .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                .replace(/\s/g, '_');
              XLSX.writeFile(wb, `heures_${periodeStr}.xlsx`);
            };

            return (
              <View>
                {/* ── Header période + navigation ── */}
                <View style={styles.sectionHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sectionTitle}>Heures — {activePeriode.label}</Text>
                    <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                      {activePeriode.debut.toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })}{' '}
                      →{' '}
                      {activePeriode.fin.toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <TouchableOpacity
                      onPress={() => navPeriode(-1)}
                      style={{ padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' }}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={20} color="#374151" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setActivePeriode(getActivePeriode())}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 8,
                        backgroundColor: '#EFF6FF',
                      }}
                    >
                      <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>
                        Aujourd'hui
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => navPeriode(1)}
                      style={{ padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' }}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#374151" />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── KPIs ── */}


                {/* ── Tableau récap ── */}
                <View style={styles.card}>
                  {/* Toolbar : titre + export */}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={styles.cardTitle}>Détail par employé</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      {joursLoading && <ActivityIndicator size="small" color="#2563EB" />}
                      <TouchableOpacity
                        onPress={exportExcelHeures}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: '#D1FAE5',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <MaterialCommunityIcons name="microsoft-excel" size={15} color="#065F46" />
                        <Text style={{ fontSize: 12, color: '#065F46', fontWeight: '700' }}>
                          Exporter
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Filtre société (chips) */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    directionalLockEnabled
                    nestedScrollEnabled
                    style={{ marginBottom: 8 }}
                  >
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {[{ label: 'Toutes sociétés', value: '' }, ...societeOptions].map((opt) => (
                        <TouchableOpacity
                          key={opt.value || 'all'}
                          onPress={() => {
                            setSaisieFilterSociete(
                              saisieFilterSociete === opt.value ? '' : opt.value,
                            );
                            setSaisieFilterSection('');
                          }}
                          style={[
                            styles.filterChip,
                            saisieFilterSociete === opt.value && styles.filterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              saisieFilterSociete === opt.value && styles.filterChipTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  {/* Filtre section (chips) — dédoublonnage par nom */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {[
                      { label: 'Toutes sections', value: '' },
                      ...sections
                        .filter(
                          (s) => !saisieFilterSociete || s.societe_id === saisieFilterSociete,
                        )
                        .filter((s, idx, arr) => arr.findIndex((x) => x.nom === s.nom) === idx)
                        .map((s) => ({ label: s.nom, value: s.id })),
                    ].map((opt) => (
                      <TouchableOpacity
                        key={opt.value || 'all'}
                        onPress={() =>
                          setSaisieFilterSection(
                            saisieFilterSection === opt.value ? '' : opt.value,
                          )
                        }
                        style={[
                          styles.filterChip,
                          saisieFilterSection === opt.value && styles.filterChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterChipText,
                            saisieFilterSection === opt.value && styles.filterChipTextActive,
                          ]}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Barre de recherche */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: '#D1D5DB',
                      borderRadius: 8,
                      backgroundColor: '#F9FAFB',
                      paddingHorizontal: 10,
                      marginBottom: 10,
                    }}
                  >
                    <MaterialCommunityIcons name="magnify" size={16} color="#9CA3AF" />
                    <TextInput
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        paddingLeft: 6,
                        fontSize: 13,
                        color: '#111827',
                      }}
                      placeholder="Rechercher par nom ou matricule…"
                      placeholderTextColor="#9CA3AF"
                      value={saisieSearch}
                      onChangeText={setSaisieSearch}
                    />
                    {saisieSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setSaisieSearch('')}>
                        <MaterialCommunityIcons name="close-circle" size={16} color="#9CA3AF" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Compteur résultats */}
                  <Text style={{ fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
                    {saisiePageIndex * PERSONNEL_PAGE_SIZE + 1}–
                    {Math.min((saisiePageIndex + 1) * PERSONNEL_PAGE_SIZE, filteredEmp.length)} /{' '}
                    {filteredEmp.length} employé(s)
                    {saisieSearch ? ` — recherche "${saisieSearch}"` : ''}
                  </Text>

                  {/* Tableau — colonnes fixes (Matr/Nom/Section et Total/Supp/Actions) + dates scrollables au centre */}
                  <View style={{ width: '100%', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                    {/* ── En-tête ── */}
                    <View style={{ flexDirection: 'row', borderBottomWidth: 2, borderColor: '#E5E7EB', backgroundColor: '#F8FAFC' }}>
                      <View style={{ width: 60, paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 1, borderColor: '#E5E7EB' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#6B7280' }}>MATR.</Text>
                      </View>
                      <View style={{ width: 120, paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 1, borderColor: '#E5E7EB' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#6B7280' }}>NOM</Text>
                      </View>
                      <View style={{ width: 70, paddingVertical: 6, paddingHorizontal: 6, borderRightWidth: 1, borderColor: '#E5E7EB' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#6B7280' }}>SECTION</Text>
                      </View>
                      <ScrollView
                        ref={headerScrollRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={{ flex: 1 }}
                        scrollEventThrottle={16}
                        onScroll={(e) => syncScrollX(e.nativeEvent.contentOffset.x, 'header')}
                      >
                        <View style={{ flexDirection: 'row' }}>
                          {periodeDates.map((d) => {
                            const iso = d.toISOString().slice(0, 10);
                            const wd = d.getDay();
                            const isWE = wd === 0 || wd === 6;
                            return (
                              <View key={iso} style={{ width: 32, paddingVertical: 4, alignItems: 'center', backgroundColor: isWE ? '#F1F5F9' : undefined, borderRightWidth: 1, borderColor: '#F3F4F6' }}>
                                <Text style={{ fontSize: 8, fontWeight: '700', color: isWE ? '#9CA3AF' : '#374151' }}>{d.getDate()}/{d.getMonth() + 1}</Text>
                                <Text style={{ fontSize: 7, color: isWE ? '#CBD5E1' : '#9CA3AF' }}>{['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'][wd]}</Text>
                              </View>
                            );
                          })}
                        </View>
                      </ScrollView>
                      <View style={{ width: 52, paddingVertical: 6, paddingHorizontal: 4, borderLeftWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#1D4ED8' }}>TOTAL</Text>
                      </View>
                      <View style={{ width: 48, paddingVertical: 6, paddingHorizontal: 4, borderLeftWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '800', color: '#D97706' }}>SUPP</Text>
                      </View>
                      <View style={{ width: 64, paddingVertical: 6, paddingHorizontal: 4, borderLeftWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#6B7280' }}>ACTIONS</Text>
                      </View>
                    </View>

                    {/* ── Lignes employés ── */}
                    {paginatedEmp.length === 0 ? (
                      <View style={styles.emptyState}>
                        <MaterialCommunityIcons name="account-search-outline" size={36} color="#CBD5E1" />
                        <Text style={styles.emptyText}>Aucun employé trouvé.</Text>
                      </View>
                    ) : paginatedEmp.map((p, rowIndex) => {
                      const { total, supp } = getTotaux(p.id);
                      const pHeures = heuresMap[p.id] ?? {};
                      return (
                        <View key={p.id} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#F3F4F6', backgroundColor: supp > 0 ? '#FFFBEB' : '#FFFFFF', minHeight: 42, alignItems: 'center' }}>
                          {/* Colonnes fixes gauche */}
                          <View style={{ width: 60, paddingHorizontal: 6, borderRightWidth: 1, borderColor: '#F3F4F6', justifyContent: 'center', alignSelf: 'stretch', paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#111827' }}>{p.matricule}</Text>
                          </View>
                          <View style={{ width: 120, paddingHorizontal: 6, borderRightWidth: 1, borderColor: '#F3F4F6', justifyContent: 'center', alignSelf: 'stretch', paddingVertical: 4 }}>
                            <Text style={{ fontSize: 11, color: '#374151' }} numberOfLines={2} ellipsizeMode="tail">{p.nom_complet}</Text>
                          </View>
                          <View style={{ width: 70, paddingHorizontal: 6, borderRightWidth: 1, borderColor: '#F3F4F6', justifyContent: 'center', alignSelf: 'stretch', paddingVertical: 4 }}>
                            <Text style={{ fontSize: 10, color: '#6B7280' }} numberOfLines={1} ellipsizeMode="tail">{p.section_nom}</Text>
                          </View>
                          {/* Zone dates scrollable — scroll synchronisé avec header */}
                          <ScrollView
                            ref={(ref) => { rowScrollRefs.current[rowIndex] = ref; }}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={{ flex: 1, alignSelf: 'stretch' }}
                            nestedScrollEnabled
                            scrollEventThrottle={16}
                            onScroll={(e) => syncScrollX(e.nativeEvent.contentOffset.x, rowIndex)}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', height: 42 }}>
                              {periodeDates.map((d) => {
                                const iso = d.toISOString().slice(0, 10);
                                const h = pHeures[iso];
                                const wd = d.getDay();
                                const isWE = wd === 0 || wd === 6;
                                return (
                                  <TouchableOpacity
                                    key={iso}
                                    onPress={() => { setHeuresCrudModal({ visible: true, personnelId: p.id, personnelNom: p.nom_complet, dateISO: iso, heuresCourantes: h ?? 0, note: '' }); }}
                                    style={{ width: 32, height: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: isWE ? '#F1F5F9' : undefined, borderRightWidth: 1, borderColor: '#F3F4F6' }}
                                  >
                                    <Text style={{ fontSize: 9, textAlign: 'center', color: h !== undefined && h > 0 ? '#1D4ED8' : '#D1D5DB', fontWeight: h !== undefined && h > 0 ? '700' : '400' }}>
                                      {h !== undefined && h > 0 ? `${h}h` : '—'}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </ScrollView>
                          {/* Colonnes fixes droite */}
                          <View style={{ width: 52, paddingHorizontal: 4, borderLeftWidth: 1, borderColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8' }}>{total.toFixed(1)}h</Text>
                          </View>
                          <View style={{ width: 48, paddingHorizontal: 4, borderLeftWidth: 1, borderColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: supp > 0 ? '#D97706' : '#9CA3AF' }}>{supp > 0 ? `${supp.toFixed(1)}h` : '—'}</Text>
                          </View>
                          <View style={{ width: 64, paddingHorizontal: 4, borderLeftWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' }}>
                            <TouchableOpacity
                              onPress={() => { const today = new Date().toISOString().slice(0, 10); setHeuresCrudModal({ visible: true, personnelId: p.id, personnelNom: p.nom_complet, dateISO: today, heuresCourantes: pHeures[today] ?? 0, note: '' }); }}
                              style={{ backgroundColor: '#EFF6FF', borderRadius: 6, padding: 5 }}
                            >
                              <MaterialCommunityIcons name="pencil-outline" size={13} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                Alert.alert('Supprimer les heures', `Supprimer toutes les heures de ${p.nom_complet} pour la période ${activePeriode.label} ?`, [
                                  { text: 'Annuler', style: 'cancel' },
                                  { text: 'Supprimer', style: 'destructive', onPress: async () => {
                                    if (!supabase) return;
                                    await supabase.from('rh_heures_journalieres').delete().eq('personnel_id', p.id).gte('date_travail', activePeriode.debut.toISOString().slice(0, 10)).lte('date_travail', activePeriode.fin.toISOString().slice(0, 10));
                                    await loadJoursData();
                                    await queryClient.invalidateQueries({ queryKey: ['rh_budget_heures'] });
                                    await invalidateAll();
                                  }},
                                ]);
                              }}
                              style={{ backgroundColor: '#FEE2E2', borderRadius: 6, padding: 5 }}
                            >
                              <MaterialCommunityIcons name="trash-can-outline" size={13} color="#BE123C" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  {totalPagesSaisie > 1 && (
                    <View style={styles.paginationRow}>
                      <TouchableOpacity
                        style={[styles.pageBtn, saisiePageIndex === 0 && styles.pageBtnDisabled]}
                        onPress={() => setSaisiePageIndex((p) => Math.max(0, p - 1))}
                        disabled={saisiePageIndex === 0}
                      >
                        <MaterialCommunityIcons
                          name="chevron-left"
                          size={18}
                          color={saisiePageIndex === 0 ? '#CBD5E1' : '#374151'}
                        />
                      </TouchableOpacity>
                      <Text style={styles.pageInfo}>
                        {saisiePageIndex * PERSONNEL_PAGE_SIZE + 1}–
                        {Math.min((saisiePageIndex + 1) * PERSONNEL_PAGE_SIZE, filteredEmp.length)}{' '}
                        / {filteredEmp.length}
                      </Text>
                      {Array.from({ length: totalPagesSaisie }, (_, i) => i)
                        .filter((i) => Math.abs(i - saisiePageIndex) <= 2)
                        .map((i) => (
                          <TouchableOpacity
                            key={i}
                            style={[
                              styles.pageNumBtn,
                              i === saisiePageIndex && styles.pageNumBtnActive,
                            ]}
                            onPress={() => setSaisiePageIndex(i)}
                          >
                            <Text
                              style={[
                                styles.pageNumText,
                                i === saisiePageIndex && styles.pageNumTextActive,
                              ]}
                            >
                              {i + 1}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      <TouchableOpacity
                        style={[
                          styles.pageBtn,
                          saisiePageIndex >= totalPagesSaisie - 1 && styles.pageBtnDisabled,
                        ]}
                        onPress={() =>
                          setSaisiePageIndex((p) => Math.min(totalPagesSaisie - 1, p + 1))
                        }
                        disabled={saisiePageIndex >= totalPagesSaisie - 1}
                      >
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color={saisiePageIndex >= totalPagesSaisie - 1 ? '#CBD5E1' : '#374151'}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                {/* ── Import / Export fichier mensuel ── */}
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Fichier mensuel</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
                    Les données s'accumulent dans la base — les anciens mois sont préservés.
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4, fontStyle: 'italic' }}
                  >
                    Période active :{' '}
                    {activePeriode.debut.toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                    })}{' '}
                    →{' '}
                    {activePeriode.fin.toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: '#9CA3AF',
                      marginBottom: 12,
                      fontStyle: 'italic',
                    }}
                  >
                    Colonnes : Matricule | Nom Complet | Section | [dates période] | Total Heures |
                    Heures Supp | Note
                  </Text>

                  <View
                    style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}
                  >
                    <ActionButton
                      label="Modèle vierge"
                      icon="file-download-outline"
                      onPress={generateTemplateXlsx}
                    />
                    <ActionButton
                      label="Exporter données"
                      icon="microsoft-excel"
                      onPress={exportExcelHeures}
                    />
                    <ActionButton
                      label="Importer fichier"
                      icon="file-upload-outline"
                      onPress={handleImportHeuresJour}
                    />
                  </View>

                  {/* Aperçu import */}
                  {showHeuresJourPreview && heuresJourPreview.length > 0 && (
                    <View style={{ marginTop: 4 }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8,
                        }}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                          Aperçu — {heuresJourPreview.length} entrée(s)
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <Text style={{ fontSize: 12, color: '#059669' }}>
                            ✅ {heuresJourPreview.filter((r) => !r._error).length} valides
                          </Text>
                          {heuresJourPreview.filter((r) => r._error).length > 0 && (
                            <Text style={{ fontSize: 12, color: '#DC2626' }}>
                              ❌ {heuresJourPreview.filter((r) => r._error).length} erreurs
                            </Text>
                          )}
                        </View>
                      </View>

                      {heuresImportDiagnostics && (
                        <View
                          style={{
                            backgroundColor: '#F8FAF8',
                            padding: 10,
                            borderRadius: 8,
                            marginBottom: 8,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', marginBottom: 6 }}>
                            Diagnostic d'import
                          </Text>
                          <Text style={{ fontSize: 12 }}>
                            En-têtes:{' '}
                            {heuresImportDiagnostics.headerRow
                              ? heuresImportDiagnostics.headerRow.join(' | ')
                              : '—'}
                          </Text>
                          <Text style={{ fontSize: 12, marginTop: 4 }}>
                            Dates détectées:{' '}
                            {heuresImportDiagnostics.dateCols &&
                            heuresImportDiagnostics.dateCols.length
                              ? heuresImportDiagnostics.dateCols
                                  .map((d: any) => d.dateISO)
                                  .join(', ')
                              : 'Aucune'}
                          </Text>
                          <Text style={{ fontSize: 12, marginTop: 4 }}>
                            Index matricule: {heuresImportDiagnostics.idxMatricule ?? 'non trouvé'}
                          </Text>
                          {heuresImportDiagnostics.missingMatricules &&
                            heuresImportDiagnostics.missingMatricules.length > 0 && (
                              <Text style={{ fontSize: 12, marginTop: 6, color: '#DC2626' }}>
                                Matricules non trouvés:{' '}
                                {heuresImportDiagnostics.missingMatricules.slice(0, 10).join(', ')}
                                {heuresImportDiagnostics.missingMatricules.length > 10
                                  ? ` (+${heuresImportDiagnostics.missingMatricules.length - 10})`
                                  : ''}
                              </Text>
                            )}
                        </View>
                      )}

                      <View style={{ width: "100%" }}>
                        <View style={[styles.table, { width: '100%' }]}>
                          <View style={[styles.tableRow, styles.tableHead]}>
                            {['Matr.', 'Nom Complet', 'Section', 'Date', 'Heures', 'Note'].map(
                              (h) => (
                                <Text
                                  key={h}
                                  style={[
                                    styles.thCell,
                                    {
                                      minWidth:
                                        h === 'Nom Complet'
                                          ? 150
                                          : h === 'Section'
                                            ? 110
                                            : h === 'Note'
                                              ? 120
                                              : 80,
                                    },
                                  ]}
                                >
                                  {h}
                                </Text>
                              ),
                            )}
                          </View>
                          {heuresJourPreview.slice(0, 8).map((row) => (
                            <View
                              key={row.id}
                              style={[
                                styles.tableRow,
                                row._error ? { backgroundColor: '#FEF2F2' } : {},
                              ]}
                            >
                              <Text style={[styles.tdCell, { minWidth: 80 }]}>{row.matricule}</Text>
                              <Text style={[styles.tdCell, { minWidth: 150, fontSize: 12 }]}>
                                {row._error ? `⚠ ${row._error}` : row.nom_complet}
                              </Text>
                              <Text style={[styles.tdCell, { minWidth: 110, fontSize: 12 }]}>
                                {row.section}
                              </Text>
                              <Text style={[styles.tdCell, { minWidth: 80 }]}>
                                {row.date_travail}
                              </Text>
                              <Text
                                style={[
                                  styles.tdCell,
                                  {
                                    minWidth: 80,
                                    textAlign: 'center',
                                    color: row.heures > 0 ? '#1D4ED8' : '#9CA3AF',
                                    fontWeight: '700',
                                  },
                                ]}
                              >
                                {row.heures > 0 ? row.heures + 'h' : '—'}
                              </Text>
                              <Text
                                style={[
                                  styles.tdCell,
                                  { minWidth: 120, fontSize: 11, color: '#6B7280' },
                                ]}
                              >
                                {row.note || '—'}
                              </Text>
                            </View>
                          ))}
                          {heuresJourPreview.length > 8 && (
                            <View style={styles.tableRow}>
                              <Text style={[styles.tdCell, { color: '#6B7280', fontSize: 12 }]}>
                                …et {heuresJourPreview.length - 8} entrée(s) de plus
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <ActionButton
                          label={
                            heuresImporting
                              ? 'Importation...'
                              : `Confirmer (${heuresJourPreview.filter((r) => !r._error).length})`
                          }
                          icon="check-circle-outline"
                          onPress={confirmImportHeuresJour}
                        />
                        <ActionButton
                          label="Annuler"
                          icon="close-circle-outline"
                          onPress={() => {
                            setHeuresJourPreview([]);
                            setShowHeuresJourPreview(false);
                          }}
                        />
                      </View>
                    </View>
                  )}

                  {heuresImportDone && (
                    <View
                      style={{
                        marginTop: 10,
                        padding: 12,
                        borderRadius: 8,
                        backgroundColor: heuresImportDone.errors.length > 0 ? '#FFFBEB' : '#D1FAE5',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '700',
                          color: heuresImportDone.errors.length > 0 ? '#92400E' : '#065F46',
                        }}
                      >
                        {heuresImportDone.ok} entrée(s)
                        {heuresImportDone.errors.length > 0
                          ? ` — ${heuresImportDone.errors.length} erreur(s)`
                          : ' ✅ synchronisé(s)'}
                      </Text>
                      {heuresImportDone.errors.map((e, i) => (
                        <Text key={i} style={{ fontSize: 11, color: '#DC2626', marginTop: 2 }}>
                          • {e.matricule} : {e.msg}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>

                {/* ── Modal CRUD saisie d'une journée ── */}
                <Modal visible={heuresCrudModal.visible} transparent animationType="fade">
                  <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxWidth: 380 }]}>
                      <View style={styles.modalHeader}>
                        <View>
                          <Text style={styles.modalTitle}>Saisie journée</Text>
                          <Text style={{ fontSize: 12, color: '#6B7280' }}>
                            {heuresCrudModal.personnelNom}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {heuresCrudModal.dateISO}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setHeuresCrudModal((s) => ({ ...s, visible: false }))}
                        >
                          <MaterialCommunityIcons name="close" size={22} color="#475569" />
                        </TouchableOpacity>
                      </View>
                      <View style={{ padding: 16 }}>
                        <FormInput
                          label="Heures travaillées"
                          placeholder="ex: 8"
                          value={String(heuresCrudModal.heuresCourantes)}
                          onChangeText={(v) =>
                            setHeuresCrudModal((s) => ({
                              ...s,
                              heuresCourantes: Math.max(0, Number(v.replace(/[^0-9.]/g, '')) || 0),
                            }))
                          }
                          keyboardType="numeric"
                        />
                        <FormInput
                          label="Note (optionnel)"
                          placeholder="ex: Congé, absence…"
                          value={heuresCrudModal.note}
                          onChangeText={(v) => setHeuresCrudModal((s) => ({ ...s, note: v }))}
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                          <ActionButton
                            label="Enregistrer"
                            icon="content-save-outline"
                            onPress={async () => {
                              if (!supabase || !heuresCrudModal.personnelId) return;
                              const { error } = await supabase
                                .from('rh_heures_journalieres')
                                .upsert(
                                  {
                                    personnel_id: heuresCrudModal.personnelId,
                                    date_travail: heuresCrudModal.dateISO,
                                    heures: heuresCrudModal.heuresCourantes,
                                    note: heuresCrudModal.note || null,
                                    saisi_par: profile?.id,
                                  },
                                  { onConflict: 'personnel_id,date_travail' },
                                );
                              if (error) {
                                setAlert(error.message);
                                return;
                              }
                              setHeuresCrudModal((s) => ({ ...s, visible: false }));
                              await loadJoursData();
                              await queryClient.invalidateQueries({
                                queryKey: ['rh_budget_heures'],
                              });
                              await invalidateAll();
                            }}
                          />
                          {heuresCrudModal.heuresCourantes > 0 && (
                            <ActionButton
                              label="Supprimer"
                              icon="trash-can-outline"
                              onPress={() =>
                                Alert.alert('Supprimer', 'Supprimer cette entrée ?', [
                                  { text: 'Annuler', style: 'cancel' },
                                  {
                                    text: 'Supprimer',
                                    style: 'destructive',
                                    onPress: async () => {
                                      if (!supabase || !heuresCrudModal.personnelId) return;
                                      await supabase
                                        .from('rh_heures_journalieres')
                                        .delete()
                                        .eq('personnel_id', heuresCrudModal.personnelId)
                                        .eq('date_travail', heuresCrudModal.dateISO);
                                      setHeuresCrudModal((s) => ({ ...s, visible: false }));
                                      await loadJoursData();
                                      await queryClient.invalidateQueries({
                                        queryKey: ['rh_budget_heures'],
                                      });
                                      await invalidateAll();
                                    },
                                  },
                                ])
                              }
                            />
                          )}
                        </View>
                      </View>
                    </View>
                  </View>
                </Modal>
              </View>
            );
          })()}

        {/* ── TAB: BUDGET ── */}
        {activeTab === 'budget' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Budget Heures par Section</Text>
            </View>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
                <View>
                  <Text style={styles.cardTitle}>Récapitulatif Heures par Section</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                    Données calculées automatiquement depuis les pointages.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', marginRight: 8, color: '#374151' }}>{activePeriode.label}</Text>
                  <TouchableOpacity onPress={() => navPeriode(-1)} style={{ padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' }}>
                    <MaterialCommunityIcons name="chevron-left" size={20} color="#374151" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setActivePeriode(getActivePeriode())} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#EFF6FF' }}>
                    <Text style={{ fontSize: 12, color: '#2563EB', fontWeight: '600' }}>Aujourd'hui</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => navPeriode(1)} style={{ padding: 8, borderRadius: 8, backgroundColor: '#F3F4F6' }}>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12, alignItems: 'center', backgroundColor: '#F9FAFB', padding: 10, borderRadius: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Personnalisé :</Text>
                <View style={{ width: 130 }}>
                  <FormInput
                    label="Du (YYYY-MM-DD)"
                    value={activePeriode.debut.toISOString().slice(0, 10)}
                    onChangeText={(t) => {
                      if (t.length === 10) {
                        const d = new Date(t);
                        if (!isNaN(d.getTime())) setActivePeriode(p => ({ ...p, debut: d, label: 'Période personnalisée' }));
                      }
                    }}
                  />
                </View>
                <View style={{ width: 130 }}>
                  <FormInput
                    label="Au (YYYY-MM-DD)"
                    value={activePeriode.fin.toISOString().slice(0, 10)}
                    onChangeText={(t) => {
                      if (t.length === 10) {
                        const d = new Date(t);
                        if (!isNaN(d.getTime())) setActivePeriode(p => ({ ...p, fin: d, label: 'Période personnalisée' }));
                      }
                    }}
                  />
                </View>
              </View>

              <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                <View style={[styles.table, { width: '100%' }]}>
                  <View style={[styles.tableRow, styles.tableHead]}>
                    <Text style={[styles.thCell, { flex: 2, minWidth: 160 }]}>Section</Text>
                    <Text style={[styles.thCell, { flex: 1, minWidth: 80 }]}>Effectif</Text>
                    <Text style={[styles.thCell, { flex: 1.5, minWidth: 120 }]}>Heures Normales</Text>
                    <Text style={[styles.thCell, { flex: 1.5, minWidth: 130 }]}>Heures Supplémentaires</Text>
                    <Text style={[styles.thCell, { flex: 1, minWidth: 100 }]}>Total</Text>
                    <Text style={[styles.thCell, { flex: 1, minWidth: 80 }]}>Taux HS</Text>
                  </View>
                  {joursLoading ? (
                    <View style={{ padding: 20, alignItems: 'center' }}><Text>Chargement...</Text></View>
                  ) : heuresParSection.length === 0 ? (
                    <View style={styles.tableRow}>
                      <Text style={[styles.tdCell, { color: '#6B7280', fontStyle: 'italic', flex: 1 }]}>
                        Aucune heure saisie pour cette période. Allez dans l'onglet "Heures" pour saisir ou importer des heures.
                      </Text>
                    </View>
                  ) : (
                    <>
                      {heuresParSection.map((sec) => {
                        const total = sec.totalNormales + sec.totalSupp;
                        const taux = total > 0 ? Math.round((sec.totalSupp / total) * 100) : 0;
                        return (
                          <View key={sec.sectionId} style={styles.tableRow}>
                            <Text style={[styles.tdCell, { flex: 2, minWidth: 160, fontWeight: '700' }]}>{sec.nomSection}</Text>
                            <Text style={[styles.tdCell, { flex: 1, minWidth: 80 }]}>{sec.nbPersonnes}</Text>
                            <Text style={[styles.tdCell, { flex: 1.5, minWidth: 120, color: '#15803D' }]}>{sec.totalNormales.toFixed(1)} Heures</Text>
                            <Text style={[styles.tdCell, { flex: 1.5, minWidth: 120, color: sec.totalSupp > 0 ? '#D97706' : '#6B7280', fontWeight: sec.totalSupp > 0 ? '700' : '400' }]}>{sec.totalSupp.toFixed(1)} Heures</Text>
                            <Text style={[styles.tdCell, { flex: 1, minWidth: 100, fontWeight: '700' }]}>{total.toFixed(1)} Heures</Text>
                            <Text style={[styles.tdCell, { flex: 1, minWidth: 80, color: taux > 20 ? '#BE123C' : taux > 10 ? '#D97706' : '#15803D' }]}>{taux}%</Text>
                          </View>
                        );
                      })}
                      <View style={[styles.tableRow, { backgroundColor: '#F0F9FF' }]}>
                        <Text style={[styles.tdCell, { flex: 2, minWidth: 160, fontWeight: '700', color: '#1E40AF' }]}>TOTAL</Text>
                        <Text style={[styles.tdCell, { flex: 1, minWidth: 80, fontWeight: '700', color: '#1E40AF' }]}>{heuresParSection.reduce((a, s) => a + s.nbPersonnes, 0)}</Text>
                        <Text style={[styles.tdCell, { flex: 1.5, minWidth: 120, fontWeight: '700', color: '#15803D' }]}>{heuresParSection.reduce((a, s) => a + s.totalNormales, 0).toFixed(1)} Heures</Text>
                        <Text style={[styles.tdCell, { flex: 1.5, minWidth: 120, fontWeight: '700', color: '#D97706' }]}>{heuresParSection.reduce((a, s) => a + s.totalSupp, 0).toFixed(1)} Heures</Text>
                        <Text style={[styles.tdCell, { flex: 1, minWidth: 100, fontWeight: '700', color: '#1E40AF' }]}>{heuresParSection.reduce((a, s) => a + s.totalNormales + s.totalSupp, 0).toFixed(1)} Heures</Text>
                        <Text style={[styles.tdCell, { flex: 1, minWidth: 80 }]}></Text>
                      </View>
                    </>
                  )}
                </View>
              </ScrollView>
            </View>

            {!isReadOnly && !isRprod && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Planifier un budget</Text>
                <FormSelect
                  label="Section"
                  options={sectionOptions}
                  value={budgetSection ?? ''}
                  onSelect={setBudgetSection}
                />
                <FormInput
                  label="Heures budgétisées"
                  placeholder="0"
                  value={String(budgetHeures)}
                  onChangeText={(t) => setBudgetHeures(Number(t.replace(/[^0-9]/g, '') || 0))}
                  keyboardType="numeric"
                />
                <FormInput
                  label="Période (ex: S22/2026)"
                  placeholder={getCurrentWeekLabel()}
                  value={budgetPeriode ?? ''}
                  onChangeText={setBudgetPeriode}
                />
                <View style={{ marginTop: 8 }}>
                  <ActionButton
                    label="Enregistrer"
                    icon="content-save-outline"
                    onPress={async () => {
                      if (!budgetSection || !budgetHeures) {
                        setAlert('Sélectionnez une section et saisissez les heures.');
                        return;
                      }
                      if (!supabase) return;
                      try {
                        const { error } = await supabase.from('rh_budget_heures').insert({
                          section_id: budgetSection,
                          periode: budgetPeriode || getCurrentWeekLabel(),
                          heures_budget: budgetHeures,
                          created_by: profile?.id,
                        });
                        if (error) throw error;
                        setBudgetSection('');
                        setBudgetHeures(0);
                        setBudgetPeriode('');
                      } catch (err: unknown) {
                        setAlert(translatePgError(err) || "Erreur lors de l'enregistrement.");
                      }
                      await loadPlannedBudgets(); // Refresh après création
                    }}
                  />
                </View>
              </View>
            )}

            {/* NOUVEAU TABLEAU: BUDGETS PLANIFIÉS */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Budgets Planifiés (Actifs)</Text>
              <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
                <View style={[styles.table, { width: '100%' }]}>
                  <View style={[styles.tableRow, styles.tableHead]}>
                    <Text style={[styles.thCell, { flex: 1, minWidth: 140 }]}>Période</Text>
                    <Text style={[styles.thCell, { flex: 1.5, minWidth: 140 }]}>Section</Text>
                    <Text style={[styles.thCell, { flex: 1, minWidth: 100 }]}>Heures</Text>
                    <Text style={[styles.thCell, { flex: 1.5, minWidth: 120 }]}>Modifié par</Text>
                    {!isReadOnly && !isRprod && (
                      <Text style={[styles.thCell, { flex: 1, minWidth: 100, textAlign: 'center' }]}>Actions</Text>
                    )}
                  </View>
                  {plannedBudgets.map((b) => (
                    <View key={b.id} style={styles.tableRow}>
                      <Text style={[styles.tdCell, { flex: 1, minWidth: 140, fontWeight: '600' }]}>{b.period}</Text>
                      <Text style={[styles.tdCell, { flex: 1.5, minWidth: 140 }]}>{sections.find(s => s.id === b.section)?.nom || '—'}</Text>
                      <Text style={[styles.tdCell, { flex: 1, minWidth: 100, color: '#2563EB', fontWeight: '700' }]}>{b.montant_total}h</Text>
                      <Text style={[styles.tdCell, { flex: 1.5, minWidth: 120, fontSize: 11 }]}>{b.last_modified_by_name || b.created_by_name || '—'} {b.edit_count > 0 && `(édité ${b.edit_count}x)`}</Text>
                      {!isReadOnly && !isRprod && (
                        <View style={[styles.tdCell, { flex: 1, minWidth: 100, flexDirection: 'row', gap: 12, justifyContent: 'center' }]}>
                          <TouchableOpacity onPress={() => setEditBudgetModal({visible: true, budget: b, newHeures: b.montant_total})}>
                            <MaterialCommunityIcons name="pencil-outline" size={20} color="#0EA5E9" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => {
                            Alert.alert('Supprimer Budget', `Supprimer le budget de ${b.montant_total}h pour la période ${b.period} ?`, [
                              { text: 'Annuler', style: 'cancel' },
                              { text: 'Supprimer', style: 'destructive', onPress: async () => {
                                if (!supabase) return;
                                const { error } = await supabase.rpc('soft_delete_rh_budget', { p_budget_id: b.id });
                                if (error) { setAlert("Erreur de suppression: " + error.message); }
                                else { loadPlannedBudgets(); }
                              }}
                            ])
                          }}>
                            <MaterialCommunityIcons name="trash-can-outline" size={20} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                  {plannedBudgets.length === 0 && (
                    <View style={styles.tableRow}>
                      <Text style={[styles.tdCell, { color: '#6B7280', fontStyle: 'italic' }]}>Aucun budget planifié.</Text>
                    </View>
                  )}
                </View>
              </ScrollView>
            </View>

            {/* MODAL MODIFICATION BUDGET */}
            <Modal visible={editBudgetModal.visible} transparent animationType="fade">
              <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { maxWidth: 350 }]}>
                  <Text style={styles.modalTitle}>Modifier le budget</Text>
                  <Text style={{fontSize: 12, color: '#6B7280', marginBottom: 16}}>
                    Période {editBudgetModal.budget?.period}
                  </Text>
                  <FormInput
                    label="Nouvelles Heures"
                    value={String(editBudgetModal.newHeures)}
                    onChangeText={(t) => setEditBudgetModal(s => ({...s, newHeures: Number(t.replace(/[^0-9]/g, '') || 0)}))}
                    keyboardType="numeric"
                  />
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <ActionButton
                      label="Sauvegarder"
                      icon="check"
                      onPress={async () => {
                        if (!supabase || !editBudgetModal.budget) return;
                        const { error } = await supabase.from('rh_budget_heures').update({ heures_budget: editBudgetModal.newHeures }).eq('id', editBudgetModal.budget.id);
                        if (error) { setAlert(error.message); }
                        else { 
                          setEditBudgetModal({visible: false, budget: null, newHeures: 0});
                          loadPlannedBudgets();
                        }
                      }}
                    />
                    <ActionButton
                      label="Annuler"
                      icon="close"
                      variant="secondary"
                      onPress={() => setEditBudgetModal({visible: false, budget: null, newHeures: 0})}
                    />
                  </View>
                </View>
              </View>
            </Modal>

            <View style={[styles.kpiRow, isMobile && { flexDirection: 'column' }]}>
              {[
                {
                  label: 'Heures normales total',
                  value: `${totalBudgetH - totalSupH}h`,
                  color: C.green,
                  icon: 'clock-outline',
                },
                {
                  label: 'Heures Supplémentaires (total)',
                  value: `${totalSupH}h`,
                  color: '#D97706',
                  icon: 'clock-alert-outline',
                },
                {
                  label: 'Heures total payées',
                  value: `${totalBudgetH}h`,
                  color: '#2563EB',
                  icon: 'currency-usd',
                },
              ].map((kpi) => (
                <View key={kpi.label} style={[styles.kpiCard, isMobile && { width: '100%' }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
                    <MaterialCommunityIcons name={kpi.icon as any} size={20} color={kpi.color} />
                  </View>
                  <View>
                    <Text style={styles.kpiValue}>{kpi.value}</Text>
                    <Text style={styles.kpiLabel}>{kpi.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── TAB: CONGÉS ── */}
        {activeTab === 'conges' &&
          (() => {
            const congesValides = conges.filter((c) => c.statut === 'VALIDE');
            const validesCount  = congesValides.length;
            const refusesCount  = conges.filter((c) => ['REFUSE','REFUSE_RH','REFUSE_DPI'].includes(c.statut)).length;
            const annulesCount  = conges.filter((c) => c.statut === 'ANNULE').length;
            const nomOf = (c: RhConge) =>
              c.personnel ? `${c.personnel.nom} ${c.personnel.prenoms}`.trim() : '—';

            // Calendrier navigable
            const today = new Date();
            const year  = calNav.year;
            const month = calNav.month;
            const firstDay    = new Date(year, month, 1);
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const leadOffset  = (firstDay.getDay() + 6) % 7;
            const monthLabel  = firstDay.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
            const dayAbsences: Record<number, RhConge[]> = {};
            congesValides.forEach((c) => {
              const d1 = new Date(c.date_debut);
              const d2 = new Date(c.date_fin);
              for (let d = 1; d <= daysInMonth; d++) {
                const cur = new Date(year, month, d);
                if (cur >= new Date(d1.getFullYear(), d1.getMonth(), d1.getDate()) &&
                    cur <= new Date(d2.getFullYear(), d2.getMonth(), d2.getDate())) {
                  (dayAbsences[d] ||= []).push(c);
                }
              }
            });
            const calendarCells: (number | null)[] = [
              ...Array(leadOffset).fill(null),
              ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
            ];

            // Timeline visuelle de workflow pour une demande
            const WorkflowTimeline = ({ statut }: { statut: string }) => {
              const steps = [
                { key: 'depot',    label: 'Dépôt',    icon: 'send-outline' },
                { key: 'rh',       label: 'RH',       icon: 'account-check-outline' },
                { key: 'dpi',      label: 'DPI',       icon: 'check-decagram-outline' },
              ];
              const stepIndex = { EN_ATTENTE: 1, VALIDE_RH: 2, VALIDE: 3, REFUSE_RH: 1, REFUSE_DPI: 2, ANNULE: 0, REFUSE: 1 }[statut] ?? 0;
              const isFailed  = ['REFUSE_RH','REFUSE_DPI','REFUSE','ANNULE'].includes(statut);
              const failAt    = { REFUSE_RH: 1, REFUSE_DPI: 2, REFUSE: 1, ANNULE: 0 }[statut] ?? -1;
              return (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 2 }}>
                  {steps.map((step, idx) => {
                    const done    = stepIndex > idx && !(isFailed && failAt === idx);
                    const active  = stepIndex === idx + 1 && !isFailed;
                    const failed  = isFailed && failAt === idx;
                    const dotColor = failed ? '#DC2626' : done ? '#16A34A' : active ? '#2563EB' : '#D1D5DB';
                    return (
                      <React.Fragment key={step.key}>
                        <View style={{ alignItems: 'center', gap: 3 }}>
                          <View style={{
                            width: 28, height: 28, borderRadius: 14,
                            backgroundColor: failed ? '#FEE2E2' : done ? '#DCFCE7' : active ? '#DBEAFE' : '#F3F4F6',
                            borderWidth: 2, borderColor: dotColor,
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <MaterialCommunityIcons
                              name={failed ? 'close' : done ? 'check' : step.icon as any}
                              size={13} color={dotColor}
                            />
                          </View>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: dotColor }}>{step.label}</Text>
                        </View>
                        {idx < steps.length - 1 && (
                          <View style={{ flex: 1, height: 2, marginHorizontal: 4, marginBottom: 14,
                            backgroundColor: done ? '#16A34A' : '#E5E7EB' }} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </View>
              );
            };

            return (
              <View>


                {/* Liste des demandes */}
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Demandes ({conges.length})</Text>
                  <ActionButton label="Nouvelle demande" icon="plus" onPress={openCongeModal} />
                </View>

                {conges.length === 0 ? (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="beach" size={40} color="#CBD5E1" />
                    <Text style={styles.emptyText}>Aucune demande de congé enregistrée.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {conges.map((c) => {
                      const meta = CONGE_STATUT_META[c.statut] ?? CONGE_STATUT_META.EN_ATTENTE;
                      const isOwner = c.demande_par === profile?.id;
                      const canCancel = isOwner && ['EN_ATTENTE','VALIDE_RH'].includes(c.statut);
                      const canValidateCongeRh  = ['RH', 'ADMIN', 'SUPER_ADMIN'].includes(role ?? '');
                      const canValidateCongeDpi = ['DPI', 'ADMIN', 'SUPER_ADMIN'].includes(role ?? '');
                      const canValidateConge    = canValidateCongeRh || canValidateCongeDpi;
                      const canCancelAdmin = canValidateConge && ['EN_ATTENTE','VALIDE_RH'].includes(c.statut);
                      const showCancelBtn = canCancel || canCancelAdmin;
                      // Commentaire de refus (ancien champ ou nouveau)
                      const commentRefus = (c as any).commentaire_rh || (c as any).commentaire_dpi || (c as any).commentaire;
                      return (
                        <View key={c.id} style={{
                          backgroundColor: '#FFF', borderRadius: 14, padding: 16,
                          borderWidth: 1, borderColor: '#EEF2F7',
                          ...(Platform.OS === 'web' ? { boxShadow: '0 1px 8px rgba(0,0,0,0.04)' } : { elevation: 1 }),
                        }}>
                          {/* En-tête : nom + badge statut */}
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                            <View style={{ flex: 1, minWidth: 180 }}>
                              <Text style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>{nomOf(c)}</Text>
                              <Text style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                                {CONGE_TYPE_LABEL[c.type_conge] || c.type_conge} · {c.date_debut} → {c.date_fin} · {c.nb_jours} j
                              </Text>
                              {!!c.motif && <Text style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>Motif : {c.motif}</Text>}
                              {!!commentRefus && (
                                <Text style={{ fontSize: 12, color: '#B91C1C', marginTop: 3 }}>
                                  Motif refus : {commentRefus}
                                </Text>
                              )}
                            </View>
                            <View style={[styles.badge, { backgroundColor: meta.bg, borderColor: meta.color + '44' }]}>
                              <MaterialCommunityIcons name={meta.icon as any} size={11} color={meta.color} />
                              <Text style={[styles.badgeText, { color: meta.color }]}>{meta.shortLabel}</Text>
                            </View>
                          </View>

                          {/* Timeline workflow */}
                          <WorkflowTimeline statut={c.statut} />

                          {/* Boutons d'action selon le statut et le rôle */}
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            {/* Niveau 1 : RH valide ou refuse */}
                            {canValidateCongeRh && c.statut === 'EN_ATTENTE' && (
                              <>
                                <ActionButton label="Valider (RH)" icon="check-circle-outline"
                                  onPress={() => validateCongeRh(c)} />
                                <ActionButton label="Refuser" icon="close-circle-outline" variant="secondary"
                                  onPress={() => { setCongeReject({ id: c.id, level: 'RH' }); setCongeRejectComment(''); }} />
                              </>
                            )}
                            {/* Niveau 2 : DPI valide définitivement ou refuse */}
                            {canValidateCongeDpi && c.statut === 'VALIDE_RH' && (
                              <>
                                <ActionButton label="Valider (DPI)" icon="check-decagram-outline"
                                  onPress={() => validateCongeDpi(c)} />
                                <ActionButton label="Refuser" icon="close-circle-outline" variant="secondary"
                                  onPress={() => { setCongeReject({ id: c.id, level: 'DPI' }); setCongeRejectComment(''); }} />
                              </>
                            )}
                            {/* Annulation */}
                            {showCancelBtn && (
                              <ActionButton label="Annuler" icon="cancel" variant="secondary"
                                onPress={() => cancelConge(c)} />
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Soldes */}
                <View style={[styles.sectionHeader, { marginTop: 24 }]}>
                  <Text style={styles.sectionTitle}>Soldes de congés {year}</Text>
                </View>

                {/* ── Filtres Soldes : société / section / recherche ── */}
                {(() => {
                  const allSocietes = [...new Set(congeSoldes.map((s) => s.societe_code).filter(Boolean))].sort();
                  const allSections = [...new Set(
                    congeSoldes
                      .filter((s) => !soldesSociete || s.societe_code === soldesSociete)
                      .map((s) => s.section_nom)
                      .filter(Boolean)
                  )].sort();

                  const filtered = congeSoldes.filter((s) => {
                    if (soldesSociete && s.societe_code !== soldesSociete) return false;
                    if (soldesSection && s.section_nom !== soldesSection) return false;
                    if (soldesSearch && !s.nom_complet.toLowerCase().includes(soldesSearch.toLowerCase())) return false;
                    return true;
                  });

                  const totalSoldesPages = Math.ceil(filtered.length / SOLDES_PAGE_SIZE);
                  const pageSoldes = filtered.slice(soldesPage * SOLDES_PAGE_SIZE, (soldesPage + 1) * SOLDES_PAGE_SIZE);

                  return (
                    <>
                      {/* Société chips */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled nestedScrollEnabled style={{ marginBottom: 8 }}>
                        <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 2 }}>
                          {['', ...allSocietes].map((soc) => {
                            const active = soldesSociete === soc;
                            return (
                              <TouchableOpacity
                                key={soc || '__all_soc__'}
                                style={[styles.filterChip, active && styles.filterChipActive]}
                                onPress={() => { setSoldesSociete(soc ?? ''); setSoldesSection(''); setSoldesPage(0); }}
                              >
                                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                  {soc || 'Toutes sociétés'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>

                      {/* Section chips */}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} directionalLockEnabled nestedScrollEnabled style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', gap: 6, paddingBottom: 2 }}>
                          {['', ...allSections].map((sec) => {
                            const active = soldesSection === sec;
                            return (
                              <TouchableOpacity
                                key={sec || '__all_sec__'}
                                style={[styles.filterChip, active && styles.filterChipActive]}
                                onPress={() => { setSoldesSection(sec ?? ''); setSoldesPage(0); }}
                              >
                                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                                  {sec || 'Toutes sections'}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>

                      {/* Search */}
                      <TextInput
                        value={soldesSearch}
                        onChangeText={(v) => { setSoldesSearch(v); setSoldesPage(0); }}
                        placeholder="Rechercher un employé..."
                        style={{ backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#0F172A', marginBottom: 10 }}
                      />

                      {filtered.length === 0 ? (
                        <View style={styles.emptyState}>
                          <MaterialCommunityIcons name="scale-balance" size={40} color="#CBD5E1" />
                          <Text style={styles.emptyText}>Aucun solde disponible.</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#EEF2F7', overflow: 'hidden' }}>
                          {/* En-tête tableau soldes */}
                          <View style={{ flexDirection: 'row', backgroundColor: '#F8FAFC', paddingVertical: 8, paddingHorizontal: 12 }}>
                            {[{ label: 'EMPLOYÉ', flex: 3 }, { label: 'ACQUIS', flex: 1 }, { label: 'PRIS', flex: 1 }, { label: 'ATT.', flex: 1 }, { label: 'SOLDE', flex: 1 }].map((h) => (
                              <Text key={h.label} style={{ flex: h.flex, fontSize: 10, fontWeight: '800', color: '#64748B', textAlign: h.flex === 3 ? 'left' : 'right' }}>{h.label}</Text>
                            ))}
                          </View>

                          {pageSoldes.map((sld) => (
                            <View key={sld.personnel_id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                              <Text style={{ flex: 3, fontSize: 13, color: '#0F172A' }} numberOfLines={1}>{sld.nom_complet}</Text>
                              {/* Acquis éditable */}
                              {editAcquisId === sld.personnel_id ? (
                                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}>
                                  <TextInput
                                    value={editAcquisVal}
                                    onChangeText={setEditAcquisVal}
                                    keyboardType="numeric"
                                    style={{ width: 44, borderWidth: 1, borderColor: '#2563EB', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, fontSize: 13, textAlign: 'center', color: '#0F172A' }}
                                    autoFocus
                                  />
                                  <TouchableOpacity onPress={async () => {
                                    if (!supabase) return;
                                    const val = parseFloat(editAcquisVal);
                                    if (isNaN(val)) { setEditAcquisId(null); return; }
                                    // Upsert sur rh_conges_soldes_overrides (table réelle, migration 068)
                                    const { error: upsertErr } = await supabase
                                      .from('rh_conges_soldes_overrides')
                                      .upsert(
                                        { personnel_id: sld.personnel_id, annee: year, jours_acquis: val, droit_annuel: val },
                                        { onConflict: 'personnel_id,annee' }
                                      );
                                    if (upsertErr) {
                                      Alert.alert('Erreur', `Impossible de sauvegarder : ${upsertErr.message}`);
                                      setEditAcquisId(null);
                                      return;
                                    }
                                    queryClient.invalidateQueries({ queryKey: ['rh_conges_soldes'] });
                                    setEditAcquisId(null);
                                  }}>
                                    <MaterialCommunityIcons name="check-circle" size={18} color="#16A34A" />
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => setEditAcquisId(null)}>
                                    <MaterialCommunityIcons name="close-circle" size={18} color="#DC2626" />
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={{ flex: 1, alignItems: 'flex-end' }}
                                  onPress={() => { setEditAcquisId(sld.personnel_id); setEditAcquisVal(String(sld.jours_acquis ?? sld.droit_annuel)); }}
                                >
                                  <Text style={{ fontSize: 13, color: '#2563EB', textDecorationLine: 'underline' }}>{sld.jours_acquis ?? sld.droit_annuel}</Text>
                                </TouchableOpacity>
                              )}
                              <Text style={{ flex: 1, fontSize: 13, color: '#475569', textAlign: 'right' }}>{sld.jours_pris}</Text>
                              <Text style={{ flex: 1, fontSize: 12, color: '#D97706', textAlign: 'right' }}>{sld.jours_en_attente > 0 ? `(${sld.jours_en_attente})` : '—'}</Text>
                              <Text style={{ flex: 1, fontSize: 13, fontWeight: '800', color: sld.solde <= 0 ? '#DC2626' : '#16A34A', textAlign: 'right' }}>{sld.solde}</Text>
                            </View>
                          ))}

                          {pageSoldes.length === 0 && (
                            <Text style={{ fontSize: 12, color: '#94A3B8', padding: 14, textAlign: 'center' }}>Aucun résultat.</Text>
                          )}
                        </View>
                      )}

                      {/* Pagination */}
                      {totalSoldesPages > 1 && (
                        <View style={styles.paginationRow}>
                          <TouchableOpacity
                            style={[styles.pageBtn, soldesPage === 0 && styles.pageBtnDisabled]}
                            onPress={() => setSoldesPage((p) => Math.max(0, p - 1))}
                            disabled={soldesPage === 0}
                          >
                            <MaterialCommunityIcons name="chevron-left" size={16} color="#374151" />
                          </TouchableOpacity>
                          {Array.from({ length: totalSoldesPages }, (_, i) => (
                            <TouchableOpacity
                              key={i}
                              style={[styles.pageNumBtn, i === soldesPage && styles.pageNumBtnActive]}
                              onPress={() => setSoldesPage(i)}
                            >
                              <Text style={[styles.pageNumText, i === soldesPage && styles.pageNumTextActive]}>{i + 1}</Text>
                            </TouchableOpacity>
                          ))}
                          <TouchableOpacity
                            style={[styles.pageBtn, soldesPage === totalSoldesPages - 1 && styles.pageBtnDisabled]}
                            onPress={() => setSoldesPage((p) => Math.min(totalSoldesPages - 1, p + 1))}
                            disabled={soldesPage === totalSoldesPages - 1}
                          >
                            <MaterialCommunityIcons name="chevron-right" size={16} color="#374151" />
                          </TouchableOpacity>
                          <Text style={styles.pageInfo}>
                            {soldesPage * SOLDES_PAGE_SIZE + 1}–{Math.min((soldesPage + 1) * SOLDES_PAGE_SIZE, filtered.length)} / {filtered.length}
                          </Text>
                        </View>
                      )}
                    </>
                  );
                })()}

                {/* Calendrier des absences */}
                <View style={[styles.sectionHeader, { marginTop: 24 }]}>
                  <Text style={styles.sectionTitle}>Calendrier des absences</Text>
                </View>
                <View style={{ backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#EEF2F7', padding: 10 }}>
                  {/* Navigation mois */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 4 }}>
                    <TouchableOpacity
                      onPress={() => setCalNav(prev => {
                        const d = new Date(prev.year, prev.month - 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      })}
                      style={{ padding: 8, borderRadius: 8, backgroundColor: '#F1F5F9' }}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={20} color="#475569" />
                    </TouchableOpacity>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A', textTransform: 'capitalize' }}>{monthLabel}</Text>
                      {!isCurrentMonth && (
                        <TouchableOpacity onPress={() => { const n = new Date(); setCalNav({ year: n.getFullYear(), month: n.getMonth() }); }}>
                          <Text style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>Aujourd'hui</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => setCalNav(prev => {
                        const d = new Date(prev.year, prev.month + 1, 1);
                        return { year: d.getFullYear(), month: d.getMonth() };
                      })}
                      style={{ padding: 8, borderRadius: 8, backgroundColor: '#F1F5F9' }}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#475569" />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row' }}>
                    {['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map((d) => (
                      <Text key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '800', color: '#94A3B8', paddingVertical: 4 }}>{d}</Text>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {calendarCells.map((day, idx) => {
                      const abs = day != null ? dayAbsences[day] : undefined;
                      const isToday = isCurrentMonth && day === today.getDate();
                      return (
                        <View key={idx} style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
                          {day != null && (
                            <View style={{
                              flex: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
                              backgroundColor: abs && abs.length > 0 ? '#FEF3C7' : '#F8FAFC',
                              borderWidth: isToday ? 2 : 0, borderColor: '#2563EB',
                            }}>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{day}</Text>
                              {abs && abs.length > 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 1 }}>
                                  <MaterialCommunityIcons name="account" size={9} color="#B45309" />
                                  <Text style={{ fontSize: 9, fontWeight: '800', color: '#B45309' }}>{abs.length}</Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
                <View style={{ height: 24 }} />
              </View>
            );
          })()}

        {/* ── TAB: HISTORIQUE ── */}
        {activeTab === 'historique' && (
          <View>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Historique des imports ({batches.length})</Text>
            </View>
            {batches.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="history" size={40} color="#CBD5E1" />
                <Text style={styles.emptyText}>Aucun import enregistré.</Text>
              </View>
            ) : (
              <View style={styles.card}>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHead]}>
                    <Text style={[styles.thCell, { minWidth: 220 }]}>Batch ID</Text>
                    <Text style={[styles.thCell, { minWidth: 120 }]}>Semaine</Text>
                    <Text style={[styles.thCell, { minWidth: 100 }]}>Lignes</Text>
                  </View>
                  {batches.map((b) => (
                    <View key={b.import_batch_id} style={styles.tableRow}>
                      <Text
                        style={[
                          styles.tdCell,
                          {
                            minWidth: 220,
                            fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
                            fontSize: 11,
                          },
                        ]}
                      >
                        {b.import_batch_id}
                      </Text>
                      <Text style={[styles.tdCell, { minWidth: 120 }]}>{b.semaine_label}</Text>
                      <Text
                        style={[
                          styles.tdCell,
                          { minWidth: 100, fontWeight: '700', color: C.green },
                        ]}
                      >
                        {b.count}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Modal CRUD : Créer / Modifier personnel ── */}
      <Modal visible={crudModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {crudEditId ? 'Modifier le personnel' : 'Nouveau personnel'}
              </Text>
              <TouchableOpacity onPress={() => { setCrudModalVisible(false); setCrudEditId(null); }}>
                <MaterialCommunityIcons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {/* Société */}
              <FormSelect
                label="Société *"
                value={crudForm.societe_id ?? ''}
                options={crudSocietes.map((s) => ({ label: `${s.code} – ${s.nom}`, value: s.id }))}
                onSelect={onCrudSocieteChange}
              />
              {/* Statut */}
              <FormSelect
                label="Statut *"
                value={crudForm.type_contrat ?? ''}
                options={[
                  { label: 'PERMANANT', value: 'FIXE' },
                  { label: 'TEMPORAIRE', value: 'TEMPORAIRE' },
                ]}
                onSelect={(v: string) => setCrudForm(prev => ({ ...prev, type_contrat: v }))}
              />
              {/* Matricule */}
              <FormInput
                label="Matricule *"
                placeholder="ex: 1024"
                value={crudForm.matricule ?? ''}
                onChangeText={v => setCrudForm(prev => ({ ...prev, matricule: v }))}
                keyboardType="numeric"
              />
              {/* Nom */}
              <FormInput
                label="Nom *"
                placeholder="ex: ANDRIANANTENAIN"
                value={crudForm.nom ?? ''}
                onChangeText={(v) => setCrudForm((prev) => ({ ...prev, nom: v.toUpperCase() }))}
              />
              {/* Prénom(s) */}
              <FormInput
                label="Prénom(s) *"
                placeholder="ex: Tsikivy Rina"
                value={crudForm.prenoms ?? ''}
                onChangeText={(v) => setCrudForm((prev) => ({ ...prev, prenoms: v }))}
              />
              {/* Date embauche */}
              <FormInput
                label="Date d'embauche"
                placeholder="YYYY-MM-DD"
                value={crudForm.date_embauche ?? ''}
                onChangeText={(v) => setCrudForm((prev) => ({ ...prev, date_embauche: v }))}
              />
              {/* Section */}
              <FormSelect
                label="Section *"
                value={crudForm.section_id ?? ''}
                options={filteredSections.map((s) => ({
                  label: `${s.code} – ${s.nom}`,
                  value: s.id,
                }))}
                onSelect={(v: string) => setCrudForm((prev) => ({ ...prev, section_id: v }))}
              />
              {filteredSections.length === 0 && crudForm.societe_id === '' && (
                <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>
                  Sélectionnez d'abord une Société pour voir les Sections.
                </Text>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <ActionButton
                label="Annuler"
                variant="secondary"
                onPress={() => {
                  setCrudModalVisible(false);
                  setCrudEditId(null);
                }}
              />
              <ActionButton
                label={crudEditId ? 'Enregistrer' : 'Créer'}
                icon={crudEditId ? 'content-save-outline' : 'account-plus'}
                onPress={handleCrudSave}
              />
            </View>
            {crudIsSaving && (
              <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center' } as any}>
                <ActivityIndicator size="large" color={C.green} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Ajouter employé ── */}
      <Modal visible={manualModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ajouter un employé</Text>
              <TouchableOpacity onPress={() => setManualModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <FormInput
                label="Société *"
                placeholder="GSI"
                value={manualForm.company || ''}
                onChangeText={(t) => setManualForm((p) => ({ ...p, company: t }))}
              />
              <FormInput
                label="Section *"
                placeholder="Production"
                value={manualForm.section || ''}
                onChangeText={(t) => setManualForm((p) => ({ ...p, section: t }))}
              />
              <FormInput
                label="Matricule *"
                placeholder="12345"
                value={manualForm.matricule || ''}
                onChangeText={(t) => setManualForm((p) => ({ ...p, matricule: t }))}
              />
              <FormInput
                label="Nom complet *"
                placeholder="Jean Dupont"
                value={manualForm.full_name || ''}
                onChangeText={(t) => setManualForm((p) => ({ ...p, full_name: t }))}
              />
              <FormInput
                label="Date d'embauche"
                placeholder="JJ/MM/AAAA"
                value={manualForm.hire_date || ''}
                onChangeText={(t) => setManualForm((p) => ({ ...p, hire_date: t }))}
              />
              <FormSelect
                label="Type de contrat"
                options={CONTRACT_OPTIONS}
                value={manualForm.contract_type || 'Fixe'}
                onSelect={(v: string) => setManualForm((p) => ({ ...p, contract_type: v }))}
              />
              <FormInput
                label="Heures hebdo"
                placeholder="40"
                value={String(manualForm.weekly_hours ?? 40)}
                onChangeText={(t) =>
                  setManualForm((p) => ({
                    ...p,
                    weekly_hours: Number(t.replace(/[^0-9]/g, '') || 0),
                  }))
                }
                keyboardType="numeric"
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <ActionButton
                label="Annuler"
                variant="secondary"
                onPress={() => setManualModalVisible(false)}
              />
              <ActionButton label="Ajouter" icon="account-plus" onPress={addManualPersonnel} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: Rejeter demande ── */}
      <Modal visible={!!rejectModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: 320 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Motif de rejet</Text>
              <TouchableOpacity onPress={() => setRejectModal(null)}>
                <MaterialCommunityIcons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  borderRadius: 10,
                  padding: 12,
                  minHeight: 80,
                  textAlignVertical: 'top',
                  fontSize: 14,
                  color: '#0F172A',
                }}
                placeholder="Précisez le motif du rejet..."
                value={rejectComment ?? ''}
                onChangeText={setRejectComment}
                multiline
              />
            </View>
            <View style={styles.modalActions}>
              <ActionButton label="Annuler" variant="secondary" onPress={() => setRejectModal(null)} />
              <ActionButton label="Confirmer le rejet" icon="close-circle-outline" onPress={rejectDemande} />
            </View>
          </View>
        </View>
      </Modal>
    </AnimatedPage>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Styles boutons action inline tableau
const s_act = StyleSheet.create({
  btn: {
    width: 28, height: 28, borderRadius: 6,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
});

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.bg, padding: 20 },
  headerCard:       { marginBottom: 18, backgroundColor: '#FFF', borderRadius: 16, padding: 20, flexDirection: 'row', gap: 18, alignItems: 'center', ...Platform.select({ web: { boxShadow: '0 1px 12px rgba(0,0,0,0.06)' }, default: { elevation: 2 } }) },
  iconCard:         { width: 52, height: 52, borderRadius: 16, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  screenTitle:      { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  screenSubtitle:   { marginTop: 4, fontSize: 13, color: '#475569', lineHeight: 19 },
  readOnlyBanner:   { marginBottom: 12, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#FCD34D' },
  readOnlyText:     { color: '#92400E', fontSize: 13, fontWeight: '600', flex: 1 },
  scopeBanner:      { marginBottom: 12, padding: 12, backgroundColor: '#EFF6FF', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  scopeText:        { color: '#1E40AF', fontSize: 13, flex: 1 },
  alertBox:         { marginBottom: 10, padding: 12, backgroundColor: '#FEE2E2', borderRadius: 10, flexDirection: 'row', gap: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FCA5A5' },
  alertText:        { color: '#991B1B', fontSize: 13, flex: 1 },
  kpiRow:           { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  kpiCard:          { flex: 1, minWidth: 150, backgroundColor: '#FFF', borderRadius: 16, padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center', ...Platform.select({ web: { boxShadow: '0 1px 12px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }) },
  kpiIcon:          { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  kpiValue:         { fontSize: 24, fontWeight: '800', color: '#111827' },
  kpiLabel:         { fontSize: 12, color: '#64748B', marginTop: 2 },
  tabBar:           { marginBottom: 16 },
  tab:              { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E7EB' },
  tabActive:        { backgroundColor: C.green, borderColor: C.green },
  tabText:          { fontSize: 13, fontWeight: '600', color: '#64748B' },
  tabTextActive:    { color: '#FFF' },
  tabBadge:         { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#BE123C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  tabBadgeText:     { fontSize: 11, fontWeight: '800', color: '#FFF' },
  sectionHeader:    { marginTop: 4, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  sectionTitle:     { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  filterSelect:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 8 },
  filterSelectText: { flex: 1, fontSize: 13, color: '#334155' },
  filterChip:       { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.green, borderColor: C.green },
  filterChipText:   { fontSize: 12, fontWeight: '600', color: '#475569' },
  filterChipTextActive: { color: '#FFF' },
  searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, ...Platform.select({ web: { boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }, default: {} }) },
  searchInput:      { flex: 1, fontSize: 14, color: '#0F172A', outlineStyle: 'none' } as any,
  card:             { marginBottom: 18, backgroundColor: '#FFF', borderRadius: 16, padding: 18, ...Platform.select({ web: { boxShadow: '0 1px 12px rgba(0,0,0,0.05)' }, default: { elevation: 2 } }) },
  cardTitle:        { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  table:            { borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', minWidth: 600 },
  tableWrap:        { borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', width: '100%' },
  tableRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderColor: '#F1F5F9' },
  tableRowFull:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: 1, borderColor: '#F1F5F9' },
  tableRowAlt:      { backgroundColor: '#FAFBFC' },
  tableHead:        { backgroundColor: '#F8FAFC', borderTopWidth: 0 },
  colMatricule:     { width: '10%', minWidth: 80 },
  colNom:           { width: '23%', minWidth: 150 },
  colSection:       { width: '16%', minWidth: 110 },
  colSociete:       { width: '11%', minWidth: 80 },
  colHeure:         { width: '8%',  minWidth: 60 },
  colStatut:        { width: '16%', minWidth: 120 },
  tdCellV:          { flexDirection: 'row', alignItems: 'center' },
  paginationRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 16, flexWrap: 'wrap' },
  pageBtn:          { width: 32, height: 32, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pageBtnDisabled:  { opacity: 0.4 },
  pageInfo:         { fontSize: 12, color: '#64748B', paddingHorizontal: 8 },
  pageNumBtn:       { minWidth: 32, height: 32, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  pageNumBtnActive: { backgroundColor: C.green, borderColor: C.green },
  pageNumText:      { fontSize: 12, fontWeight: '600', color: '#374151' },
  pageNumTextActive:{ color: '#FFF' },
  thCell:           { flex: 1, minWidth: 90, fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4 },
  tdCell:           { flex: 1, minWidth: 90, fontSize: 12, color: '#334155' },
  emptyState:       { padding: 30, alignItems: 'center', gap: 10 },
  emptyText:        { fontSize: 13, color: '#64748B', textAlign: 'center' },
  badge:            { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, borderWidth: 1 },
  badgeText:        { fontSize: 11, fontWeight: '700' },
  requestCard:      { marginBottom: 12, padding: 16, backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: C.border, ...Platform.select({ web: { boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }, default: { elevation: 1 } }) },
  requestTitle:     { fontSize: 14, fontWeight: '700', color: '#111827' },
  requestMeta:      { fontSize: 12, color: '#64748B', marginTop: 2 },
  requestLine:      { fontSize: 12, color: '#475569', marginTop: 4 },
  subLabel:         { marginTop: 16, marginBottom: 8, fontSize: 12, fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 },
  selectionList:    { borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden', marginBottom: 12 },
  selectionItem:    { padding: 14, backgroundColor: '#FFF', flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  selectionItemActive: { backgroundColor: '#ECFDF5' },
  selectionName:    { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  selectionMeta:    { fontSize: 12, color: '#64748B', marginTop: 3 },
  hintText:         { fontSize: 13, color: '#94A3B8', padding: 14 },
  mobileCard:       { marginBottom: 10, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', ...Platform.select({ web: { boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }, default: { elevation: 1 } }) },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent:     { width: '100%', maxWidth: 680, maxHeight: '90%', backgroundColor: '#FFF', borderRadius: 20, overflow: 'hidden' },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: C.border },
  modalTitle:       { fontSize: 18, fontWeight: '800', color: '#0F172A' },
  modalBody:        { padding: 20 },
  modalActions:     { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, padding: 20, borderTopWidth: 1, borderColor: C.border },
});
