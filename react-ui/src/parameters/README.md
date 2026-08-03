# Parameters Directory

This directory contains parameter definitions and schemas for domain entities in the power flow system.

## Purpose

Parameter definitions include:
- **Field Schemas**: Parameter names, types, labels, units
- **Validation Rules**: Min/max values, allowed options
- **UI Metadata**: How parameters should be displayed and edited
- **Element Identifiers**: Fields that uniquely identify elements

## Files

### `networkElements.ts`
- **Purpose**: Power flow network element parameter definitions
- **Contains**: 
  - `ELEMENT_IDENTIFIERS`: Unique identifier fields for each element type
  - `ELEMENT_PARAMETER_CATEGORIES`: Categorized parameter definitions
  - `getParameterCategories()`: Function to retrieve element parameters
- **Element Types**: Bus, Generator, Load, AC Line, Transformer, Fixed Shunt, Switched Shunt
- **Used by**: NetworkDataTable, ParameterEditorModal, element editors

## Structure

Each element type has parameter categories that define:

```typescript
{
  name: string;              // Category name (e.g., "Power Output")
  fields: ParameterField[];  // Array of field definitions
}

// Field Definition
{
  name: string;              // Parameter name in data (e.g., 'pg')
  label: string;             // Display label (e.g., 'Real Power')
  type: 'text' | 'int' | 'float' | 'boolean' | 'select';
  unit?: string;             // Display unit (e.g., 'MW', 'pu')
  min?: number;              // Minimum value
  max?: number;              // Maximum value
  step?: number;             // Increment step
  options?: Array<{          // For select types
    value: string | number;
    label: string;
  }>;
}
```

## Example Usage

```typescript
import { 
  ELEMENT_IDENTIFIERS, 
  getParameterCategories 
} from '../parameters';

// Get identifier fields for an element type
const identifiers = ELEMENT_IDENTIFIERS['bus']; // ['ibus']

// Get parameter categories for editing
const categories = getParameterCategories('generator', rowData);
// Returns categorized parameter definitions with UI metadata
```

## When to Add New Parameters

Add to this directory when you need to:
- ✅ Define how element parameters should be displayed/edited
- ✅ Add validation rules for parameter values
- ✅ Organize parameters into logical categories
- ✅ Specify field types, units, and constraints
- ✅ Define identifier fields for new element types

## Relationship to Other Directories

- **`config/`**: Technical configuration (API URLs, app settings)
- **`parameters/`**: Domain parameter schemas (this directory)
- **`types/`**: TypeScript type definitions
- **`sdk/types/`**: SDK data structure types
- **`components/`**: UI components that use these parameters

This separation keeps:
- Technical config separate from domain definitions
- Parameter metadata separate from data structures
- UI logic separate from data schemas

