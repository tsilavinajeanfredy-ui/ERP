import * as React from 'react';
import { captureException } from '../lib/monitoring';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    // Report to Sentry
    captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    if (__DEV__) {
      console.error('[ErrorBoundary]', error.message);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <MaterialCommunityIcons name="alert-circle-outline" size={56} color="#E74C3C" />
            <Text style={styles.title}>Une erreur s'est produite</Text>
            <Text style={styles.subtitle}>
              Une erreur inattendue a interrompu cet écran. Vos données sont sécurisées.
            </Text>
            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorBox}>
                <Text style={styles.errorText}>{this.state.error.message}</Text>
                {this.state.errorInfo?.componentStack && (
                  <Text style={styles.stackText}>
                    {this.state.errorInfo.componentStack.slice(0, 500)}
                  </Text>
                )}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <MaterialCommunityIcons name="refresh" size={18} color="#FFF" />
              <Text style={styles.buttonText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

/** Convenience HOC — wraps a screen component with an ErrorBoundary */
export function withErrorBoundary<T extends object>(
  Component: React.ComponentType<T>,
  options?: Omit<Props, 'children'>
) {
  return function WrappedComponent(props: T) {
    return (
      <ErrorBoundary {...options}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 24,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 480,
    width: '100%',
    ...Platform.select({
      web: { boxShadow: '0 4px 20px rgba(0,0,0,0.1)' } as any,
      default: { elevation: 6 },
    }),
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1A1A1A',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: '#FFF5F5',
    borderRadius: 8,
    padding: 12,
    maxHeight: 160,
    width: '100%',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 12,
    color: '#E74C3C',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    fontWeight: '600',
  },
  stackText: {
    fontSize: 10,
    color: '#868E96',
    marginTop: 8,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
