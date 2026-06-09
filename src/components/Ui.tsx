import * as React from 'react';
import { Pressable, StyleSheet, Text, View, Platform, ActivityIndicator, Modal, TextInput, ScrollView, FlatList, TouchableOpacity, useWindowDimensions } from 'react-native';
import { View as MotiView, AnimatePresence } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// ─── Design tokens Sipromad ────────────────────────────────────────────────────
export const C = {
  bg: '#F8F9FA',
  surface: '#FFFFFF',
  sidebar: '#1A1A1A', // Dark sidebar from screenshot
  border: '#E9ECEF',
  textPrimary: '#1A1A1A',
  textSecondary: '#6C757D',
  textMuted: '#ADB5BD',
  accent: '#1A1A1A',
  green: '#1E513B', // Brand green
  gold: '#D4A017', // Notification gold
  // tones
  warn: '#D4A017',
  err: '#DC3545',
  danger: '#DC3545',
  ok: '#28A745',
  info: '#0D6EFD',
  primary: '#0D6EFD',
  // background variants
  bgErr: '#FFF5F5',
  bgOk: '#F0FFF4',
  bgWarn: '#FFFBEB',
  bgInfo: '#EEF2FF',
};

// ─── Badge ────────────────────────────────────────────────────────────────────
function _Badge({ label, color = C.gold }: { label: string; color?: string }) {
  return (
    <View style={[s.badge, { backgroundColor: color }]}>
      <Text style={s.badgeText}>{label}</Text>
    </View>
  );
}

// ─── Specialized Cards ────────────────────────────────────────────────────────
function _KpiCard({
  label,
  value,
  sub,
  icon,
  color = C.border,
  loading = false,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: string;
  color?: string;
  loading?: boolean;
  onPress?: () => void;
}) {
  if (loading) {
    return (
      <View style={[s.kpiCard, { borderLeftColor: C.border, borderLeftWidth: 3, opacity: 0.6 }]}>
        <MotiView 
          from={{ opacity: 0.3 }}
          animate={{ opacity: 0.7 }}
          transition={{ loop: true, type: 'timing', duration: 1000 }}
          style={{ height: 14, width: '60%', backgroundColor: '#EEE', borderRadius: 4, marginBottom: 12 }} 
        />
        <MotiView 
          from={{ opacity: 0.3 }}
          animate={{ opacity: 0.7 }}
          transition={{ loop: true, type: 'timing', duration: 1000, delay: 200 }}
          style={{ height: 28, width: '80%', backgroundColor: '#EEE', borderRadius: 4 }} 
        />
      </View>
    );
  }

  return (
    <TouchableOpacity 
      style={[s.kpiCard, { borderLeftColor: color, borderLeftWidth: 3 }]}
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`${label}: ${value}${sub ? ', ' + sub : ''}`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.kpiLabel}>{label}</Text>
        {icon && <MaterialCommunityIcons name={icon as any} size={18} color={color} opacity={0.5} />}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <Text style={s.kpiValue}>{value}</Text>
        {sub?.includes('%') || sub?.includes('lots') ? null : <Text style={s.kpiUnit}>{sub?.split(' ')[1]}</Text>}
      </View>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

// ─── ProgressBarKpi ───────────────────────────────────────────────────────────
export function ProgressBarKpi({
  label,
  value, // e.g., 82 (for 82%)
  unit = '%',
  sub,
  color = C.info,
}: {
  label: string;
  value: number;
  unit?: string;
  sub?: string;
  color?: string;
}) {
  const pct = Math.min(Math.max(value, 0), 100); // Ensure value is between 0 and 100
  return (
    <View style={[s.kpiCard, { borderLeftColor: color, borderLeftWidth: 3 }]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <Text style={s.kpiValue}>{value.toFixed(1)}{unit}</Text>
      </View>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
      <View style={s.progressBarContainer}>
        <MotiView animate={{ width: `${pct}%` }} style={[s.progressBarFill, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Compact Progress Bar ─────────────────────────────────────────────────────
export function CompactProgressBar({ progress, color = C.info, isError }: { progress: number; color?: string; isError?: boolean }) {
  const pct = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={s.compactProgressContainer}>
      <MotiView
        animate={{
          width: `${pct * 100}%`,
          backgroundColor: isError ? C.err : color
        }}
        style={s.compactProgressFill}
      />
    </View>
  );
}

// ─── Animated Page ────────────────────────────────────────────────────────────
export function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 400 }}
      style={{ flex: 1 }}
    >
      {children}
    </MotiView>
  );
}

// ─── Pagination Controls ──────────────────────────────────────────────────────
export function PaginationControls({
  currentPage,
  totalItems,
  limit,
  onPageChange,
  loading = false,
}: {
  currentPage: number;
  totalItems: number;
  limit: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}) {
  const totalPages = Math.ceil(totalItems / limit);
  const from = currentPage * limit + 1;
  const to = Math.min((currentPage + 1) * limit, totalItems);

  if (totalItems <= limit && currentPage === 0) return null;

  return (
    <View style={s.paginationContainer}>
      <View style={s.paginationInfo}>
        <Text style={s.paginationText}>
          Affichage {from}-{to} sur {totalItems}
        </Text>
      </View>
      <View style={s.paginationBtns}>
        <TouchableOpacity
          style={[s.paginationBtn, currentPage === 0 && s.paginationBtnDisabled]}
          onPress={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 0 || loading}
        >
          <MaterialCommunityIcons name="chevron-left" size={24} color={currentPage === 0 ? C.textMuted : C.textPrimary} />
        </TouchableOpacity>
        
        <View style={s.paginationPageCircle}>
           <Text style={s.paginationPageText}>{currentPage + 1}</Text>
        </View>

        <TouchableOpacity
          style={[s.paginationBtn, (currentPage + 1 >= totalPages) && s.paginationBtnDisabled]}
          onPress={() => onPageChange(currentPage + 1)}
          disabled={currentPage + 1 >= totalPages || loading}
        >
          <MaterialCommunityIcons name="chevron-right" size={24} color={currentPage + 1 >= totalPages ? C.textMuted : C.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ExportOverlay({ visible, progress, title = "Génération du rapport PDF..." }: { visible: boolean; progress: number; title?: string }) {
  if (!visible) return null;
  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.9)', zIndex: 1000, justifyContent: 'center', alignItems: 'center' }]}
    >
      <ActivityIndicator size="large" color={C.info} />
      <Text style={{ marginTop: 20, fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>{title}</Text>
      <Text style={{ marginTop: 8, fontSize: 13, color: '#6C757D' }}>{Math.round(progress * 100)}% terminé</Text>
      <View style={{ width: 200, height: 4, backgroundColor: '#E9ECEF', borderRadius: 2, marginTop: 16, overflow: 'hidden' }}>
        <MotiView
          animate={{ width: progress * 200 }}
          style={{ height: '100%', backgroundColor: C.info }}
        />
      </View>
    </MotiView>
  );
}

// ─── Sidebar Item ─────────────────────────────────────────────────────────────
function _SidebarItem({
  label,
  icon,
  active,
  badge,
  isCollapsed,
  onPress,
}: {
  label: string;
  icon: string;
  active?: boolean;
  badge?: string;
  isCollapsed?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[s.sideItem, active && s.sideItemActive, isCollapsed && { justifyContent: 'center', paddingHorizontal: 0 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: isCollapsed ? 0 : 1, justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
        <MaterialCommunityIcons
          name={icon as any}
          size={isCollapsed ? 24 : 20}
          color={active ? '#FFF' : '#AAA'}
        />
        {!isCollapsed && <Text style={[s.sideItemLabel, active && s.sideItemLabelActive]}>{label}</Text>}
      </View>
      {!isCollapsed && badge ? <Badge label={badge} color={active ? C.gold : '#333'} /> : null}
    </Pressable>
  );
}

// ─── Button Enterprise ────────────────────────────────────────────────────────
function _ActionButton({
  label,
  icon,
  onPress,
  variant = 'secondary',
  disabled = false,
  progress,
  isError,
  errorMessage,
  loading,
  color,
}: {
  label: string;
  icon?: string;
  iconOnly?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  progress?: number;
  isError?: boolean;
  errorMessage?: string;
  loading?: boolean;
  compact?: boolean;
  color?: string;
}) {
  const [isHovered, setIsHovered] = React.useState(false);
  const isPri = variant === 'primary';
  const hasProgress = (typeof progress === 'number' && progress > 0 && progress < 1) || (isError && !progress);
  const showTooltip = isHovered && isError && errorMessage;
  const compactIconOnly = !!(iconOnly || (label === '' && icon));

  return (
    <View style={{ position: 'relative' }}>
      <AnimatePresence>
        {showTooltip && (
          <MotiView
            from={{ opacity: 0, translateY: 5, scale: 0.9 }}
            animate={{ opacity: 1, translateY: 0, scale: 1 }}
            exit={{ opacity: 0, translateY: 5, scale: 0.9 }}
            style={s.tooltip}
          >
            <Text style={s.tooltipText}>{errorMessage}</Text>
            <View style={s.tooltipArrow} />
          </MotiView>
        )}
      </AnimatePresence>

      <Pressable
        onPress={onPress}
        onHoverIn={() => setIsHovered(true)}
        onHoverOut={() => setIsHovered(false)}
        disabled={disabled || loading || (hasProgress && !isError)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || loading }}
        style={[
          s.actionBtn,
          isPri ? s.actionBtnPri : s.actionBtnSec,
          color && !isPri ? { borderColor: color } : {},
          (disabled || loading || (hasProgress && !isError)) && { opacity: 0.7 },
          isError && { borderColor: C.err, backgroundColor: '#FFF5F5' },
          { overflow: 'hidden' }
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: (hasProgress || loading) && !isError ? 0.6 : 1 }}>
            {(loading) && <ActivityIndicator size="small" color={isPri ? '#FFF' : (color || C.info)} />}
            {compactIconOnly ? (
              // Icon-only circular button
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isPri ? '#1A1A1A' : '#FFF', borderWidth: 1, borderColor: '#E9ECEF', justifyContent: 'center', alignItems: 'center' }}>
                {icon && (
                  <MaterialCommunityIcons name={isError ? "alert-circle-outline" : icon as any} size={18} color={isPri ? '#FFF' : (color || '#1A1A1A')} />
                )}
              </View>
            ) : (
              <>
                {icon && !hasProgress && !loading && (
                  <MaterialCommunityIcons
                    name={isError ? "alert-circle-outline" : icon as any}
                    size={18}
                    color={isError ? C.err : (isPri ? '#FFF' : (color || '#1A1A1A'))}
                  />
                )}
                <Text style={[
                  s.actionBtnText,
                  isPri ? s.actionBtnTextPri : s.actionBtnTextSec,
                  isError && { color: C.err },
                  color && !isPri && !isError && { color }
                ]}>
                  {isError ? "Échec" : hasProgress ? `${Math.round(progress! * 100)}%` : label}
                </Text>
              </>
            )}
        </View>
        {(hasProgress || isError) && (
          <View style={s.btnProgressContainer}>
            <MotiView
              animate={{
                width: isError ? '100%' : `${progress! * 100}%`,
                backgroundColor: isError ? C.err : (isPri ? '#FFF' : C.info)
              }}
              style={s.btnProgressFill}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

/**
 * Composant de tableau de données standardisé pour l'ERP
 */
export function DataTable<T>({
  data,
  columns,
  onRowPress
}: {
  data: T[];
  columns: {
    key: string;
    label: string;
    flex?: number;
    render?: (item: T) => React.ReactNode
  }[];
  onRowPress?: (item: T) => void;
}) {
  return (
    <View style={[s.tableContainer, { width: '100%' }]}>
      {/* Header */}
      <View style={s.tableHeader}>
        {columns.map(col => (
          <Text key={col.key} style={[s.tableHeaderText, { flex: col.flex || 1 }]}>
            {col.label.toUpperCase()}
          </Text>
        ))}
      </View>
      {/* Rows */}
      <FlatList
        data={data}
        keyExtractor={(item, index) => (item as any).id?.toString() || index.toString()}
        renderItem={({ item, index }) => (
          <TouchableOpacity
            style={s.tableRow}
            onPress={() => onRowPress?.(item)}
            disabled={!onRowPress}
          >
            {columns.map(col => (
              <View
                key={col.key}
                style={{ flex: col.flex || 1, overflow: 'hidden', pointerEvents: col.render ? 'box-none' : 'auto' } as any}
              >
                {col.render
                  ? // pass index as second argument to render functions for advanced usage
                    // (backwards-compatible: render functions that accept one arg will ignore the second)
                    col.render(item, index)
                  : <Text style={s.tableCellText} numberOfLines={2} ellipsizeMode="tail">{String((item as any)[col.key] || '')}</Text>
                }
              </View>
            ))}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFF',
  },
  kpiCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    ...Platform.select({
      web: { boxShadow: '0 2px 4px rgba(0,0,0,0.02)' },
      default: { elevation: 1 }
    }),
  },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  kpiValue: { fontSize: 24, fontWeight: '800', color: C.textPrimary },
  kpiUnit: { fontSize: 14, color: C.textSecondary, fontWeight: '500' },
  kpiSub: { fontSize: 11, color: C.textMuted, marginTop: 4 },

  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  sideItemActive: {
    backgroundColor: '#2A2A2A',
  },
  sideItemLabel: {
    fontSize: 13,
    color: '#AAA',
    fontWeight: '500',
  },
  sideItemLabelActive: {
    color: '#FFF',
    fontWeight: '600',
  },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    gap: 8,
    borderWidth: 1,
  },
  actionBtnPri: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },
  actionBtnSec: {
    backgroundColor: '#FFF',
    borderColor: '#D1D9E0',
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  actionBtnTextPri: { color: '#FFF' },
  actionBtnTextSec: { color: '#1A1A1A' },

  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '700', color: '#495057', marginBottom: 8 },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#D1D9E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#1A1A1A'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 560,
    maxHeight: '92%',
    overflow: 'hidden',
    ...Platform.select({ web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.15)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24 } }),
    elevation: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA'
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  modalBody: { padding: 16 },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F8F9FA'
  },
  tableContainer: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FA',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#E9ECEF',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  compactProgressContainer: { height: 4, backgroundColor: '#E9ECEF', borderRadius: 2, overflow: 'hidden', width: '100%' },
  compactProgressFill: { height: '100%' },
  btnProgressContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.05)' },
  btnProgressFill: { height: '100%' },

  tooltip: {
    position: 'absolute',
    bottom: '125%',
    left: '50%',
    marginLeft: -100,
    width: 200,
    backgroundColor: '#1A1A1A',
    padding: 10,
    borderRadius: 8,
    zIndex: 2000,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
      default: { elevation: 5 }
    })
  },
  tooltipText: { color: '#FFF', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  tooltipArrow: { position: 'absolute', top: '100%', left: '50%', marginLeft: -6, width: 0, height: 0, borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 6, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: '#1A1A1A' },

  tableHeaderText: { fontSize: 12, fontWeight: '800', color: '#6C757D', letterSpacing: 0.5 },
  tableHeaderText: { fontSize: 11, fontWeight: '800', color: '#6C757D', letterSpacing: 0.5 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
    alignItems: 'center',
  },
  tableCellText: { fontSize: 13, color: '#1A1A1A', fontWeight: '500' },
  tableHeaderText: { fontSize: 11, fontWeight: '800', color: '#6C757D', letterSpacing: 0.5 },
  
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    backgroundColor: '#FFF',
  },
  paginationInfo: { flex: 1 },
  paginationText: { fontSize: 12, color: '#6C757D', fontWeight: '500' },
  paginationBtns: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  paginationBtn: {
    padding: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D9E0',
    backgroundColor: '#FFF',
  },
  paginationBtnDisabled: {
    opacity: 0.4,
    backgroundColor: '#F8F9FA',
  },
  paginationPageCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paginationPageText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
});

// ─── Form Components ──────────────────────────────────────────────────────────

function _FormInput({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  editable = true,
  style,
  multiline,
  secureTextEntry,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'decimal-pad' | 'phone-pad' | 'number-pad';
  editable?: boolean;
  style?: any;
  multiline?: boolean;
  secureTextEntry?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={s.formGroup}>
      <Text style={s.formLabel}>{label}</Text>
      <TextInput
        style={[s.input, style, !editable && { backgroundColor: '#F8F9FA', color: '#6C757D' }, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#ADB5BD"
        keyboardType={keyboardType}
        editable={editable}
        multiline={multiline}
        secureTextEntry={secureTextEntry}
        autoFocus={autoFocus}
      />
    </View>
  );
}

export function FormModal({
  visible,
  title,
  onClose,
  onSave,
  children,
  loading = false,
  hideSaveButton = false,
  isError,
  errorMessage,
  saveLabel = "Enregistrer"
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  children: React.ReactNode;
  loading?: boolean;
  hideSaveButton?: boolean;
  isError?: boolean;
  errorMessage?: string;
  saveLabel?: string;
}) {
  const { width } = useWindowDimensions();
  const isMobile = width < 480;
  return (
    <Modal visible={visible} transparent animationType={isMobile ? 'slide' : 'fade'}>
      <View style={[s.modalOverlay, isMobile && { justifyContent: 'flex-end', padding: 0 }]}>
        <View style={[
          s.modalContent,
          isMobile && { borderRadius: 0, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxWidth: '100%', maxHeight: '95%' },
        ]}>
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, isMobile && { fontSize: 16 }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#6C757D" />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.modalBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>

          <View style={s.modalFooter}>
            <ActionButton label="Annuler" onPress={onClose} />
            {!hideSaveButton && (
              <ActionButton
                label={loading ? "Enregistrement..." : saveLabel}
                variant="primary"
                onPress={onSave}
                disabled={loading}
                isError={isError}
                errorMessage={errorMessage}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function FormSelect({
  label,
  value,
  options,
  onSelect,
  searchable = false,
  emptyMessage,
  placeholder: _placeholder,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (val: string) => void;
  searchable?: boolean;
  emptyMessage?: React.ReactNode;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [dropdownPos, setDropdownPos] = React.useState({ top: 0, left: 0, width: 0 });
  const triggerRef = React.useRef<any>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const selectedLabel = options.find(o => o.value === value)?.label || 'Sélectionner...';
  const filtered = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const handleOpen = () => {
    if (open) { setOpen(false); return; }
    if (Platform.OS === 'web') {
      const rect = (triggerRef.current as any)?.getBoundingClientRect?.();
      if (rect) {
        const dropH = Math.min(260, filtered.length * 44 + (searchable ? 48 : 0) + 16);
        const spaceBelow = screenHeight - rect.bottom;
        const top = spaceBelow >= dropH ? rect.bottom + 4 : rect.top - dropH - 4;
        setDropdownPos({ top, left: rect.left, width: rect.width });
        setOpen(true);
        setSearch('');
      }
    } else {
      triggerRef.current?.measure((_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
        const dropH = Math.min(260, filtered.length * 44 + (searchable ? 48 : 0) + 16);
        const spaceBelow = screenHeight - py - h;
        const top = spaceBelow >= dropH ? py + h + 4 : py - dropH - 4;
        setDropdownPos({ top, left: px, width: w });
        setOpen(true);
        setSearch('');
      });
    }
  };

  return (
    <View style={s.formGroup}>
      <Text style={s.formLabel}>{label}</Text>
      <TouchableOpacity
        ref={triggerRef}
        style={[s.input, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Text style={{ fontSize: 14, color: value ? '#1A1A1A' : '#ADB5BD', flex: 1 }} numberOfLines={1}>
          {selectedLabel}
        </Text>
        <MaterialCommunityIcons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6C757D"
        />
      </TouchableOpacity>

      {/* Dropdown rendu dans un Modal pour éviter le clipping de overflow:hidden */}
      <Modal visible={open} transparent animationType="none" onRequestClose={() => setOpen(false)}>
        {/* Overlay transparent pour fermer en cliquant dehors */}
        <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)}>
          <View
            style={{
              position: 'absolute',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              backgroundColor: '#FFF',
              borderWidth: 1,
              borderColor: '#D1D9E0',
              borderRadius: 8,
              maxHeight: 260,
              ...Platform.select({ web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.12)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 } }),
              elevation: 8,
            }}
          >
            <Pressable onPress={e => e.stopPropagation?.()}>
              {searchable && (
                <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E9ECEF', paddingHorizontal: 10, backgroundColor: '#F8F9FA', borderTopLeftRadius: 8, borderTopRightRadius: 8 }}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#ADB5BD" />
                  <TextInput
                    style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 8, fontSize: 13, color: '#1A1A1A' }}
                    placeholder="Rechercher..."
                    placeholderTextColor="#ADB5BD"
                    value={search}
                    onChangeText={setSearch}
                    autoFocus
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#ADB5BD" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <FlatList
                style={Platform.OS === 'web' ? { overflowY: 'auto', overflowX: 'hidden', flex: 1, maxHeight: 260 } as any : { flex: 1, maxHeight: 260 }}
                showsVerticalScrollIndicator={true}
                data={filtered}
                keyExtractor={item => item.value}
                keyboardShouldPersistTaps="always"
                ListEmptyComponent={
                  emptyMessage
                    ? <View style={{ padding: 14 }}>{emptyMessage}</View>
                    : <Text style={{ padding: 14, color: '#ADB5BD', fontSize: 13, fontStyle: 'italic' }}>Aucun résultat</Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      backgroundColor: item.value === value ? '#F0F4FF' : '#FFF',
                      borderBottomWidth: 1,
                      borderBottomColor: '#F1F3F5',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onPress={() => { onSelect(item.value); setOpen(false); setSearch(''); }}
                  >
                    <View style={{ width: 16, alignItems: 'center' }}>
                      {item.value === value && (
                        <MaterialCommunityIcons name="check" size={16} color={C.info} />
                      )}
                    </View>
                    <Text style={{
                      fontSize: 13,
                      color: item.value === value ? C.info : '#1A1A1A',
                      fontWeight: item.value === value ? '700' : '400',
                      flex: 1,
                    }}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

export function FormDatePicker({
  label,
  value,
  onChangeDate,
}: {
  label: string;
  value: string;
  onChangeDate: (date: string) => void;
}) {
  const showPicker = () => {
    if (Platform.OS === 'web') {
      // On web, we use the native date input via a hidden input trick
      const input = document.createElement('input');
      input.type = 'date';
      input.value = value || new Date().toISOString().split('T')[0];
      input.style.position = 'fixed';
      input.style.top = '-100px';
      document.body.appendChild(input);
      input.addEventListener('change', (e) => {
        onChangeDate((e.target as HTMLInputElement).value);
        document.body.removeChild(input);
      });
      input.addEventListener('blur', () => {
        setTimeout(() => { if (document.body.contains(input)) document.body.removeChild(input); }, 200);
      });
      input.showPicker?.();
      input.focus();
    }
  };

  return (
    <View style={s.formGroup}>
      <Text style={s.formLabel}>{label}</Text>
      <TouchableOpacity
        style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
        onPress={showPicker}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="calendar" size={18} color="#6C757D" />
        <Text style={{ fontSize: 14, color: value ? '#1A1A1A' : '#ADB5BD', flex: 1 }}>
          {value ? new Date(value + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Sélectionner une date...'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

export { SectionTitle, Card, Kpi, Divider, InfoRow, LotRow, StepperRow, Button, CqStatus } from './Ui_legacy'; // Ensure SectionTitle is exported


// ─── Performance: memoized re-exports for list rendering ───────────────────
export const Badge = React.memo(_Badge);
export const KpiCard = React.memo(_KpiCard);
export const ActionButton = React.memo(_ActionButton);
export const SidebarItem = React.memo(_SidebarItem);
export const FormInput = React.memo(_FormInput);

// ─── ConfirmDialog — Modale de confirmation professionnelle ──────────────────
// Remplace window.confirm() (popup Chrome) et Alert.alert() sur web.
// Usage : importer ConfirmDialog dans AppShell et confirmShow() partout.

type ConfirmState = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  danger?: boolean;
};

const _confirmListeners: Array<(state: ConfirmState) => void> = [];

/** Déclenche la modale depuis n'importe où (sans hook ni prop drilling). */
export function confirmShow(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  danger = true
): void {
  _confirmListeners.forEach(fn =>
    fn({ visible: true, title, message, onConfirm, onCancel, danger })
  );
}

/** À placer UNE SEULE FOIS dans le layout racine (AppShell / _layout). */
export function ConfirmDialog() {
  const [state, setState] = React.useState<ConfirmState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
    danger: true,
  });

  React.useEffect(() => {
    const handler = (s: ConfirmState) => setState(s);
    _confirmListeners.push(handler);
    return () => {
      const idx = _confirmListeners.indexOf(handler);
      if (idx !== -1) _confirmListeners.splice(idx, 1);
    };
  }, []);

  const close = () => setState(prev => ({ ...prev, visible: false }));

  const handleConfirm = () => {
    close();
    setTimeout(() => state.onConfirm(), 50);
  };

  const handleCancel = () => {
    close();
    setTimeout(() => state.onCancel?.(), 50);
  };

  if (Platform.OS !== 'web') {
    // Sur native, on utilise Alert.alert natif (géré côté hooks.ts)
    return null;
  }

  if (!state.visible) return null;

  // Rendu web : modale centrée full-screen avec backdrop
  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={cdStyles.backdrop}>
        <View style={cdStyles.card}>
          {/* Icône */}
          <View style={[cdStyles.iconCircle, { backgroundColor: state.danger ? '#FEE2E2' : '#EEF2FF' }]}>
            <MaterialCommunityIcons
              name={state.danger ? 'alert-circle-outline' : 'help-circle-outline'}
              size={32}
              color={state.danger ? '#DC2626' : '#4F46E5'}
            />
          </View>

          {/* Titre */}
          <Text style={cdStyles.title}>{state.title}</Text>

          {/* Message */}
          <Text style={cdStyles.message}>{state.message}</Text>

          {/* Boutons */}
          <View style={cdStyles.btnRow}>
            <Pressable style={cdStyles.btnCancel} onPress={handleCancel}>
              <Text style={cdStyles.btnCancelText}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[cdStyles.btnConfirm, { backgroundColor: state.danger ? '#DC2626' : '#4F46E5' }]}
              onPress={handleConfirm}
            >
              <Text style={cdStyles.btnConfirmText}>Confirmer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const cdStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    ...Platform.select({ web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.18)' }, default: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24 } }),
    elevation: 12,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  btnConfirm: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
