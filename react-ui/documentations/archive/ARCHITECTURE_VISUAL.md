# Architecture Visual Guide

## 📁 Folder Structure Overview

```
react-ui/
│
├── 📄 Configuration Files
│   ├── package.json          # Dependencies & scripts
│   ├── tsconfig.json         # TypeScript config with path aliases
│   ├── server.js             # Express server for EJS injection
│   └── .env                  # Environment variables
│
├── 🎨 public/                # Static public files
│   ├── index.html            # Production template
│   ├── index.template.ejs    # EJS template with <%= API_BASE_URL %>
│   └── assets/               # Static assets
│
├── 🏗️ src/                   # Source code
│   │
│   ├── 🎯 features/          # ⭐ MAIN WORK AREA - Feature modules
│   │   │
│   │   ├── PowerFlow/        # Example: Power flow analysis feature
│   │   │   ├── components/   # Feature UI components
│   │   │   │   ├── PowerFlowDashboard/
│   │   │   │   │   ├── PowerFlowDashboard.tsx
│   │   │   │   │   ├── components/      # Sub-components
│   │   │   │   │   │   ├── FileUploadSection.tsx
│   │   │   │   │   │   ├── AnalysisControls.tsx
│   │   │   │   │   │   └── ResultsDisplay.tsx
│   │   │   │   │   └── index.ts
│   │   │   │   ├── ResultsTable/
│   │   │   │   └── PowerFlowDiagram/
│   │   │   ├── hooks/        # Feature custom hooks
│   │   │   │   ├── usePowerFlow.ts
│   │   │   │   └── useFileUpload.ts
│   │   │   ├── services/     # Feature API calls
│   │   │   │   └── powerFlowApi.ts
│   │   │   ├── types/        # Feature TypeScript types
│   │   │   │   └── powerFlow.types.ts
│   │   │   ├── utils/        # Feature utilities
│   │   │   │   └── formatters.ts
│   │   │   └── index.ts      # 🔑 Public API exports
│   │   │
│   │   ├── FileUpload/       # Another feature...
│   │   └── Analysis/         # Another feature...
│   │
│   ├── 🧩 components/        # Reusable generic components
│   │   ├── common/           # Generic UI components
│   │   │   ├── Button/       # Example component
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Button.module.css
│   │   │   │   └── index.ts
│   │   │   ├── Input/
│   │   │   ├── Modal/
│   │   │   ├── Card/
│   │   │   └── Loading/
│   │   ├── layout/           # Layout components
│   │   │   ├── Header/
│   │   │   ├── Footer/
│   │   │   └── Sidebar/
│   │   └── ui/               # UI-specific
│   │       └── LanguageSwitcher/
│   │
│   ├── 🎣 hooks/             # Global custom hooks
│   │   ├── useTranslation.ts
│   │   ├── useLocalStorage.ts
│   │   └── useDebounce.ts
│   │
│   ├── 🔌 services/          # API & external services
│   │   ├── api/
│   │   │   ├── client.ts     # API client configuration
│   │   │   └── interceptors.ts
│   │   └── websocket/
│   │       └── wsClient.ts
│   │
│   ├── ⚙️ config/            # App configuration
│   │   ├── api.ts            # API_BASE_URL & apiClient
│   │   ├── constants.ts      # App constants
│   │   └── environment.ts
│   │
│   ├── 🛠️ utils/             # Utility functions
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   └── helpers.ts
│   │
│   ├── 📝 types/             # Global TypeScript types
│   │   ├── global.d.ts       # window.API_BASE_URL
│   │   └── api.types.ts
│   │
│   ├── 🌍 i18n/              # Internationalization
│   │   ├── locales/
│   │   └── index.ts
│   │
│   ├── 🎨 assets/            # Images, fonts, icons
│   │
│   ├── App.tsx               # Root component
│   └── index.tsx             # Entry point
│
└── 📚 Documentation
    ├── ARCHITECTURE.md           # Detailed architecture guide
    ├── ARCHITECTURE_EXAMPLE.md   # Complete working example
    ├── ARCHITECTURE_VISUAL.md    # This file!
    ├── QUICK_START.md            # Getting started guide
    └── SERVER_SETUP.md           # Server & deployment
```

## 🔄 Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         User Action                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    React Component                           │
│  (Uses hooks for logic, presents UI)                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Custom Hook                               │
│  (Business logic, state management)                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Service                               │
│  (Makes HTTP requests using apiClient)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Client                                │
│  (Configured with window.API_BASE_URL)                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API                               │
│  (Your server at API_BASE_URL)                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                    Response flows back up
```

## 🎯 Component Hierarchy Example

```
App.tsx
  │
  ├── Layout
  │     ├── Header
  │     │     ├── Logo
  │     │     ├── Navigation
  │     │     └── LanguageSwitcher
  │     │
  │     ├── Main Content
  │     │     │
  │     │     └── PowerFlowDashboard (Feature)
  │     │           │
  │     │           ├── HealthIndicator
  │     │           │
  │     │           ├── FileUploadSection
  │     │           │     ├── Input (common)
  │     │           │     └── Button (common)
  │     │           │
  │     │           ├── AnalysisControls
  │     │           │     ├── Select (common)
  │     │           │     └── Button (common)
  │     │           │
  │     │           └── ResultsDisplay
  │     │                 ├── Card (common)
  │     │                 ├── ResultsTable
  │     │                 │     └── BusResultsTable
  │     │                 └── PowerFlowDiagram
  │     │                       ├── BusNode
  │     │                       ├── BranchLine
  │     │                       └── Legend
  │     │
  │     └── Footer
  │
  └── Providers (Context)
        ├── ThemeProvider
        ├── AuthProvider
        └── I18nProvider
```

## 🎨 Component Size Guidelines

```
┌──────────────────────────────────────────────────────────────┐
│ Small Component (< 100 lines)                                │
│ ─────────────────────────────────────────────────────────── │
│ Structure:                                                    │
│   Button/                                                     │
│   ├── Button.tsx                                             │
│   ├── Button.module.css                                      │
│   └── index.ts                                               │
│                                                               │
│ Single file with focused responsibility                      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Medium Component (100-300 lines)                             │
│ ─────────────────────────────────────────────────────────── │
│ Structure:                                                    │
│   DataTable/                                                  │
│   ├── DataTable.tsx                                          │
│   ├── DataTable.module.css                                   │
│   ├── types.ts                                               │
│   └── index.ts                                               │
│                                                               │
│ May need separate types file                                 │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Large Component (> 300 lines) - BREAK IT DOWN!              │
│ ─────────────────────────────────────────────────────────── │
│ Structure:                                                    │
│   Dashboard/                                                  │
│   ├── Dashboard.tsx          ← Main orchestrator (simple)   │
│   ├── Dashboard.module.css                                   │
│   ├── components/            ← Sub-components                │
│   │   ├── DashboardHeader.tsx                               │
│   │   ├── DashboardContent.tsx                              │
│   │   └── widgets/                                           │
│   ├── hooks/                 ← Custom hooks for logic       │
│   │   ├── useDashboardData.ts                               │
│   │   └── useDashboardFilters.ts                            │
│   ├── utils/                 ← Helper functions             │
│   │   └── dataTransformers.ts                               │
│   ├── types.ts                                               │
│   └── index.ts                                               │
│                                                               │
│ Break into smaller, focused pieces!                          │
└──────────────────────────────────────────────────────────────┘
```

## 🔗 Import Patterns

### ✅ Good - Using Path Aliases

```typescript
// Clean and clear
import { Button } from '@/components/common/Button';
import { usePowerFlow } from '@/features/PowerFlow';
import { API_BASE_URL } from '@/config/api';
import { formatDate } from '@/utils/formatters';
```

### ❌ Bad - Relative Imports

```typescript
// Confusing and fragile
import { Button } from '../../../components/common/Button';
import { usePowerFlow } from '../../features/PowerFlow/hooks/usePowerFlow';
```

### ✅ Good - Feature Public API

```typescript
// Import from feature's index.ts
import { PowerFlowDashboard, usePowerFlow } from '@/features/PowerFlow';
```

### ❌ Bad - Feature Internals

```typescript
// Don't reach into feature internals
import { PowerFlowDashboard } from '@/features/PowerFlow/components/PowerFlowDashboard/PowerFlowDashboard';
```

## 🚀 Development Workflow

```
1. Create Feature Structure
   │
   ├─ mkdir -p src/features/MyFeature/{components,hooks,services,types}
   │
2. Define Types
   │
   ├─ Create MyFeature/types/myFeature.types.ts
   │
3. Build API Service
   │
   ├─ Create MyFeature/services/myFeatureApi.ts
   │  └─ Use apiClient from @/config/api
   │
4. Create Custom Hook
   │
   ├─ Create MyFeature/hooks/useMyFeature.ts
   │  └─ Use the API service
   │
5. Build Components
   │
   ├─ Create MyFeature/components/MainComponent/
   │  ├─ MainComponent.tsx (uses the hook)
   │  └─ Sub-components as needed
   │
6. Export Public API
   │
   ├─ Create MyFeature/index.ts
   │  └─ Export only what others should use
   │
7. Use in App
   │
   └─ import { MyFeature } from '@/features/MyFeature';
```

## 📦 Feature Independence

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Feature A  │     │  Feature B  │     │  Feature C  │
│             │     │             │     │             │
│  - comps    │     │  - comps    │     │  - comps    │
│  - hooks    │     │  - hooks    │     │  - hooks    │
│  - services │     │  - services │     │  - services │
│  - types    │     │  - types    │     │  - types    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   Shared Resources     │
              │                        │
              │  - components/common   │
              │  - hooks/              │
              │  - utils/              │
              │  - config/             │
              └────────────────────────┘
```

Each feature is self-contained but shares common resources.

## 🎭 Component Patterns

### Container/Presentational Pattern

```
┌─────────────────────────────────────┐
│   Container Component               │
│   (Logic, State, Data Fetching)    │
│                                     │
│   - Uses hooks                      │
│   - Manages state                   │
│   - Handles events                  │
│   - Fetches data                    │
└──────────────┬──────────────────────┘
               │ passes props
               ▼
┌─────────────────────────────────────┐
│   Presentational Component          │
│   (Pure UI, No Logic)              │
│                                     │
│   - Receives props                  │
│   - Renders UI                      │
│   - Calls callbacks                 │
│   - No state/effects                │
└─────────────────────────────────────┘
```

## 💡 Key Principles

1. **Feature-Based** - Group by feature, not by file type
2. **Independent** - Features don't depend on each other
3. **Composable** - Build complex UIs from simple pieces
4. **Typed** - Use TypeScript for safety
5. **Testable** - Easy to test each piece
6. **Scalable** - Grows from 10 to 1000+ components

## 🎯 Where Does Code Go?

```
┌──────────────────────────────────────────────────────┐
│ Generic, reusable UI?                                │
│ → components/common/                                 │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Feature-specific component?                          │
│ → features/FeatureName/components/                   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Shared business logic?                               │
│ → hooks/ (global) or features/X/hooks/ (local)      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ API calls?                                           │
│ → features/FeatureName/services/                     │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Data types?                                          │
│ → features/X/types/ (local) or types/ (global)      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Helper functions?                                    │
│ → utils/ (global) or features/X/utils/ (local)      │
└──────────────────────────────────────────────────────┘
```

Ready to build? Check `QUICK_START.md` for step-by-step instructions!