# Config Directory

This directory contains application configuration files organized by concern.

## Purpose

Technical configuration files for application infrastructure:
- **API Configuration**: URLs, endpoints, timeouts
- **App Settings**: Environment variables, feature flags
- **Infrastructure**: Logging, monitoring, client settings

## Files

### `api.ts`
- **Purpose**: API client configuration and utilities
- **Contains**: Base URL, timeout settings, HTTP client methods
- **When to use**: All API calls across the application

## Adding New Configuration

### Should go in `config/` if:
- ✅ Technical infrastructure settings
- ✅ API endpoints and URLs
- ✅ Application-level constants
- ✅ Environment configuration

### Should NOT go in `config/` if:
- ❌ Domain-specific parameter definitions
- ❌ Feature-specific logic
- ❌ Complex business rules
- ❌ Component-specific state

Instead, put them in:
- `src/parameters/` - Domain parameter definitions
- `src/features/{FeatureName}/types.ts` - Feature types
- `src/types/` - Global TypeScript types
- `src/sdk/types/` - SDK-related types

## Examples

### Good Config Files

```typescript
// config/api.ts - Infrastructure config
export const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8080';

// config/theme.ts - App-wide theme config
export const THEME_COLORS = { primary: '#007AFF', ... };

// config/routes.ts - Routing configuration
export const ROUTES = { home: '/', dashboard: '/dashboard' };

// config/validation.ts - Shared validation rules
export const VALIDATION_RULES = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  minLength: (len: number) => ({ min: len })
};
```

### Not Config Files (Belong Elsewhere)

```typescript
// ❌ Feature-specific constants → features/NetworkDataTable/constants.ts
export const TABLE_COLUMNS = [...];

// ❌ Component-specific types → components/Button/Button.types.ts
export interface ButtonProps { ... }

// ❌ Business logic → features/ or services/
export function calculatePowerFlow(...) { ... }

// ❌ State management → hooks/ or context/
export function useState() { ... }

// ❌ SDK constants → src/sdk/types/
export const SDK_CONSTANTS = { ... };
```

