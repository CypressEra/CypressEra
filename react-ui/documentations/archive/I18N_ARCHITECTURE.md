# i18n Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         React Application                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      App.tsx                              │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  useTranslation(['home', 'common', 'errors'])      │  │  │
│  │  │                                                     │  │  │
│  │  │  <h1>{t('home:title')}</h1>                       │  │  │
│  │  │  <button>{t('common:buttons.createSession')}</button> │  │
│  │  │  <div>{t('errors:uploadFailed')}</div>            │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  <LanguageSwitcher />                              │  │  │
│  │  │    - Allows user to switch languages               │  │  │
│  │  │    - Updates i18n.language                         │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              react-i18next (i18n instance)                │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  Current Language: 'en' / 'zh' / 'es'             │  │  │
│  │  │  Namespaces: ['common', 'home', 'errors', ...]    │  │  │
│  │  │  Fallback: 'en'                                    │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Language Detector (i18next-browser)             │  │
│  │  1. Check localStorage ('i18nextLng')                     │  │
│  │  2. Check browser language (navigator.language)           │  │
│  │  3. Check HTML lang attribute                             │  │
│  │  4. Fall back to 'en'                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Translation Resources                        │  │
│  │                                                            │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │     EN      │  │     ZH      │  │     ES      │      │  │
│  │  ├─────────────┤  ├─────────────┤  ├─────────────┤      │  │
│  │  │ common.json │  │ common.json │  │ common.json │      │  │
│  │  │ home.json   │  │ home.json   │  │ home.json   │      │  │
│  │  │ errors.json │  │ errors.json │  │ errors.json │      │  │
│  │  │ validation  │  │ validation  │  │ validation  │      │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              localStorage (Persistence)                   │  │
│  │  Key: 'i18nextLng'                                        │  │
│  │  Value: 'en' | 'zh' | 'es'                               │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Interaction Flow

```
User Action: Change Language
│
├──> LanguageSwitcher Component
│    │
│    └──> i18n.changeLanguage('zh')
│         │
│         ├──> Update i18n instance
│         │    └──> Current language = 'zh'
│         │
│         ├──> Save to localStorage
│         │    └──> localStorage.setItem('i18nextLng', 'zh')
│         │
│         ├──> Load translation resources for 'zh'
│         │    ├──> zh/common.json
│         │    ├──> zh/home.json
│         │    ├──> zh/errors.json
│         │    └──> zh/validation.json
│         │
│         └──> Trigger React re-render
│              │
│              └──> All components using useTranslation() 
│                   automatically update with Chinese translations
│
└──> UI Updates with Chinese Text ✅
```

## Translation Resolution Flow

```
Component calls: t('home:systemSummary')
│
├──> Parse translation key
│    ├──> Namespace: 'home'
│    └──> Key path: 'systemSummary'
│
├──> Get current language
│    └──> i18n.language = 'zh'
│
├──> Look up translation
│    └──> resources.zh.home['systemSummary']
│
├──> Found? 
│    ├──> YES: Return '系统摘要'
│    │
│    └──> NO: Try fallback language (en)
│         └──> resources.en.home['systemSummary']
│              ├──> YES: Return 'System Summary'
│              └──> NO: Return key 'home:systemSummary'
│
└──> Render translated text
```

## File Organization Strategy

```
src/i18n/locales/
│
├── en/ (English - Base Language)
│   ├── common.json       ──┐
│   ├── home.json          │
│   ├── errors.json        │── Same structure
│   └── validation.json    │   for all languages
│                          │
├── zh/ (Chinese)          │
│   ├── common.json       ──┤
│   ├── home.json          │
│   ├── errors.json        │
│   └── validation.json    │
│                          │
└── es/ (Spanish)          │
    ├── common.json       ──┘
    ├── home.json
    ├── errors.json
    └── validation.json

Why this structure?
├── ✅ Easy to find translations for a specific language
├── ✅ Easy to add a new language (copy folder structure)
├── ✅ Each namespace can be loaded independently
├── ✅ Clear separation of concerns
└── ✅ Scales well with growing translations
```

## Namespace Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                         Namespaces                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  common.json                                                     │
│  ├── UI elements used everywhere                                │
│  ├── Buttons, labels, status messages                           │
│  ├── Common actions (save, cancel, delete, etc.)               │
│  └── Shared terminology                                         │
│      Usage: t('common:buttons.submit')                          │
│                                                                   │
│  home.json (or feature-specific)                                │
│  ├── Page-specific content                                      │
│  ├── Section titles and descriptions                            │
│  ├── Feature-specific terminology                               │
│  └── Page layout text                                           │
│      Usage: t('home:systemSummary')                             │
│                                                                   │
│  errors.json                                                     │
│  ├── Error messages from API                                    │
│  ├── User-facing error descriptions                             │
│  ├── Troubleshooting hints                                      │
│  └── System error messages                                      │
│      Usage: t('errors:uploadFailed')                            │
│                                                                   │
│  validation.json                                                 │
│  ├── Form validation messages                                   │
│  ├── Input requirements                                         │
│  ├── Format specifications                                      │
│  └── Constraint messages                                        │
│      Usage: t('validation:required')                            │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘

Benefits:
├── 📦 Logical separation by purpose
├── 🔍 Easy to find and maintain translations
├── ⚡ Can lazy-load namespaces for performance
├── 👥 Team can work on different namespaces in parallel
└── 📈 Scales with application growth
```

## TypeScript Integration

```
Translation JSON Files
         │
         ▼
┌────────────────────────┐
│  en/common.json        │
│  {                     │
│    "buttons": {        │
│      "save": "Save"    │
│    }                   │
│  }                     │
└────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  TypeScript Type Inference             │
│  typeof import('./en/common.json')     │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  src/i18n/types.ts                     │
│                                         │
│  declare module 'react-i18next' {      │
│    interface CustomTypeOptions {       │
│      resources: {                      │
│        common: typeof enCommon;        │
│      }                                 │
│    }                                   │
│  }                                     │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Component with Autocomplete           │
│                                         │
│  const { t } = useTranslation();       │
│                                         │
│  t('buttons.') ← IDE shows:            │
│     • save                             │
│     • cancel                           │
│     • submit                           │
│                                         │
│  ✅ Compile-time validation            │
│  ✅ Autocomplete support               │
│  ✅ Refactoring safety                 │
└────────────────────────────────────────┘
```

## Data Flow on App Initialization

```
1. App Starts
   └──> index.tsx loads
        └──> import './i18n'

2. i18n Configuration Executes
   ├──> Initialize i18next instance
   ├──> Load translation resources
   │    ├──> Import all JSON files
   │    └──> Bundle into resources object
   │
   ├──> Configure language detector
   │    └──> Set detection order
   │
   └──> Initialize react-i18next

3. Language Detection
   ├──> Check localStorage
   │    ├──> Found 'i18nextLng': 'zh'
   │    └──> Set current language to 'zh'
   │
   ├──> (If not found) Check browser
   │    └──> navigator.language = 'en-US'
   │         └──> Extract 'en'
   │
   └──> (If not found) Use fallback
        └──> Default to 'en'

4. App Component Renders
   └──> useTranslation() hook
        ├──> Subscribe to i18n instance
        ├──> Get current language
        ├──> Get translation function (t)
        └──> Render with translations

5. User Interaction
   └──> Change language via LanguageSwitcher
        ├──> i18n.changeLanguage('es')
        ├──> Update localStorage
        ├──> Load Spanish translations
        └──> Trigger re-render
             └──> All components update automatically
```

## Performance Considerations

```
Optimization Strategies:

1. Bundle Size
   ├── All translations loaded upfront
   ├── For small apps: ✅ Fine (< 50KB)
   └── For large apps: Consider lazy loading

2. Code Splitting (Optional)
   ├── Load translations on-demand
   ├── Use i18next-http-backend
   └── Async loading per namespace

3. Memoization
   ├── Translation function is memoized
   ├── Only re-renders when language changes
   └── React.memo for performance-critical components

4. Build Time
   ├── JSON files are bundled at build time
   ├── No runtime parsing overhead
   └── Tree-shaking not applicable to JSON

Recommendation for Your App:
└──> Current setup is optimal for small-to-medium apps
     ├── Fast initial load
     ├── All translations available immediately
     └── No network requests for translations
```

## Language Persistence Flow

```
User Changes Language
│
├──> Component calls: i18n.changeLanguage('zh')
│    │
│    ├──> Update i18n internal state
│    │
│    ├──> Trigger language detector cache
│    │    └──> localStorage.setItem('i18nextLng', 'zh')
│    │
│    └──> Emit language changed event
│         └──> React components re-render
│
└──> User closes browser

Next Visit:
│
├──> App initialization
│    │
│    ├──> Language detector checks localStorage
│    │    └──> Found: 'i18nextLng' = 'zh'
│    │
│    └──> Initialize with Chinese language
│         └──> User sees app in Chinese immediately ✅
```

## Error Handling & Fallbacks

```
Translation Request: t('home:missingKey')
│
├──> Look in current language (zh)
│    ├──> zh/home.json
│    └──> Key not found ❌
│
├──> Try fallback language (en)
│    ├──> en/home.json
│    └──> Key not found ❌
│
└──> Return key as-is
     └──> Display: "home:missingKey"

Debug Mode (development):
└──> Console warning: "Translation key not found: home:missingKey"

Benefits:
├── App never breaks due to missing translations
├── Visual indicator (key displayed) for developers
├── Easy to identify missing translations in testing
└── Graceful degradation
```

## Best Practices Applied

```
✅ Separation of Concerns
   └── Translations separated from business logic

✅ Single Source of Truth
   └── English (en) as base, others derived from it

✅ Type Safety
   └── TypeScript integration for compile-time checks

✅ User Experience
   └── Automatic language detection
   └── Persistent language preference
   └── No page reload required

✅ Developer Experience
   └── Clear folder structure
   └── Logical namespace organization
   └── Comprehensive documentation
   └── Multiple component examples

✅ Scalability
   └── Easy to add new languages
   └── Easy to add new namespaces
   └── Modular organization

✅ Performance
   └── Efficient bundle size
   └── Memoized translations
   └── No runtime parsing overhead

✅ Maintainability
   └── Consistent key structure
   └── Clear naming conventions
   └── Self-documenting code
```

---

This architecture provides a solid foundation for internationalization that can scale with your application's growth.