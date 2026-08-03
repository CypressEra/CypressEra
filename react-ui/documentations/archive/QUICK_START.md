# Quick Start Guide

## Project Architecture Overview

This project follows a **feature-based architecture** for scalability and maintainability.

## Folder Structure

```
src/
├── components/          # Reusable generic components
├── features/           # Feature-based modules (main work happens here)
├── hooks/              # Global custom hooks
├── services/           # API services
├── config/             # Configuration (API, constants)
├── utils/              # Utility functions
├── types/              # Global TypeScript types
├── contexts/           # React Context providers
├── i18n/               # Internationalization
└── assets/             # Static assets
```

## Creating a New Feature

### 1. Set Up the Feature Structure

```bash
mkdir -p src/features/MyFeature/{components,hooks,services,types,utils}
```

### 2. Define Types

```typescript
// src/features/MyFeature/types/myFeature.types.ts
export interface MyData {
  id: string;
  name: string;
}

export interface MyFeatureProps {
  userId: string;
  onComplete?: (data: MyData) => void;
}
```

### 3. Create API Service

```typescript
// src/features/MyFeature/services/myFeatureApi.ts
import { apiClient } from '@/config/api';
import type { MyData } from '../types/myFeature.types';

export const myFeatureApi = {
  getData: async (id: string): Promise<MyData> => {
    return apiClient.get(`/api/myfeature/${id}`);
  },

  saveData: async (data: MyData): Promise<MyData> => {
    return apiClient.post('/api/myfeature', data);
  },
};
```

### 4. Create Custom Hook

```typescript
// src/features/MyFeature/hooks/useMyFeature.ts
import { useState, useCallback } from 'react';
import { myFeatureApi } from '../services/myFeatureApi';
import type { MyData } from '../types/myFeature.types';

export const useMyFeature = () => {
  const [data, setData] = useState<MyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const result = await myFeatureApi.getData(id);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchData };
};
```

### 5. Create Main Component

```typescript
// src/features/MyFeature/components/MyFeatureMain/MyFeatureMain.tsx
import React, { useEffect } from 'react';
import { useMyFeature } from '../../hooks/useMyFeature';
import { Button } from '@/components/common/Button';
import type { MyFeatureProps } from '../../types/myFeature.types';

export const MyFeatureMain: React.FC<MyFeatureProps> = ({ 
  userId, 
  onComplete 
}) => {
  const { data, loading, error, fetchData } = useMyFeature();

  useEffect(() => {
    fetchData(userId);
  }, [userId, fetchData]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  return (
    <div>
      <h2>{data.name}</h2>
      <Button 
        onClick={() => onComplete?.(data)}
        variant="primary"
      >
        Complete
      </Button>
    </div>
  );
};
```

### 6. Export Public API

```typescript
// src/features/MyFeature/index.ts
export { MyFeatureMain } from './components/MyFeatureMain/MyFeatureMain';
export { useMyFeature } from './hooks/useMyFeature';
export type { MyData, MyFeatureProps } from './types/myFeature.types';
```

### 7. Use in App

```typescript
// src/App.tsx
import { MyFeatureMain } from '@/features/MyFeature';

function App() {
  return (
    <div className="app">
      <MyFeatureMain 
        userId="123" 
        onComplete={(data) => console.log(data)}
      />
    </div>
  );
}
```

## Creating a Reusable Component

### For Common Components (Generic, Reusable)

```bash
mkdir -p src/components/common/Card
```

```typescript
// src/components/common/Card/Card.tsx
import React from 'react';
import styles from './Card.module.css';

export interface CardProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ 
  title, 
  children, 
  className = '' 
}) => {
  return (
    <div className={`${styles.card} ${className}`}>
      {title && <h3 className={styles.title}>{title}</h3>}
      <div className={styles.content}>{children}</div>
    </div>
  );
};
```

```typescript
// src/components/common/Card/index.ts
export { Card } from './Card';
export type { CardProps } from './Card';
```

## Using Path Aliases

Instead of relative imports:
```typescript
// ❌ Confusing
import { Button } from '../../../components/common/Button';
```

Use path aliases:
```typescript
// ✅ Clear
import { Button } from '@/components/common/Button';
```

Available aliases:
- `@/components/*` - Common components
- `@/features/*` - Features
- `@/hooks/*` - Custom hooks
- `@/utils/*` - Utilities
- `@/types/*` - Types
- `@/config/*` - Configuration
- `@/services/*` - Services
- `@/contexts/*` - Contexts

## Best Practices

### ✅ Do

1. **Keep features independent**
   ```typescript
   // ✅ Good
   import { Button } from '@/components/common/Button';
   import { usePowerFlow } from '@/features/PowerFlow';
   ```

2. **Use TypeScript types**
   ```typescript
   // ✅ Good
   interface Props {
     userId: string;
     onComplete?: (data: MyData) => void;
   }
   ```

3. **Break down large components**
   ```typescript
   // ✅ Good
   <Dashboard>
     <DashboardHeader />
     <DashboardContent />
     <DashboardFooter />
   </Dashboard>
   ```

4. **Use custom hooks for logic**
   ```typescript
   // ✅ Good
   const { data, loading, error } = useMyFeature();
   ```

### ❌ Don't

1. **Import from feature internals**
   ```typescript
   // ❌ Bad
   import { Component } from '@/features/MyFeature/components/Component';
   
   // ✅ Good
   import { Component } from '@/features/MyFeature';
   ```

2. **Mix business logic with UI**
   ```typescript
   // ❌ Bad - logic in component
   const MyComponent = () => {
     const [data, setData] = useState();
     // 100 lines of API calls, data processing...
   }
   
   // ✅ Good - logic in hook
   const MyComponent = () => {
     const { data } = useMyData();
     // Just render UI
   }
   ```

3. **Create huge monolithic components**
   ```typescript
   // ❌ Bad - 500 lines in one file
   const Dashboard = () => {
     // Too much code...
   }
   
   // ✅ Good - broken into pieces
   const Dashboard = () => (
     <>
       <Header />
       <Content />
       <Sidebar />
     </>
   )
   ```

## Common Commands

```bash
# Development
npm start                    # Start dev server (no EJS)
npm run build               # Build for production
npm run serve               # Serve built app with EJS

# With custom API URL
API_BASE_URL=http://api.example.com:8080 npm run serve

# Testing
npm test                    # Run tests
npm test -- --coverage      # Run tests with coverage

# Linting
npm run lint               # Lint code (if configured)
```

## Next Steps

1. Read `ARCHITECTURE.md` for detailed architecture guide
2. See `ARCHITECTURE_EXAMPLE.md` for a complete example
3. Check `SERVER_SETUP.md` for deployment info
4. Start building your features!

## Need Help?

- Check the README files in each directory
- Look at existing code examples (Button component)
- Review the PowerFlow feature structure (when created)
- Read the architecture documentation