import * as React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MotiView } from 'moti';

import { C } from '../components/Ui';
import { useTranslation } from '../lib/i18n';
import { supabase } from '../lib/supabase';

const FormContainer = ({ children, onSubmit }: { children: React.ReactNode; onSubmit: () => void }) => {
  if (Platform.OS === 'web') {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        style={{ width: '100%' }}
      >
        {children}
      </form>
    );
  }
  return <View style={{ width: '100%' }}>{children}</View>;
};

export function LoginScreen() {
  const { width } = useWindowDimensions();
  const IS_WEB = Platform.OS === 'web';
  const SPLIT_LAYOUT = IS_WEB && width > 992;

  const { t } = useTranslation();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  const [focusedField, setFocusedField] = React.useState<'email' | 'password' | null>(null);

  const passwordStrength = React.useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  }, [password]);

  const getStoredFailData = () => {
    if (Platform.OS !== 'web') return { attempts: 0, lockedUntil: 0 };
    try {
      const raw = sessionStorage.getItem('gsi_login_fail');
      return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: 0 };
    } catch { return { attempts: 0, lockedUntil: 0 }; }
  };

  const [failedAttempts, setFailedAttempts] = React.useState(() => getStoredFailData().attempts);
  const [lockoutTime, setLockoutTime] = React.useState(() => {
    const { lockedUntil } = getStoredFailData();
    return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  });

  React.useEffect(() => {
    let timer: any;
    if (lockoutTime > 0) {
      timer = setInterval(() => {
        setLockoutTime((prev) => {
          if (prev <= 1) {
            setFailedAttempts(0);
            if (Platform.OS === 'web') sessionStorage.removeItem('gsi_login_fail');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [lockoutTime]);

  const handleLogin = async () => {
    setErrorMessage('');

    if (lockoutTime > 0) {
      setErrorMessage(`Accès Verrouillé. Trop de tentatives. Réessayez dans ${lockoutTime} secondes.`);
      return;
    }

    if (!email || !password) {
      setErrorMessage('Veuillez remplir tous les champs (Email et Mot de passe).');
      return;
    }

    if (!supabase) {
      Alert.alert('Configuration', 'Le serveur Supabase n\'est pas configuré.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const newFailCount = failedAttempts + 1;
        setFailedAttempts(newFailCount);
        if (newFailCount >= 5) {
          const lockedUntil = Date.now() + 30_000;
          setLockoutTime(30);
          if (Platform.OS === 'web') {
            sessionStorage.setItem('gsi_login_fail', JSON.stringify({ attempts: newFailCount, lockedUntil }));
          }
          throw new Error('Trop de tentatives. Compte verrouillé temporairement.');
        }
        if (Platform.OS === 'web') {
          sessionStorage.setItem('gsi_login_fail', JSON.stringify({ attempts: newFailCount, lockedUntil: 0 }));
        }
        throw new Error('Identifiant ou mot de passe incorrect.');
      }

      setFailedAttempts(0);
      if (Platform.OS === 'web') sessionStorage.removeItem('gsi_login_fail');
    } catch (e: any) {
      setErrorMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => (
    <View style={s.formSide}>
      <Image
        source={require('../../public/photos/login.png')}
        style={s.topRightLogo}
        resizeMode="contain"
      />
      <MotiView
        from={{ opacity: 0, translateX: -20 }}
        animate={{ opacity: 1, translateX: 0 }}
        transition={{ type: 'timing', duration: 800 }}
        style={s.formContainer}
      >
        {/* Brand Title */}
        <View style={s.brandHeader}>
          <View>
            <Text style={s.brandName}>GROUPE SIPROMAD</Text>
            <Text style={s.brandTagline}>{t('login_tagline')}</Text>
          </View>
        </View>

        <View style={{ height: 48 }} />

        <FormContainer onSubmit={handleLogin}>
          <MotiView
            from={{ opacity: 0, translateX: -20 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ delay: 200 }}
            style={s.inputGroup}
          >
            <Text style={s.label}>{t('login_identifier')}</Text>
            <View style={[s.inputWrapper, focusedField === 'email' && s.inputWrapperFocused]}>
              <TextInput
                style={[s.input, Platform.select({ web: { outlineStyle: 'none' } as any })]}
                placeholder="votre@email.com"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
              />
            </View>
          </MotiView>

          <View style={{ height: 24 }} />

          <MotiView
            from={{ opacity: 0, translateX: -20 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ delay: 300 }}
            style={s.inputGroup}
          >
            <Text style={s.label}>{t('login_password_label')}</Text>
            <View style={[s.inputWrapper, { flexDirection: 'row', alignItems: 'center' }, focusedField === 'password' && s.inputWrapperFocused]}>
              <TextInput
                style={[s.input, { flex: 1 }, Platform.select({ web: { outlineStyle: 'none' } as any })]}
                placeholder="••••••••"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                onSubmitEditing={handleLogin}
                returnKeyType="go"
                autoComplete="current-password"
                onFocus={() => setFocusedField('password')}
                onBlur={() => setFocusedField(null)}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#94A3B8"
                />
              </TouchableOpacity>
            </View>
            {password.length > 0 && (
              <View style={s.strengthBarContainer}>
                {[...Array(4)].map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.strengthSegment,
                      { backgroundColor: i < passwordStrength ? (passwordStrength > 2 ? '#10B981' : '#F59E0B') : '#F1F5F9' },
                    ]}
                  />
                ))}
              </View>
            )}
          </MotiView>

          {lockoutTime > 0 && (
            <MotiView
              from={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              style={s.lockoutBox}
            >
              <MaterialCommunityIcons name="shield-alert" size={20} color="#EF4444" />
              <Text style={s.lockoutText}>Trop d'échecs. Réessayez dans {lockoutTime}s</Text>
            </MotiView>
          )}

          {errorMessage ? (
            <MotiView
              from={{ opacity: 0, translateY: -10 }}
              animate={{ opacity: 1, translateY: 0 }}
              style={s.errorBox}
            >
              <MaterialCommunityIcons name="alert-circle" size={16} color="#EF4444" />
              <Text style={s.errorText}>{errorMessage}</Text>
            </MotiView>
          ) : null}

          <TouchableOpacity
            style={[s.button, (loading || lockoutTime > 0) && s.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading || lockoutTime > 0}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={s.buttonText}>ACCÉDER AU SYSTÈME</Text>
            )}
          </TouchableOpacity>
        </FormContainer>

        <View style={s.footer}>
          <Text style={s.footerText}>MODULES OPERATIONNELS</Text>
          <View style={s.moduleGrid}>
            {[
              { icon: 'package-variant-closed', label: 'Stocks' },
              { icon: 'test-tube', label: 'Labo' },
              { icon: 'cart-outline', label: 'Achats' },
              { icon: 'factory', label: 'Production' },
              { icon: 'account-group', label: 'RH' },
            ].map((item, idx) => (
              <MotiView
                key={item.label}
                from={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'timing', duration: 400, delay: 500 + idx * 100 }}
                style={[s.moduleItem, { overflow: 'hidden' }]}
              >
                <TouchableOpacity style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 4, width: '100%' }} activeOpacity={0.6}>
                  <MaterialCommunityIcons name={item.icon as any} size={22} color="#1E293B" />
                  <Text style={s.moduleLabel}>{item.label}</Text>
                </TouchableOpacity>
              </MotiView>
            ))}
          </View>
        </View>
      </MotiView>
    </View>
  );

  const renderVisual = () => (
    <View style={s.visualSide}>
      <View style={s.abstractCircle1} />
      <View style={s.abstractCircle2} />
      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(11, 19, 43, 0.85)' }]} />
      <MotiView
        from={{ opacity: 0, translateY: 20 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 1000, delay: 300 }}
        style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
      >
        <View style={s.badge}>
          <MaterialCommunityIcons name="shield-check" size={20} color="#3B82F6" style={{ marginRight: 8 }} />
          <Text style={s.badgeText}>Système de Gestion de GSI</Text>
        </View>
        <Text style={{ color: '#F8FAFC', fontSize: 36, fontWeight: '800', marginTop: 24, textAlign: 'center', letterSpacing: -1, width: '85%', lineHeight: 44 }}>
          Pilotez votre industrie avec précision.
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 16, marginTop: 16, textAlign: 'center', width: '75%', lineHeight: 26, fontWeight: '500' }}>
          Une plateforme unifiée, sécurisée et performante pour les collaborateurs du Groupe Sipromad.
        </Text>
      </MotiView>
    </View>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={s.container}
    >
      <View style={[s.content, SPLIT_LAYOUT && s.row]}>
        {renderForm()}
        {SPLIT_LAYOUT && renderVisual()}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  content: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  formSide: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  formContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFF',
  },
  visualSide: {
    flex: 1.3,
    backgroundColor: '#0F172A',
    position: 'relative',
  },
  brandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -1,
  },
  brandTagline: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
    letterSpacing: 0,
  },
  inputGroup: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  inputWrapper: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    justifyContent: 'center',
    ...Platform.select({
      web: { transition: 'all 0.2s ease-in-out' } as any,
    }),
  },
  inputWrapperFocused: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FAFC',
    ...Platform.select({
      web: { boxShadow: '0 0 0 4px rgba(37, 99, 235, 0.1)' } as any,
    }),
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
    fontWeight: '500',
  },
  strengthBarContainer: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 4,
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  eyeBtn: {
    padding: 4,
  },
  button: {
    backgroundColor: '#2563EB',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 4px 14px rgba(37, 99, 235, 0.3)',
      },
      default: {
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      },
    }),
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  lockoutBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#FFE3E3',
    gap: 10,
  },
  lockoutText: {
    color: '#E03131',
    fontSize: 13,
    fontWeight: '600',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  errorText: {
    color: '#E03131',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  footer: {
    marginTop: 48,
  },
  footerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1.2,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  moduleGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  moduleItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    alignItems: 'center',
    ...Platform.select({
      web: {
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      },
    }),
  },
  moduleLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(12px)',
      } as any,
    }),
  },
  badgeText: {
    fontSize: 14,
    color: '#E2E8F0',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  topRightLogo: {
    position: 'absolute',
    top: 40,
    right: 40,
    width: 60,
    height: 60,
    zIndex: 10,
    opacity: 0.8,
    ...Platform.select({
      web: {
        transition: 'all 0.3s ease',
      } as any,
    }),
  },
  abstractCircle1: {
    position: 'absolute',
    top: -150,
    right: -100,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#3B82F6',
    opacity: 0.15,
    ...Platform.select({
      web: {
        filter: 'blur(80px)',
      } as any,
    }),
  },
  abstractCircle2: {
    position: 'absolute',
    bottom: -100,
    left: -50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#8B5CF6',
    opacity: 0.15,
    ...Platform.select({
      web: {
        filter: 'blur(60px)',
      } as any,
    }),
  },
});
