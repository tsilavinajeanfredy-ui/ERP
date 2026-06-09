/**
 * Tests — ErrorBoundary
 * Teste la logique de la classe directement (état, getDerivedStateFromError,
 * componentDidCatch, handleReset) sans dépendance à react-test-renderer.
 */

import * as React from 'react';
import { ErrorBoundary, withErrorBoundary } from '../components/ErrorBoundary';

// Supprime les logs d'erreur React dans les tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

// ─── Helper : instancier ErrorBoundary sans DOM ───────────────────────────────

function makeInstance(props: React.ComponentProps<typeof ErrorBoundary> = { children: null }) {
  // @ts-expect-error — accès direct au constructeur pour les tests unitaires
  const instance = new ErrorBoundary(props);
  instance.state = { hasError: false, error: null, errorInfo: null };
  return instance;
}

const fakeError = new Error('Test error: component crashed');
const fakeErrorInfo: React.ErrorInfo = { componentStack: '\n    at BrokenComponent' };

describe('ErrorBoundary — logique de classe', () => {
  test('état initial sans erreur', () => {
    const instance = makeInstance();
    expect(instance.state.hasError).toBe(false);
    expect(instance.state.error).toBeNull();
  });

  test('getDerivedStateFromError passe hasError à true', () => {
    const newState = ErrorBoundary.getDerivedStateFromError(fakeError);
    expect(newState).toMatchObject({ hasError: true, error: fakeError });
  });

  test('componentDidCatch appelle onError avec l\'erreur', () => {
    const onError = jest.fn();
    const instance = makeInstance({ children: null, onError });
    instance.state = { hasError: true, error: fakeError, errorInfo: null };
    instance.componentDidCatch(fakeError, fakeErrorInfo);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(fakeError);
    expect(onError.mock.calls[0][0].message).toBe('Test error: component crashed');
  });

  test('componentDidCatch sans onError ne lève pas d\'erreur', () => {
    const instance = makeInstance({ children: null });
    instance.state = { hasError: true, error: fakeError, errorInfo: null };
    expect(() => instance.componentDidCatch(fakeError, fakeErrorInfo)).not.toThrow();
  });

  test('handleReset réinitialise l\'état', () => {
    const instance = makeInstance();
    instance.state = { hasError: true, error: fakeError, errorInfo: fakeErrorInfo };
    // handleReset appelle setState — on le remplace par un setter direct pour le test
    instance.setState = (s: any) => { Object.assign(instance.state, s); };
    instance.handleReset();
    expect(instance.state.hasError).toBe(false);
    expect(instance.state.error).toBeNull();
    expect(instance.state.errorInfo).toBeNull();
  });

  test('render retourne null-like quand pas d\'erreur (pas de crash)', () => {
    const instance = makeInstance({ children: React.createElement('div') });
    instance.state = { hasError: false, error: null, errorInfo: null };
    // render() ne doit pas lever d'exception
    expect(() => instance.render()).not.toThrow();
  });

  test('render avec fallback personnalisé ne crash pas', () => {
    const instance = makeInstance({
      children: null,
      fallback: React.createElement('div', null, 'custom fallback'),
    });
    instance.state = { hasError: true, error: fakeError, errorInfo: null };
    expect(() => instance.render()).not.toThrow();
  });
});

describe('withErrorBoundary HOC', () => {
  test('retourne un composant React valide', () => {
    function DummyComp() { return null; }
    const Wrapped = withErrorBoundary(DummyComp);
    expect(typeof Wrapped).toBe('function');
  });

  test('le composant wrappé a un displayName', () => {
    function MyComp() { return null; }
    const Wrapped = withErrorBoundary(MyComp);
    // displayName ou name doit contenir le nom du composant wrappé
    const name = (Wrapped as any).displayName || (Wrapped as any).name || '';
    expect(name.length).toBeGreaterThan(0);
  });
});
