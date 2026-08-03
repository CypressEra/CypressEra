# Dialog Manager System

A centralized dialog management system that allows you to manage all dialogs from a single place, keeping your main App component clean and organized.

## Features

✅ **Centralized Management** - All dialogs managed in one place  
✅ **Type-Safe** - TypeScript support with dialog IDs  
✅ **Clean API** - Simple hook-based interface  
✅ **Scalable** - Easy to add new dialogs  
✅ **No Clutter** - Keeps App.tsx clean even with dozens of dialogs  

## Basic Usage

### 1. Wrap your app with DialogProvider (in index.tsx)

```tsx
// src/index.tsx
import { DialogProvider } from './components/common';
import App from './App';

root.render(
  <DialogProvider>
    <App />
  </DialogProvider>
);
```

### 2. Add DialogManager inside your App component

```tsx
// src/App.tsx
import { DialogManager } from './components/common';

function App() {
  return (
    <div className="app-container">
      {/* Your app content */}
      <DialogManager />
    </div>
  );
}
```

**Note:** This pattern follows React best practices where:
- The provider wraps the entire app at the root level (in `index.tsx`)
- The manager component is placed inside the app component (in `App.tsx`)
- This keeps the structure consistent with other providers like `ThemeProvider` and `LanguageProvider`

### 3. Use the `useDialog` hook to open dialogs

```tsx
import { useDialog, DIALOG_IDS } from './components/common';
import { About } from './components/features';

function MyComponent() {
  const { openDialog, closeDialog } = useDialog();

  const handleOpenAbout = () => {
    openDialog(DIALOG_IDS.ABOUT, About);
  };

  return <button onClick={handleOpenAbout}>About</button>;
}
```

### 4. Register new dialog IDs

Add your dialog ID to `dialogIds.ts`:

```tsx
export const DIALOG_IDS = {
  ABOUT: 'about',
  SETTINGS: 'settings',
  CONFIRM_DELETE: 'confirm-delete',
  // Add more...
} as const;
```

## Example: Adding a New Dialog

### Step 1: Create your dialog component

```tsx
// src/components/features/Settings/Settings.tsx
export interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ isOpen, onClose }) => {
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Settings">
      {/* Your settings content */}
    </BaseModal>
  );
};
```

### Step 2: Add dialog ID

```tsx
// src/components/common/Dialog/dialogIds.ts
export const DIALOG_IDS = {
  ABOUT: 'about',
  SETTINGS: 'settings', // Add this
} as const;
```

### Step 3: Open the dialog

```tsx
import { useDialog, DIALOG_IDS } from './components/common';
import { Settings } from './components/features';

function MenuBar() {
  const { openDialog } = useDialog();

  const handleSettingsClick = () => {
    openDialog(DIALOG_IDS.SETTINGS, Settings);
  };

  return <button onClick={handleSettingsClick}>Settings</button>;
}
```

That's it! The dialog will automatically be rendered by `DialogManager`.

## API Reference

### `useDialog()`

Returns an object with:

- `openDialog(id, component, props?)` - Open a dialog
- `closeDialog(id)` - Close a dialog
- `isDialogOpen(id)` - Check if a dialog is open

### Dialog Component Requirements

Your dialog component must accept these props:

```tsx
interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  // ... your custom props
}
```

## Architecture

The dialog system follows a two-part structure:

1. **DialogProvider** (in `index.tsx`): Wraps the entire app to provide dialog context to all components
2. **DialogManager** (in `App.tsx`): Renders active dialogs inside the app component

This pattern:
- ✅ Follows React best practices for context providers
- ✅ Keeps dialogs at the app level (not root level) for proper z-index and styling
- ✅ Matches the structure of other providers (`ThemeProvider`, `LanguageProvider`)
- ✅ Ensures dialogs are rendered within the app's DOM hierarchy

## Benefits

1. **Clean App.tsx** - No need to import and render dozens of dialog components
2. **Centralized** - All dialogs managed in one place
3. **Type-Safe** - Dialog IDs prevent typos
4. **Scalable** - Easy to add new dialogs without touching App.tsx
5. **Reusable** - Open dialogs from anywhere in your app
6. **Standard Pattern** - Follows React community best practices

## Migration from Direct Dialog Usage

**Before:**
```tsx
function App() {
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // ... many more states

  return (
    <>
      {/* Many dialog components */}
      <About isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      {/* ... */}
    </>
  );
}
```

**After:**

```tsx
// src/index.tsx
import { DialogProvider } from './components/common';
import App from './App';

root.render(
  <DialogProvider>
    <App />
  </DialogProvider>
);
```

```tsx
// src/App.tsx
import { DialogManager } from './components/common';

function App() {
  return (
    <div className="app-container">
      {/* Your app content */}
      <DialogManager />
    </div>
  );
}
```

```tsx
// In any component:
const { openDialog } = useDialog();
openDialog(DIALOG_IDS.ABOUT, About);
```

