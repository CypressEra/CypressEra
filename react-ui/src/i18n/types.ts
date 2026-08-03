/**
 * Type definitions for i18n translations
 * This ensures type safety when using translations
 */

// Import translation JSON files to infer types
import common from './locales/en/common.json';
import home from './locales/en/home.json';
import errors from './locales/en/errors.json';
import validation from './locales/en/validation.json';
import aiAssistant from './locales/en/aiAssistant.json';
import parameters from './locales/en/parameters.json';

// Define the structure of all translations
export interface Resources {
  common: typeof common;
  home: typeof home;
  errors: typeof errors;
  validation: typeof validation;
  aiAssistant: typeof aiAssistant;
  parameters: typeof parameters;
}

// Declare module for react-i18next to provide type safety
declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: Resources;
  }
}