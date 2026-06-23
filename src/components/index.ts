/**
 * Barrel export for UI components
 * 
 * Fixes: "Unable to resolve module ../components/Ui" error on Windows
 * 
 * Usage:
 *   OLD: import { C, ActionButton } from '../components/Ui'
 *   NEW: import { C, ActionButton } from '../components'
 */

export * from './Ui';
