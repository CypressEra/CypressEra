# CypressEra React UI - Developer Guide

**Welcome!** This guide will help you get started with the CypressEra Power Flow Analysis React application.

## 📋 Table of Contents

- [What is CypressEra?](#what-is-cypressera)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Key Concepts](#key-concepts)
- [Development Workflow](#development-workflow)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Detailed Documentation](#detailed-documentation)

## What is CypressEra?

CypressEra is an **AI-powered, cloud-native power flow analysis software** that helps electrical engineers analyze, visualize, and optimize power grids. The React UI provides:

- 📊 **Power Flow Analysis** - DC and AC power flow calculations
- 🗺️ **Network Visualization** - Interactive network diagrams
- 📝 **Data Management** - File upload, session management, network editing
- 🤖 **AI Assistant** - Intelligent help with power flow analysis
- 🌍 **Multi-language Support** - English, Chinese, Spanish
- ☁️ **Cloud Native** - Supports both cloud and private deployment

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **react-i18next** - Internationalization
- **Express + EJS** - Server-side rendering
- **XFlow SDK** - Power flow analysis SDK
- **CRACO** - Webpack configuration (for code obfuscation)

## Getting Started

### Prerequisites

- **Node.js 16+** and npm
- **Backend API Server** running (default: `http://localhost:8080`)
- **Agent Server** running (default: `http://localhost:3001`) - for AI Assistant

### Installation

```bash
# Clone the repository (if not already done)
git clone <repository-url>
cd react-ui

# Install dependencies
npm install

# Start development server
npm start
```

The app will open at `http://localhost:3000`

### First Time Setup

1. **Verify Backend Services**
   ```bash
   # Check if backend API is running
   curl http://localhost:8080/health
   
   # Check if MCP server is running
   curl http://localhost:3001/health
   ```

2. **Configure Environment Variables** (optional)
   ```bash
   # Development (defaults work for localhost)
   API_BASE_URL=http://localhost:8080 MCP_BASE_URL=http://localhost:3001 npm start
   ```

3. **Open the Application**
   - Navigate to `http://localhost:3000`
   - You should see the CypressEra interface

## Project Structure

```
react-ui/
├── src/
│   ├── components/
│   │   ├── common/          # Reusable UI components
│   │   │   ├── Button/
│   │   │   ├── Modal/
│   │   │   ├── Dialog/
│   │   │   └── MenuBar/
│   │   ├── features/        # Feature modules (main work area)
│   │   │   ├── AIAssistant/
│   │   │   ├── NetworkDiagram/
│   │   │   ├── NetworkDataTable/
│   │   │   ├── FileViewer/
│   │   │   ├── ProjectExplorer/
│   │   │   └── CommandLogger/
│   │   ├── layout/          # Layout components
│   │   └── ui/              # UI context providers
│   ├── hooks/               # Custom React hooks
│   │   ├── usePowerFlowSDK.ts  # Main SDK hook
│   │   └── useTranslation.ts
│   ├── sdk/                 # XFlow SDK (PowerFlowApp)
│   │   ├── index.js         # Main entry (exports PowerFlowApp)
│   │   ├── Xolution.js      # SDK class
│   │   ├── core/            # HTTP client, session manager
│   │   ├── services/        # API services
│   │   └── utils/           # Utilities
│   ├── i18n/                # Internationalization
│   │   └── locales/         # Translation files (en, zh, es)
│   ├── config/              # Configuration
│   │   └── api.ts           # API client setup
│   └── App.tsx              # Root component
├── public/                  # Static assets
├── documentations/          # Documentation (you are here!)
└── package.json
```

### Key Directories Explained

**`src/components/features/`** - This is where you'll spend most of your time. Each feature is self-contained:
- `AIAssistant/` - AI chat interface
- `NetworkDiagram/` - Visual network representation
- `NetworkDataTable/` - Tabular network data
- `FileViewer/` - File viewing/editing
- `ProjectExplorer/` - File browser

**`src/hooks/usePowerFlowSDK.ts`** - The main hook for interacting with the power flow SDK. Use this in components instead of calling the SDK directly.

**`src/sdk/`** - The XFlow SDK. You typically interact with it through `usePowerFlowSDK`, but can also use `PowerFlowApp` directly.

## Key Concepts

### 1. XFlow SDK (PowerFlowApp)

The SDK is the bridge between the UI and the backend API. It handles:
- File operations (upload, download, delete)
- Session management
- Power flow calculations
- Network data editing

**Usage:**
```typescript
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';

function MyComponent() {
  const { calculate, networkData, loading } = usePowerFlowSDK();
  
  const handleCalculate = async () => {
    await calculate('dc'); // Run DC power flow
  };
}
```

### 2. Feature-Based Architecture

Features are self-contained modules in `src/components/features/`. Each feature has:
- Its own components
- Its own styles
- Its own logic
- An `index.ts` for exports

**Example: Creating a new feature**
```bash
mkdir -p src/components/features/MyFeature
cd src/components/features/MyFeature
# Create MyFeature.tsx, MyFeature.css, index.ts
```

### 3. Internationalization (i18n)

All user-facing text should be translated. The app supports English, Chinese, and Spanish.

**Usage:**
```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation('common');
  return <button>{t('buttons.save')}</button>;
}
```

### 4. Path Aliases

Use `@/` prefix for clean imports:
```typescript
import { Button } from '@/components/common/Button';
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';
import { PowerFlowApp } from '@/sdk';
```

## Development Workflow

### Daily Development

1. **Start Development Server**
   ```bash
   npm start
   ```

2. **Make Changes**
   - Edit files in `src/`
   - Hot reload will update automatically
   - Check browser console for errors

3. **Test Your Changes**
   - Test in browser
   - Check all supported languages (use language switcher)
   - Test with different network files

### Adding a New Feature

1. **Create Feature Structure**
   ```bash
   mkdir -p src/components/features/MyFeature
   ```

2. **Create Component**
   ```typescript
   // src/components/features/MyFeature/MyFeature.tsx
   import React from 'react';
   import { useTranslation } from 'react-i18next';
   import './MyFeature.css';
   
   export const MyFeature: React.FC = () => {
     const { t } = useTranslation('common');
     return <div>{t('myFeature.title')}</div>;
   };
   ```

3. **Add Translations**
   - Add keys to `src/i18n/locales/en/common.json`
   - Add translations to `zh/common.json` and `es/common.json`

4. **Export from Feature**
   ```typescript
   // src/components/features/MyFeature/index.ts
   export { MyFeature } from './MyFeature';
   ```

5. **Use in App**
   ```typescript
   import { MyFeature } from '@/components/features/MyFeature';
   ```

### Building for Production

```bash
# Build (includes code obfuscation)
npm run build

# Test production build locally
npm run serve

# Or build and serve together
npm run start:prod
```

## Common Tasks

### Task 1: Upload and Analyze a File

```typescript
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';

function FileUpload() {
  const { uploadUserFile, createSessionFromFile, calculate } = usePowerFlowSDK();
  
  const handleFile = async (file: File) => {
    // 1. Upload file
    await uploadUserFile(file, 'models');
    
    // 2. Create session from file
    await createSessionFromFile(file.name);
    
    // 3. Run calculation
    await calculate('dc');
  };
}
```

### Task 2: Display Network Data

```typescript
function NetworkDisplay() {
  const { networkData, calculationResult } = usePowerFlowSDK();
  
  if (!networkData) return <div>No network data</div>;
  
  return (
    <div>
      <h2>Buses: {networkData.network_data.bus.length}</h2>
      <h2>Lines: {networkData.network_data.acline.length}</h2>
      {calculationResult && (
        <div>Convergedd: {calculationResult.results?.converged ? 'Yes' : 'No'}</div>
      )}
    </div>
  );
}
```

### Task 3: Add a New Translation

1. **Add to English** (`src/i18n/locales/en/common.json`):
   ```json
   {
     "myFeature": {
       "title": "My Feature",
       "description": "This is my feature"
     }
   }
   ```

2. **Add to Chinese** (`src/i18n/locales/zh/common.json`):
   ```json
   {
     "myFeature": {
       "title": "我的功能",
       "description": "这是我的功能"
     }
   }
   ```

3. **Add to Spanish** (`src/i18n/locales/es/common.json`):
   ```json
   {
     "myFeature": {
       "title": "Mi Característica",
       "description": "Esta es mi característica"
     }
   }
   ```

4. **Use in Component**:
   ```typescript
   const { t } = useTranslation('common');
   <h1>{t('myFeature.title')}</h1>
   ```

### Task 4: Use the SDK Directly

```typescript
import { PowerFlowApp } from '@/sdk';

// Initialize (usually done in App.tsx)
await PowerFlowApp.initialize({ userId: 'user123' });

// Upload file
await PowerFlowApp.uploadUserFile(file, 'models');

// Calculate
const results = await PowerFlowApp.calculate('dc');

// Listen to events
PowerFlowApp.on('calculate:complete', (data) => {
  console.log('Calculation done!', data);
});
```

### Task 5: Add Logging

```typescript
import { PowerFlowApp } from '@/sdk';

// Manual logging
PowerFlowApp.log('Starting operation...', 'info');
PowerFlowApp.log('Operation complete!', 'success');
PowerFlowApp.log('Warning: something unusual', 'warning');
PowerFlowApp.log('Error occurred', 'error');
```

Logs automatically appear in the `CommandLogger` component.

## Troubleshooting

### Problem: App won't start

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check Node.js version (need 16+)
node --version
```

### Problem: Backend connection failed

**Check:**
1. Is backend running? `curl http://localhost:8080/health`
2. Check `window.API_BASE_URL` in browser console
3. Verify environment variables are set correctly

**Solution:**
```bash
# Set API URL explicitly
API_BASE_URL=http://localhost:8080 npm start
```

### Problem: Translations not showing

**Solution:**
1. Check namespace is loaded: `useTranslation(['common'])`
2. Verify key exists in JSON files
3. Clear localStorage: `localStorage.clear()`
4. Refresh page

### Problem: SDK not initialized

**Check:**
```typescript
import { PowerFlowApp } from '@/sdk';
console.log('Connected:', PowerFlowApp.isConnected());
```

**Solution:**
- Ensure SDK is initialized in `App.tsx`
- Check backend is running
- Verify API_BASE_URL is correct

### Problem: Build fails

**Common causes:**
- TypeScript errors (check console)
- Missing dependencies (`npm install`)
- Out of memory (increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096`)

### Problem: Code changes not reflecting

**Solution:**
1. Hard refresh browser (Cmd+Shift+R / Ctrl+Shift+R)
2. Clear browser cache
3. Restart dev server
4. Check for console errors

## Detailed Documentation

For more in-depth information, see:

| Document | What It Covers |
|----------|----------------|
| **[SETUP.md](./SETUP.md)** | Complete setup, environment config, Docker deployment |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)** | Project structure, patterns, best practices, component guidelines |
| **[SDK.md](./SDK.md)** | Complete SDK API reference, all methods, events, examples |
| **[I18N.md](./I18N.md)** | Adding languages, translation patterns, TypeScript support |
| **[LOGGING.md](./LOGGING.md)** | Logging system, CommandLogger, event system |
| **[API.md](./API.md)** | Network operations, API client, data aggregation |
| **[AGENT.md](./AGENT.md)** | Agent client for AI chat, function calling, knowledge base |
| **[CODE_PROTECTION_GUIDE.md](./CODE_PROTECTION_GUIDE.md)** | Code obfuscation setup |
| **[SEO_SETUP.md](./SEO_SETUP.md)** | SEO configuration for production |

## Quick Reference

### Important Imports

```typescript
// SDK Hook (most common)
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';

// SDK Direct (advanced)
import { PowerFlowApp } from '@/sdk';

// Translations
import { useTranslation } from 'react-i18next';

// Common Components
import { Button, Modal, Dialog } from '@/components/common';
```

### Common SDK Methods

```typescript
const {
  // File operations
  uploadUserFile,
  getUserFiles,
  createSessionFromFile,
  
  // Calculations
  calculate,
  
  // Network data
  networkData,
  calculationResult,
  
  // Status
  loading,
  error,
  connected,
} = usePowerFlowSDK();
```

### Environment Variables

- `API_BASE_URL` - Backend API URL (default: `http://localhost:8080`)
- `MCP_BASE_URL` - MCP server URL (default: `http://localhost:3001`)
- `PORT` - Server port (default: `3000`)

## Getting Help

1. **Check Documentation** - Start with the detailed docs above
2. **Check Code Examples** - Look at existing features in `src/components/features/`
3. **Check SDK Examples** - See `src/sdk/examples/`
4. **Browser Console** - Check for errors and warnings
5. **Network Tab** - Check API calls in browser DevTools

## Next Steps

1. ✅ **Read this README** - You're here!
2. 📖 **Read [SETUP.md](./SETUP.md)** - Complete setup guide
3. 🏗️ **Read [ARCHITECTURE.md](./ARCHITECTURE.md)** - Understand project structure
4. 🔧 **Explore the Code** - Look at existing features
5. 🚀 **Start Building** - Create your first feature!

---

**Welcome to CypressEra!** 🎉

For questions or issues, refer to the detailed documentation or check the code examples in the project.
