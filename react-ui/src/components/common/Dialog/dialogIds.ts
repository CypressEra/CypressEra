/**
 * Centralized dialog IDs
 * Add new dialog IDs here to avoid typos and ensure consistency
 */
export const DIALOG_IDS = {
  ABOUT: 'about',
  ALERT: 'alert',
  LOGIN: 'login',
  FILE_SELECTOR: 'file-selector',
  FILE_VIEWER: 'file-viewer',
  AC_POWER_FLOW_SETTINGS: 'ac-power-flow-settings',
  RUN_ANALYSIS: 'run-analysis',
  STUDY_RESULT: 'study-result',
  // Add more dialog IDs here as needed
  // SETTINGS: 'settings',
  // CONFIRM_DELETE: 'confirm-delete',
} as const;

export type DialogId = typeof DIALOG_IDS[keyof typeof DIALOG_IDS];

