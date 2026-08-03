# Common Components

This directory contains reusable, generic components that can be used throughout the application.

## Guidelines

- Components should be **generic** and **reusable**
- No business logic or feature-specific code
- Should work independently of the app's domain
- Well-documented props and usage

## Structure

Each component should have its own folder:

```
ComponentName/
├── ComponentName.tsx           # Main component
├── ComponentName.test.tsx      # Tests
├── ComponentName.module.css    # Styles (optional)
├── types.ts                    # TypeScript types (if needed)
└── index.ts                    # Public API
```

## Examples

Good common components:
- Button
- Input
- Modal
- Card
- Loading spinner
- Toast notifications
- Dropdown
- Table
- Pagination

Bad (these should be in features/):
- PowerFlowDiagram (feature-specific)
- UserProfileCard (domain-specific)
- CheckoutForm (business logic)

## Usage Example

```typescript
import { Button } from '@/components/common/Button';

<Button variant="primary" size="large" onClick={handleClick}>
  Submit
</Button>
```