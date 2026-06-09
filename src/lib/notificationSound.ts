/**
 * notificationSound.ts
 * Système de sons de notification — calmes, distincts et non-agressifs.
 * Chaque type de notification a sa propre "signature sonore" identifiable.
 *
 * Types :
 *  - success  → 2 tons ascendants (ding-ding, harmonieux)
 *  - error    → ton grave descendant + silence (alerte sans agression)
 *  - warning  → ton moyen avec vibrato léger (attire l'attention)
 *  - info     → ding doux unique (neutre)
 *  - critical → séquence 3 tons urgents mais calmes (DA Import, Blocage lot)
 *  - release  → accord majeur ascendant (Lot Libéré — positif)
 *  - creation → ding léger + harmonique (nouveau produit / DA)
 */

import { Platform } from 'react-native';

type SoundType = 'success' | 'error' | 'warning' | 'info' | 'critical' | 'release' | 'creation';

interface Note {
  freq: number;
  duration: number;
  startAt: number;
  gain?: number;
  type?: OscillatorType;
}

function playNotes(notes: Note[], ctx: AudioContext): void {
  notes.forEach(({ freq, duration, startAt, gain = 0.22, type = 'sine' }) => {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt);
    gainNode.gain.setValueAtTime(0, ctx.currentTime + startAt);
    gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + startAt + 0.015);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
    osc.start(ctx.currentTime + startAt);
    osc.stop(ctx.currentTime + startAt + duration + 0.05);
  });
}

export function playNotificationSound(type: SoundType = 'info'): void {
  if (Platform.OS !== 'web') return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    switch (type) {
      // ── INFO : ding doux unique ─────────────────────────────────────────────
      case 'info':
        playNotes([
          { freq: 698, duration: 0.32, startAt: 0, gain: 0.18 },
        ], ctx);
        break;

      // ── SUCCESS : 2 tons ascendants harmonieux (do-mi) ─────────────────────
      case 'success':
        playNotes([
          { freq: 523, duration: 0.22, startAt: 0,    gain: 0.20 },
          { freq: 659, duration: 0.28, startAt: 0.16, gain: 0.22 },
        ], ctx);
        break;

      // ── ERROR : ton grave descendant — sérieux mais calme ──────────────────
      case 'error':
        playNotes([
          { freq: 440, duration: 0.15, startAt: 0,    gain: 0.22, type: 'triangle' },
          { freq: 330, duration: 0.28, startAt: 0.14, gain: 0.18, type: 'triangle' },
        ], ctx);
        break;

      // ── WARNING : ton moyen avec légère résonance ───────────────────────────
      case 'warning':
        playNotes([
          { freq: 587, duration: 0.18, startAt: 0,    gain: 0.20 },
          { freq: 554, duration: 0.26, startAt: 0.15, gain: 0.16 },
        ], ctx);
        break;

      // ── CRITICAL : 3 tons — urgence calme (DA Import, blocage lot) ─────────
      case 'critical':
        playNotes([
          { freq: 440, duration: 0.14, startAt: 0,    gain: 0.22, type: 'triangle' },
          { freq: 440, duration: 0.14, startAt: 0.18, gain: 0.20, type: 'triangle' },
          { freq: 330, duration: 0.30, startAt: 0.36, gain: 0.24, type: 'triangle' },
        ], ctx);
        break;

      // ── RELEASE : accord majeur ascendant — lot libéré, positif ────────────
      case 'release':
        playNotes([
          { freq: 523, duration: 0.18, startAt: 0,    gain: 0.18 },
          { freq: 659, duration: 0.18, startAt: 0.13, gain: 0.20 },
          { freq: 784, duration: 0.30, startAt: 0.26, gain: 0.22 },
        ], ctx);
        break;

      // ── CREATION : ding léger + harmonique — nouveau produit / DA ──────────
      case 'creation':
        playNotes([
          { freq: 880, duration: 0.12, startAt: 0,    gain: 0.16 },
          { freq: 1046,duration: 0.24, startAt: 0.10, gain: 0.14 },
        ], ctx);
        break;
    }
  } catch (_) {
    // Silently fail (browser policy, etc.)
  }
}

/** Mappe le type de notification DB → type de son */
export function soundForNotifType(
  notifType: string,
  category?: string,
  meta?: Record<string, any>
): SoundType {
  if (category === 'PURCHASING') {
    const step = meta?.step;
    if (step === 'RECEPTION' || step === 'ETA') return 'critical';
    return 'info';
  }
  if (notifType === 'error')   return 'error';
  if (notifType === 'success') return 'success';
  if (notifType === 'warning') return 'warning';
  return 'info';
}
