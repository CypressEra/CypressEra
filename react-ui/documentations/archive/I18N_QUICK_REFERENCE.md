# i18n Quick Reference

## 🚀 Getting Started in 3 Steps

### 1. Update your App.tsx
```typescript
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';

function App() {
  const { t } = useTranslation(['home', 'common', 'errors']);
  
  return (
    <div>
      <LanguageSwitcher />
      <h1>{t('home:title')}</h1>
    </div>
  );
}
```

### 2. Start your app
```bash
npm start
```

### 3. Test language switching
Click the language selector in your app!

---

## 📚 Common Usage Patterns

### Basic Translation
```typescript
const { t } = useTranslation();
t('buttons.save')  // "Save" or "保存" or "Guardar"
```

### With Namespace
```typescript
const { t } = useTranslation('home');
t('home:title')  // Explicit namespace
t('title')       // Implicit (uses 'home')
```

### Multiple Namespaces
```typescript
const { t } = useTranslation(['home', 'common']);
t('home:title')
t('common:buttons.save')
```

### With Variables
```typescript
// Translation: "Welcome, {{name}}!"
t('welcome', { name: 'John' })  // "Welcome, John!"
```

### Change Language
```typescript
const { i18n } = useTranslation();
i18n.changeLanguage('zh');  // Switch to Chinese
```

### Get Current Language
```typescript
const { i18n } = useTranslation();
console.log(i18n.language);  // 'en', 'zh', or 'es'
```

---

## 📂 Translation Files Location

```
src/i18n/locales/
├── en/
│   ├── common.json      ← Buttons, labels
│   ├── home.json        ← Page content
│   ├── errors.json      ← Error messages
│   └── validation.json  ← Form validation
├── zh/ (same structure)
└── es/ (same structure)
```

---

## 🔑 Available Translation Keys

### common.json
```typescript
t('common:buttons.createSession')
t('common:buttons.uploadFile')
t('common:buttons.runPowerFlow')
t('common:buttons.checkHealth')
t('common:labels.session')
t('common:labels.fileUpload')
t('common:status.healthy')
```

### home.json
```typescript
t('home:title')
t('home:subtitle')
t('home:systemSummary')
t('home:busResults')
t('home:branchResults')
t('home:metrics.totalLoad')
t('home:table.voltage')
t('home:method.dc')
```

### errors.json
```typescript
t('errors:createSessionFailed')
t('errors:uploadFailed')
t('errors:calculationFailed')
t('errors:invalidFile')
t('errors:serverConnection')
t('errors:serverStatus', { status: 404 })
```

---

## 🎨 Language Switcher Components

### Dropdown (Default)
```typescript
import LanguageSwitcher from './components/LanguageSwitcher';
<LanguageSwitcher />
```

### Buttons
```typescript
import { LanguageSwitcherButtons } from './components/LanguageSwitcher';
<LanguageSwitcherButtons />
```

### Compact with Flags
```typescript
import { LanguageSwitcherCompact } from './components/LanguageSwitcher';
<LanguageSwitcherCompact />
```

---

## 🌍 Supported Languages

| Code | Language | Native Name |
|------|----------|-------------|
| en   | English  | English     |
| zh   | Chinese  | 中文        |
| es   | Spanish  | Español     |

---

## ⚙️ Configuration

### Location
`src/i18n/index.ts`

### Key Settings
```typescript
{
  fallbackLng: 'en',           // Default language
  defaultNS: 'common',          // Default namespace
  ns: ['common', 'home', ...],  // All namespaces
}
```

### Language Detection Order
1. localStorage (`i18nextLng`)
2. Browser language
3. HTML lang attribute
4. Fallback to 'en'

---

## 🐛 Quick Troubleshooting

### Translations not showing?
```bash
# Clear localStorage
localStorage.clear()
# Refresh page
```

### Wrong language on load?
```javascript
// Check stored language
localStorage.getItem('i18nextLng')
// Force set language
localStorage.setItem('i18nextLng', 'en')
```

### Key not found?
```typescript
// Check if key exists in JSON file
// Check namespace is loaded
const { t } = useTranslation(['home'])  // Must include namespace
```

### TypeScript errors?
```bash
# Restart TypeScript server
# In VSCode: Cmd+Shift+P → "TypeScript: Restart TS Server"
```

---

## 📖 File Reference

| File | Purpose |
|------|---------|
| `I18N_SETUP_SUMMARY.md` | Complete setup overview |
| `I18N_GUIDE.md` | Comprehensive guide with examples |
| `I18N_ARCHITECTURE.md` | Technical architecture details |
| `I18N_QUICK_REFERENCE.md` | This file - quick lookup |
| `App_i18n_example.tsx` | Full example implementation |

---

## 💡 Pro Tips

1. **Always specify namespace** for clarity
   ```typescript
   t('home:title')  // ✅ Clear
   t('title')       // ❌ Which namespace?
   ```

2. **Keep keys in sync** across all languages
   - Same structure in en, zh, es

3. **Use variables** instead of string concatenation
   ```typescript
   t('welcome', { name })  // ✅
   t('welcome') + name     // ❌
   ```

4. **Default namespace** is 'common'
   - Good for frequently used translations

5. **Test all languages** during development
   - Switch between languages to catch missing keys

---

## 🔗 Quick Links

- [React-i18next Docs](https://react.i18next.com/)
- [i18next Docs](https://www.i18next.com/)
- Translation Files: `src/i18n/locales/`
- Config: `src/i18n/index.ts`
- Types: `src/i18n/types.ts`

---

## 🎯 Common Tasks

### Add a new translation key
1. Add to `en/[namespace].json`
2. Add to `zh/[namespace].json`
3. Add to `es/[namespace].json`
4. Use: `t('namespace:newKey')`

### Add a new namespace
1. Create files: `en/newspace.json`, `zh/newspace.json`, etc.
2. Import in `i18n/index.ts`
3. Add to resources object
4. Add to `ns` array

### Add a new language
1. Create folder: `src/i18n/locales/fr/`
2. Copy structure from `en/`
3. Translate all JSON files
4. Import in `i18n/index.ts`
5. Add to resources and supportedLanguages

---

**Need more details?** Check `I18N_GUIDE.md` for comprehensive documentation!