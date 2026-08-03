# React Application Architecture

## Project Structure

```
src/
├── assets/                      # Static assets (images, fonts, etc.)
│   ├── images/
│   ├── icons/
│   └── fonts/
│
├── components/                  # Reusable components
│   ├── common/                  # Generic reusable components
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.test.tsx
│   │   │   ├── Button.module.css
│   │   │   └── index.ts
│   │   ├── Input/
│   │   ├── Modal/
│   │   ├── Card/
│   │   └── Loading/
│   │
│   ├── layout/                  # Layout components
│   │   ├── Header/
│   │   ├── Footer/
│   │   ├── Sidebar/
│   │   └── PageLayout/
│   │
│   └── ui/                      # UI-specific components
│       ├── LanguageSwitcher/
│       └── ThemeToggle/
│
├── features/                    # Feature-based modules
│   ├── PowerFlow/              # Example: Power flow feature
│   │   ├── components/         # Feature-specific components
│   │   │   ├── PowerFlowDiagram/
│   │   │   │   ├── PowerFlowDiagram.tsx
│   │   │   │   ├── components/
│   │   │   │   │   ├── BusNode.tsx
│   │   │   │   │   ├── BranchLine.tsx
│   │   │   │   │   └── Legend.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useDiagramLayout.ts
│   │   │   │   ├── utils/
│   │   │   │   │   └── calculations.ts
│   │   │   │   └── index.ts
│   │   │   ├── ResultsTable/
│   │   │   └── MethodSelector/
│   │   ├── hooks/              # Feature-specific hooks
│   │   │   ├── usePowerFlow.ts
│   │   │   └── useResults.ts
│   │   ├── services/           # Feature API calls
│   │   │   └── powerFlowApi.ts
│   │   ├── types/              # Feature types
│   │   │   └── powerFlow.types.ts
│   │   ├── utils/              # Feature utilities
│   │   │   └── formatrs.ts
│   │   └── index.ts            # Public API
│   │
│   ├── FileUpload/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── index.ts
│   │
│   └── Analysis/
│       ├── components/
│       ├── hooks/
│       └── index.ts
│
├── hooks/                       # Global custom hooks
│   ├── useTranslation.ts
│   ├── useAuth.ts
│   ├── useLocalStorage.ts
│   └── useDebounce.ts
│
├── services/                    # API services
│   ├── api/
│   │   ├── client.ts           # API client setup
│   │   ├── endpoints.ts        # API endpoints
│   │   └── interceptors.ts     # Request/response interceptors
│   └── websocket/
│       └── wsClient.ts
│
├── store/                       # State management (if using Redux/Zustand)
│   ├── slices/
│   ├── actions/
│   └── store.ts
│
├── contexts/                    # React Context providers
│   ├── AuthContext.tsx
│   ├── ThemeContext.tsx
│   └── AppContext.tsx
│
├── config/                      # Configuration files
│   ├── api.ts                  # API configuration
│   ├── constants.ts            # App constants
│   └── environment.ts          # Environment variables
│
├── utils/                       # Global utility functions
│   ├── formatrs.ts
│   ├── validators.ts
│   ├── helpers.ts
│   └── date.ts
│
├── types/                       # Global TypeScript types
│   ├── global.d.ts
│   ├── api.types.ts
│   └── common.types.ts
│
├── i18n/                        # Internationalization
│   ├── locales/
│   ├── index.ts
│   └── types.ts
│
├── styles/                      # Global styles
│   ├── variables.css
│   ├── mixins.css
│   └── global.css
│
├── pages/                       # Page components (if using routing)
│   ├── HomePage/
│   ├── DashboardPage/
│   └── NotFoundPage/
│
├── App.tsx                      # Root component
├── App.css
├── index.tsx                    # Entry point
└── index.css
```

## Key Principles

### 1. Feature-Based Organization

Large features live in `features/` with their own:
- Components
- Hooks
- Services
- Types
- Utils

**Benefits:**
- Easy to find related code
- Can be extracted to a separate package
- Clear boundaries
- Better code splitting

### 2. Component Structure

Each component gets its own folder:

```
ComponentName/
├── ComponentName.tsx           # Main component
├── ComponentName.test.tsx      # Tests
├── ComponentName.module.css    # Styles (if using CSS modules)
├── components/                 # Sub-components (if complex)
│   ├── SubComponent1.tsx
│   └── SubComponent2.tsx
├── hooks/                      # Component-specific hooks
│   └── useComponentLogic.ts
├── utils/                      # Component-specific utilities
│   └── helpers.ts
├── types.ts                    # Component types
└── index.ts                    # Public API
```

### 3. Index Files as Public APIs

Always export through `index.ts`:

```typescript
// features/PowerFlow/index.ts
export { PowerFlowDiagram } from './components/PowerFlowDiagram';
export { usePowerFlow } from './hooks/usePowerFlow';
export type { PowerFlowResult } from './types/powerFlow.types';
```

### 4. Component Complexity Levels

#### Small Components (< 100 lines)
```
Button/
├── Button.tsx
└── index.ts
```

#### Medium Components (100-300 lines)
```
DataTable/
├── DataTable.tsx
├── DataTable.module.css
├── types.ts
└── index.ts
```

#### Large Components (> 300 lines)
Break into subcomponents:
```
Dashboard/
├── Dashboard.tsx               # Main orchestrator
├── Dashboard.module.css
├── components/                 # Private subcomponents
│   ├── DashboardHeader.tsx
│   ├── DashboardSidebar.tsx
│   ├── DashboardContent.tsx
│   └── widgets/
│       ├── StatWidget.tsx
│       └── ChartWidget.tsx
├── hooks/
│   ├── useDashboardData.ts
│   └── useDashboardFilters.ts
├── utils/
│   └── dataTransformers.ts
├── types.ts
└── index.ts
```

## Best Practices

### 1. Naming Conventions

```typescript
// Components: PascalCase
const UserProfile: React.FC = () => { }

// Files: Match component name
UserProfile.tsx

// Hooks: camelCase with 'use' prefix
const useUserData = () => { }

// Utils: camelCase
const formatCurrency = () => { }

// Constants: UPPER_SNAKE_CASE
const API_TIMEOUT = 5000;

// Types/Interfaces: PascalCase
interface UserData { }
type ApiResponse = { }
```

### 2. Component Composition

**Bad: Monolithic Component**
```typescript
// ❌ Too much in one component
function Dashboard() {
  // 500 lines of logic
  return (
    <div>
      {/* 200 lines of JSX */}
    </div>
  );
}
```

**Good: Composed Components**
```typescript
// ✅ Split into logical pieces
function Dashboard() {
  const { data, loading } = useDashboardData();
  
  return (
    <DashboardLayout>
      <DashboardHeader />
      <DashboardStats data={data} />
      <DashboardCharts data={data} />
      <DashboardTable data={data} loading={loading} />
    </DashboardLayout>
  );
}
```

### 3. Custom Hooks for Logic

Extract complex logic to hooks:

```typescript
// hooks/usePowerFlow.ts
export const usePowerFlow = (sessionId: string) => {
  const [results, setResults] = useState<PowerFlowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async (method: string) => {
    setLoading(true);
    try {
      const data = await powerFlowApi.analyze(sessionId, method);
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return { results, loading, error, runAnalysis };
};
```

### 4. Type Safety

```typescript
// types/powerFlow.types.ts
export interface BusResult {
  bus_number: number;
  voltage_mag: number;
  voltage_angle_deg: number;
}

export interface PowerFlowResult {
  converged: boolean;
  solution_time_ms: number;
  bus_results: BusResult[];
}

export interface PowerFlowProps {
  sessionId: string;
  onComplete?: (results: PowerFlowResult) => void;
}
```

### 5. Service Layer

```typescript
// services/api/powerFlowApi.ts
import { apiClient } from '@/config/api';
import type { PowerFlowResult } from '@/types/powerFlow.types';

export const powerFlowApi = {
  analyze: async (sessionId: string, method: string): Promise<PowerFlowResult> => {
    return apiClient.post('/api/power-flow/analyze', {
      session_id: sessionId,
      method,
    });
  },

  getResults: async (sessionId: string): Promise<PowerFlowResult> => {
    return apiClient.get(`/api/power-flow/results/${sessionId}`);
  },
};
```

## State Management Strategy

### Local State (useState)
- Component-specific UI state
- Form inputs
- Toggle states

### Context API
- Theme
- Authentication
- Language/i18n
- Global UI state (modals, notifications)

### External State Management (Redux/Zustand)
- Complex shared state
- Heavy caching requirements
- Time-travel debugging needs
- Large team coordination

**Recommendation**: Start with Context API, add Redux/Zustand only if needed.

## Import Aliases

Configure path aliases in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": "src",
    "paths": {
      "@/components/*": ["components/*"],
      "@/features/*": ["features/*"],
      "@/hooks/*": ["hooks/*"],
      "@/utils/*": ["utils/*"],
      "@/types/*": ["types/*"],
      "@/config/*": ["config/*"],
      "@/services/*": ["services/*"]
    }
  }
}
```

Usage:
```typescript
// Instead of
import { Button } from '../../../components/common/Button';

// Use
import { Button } from '@/components/common/Button';
```

## Performance Optimization

### 1. Code Splitting
```typescript
// Lazy load features
const PowerFlowFeature = lazy(() => import('@/features/PowerFlow'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <PowerFlowFeature />
    </Suspense>
  );
}
```

### 2. Memoization
```typescript
// Memo for expensive components
export const ExpensiveChart = memo(({ data }: Props) => {
  // Complex rendering
}, (prev, next) => prev.data === next.data);

// useMemo for expensive calculations
const processedData = useMemo(
  () => complexCalculation(rawData),
  [rawData]
);

// useCallback for stable function references
const handleSubmit = useCallback(
  (data) => submitData(data),
  []
);
```

## Testing Strategy

```
ComponentName/
├── ComponentName.tsx
├── ComponentName.test.tsx      # Unit tests
├── ComponentName.integration.test.tsx  # Integration tests
└── __mocks__/                  # Mock data
    └── mockData.ts
```

## Example: Large Feature Implementation

See `ARCHITECTURE_EXAMPLE.md` for a complete working example.

## Migration Path

If you have existing code:

1. **Start with new features** - Use new structure for new code
2. **Gradually refactor** - Move related files together
3. **Create index files** - Add public APIs
4. **Update imports** - Use new paths
5. **Extract components** - Break down large components
6. **Add types** - Improve type safety

## Next Steps

1. Review the example implementation
2. Plan your feature boundaries
3. Set up path aliases
4. Create folder structure
5. Start building!