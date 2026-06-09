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
  RhPersonnelView, RhSection, RhSociete,
} from '../lib/hooks';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ─── Types locaux ─────────────────────────────────────────────────────────────

type Personnel = {
  id: string; company: string; section: string; matricule: string;
  full_name: string; hire_date: string; contract_type: string;
  weekly_hours: number; overtime_hours: number;
  overtime_level: 'Normale' | 'Responsable' | 'Direction';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTRACT_OPTIONS = [
  { label: 'Fixe', value: 'Fixe' },
  { label: 'Temporaire', value: 'Temporaire' },
  { label: 'Autre', value: 'Autre' },
];

const normalizeKey = (k: string) =>
  k.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, '').toLowerCase();

const resolveField = (row: Record<string, unknown>, choices: string[]) => {
  const n: Record<string, unknown> = {};
  Object.keys(row).forEach((key) => { n[normalizeKey(key)] = (row as Record<string, unknown>)[key]; });
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
  const weekly_hours = Number(get(['HeuresSemaine','Heures S1','HeuresHebdo','Heures Hebdo','H.HEBDO','Hours','WeeklyHours']) || 0);
  const overtime_hours = Math.max(0, weekly_hours - 40);
  const overtime_level: Personnel['overtime_level'] =
    overtime_hours <= 0 ? 'Normale' : overtime_hours <= 10 ? 'Normale' :
    overtime_hours <= 20 ? 'Responsable' : 'Direction';
  return {
    id: `${Date.now()}-${index}`,
    company:       get(['Societe','Société','Company','Entreprise','SOCIETE']) || 'NON RENSEIGNE',
    section:       get(['Section','Departement','Service','SECTION']) || 'NON RENSEIGNE',
    matricule:     get(['Matricule','MATRICULE','ID','Reference']) || `EMP-${index + 1}`,
    full_name:     get(['Nom','NOM','NomPrenoms','Nom et Prenoms','NomPrenom','FullName','Full Name']) || 'Sans nom',
    hire_date:     parseExcelDate(get(['DateEmbauche','Date Embauche','EMBAUCHE','HireDate','DateDeRecrutement'])),
    contract_type: get(['Type','TYPE','TypeContrat','Type de contrat','Contrat']) || 'Fixe',
    weekly_hours, overtime_hours, overtime_level,
  };
};

const normalizeCode = (v: string) =>
  v.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toUpperCase();

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
  if (tmp.getUTCDay() !== 4) tmp.setUTCMonth(0, 1 + ((4 - tmp.getUTCDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - tmp.valueOf()) / 604800000);
};

const getCurrentWeekLabel = () => { const d = new Date(); return `S${getIsoWeek(d)}/${d.getFullYear()}`; };
const parseKontractType = (v: string) => {
  const s = String(v || '').toLowerCase().trim();
  if (s.includes('temp') || s === 'temporaire') return 'TEMPORAIRE';
  return 'FIXE';
};

const STATUT_CONFIG: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  EN_ATTENTE: { label: 'En attente', bg: '#FEF3C7', text: '#92400E', icon: 'clock-outline' },
  APPROUVE:   { label: 'Approuvé',   bg: '#D1FAE5', text: '#065F46', icon: 'check-circle-outline' },
  REJETE:     { label: 'Rejeté',     bg: '#FEE2E2', text: '#991B1B', icon: 'close-circle-outline' },
  TERMINE:    { label: 'Terminé',    bg: '#E0E7FF', text: '#3730A3', icon: 'flag-checkered' },
};

const OT_CONFIG: Record<string, { label: string; color: string }> = {
  Normale:     { label: 'Normale',           color: '#15803D' },
  Responsable: { label: 'Resp. — justif.',   color: '#D97706' },
  Direction:   { label: 'Dir. — comité',     color: '#BE123C' },
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

type Tab = 'personnels' | 'affectations' | 'heures_sup' | 'budget' | 'historique';

export function RhScreen() {
  const { profile } = useUserProfile();
  const { width } = useWindowDimensions();
  const isMobile = width < 900;
  const queryClient = useQueryClient();
  const notifMutation = useNotification();

  const role       = profile?.role;
  const isReadOnly = role === 'DPI';
  const isRprod    = role === 'RPROD';
  const userScope  = profile?.scope || null;

  const [activeTab, setActiveTab] = React.useState<Tab>('personnels');

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
    company: '', section: '', matricule: '', full_name: '', hire_date: '', contract_type: 'Fixe', weekly_hours: 40,
  });

  // Reject modal
  const [rejectModal,   setRejectModal]   = React.useState<{ id: string } | null>(null);
  const [rejectComment, setRejectComment] = React.useState('');

  // ── CRUD Personnel modal ───────────────────────────────────────────────────
  const [crudModalVisible, setCrudModalVisible] = React.useState(false);
  const [crudEditId,       setCrudEditId]       = React.useState<string | null>(null);
  const [crudIsSaving,     setCrudIsSaving]     = React.useState(false);
  const [crudForm, setCrudForm] = React.useState<{
    matricule: string; nom: string; prenoms: string;
    societe_id: string; section_id: string;
    date_embauche: string; type_contrat: string;
  }>({ matricule: '', nom: '', prenoms: '', societe_id: '', section_id: '', date_embauche: '', type_contrat: 'FIXE' });
  const [crudSocietes,  setCrudSocietes]  = React.useState<RhSociete[]>([]);
  const [crudSections,  setCrudSections]  = React.useState<RhSection[]>([]);
  const [filteredSections, setFilteredSections] = React.useState<RhSection[]>([]);

  // Pagination
  const [personnelPage, setPersonnelPage] = React.useState(0);
  const PERSONNEL_PAGE_SIZE = 30;

  // Affectation form
  const [assignFrom,  setAssignFrom]  = React.useState('');
  const [assignTo,    setAssignTo]    = React.useState('');
  const [assignDate,  setAssignDate]  = React.useState('');
  const [assignHours, setAssignHours] = React.useState<number>(8);
  const [assignNote,  setAssignNote]  = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  // Budget form
  const [budgetSection, setBudgetSection] = React.useState('');
  const [budgetHeures,  setBudgetHeures]  = React.useState<number>(0);
  const [budgetPeriode, setBudgetPeriode] = React.useState('');

  // ── Hooks ─────────────────────────────────────────────────────────────────

  const { data: personnel  = [] }                      = useRhPersonnel();
  const { data: sections   = [] }                      = useRhSections();
  const { data: demandes   = [], refetch: refetchDemandes } = useRhAffectations();
  const { data: batches    = [] }                      = useRhImportBatches();

  // ── Filters ───────────────────────────────────────────────────────────────

  const mySection = React.useMemo(() => {
    if (!isRprod || !userScope) return null;
    return sections.find(
      (s) => s.code === userScope || s.nom === userScope ||
             normalizeCode(s.nom) === normalizeCode(userScope)
    ) || null;
  }, [isRprod, userScope, sections]);

  const visiblePersonnel = React.useMemo(() => {
    let base = (!isRprod || !mySection)
      ? personnel
      : personnel.filter((p) => p.section_id === mySection.id);
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

  React.useEffect(() => { setPersonnelPage(0); }, [searchQuery, filterSociete, filterSection, filterContrat]);

  const totalPages     = Math.ceil(visiblePersonnel.length / PERSONNEL_PAGE_SIZE);
  const pagedPersonnel = visiblePersonnel.slice(personnelPage * PERSONNEL_PAGE_SIZE, (personnelPage + 1) * PERSONNEL_PAGE_SIZE);

  const visibleDemandes = React.useMemo(() => {
    if (!isRprod || !mySection) return demandes;
    return demandes.filter(
      (d) => d.section_demandeur === mySection.id || d.section_fournisseur === mySection.id
    );
  }, [isRprod, mySection, demandes]);

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const totalPersonnel  = visiblePersonnel.length;
  const overtimeCount   = visiblePersonnel.filter((p) => p.heures_supp_derniere_semaine > 0).length;
  const respOTCount     = visiblePersonnel.filter((p) => p.heures_supp_derniere_semaine > 10 && p.heures_supp_derniere_semaine <= 20).length;
  const dirOTCount      = visiblePersonnel.filter((p) => p.heures_supp_derniere_semaine > 20).length;
  const pendingDemandes = demandes.filter((d) => d.statut === 'EN_ATTENTE').length;
  const totalBudgetH    = visiblePersonnel.reduce((acc, p) => acc + (p.heures_derniere_semaine || 0), 0);
  const totalSupH       = visiblePersonnel.reduce((acc, p) => acc + (p.heures_supp_derniere_semaine || 0), 0);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const sectionOptions = sections.map((s) => ({ label: s.nom, value: s.id }));
  const sectionById    = Object.fromEntries(sections.map((s) => [s.id, s]));

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
    supabase.from('rh_societes').select('id, code, nom, active').eq('active', true)
      .then(({ data }) => { if (data) setCrudSocietes(data as RhSociete[]); });
    supabase.from('rh_sections').select('id, societe_id, code, nom, active').eq('active', true)
      .then(({ data }) => { if (data) setCrudSections(data as RhSection[]); });
  }, []);

  // ── ensureSociete / ensureSection  ────────────────────────────────────────
  // Utilise SELECT + INSERT séparé pour éviter le 409 Conflict du upsert
  // (Supabase upsert exige un index UNIQUE côté DB + header Prefer:resolution=merge-duplicates)

  const ensureSociete = async (
    companyName: string,
    cache: Map<string, RhSociete>
  ): Promise<RhSociete> => {
    if (!supabase) throw new Error('Supabase not configured');
    const code = normalizeCode(companyName || 'NON RENSEIGNE');
    if (cache.has(code)) return cache.get(code)!;
    // 1. Chercher existant
    const { data: existing } = await supabase
      .from('rh_societes').select('*').eq('code', code).maybeSingle();
    if (existing) { cache.set(code, existing as RhSociete); return existing as RhSociete; }
    // 2. Insérer — si race condition, re-chercher
    const { data: created, error } = await supabase
      .from('rh_societes').insert({ code, nom: companyName }).select().single();
    if (error) {
      // code 23505 = unique_violation : la ligne a été créée entre le select et l'insert
      if (error.code === '23505') {
        const { data: retry } = await supabase.from('rh_societes').select('*').eq('code', code).maybeSingle();
        if (retry) { cache.set(code, retry as RhSociete); return retry as RhSociete; }
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
    matricule: string; nom: string; prenoms: string;
    societe_id: string; section_id: string;
    date_embauche: string; type_contrat: string; actif: boolean;
  }): Promise<string | null> => {
    if (!supabase) return null;
    const { data: existing } = await supabase
      .from('rh_personnels').select('id').eq('matricule', row.matricule).maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('rh_personnels').update({
          nom: row.nom, prenoms: row.prenoms,
          societe_id: row.societe_id, section_id: row.section_id,
          date_embauche: row.date_embauche, type_contrat: row.type_contrat, actif: row.actif,
        }).eq('id', (existing as any).id);
      if (error) throw error;
      return (existing as any).id;
    }
    const { data: created, error } = await supabase
      .from('rh_personnels').insert(row).select('id').single();
    if (error) throw error;
    return (created as any).id;
  };

  // ── safeUpsertHeures ──────────────────────────────────────────────────────

  const safeUpsertHeures = async (row: {
    personnel_id: string; semaine_label: string; annee: number; semaine_num: number;
    heures_totales: number; import_batch_id: string;
  }) => {
    if (!supabase) return;
    const { data: existing } = await supabase
      .from('rh_heures_hebdo').select('id')
      .eq('personnel_id', row.personnel_id)
      .eq('semaine_label', row.semaine_label)
      .maybeSingle();
    if (existing) {
      const { error } = await supabase
        .from('rh_heures_hebdo').update({ heures_totales: row.heures_totales, import_batch_id: row.import_batch_id })
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
    const batchId   = `IMPORT-${Date.now()}`;
    const weekLabel = getCurrentWeekLabel();
    const year      = new Date().getFullYear();
    const weekNum   = getIsoWeek(new Date());
    const errors: { matricule: string; msg: string }[] = [];

    const societeCache = new Map<string, RhSociete>();
    const sectionCache = new Map<string, RhSection>();

    // Pré-charger sociétés/sections distinctes (réduit les allers-retours)
    const distinctCompanies = [...new Set(items.map((i) => normalizeCode(i.company || 'NON RENSEIGNE')))];
    for (const item of items) {
      const cKey = normalizeCode(item.company || 'NON RENSEIGNE');
      if (!societeCache.has(cKey)) {
        try { await ensureSociete(item.company || 'NON RENSEIGNE', societeCache); }
        catch { /* ignoré, sera capturé item par item */ }
      }
    }
    for (const item of items) {
      const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
      if (!societe) continue;
      const sKey = `${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`;
      if (!sectionCache.has(sKey)) {
        try { await ensureSection(item.section || 'NON RENSEIGNE', societe.id, sectionCache); }
        catch { /* ignoré */ }
      }
    }

    // Traiter ligne par ligne avec progression
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
        if (!societe) throw new Error(`Société introuvable : ${item.company}`);
        const section = sectionCache.get(`${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`);
        if (!section) throw new Error(`Section introuvable : ${item.section}`);

        const { nom, prenoms } = splitFullName(item.full_name);
        const pid = await safeUpsertPersonnel({
          matricule: item.matricule, nom, prenoms,
          societe_id: societe.id, section_id: section.id,
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
    } catch (_) { /* non bloquant */ }
  };

  // ── Export Excel ──────────────────────────────────────────────────────────

  const exportExcel = () => {
    const rows = visiblePersonnel.map((p) => ({
      Matricule:        p.matricule,
      Nom:              p.nom_complet,
      Section:          p.section_nom,
      Société:          p.societe_nom,
      'Type contrat':   p.type_contrat,
      'Date embauche':  p.date_embauche,
      'H. hebdo':       p.heures_derniere_semaine,
      'H. supp':        p.heures_supp_derniere_semaine,
      Statut:           p.actif ? 'Actif' : 'Inactif',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Personnel');
    XLSX.writeFile(wb, `Personnel_${getCurrentWeekLabel()}.xlsx`);
  };

  // ── CRUD: Ouvrir modal création ───────────────────────────────────────────
  const openCrudCreate = () => {
    setCrudEditId(null);
    setCrudForm({ matricule: '', nom: '', prenoms: '', societe_id: '', section_id: '', date_embauche: new Date().toISOString().slice(0, 10), type_contrat: 'FIXE' });
    setFilteredSections([]);
    setCrudModalVisible(true);
  };

  // ── CRUD: Ouvrir modal édition ────────────────────────────────────────────
  const openCrudEdit = (p: RhPersonnelView) => {
    setCrudEditId(p.id);
    setCrudForm({
      matricule: p.matricule, nom: p.nom, prenoms: p.prenoms,
      societe_id: p.societe_id, section_id: p.section_id,
      date_embauche: p.date_embauche, type_contrat: p.type_contrat,
    });
    setFilteredSections(crudSections.filter(s => s.societe_id === p.societe_id));
    setCrudModalVisible(true);
  };

  // ── CRUD: Changer société → filtrer sections ──────────────────────────────
  const onCrudSocieteChange = (societeId: string) => {
    setCrudForm(prev => ({ ...prev, societe_id: societeId, section_id: '' }));
    setFilteredSections(crudSections.filter(s => s.societe_id === societeId));
  };

  // ── CRUD: Sauvegarder ─────────────────────────────────────────────────────
  const handleCrudSave = async () => {
    if (!supabase) return;
    if (!crudForm.matricule.trim() || !crudForm.nom.trim() || !crudForm.prenoms.trim() || !crudForm.societe_id || !crudForm.section_id) {
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
        const { data: existing } = await supabase.from('rh_personnels').select('id').eq('matricule', values.matricule).maybeSingle();
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
        { text: 'Supprimer', style: 'destructive', onPress: async () => {
          const { error } = await supabase!.from('rh_personnels').delete().eq('id', p.id);
          if (error) setAlert(translatePgError(error) || error.message);
          else await invalidateAll();
        }},
      ]
    );
  };

  // ── CRUD: Activer / Désactiver ────────────────────────────────────────────
  const handleToggleActif = (p: RhPersonnelView) => {
    if (!supabase) return;
    const newActif = !p.actif;
    const label = newActif ? 'Activer' : 'Désactiver';
    Alert.alert(`${label} le personnel`, `${label} ${p.nom_complet} ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: label, onPress: async () => {
        const { error } = await supabase!.from('rh_personnels').update({ actif: newActif }).eq('id', p.id);
        if (error) setAlert(translatePgError(error) || error.message);
        else await invalidateAll();
      }},
    ]);
  };

  // ── Désactiver un employé (legacy — gardé pour compatibilité) ─────────────
  const deactivatePersonnel = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('rh_personnels').update({ actif: false }).eq('id', id);
      if (error) throw error;
      await invalidateAll();
    } catch (err: unknown) { setAlert(translatePgError(err)); }
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
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
      if (!rows || rows.length === 0) throw new Error('Le fichier est vide.');
      // Reset complet à chaque nouveau fichier
      setImportPreview(rows.map((row, i) => parsePersonnelRow(row, i)));
      setImportSuccess(false);
      setImportErrors([]);
      setImportProgress(null);
      setShowPreview(true);
      setImportError(null);
    } catch (err: unknown) {
      setImportPreview([]); setShowPreview(false);
      setAlert(translatePgError(err) || (err instanceof Error ? err.message : undefined) || 'Impossible de lire le fichier.');
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
    } catch (err: unknown) { setAlert((err as any)?.message || 'Erreur de sélection.'); }
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
    } catch (err: unknown) { setAlert((err as any)?.message || 'Erreur de sélection.'); }
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
      const workbook  = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('Feuille introuvable.');
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: '' });
      if (!rows || rows.length === 0) throw new Error('Le fichier est vide.');

      const fileItems = rows
        .map((row, i) => parsePersonnelRow(row, i))
        .filter((p) => p.matricule && p.full_name !== 'Sans nom');

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
          try { await ensureSociete(item.company || 'NON RENSEIGNE', societeCache); } catch { /* ignoré */ }
        }
      }
      for (const item of fileItems) {
        const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
        if (!societe) continue;
        const sKey = `${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`;
        if (!sectionCache.has(sKey)) {
          try { await ensureSection(item.section || 'NON RENSEIGNE', societe.id, sectionCache); } catch { /* ignoré */ }
        }
      }

      // 4. Comparer et synchroniser — seulement nouveau ou modifié
      let inserted  = 0;
      let updated   = 0;
      let unchanged = 0;
      const errors: { matricule: string; msg: string }[] = [];

      for (const item of fileItems) {
        try {
          const societe = societeCache.get(normalizeCode(item.company || 'NON RENSEIGNE'));
          if (!societe) throw new Error(`Société introuvable : ${item.company}`);
          const section = sectionCache.get(`${societe.id}:${normalizeCode(item.section || 'NON RENSEIGNE')}`);
          if (!section) throw new Error(`Section introuvable : ${item.section}`);

          const { nom, prenoms } = splitFullName(item.full_name);
          const contractType = parseKontractType(item.contract_type);
          const dateEmbauche = item.hire_date || new Date().toISOString().slice(0, 10);
          const existing     = existingMap.get(String(item.matricule));

          if (!existing) {
            // ✅ Nouveau personnel → insérer
            const { error } = await supabase.from('rh_personnels').insert({
              matricule: item.matricule, nom, prenoms,
              societe_id: societe.id, section_id: section.id,
              date_embauche: dateEmbauche, type_contrat: contractType, actif: true,
            });
            if (error) throw error;
            inserted++;
          } else {
            // 🔍 Personnel existant → comparer les champs
            const hasChanged =
              existing.nom          !== nom          ||
              existing.prenoms      !== prenoms      ||
              existing.societe_id   !== societe.id   ||
              existing.section_id   !== section.id   ||
              existing.type_contrat !== contractType ||
              (dateEmbauche && existing.date_embauche !== dateEmbauche);

            if (hasChanged) {
              // 🔄 Des champs ont changé → mettre à jour
              const { error } = await supabase.from('rh_personnels').update({
                nom, prenoms,
                societe_id: societe.id, section_id: section.id,
                date_embauche: dateEmbauche, type_contrat: contractType,
              }).eq('id', existing.id);
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
      } catch (_) { /* non bloquant */ }

    } catch (err: unknown) {
      setAlert(translatePgError(err) || (err as any)?.message || 'Erreur lors de la synchronisation.');
    } finally {
      setIsSyncing(false);
    }
  };

  const confirmImport = async () => {
    if (importPreview.length === 0) { setAlert('Aucune donnée à confirmer.'); return; }
    const invalid = importPreview.filter((p) => !p.matricule || !p.full_name || p.full_name === 'Sans nom');
    if (invalid.length > 0) {
      setAlert(`${invalid.length} ligne(s) sans matricule ou nom valide. Corrigez le fichier.`);
      return;
    }
    setImportProgress({ done: 0, total: importPreview.length });
    try {
      await persistPersonnelBatch(importPreview);
      setImportSuccess(true);
    } catch (err: unknown) {
      setAlert(translatePgError(err) || (err instanceof Error ? err.message : undefined) || 'Erreur lors de la sauvegarde.');
    } finally {
      setImportProgress(null);
    }
  };

  const addManualPersonnel = async () => {
    if (!manualForm.matricule?.trim()) { setAlert('Le matricule est obligatoire.'); return; }
    if (!manualForm.full_name?.trim()) { setAlert('Le nom complet est obligatoire.'); return; }
    if (!manualForm.section?.trim())   { setAlert('La section est obligatoire.'); return; }
    if (!manualForm.company?.trim())   { setAlert('La société est obligatoire.'); return; }
    const record = parsePersonnelRow({
      Societe: manualForm.company, Section: manualForm.section,
      Matricule: manualForm.matricule, 'Nom et Prenoms': manualForm.full_name,
      'Date Embauche': manualForm.hire_date, Type: manualForm.contract_type,
      'Heures Hebdo': manualForm.weekly_hours ?? 40,
    }, personnel.length);
    try {
      setImportProgress({ done: 0, total: 1 });
      await persistPersonnelBatch([record]);
      setManualModalVisible(false);
      setManualForm({ company: '', section: '', matricule: '', full_name: '', hire_date: '', contract_type: 'Fixe', weekly_hours: 40 });
    } catch (err: unknown) {
      setAlert(translatePgError(err) || (err instanceof Error ? err.message : undefined) || "Erreur lors de l'ajout.");
    } finally {
      setImportProgress(null);
    }
  };

  // ── Affectation actions ───────────────────────────────────────────────────

  const toggleEmployee = (id: string) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const createAssignmentRequest = async () => {
    if (!assignFrom || !assignTo)  { setAlert('Sélectionnez une section source et une section cible.'); return; }
    if (assignFrom === assignTo)   { setAlert('La section source et cible doivent être différentes.'); return; }
    if (selectedIds.length === 0)  { setAlert('Sélectionnez au moins un personnel.'); return; }
    if (!supabase)                 { setAlert('Supabase non configuré.'); return; }
    try {
      const { data: demandeData, error: demandeError } = await supabase
        .from('rh_affectations_demandes')
        .insert({
          section_demandeur: assignFrom, section_fournisseur: assignTo,
          nb_personnes: selectedIds.length,
          date_debut: assignDate || new Date().toISOString().slice(0, 10),
          heures_par_jour: assignHours || 8, motif: assignNote || null,
          statut: 'EN_ATTENTE', demande_par: profile?.id || null,
        })
        .select().single();
      if (demandeError) throw demandeError;
      const demandeId = (demandeData as any).id;
      const { error: lineError } = await supabase.from('rh_affectations').insert(
        personnel.filter((p) => selectedIds.includes(p.id)).map((p) => ({
          demande_id: demandeId, personnel_id: p.id,
          date_debut: assignDate || new Date().toISOString().slice(0, 10),
          heures_par_jour: assignHours || 8, notes: assignNote || null,
        }))
      );
      if (lineError) throw lineError;
      await invalidateAll();
      setSelectedIds([]); setAssignTo(''); setAssignFrom('');
      setAssignDate(''); setAssignHours(8); setAssignNote('');
    } catch (err: unknown) { setAlert(translatePgError(err) || 'Erreur lors de la création.'); }
  };

  const approuveDemande = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('rh_affectations_demandes')
        .update({ statut: 'APPROUVE', approuve_par: profile?.id, approuve_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await invalidateAll();
    } catch (err: unknown) { setAlert(translatePgError(err) || "Erreur lors de l'approbation."); }
  };

  const rejectDemande = async () => {
    if (!rejectModal || !supabase) return;
    try {
      const { error } = await supabase.from('rh_affectations_demandes')
        .update({ statut: 'REJETE', commentaire_rejet: rejectComment || 'Rejeté sans commentaire' })
        .eq('id', rejectModal.id);
      if (error) throw error;
      await invalidateAll();
      setRejectModal(null); setRejectComment('');
    } catch (err: unknown) { setAlert(translatePgError(err) || 'Erreur lors du rejet.'); }
  };

  const terminerDemande = async (id: string) => {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('rh_affectations_demandes').update({ statut: 'TERMINE' }).eq('id', id);
      if (error) throw error;
      await invalidateAll();
    } catch (err: unknown) { setAlert(translatePgError(err) || 'Erreur.'); }
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const getOtLevel = (hs: number): 'Normale' | 'Responsable' | 'Direction' =>
    hs <= 0 ? 'Normale' : hs <= 10 ? 'Normale' : hs <= 20 ? 'Responsable' : 'Direction';

  const OTBadge = ({ hs }: { hs: number }) => {
    const level = getOtLevel(hs);
    const cfg   = OT_CONFIG[level];
    return (
      <View style={[styles.badge, { backgroundColor: cfg.color + '18', borderColor: cfg.color + '44' }]}>
        <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
    );
  };

  const StatusBadge = ({ statut }: { statut: string }) => {
    const cfg = STATUT_CONFIG[statut] || { label: statut, bg: '#F3F4F6', text: '#374151', icon: 'help-circle-outline' };
    return (
      <View style={[styles.badge, { backgroundColor: cfg.bg, borderColor: cfg.text + '33' }]}>
        <MaterialCommunityIcons name={cfg.icon as any} size={12} color={cfg.text} />
        <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
      </View>
    );
  };

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const TABS: { key: Tab; label: string; icon: string; badge?: number }[] = [
    { key: 'personnels',   label: 'Personnels',   icon: 'account-group-outline',  badge: totalPersonnel },
    { key: 'affectations', label: 'Affectations', icon: 'account-switch-outline', badge: pendingDemandes || undefined },
    { key: 'heures_sup',   label: 'Heures Supp.', icon: 'clock-alert-outline',   badge: overtimeCount || undefined },
    { key: 'budget',       label: 'Budget',        icon: 'chart-bar' },
    { key: 'historique',   label: 'Imports',       icon: 'history',               badge: batches.length || undefined },
  ];

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <AnimatedPage>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.screenTitle}>RH & Affectations</Text>
            <Text style={styles.screenSubtitle}>
              {isReadOnly
                ? 'Consultation et validation des données RH (accès DPI)'
                : 'Gérez le personnel, les affectations, les heures sup et le budget.'}
            </Text>
          </View>
          <View style={styles.iconCard}>
            <MaterialCommunityIcons name="account-group-outline" size={28} color="#FFF" />
          </View>
        </View>

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
            <Text style={styles.scopeText}>Section filtrée : <Text style={{ fontWeight: '800' }}>{mySection.nom}</Text></Text>
          </View>
        )}

        {/* Alerte */}
        {importError && (
          <View style={styles.alertBox}>
            <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#991B1B" />
            <Text style={styles.alertText}>{importError}</Text>
          </View>
        )}

        {/* KPI Row */}
        <View style={[styles.kpiRow, isMobile && { flexDirection: 'column' }]}>
          {[
            { label: 'Personnel',     value: totalPersonnel,  color: '#1E513B', icon: 'account-group-outline' },
            { label: 'Heures sup.',   value: overtimeCount,   color: '#D97706', icon: 'clock-outline' },
            { label: 'Justif. resp.', value: respOTCount,     color: '#BE123C', icon: 'account-tie' },
            { label: 'Demandes',      value: pendingDemandes, color: '#2563EB', icon: 'send-clock-outline' },
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

        {/* Tab Bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.tabActive]}
              onPress={() => setActiveTab(tab.key)}
            >
              <MaterialCommunityIcons name={tab.icon as any} size={16} color={activeTab === tab.key ? '#FFF' : '#64748B'} />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
              {tab.badge != null && tab.badge > 0 && (
                <View style={[styles.tabBadge, activeTab === tab.key && { backgroundColor: '#FFF' }]}>
                  <Text style={[styles.tabBadgeText, activeTab === tab.key && { color: '#1E513B' }]}>{tab.badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

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
              <View style={{
                marginBottom: 12, padding: 14, borderRadius: 12,
                backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#86EFAC',
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <MaterialCommunityIcons name="check-circle-outline" size={20} color="#15803D" />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#15803D' }}>Synchronisation terminée</Text>
                  <TouchableOpacity onPress={() => setSyncReport(null)} style={{ marginLeft: 'auto' as any }}>
                    <MaterialCommunityIcons name="close" size={16} color="#15803D" />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
                  <View style={{ padding: 10, backgroundColor: '#DCFCE7', borderRadius: 8, alignItems: 'center', minWidth: 80 }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#15803D' }}>{syncReport.inserted}</Text>
                    <Text style={{ fontSize: 11, color: '#15803D', fontWeight: '600' }}>Nouveaux</Text>
                  </View>
                  <View style={{ padding: 10, backgroundColor: '#FEF9C3', borderRadius: 8, alignItems: 'center', minWidth: 80 }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#854D0E' }}>{syncReport.updated}</Text>
                    <Text style={{ fontSize: 11, color: '#854D0E', fontWeight: '600' }}>Mis à jour</Text>
                  </View>
                  <View style={{ padding: 10, backgroundColor: '#F1F5F9', borderRadius: 8, alignItems: 'center', minWidth: 80 }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#475569' }}>{syncReport.unchanged}</Text>
                    <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>Inchangés</Text>
                  </View>
                  {syncReport.errors.length > 0 && (
                    <View style={{ padding: 10, backgroundColor: '#FEE2E2', borderRadius: 8, alignItems: 'center', minWidth: 80 }}>
                      <Text style={{ fontSize: 20, fontWeight: '900', color: '#991B1B' }}>{syncReport.errors.length}</Text>
                      <Text style={{ fontSize: 11, color: '#991B1B', fontWeight: '600' }}>Erreurs</Text>
                    </View>
                  )}
                </View>
                {syncReport.errors.length > 0 && (
                  <View style={{ marginTop: 10, padding: 10, backgroundColor: '#FEE2E2', borderRadius: 8 }}>
                    {syncReport.errors.slice(0, 5).map((e, i) => (
                      <Text key={i} style={{ fontSize: 12, color: '#991B1B' }}>• {e.matricule} : {e.msg}</Text>
                    ))}
                    {syncReport.errors.length > 5 && (
                      <Text style={{ fontSize: 12, color: '#991B1B' }}>...et {syncReport.errors.length - 5} autre(s)</Text>
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
                  <MaterialCommunityIcons name="office-building-outline" size={15} color="#94A3B8" style={{ marginRight: 6 }} />
                  <Text
                    style={[styles.filterSelectText, !filterSociete && { color: '#94A3B8' }]}
                    onPress={() => {}}
                  >
                    {filterSociete ? (societeOptions.find((o) => o.value === filterSociete)?.label || 'Société') : 'Toutes les sociétés'}
                  </Text>
                  {filterSociete ? (
                    <TouchableOpacity onPress={() => { setFilterSociete(''); setFilterSection(''); }}>
                      <MaterialCommunityIcons name="close-circle" size={15} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {/* Dropdown société */}
                {societeOptions.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 0, overflow: 'hidden' }} />
                )}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {societeOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => { setFilterSociete(filterSociete === opt.value ? '' : opt.value); setFilterSection(''); }}
                      style={[styles.filterChip, filterSociete === opt.value && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, filterSociete === opt.value && styles.filterChipTextActive]}>
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
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: '#64748B' }}>Import en cours…</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: C.green }}>
                        {importProgress.done} / {importProgress.total}
                      </Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 999 }}>
                      <View style={{
                        height: 6, borderRadius: 999, backgroundColor: C.green,
                        width: `${Math.round((importProgress.done / importProgress.total) * 100)}%` as any,
                      }} />
                    </View>
                  </View>
                )}

                <ScrollView horizontal>
                  <View style={styles.table}>
                    <View style={[styles.tableRow, styles.tableHead]}>
                      {['Société','Section','Matricule','Nom','Embauche','Type','H.hebdo'].map((h) => (
                        <Text key={h} style={styles.thCell}>{h}</Text>
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
                  <View style={{ marginTop: 12, padding: 10, backgroundColor: '#FEF3C7', borderRadius: 8, borderWidth: 1, borderColor: '#FCD34D' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <MaterialCommunityIcons name="alert-outline" size={14} color="#92400E" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>
                        {importErrors.length} ligne(s) en erreur :
                      </Text>
                    </View>
                    {importErrors.slice(0, 5).map((e, i) => (
                      <Text key={i} style={{ fontSize: 12, color: '#92400E' }}>  {e.matricule} : {e.msg}</Text>
                    ))}
                    {importErrors.length > 5 && (
                      <Text style={{ fontSize: 12, color: '#92400E' }}>...et {importErrors.length - 5} autre(s)</Text>
                    )}
                  </View>
                )}

                {/* Bannière succès */}
                {importSuccess && (
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: '#D1FAE5', borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#6EE7B7' }}>
                    <MaterialCommunityIcons name="check-circle-outline" size={18} color="#065F46" />
                    <Text style={{ color: '#065F46', fontSize: 13, fontWeight: '700', flex: 1 }}>
                      Import réussi — {importPreview.length - importErrors.length} ligne(s) enregistrée(s){importErrors.length > 0 ? `, ${importErrors.length} erreur(s)` : ''}.
                    </Text>
                  </View>
                )}

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                  <ActionButton
                    label="Fermer"
                    variant="secondary"
                    onPress={() => {
                      setImportPreview([]); setShowPreview(false);
                      setImportSuccess(false); setImportErrors([]); setImportProgress(null);
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
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ minWidth: 900 }}>
                      <View style={[styles.tableRowFull, styles.tableHead]}>
                        <Text style={[styles.thCell, { minWidth: 70 }]}>Société</Text>
                        <Text style={[styles.thCell, { minWidth: 100 }]}>Statut</Text>
                        <Text style={[styles.thCell, { minWidth: 80 }]}>Matricule</Text>
                        <Text style={[styles.thCell, { minWidth: 180 }]}>Nom Prénom</Text>
                        <Text style={[styles.thCell, { minWidth: 100 }]}>Date emb.</Text>
                        <Text style={[styles.thCell, { minWidth: 110 }]}>Section</Text>
                        <Text style={[styles.thCell, { minWidth: 110 }]}>BU Productrice</Text>
                        <Text style={[styles.thCell, { minWidth: 60 }]}>H.supp</Text>
                        {!isReadOnly && <Text style={[styles.thCell, { minWidth: 130 }]}>Actions</Text>}
                      </View>
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
                          keyExtractor={p => p.id}
                          scrollEnabled={false}
                          renderItem={({ item: p, index: idx }) => (
                            <View style={[styles.tableRowFull, idx % 2 === 1 && styles.tableRowAlt, !p.actif && { opacity: 0.5 }]}>
                              <Text style={[styles.tdCell, { minWidth: 70 }]}>{p.societe_code || '—'}</Text>
                              {/* Statut : PERMANANT / TEMPORAIRE */}
                              <View style={{ minWidth: 100, flexDirection: 'row', alignItems: 'center' }}>
                                <View style={[styles.badge, {
                                  backgroundColor: p.type_contrat === 'FIXE' ? '#EFF6FF' : '#FFFBEB',
                                  borderColor: p.type_contrat === 'FIXE' ? '#BFDBFE' : '#FCD34D',
                                }]}>
                                  <Text style={[styles.badgeText, { color: p.type_contrat === 'FIXE' ? '#1D4ED8' : '#92400E' }]}>
                                    {p.type_contrat === 'FIXE' ? 'PERMANANT' : 'TEMPORAIRE'}
                                  </Text>
                                </View>
                              </View>
                              <Text style={[styles.tdCell, { minWidth: 80, fontWeight: '700' }]}>{p.matricule}</Text>
                              <Text style={[styles.tdCell, { minWidth: 180 }]}>{p.nom_complet}</Text>
                              <Text style={[styles.tdCell, { minWidth: 100 }]}>
                                {p.date_embauche ? new Date(p.date_embauche).toLocaleDateString('fr-FR') : '—'}
                              </Text>
                              <Text style={[styles.tdCell, { minWidth: 110 }]}>{p.section_nom}</Text>
                              <Text style={[styles.tdCell, { minWidth: 110 }]}>{p.section_nom}</Text>
                              <Text style={[styles.tdCell, { minWidth: 60, color: p.heures_supp_derniere_semaine > 0 ? '#D97706' : '#334155', fontWeight: p.heures_supp_derniere_semaine > 0 ? '700' : '400' }]}>
                                {p.heures_supp_derniere_semaine}h
                              </Text>
                              {!isReadOnly && (
                                <View style={{ minWidth: 130, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <TouchableOpacity onPress={() => openCrudEdit(p)} style={s_act.btn}>
                                    <MaterialCommunityIcons name="pencil-outline" size={15} color="#2563EB" />
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={() => handleToggleActif(p)}
                                    style={[s_act.btn, { backgroundColor: p.actif ? '#FEF3C7' : '#D1FAE5' }]}
                                  >
                                    <MaterialCommunityIcons
                                      name={p.actif ? 'account-off-outline' : 'account-check-outline'}
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
                      <MaterialCommunityIcons name="chevron-left" size={18} color={personnelPage === 0 ? '#CBD5E1' : '#374151'} />
                    </TouchableOpacity>
                    <Text style={styles.pageInfo}>
                      {personnelPage * PERSONNEL_PAGE_SIZE + 1}–{Math.min((personnelPage + 1) * PERSONNEL_PAGE_SIZE, visiblePersonnel.length)} / {visiblePersonnel.length}
                    </Text>
                    {Array.from({ length: totalPages }, (_, i) => i)
                      .filter((i) => Math.abs(i - personnelPage) <= 2)
                      .map((i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.pageNumBtn, i === personnelPage && styles.pageNumBtnActive]}
                          onPress={() => setPersonnelPage(i)}
                        >
                          <Text style={[styles.pageNumText, i === personnelPage && styles.pageNumTextActive]}>{i + 1}</Text>
                        </TouchableOpacity>
                      ))}
                    <TouchableOpacity
                      style={[styles.pageBtn, personnelPage >= totalPages - 1 && styles.pageBtnDisabled]}
                      onPress={() => setPersonnelPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={personnelPage >= totalPages - 1}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={18} color={personnelPage >= totalPages - 1 ? '#CBD5E1' : '#374151'} />
                    </TouchableOpacity>
                  </View>
                )}
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
                    keyExtractor={p => p.id}
                    scrollEnabled={false}
                    renderItem={({ item: p }) => (
                      <View style={[styles.mobileCard, !p.actif && { opacity: 0.5 }]}>
                        {/* Ligne 1 : Société + Badge statut */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 11, color: '#94A3B8', fontWeight: '600', textTransform: 'uppercase' }}>
                            {p.societe_code || '—'}
                          </Text>
                          <View style={[styles.badge, {
                            backgroundColor: p.type_contrat === 'FIXE' ? '#EFF6FF' : '#FFFBEB',
                            borderColor: p.type_contrat === 'FIXE' ? '#BFDBFE' : '#FCD34D',
                          }]}>
                            <Text style={[styles.badgeText, { color: p.type_contrat === 'FIXE' ? '#1D4ED8' : '#92400E' }]}>
                              {p.type_contrat === 'FIXE' ? 'PERMANANT' : 'TEMPORAIRE'}
                            </Text>
                          </View>
                        </View>
                        {/* Ligne 2 : Matricule + Nom */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E513B', minWidth: 36 }}>{p.matricule}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1 }}>{p.nom_complet}</Text>
                        </View>
                        {/* Ligne 3 : Section + Date */}
                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialCommunityIcons name="domain" size={12} color="#94A3B8" />
                            <Text style={{ fontSize: 12, color: '#475569' }}>{p.section_nom}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialCommunityIcons name="calendar-outline" size={12} color="#94A3B8" />
                            <Text style={{ fontSize: 12, color: '#475569' }}>
                              {p.date_embauche ? new Date(p.date_embauche).toLocaleDateString('fr-FR') : '—'}
                            </Text>
                          </View>
                          {p.heures_supp_derniere_semaine > 0 && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <MaterialCommunityIcons name="clock-alert-outline" size={12} color="#D97706" />
                              <Text style={{ fontSize: 12, color: '#D97706', fontWeight: '700' }}>
                                +{p.heures_supp_derniere_semaine}h supp.
                              </Text>
                            </View>
                          )}
                        </View>
                        {/* Actions */}
                        {!isReadOnly && (
                          <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: '#F1F5F9', paddingTop: 8 }}>
                            <TouchableOpacity
                              onPress={() => openCrudEdit(p)}
                              style={[s_act.btn, { flex: 1, borderRadius: 8, height: 34, backgroundColor: '#EFF6FF' }]}
                            >
                              <MaterialCommunityIcons name="pencil-outline" size={16} color="#2563EB" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleToggleActif(p)}
                              style={[s_act.btn, { flex: 1, borderRadius: 8, height: 34, backgroundColor: p.actif ? '#FEF3C7' : '#D1FAE5' }]}
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
                      <MaterialCommunityIcons name="chevron-left" size={18} color={personnelPage === 0 ? '#CBD5E1' : '#374151'} />
                    </TouchableOpacity>
                    <Text style={styles.pageInfo}>
                      {personnelPage * PERSONNEL_PAGE_SIZE + 1}–{Math.min((personnelPage + 1) * PERSONNEL_PAGE_SIZE, visiblePersonnel.length)} / {visiblePersonnel.length}
                    </Text>
                    <TouchableOpacity
                      style={[styles.pageBtn, personnelPage >= totalPages - 1 && styles.pageBtnDisabled]}
                      onPress={() => setPersonnelPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={personnelPage >= totalPages - 1}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={18} color={personnelPage >= totalPages - 1 ? '#CBD5E1' : '#374151'} />
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
                <FormSelect label="Section source (qui prête)"  options={sectionOptions} value={assignFrom ?? ''} onSelect={setAssignFrom} />
                <FormSelect label="Section cible (qui reçoit)"  options={sectionOptions.filter((o) => o.value !== assignFrom)} value={assignTo ?? ''} onSelect={setAssignTo} />
                <FormInput  label="Date de démarrage"           placeholder="JJ/MM/AAAA" value={assignDate ?? ''} onChangeText={setAssignDate} />
                <FormInput  label="Heures par jour"             placeholder="8" value={String(assignHours)} onChangeText={(t) => setAssignHours(Number(t.replace(/[^0-9]/g, '') || 8))} keyboardType="numeric" />
                <FormInput  label="Motif / Commentaire"         placeholder="Précisez le besoin..." value={assignNote ?? ''} onChangeText={setAssignNote} />
                <Text style={styles.subLabel}>Sélectionner le personnel à affecter</Text>
                <View style={styles.selectionList}>
                  {!assignFrom ? (
                    <Text style={styles.hintText}>Sélectionnez d'abord la section source.</Text>
                  ) : visiblePersonnel.filter((p) => p.section_id === assignFrom).length === 0 ? (
                    <Text style={styles.hintText}>Aucun personnel dans cette section.</Text>
                  ) : (
                    visiblePersonnel.filter((p) => p.section_id === assignFrom).map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.selectionItem, selectedIds.includes(p.id) && styles.selectionItemActive]}
                        onPress={() => toggleEmployee(p.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.selectionName}>{p.nom_complet}</Text>
                          <Text style={styles.selectionMeta}>{p.matricule} · {p.type_contrat} · {p.heures_derniere_semaine}h/sem</Text>
                        </View>
                        <MaterialCommunityIcons
                          name={selectedIds.includes(p.id) ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                          size={22} color={selectedIds.includes(p.id) ? C.green : '#94A3B8'}
                        />
                      </TouchableOpacity>
                    ))
                  )}
                </View>
                {selectedIds.length > 0 && (
                  <Text style={{ fontSize: 12, color: C.green, marginBottom: 12, fontWeight: '700' }}>
                    {selectedIds.length} personnel(s) sélectionné(s)
                  </Text>
                )}
                <ActionButton label="Créer la demande" icon="send" onPress={createAssignmentRequest} />
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Demandes ({visibleDemandes.length})</Text>
            </View>
            {visibleDemandes.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="swap-horizontal-circle-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyText}>Aucune demande d'affectation.</Text>
              </View>
            ) : (
              visibleDemandes.map((req) => {
                const src   = sectionById[req.section_demandeur]?.nom || req.section_demandeur;
                const dst   = sectionById[req.section_fournisseur]?.nom || req.section_fournisseur;
                const count = req.rh_affectations?.length ?? req.nb_personnes;
                const canValidate  = (role === 'ADMIN' || role === 'RH' || role === 'DPI') && req.statut === 'EN_ATTENTE';
                const canTerminate = (role === 'ADMIN' || role === 'RH') && req.statut === 'APPROUVE';
                return (
                  <View key={req.id} style={styles.requestCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.requestTitle}>{src} → {dst}</Text>
                        <Text style={styles.requestMeta}>{count} personne(s) · {req.date_debut}</Text>
                      </View>
                      <StatusBadge statut={req.statut} />
                    </View>
                    {req.heures_par_jour > 0 && <Text style={styles.requestLine}>Heures/jour : {req.heures_par_jour}h</Text>}
                    {req.motif            && <Text style={styles.requestLine}>Motif : {req.motif}</Text>}
                    {req.commentaire_rejet && <Text style={[styles.requestLine, { color: '#BE123C' }]}>Motif rejet : {req.commentaire_rejet}</Text>}
                    {req.approuve_at      && <Text style={styles.requestLine}>Traité le : {new Date(req.approuve_at).toLocaleDateString('fr-FR')}</Text>}
                    {(canValidate || canTerminate) && (
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                        {canValidate && (
                          <>
                            <ActionButton label="Approuver" icon="check-circle-outline" onPress={() => approuveDemande(req.id)} />
                            <ActionButton label="Rejeter" icon="close-circle-outline" variant="secondary" onPress={() => { setRejectModal({ id: req.id }); setRejectComment(''); }} />
                          </>
                        )}
                        {canTerminate && (
                          <ActionButton label="Marquer terminé" icon="flag-checkered" variant="secondary" onPress={() => terminerDemande(req.id)} />
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[styles.badge, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                  <MaterialCommunityIcons name="account-tie" size={11} color="#92400E" />
                  <Text style={[styles.badgeText, { color: '#92400E' }]}>Resp : {respOTCount}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
                  <MaterialCommunityIcons name="shield-alert-outline" size={11} color="#991B1B" />
                  <Text style={[styles.badgeText, { color: '#991B1B' }]}>Dir : {dirOTCount}</Text>
                </View>
              </View>
            </View>

            {/* Légende */}
            <View style={[styles.card, { flexDirection: 'row', flexWrap: 'wrap', gap: 14 }]}>
              {Object.entries(OT_CONFIG).map(([k, v]) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: v.color }} />
                  <Text style={{ fontSize: 12, color: '#475569' }}>{v.label}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <ScrollView horizontal>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHead]}>
                    {['Matricule','Nom','Section','H.hebdo','H.supp','Niveau','Justification'].map((h) => (
                      <Text key={h} style={[styles.thCell, { minWidth: h === 'Justification' || h === 'Nom' ? 160 : 100 }]}>{h}</Text>
                    ))}
                  </View>
                  {visiblePersonnel.filter((p) => p.heures_supp_derniere_semaine > 0).length === 0 ? (
                    <View style={styles.emptyState}>
                      <MaterialCommunityIcons name="clock-check-outline" size={40} color="#CBD5E1" />
                      <Text style={styles.emptyText}>Aucune heure supplémentaire détectée.</Text>
                    </View>
                  ) : (
                    visiblePersonnel
                      .filter((p) => p.heures_supp_derniere_semaine > 0)
                      .sort((a, b) => b.heures_supp_derniere_semaine - a.heures_supp_derniere_semaine)
                      .map((p) => {
                        const level = getOtLevel(p.heures_supp_derniere_semaine);
                        const cfg   = OT_CONFIG[level];
                        return (
                          <View
                            key={p.id}
                            style={[
                              styles.tableRow,
                              level === 'Direction'   && { backgroundColor: '#FFF5F5' },
                              level === 'Responsable' && { backgroundColor: '#FFFBEB' },
                            ]}
                          >
                            <Text style={[styles.tdCell, { minWidth: 100 }]}>{p.matricule}</Text>
                            <Text style={[styles.tdCell, { minWidth: 160 }]}>{p.nom_complet}</Text>
                            <Text style={[styles.tdCell, { minWidth: 100 }]}>{p.section_nom}</Text>
                            <Text style={[styles.tdCell, { minWidth: 100 }]}>{p.heures_derniere_semaine}h</Text>
                            <Text style={[styles.tdCell, { minWidth: 100, fontWeight: '700', color: cfg.color }]}>{p.heures_supp_derniere_semaine}h</Text>
                            <View style={[{ minWidth: 100 }]}><OTBadge hs={p.heures_supp_derniere_semaine} /></View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 160 }}>
                              {level === 'Direction'   && <MaterialCommunityIcons name="alert-octagon-outline" size={13} color="#BE123C" />}
                              {level === 'Responsable' && <MaterialCommunityIcons name="alert-outline" size={13} color="#D97706" />}
                              <Text style={[styles.tdCell, { minWidth: 0, color: '#64748B', fontStyle: 'italic' }]}>
                                {level === 'Direction' ? 'Comité requis' : level === 'Responsable' ? 'Justification requise' : '—'}
                              </Text>
                            </View>
                          </View>
                        );
                      })
                  )}
                </View>
              </ScrollView>
            </View>

            <View style={[styles.kpiRow, isMobile && { flexDirection: 'column' }]}>
              {[
                { label: 'Total H. hebdo', value: `${totalBudgetH}h`, color: C.green, icon: 'clock-outline' },
                { label: 'Total H. supp',  value: `${totalSupH}h`,    color: '#D97706', icon: 'clock-alert-outline' },
                { label: 'Taux HS',        value: totalBudgetH > 0 ? `${Math.round((totalSupH / totalBudgetH) * 100)}%` : '0%', color: '#2563EB', icon: 'percent' },
              ].map((kpi) => (
                <View key={kpi.label} style={[styles.kpiCard, isMobile && { width: '100%' }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
                    <MaterialCommunityIcons name={kpi.icon as any} size={20} color={kpi.color} />
                  </View>
                  <View><Text style={styles.kpiValue}>{kpi.value}</Text><Text style={styles.kpiLabel}>{kpi.label}</Text></View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── TAB: BUDGET ── */}
        {activeTab === 'budget' && (
          <View>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Budget Heures par Section</Text></View>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Récapitulatif semaine en cours</Text>
              <ScrollView horizontal>
                <View style={styles.table}>
                  <View style={[styles.tableRow, styles.tableHead]}>
                    {['Section','Effectif','H. normales','H. supp','Total H.','Taux HS'].map((h) => (
                      <Text key={h} style={[styles.thCell, { minWidth: 110 }]}>{h}</Text>
                    ))}
                  </View>
                  {sections
                    .filter((sec) => !isRprod || !mySection || sec.id === mySection.id)
                    .map((sec) => {
                      const sp    = personnel.filter((p) => p.section_id === sec.id);
                      if (sp.length === 0) return null;
                      const tH    = sp.reduce((a, p) => a + (p.heures_derniere_semaine || 0), 0);
                      const tHS   = sp.reduce((a, p) => a + (p.heures_supp_derniere_semaine || 0), 0);
                      const taux  = tH > 0 ? Math.round((tHS / tH) * 100) : 0;
                      return (
                        <View key={sec.id} style={styles.tableRow}>
                          <Text style={[styles.tdCell, { minWidth: 110, fontWeight: '700' }]}>{sec.nom}</Text>
                          <Text style={[styles.tdCell, { minWidth: 110 }]}>{sp.length}</Text>
                          <Text style={[styles.tdCell, { minWidth: 110 }]}>{tH - tHS}h</Text>
                          <Text style={[styles.tdCell, { minWidth: 110, color: tHS > 0 ? '#D97706' : '#374151', fontWeight: tHS > 0 ? '700' : '400' }]}>{tHS}h</Text>
                          <Text style={[styles.tdCell, { minWidth: 110, fontWeight: '700' }]}>{tH}h</Text>
                          <Text style={[styles.tdCell, { minWidth: 110, color: taux > 20 ? '#BE123C' : taux > 10 ? '#D97706' : '#15803D' }]}>{taux}%</Text>
                        </View>
                      );
                    })}
                </View>
              </ScrollView>
            </View>

            {!isReadOnly && !isRprod && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Planifier un budget</Text>
                <FormSelect label="Section" options={sectionOptions} value={budgetSection ?? ''} onSelect={setBudgetSection} />
                <FormInput label="Heures budgétisées" placeholder="0" value={String(budgetHeures)} onChangeText={(t) => setBudgetHeures(Number(t.replace(/[^0-9]/g, '') || 0))} keyboardType="numeric" />
                <FormInput label="Période (ex: S22/2026)" placeholder={getCurrentWeekLabel()} value={budgetPeriode ?? ''} onChangeText={setBudgetPeriode} />
                <View style={{ marginTop: 8 }}>
                  <ActionButton label="Enregistrer" icon="content-save-outline" onPress={async () => {
                    if (!budgetSection || !budgetHeures) { setAlert('Sélectionnez une section et saisissez les heures.'); return; }
                    if (!supabase) return;
                    try {
                      const { error } = await supabase.from('rh_budget_heures').insert({
                        section_id: budgetSection, periode: budgetPeriode || getCurrentWeekLabel(),
                        heures_budget: budgetHeures, created_by: profile?.id,
                      });
                      if (error) throw error;
                      setBudgetSection(''); setBudgetHeures(0); setBudgetPeriode('');
                    } catch (err: unknown) { setAlert(translatePgError(err) || "Erreur lors de l'enregistrement."); }
                  }} />
                </View>
              </View>
            )}

            <View style={[styles.kpiRow, isMobile && { flexDirection: 'column' }]}>
              {[
                { label: 'H. normales total', value: `${totalBudgetH - totalSupH}h`, color: C.green, icon: 'clock-outline' },
                { label: 'H. supp total',     value: `${totalSupH}h`,               color: '#D97706', icon: 'clock-alert-outline' },
                { label: 'H. total payées',   value: `${totalBudgetH}h`,            color: '#2563EB', icon: 'currency-usd' },
              ].map((kpi) => (
                <View key={kpi.label} style={[styles.kpiCard, isMobile && { width: '100%' }]}>
                  <View style={[styles.kpiIcon, { backgroundColor: kpi.color + '18' }]}>
                    <MaterialCommunityIcons name={kpi.icon as any} size={20} color={kpi.color} />
                  </View>
                  <View><Text style={styles.kpiValue}>{kpi.value}</Text><Text style={styles.kpiLabel}>{kpi.label}</Text></View>
                </View>
              ))}
            </View>
          </View>
        )}

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
                      <Text style={[styles.tdCell, { minWidth: 220, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 11 }]}>
                        {b.import_batch_id}
                      </Text>
                      <Text style={[styles.tdCell, { minWidth: 120 }]}>{b.semaine_label}</Text>
                      <Text style={[styles.tdCell, { minWidth: 100, fontWeight: '700', color: C.green }]}>{b.count}</Text>
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
                options={crudSocietes.map(s => ({ label: `${s.code} – ${s.nom}`, value: s.id }))}
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
                onChangeText={v => setCrudForm(prev => ({ ...prev, nom: v.toUpperCase() }))}
              />
              {/* Prénom(s) */}
              <FormInput
                label="Prénom(s) *"
                placeholder="ex: Tsikivy Rina"
                value={crudForm.prenoms ?? ''}
                onChangeText={v => setCrudForm(prev => ({ ...prev, prenoms: v }))}
              />
              {/* Date embauche */}
              <FormInput
                label="Date d'embauche"
                placeholder="YYYY-MM-DD"
                value={crudForm.date_embauche ?? ''}
                onChangeText={v => setCrudForm(prev => ({ ...prev, date_embauche: v }))}
              />
              {/* Section */}
              <FormSelect
                label="Section *"
                value={crudForm.section_id ?? ''}
                options={filteredSections.map(s => ({ label: `${s.code} – ${s.nom}`, value: s.id }))}
                onSelect={(v: string) => setCrudForm(prev => ({ ...prev, section_id: v }))}
              />
              {filteredSections.length === 0 && crudForm.societe_id === '' && (
                <Text style={{ fontSize: 12, color: '#94A3B8', marginBottom: 8 }}>
                  Sélectionnez d'abord une Société pour voir les Sections.
                </Text>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <ActionButton label="Annuler" variant="secondary" onPress={() => { setCrudModalVisible(false); setCrudEditId(null); }} />
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
              <FormInput label="Société *"       placeholder="GSI"         value={manualForm.company || ''}     onChangeText={(t) => setManualForm((p) => ({ ...p, company: t }))} />
              <FormInput label="Section *"       placeholder="Production"  value={manualForm.section || ''}     onChangeText={(t) => setManualForm((p) => ({ ...p, section: t }))} />
              <FormInput label="Matricule *"     placeholder="12345"       value={manualForm.matricule || ''}   onChangeText={(t) => setManualForm((p) => ({ ...p, matricule: t }))} />
              <FormInput label="Nom complet *"   placeholder="Jean Dupont" value={manualForm.full_name || ''}   onChangeText={(t) => setManualForm((p) => ({ ...p, full_name: t }))} />
              <FormInput label="Date d'embauche" placeholder="JJ/MM/AAAA"  value={manualForm.hire_date || ''}   onChangeText={(t) => setManualForm((p) => ({ ...p, hire_date: t }))} />
              <FormSelect label="Type de contrat" options={CONTRACT_OPTIONS} value={manualForm.contract_type || 'Fixe'} onSelect={(v: string) => setManualForm((p) => ({ ...p, contract_type: v }))} />
              <FormInput label="Heures hebdo" placeholder="40" value={String(manualForm.weekly_hours ?? 40)} onChangeText={(t) => setManualForm((p) => ({ ...p, weekly_hours: Number(t.replace(/[^0-9]/g, '') || 0) }))} keyboardType="numeric" />
            </ScrollView>
            <View style={styles.modalActions}>
              <ActionButton label="Annuler" variant="secondary" onPress={() => setManualModalVisible(false)} />
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
                style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, minHeight: 80, textAlignVertical: 'top', fontSize: 14, color: '#0F172A' }}
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
