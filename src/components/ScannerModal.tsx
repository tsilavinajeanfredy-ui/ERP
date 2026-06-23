import * as React from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity, TextInput, ActivityIndicator, SafeAreaView, Platform, Vibration, Linking } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from './Ui';

interface ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

// Délai (ms) en dessous duquel deux frappes consécutives dans le champ de saisie
// sont considérées comme provenant d'une douchette / lecteur de code-barres externe
// (USB, Bluetooth HID) plutôt que d'une saisie manuelle au clavier.
const EXTERNAL_SCANNER_KEYSTROKE_THRESHOLD_MS = 40;

export function ScannerModal({ visible, onClose, onScan }: ScannerModalProps) {
  const [manualCode, setManualCode] = React.useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = React.useState(false);
  const inputRef = React.useRef<TextInput>(null);
  const lastKeystrokeRef = React.useRef<number>(0);
  const externalScanTimeoutRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (visible) {
      setScanned(false);
      setManualCode('');
      if (!permission?.granted && permission?.canAskAgain) {
        requestPermission();
      }
      // Le champ doit rester focus dès l'ouverture : une douchette / lecteur de
      // code-barres externe (USB ou Bluetooth) se comporte comme un clavier et
      // n'envoie ses caractères que là où se trouve le focus.
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => {
        clearTimeout(t);
        // Nettoyage systématique : si le modal se ferme (scan réussi ou
        // fermeture manuelle) avant l'expiration du timeout de détection
        // "douchette externe", il faut l'annuler ici. Sans ce nettoyage,
        // ce timeout résiduel se déclenche après la fermeture et provoque
        // un second appel fantôme à onScan/onClose avec les données du
        // précédent scan.
        if (externalScanTimeoutRef.current) {
          clearTimeout(externalScanTimeoutRef.current);
          externalScanTimeoutRef.current = null;
        }
      };
    }
    return undefined;
  }, [visible, permission]);

  const submitCode = (code: string) => {
    // Annule tout timeout de détection "douchette externe" encore en
    // attente pour éviter un second appel après celui-ci (ex: quand la
    // touche Entrée envoyée par la douchette déclenche onSubmitEditing
    // avant l'expiration du délai de sécurité de 120ms).
    if (externalScanTimeoutRef.current) {
      clearTimeout(externalScanTimeoutRef.current);
      externalScanTimeoutRef.current = null;
    }
    const trimmed = code.trim();
    if (!trimmed) return;
    Vibration.vibrate(60);
    onScan(trimmed);
    setManualCode('');
    onClose();
  };

  const handleManualSubmit = () => {
    submitCode(manualCode);
  };

  // Détecte la frappe ultra-rapide typique d'une douchette externe, qui termine
  // généralement par un caractère de fin de trame (Enter / Tab) capté par
  // onSubmitEditing, mais on sécurise aussi via un timeout silencieux au cas où
  // ce caractère n'est pas envoyé par le matériel.
  const handleManualChange = (text: string) => {
    const now = Date.now();
    const delta = now - lastKeystrokeRef.current;
    lastKeystrokeRef.current = now;
    setManualCode(text);

    if (externalScanTimeoutRef.current) clearTimeout(externalScanTimeoutRef.current);

    const looksLikeExternalScanner = delta > 0 && delta < EXTERNAL_SCANNER_KEYSTROKE_THRESHOLD_MS && text.length > 3;
    if (looksLikeExternalScanner) {
      externalScanTimeoutRef.current = setTimeout(() => {
        submitCode(text);
      }, 120);
    }
  };

  const handleBarcodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    if (externalScanTimeoutRef.current) {
      clearTimeout(externalScanTimeoutRef.current);
      externalScanTimeoutRef.current = null;
    }
    Vibration.vibrate(60);
    onScan(data);
    onClose();
  };

  const openSettings = () => {
    if (Platform.OS !== 'web') Linking.openSettings();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={false} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <MaterialCommunityIcons name="close" size={24} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={s.title}>Scanner un Code</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.content}>
          {Platform.OS === 'web' ? (
            <View style={s.center}>
               <MaterialCommunityIcons name="camera-off" size={48} color={C.gold} />
               <Text style={s.statusText}>Le scanner n'est pas disponible sur le web.</Text>
               <Text style={s.subText}>Veuillez utiliser la saisie manuelle ci-dessous.</Text>
            </View>
          ) : !permission ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color={C.primary} />
              <Text style={s.statusText}>Demande d'autorisation de la caméra...</Text>
            </View>
          ) : !permission.granted ? (
            <View style={s.center}>
              <MaterialCommunityIcons name="camera-off" size={48} color={C.err} />
              <Text style={s.statusText}>Accès à la caméra refusé.</Text>
              <Text style={s.subText}>Veuillez autoriser l'accès dans les paramètres de votre appareil.</Text>
              {permission.canAskAgain ? (
                <TouchableOpacity style={s.btn} onPress={requestPermission}>
                  <Text style={s.btnText}>Autoriser la caméra</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={s.btn} onPress={openSettings}>
                  <Text style={s.btnText}>Ouvrir les réglages</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={s.cameraContainer}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
              />
              <View style={s.overlay}>
                <View style={s.scanFrame} />
                <Text style={s.overlayText}>Placez le code au centre du cadre</Text>
              </View>
            </View>
          )}
        </View>

        <View style={s.inputArea}>
          <Text style={s.inputLabel}>Ou saisie manuelle / douchette externe :</Text>
          <View style={s.inputRow}>
            <TextInput
              ref={inputRef}
              style={s.input}
              placeholder="Ex: BE-2024-001"
              value={manualCode}
              onChangeText={handleManualChange}
              onSubmitEditing={handleManualSubmit}
              onBlur={() => {
                // Une douchette externe n'a pas de UI : elle envoie ses
                // caractères au champ qui a le focus. On le re-focus
                // automatiquement pour ne pas perdre de scan si l'utilisateur
                // a touché ailleurs par mégarde.
                setTimeout(() => { if (visible) inputRef.current?.focus(); }, 200);
              }}
              autoFocus
              blurOnSubmit={false}
              autoCapitalize="characters"
            />
            <TouchableOpacity style={s.scanBtn} onPress={handleManualSubmit}>
              <MaterialCommunityIcons name="check" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  content: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFF' },
  statusText: { fontSize: 16, color: '#495057', marginTop: 16, fontWeight: '600', textAlign: 'center' },
  subText: { fontSize: 14, color: '#6C757D', marginTop: 8, textAlign: 'center' },
  btn: { marginTop: 20, backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
  btnText: { color: '#FFF', fontWeight: '700' },
  cameraContainer: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  scanFrame: { width: 250, height: 250, borderWidth: 2, borderColor: C.ok, backgroundColor: 'transparent', borderRadius: 20 },
  overlayText: { color: '#FFF', fontSize: 14, fontWeight: '600', marginTop: 20, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  inputArea: { padding: 24, backgroundColor: '#FFF' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#495057', marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: '#F8F9FA', height: 48, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, borderWidth: 1, borderColor: '#E9ECEF', fontWeight: '600' },
  scanBtn: { width: 48, height: 48, backgroundColor: '#1A1A1A', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
});
