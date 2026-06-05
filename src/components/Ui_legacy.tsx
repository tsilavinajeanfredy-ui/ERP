import * as React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle, Platform } from 'react-native';

export const C = {
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  border: '#D4D4D0',
  borderMd: '#C8C5BC',
  textPrimary: '#1A1A1A',
  textSecondary: '#5A5A5A',
  textMuted: '#9A9A94',
  accent: '#1A1A1A',
  warnBg: '#FEF7E6',
  warnBorder: '#C19A3D',
  warnText: '#7A5E1A',
  errBg: '#FDEAEA',
  errBorder: '#8B1A1A',
  errText: '#6B1010',
  okBg: '#EBF5EB',
  okBorder: '#2E7D32',
  okText: '#1A5E1E',
  infoBg: '#E8F0FE',
  infoBorder: '#1A56DB',
  infoText: '#1035A0',
  quarBg: '#FFF3CD',
  quarBorder: '#C19A3D',
  blocBg: '#FDEAEA',
  blocBorder: '#8B1A1A',
  libBg: '#EBF5EB',
  libBorder: '#2E7D32',
  detBg: '#F3E5F5',
  detBorder: '#6A1B9A',
  dergBg: '#E8F0FE',
  dergBorder: '#1A56DB',
};

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={s.sectionTitle}>{children}</Text>;
}

export function Card({
  title,
  children,
  style,
  accent,
}: {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  accent?: string;
}) {
  return (
    <View style={[s.card, style, accent ? { borderLeftWidth: 4, borderLeftColor: accent } : null]}>
      {title ? <Text style={s.cardTitle}>{title}</Text> : null}
      <View style={{ gap: 10 }}>{children}</View>
    </View>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'warn' | 'err' | 'ok' | 'info';
}) {
  const t = tone ?? 'neutral';
  const toneStyle: ViewStyle =
    t === 'warn'
      ? { borderLeftWidth: 4, borderLeftColor: C.warnBorder, backgroundColor: C.warnBg }
      : t === 'err'
        ? { borderLeftWidth: 4, borderLeftColor: C.errBorder, backgroundColor: C.errBg }
        : t === 'ok'
          ? { borderLeftWidth: 4, borderLeftColor: C.okBorder, backgroundColor: C.okBg }
          : t === 'info'
            ? { borderLeftWidth: 4, borderLeftColor: C.infoBorder, backgroundColor: C.infoBg }
            : {};
  return (
    <View style={[s.kpi, toneStyle]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{value}</Text>
      {sub ? <Text style={s.kpiSub}>{sub}</Text> : null}
    </View>
  );
}

type BadgeTone = 'neutral' | 'warn' | 'err' | 'ok' | 'info' | 'purple';
const BADGE_STYLES: Record<BadgeTone, { bg: string; border: string; text: string }> = {
  neutral: { bg: '#F1EDE4', border: C.border, text: C.textSecondary },
  warn: { bg: C.warnBg, border: C.warnBorder, text: C.warnText },
  err: { bg: C.errBg, border: C.errBorder, text: C.errText },
  ok: { bg: C.okBg, border: C.okBorder, text: C.okText },
  info: { bg: C.infoBg, border: C.infoBorder, text: C.infoText },
  purple: { bg: C.detBg, border: C.detBorder, text: '#4A126A' },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const bs = BADGE_STYLES[tone];
  return (
    <View style={[s.badge, { backgroundColor: bs.bg, borderColor: bs.border }]}>
      <Text style={[s.badgeText, { color: bs.text }]}>{label}</Text>
    </View>
  );
}

type CqLibStatus = 'QUARANTAINE' | 'LIBERE' | 'BLOQUE' | 'DETERIORE' | 'DEROGATION';
const CQ_TONE: Record<CqLibStatus, BadgeTone> = {
  QUARANTAINE: 'warn',
  LIBERE: 'ok',
  BLOQUE: 'err',
  DETERIORE: 'purple',
  DEROGATION: 'info',
};
export function CqStatus({ status }: { status: CqLibStatus }) {
  return <Badge label={status} tone={CQ_TONE[status] ?? 'neutral'} />;
}

export function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, mono ? { fontFamily: 'monospace', letterSpacing: -0.3 } : null]}>
        {value}
      </Text>
    </View>
  );
}

export function LotRow({
  lot,
  article,
  status,
  qty,
  age,
  onPress,
}: {
  lot: string;
  article: string;
  status: CqLibStatus;
  qty: string;
  age?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.lotRow, pressed && { opacity: 0.8 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.lotRef}>{lot}</Text>
        <Text style={s.lotArticle}>{article}</Text>
        {age ? <Text style={s.lotAge}>{age}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <CqStatus status={status} />
        <Text style={s.lotQty}>{qty}</Text>
      </View>
    </Pressable>
  );
}

export function StepperRow({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <View style={s.stepper}>
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={i} style={s.stepItem}>
            <View
              style={[
                s.stepCircle,
                done ? s.stepDone : active ? s.stepActive : s.stepFuture,
              ]}
            >
              <Text style={[s.stepNum, done || active ? s.stepNumActive : s.stepNumFuture]}>
                {String(i + 1)}
              </Text>
            </View>
            {i < steps.length - 1 ? (
              <View style={[s.stepLine, done ? s.stepLineDone : s.stepLineFuture]} />
            ) : null}
          </View>
        );
      })}
      <View style={s.stepLabels}>
        {steps.map((label, i) => (
          <Text
            key={i}
            style={[s.stepLabel, i === current ? s.stepLabelActive : s.stepLabelInactive]}
            numberOfLines={2}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant,
  disabled,
  tone,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  tone?: 'ok' | 'warn';
}) {
  const v = variant ?? 'primary';
  const bgColor =
    v === 'danger'
      ? C.errBorder
      : tone === 'ok'
        ? C.okBorder
        : tone === 'warn'
          ? C.warnBorder
          : v === 'primary'
            ? C.accent
            : '#F1EDE4';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bgColor },
        disabled && s.btnDisabled,
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Text style={[s.btnText, v !== 'ghost' ? s.btnTextLight : s.btnTextDark]}>{label}</Text>
    </Pressable>
  );
}

export function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: C.textMuted,
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 0,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.03)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 }
    }),
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: C.textPrimary, marginBottom: 12 },
  kpi: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flex: 1,
    minWidth: 130,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.03)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 }
    }),
  },
  kpiLabel: { fontSize: 11, color: C.textSecondary, fontWeight: '500' },
  kpiValue: { fontSize: 26, fontWeight: '800', color: C.textPrimary, marginTop: 4 },
  kpiSub: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEBE4',
  },
  infoLabel: { fontSize: 12, color: C.textSecondary, flex: 1 },
  infoValue: { fontSize: 12, color: C.textPrimary, fontWeight: '600', flex: 1, textAlign: 'right' },
  lotRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEBE4',
  },
  lotRef: { fontSize: 13, fontWeight: '700', color: C.textPrimary, fontFamily: 'monospace' },
  lotArticle: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  lotAge: { fontSize: 11, color: C.textMuted, marginTop: 1 },
  lotQty: { fontSize: 12, color: C.textSecondary, fontWeight: '600' },
  stepper: { position: 'relative' },
  stepItem: { flexDirection: 'row', alignItems: 'center' },
  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stepDone: { backgroundColor: C.okBorder, borderColor: C.okBorder },
  stepActive: { backgroundColor: C.accent, borderColor: C.accent },
  stepFuture: { backgroundColor: C.surface, borderColor: C.borderMd },
  stepNum: { fontSize: 11, fontWeight: '800' },
  stepNumActive: { color: '#FFF' },
  stepNumFuture: { color: C.textMuted },
  stepLine: { flex: 1, height: 2 },
  stepLineDone: { backgroundColor: C.okBorder },
  stepLineFuture: { backgroundColor: C.borderMd },
  stepLabels: { flexDirection: 'row', marginTop: 6 },
  stepLabel: { flex: 1, fontSize: 9, textAlign: 'center', lineHeight: 12 },
  stepLabelActive: { color: C.textPrimary, fontWeight: '700' },
  stepLabelInactive: { color: C.textMuted },
  btn: {
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { fontSize: 13, fontWeight: '700' },
  btnTextLight: { color: '#FAFAF7' },
  btnTextDark: { color: C.textPrimary },
  divider: { height: 1, backgroundColor: '#EEEBE4', marginVertical: 6 },
});
