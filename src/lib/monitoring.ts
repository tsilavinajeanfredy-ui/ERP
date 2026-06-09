// ============================================================================
// ERP GSI — Error Monitoring (Sentry-compatible interface)
// Replace SENTRY_DSN in .env to activate real Sentry reporting.
// ============================================================================

import { Platform } from 'react-native';

type SeverityLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

type ErrorContext = {
  user?: { id?: string; email?: string; role?: string };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  level?: SeverityLevel;
};

let _sentryInitialized = false;

/**
 * Initialize monitoring. Call once at app startup.
 * Set EXPO_PUBLIC_SENTRY_DSN in your .env to enable Sentry.
 */
export async function initMonitoring(userId?: string, userEmail?: string, userRole?: string) {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

  if (!dsn) {
    if (__DEV__) {
      console.warn('[Monitoring] EXPO_PUBLIC_SENTRY_DSN not set — error reporting disabled.');
    }
    return;
  }

  try {
    // Dynamic import to avoid bundling Sentry when not configured
    // Install: npx expo install @sentry/react-native
    // Then uncomment:
    //
    // const Sentry = await import('@sentry/react-native');
    // Sentry.init({
    //   dsn,
    //   environment: __DEV__ ? 'development' : 'production',
    //   tracesSampleRate: 0.2,
    //   beforeSend(event) {
    //     // Strip PII from events
    //     if (event.request?.cookies) delete event.request.cookies;
    //     return event;
    //   },
    // });
    // if (userId) {
    //   Sentry.setUser({ id: userId, email: userEmail, role: userRole });
    // }
    // _sentryInitialized = true;

    _sentryInitialized = false; // Remove when Sentry is installed
  } catch (e) {
    console.error('[Monitoring] Failed to initialize Sentry:', e);
  }
}

/**
 * Capture an exception for monitoring.
 * Falls back to console.error in development or when Sentry is not configured.
 */
export function captureException(error: unknown, context?: ErrorContext): void {
  if (!_sentryInitialized) {
    if (__DEV__) {
      console.error('[Monitoring] Unhandled error:', error, context);
    }
    return;
  }

  // When Sentry is configured:
  // const Sentry = require('@sentry/react-native');
  // Sentry.withScope((scope) => {
  //   if (context?.user) scope.setUser(context.user);
  //   if (context?.tags) Object.entries(context.tags).forEach(([k, v]) => scope.setTag(k, v));
  //   if (context?.extra) Object.entries(context.extra).forEach(([k, v]) => scope.setExtra(k, v));
  //   if (context?.level) scope.setLevel(context.level);
  //   Sentry.captureException(error);
  // });
}

/**
 * Log a breadcrumb for tracing user flow.
 */
export function addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
  if (!_sentryInitialized || __DEV__) return;
  // Sentry.addBreadcrumb({ message, category, data, level: 'info' });
}

/**
 * Set the current authenticated user for all future error reports.
 */
export function setMonitoringUser(id: string, email?: string, role?: string): void {
  if (!_sentryInitialized) return;
  // Sentry.setUser({ id, email, username: role });
}

/**
 * Clear user identity (on sign-out).
 */
export function clearMonitoringUser(): void {
  if (!_sentryInitialized) return;
  // Sentry.setUser(null);
}
