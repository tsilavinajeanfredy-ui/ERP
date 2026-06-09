/**
 * notifIcons.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Remplace les emojis dans les sujets / titres de notifications
 * par des préfixes texte courts et professionnels, cohérents avec les types
 * visuels du NotificationToast (info / success / error / warning / release…).
 *
 * Usage :
 *   import { N } from '../lib/notifIcons';
 *   subject: N.lot   + 'Nouveau lot PF à valider'
 *   subject: N.lab   + 'Lot en quarantaine à analyser'
 *   subject: N.ok    + 'Inventaire validé — INV-2026-001'
 */

export const N = {
  /** Lot / stock / colis  →  [LOT]   */
  lot:        '[LOT]',
  /** Laboratoire / analyse → [LABO]  */
  lab:        '[LABO]',
  /** Validé / conforme    →  [OK]    */
  ok:         '[OK]',
  /** Bloqué / rejeté      →  [NOI]   */  // NON-CONFORME
  blocked:    '[NOC]',
  /** Libéré               →  [LIB]   */
  released:   '[LIB]',
  /** Nouveau / création   →  [NEW]   */
  new:        '[NEW]',
  /** Document / dossier   →  [DOC]   */
  doc:        '[DOC]',
  /** Paiement / finance   →  [FIN]   */
  finance:    '[FIN]',
  /** Expédition / transit →  [EXP]   */
  shipping:   '[EXP]',
  /** Connaissement        →  [BL]    */
  bl:         '[BL]',
  /** Douane               →  [DOU]   */
  customs:    '[DOU]',
  /** ETA / planning       →  [ETA]   */
  eta:        '[ETA]',
  /** Réception usine      →  [REC]   */
  reception:  '[REC]',
  /** Alerte / attention   →  [ALRT]  */
  alert:      '[ALRT]',
  /** Information          →  [INFO]  */
  info:       '[INFO]',
  /** Clôture / terminé    →  [CLO]   */
  closed:     '[CLO]',
  /** Assignation          →  [ASSGN] */
  assign:     '[ASSGN]',
  /** Inventaire           →  [INV]   */
  inventory:  '[INV]',
  /** Qualité              →  [QC]    */
  quality:    '[QC]',
} as const;

export type NKey = keyof typeof N;

/**
 * Retire tous les emojis résiduels d'une chaîne
 * (garde-fou pour les cas non couverts).
 */
export function stripEmoji(str: string): string {
  // Supprime les caractères emoji Unicode courants
  return str.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}]/gu,
    ''
  ).replace(/\s{2,}/g, ' ').trim();
}
