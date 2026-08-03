# Internationalization (i18n) Guide

## Overview

This project uses **react-i18next** for internationalization, supporting multiple languages including English (en), Chinese (zh), and Spanish (es).

## Table of Contents

- [Quick Start](#quick-start)
- [Folder Structure](#folder-structure)
- [Adding a New Language](#adding-a-new-language)
- [Using Translations](#using-translations)
- [Best Practices](#best-practices)
- [Advanced Usage](#advanced-usage)
- [TypeScript Support](#typescript-support)

## Quick Start

### 1. Install Dependencies

Already installed via:
```bash
npm install react-i18next i18next i18next-browser-languagedetector i18next-http-backend --legacy-peer-deps
```

### 2. Initialize i18n

The i18n configuration is automatically initialized in `src/index.tsx`:

```typescript
import './i18n'; // This line initializes i18n
```

### 3. Use Translations in Components

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');
  
  return <h1>{t('buttons.createSession')}</h1>;
}
```

## Folder Structure

```
src/
├── i18n/
│   ├── index.ts                    # Main i18n configuration
│   ├── types.ts                    # TypeScript type definitions
│   └── locales/
│       ├── en/                     # English translations
│       │   ├── common.json         # Common UI elements
│       │   ├── home.json           # Home page specific
│       │   ├── errors.json         # Error messages
│       │   └── validation.json     # Form validation
│       ├── zh/                     # Chinese translations
│       │   ├── common.json
│       │   ├── home.json
│       │   ├── errors.json
│       │   └── validation.json
│       └── es/                     # Spanish translations
│           ├── common.json
│           ├── home.json
│           ├── errors.json
│           └── validation.json
├── components/
│   └── LanguageSwitcher.tsx        # Language selector component
└── hooks/
    └── useTranslation.ts           # Custom hook (optional wrapper)
```

### Namespace Organization

**Why multiple JSON files per language?**
- **Maintainability**: Easier to manage translations by feature/section
- **Performance**: Load only needed translations (with lazy loading)
- **Team collaboration**: Multiple developers can work on different files
- **Logical separation**: Common vs page-specific vs error messages

| Namespace | Purpose | Examples |
|-----------|---------|----------|
| `common` | UI elements used across the app | Buttons, labels, status messages |
| `home` | Homepage/main page content | Page titles, table headers, metrics |
| `errors` | Error messages | API errors, validation errors |
| `validation` | Form validation messages | Required fields, format errors |

## Adding a New Language

### Step 1: Create Translation Files

Create a new folder under `src/i18n/locales/` (e.g., `fr` for French):

```bash
mkdir -p src/i18n/locales/fr
```

Create the following JSON files:
- `common.json`
- `home.json`
- `errors.json`
- `validation.json`

### Step 2: Copy and Translate

Copy the structure from English files and translate the values:

```json
// src/i18n/locales/fr/common.json
{
  "buttons": {
    "createSession": "Créer une session",
    "uploadFile": "Télécharger le fichier",
    ...
  }
}
```

### Step 3: Update i18n Configuration

Edit `src/i18n/index.ts`:

```typescript
// Import French translations
import frCommon from './locales/fr/common.json';
import frHome from './locales/fr/home.json';
import frErrors from './locales/fr/errors.json';
import frValidation from './locales/fr/validation.json';

// Add to resources
const resources = {
  en: { ... },
  zh: { ... },
  es: { ... },
  fr: {  // Add French
    common: frCommon,
    home: frHome,
    errors: frErrors,
    validation: frValidation,
  },
} as const;

// Add to supported languages
export const supportedLanguages = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },  // Add this
] as const;
```

## Using Translations

### Basic Usage

```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  // Default namespace (common)
  return <button>{t('buttons.createSession')}</button>;
}
```

### Multiple Namespaces

```typescript
const { t } = useTranslation(['home', 'common', 'errors']);

// Explicit namespace
<h1>{t('home:title')}</h1>
<button>{t('common:buttons.uploadFile')}</button>
<div>{t('errors:uploadFailed')}</div>

// Default namespace (first in array - 'home')
<p>{t('subtitle')}</p>
```

### Interpolation (Dynamic Values)

```typescript
// Translation file
{
  "welcome": "Welcome, {{name}}!",
  "serverStatus": "Server returned status: {{status}}"
}

// Component
<p>{t('welcome', { name: 'John' })}</p>
<p>{t('errors:serverStatus', { status: 404 })}</p>
```

### Pluralization

```json
{
  "itemCount": "{{count}} item",
  "itemCount_plural": "{{count}} items"
}
```

```typescript
<p>{t('itemCount', { count: 1 })}</p>  // "1 item"
<p>{t('itemCount', { count: 5 })}</p>  // "5 items"
```

### Change Language Programmatically

```typescript
import { useTranslation } from 'react-i18next';

function LanguageButton() {
  const { i18n } = useTranslation();
  
  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };
  
  return (
    <button onClick={() => changeLanguage('zh')}>
      切换到中文
    </button>
  );
}
```

## Best Practices

### 1. Namespace Naming

✅ **DO**: Use descriptive, feature-based names
```typescript
t('home:systemSummary')
t('dashboard:metrics.totalLoad')
t('settings:profile.email')
```

❌ **DON'T**: Use generic or unclear names
```typescript
t('text1')
t('label')
t('stuff')
```

### 2. Key Structure

✅ **DO**: Use hierarchical, logical structure
```json
{
  "buttons": {
    "submit": "Submit",
    "cancel": "Cancel"
  },
  "form": {
    "validation": {
      "required": "Required field"
    }
  }
}
```

❌ **DON'T**: Use flat, unorganized keys
```json
{
  "buttonSubmit": "Submit",
  "button_cancel": "Cancel",
  "formValidationRequired": "Required field"
}
```

### 3. Keep Translation Keys in Sync

- All language files should have the **same structure**
- Use the same keys across all languages
- Missing keys will fall back to the default language (English)

### 4. Default Values

```typescript
// Provide fallback for missing translations
t('missingKey', 'Default text')
```

### 5. Context for Translators

Add comments in JSON files (not standard JSON, but useful in development):

```typescript
// Better: Create a separate documentation file
// en/README.md explaining context for translators
```

### 6. Avoid Concatenating Translations

❌ **DON'T**:
```typescript
<p>{t('welcome')} {userName}! {t('greeting')}</p>
```

✅ **DO**:
```typescript
<p>{t('welcomeMessage', { name: userName })}</p>
```

### 7. Testing Translations

```typescript
// Test all translations exist
import en from './i18n/locales/en/common.json';
import zh from './i18n/locales/zh/common.json';

// Keys should match
expect(Object.keys(en)).toEqual(Object.keys(zh));
```

## Advanced Usage

### Lazy Loading (Code Splitting)

For large applications, load translations on-demand:

```typescript
// src/i18n/index.ts
import Backend from 'i18next-http-backend';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    // ... other config
  });
```

### Custom Formatting

```typescript
// Add custom formatting functions
i18n.services.formatter?.add('uppercase', (value) => {
  return value.toUpperCase();
});

// Use in translations
t('key', { value: 'text', formatParams: { value: { format: 'uppercase' } } })
```

### RTL Language Support

For languages like Arabic or Hebrew:

```typescript
// In your component
const { i18n } = useTranslation();
const isRTL = i18n.dir() === 'rtl';

<div dir={i18n.dir()}>
  {/* Your content */}
</div>
```

### Date and Number Formatting

```typescript
import { useTranslation } from 'react-i18next';

function FormattedData() {
  const { i18n } = useTranslation();
  
  const date = new Date();
  const formattedDate = new Intl.DateTimeFormat(i18n.language).format(date);
  
  const number = 1234567.89;
  const formattedNumber = new Intl.NumberFormat(i18n.language).format(number);
  
  return (
    <div>
      <p>Date: {formattedDate}</p>
      <p>Number: {formattedNumber}</p>
    </div>
  );
}
```

## TypeScript Support

The project includes full TypeScript support with type-safe translations.

### Type-Safe Translation Keys

```typescript
// src/i18n/types.ts defines types based on your translation files
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');
  
  // ✅ TypeScript will autocomplete and validate these keys
  t('buttons.createSession');
  t('labels.session');
  
  // ❌ TypeScript will show error for invalid keys
  t('buttons.nonExistent'); // Error!
}
```

### Adding Custom Types

```typescript
// src/i18n/types.ts
declare module 'react-i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: {
      common: typeof import('./locales/en/common.json');
      home: typeof import('./locales/en/home.json');
      errors: typeof import('./locales/en/errors.json');
      validation: typeof import('./locales/en/validation.json');
    };
  }
}
```

## Language Switcher Components

Three variants are provided in `src/components/LanguageSwitcher.tsx`:

### 1. Dropdown (Default)
```typescript
import LanguageSwitcher from './components/LanguageSwitcher';

<LanguageSwitcher />
```

### 2. Button Group
```typescript
import { LanguageSwitcherButtons } from './components/LanguageSwitcher';

<LanguageSwitcherButtons />
```

### 3. Compact with Flags
```typescript
import { LanguageSwitcherCompact } from './components/LanguageSwitcher';

<LanguageSwitcherCompact />
```

## Troubleshooting

### Translations Not Loading

1. Check browser console for errors
2. Verify JSON syntax is valid
3. Ensure namespace is imported in `i18n/index.ts`
4. Clear localStorage: `localStorage.removeItem('i18nextLng')`

### Language Not Persisting

The language preference is stored in localStorage. Check:
```javascript
localStorage.getItem('i18nextLng')
```

### Fallback Language

If a translation is missing, it will fall back to English (default):
```typescript
i18n.init({
  fallbackLng: 'en',
  // ...
});
```

## Migration Checklist

To migrate your existing App.tsx to use i18n:

- [ ] Import useTranslation hook
- [ ] Replace hardcoded strings with t() function calls
- [ ] Add namespace parameter if using multiple namespaces
- [ ] Add LanguageSwitcher component to your UI
- [ ] Test all translations in different languages
- [ ] Verify dynamic values (interpolation) work correctly
- [ ] Check that error messages are translated
- [ ] Test language persistence (refresh page)

## Example Migration

**Before:**
```typescript
<h1>Power Flow Solver</h1>
<button>Create Session</button>
```

**After:**
```typescript
const { t } = useTranslation(['home', 'common']);

<h1>{t('home:title')}</h1>
<button>{t('common:buttons.createSession')}</button>
```

## Resources

- [react-i18next Documentation](https://react.i18next.com/)
- [i18next Documentation](https://www.i18next.com/)
- [Translation Best Practices](https://www.i18next.com/principles/fallback)

## Support

For questions or issues with internationalization, please refer to the documentation above or check the official react-i18next documentation.