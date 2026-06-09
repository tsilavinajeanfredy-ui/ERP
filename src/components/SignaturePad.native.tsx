/**
 * SignaturePad.native.tsx
 * Version mobile (iOS/Android) du composant de signature.
 * Metro charge ce fichier sur ios/android et IGNORE SignaturePad.web.tsx.
 */
import * as React from 'react';
import { SignatureWeb } from './SignatureWeb';

// Import statique — Metro ne bundle ce fichier QUE pour les plateformes natives,
// donc react-native-signature-canvas est résolu correctement via metro.config.js.
let NativeSignatureCanvas: React.ComponentType<any> = SignatureWeb;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  NativeSignatureCanvas = require('react-native-signature-canvas').default;
} catch {
  // Fallback silencieux si le module natif n'est pas disponible
  NativeSignatureCanvas = SignatureWeb;
}

export default NativeSignatureCanvas;
