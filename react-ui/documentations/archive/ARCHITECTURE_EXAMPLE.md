# Architecture Example: Power Flow Feature

This is a complete example showing how to implement a large feature with proper architecture.

## Feature Structure

```
src/features/PowerFlow/
├── components/
│   ├── PowerFlowDashboard/
│   │   ├── PowerFlowDashboard.tsx
│   │   ├── PowerFlowDashboard.module.css
│   │   ├── components/
│   │   │   ├── FileUploadSection.tsx
│   │   │   ├── AnalysisControls.tsx
│   │   │   ├── ResultsDisplay.tsx
│   │   │   └── HealthIndicator.tsx
│   │   └── index.ts
│   │
│   ├── ResultsTable/
│   │   ├── ResultsTable.tsx
│   │   ├── components/
│   │   │   ├── BusResultsTable.tsx
│   │   │   ├── BranchResultsTable.tsx
│   │   │   └── SystemSummary.tsx
│   │   └── index.ts
│   │
│   └── PowerFlowDiagram/
│       ├── PowerFlowDiagram.tsx
│       ├── components/
│       │   ├── BusNode.tsx
│       │   ├── BranchLine.tsx
│       │   └── Legend.tsx
│       └── index.ts
│
├── hooks/
│   ├── usePowerFlow.ts
│   ├── useFileUpload.ts
│   ├── useHealthCheck.ts
│   └── index.ts
│
├── services/
│   └── powerFlowApi.ts
│
├── types/
│   └── powerFlow.types.ts
│
├── utils/
│   ├── formatters.ts
│   └── validators.ts
│
└── index.ts
```

## Implementation

### 1. Types Definition

```typescript
// src/features/PowerFlow/types/powerFlow.types.ts

export interface BusResult {
  bus_number: number;
  voltage_mag: number;
  voltage_angle_deg: number;
  net_p_injection: number;
  net_q_injection: number;
}

export interface BranchResult {
  from_bus: number;
  to_bus: number;
  id: string;
  p_flow: number;
  q_flow: number;
  s_flow: number;
  power_loss: number;
}

export interface SystemSummary {
  total_load_mw: number;
  total_generation_mw: number;
  total_losses_mw: number;
  efficiency_percent: number;
}

export interface PowerFlowResult {
  converged: boolean;
  solution_time_ms: number;
  bus_results: BusResult[];
  branch_results: BranchResult[];
  system_summary: SystemSummary;
}

export type AnalysisMethod = 'dc' | 'ac' | 'fast_decoupled';

export interface PowerFlowConfig {
  method: AnalysisMethod;
  tolerance?: number;
  max_iterations?: number;
}
```

### 2. API Service

```typescript
// src/features/PowerFlow/services/powerFlowApi.ts

import { apiClient } from '@/config/api';
import type { PowerFlowResult, AnalysisMethod } from '../types/powerFlow.types';

export const powerFlowApi = {
  /**
   * Upload a power flow data file
   */
  uploadFile: async (file: File, userId: string): Promise<{ session_id: string }> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('user_id', userId);

    const response = await fetch(`${window.API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('File upload failed');
    }

    return response.json();
  },

  /**
   * Run power flow analysis
   */
  analyze: async (
    sessionId: string,
    method: AnalysisMethod,
    userId: string
  ): Promise<PowerFlowResult> => {
    return apiClient.post('/solve', {
      session_id: sessionId,
      method,
      user_id: userId,
    });
  },

  /**
   * Get cached results
   */
  getResults: async (sessionId: string): Promise<PowerFlowResult | null> => {
    try {
      return await apiClient.get(`/results/${sessionId}`);
    } catch {
      return null;
    }
  },

  /**
   * Check health status
   */
  checkHealth: async (): Promise<{ status: string; timestamp: string }> => {
    return apiClient.get('/health');
  },
};
```

### 3. Custom Hooks

```typescript
// src/features/PowerFlow/hooks/usePowerFlow.ts

import { useState, useCallback } from 'react';
import { powerFlowApi } from '../services/powerFlowApi';
import type { PowerFlowResult, AnalysisMethod } from '../types/powerFlow.types';

interface UsePowerFlowReturn {
  results: PowerFlowResult | null;
  loading: boolean;
  error: string | null;
  analyze: (sessionId: string, method: AnalysisMethod, userId: string) => Promise<void>;
  clearResults: () => void;
  clearError: () => void;
}

export const usePowerFlow = (): UsePowerFlowReturn => {
  const [results, setResults] = useState<PowerFlowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (
    sessionId: string,
    method: AnalysisMethod,
    userId: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      const data = await powerFlowApi.analyze(sessionId, method, userId);
      setResults(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    results,
    loading,
    error,
    analyze,
    clearResults,
    clearError,
  };
};
```

```typescript
// src/features/PowerFlow/hooks/useFileUpload.ts

import { useState, useCallback } from 'react';
import { powerFlowApi } from '../services/powerFlowApi';

interface UseFileUploadReturn {
  file: File | null;
  sessionId: string;
  uploading: boolean;
  error: string | null;
  uploadFile: (file: File, userId: string) => Promise<void>;
  clearFile: () => void;
}

export const useFileUpload = (): UseFileUploadReturn => {
  const [file, setFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File, userId: string) => {
    setUploading(true);
    setError(null);

    try {
      const data = await powerFlowApi.uploadFile(file, userId);
      setFile(file);
      setSessionId(data.session_id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setFile(null);
      setSessionId('');
    } finally {
      setUploading(false);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setSessionId('');
    setError(null);
  }, []);

  return {
    file,
    sessionId,
    uploading,
    error,
    uploadFile,
    clearFile,
  };
};
```

```typescript
// src/features/PowerFlow/hooks/index.ts

export { usePowerFlow } from './usePowerFlow';
export { useFileUpload } from './useFileUpload';
export { useHealthCheck } from './useHealthCheck';
```

### 4. Main Feature Component

```typescript
// src/features/PowerFlow/components/PowerFlowDashboard/PowerFlowDashboard.tsx

import React, { useState } from 'react';
import { usePowerFlow } from '../../hooks/usePowerFlow';
import { useFileUpload } from '../../hooks/useFileUpload';
import { useHealthCheck } from '../../hooks/useHealthCheck';
import { FileUploadSection } from './components/FileUploadSection';
import { AnalysisControls } from './components/AnalysisControls';
import { ResultsDisplay } from './components/ResultsDisplay';
import { HealthIndicator } from './components/HealthIndicator';
import type { AnalysisMethod } from '../../types/powerFlow.types';
import styles from './PowerFlowDashboard.module.css';

interface PowerFlowDashboardProps {
  userId: string;
}

export const PowerFlowDashboard: React.FC<PowerFlowDashboardProps> = ({ userId }) => {
  const [method, setMethod] = useState<AnalysisMethod>('dc');
  
  const fileUpload = useFileUpload();
  const powerFlow = usePowerFlow();
  const health = useHealthCheck();

  const handleAnalyze = async () => {
    if (!fileUpload.sessionId) return;
    await powerFlow.analyze(fileUpload.sessionId, method, userId);
  };

  const handleFileChange = async (file: File) => {
    powerFlow.clearResults();
    await fileUpload.uploadFile(file, userId);
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1>Power Flow Analysis</h1>
        <HealthIndicator status={health.status} message={health.message} />
      </header>

      <div className={styles.content}>
        <section className={styles.controls}>
          <FileUploadSection
            file={fileUpload.file}
            sessionId={fileUpload.sessionId}
            uploading={fileUpload.uploading}
            error={fileUpload.error}
            onFileChange={handleFileChange}
            onClear={fileUpload.clearFile}
          />

          <AnalysisControls
            method={method}
            disabled={!fileUpload.sessionId || powerFlow.loading}
            loading={powerFlow.loading}
            onMethodChange={setMethod}
            onAnalyze={handleAnalyze}
          />
        </section>

        {powerFlow.error && (
          <div className={styles.error}>
            {powerFlow.error}
          </div>
        )}

        {powerFlow.results && (
          <ResultsDisplay results={powerFlow.results} />
        )}
      </div>
    </div>
  );
};
```

### 5. Subcomponents

```typescript
// src/features/PowerFlow/components/PowerFlowDashboard/components/AnalysisControls.tsx

import React from 'react';
import type { AnalysisMethod } from '../../../types/powerFlow.types';

interface AnalysisControlsProps {
  method: AnalysisMethod;
  disabled: boolean;
  loading: boolean;
  onMethodChange: (method: AnalysisMethod) => void;
  onAnalyze: () => void;
}

export const AnalysisControls: React.FC<AnalysisControlsProps> = ({
  method,
  disabled,
  loading,
  onMethodChange,
  onAnalyze,
}) => {
  return (
    <div className="analysis-controls">
      <h3>Analysis Method</h3>
      
      <select
        value={method}
        onChange={(e) => onMethodChange(e.target.value as AnalysisMethod)}
        disabled={disabled}
      >
        <option value="dc">DC Power Flow</option>
        <option value="ac">AC Power Flow</option>
        <option value="fast_decoupled">Fast Decoupled</option>
      </select>

      <button
        onClick={onAnalyze}
        disabled={disabled}
      >
        {loading ? 'Analyzing...' : 'Run Analysis'}
      </button>
    </div>
  );
};
```

### 6. Public API (Index Files)

```typescript
// src/features/PowerFlow/index.ts

// Export main components
export { PowerFlowDashboard } from './components/PowerFlowDashboard';
export { ResultsTable } from './components/ResultsTable';
export { PowerFlowDiagram } from './components/PowerFlowDiagram';

// Export hooks
export { usePowerFlow, useFileUpload, useHealthCheck } from './hooks';

// Export types
export type {
  PowerFlowResult,
  BusResult,
  BranchResult,
  SystemSummary,
  AnalysisMethod,
  PowerFlowConfig,
} from './types/powerFlow.types';

// Export services (if needed externally)
export { powerFlowApi } from './services/powerFlowApi';
```

### 7. Usage in App

```typescript
// src/App.tsx

import React, { Suspense, lazy } from 'react';
import { Loading } from '@/components/common/Loading';

// Lazy load the feature
const PowerFlowDashboard = lazy(() =>
  import('@/features/PowerFlow').then(module => ({
    default: module.PowerFlowDashboard
  }))
);

function App() {
  const userId = 'demo_user';

  return (
    <div className="app">
      <Suspense fallback={<Loading />}>
        <PowerFlowDashboard userId={userId} />
      </Suspense>
    </div>
  );
}

export default App;
```

## Benefits of This Architecture

### ✅ Scalability
- Easy to add new features
- Clear boundaries between features
- Can grow to hundreds of components

### ✅ Maintainability
- Related code lives together
- Easy to find files
- Clear dependencies

### ✅ Testability
- Each piece can be tested in isolation
- Mock data is co-located
- Hooks can be tested separately

### ✅ Reusability
- Features can be extracted to packages
- Components are well-encapsulated
- Types are shareable

### ✅ Performance
- Easy to implement code splitting
- Lazy loading at feature level
- Minimal bundle size

### ✅ Team Collaboration
- Multiple developers can work on different features
- Clear ownership
- Minimal merge conflicts

## Common Patterns

### Pattern 1: Container/Presentational Split

```typescript
// Container (smart component with logic)
const PowerFlowDashboardContainer = () => {
  const powerFlow = usePowerFlow();
  // ... all the logic
  
  return <PowerFlowDashboard {...powerFlow} />;
};

// Presentational (dumb component, just UI)
const PowerFlowDashboard = ({ results, loading, error }) => {
  return (
    // ... just JSX, no logic
  );
};
```

### Pattern 2: Compound Components

```typescript
// Allow flexible composition
export const ResultsDisplay = ({ results }) => (
  <div>
    <ResultsDisplay.Header />
    <ResultsDisplay.BusResults data={results.bus_results} />
    <ResultsDisplay.BranchResults data={results.branch_results} />
    <ResultsDisplay.Summary data={results.system_summary} />
  </div>
);

ResultsDisplay.Header = () => <header>Results</header>;
ResultsDisplay.BusResults = ({ data }) => <div>{/* ... */}</div>;
ResultsDisplay.BranchResults = ({ data }) => <div>{/* ... */}</div>;
ResultsDisplay.Summary = ({ data }) => <div>{/* ... */}</div>;
```

### Pattern 3: Render Props

```typescript
<DataFetcher
  url="/api/data"
  render={({ data, loading, error }) => (
    loading ? <Loading /> :
    error ? <Error message={error} /> :
    <DataDisplay data={data} />
  )}
/>
```

This architecture will scale with your project from 10 components to 1000+!