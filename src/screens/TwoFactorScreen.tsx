import * as React from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, Platform, Image, ScrollView, KeyboardAvoidingView } from 'react-native';
import { View as MotiView } from 'moti';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from '../components/Ui';
import { supabase } from '../lib/supabase';
import { useTranslation } from '../lib/i18n';

const TOTP_ISSUER = 'ERP%20GSI';

interface TwoFactorScreenProps {
  onVerify: () => void;
  onSignOut?: () => void;
  userEmail?: string;
  userName?: string;
}

export function TwoFactorScreen({ onVerify, onSignOut, userEmail, userName }: TwoFactorScreenProps) {
  const { t } = useTranslation();
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [setupMode, setSetupMode] = React.useState(false);
  const [showSuccessAnimation, setShowSuccessAnimation] = React.useState(false);
  const [totpSecret, setTotpSecret] = React.useState('');
  const [qrUrl, setQrUrl] = React.useState('');
  const [mfaFactorId, setMfaFactorId] = React.useState<string | null>(null);
  const activeChallengeId = React.useRef<string | null>(null);
  const [totpSecondsLeft, setTotpSecondsLeft] = React.useState(30);
  const [waitForNextCode, setWaitForNextCode] = React.useState(false);

  // Compte à rebours TOTP synchronisé sur l'horloge réelle
  React.useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const secs = 30 - (now % 30);
      setTotpSecondsLeft(secs);
      if (secs === 30) setWaitForNextCode(false);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    loadOrCreateTOTP();
  }, []);

  const loadOrCreateTOTP = async () => {
    try {
      if (!supabase) return;

      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) {
        console.error('[2FA] listFactors error:', listError);
        Alert.alert('Erreur', 'Impossible de charger les facteurs MFA: ' + listError.message);
        return;
      }
      // ✅ factors.totp retourne les TOTP vérifiés même en session AAL1
      // factors.all peut être vide en AAL1, c'est pourquoi on utilisait mal factors.all avant
      const verifiedFactor = factors?.totp?.find((f: any) => f.status === 'verified');

      if (verifiedFactor) {
        setMfaFactorId(verifiedFactor.id);
        setSetupMode(false);
        await createChallenge(verifiedFactor.id);
        return;
      }

      // Aucun vérifié — chercher un unverified récent (< 10 min) à réutiliser
      const unverified = factors?.all?.filter((f: any) => f.status === 'unverified') ?? [];
      const recentUnverified = unverified.find((f: any) => {
        const age = Date.now() - new Date(f.created_at).getTime();
        return age < 10 * 60 * 1000; // moins de 10 minutes
      });

      if (recentUnverified) {
        // Réutiliser le facteur existant — NE PAS recréer un nouveau secret
        setMfaFactorId(recentUnverified.id);
        setSetupMode(true);

        // Récupérer le secret sauvegardé en sessionStorage (stocké à la création)
        const savedSecret = Platform.OS === 'web'
          ? sessionStorage.getItem(`totp_secret_${recentUnverified.id}`)
          : null;

        if (savedSecret) {
          setTotpSecret(savedSecret);
          const accountName = encodeURIComponent(userEmail || 'user@gsi.mg');
          const otpauthUri = `otpauth://totp/${TOTP_ISSUER}:${accountName}?secret=${savedSecret}&issuer=${TOTP_ISSUER}&digits=6&period=30`;
          setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`);
        } else {
          // Secret perdu (autre navigateur/onglet) → forcer recréation
          await supabase!.auth.mfa.unenroll({ factorId: recentUnverified.id });
          loadOrCreateTOTP();
          return;
        }

        await createChallenge(recentUnverified.id);
        return;
      }

      // Purger les unverified anciens (> 10 min) et créer un nouveau facteur
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }

      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'ERP GSI Authenticator',
      });

      if (enrollError) {
        console.error('[2FA] enroll error:', enrollError);
        Alert.alert('Erreur', 'Impossible de créer le facteur TOTP: ' + enrollError.message);
        return;
      }

      if (data) {
        setTotpSecret(data.totp.secret);
        setMfaFactorId(data.id);
        setWaitForNextCode(true); // Attendre le prochain cycle de 30s

        // Sauvegarder le secret en sessionStorage pour survie aux rechargements
        if (Platform.OS === 'web') {
          sessionStorage.setItem(`totp_secret_${data.id}`, data.totp.secret);
        }

        const accountName = encodeURIComponent(userEmail || 'user@gsi.mg');
        const otpauthUri = `otpauth://totp/${TOTP_ISSUER}:${accountName}?secret=${data.totp.secret}&issuer=${TOTP_ISSUER}&digits=6&period=30`;
        setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUri)}`);
        setSetupMode(true);
      }
    } catch (err: any) {
      console.error('[2FA] loadOrCreateTOTP exception:', err);
      Alert.alert('Erreur', err.message || 'Erreur lors de la configuration TOTP');
    }
  };

  // Crée (ou réutilise) un challenge actif
  const createChallenge = async (factorId: string): Promise<string | null> => {
    try {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.mfa.challenge({ factorId });
      if (error) {
        console.error('[2FA] challenge error:', error);
        return null;
      }
      activeChallengeId.current = data.id;
      return data.id;
    } catch (err) {
      console.error('[2FA] createChallenge exception:', err);
      return null;
    }
  };

  const handleVerify = async () => {
    if (code.length < 6) {
      Alert.alert('Erreur', 'Veuillez entrer le code à 6 chiffres.');
      return;
    }
    if (!supabase || !mfaFactorId) {
      Alert.alert('Erreur', 'Configuration non chargée. Patientez et réessayez.');
      return;
    }

    setLoading(true);
    try {
      // Obtenir ou créer un challenge
      let challengeId = activeChallengeId.current;
      if (!challengeId) {
        challengeId = await createChallenge(mfaFactorId);
      }

      if (!challengeId) {
        throw new Error('Impossible de créer le challenge MFA.');
      }
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaFactorId,
        challengeId,
        code: code.trim(),
      });

      // Après verify (succès ou échec), invalider le challenge — il est consommé
      activeChallengeId.current = null;

      if (verifyError) {
        console.error('[2FA] verify error:', verifyError.status, verifyError.message);

        // Recréer un challenge pour la prochaine tentative
        await createChallenge(mfaFactorId);
        setCode('');

        const msg = verifyError.status === 422
          ? 'Code incorrect ou expiré (30s).\n\nVérifiez que l\'heure de votre appareil est bien synchronisée (Paramètres → Heure → Automatique) puis réessayez.'
          : verifyError.message || 'Erreur lors de la vérification.';

        Alert.alert('Code invalide', msg);
        return;
      }

      // Succès — nettoyer le secret temporaire
      if (Platform.OS === 'web') {
        sessionStorage.removeItem(`totp_secret_${mfaFactorId}`);
      }
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        onVerify();
      }, 1500);

    } catch (err: any) {
      console.error('[2FA] handleVerify exception:', err);
      activeChallengeId.current = null;
      setCode('');
      Alert.alert('Erreur', err.message || 'Erreur lors de la vérification');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} style={{ width: '100%' }}>
      <View style={s.centerWrapper}>
        <MotiView
          from={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={s.card}
        >
        <View style={s.iconCircle}>
          <MaterialCommunityIcons name="shield-lock-outline" size={32} color={C.green} />
        </View>

        <Text style={s.title}>{t('twofa_title')}</Text>

        {(userName || userEmail) && (
          <View style={s.userBadge}>
            <MaterialCommunityIcons name="account-circle-outline" size={16} color="#6C757D" />
            <Text style={s.userBadgeText} numberOfLines={1}>
              {userName || userEmail}
            </Text>
          </View>
        )}

        {setupMode && (
          <>
            <Text style={s.sub}>
              Scannez ce QR code avec votre application d'authentification
              (Google Authenticator, Microsoft Authenticator, Authy, etc.)
            </Text>

            {qrUrl ? (
              <View style={s.qrContainer}>
                <Image
                  source={{ uri: qrUrl }}
                  style={s.qrImage}
                  resizeMode="contain"
                />
              </View>
            ) : null}

            {totpSecret ? (
              <View style={s.secretRow}>
                <MaterialCommunityIcons name="key-variant" size={16} color="#6C757D" />
                <Text style={s.secretLabel}>{t('twofa_manual_key')}</Text>
                <Text style={s.secretValue}>{totpSecret}</Text>
              </View>
            ) : null}
          </>
        )}

        {setupMode && waitForNextCode && (
          <View style={s.waitBanner}>
            <MaterialCommunityIcons name="timer-sand" size={18} color={C.gold} />
            <Text style={s.waitText}>
              Attendez le prochain code ({totpSecondsLeft}s) puis saisissez-le
            </Text>
          </View>
        )}

        {setupMode && !waitForNextCode && (
          <View style={s.readyBanner}>
            <MaterialCommunityIcons name="check-circle-outline" size={18} color={C.green} />
            <Text style={s.readyText}>
              Nouveau code disponible — saisissez-le maintenant ({totpSecondsLeft}s restantes)
            </Text>
          </View>
        )}

        {!setupMode && (
          <Text style={s.sub}>
            Entrez le code à 6 chiffres affiché dans votre application d'authentification.
          </Text>
        )}

        <View style={s.inputRow}>
          <TextInput
            style={[s.input, setupMode && waitForNextCode && { opacity: 0.4 }]}
            placeholder="000 000"
            placeholderTextColor="#ADB5BD"
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            onSubmitEditing={handleVerify}
            returnKeyType="done"
            autoFocus={!setupMode}
            editable={!loading && !(setupMode && waitForNextCode)}
            {...Platform.select({
              web: { outlineStyle: 'none' }
            })}
          />
        </View>

        <View style={s.timerRow}>
          <MaterialCommunityIcons name="timer-outline" size={16} color={C.gold} />
          <Text style={s.timerText}>{t('twofa_renew')}</Text>
        </View>

        <TouchableOpacity
          style={[s.button, loading && { opacity: 0.7 }]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={s.buttonText}>{setupMode ? "Confirmer la configuration" : "Vérifier l'identité"}</Text>}
        </TouchableOpacity>

        {!setupMode && (
          <TouchableOpacity style={s.resend} onPress={() => {
            activeChallengeId.current = null;
            setSetupMode(true);
          }}>
            <MaterialCommunityIcons name="qrcode" size={16} color={C.gold} />
            <Text style={s.resendText}>{t('twofa_new_device')}</Text>
          </TouchableOpacity>
        )}

        {onSignOut && (
          <TouchableOpacity style={s.signOutBtn} onPress={onSignOut}>
            <MaterialCommunityIcons name="logout" size={14} color="#ADB5BD" />
            <Text style={s.signOutText}>{t('twofa_other_account')}</Text>
          </TouchableOpacity>
        )}
      </MotiView>
      </View>
      </ScrollView>

      {showSuccessAnimation && (
        <MotiView
          from={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.2 }}
          transition={{ type: 'spring', duration: 500 }}
          style={s.successAnimationContainer}
        >
          <View style={s.successCircle}>
            <MaterialCommunityIcons name="check" size={64} color="#FFF" />
          </View>
          <Text style={s.successTextOverlay}>{t('twofa_success')}</Text>
        </MotiView>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  centerWrapper: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 40, width: '100%', maxWidth: 440, alignItems: 'center' },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#1E513B15', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 },
  sub: { fontSize: 14, color: '#6C757D', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  qrContainer: {
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 20,
    alignItems: 'center',
  },
  qrImage: { width: 200, height: 200 },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  secretLabel: { fontSize: 12, color: '#6C757D', fontWeight: '600' },
  secretValue: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', fontFamily: Platform.OS === 'web' ? 'Menlo' : 'monospace', letterSpacing: 1 },
  appsRow: { width: '100%', marginBottom: 24 },
  appsLabel: { fontSize: 12, color: '#6C757D', fontWeight: '600', marginBottom: 8 },
  appsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  appBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF'
  },
  appText: { fontSize: 11, fontWeight: '600', color: '#495057' },
  inputRow: { width: '100%', marginBottom: 20 },
  input: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 18,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 8,
    color: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 },
  timerText: { fontSize: 12, color: '#6C757D' },
  button: { backgroundColor: C.green, width: '100%', padding: 18, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  resend: { marginTop: 24, flexDirection: 'row', alignItems: 'center', gap: 8 },
  resendText: { color: C.gold, fontSize: 13, fontWeight: '600' },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
    maxWidth: '100%',
  },
  userBadgeText: {
    fontSize: 13,
    color: '#6C757D',
    fontWeight: '600',
    flexShrink: 1,
  },
  signOutBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    opacity: 0.7,
  },
  signOutText: {
    fontSize: 12,
    color: '#ADB5BD',
    fontWeight: '500',
  },
  successAnimationContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  successCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.green,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTextOverlay: {
    marginTop: 20,
    fontSize: 22,
    fontWeight: '800',
    color: '#FFF',
  },
  waitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFD54F',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  waitText: {
    fontSize: 13,
    color: '#795548',
    fontWeight: '600',
    flex: 1,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#A5D6A7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    width: '100%',
  },
  readyText: {
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '600',
    flex: 1,
  },
});
