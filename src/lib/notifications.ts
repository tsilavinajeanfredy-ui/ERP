import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  let token;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }
  
  try {
    // projectId requis depuis SDK 48+ pour les builds EAS
    const projectId =
      (typeof Constants !== 'undefined' &&
        Constants.expoConfig?.extra?.eas?.projectId) ||
      undefined;
    token = (await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )).data;
  } catch (error) {
    console.error('[Push] Erreur getExpoPushTokenAsync :', error);
  }
  
  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  return token;
}

export async function schedulePushNotification(title: string, body: string, data?: any) {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: data || {},
    },
    trigger: null, // Envoi immédiat en local
  });
}

/**
 * Persiste le token Expo Push de l'utilisateur connecté dans la table `users`.
 *
 * IMPORTANT : sans cet appel, registerForPushNotificationsAsync() récupère
 * un token valide mais celui-ci n'est jamais enregistré nulle part — aucune
 * notification push (app fermée / arrière-plan) ne peut alors être envoyée
 * à personne, même si le token a bien été généré côté appareil.
 *
 * No-op silencieux sur web (les push natives ne concernent que iOS/Android).
 */
export async function savePushTokenForUser(userId: string, token: string | null | undefined) {
  if (Platform.OS === 'web') return;
  if (!userId || !token || !supabase) return;

  try {
    const { error } = await supabase
      .from('users')
      .update({
        push_token: token,
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) {
      console.warn('[Push] Erreur lors de l\'enregistrement du token :', error.message);
    }
  } catch (e) {
    console.warn('[Push] Exception lors de l\'enregistrement du token :', e);
  }
}
