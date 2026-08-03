# ParameterEditorModal

A generic modal component for editing element parameters with categorized fields.

## Features

- **Generic Design**: Works with any element type by accepting dynamic categories and fields
- **Categorized Parameters**: Organize parameters into logical groups with collapsible sections
- **Multiple Input Types**: Support for text, int, float, boolean, and select (dropdown) inputs
- **Number Constraints**: Min/max values and step size for int/float inputs
- **Unit Display**: Units displayed inside input boxes for better space utilization
- **Validation**: Built-in disabled state for read-only fields
- **Change Tracking**: Only enables Apply button when values have changed
- **Responsive Layout**: Clean 2-column grid layout with proper spacing
- **macOS Style**: Consistent macOS design language throughout
- **Dark Mode Support**: Automatic dark mode adaptation via CSS variables
- **Internationalization**: Full i18n support using react-i18next

## Usage

```tsx
import { ParameterEditorModal, ParameterCategory } from '../components/common';

const [isOpen, setIsOpen] = useState(false);
const [busValues, setBusValues] = useState({
  name: 'Bus 1',
  baskv: 345.0,
  area: 1,
  zone: 1
});

// Define categories and fields
const busCategories: ParameterCategory[] = [
  {
    name: 'Basic Information',
    fields: [
      { name: 'name', label: 'Bus Name', type: 'text' },
      { name: 'baskv', label: 'Base Voltage', type: 'float', unit: 'kV' }
    ]
  },
  {
    name: 'Location',
    fields: [
      { name: 'area', label: 'Area', type: 'int' },
      { name: 'zone', label: 'Zone', type: 'int' }
    ]
  }
];

<ParameterEditorModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Edit Bus Parameters"
  categories={busCategories}
  values={busValues}
  onApply={(updatedValues) => {
    setBusValues(updatedValues);
    console.log('Applied values:', updatedValues);
  }}
/>
```

## API

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | required | Whether the modal is visible |
| `onClose` | `() => void` | required | Callback when modal should close |
| `categories` | `ParameterCategory[]` | required | Array of parameter categories |
| `values` | `Record<string, any>` | required | Initial values for each field |
| `onApply` | `(values) => void` | required | Callback when Apply is clicked |
| `title` | `string` | `'Edit Parameters'` | Modal title |
| `width` | `number \| string` | `600` | Modal width |
| `height` | `number \| string` | `500` | Modal height |

### Types

#### ParameterCategory

```typescript
interface ParameterCategory {
  name: string;
  fields: ParameterField[];
}
```

#### ParameterField

```typescript
interface ParameterField {
  name: string;              // Field identifier (used as key in values object)
  label: string;             // Display label
  type?: 'text' | 'int' | 'float' | 'boolean' | 'select';  // Input type
  placeholder?: string;      // Input placeholder
  disabled?: boolean;        // Whether field is read-only
  unit?: string;            // Unit symbol (e.g., 'kV', 'MW') - displayed inside input
  // For int/float inputs
  min?: number;             // Minimum value
  max?: number;             // Maximum value
  step?: number;            // Step size for increment/decrement (default: 1 for int, 0.01 for float)
  // For select inputs
  options?: Array<{ value: string | number; label: string }>;  // Dropdown options
}
```

## Examples

### Generator Parameters

```tsx
const generatorCategories: ParameterCategory[] = [
  {
    name: 'Power Output',
    fields: [
      { name: 'pg', label: 'Real Power', type: 'float', unit: 'MW', min: 0, max: 1000 },
      { name: 'qg', label: 'Reactive Power', type: 'float', unit: 'MVar', min: -500, max: 500 },
      { name: 'qt', label: 'Q Max', type: 'float', unit: 'MVar', min: 0 },
      { name: 'qb', label: 'Q Min', type: 'float', unit: 'MVar', max: 0 }
    ]
  },
  {
    name: 'Control',
    fields: [
      { name: 'vs', label: 'Voltage Setpoint', type: 'float', unit: 'pu', min: 0.9, max: 1.1, step: 0.01 },
      { name: 'ireg', label: 'Regulated Bus', type: 'int' },
      { 
        name: 'stat', 
        label: 'Status', 
        type: 'select',
        options: [
          { value: 0, label: 'Offline' },
          { value: 1, label: 'Online' }
        ]
      }
    ]
  }
];
```

### AC Line Parameters

```tsx
const lineCategories: ParameterCategory[] = [
  {
    name: 'Impedance',
    fields: [
      { name: 'rpu', label: 'Resistance', type: 'float', unit: 'pu' },
      { name: 'xpu', label: 'Reactance', type: 'float', unit: 'pu' },
      { name: 'bpu', label: 'Susceptance', type: 'float', unit: 'pu' }
    ]
  },
  {
    name: 'Ratings',
    fields: [
      { name: 'rate1', label: 'Rating 1', type: 'float', unit: 'MVA' },
      { name: 'rate2', label: 'Rating 2', type: 'float', unit: 'MVA' },
      { name: 'len', label: 'Length', type: 'float', unit: 'miles' }
    ]
  }
];
```

### Transformers

```tsx
const transformerCategories: ParameterCategory[] = [
  {
    name: 'Buses',
    fields: [
      { name: 'ibus', label: 'From Bus', type: 'int', disabled: true },
      { name: 'jbus', label: 'To Bus', type: 'int', disabled: true },
      { name: 'kbus', label: 'Tertiary Bus', type: 'int' },
      { name: 'ckt', label: 'Circuit ID', type: 'text', disabled: true }
    ]
  },
  {
    name: 'Impedance',
    fields: [
      { name: 'r1_2', label: 'R 1-2', type: 'float', unit: 'pu' },
      { name: 'x1_2', label: 'X 1-2', type: 'float', unit: 'pu' },
      { name: 'sbase1_2', label: 'Base MVA 1-2', type: 'float', unit: 'MVA' }
    ]
  }
];
```

### Using Select Dropdown

```tsx
const categories: ParameterCategory[] = [
  {
    name: 'Configuration',
    fields: [
      {
        name: 'type',
        label: 'Element Type',
        type: 'select',
        options: [
          { value: 'bus', label: 'Bus' },
          { value: 'generator', label: 'Generator' },
          { value: 'load', label: 'Load' }
        ]
      },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: 0, label: 'Inactive' },
          { value: 1, label: 'Active' }
        ]
      }
    ]
  }
];
```

### Using Number Constraints

```tsx
const categories: ParameterCategory[] = [
  {
    name: 'Voltage Settings',
    fields: [
      {
        name: 'voltage',
        label: 'Voltage',
        type: 'float',
        unit: 'kV',
        min: 0,
        max: 765,
        step: 0.1
      },
      {
        name: 'angle',
        label: 'Angle',
        type: 'float',
        unit: 'deg',
        min: -180,
        max: 180,
        step: 0.01
      }
    ]
  }
];
```

## Styling

The component uses CSS modules ([ParameterEditorModal.module.css](ParameterEditorModal.module.css)) and CSS variables for theming. It follows the design system established by other common components.

### Layout

- **2-Column Grid**: Fields are displayed in a 2-column grid layout ([`.fieldsGrid`](ParameterEditorModal.module.css#L28-L33))
- **Field Rows**: Each field consists of a label and input container ([`.fieldRow`](ParameterEditorModal.module.css#L35-L40))
- **Scrollable Content**: Long forms scroll within the modal with custom scrollbar styling ([`.content`](ParameterEditorModal.module.css#L1-L7))

### Dark Mode

The component automatically adapts to dark mode through two mechanisms:

1. **Class-based dark mode** (`html.dark`): Respects manual dark mode toggle ([lines 215-236](ParameterEditorModal.module.css#L215-L236))
2. **System preference**: Uses `@media (prefers-color-scheme: dark)` ([lines 238-271](ParameterEditorModal.module.css#L238-L271))

Dark mode adjustments include:
- Input border colors (lighter for visibility)
- Hover states (enhanced box-shadow)
- Dropdown arrow colors
- Category title borders

### CSS Variables

The component uses these CSS variables for theming:
- `--text-primary` / `--text-secondary` / `--text-tertiary` - Text colors
- `--bg-primary` / `--bg-secondary` - Background colors
- `--border-secondary` - Border colors

### Key Classes

- `.content` - Main content container with scrolling ([line 1](ParameterEditorModal.module.css#L1))
- `.category` - Category container with bottom margin ([line 9](ParameterEditorModal.module.css#L9))
- `.categoryTitle` - Category header with uppercase styling ([line 17](ParameterEditorModal.module.css#L17))
- `.fieldsGrid` - 2-column grid layout for fields ([line 28](ParameterEditorModal.module.css#L28))
- `.fieldRow` - Single field row with label and input ([line 35](ParameterEditorModal.module.css#L35))
- `.fieldLabel` - Field label with 130px width ([line 42](ParameterEditorModal.module.css#L42))
- `.fieldInput` - Input container ([line 61](ParameterEditorModal.module.css#L61))
- `.footer` - Footer with action buttons ([line 189](ParameterEditorModal.module.css#L189))
- `.input` - Text/number input ([line 74](ParameterEditorModal.module.css#L74))
- `.select` - Dropdown select input ([line 132](ParameterEditorModal.module.css#L132))
- `.checkbox` - Boolean checkbox ([line 177](ParameterEditorModal.module.css#L177))
- `.unitSuffix` - Unit symbol displayed inside input ([line 105](ParameterEditorModal.module.css#L105))
- `.inputWithUnit` - Container for input with unit suffix ([line 67](ParameterEditorModal.module.css#L67))

### Scrollbar Styling

The component includes custom scrollbar styling for the content area ([lines 196-213](ParameterEditorModal.module.css#L196-L213)):
- 8px width
- Semi-transparent thumb (0.4 opacity, increases to 0.7 on hover)

## Internationalization

The component uses `react-i18next` for internationalization:

```tsx
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
```

### Translation Keys

Labels are resolved using the translation function:

- **Category names**: `t(\`parameters:categories.${category.name}\`)`
- **Field labels**: `t(\`parameters:fields.${field.label}\`)`
- **Select options**: `t(\`parameters:${option.label}\`)`

### Example Translation File

```json
// en.json
{
  "parameters": {
    "categories": {
      "Basic Information": "Basic Information",
      "Location": "Location"
    },
    "fields": {
      "Bus Name": "Bus Name",
      "Base Voltage": "Base Voltage",
      "Area": "Area"
    },
    "Online": "Online",
    "Offline": "Offline"
  }
}
```

## Notes

### Value Management

- The `name` property in `ParameterField` must match the keys in the `values` object
- The modal only enables the Apply button when values have changed from initial state
- Canceling or closing the modal discards any unsaved changes
- The component resets to initial values when the modal reopens
- Empty string values are preserved for int/float inputs (allow clearing fields)

### Input Types

- **`int` type**: Uses `parseInt` with radix 10, defaults to `step: 1`
- **`float` type**: Uses `parseFloat`, defaults to `step: 0.01`
- **`boolean` type**: Renders as a checkbox, stores boolean values
- **`select` type**: Requires `options` array. If not provided or empty, renders a disabled text input with "No options available"
- **`text` type**: Standard text input

### Validation

- Int/float inputs with `min`/`max` will enforce browser-level validation
- `NaN` values from parsing are stored as empty strings (`''`)
- The component checks `Number.isNaN()` when parsing numeric values

### Select Edge Cases

- If a `select` field has no `options` or empty `options` array, a console warning is logged and the field renders as disabled text input
- Select option values can be strings or numbers
- The selected value from `onChange` is converted to match the original option type (number or string)

### Layout

- Fields display in a 2-column grid using CSS Grid
- Each field row contains a label (130px wide) and input (max 110px wide)
- Category titles use uppercase styling with bottom border
- Custom scrollbar appears when content overflows

### Dark Mode

- Dark mode works via `html.dark` class on the document
- Also responds to `prefers-color-scheme: dark` media query
- Dark mode lightens border colors and enhances hover states for visibility

### Internationalization

- All labels, category names, and select options use translation keys
- Translation keys use the format:
  - Categories: `parameters:categories.{categoryName}`
  - Fields: `parameters:fields.{fieldLabel}`
  - Options: `parameters:{optionLabel}`

