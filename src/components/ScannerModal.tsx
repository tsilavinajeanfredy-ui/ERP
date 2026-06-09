import * as React from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity, TextInput, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C } from './Ui';

interface ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
}

export function ScannerModal({ visible, onClose, onScan }: ScannerModalProps) {
  const [manualCode, setManualCode] = React.useState('');
  const scanAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [visible]);

  const handleManualSubmit = () => {
    if (manualCode.trim()) {
      onScan(manualCode.trim());
      setManualCode('');
    }
  };

  const translateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 250],
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.overlay}>
        <View style={s.container}>
          <View style={s.header}>
            <Text style={s.title}>SCANNER GSI ERP</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialCommunityIcons name="close" size={24} color="#6C757D" />
            </TouchableOpacity>
          </View>

          <View style={s.scannerArea}>
            <View style={s.cameraSim}>
              <MaterialCommunityIcons name="camera" size={48} color="#E9ECEF" />
              <Text style={s.simText}>Simulation Camera</Text>
              <Animated.View style={[s.scanLine, { transform: [{ translateY }] }]} />
            </View>
            
            <View style={s.cornerTL} />
            <View style={s.cornerTR} />
            <View style={s.cornerBL} />
            <View style={s.cornerBR} />
          </View>

          <View style={s.inputArea}>
            <Text style={s.inputLabel}>Saisie manuelle ou Simulation Scan :</Text>
            <View style={s.inputRow}>
              <TextInput
                style={s.input}
                placeholder="Ex: BE-2024-001"
                value={manualCode}
                onChangeText={setManualCode}
                autoFocus
                onSubmitEditing={handleManualSubmit}
              />
              <TouchableOpacity style={s.scanBtn} onPress={handleManualSubmit}>
                <MaterialCommunityIcons name="magnify" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            <Text style={s.hint}>Scannez un QR Code sur un rapport pour y accéder instantanément.</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  container: { width: '100%', maxWidth: 450, backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  title: { fontSize: 14, fontWeight: '900', color: '#1A1A1A', letterSpacing: 1 },
  scannerArea: { height: 300, backgroundColor: '#1A1A1A', position: 'relative', justifyContent: 'center', alignItems: 'center' },
  cameraSim: { alignItems: 'center' },
  simText: { color: '#6C757D', fontSize: 12, marginTop: 8, fontWeight: '600' },
  scanLine: { position: 'absolute', top: 25, left: 50, right: 50, height: 2, backgroundColor: C.ok, opacity: 0.5 },
  cornerTL: { position: 'absolute', top: 30, left: 30, width: 30, height: 30, borderTopWidth: 4, borderLeftWidth: 4, borderColor: C.ok, borderTopLeftRadius: 10 },
  cornerTR: { position: 'absolute', top: 30, right: 30, width: 30, height: 30, borderTopWidth: 4, borderRightWidth: 4, borderColor: C.ok, borderTopRightRadius: 10 },
  cornerBL: { position: 'absolute', bottom: 30, left: 30, width: 30, height: 30, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: C.ok, borderBottomLeftRadius: 10 },
  cornerBR: { position: 'absolute', bottom: 30, right: 30, width: 30, height: 30, borderBottomWidth: 4, borderRightWidth: 4, borderColor: C.ok, borderBottomRightRadius: 10 },
  inputArea: { padding: 24 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#495057', marginBottom: 12 },
  inputRow: { flexDirection: 'row', gap: 10 },
  input: { flex: 1, backgroundColor: '#F8F9FA', height: 48, borderRadius: 12, paddingHorizontal: 16, fontSize: 16, borderWidth: 1, borderColor: '#E9ECEF', fontWeight: '600' },
  scanBtn: { width: 48, height: 48, backgroundColor: '#1A1A1A', borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  hint: { fontSize: 11, color: '#ADB5BD', marginTop: 12, textAlign: 'center', fontStyle: 'italic' },
});
