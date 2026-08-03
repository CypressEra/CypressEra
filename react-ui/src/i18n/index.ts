import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enCommon from './locales/en/common.json';
import enHome from './locales/en/home.json';
import enErrors from './locales/en/errors.json';
import enValidation from './locales/en/validation.json';
import enAiAssistant from './locales/en/aiAssistant.json';
import enParameters from './locales/en/parameters.json';
import enSolverSettings from './locales/en/solverSettings.json';

import zhCommon from './locales/zh/common.json';
import zhHome from './locales/zh/home.json';
import zhErrors from './locales/zh/errors.json';
import zhValidation from './locales/zh/validation.json';
import zhAiAssistant from './locales/zh/aiAssistant.json';
import zhParameters from './locales/zh/parameters.json';
import zhSolverSettings from './locales/zh/solverSettings.json';

import esCommon from './locales/es/common.json';
import esHome from './locales/es/home.json';
import esErrors from './locales/es/errors.json';
import esValidation from './locales/es/validation.json';
import esAiAssistant from './locales/es/aiAssistant.json';
import esParameters from './locales/es/parameters.json';
import esSolverSettings from './locales/es/solverSettings.json';

import frCommon from './locales/fr/common.json';
import frHome from './locales/fr/home.json';
import frErrors from './locales/fr/errors.json';
import frValidation from './locales/fr/validation.json';
import frAiAssistant from './locales/fr/aiAssistant.json';
import frParameters from './locales/fr/parameters.json';
import frSolverSettings from './locales/fr/solverSettings.json';

// Define resources
const resources = {
  en: {
    common: enCommon,
    home: enHome,
    errors: enErrors,
    validation: enValidation,
    aiAssistant: enAiAssistant,
    parameters: enParameters,
    solverSettings: enSolverSettings,
  },
  zh: {
    common: zhCommon,
    home: zhHome,
    errors: zhErrors,
    validation: zhValidation,
    aiAssistant: zhAiAssistant,
    parameters: zhParameters,
    solverSettings: zhSolverSettings,
  },
  es: {
    common: esCommon,
    home: esHome,
    errors: esErrors,
    validation: esValidation,
    aiAssistant: esAiAssistant,
    parameters: esParameters,
    solverSettings: esSolverSettings,
  },
  fr: {
    common: frCommon,
    home: frHome,
    errors: frErrors,
    validation: frValidation,
    aiAssistant: frAiAssistant,
    parameters: frParameters,
    solverSettings: frSolverSettings,
  },
} as const;

// Initialize i18n
i18n
  .use(LanguageDetector) // Detects user language
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    resources,
    fallbackLng: 'en', // Default language
    defaultNS: 'common', // Default namespace
    ns: ['common', 'home', 'errors', 'validation', 'aiAssistant', 'parameters', 'solverSettings'], // Available namespaces
    
    interpolation: {
      escapeValue: false, // React already protects from XSS
    },
    
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'], // Where to cache the language
      lookupLocalStorage: 'i18nextLng',
    },
    
    react: {
      useSuspense: false, // Set to true if you want to use Suspense
    },
    
    debug: process.env.NODE_ENV === 'development', // Enable debug in development
  });

export default i18n;

// Export supported languages for easy access
export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
] as const;

export type SupportedLanguage = typeof supportedLanguages[number]['code'];