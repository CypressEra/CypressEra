# Undo/Redo Code Structure - Clarification

## Directory Structure Overview

Your codebase has different types of utilities in different places:

### 1. `src/sdk/utils/` - SDK Utilities (Backend Communication Layer)
**Purpose:** Utilities for backend API communication

**Examples:**
- `EventEmitter.js` - Event system for SDK services
- `errors.js` - Error classes for API errors
- `dataAggregator.js` - Merges API responses with local data

**Characteristics:**
- ✅ Related to backend communication
- ✅ Used by SDK services (EditService, SessionService, etc.)
- ✅ Part of the SDK package

### 2. `src/utils/` - Frontend Utilities (Non-React, Pure JavaScript)
**Purpose:** Reusable frontend logic that doesn't depend on React or backend

**Examples (from architecture docs):**
- `formatters.ts` - Format data for display
- `validators.ts` - Validate user input
- `helpers.ts` - General helper functions
- `date.ts` - Date manipulation utilities

**Characteristics:**
- ✅ Frontend-only (runs in browser)
- ✅ No React dependencies (pure JavaScript/TypeScript)
- ✅ No backend API calls
- ✅ Reusable across components
- ✅ Can be tested without React

### 3. `src/hooks/` - React Hooks (React-Specific Frontend)
**Purpose:** React hooks that integrate React with utilities or services

**Examples:**
- `usePowerFlowSDK.ts` - React hook wrapping SDK
- `useTranslation.ts` - React hook for i18n
- `useNotification.ts` - React hook for notifications

**Characteristics:**
- ✅ React-specific (uses React hooks)
- ✅ Wraps utilities or services
- ✅ Manages React state
- ✅ Can be used in components

## Where Undo/Redo Goes

### ✅ `src/utils/undo-redo/` - Core Logic (Non-React)
**Files:**
- `UndoRedoManager.ts` - Pure JavaScript class
- `EditCommand.ts` - Pure JavaScript class
- `types.ts` - TypeScript types

**Why here?**
- ✅ Frontend functionality (runs in browser)
- ✅ No React dependencies (pure JS/TS)
- ✅ No backend API calls (local state only)
- ✅ Reusable (could be used by other components)
- ✅ Testable without React

### ✅ `src/hooks/useUndoRedo.ts` - React Integration
**File:**
- `useUndoRedo.ts` - React hook that uses UndoRedoManager

**Why here?**
- ✅ React-specific (uses useState, useEffect, etc.)
- ✅ Wraps the utility (UndoRedoManager)
- ✅ Manages React state (canUndo, canRedo)
- ✅ Can be used in components

## Visual Breakdown

```
Frontend Code (Browser)
│
├── src/utils/                    ← Pure JavaScript/TypeScript
│   └── undo-redo/                ← No React, no backend
│       ├── UndoRedoManager.ts    ← Pure class
│       └── EditCommand.ts         ← Pure class
│
├── src/hooks/                     ← React-specific
│   └── useUndoRedo.ts            ← React hook (uses utils/undo-redo)
│
└── src/sdk/utils/                 ← SDK utilities (backend communication)
    ├── EventEmitter.js            ← For SDK events
    └── errors.js                  ← API error classes
```

## Comparison Table

| Location | Purpose | React? | Backend? | Example |
|----------|---------|--------|----------|---------|
| `src/utils/` | Frontend utilities | ❌ No | ❌ No | Formatters, validators |
| `src/hooks/` | React integration | ✅ Yes | ❌ No | usePowerFlowSDK, useUndoRedo |
| `src/sdk/utils/` | SDK utilities | ❌ No | ✅ Yes | EventEmitter, API errors |

## Summary

**Yes, `src/utils/` stores frontend functionality**, but specifically:
- ✅ **Frontend** = Runs in browser (not backend/server)
- ✅ **Non-React** = Pure JavaScript/TypeScript (no React dependencies)
- ✅ **Reusable** = Can be used by multiple components
- ✅ **Testable** = Can be tested without React

The undo/redo manager is:
- ✅ Frontend functionality (runs in browser)
- ✅ Non-React (pure class, no React dependencies)
- ✅ Not SDK-related (doesn't call backend APIs)
- ✅ Perfect fit for `src/utils/undo-redo/`

The React hook (`useUndoRedo`) goes in `src/hooks/` because it:
- ✅ Uses React (useState, useEffect)
- ✅ Wraps the utility (UndoRedoManager)
- ✅ Provides React-friendly API

