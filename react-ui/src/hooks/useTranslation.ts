/**
 * Re-export useTranslation from react-i18next
 * 
 * This allows centralized imports and makes it easy to add
 * custom logic in the future if needed.
 * 
 * Usage:
 *   import { useTranslation } from './hooks/useTranslation';
 * 
 * Or you can import directly from 'react-i18next':
 *   import { useTranslation } from 'react-i18next';
 */

// Simply re-export - no custom wrapper needed for now
export * from 'react-i18next';