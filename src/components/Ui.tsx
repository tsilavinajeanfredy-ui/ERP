import * as React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  Modal,
  TextInput,
  ScrollView,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  Animated,
  Easing,
} from 'react-native';
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

/** Remplace les underscores par des espaces pour l'affichage des valeurs enum en front */
export const formatEnum = (value: string | null | undefined): string =>
  value ? String(value).replace(/_/g, ' ') : '';

// ─── Loading Spinner (équivalent natif du style "snow-ball") ───────────────────
// Anneau fixe + bille qui orbite en continu. Conçu comme remplaçant direct de
// <ActivityIndicator size color /> partout dans l'app (mêmes props acceptées).
export function LoadingSpinner({
  size = 'large',
  color = C.green,
}: {
  size?: 'small' | 'large' | number;
  color?: string;
}) {
  const spin = React.useRef(new Animated.Value(0)).current;
  const dim = typeof size === 'number' ? size : size === 'small' ? 22 : 42;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ballSize = Math.max(4, dim * 0.22);
  const ringWidth = Math.max(2, dim * 0.08);

  return (
    <View style={{ width: dim, height: dim, alignItems: 'center', justifyContent: 'center' }}>
      {/* Anneau / piste fixe */}
      <View
        style={{
          position: 'absolute',
          width: dim,
          height: dim,
          borderRadius: dim / 2,
          borderWidth: ringWidth,
          borderColor: color + '30',
        }}
      />
      {/* Bille orbitale */}
      <Animated.View style={{ width: dim, height: dim, transform: [{ rotate }] }}>
        <View
          style={{
            position: 'absolute',
            top: -ballSize / 2,
            left: dim / 2 - ballSize / 2,
            width: ballSize,
            height: ballSize,
            borderRadius: ballSize / 2,
            backgroundColor: color,
            ...Platform.select({
              web: { boxShadow: `0 0 ${ballSize}px ${color}66` },
              default: {
                shadowColor: color,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: ballSize / 2,
                elevation: 4,
              },
            }),
          }}
        />
      </Animated.View>
    </View>
  );
}

function _Badge({ label, color = C.gold }: { label: string; color?: string }) {
  const displayLabel = label ? String(label).replace(/_/g, ' ') : '';
  return (
    <View style={[s.badge, { backgroundColor: color }]}>
      <Text style={s.badgeText}>{displayLabel}</Text>
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
          style={{
            height: 14,
            width: '60%',
            backgroundColor: '#EEE',
            borderRadius: 4,
            marginBottom: 12,
          }}
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
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}: ${value}${sub ? ', ' + sub : ''}`}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={s.kpiLabel}>{label}</Text>
        {icon && (
          <MaterialCommunityIcons name={icon as any} size={18} color={color} opacity={0.5} />
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <Text style={s.kpiValue}>{value}</Text>
        {sub?.includes('%') || sub?.includes('lots') ? null : (
          <Text style={s.kpiUnit}>{sub?.split(' ')[1]}</Text>
        )}
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
        <Text style={s.kpiValue}>
          {value.toFixed(1)}
          {unit}
        </Text>
      </View>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
      <View style={s.progressBarContainer}>
        <MotiView
          animate={{ width: `${pct}%` }}
          style={[s.progressBarFill, { backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

// ─── Compact Progress Bar ─────────────────────────────────────────────────────
export function CompactProgressBar({
  progress,
  color = C.info,
  isError,
}: {
  progress: number;
  color?: string;
  isError?: boolean;
}) {
  const pct = Math.min(Math.max(progress, 0), 1);
  return (
    <View style={s.compactProgressContainer}>
      <MotiView
        animate={{
          width: `${pct * 100}%`,
          backgroundColor: isError ? C.err : color,
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
          <MaterialCommunityIcons
            name="chevron-left"
            size={24}
            color={currentPage === 0 ? C.textMuted : C.textPrimary}
          />
        </TouchableOpacity>

        <View style={s.paginationPageCircle}>
          <Text style={s.paginationPageText}>{currentPage + 1}</Text>
        </View>

        <TouchableOpacity
          style={[s.paginationBtn, currentPage + 1 >= totalPages && s.paginationBtnDisabled]}
          onPress={() => onPageChange(currentPage + 1)}
          disabled={currentPage + 1 >= totalPages || loading}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={currentPage + 1 >= totalPages ? C.textMuted : C.textPrimary}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ExportOverlay({
  visible,
  progress,
  title = 'Génération du rapport PDF...',
}: {
  visible: boolean;
  progress: number;
  title?: string;
}) {
  if (!visible) return null;
  return (
    <MotiView
      from={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: 'rgba(255,255,255,0.9)',
          zIndex: 1000,
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}
    >
      <LoadingSpinner size="large" color={C.info} />
      <Text style={{ marginTop: 20, fontSize: 16, fontWeight: '700', color: '#1A1A1A' }}>
        {title}
      </Text>
      <Text style={{ marginTop: 8, fontSize: 13, color: '#6C757D' }}>
        {Math.round(progress * 100)}% terminé
      </Text>
      <View
        style={{
          width: 200,
          height: 4,
          backgroundColor: '#E9ECEF',
          borderRadius: 2,
          marginTop: 16,
          overflow: 'hidden',
        }}
      >
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
  const hasBadge = !!badge;
  return (
    <Pressable
      onPress={onPress}
      style={[
        s.sideItem,
        active && s.sideItemActive,
        isCollapsed && { justifyContent: 'center', paddingHorizontal: 0 },
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          flex: isCollapsed ? 0 : 1,
          justifyContent: isCollapsed ? 'center' : 'flex-start',
        }}
      >
        {/* Icône avec point rouge si collapsed + badge */}
        <View style={{ position: 'relative' }}>
          <MaterialCommunityIcons
            name={icon as any}
            size={isCollapsed ? 24 : 20}
            color={active ? '#FFF' : hasBadge ? '#E8C870' : '#AAA'}
          />
          {isCollapsed && hasBadge && (
            <View style={{
              position: 'absolute', top: -3, right: -4,
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: C.gold, borderWidth: 1, borderColor: '#111',
            }} />
          )}
        </View>
        {!isCollapsed && (
          <Text style={[s.sideItemLabel, active && s.sideItemLabelActive, hasBadge && !active && s.sideItemLabelBadge]}>{label}</Text>
        )}
      </View>
      {!isCollapsed && badge ? <Badge label={badge} color={active ? C.gold : '#444'} /> : null}
    </Pressable>
  );
}

// ─── Button Enterprise ────────────────────────────────────────────────────────
function _ActionButton({
  label,
  icon,
  iconOnly,
  compact,
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
  compact?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  progress?: number;
  isError?: boolean;
  errorMessage?: string;
  loading?: boolean;
  color?: string;
}) {
  const [isHovered, setIsHovered] = React.useState(false);
  const isPri = variant === 'primary';
  const hasProgress =
    (typeof progress === 'number' && progress > 0 && progress < 1) || (isError && !progress);
  const showTooltip = isHovered && isError && errorMessage;
  const compactIconOnly = !!(compact || iconOnly || (label === '' && icon));

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
          compactIconOnly && {
            minWidth: 0,
            paddingHorizontal: 6,
            paddingVertical: 6,
            width: 42,
            height: 42,
            justifyContent: 'center',
            alignItems: 'center',
          },
          { overflow: 'hidden' },
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            opacity: (hasProgress || loading) && !isError ? 0.6 : 1,
          }}
        >
          {loading && <LoadingSpinner size="small" color={isPri ? "#FFF" : color || C.info} />}
          {compactIconOnly ? (
            // Icon-only circular button
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isPri ? '#1A1A1A' : '#FFF',
                borderWidth: 1,
                borderColor: '#E9ECEF',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {icon && (
                <MaterialCommunityIcons
                  name={isError ? 'alert-circle-outline' : (icon as any)}
                  size={18}
                  color={isPri ? '#FFF' : color || '#1A1A1A'}
                />
              )}
            </View>
          ) : (
            <>
              {icon && !hasProgress && !loading && (
                <MaterialCommunityIcons
                  name={isError ? 'alert-circle-outline' : (icon as any)}
                  size={18}
                  color={isError ? C.err : isPri ? '#FFF' : color || '#1A1A1A'}
                />
              )}
              <Text
                style={[
                  s.actionBtnText,
                  isPri ? s.actionBtnTextPri : s.actionBtnTextSec,
                  isError && { color: C.err },
                  color && !isPri && !isError && { color },
                ]}
              >
                {isError ? 'Échec' : hasProgress ? `${Math.round(progress! * 100)}%` : label}
              </Text>
            </>
          )}
        </View>
        {(hasProgress || isError) && (
          <View style={s.btnProgressContainer}>
            <MotiView
              animate={{
                width: isError ? '100%' : `${progress! * 100}%`,
                backgroundColor: isError ? C.err : isPri ? '#FFF' : C.info,
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
  onRowPress,
}: {
  data: T[];
  columns: {
    key: string;
    label: string;
    flex?: number;
    render?: (item: T, index?: number) => React.ReactNode;
  }[];
  onRowPress?: (item: T) => void;
}) {
  return (
    <View style={[s.tableContainer, { width: '100%' }]}>
      {/* Header */}
      <View style={s.tableHeader}>
        {columns.map((col) => (
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
            {columns.map((col) => (
              <View
                key={col.key}
                style={
                  {
                    flex: col.flex || 1,
                    overflow: 'hidden',
                    pointerEvents: col.render ? 'box-none' : 'auto',
                  } as any
                }
              >
                {col.render ? (
                  col.render(item, index)
                ) : (
                  <Text style={s.tableCellText} numberOfLines={2} ellipsizeMode="tail">
                    {String((item as any)[col.key] || '').replace(/_/g, ' ')}
                  </Text>
                )}
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
      default: { elevation: 1 },
    }),
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
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
  sideItemLabelBadge: {
    color: '#E8C870',
    fontWeight: '700',
  },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8,
    borderWidth: 1,
    minHeight: 44,
    minWidth: 88,
    flexShrink: 1,
  },
  actionBtnPri: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },
  actionBtnSec: {
    backgroundColor: '#FFF',
    borderColor: '#D1D9E0',
    ...Platform.select({
      web: { boxShadow: '0px 2px 6px rgba(15,23,42,0.04)' },
      default: {
        shadowColor: '#0F172A',
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      },
    }),
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'center',
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
    color: '#1A1A1A',
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
    ...Platform.select({
      web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.15)' },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F8F9FA',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  modalBody: { padding: 16, flex: 1 },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F8F9FA',
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
  compactProgressContainer: {
    height: 4,
    backgroundColor: '#E9ECEF',
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  compactProgressFill: { height: '100%' },
  btnProgressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
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
      default: { elevation: 5 },
    }),
  },
  tooltipText: { color: '#FFF', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  tooltipArrow: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#1A1A1A',
  },

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
  keyboardType?:
    | 'default'
    | 'numeric'
    | 'email-address'
    | 'decimal-pad'
    | 'phone-pad'
    | 'number-pad';
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
        style={[
          s.input,
          style,
          !editable && { backgroundColor: '#F8F9FA', color: '#6C757D' },
          multiline && { minHeight: 80, textAlignVertical: 'top' },
          Platform.OS === 'web' && ({ outlineStyle: 'none', cursor: editable ? 'text' : 'default', pointerEvents: editable ? 'auto' : 'none' } as any),
        ]}
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
  saveLabel = 'Enregistrer',
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
        <View
          style={[
            s.modalContent,
            isMobile && {
              borderRadius: 0,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxWidth: '100%',
              maxHeight: '95%',
            },
          ]}
        >
          <View style={s.modalHeader}>
            <Text style={[s.modalTitle, isMobile && { fontSize: 16 }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#6C757D" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={s.modalBody}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {children}
          </ScrollView>

          <View style={s.modalFooter}>
            <ActionButton label="Annuler" onPress={onClose} />
            {!hideSaveButton && (
              <ActionButton
                label={loading ? 'Enregistrement...' : saveLabel}
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

  const uniqueOptions = React.useMemo(() => {
    const seen = new Set<string>();
    return options.filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    });
  }, [options]);

  const selectedLabel =
    uniqueOptions.find((o) => o.value === value)?.label || _placeholder || 'Sélectionner...';
  const filtered =
    searchable && search
      ? uniqueOptions.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
      : uniqueOptions;

  const handleOpen = () => {
    if (open) {
      setOpen(false);
      return;
    }
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
      triggerRef.current?.measure(
        (_fx: number, _fy: number, w: number, h: number, px: number, py: number) => {
          const dropH = Math.min(260, filtered.length * 44 + (searchable ? 48 : 0) + 16);
          const spaceBelow = screenHeight - py - h;
          const top = spaceBelow >= dropH ? py + h + 4 : py - dropH - 4;
          setDropdownPos({ top, left: px, width: w });
          setOpen(true);
          setSearch('');
        },
      );
    }
  };

  return (
    <View style={s.formGroup}>
      <Text style={s.formLabel}>{label}</Text>
      <TouchableOpacity
        ref={triggerRef}
        style={[
          s.input,
          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
        ]}
        onPress={handleOpen}
        activeOpacity={0.7}
      >
        <Text
          style={{ fontSize: 14, color: value ? '#1A1A1A' : '#ADB5BD', flex: 1 }}
          numberOfLines={1}
        >
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
              ...Platform.select({
                web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.12)' },
                default: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  elevation: 8,
                },
              }),
            }}
          >
            <Pressable onPress={(e) => e.stopPropagation?.()}>
              {searchable && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderBottomWidth: 1,
                    borderBottomColor: '#E9ECEF',
                    paddingHorizontal: 10,
                    backgroundColor: '#F8F9FA',
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                  }}
                >
                  <MaterialCommunityIcons name="magnify" size={18} color="#ADB5BD" />
                  <TextInput
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      paddingHorizontal: 8,
                      fontSize: 13,
                      color: '#1A1A1A',
                    }}
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
                style={
                  Platform.OS === 'web'
                    ? ({ overflowY: 'auto', overflowX: 'hidden', flex: 1, maxHeight: 260 } as any)
                    : { flex: 1, maxHeight: 260 }
                }
                showsVerticalScrollIndicator={true}
                data={filtered}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="always"
                ListEmptyComponent={
                  emptyMessage ? (
                    <View style={{ padding: 14 }}>{emptyMessage}</View>
                  ) : (
                    <Text
                      style={{ padding: 14, color: '#ADB5BD', fontSize: 13, fontStyle: 'italic' }}
                    >
                      Aucun résultat
                    </Text>
                  )
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
                    onPress={() => {
                      onSelect(item.value);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    <View style={{ width: 16, alignItems: 'center' }}>
                      {item.value === value && (
                        <MaterialCommunityIcons name="check" size={16} color={C.info} />
                      )}
                    </View>
                    <Text
                      style={{
                        fontSize: 13,
                        color: item.value === value ? C.info : '#1A1A1A',
                        fontWeight: item.value === value ? '700' : '400',
                        flex: 1,
                      }}
                    >
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
  const inputRef = React.useRef<any>(null);

  const handlePress = () => {
    if (Platform.OS === 'web' && inputRef.current) {
      if (typeof inputRef.current.showPicker === 'function') {
        inputRef.current.showPicker();
      } else {
        inputRef.current.focus();
      }
    }
  };

  return (
    <View style={s.formGroup}>
      <Text style={s.formLabel}>{label}</Text>
      <View style={{ position: 'relative' }}>
        <TouchableOpacity
          style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="calendar" size={18} color="#6C757D" />
          <Text style={{ fontSize: 14, color: value ? '#1A1A1A' : '#ADB5BD', flex: 1 }}>
            {value
              ? new Date(value + 'T00:00:00').toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })
              : 'Sélectionner une date...'}
          </Text>
        </TouchableOpacity>
        {Platform.OS === 'web' &&
          React.createElement('input', {
            ref: inputRef,
            type: 'date',
            value: value || '',
            onChange: (e: any) => onChangeDate(e.target.value),
            style: {
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '1px',
              height: '1px',
              opacity: 0,
              pointerEvents: 'none',
              border: 'none',
              padding: 0,
            },
          })}
      </View>
    </View>
  );
}

export {
  SectionTitle,
  Card,
  Kpi,
  Divider,
  InfoRow,
  LotRow,
  StepperRow,
  Button,
  CqStatus,
} from './Ui_legacy'; // Ensure SectionTitle is exported

// ─── Performance: memoized re-exports for list rendering ───────────────────
export const Badge = React.memo(_Badge);
export const KpiCard = React.memo(_KpiCard);
export const ActionButton = React.memo(_ActionButton);
export const SidebarItem = React.memo(_SidebarItem);
export const FormInput = React.memo(_FormInput);

// ─── ConfirmDialog — Modale de confirmation avec variantes sémantiques ────────
// Remplace window.confirm() (popup Chrome) et Alert.alert() sur web.
// Usage : importer ConfirmDialog dans AppShell et confirmShow() partout.
// VARIANTES : 'danger' | 'success' | 'warning' | 'info'
//
// Chaque variante possède :
//   • Un SVG illustratif custom (pas juste une icône)
//   • Un ring d'animation Animated sur l'icône principale
//   • Une palette de couleurs cohérente (bg, border, button)
//   • Un libellé de bouton sémantique

export type ConfirmVariant = 'danger' | 'success' | 'warning' | 'info';

type VariantConfig = {
  // Couleurs
  outerRing: string;   // anneau externe (opacity basse)
  innerRing: string;   // anneau interne
  iconBg: string;      // fond cercle icône
  iconColor: string;   // couleur icône
  borderTop: string;   // liseré coloré en haut de la card
  buttonBg: string;    // fond bouton confirm
  buttonHover: string; // fond bouton au hover
  // Textes
  buttonText: string;
  cancelText: string;
  // Icône MCI
  icon: string;
  // SVG paths inline (dessin custom dans le cercle)
  svgType: 'trash' | 'check' | 'warning' | 'info';
};

const VARIANT_CONFIGS: Record<ConfirmVariant, VariantConfig> = {
  danger: {
    outerRing:   'rgba(220,38,38,0.10)',
    innerRing:   'rgba(220,38,38,0.22)',
    iconBg:      '#FEE2E2',
    iconColor:   '#DC2626',
    borderTop:   '#DC2626',
    buttonBg:    '#DC2626',
    buttonHover: '#B91C1C',
    buttonText:  'Supprimer',
    cancelText:  'Annuler',
    icon:        'delete-outline',
    svgType:     'trash',
  },
  success: {
    outerRing:   'rgba(22,163,74,0.10)',
    innerRing:   'rgba(22,163,74,0.22)',
    iconBg:      '#DCFCE7',
    iconColor:   '#16A34A',
    borderTop:   '#16A34A',
    buttonBg:    '#16A34A',
    buttonHover: '#15803D',
    buttonText:  'Valider',
    cancelText:  'Annuler',
    icon:        'check-circle-outline',
    svgType:     'check',
  },
  warning: {
    outerRing:   'rgba(217,119,6,0.10)',
    innerRing:   'rgba(217,119,6,0.22)',
    iconBg:      '#FEF3C7',
    iconColor:   '#D97706',
    borderTop:   '#D97706',
    buttonBg:    '#D97706',
    buttonHover: '#B45309',
    buttonText:  'Confirmer',
    cancelText:  'Annuler',
    icon:        'alert-outline',
    svgType:     'warning',
  },
  info: {
    outerRing:   'rgba(79,70,229,0.10)',
    innerRing:   'rgba(79,70,229,0.22)',
    iconBg:      '#EEF2FF',
    iconColor:   '#4F46E5',
    borderTop:   '#4F46E5',
    buttonBg:    '#4F46E5',
    buttonHover: '#4338CA',
    buttonText:  'Confirmer',
    cancelText:  'Annuler',
    icon:        'information-outline',
    svgType:     'info',
  },
};

// ─── SVG custom par variante ───────────────────────────────────────────────────
// Rendu en JSX natif via View+Animated pour éviter react-native-svg
// Sur web, on injecte du SVG HTML brut dans un composant dédié
function ConfirmSvgIcon({ svgType, color, size = 32 }: { svgType: VariantConfig['svgType']; color: string; size?: number }) {
  // Utilisation de MaterialCommunityIcons enrichi avec un ring animé
  // L'effet visuel custom est porté par les rings concentriques animés
  const iconName: Record<VariantConfig['svgType'], string> = {
    trash:   'trash-can-outline',
    check:   'check-circle-outline',
    warning: 'alert-rhombus-outline',
    info:    'help-circle-outline',
  };
  return (
    <MaterialCommunityIcons
      name={iconName[svgType] as any}
      size={size}
      color={color}
    />
  );
}

// ─── Rings animés autour de l'icône ──────────────────────────────────────────
function PulseRings({ config }: { config: VariantConfig }) {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 600, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
    return () => pulse.stopAnimation();
  }, []);

  const outerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.12] });
  const outerOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.6, 1, 0.4] });
  const innerScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.06] });
  const innerOpacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1, 0.5] });

  return (
    <View style={cdStyles.ringsWrapper}>
      {/* Anneau externe */}
      <Animated.View style={[
        cdStyles.ring, cdStyles.ringOuter,
        { backgroundColor: config.outerRing, transform: [{ scale: outerScale }], opacity: outerOpacity }
      ]} />
      {/* Anneau interne */}
      <Animated.View style={[
        cdStyles.ring, cdStyles.ringInner,
        { backgroundColor: config.innerRing, transform: [{ scale: innerScale }], opacity: innerOpacity }
      ]} />
      {/* Cercle central avec icône */}
      <View style={[cdStyles.iconCircle, { backgroundColor: config.iconBg }]}>
        <ConfirmSvgIcon svgType={config.svgType} color={config.iconColor} size={32} />
      </View>
    </View>
  );
}

type ConfirmState = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  variant: ConfirmVariant;
  confirmLabel?: string;
  cancelLabel?: string;
};

const _confirmListeners: Array<(state: ConfirmState) => void> = [];

/** Déclenche la modale depuis n'importe où avec variante sémantique. */
export function confirmShow(
  title: string,
  message: string,
  onConfirm: () => void,
  variant: ConfirmVariant = 'danger',
  onCancel?: () => void,
  confirmLabel?: string,
  cancelLabel?: string,
): void {
  _confirmListeners.forEach((fn) =>
    fn({ visible: true, title, message, onConfirm, onCancel, variant, confirmLabel, cancelLabel }),
  );
}

/** RÉTRO-COMPATIBILITÉ : Ancienne API avec danger boolean */
export function confirmShowLegacy(
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  danger = true,
): void {
  const variant: ConfirmVariant = danger ? 'danger' : 'info';
  confirmShow(title, message, onConfirm, variant, onCancel);
}

/** À placer UNE SEULE FOIS dans le layout racine (AppShell / _layout). */
export function ConfirmDialog() {
  const [state, setState] = React.useState<ConfirmState>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger',
  });

  // Animation d'entrée de la card
  const cardScale = React.useRef(new Animated.Value(0.88)).current;
  const cardOpacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const handler = (s: ConfirmState) => setState(s);
    _confirmListeners.push(handler);
    return () => {
      const idx = _confirmListeners.indexOf(handler);
      if (idx !== -1) _confirmListeners.splice(idx, 1);
    };
  }, []);

  React.useEffect(() => {
    if (state.visible) {
      Animated.parallel([
        Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 18 }),
        Animated.timing(cardOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      cardScale.setValue(0.88);
      cardOpacity.setValue(0);
    }
  }, [state.visible]);

  const close = () => setState((prev) => ({ ...prev, visible: false }));

  const handleConfirm = () => {
    close();
    setTimeout(() => state.onConfirm(), 60);
  };

  const handleCancel = () => {
    close();
    setTimeout(() => state.onCancel?.(), 60);
  };

  if (Platform.OS !== 'web') return null;
  if (!state.visible) return null;

  const config = VARIANT_CONFIGS[state.variant];
  const confirmLabel = state.confirmLabel ?? config.buttonText;
  const cancelLabel  = state.cancelLabel  ?? config.cancelText;

  return (
    <Modal visible={state.visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={cdStyles.backdrop}>
        <Animated.View style={[
          cdStyles.card,
          { transform: [{ scale: cardScale }], opacity: cardOpacity }
        ]}>
          {/* Liseré coloré en haut */}
          <View style={[cdStyles.topBar, { backgroundColor: config.borderTop }]} />

          {/* Rings + Icône animée */}
          <View style={{ marginTop: 28, marginBottom: 20 }}>
            <PulseRings config={config} />
          </View>

          {/* Titre */}
          <Text style={cdStyles.title}>{state.title}</Text>

          {/* Message */}
          <Text style={cdStyles.message}>{state.message}</Text>

          {/* Séparateur */}
          <View style={cdStyles.separator} />

          {/* Boutons */}
          <View style={cdStyles.btnRow}>
            {cancelLabel !== '' && (
              <Pressable style={cdStyles.btnCancel} onPress={handleCancel}>
                <Text style={cdStyles.btnCancelText}>{cancelLabel}</Text>
              </Pressable>
            )}
            <Pressable
              style={[cdStyles.btnConfirm, { backgroundColor: config.buttonBg }, cancelLabel === '' && { flex: 1 }]}
              onPress={handleConfirm}
            >
              <MaterialCommunityIcons
                name={config.icon as any}
                size={16}
                color="#FFF"
                style={{ marginRight: 6 }}
              />
              <Text style={cdStyles.btnConfirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const cdStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.50)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0px 20px 48px rgba(0,0,0,0.22)' } as any,
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.22,
        shadowRadius: 32,
        elevation: 16,
      },
    }),
  },
  topBar: {
    width: '100%',
    height: 5,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  // ─── Rings concentriques ───
  ringsWrapper: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
  },
  ringOuter: {
    width: 100,
    height: 100,
  },
  ringInner: {
    width: 80,
    height: 80,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ─── Textes ───
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  message: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 28,
    marginBottom: 20,
  },
  separator: {
    width: '100%',
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 16,
  },
  // ─── Boutons ───
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 24,
    paddingBottom: 24,
    width: '100%',
  },
  btnCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
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
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  btnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
