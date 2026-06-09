// ============================================================================
// ERP GSI — Supabase Database Types (generated from schema)
// ============================================================================

export type ArticleType = 'MP' | 'SF' | 'PF' | 'EMB';
export type CqlibStatus = 'EN_ATTENTE' | 'QUARANTAINE' | 'LIBERE' | 'BLOQUE' | 'DETERIORE' | 'DEROGATION';
export type FcqStatus = 'EN_ATTENTE' | 'EN_COURS' | 'COMPLET' | 'VALIDE';
export type FncSeverity = 'MINEURE' | 'MAJEURE' | 'CRITIQUE';
export type FncStatus = 'OUVERTE' | 'EN_COURS' | 'A_VALIDER' | 'CLOTUREE';
export type DaImportStep = 'DA_VALIDEE' | 'PROFORMA' | 'LC_VIREMENT' | 'EXPEDITION' | 'CONNAISSEMENT' | 'DEDOUANEMENT' | 'ETA' | 'RECEPTION';
export type DaLocalStep = 'SAISIE' | 'VALIDATION' | 'COMMANDE' | 'RECEPTION';
export type DaStatus = 'EN_COURS' | 'RETARD' | 'LIVRE' | 'CLOS' | 'ANNULE';
export type InstrumentStatus = 'ETALONNE' | 'A_ETALONNER' | 'ECHU' | 'EN_ATTENTE';
export type InventoryStatus = 'EN_PREPARATION' | 'EN_COURS' | 'TERMINE' | 'VALIDE';
export type UserRole = 'DPI' | 'RQ' | 'TLAB' | 'RPROD' | 'MAGA' | 'RACH' | 'PLAN' | 'ADMIN' | 'RH' | 'COMPTA' | 'SUPER_ADMIN' | 'DSI' | 'RESPONSABLE' | 'OPERATEUR' | 'DG' | 'CHEF_LIGNE';
export type MovementType = 'ENTREE' | 'SORTIE' | 'TRANSFERT' | 'AJUSTEMENT';

export interface AppNotification {
  id: string;
  user_id: string | null;
  role: UserRole | null;
  title: string;
  message: string;
  read: boolean;
  type: 'info' | 'warning' | 'error' | 'success';
  metadata: {
    category?: 'QUALITY' | 'PRODUCTION' | 'PURCHASING' | 'STOCK' | 'SYSTEM';
    screen?: string;
    da_import_id?: string;
    lot_id?: string;
    fnc_id?: string;
    step?: string;
    [key: string]: any;
  } | null;
  created_at: string;
}

// ─── Row types ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  auth_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  site: string | null;
  scope: string | null;
  line_code: string | null;
  avatar_url: string | null;
  active: boolean;
  two_fa_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Spécifications techniques liées à une gamme de produits (SP-*) */
export interface QcSpecification {
  id: string;
  spec_ref: string;
  parameter_name: string;
  min_value: number;
  max_value: number;
  unit: string;
  active: boolean;
  created_at: string;
}

export interface Site {
  id: string;
  code: string;
  name: string;
  city: string | null;
  active: boolean;
  created_at: string;
}

export interface Depot {
  id: string;
  code: string;
  name: string;
  site_id: string;
  depot_type: ArticleType | null;
  is_deteriore: boolean;
  active: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  country: string | null;
  currency: string;
  lead_time_days: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  rating: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Article {
  id: string;
  code: string;
  name: string;
  name_en?: string | null;
  article_type: ArticleType;
  family: string | null;
  brand: string | null;
  universe: string | null;
  unit: string;
  spec_ref: string | null;
  fcq_ref: string | null;
  bp_ref: string | null;
  default_supplier_id: string | null;
  default_depot_id: string | null;
  safety_stock: number;
  reorder_point: number;
  cqlib_exempt: boolean;
  exemption_reason: string | null;
  sage_code: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Instrument {
  id: string;
  code: string;
  name: string;
  procedure_ref: string | null;
  frequency: string | null;
  standard_required: string | null;
  standard_status: string | null;
  status: InstrumentStatus;
  last_calibration_at: string | null;
  next_calibration_at: string | null;
  owner_id: string | null;
  impact_if_nc: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Lot {
  id: string;
  code: string;
  bon_entree_id: string | null;
  article_id: string;
  supplier_id: string | null;
  depot_id: string | null;
  qty_received: number;
  qty_current: number;
  unit: string;
  cqlib_status: CqlibStatus;
  cqlib_decided_by: string | null;
  cqlib_decided_at: string | null;
  origin: string | null;
  batch_supplier: string | null;
  reception_date: string;
  expiry_date: string | null;
  sage_synced: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  article?: Article;
  supplier?: Supplier;
  depot?: Depot;
  be?: { code: string };
}

export interface FcqDossier {
  id: string;
  code: string;
  lot_id: string;
  fcq_type: string;
  status: FcqStatus;
  decision: CqlibStatus | null;
  analyst_id: string | null;
  validator_id: string | null;
  instrument_id: string | null;
  instrument_ok: boolean | null;
  analyst_signed_at: string | null;
  validator_signed_at: string | null;
  notes: string | null;
  validated_at?: string | null;
  created_at: string;
  updated_at: string;
  // RQ decision fields
  motif_decision?: string | null;
  observation_rq?: string | null;
  controleur_nom?: string | null;
  quantite_controlee?: number | null;
  out_of_spec_count?: number | null;
  // Joined
  lot?: Lot;
  analyst?: User;
  instrument?: Instrument;
  results?: Record<string, any>;
}

export interface Fnc {
  id: string;
  code: string;
  lot_id: string | null;
  fcq_id: string | null;
  supplier_id: string | null;
  severity: FncSeverity;
  status: FncStatus;
  description: string;
  // 8D methodology fields
  d1_team: string | null;
  d3_containment: string | null;
  d4_root_cause: string | null;
  d5_planned_actions: string | null;
  d6_implemented_actions: string | null;
  d7_preventive_actions: string | null;
  d8_closure_notes: string | null;
  d8_signature: string | null;

  assigned_to?: string | null;
  created_by?: string | null;
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  
  lot_code?: string;
  article_name?: string;
  supplier_name?: string;
}

export interface DaImport {
  id: string;
  code: string;
  article_id: string;
  supplier_id: string;
  qty_container: string | null;
  qty_kg: number;
  unit: string;       // Requires migration: ALTER TABLE da_import ADD COLUMN unit TEXT NOT NULL DEFAULT 'kg';
  currency: string;
  amount_currency: number;
  amount_mga: number | null;
  exchange_rate_id: string | null;
  current_step: DaImportStep;
  status: DaStatus;
  eta_date: string | null;
  lead_time_days: number | null;
  requested_by: string | null;
  notes: string | null;
  documents?: any[];
  created_at: string;
  updated_at: string;
  // Joined
  article?: Article;
  supplier?: Supplier;
}

export interface DaLocal {
  id: string;
  code: string;
  article_id: string;
  supplier_id: string;
  qty_requested: number;
  unit: string;
  amount_mga: number;
  current_step: DaLocalStep;
  status: DaStatus;
  requested_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  article?: Article;
  supplier?: Supplier;
  deliveries?: DaLocalDelivery[];
}

export interface DaLocalDelivery {
  id: string;
  da_local_id: string;
  delivery_date: string;
  qty_delivered: number;
  unit: string;
  ecart_pct: number | null;
  comment: string | null;
  received_by: string | null;
  created_at: string;
}

export interface InventoryCampaign {
  id: string;
  code: string;
  label: string;
  period: string | null;
  zones: number;
  status: InventoryStatus;
  started_at: string | null;
  completed_at: string | null;
  validated_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryCount {
  id: string;
  campaign_id: string;
  lot_id: string | null;
  article_id: string;
  depot_id: string;
  qty_expected: number;
  qty_counted: number;
  unit: string;
  counted_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface BomHeader {
  id: string;
  code: string;
  product_id: string;
  version: number;
  status: string;
  batch_size_kg: number;
  notes?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  product?: Article;
  lines?: BomLine[];
}

export type ComplaintStatus = 'OUVERTE' | 'EN_ANALYSE' | 'TRAITEE' | 'CLOTUREE';
export type ComplaintOrigin = 'CLIENT' | 'INTERNE' | 'TRANSPORTEUR' | 'AUTRE';
export type ComplaintSeverity = 'MINEURE' | 'MAJEURE' | 'CRITIQUE';

export interface Complaint {
  id: string;
  code: string;
  client_name: string;
  client_ref: string | null;
  origin: ComplaintOrigin;
  severity: ComplaintSeverity;
  status: ComplaintStatus;
  lot_id: string | null;
  article_id: string | null;
  description: string;
  qty_concerned: number | null;
  return_qty: number | null;
  return_value: number | null;
  root_cause: string | null;
  corrective_action: string | null;
  preventive_action: string | null;
  compensation: string | null;
  fnc_id: string | null;
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  lot?: Lot;
  article?: Article;
}

export interface BomLine {
  id: string;
  bom_header_id: string;
  component_id: string;
  qty: number;
  unit: string;
  is_sub_assembly: boolean;
  scrap_pct?: number | null;
  sort_order?: number;
  created_at: string;
  // Joined
  component?: Article;
}

export type EvalCriteria = 'QUALITY' | 'DELIVERY' | 'PRICE' | 'COMPLIANCE' | 'SERVICE';
export type EvalPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'YEARLY';

export interface SupplierEvaluation {
  id: string;
  supplier_id: string;
  period: EvalPeriod;
  year: number;
  criteria: EvalCriteria;
  score: number;
  comment: string | null;
  evaluated_by: string | null;
  evaluated_at: string;
  created_at: string;
}

export interface SupplierEvaluationSummary {
  id: string;
  supplier_id: string;
  period: EvalPeriod;
  year: number;
  overall_score: number | null;
  evaluation_count: number;
  classification: string | null;
  notes: string | null;
  evaluated_by: string | null;
  evaluated_at: string;
  created_at: string;
}

export type ReconciliationStatus = 'NON_COMPTE' | 'CONFORME' | 'ECART_MINEUR' | 'ECART_MAJEUR';

export interface InventoryEcartView {
  count_id: string;
  campaign_id: string;
  campaign_code: string;
  campaign_label: string;
  article_id: string;
  article_code: string;
  article_name: string;
  article_type: ArticleType;
  depot_id: string;
  depot_code: string;
  depot_name: string;
  lot_id: string | null;
  lot_code: string | null;
  stock_theorique: number;
  stock_physique: number | null;
  ecart: number | null;
  ecart_pct: number | null;
  is_major: boolean;
  counted_by: string | null;
  counted_by_name: string | null;
  counted_at: string | null;
  notes: string | null;
  campaign_status: string;
  reconciliation_status: ReconciliationStatus;
}

export interface LotGenealogyView {
  lot_id: string;
  lot_code: string;
  article_id: string;
  article_code: string;
  article_name: string;
  article_type: ArticleType;
  qty_current: number;
  unit: string;
  cqlib_status: CqlibStatus;
  reception_date: string;
  expiry_date: string | null;
  origin: string | null;
  batch_supplier: string | null;
  parent_lot_id: string | null;
  parent_lot_code: string | null;
  parent_article_id: string | null;
  parent_article_code: string | null;
  parent_article_name: string | null;
  production_order_id: string | null;
  production_order_code: string | null;
  production_order_status: string | null;
  qty_planned: number | null;
  qty_produced: number | null;
  supplier_id: string | null;
  supplier_name: string | null;
  depot_id: string | null;
  depot_code: string | null;
  depot_name: string | null;
  bon_entree_id: string | null;
  bon_entree_code: string | null;
}

export interface ProductionForecast {
  id: string;
  product_id: string;
  year: number;
  month: number;  // 1-12
  qty: number;
  created_at: string;
  updated_at: string;
  // Joined
  product?: Article;
}

export interface SupplierClassificationView {
  supplier_id: string;
  supplier_code: string;
  supplier_name: string;
  country: string | null;
  current_rating: number | null;
  overall_score: number | null;
  classification: string | null;
  period: string | null;
  eval_year: number | null;
  last_evaluated_at: string | null;
  open_fnc_count: number;
  active_orders: number;
}

export interface ProductionCostView {
  order_id: string;
  order_code: string;
  product_id: string;
  product_code: string;
  product_name: string;
  standard_cost: number;
  qty_planned: number;
  qty_produced: number | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  cost_variance_pct: number | null;
  cost_status: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Carrier {
  id: string;
  code: string;
  name: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  vehicle_type: string | null;
  capacity_kg: number | null;
  cost_per_km: number | null;
  active: boolean;
  created_at: string;
}

export interface DeliveryRoute {
  id: string;
  code: string;
  label: string;
  carrier_id: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  planned_date: string;
  departure_time: string | null;
  estimated_km: number | null;
  status: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LogisticsCalendarView {
  route_id: string;
  route_code: string;
  route_label: string;
  planned_date: string;
  route_status: string;
  carrier_name: string | null;
  vehicle_type: string | null;
  driver_name: string | null;
  vehicle_plate: string | null;
  estimated_km: number | null;
  stop_count: number;
  completed_stops: number;
}

export interface Import8DWorkflowView {
  import_id: string;
  import_code: string;
  article_code: string;
  article_name: string;
  supplier_name: string;
  supplier_code: string;
  import_status: string;
  import_step: string;
  fnc_id: string | null;
  fnc_code: string | null;
  severity: string | null;
  fnc_status: string | null;
  d1_team: string | null;
  d3_containment: string | null;
  d4_root_cause: string | null;
  d5_planned_actions: string | null;
  d6_implemented_actions: string | null;
  d7_preventive_actions: string | null;
  d8_closure_notes: string | null;
  fnc_opened_at: string | null;
  fnc_closed_at: string | null;
  d8_step: string;
  quality_alert_at: string | null;
}

export interface BiStockByType {
  article_type: ArticleType;
  lot_count: number;
  article_count: number;
  total_qty: number;
  total_value: number;
}

export interface BiMonthlyProduction {
  month: string;
  article_type: string;
  family: string | null;
  order_count: number;
  total_produced: number;
  total_cost: number;
  total_planned: number;
}

export interface BiQualityFpy {
  month: string;
  total_dossiers: number;
  liberes: number;
  fpy_pct: number;
}

export interface Document {
  id: string;
  name: string;
  file_path: string;
  bucket: string;
  mime_type: string | null;
  file_size: number | null;
  reference_type: string | null;
  reference_id: string | null;
  category: string | null;
  tags: string[] | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceTask {
  id: string;
  code: string;
  equipment_name: string;
  equipment_type: string | null;
  frequency_days: number;
  last_performed_at: string | null;
  next_due_at: string | null;
  assigned_to: string | null;
  description: string | null;
  status: string;
  priority: string;
  estimated_duration_min: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type StockAlertStatus = 'OK' | 'WARNING' | 'CRITICAL';

export interface StockAlert {
  article_id: string;
  article_code: string;
  article_name: string;
  article_type: ArticleType;
  unit: string;
  safety_stock: number;
  reorder_point: number;
  total_stock: number;
  depot_count: number;
  lot_count: number;
  stock_status: StockAlertStatus;
  coverage_pct: number | null;
}

// ─── Taux de change ─────────────────────────────────────────────────────────
export interface ExchangeRate {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  source: string | null;
  created_at: string;
}
