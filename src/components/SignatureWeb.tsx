/**
 * SignatureWeb.tsx
 * Composant de signature manuscrite pour le web (canvas HTML5).
 * Remplace react-native-signature-canvas qui dépend de react-native-webview
 * (module natif non bundlable sur web/Vercel).
 */
import * as React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from './Ui';

interface SignatureWebProps {
  onOK: (img: string) => void;
  onEmpty?: () => void;
  descriptionText?: string;
  clearText?: string;
  confirmText?: string;
  webStyle?: string;
  autoClear?: boolean;
}

export function SignatureWeb({
  onOK,
  onEmpty,
  descriptionText = "Veuillez signer à l'intérieur du cadre",
  clearText = 'Effacer',
  confirmText = 'Confirmer la signature',
}: SignatureWebProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawing = React.useRef(false);
  const lastPos = React.useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = React.useState(true);

  // Initialise le canvas avec fond blanc
  const initCanvas = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  React.useEffect(() => {
    initCanvas();
  }, [initCanvas]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
    setIsEmpty(false);
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!drawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    lastPos.current = pos;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing.current = false;
    lastPos.current = null;
  };

  const handleClear = () => {
    initCanvas();
    setIsEmpty(true);
    onEmpty?.();
  };

  const handleConfirm = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (isEmpty) {
      onEmpty?.();
      return;
    }
    const dataUrl = canvas.toDataURL('image/png');
    onOK(dataUrl);
  };

  return (
    <View style={styles.container}>
      {descriptionText ? (
        <Text style={styles.description}>{descriptionText}</Text>
      ) : null}

      {/* Canvas natif HTML5 injecté via ref sur un élément View */}
      <View style={styles.canvasWrapper}>
        {/* @ts-ignore — canvas n'existe pas dans RN types mais fonctionne sur web */}
        <canvas
          ref={canvasRef}
          width={600}
          height={220}
          style={{
            width: '100%',
            height: '100%',
            touchAction: 'none',
            cursor: 'crosshair',
            display: 'block',
            borderRadius: 8,
            background: '#FFFFFF',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearText}>{clearText}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm}>
          <Text style={styles.confirmText}>{confirmText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 12,
  },
  description: {
    fontSize: 13,
    color: '#6C757D',
    textAlign: 'center',
  },
  canvasWrapper: {
    flex: 1,
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#DEE2E6',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 8,
  },
  clearBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#6C757D',
  },
  clearText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: C.green,
  },
  confirmText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
});
