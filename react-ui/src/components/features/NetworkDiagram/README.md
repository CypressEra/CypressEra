# NetworkDiagram Component

A commercial-grade, canvas-based visualization component for power system networks with advanced interaction capabilities.

> **Save / Load**: the diagram plot is persisted to a versioned JSON format (`cypressera.diagram` v1.0) stored server-side in the user's `diagram` library. Reach it through the menu bar: **Open** (Diagram category), **Save → Diagram** / **Save As → Diagram**, and **Upload → Diagram**. The format and serialize/deserialize pipeline are owned by this feature — see [`io/README.md`](./io/README.md). The legacy floating `<DiagramIOToolbar>` is no longer mounted in the standard shell but remains importable for embedded scenarios.
>
> The format captures **only the diagram plot** — positions, connections, layers, visual style. It does not carry electrical model parameters or operating-point state, which stay in PSS/E RAW / your model store.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Theming](#theming)
- [Advanced Usage](#advanced-usage)
- [Architecture](#architecture)
- [Best Practices](#best-practices)
- [Changelog](#changelog)

---

## Overview

The NetworkDiagram component provides an interactive visualization of power system networks (buses, transmission lines, transformers, loads, generators) with smooth animations, drag-and-drop positioning, and context menu actions.

### Key Characteristics

- **Canvas-based rendering** for high performance with large networks
- **Smooth zoom animations** using requestAnimationFrame
- **Interactive elements** with drag-and-drop support
- **Context menu** with element-specific actions
- **Theme support** (light, dark)
- **Responsive design** with automatic resize handling
- **TypeScript** for full type safety

---

## Features

### Core Features

- **Interactive Pan and Zoom**
  - Mouse wheel zoom with smooth animation
  - Middle-click or left-click on empty space to pan
  - Zoom towards mouse position
  - Configurable min/max scale limits

- **Element Selection**
  - Click to select single element
  - Shift+click for multi-select
  - Shift+drag for lasso selection
  - Visual feedback for selected elements

- **Drag and Drop**
  - Drag buses with connected lines updating automatically
  - Drag transmission lines with buses following
  - Distributed connection points for clean visuals
  - Maintains electrical connectivity

- **Context Menu**
  - Right-click for element-specific actions
  - Plot individual buses or all buses
  - Zoom controls (Zoom In, Zoom Out, Reset View)
  - Export to PNG

### Advanced Features

- **Smooth Animations**
  - Target-based zoom animation for rapid scrolling
  - Optimized to prevent "jitter" during fast zooming
  - Cancels previous animations when new ones start

- **Responsive Design**
  - Automatic resize handling with debouncing
  - Preserves view transform during resize
  - Optimized rendering during resize operations

- **Performance Optimization**
  - RequestAnimationFrame for smooth rendering
  - Reduced logging during resize operations
  - Efficient element lookup using spatial indexing

---

## Installation

The component is part of the CypressEra project. Import it from:

```tsx
import { NetworkDiagram } from '@/components/features/NetworkDiagram';
```

Or use the SDK integration hook:

```tsx
import { useNetworkDiagram } from '@/hooks';
```

---

## Quick Start

### Basic Usage

```tsx
import { NetworkDiagram } from '@/components/features/NetworkDiagram';
import type { NetworkDataset } from '@/components/features/NetworkDiagram';

function MyComponent() {
  const data: NetworkDataset = {
    buses: [
      { id: '1', name: 'Bus 1', basekv: 138, v: 1.0, angle: 0 },
      { id: '2', name: 'Bus 2', basekv: 138, v: 1.0, angle: 0 },
    ],
    aclines: [
      { id: '1', frombus: '1', tobus: '2', r: 0.01, x: 0.1 },
    ],
  };

  return (
    <NetworkDiagram
      data={data}
      theme="light"
      interactive={true}
    />
  );
}
```

### With Event Handlers

```tsx
function MyDiagramComponent() {
  const handleElementClick = (element: DiagramElement) => {
    console.log('Clicked element:', element);
  };

  const handleSelectionChange = (elements: DiagramElement[]) => {
    console.log('Selected elements:', elements);
  };

  return (
    <NetworkDiagram
      data={data}
      onElementClick={handleElementClick}
      onSelectionChange={handleSelectionChange}
    />
  );
}
```

### With Ref API

```tsx
function MyDiagramComponent() {
  const diagramRef = useRef<NetworkDiagramRef>(null);

  const handleExport = () => {
    diagramRef.current?.exportAsPNG();
  };

  const handleResetView = () => {
    diagramRef.current?.resetView();
  };

  return (
    <div>
      <NetworkDiagram ref={diagramRef} data={data} />
      <button onClick={handleExport}>Export PNG</button>
      <button onClick={handleResetView}>Reset View</button>
    </div>
  );
}
```

### With SDK Integration

```tsx
import { useNetworkDiagram } from '@/hooks';

function MyPage() {
  const { handleRef, dataset } = useNetworkDiagram({
    onDataUpdate: (data) => console.log('Data updated:', data),
    enableMCPIntegration: true,
  });

  return <NetworkDiagram ref={handleRef} data={dataset} />;
}
```

---

## API Reference

### NetworkDiagram Props

```typescript
interface NetworkDiagramProps {
  // Data
  data?: NetworkDataset;
  powerFlowResults?: PowerFlowResults;

  // Events
  onElementClick?: (element: DiagramElement) => void;
  onElementDoubleClick?: (element: DiagramElement) => void;
  onSelectionChange?: (elements: DiagramElement[]) => void;
  onCanvasClick?: (position: Point) => void;

  // Appearance
  theme?: 'light' | 'dark';
  className?: string;
  style?: React.CSSProperties;

  // Behavior
  showLabels?: boolean;
  showFlowValues?: boolean;
  interactive?: boolean;

  // Initial State
  initialTransform?: Partial<Transform>;
  layoutConfig?: { algorithm: string };
}
```

### NetworkDiagramRef

```typescript
interface NetworkDiagramRef {
  updateData: (data: NetworkDataset) => void;
  updatePowerFlowResults: (results: PowerFlowResults) => void;
  highlightElements: (elementIds: string[]) => void;
  selectElements: (elementIds: string[]) => void;
  resetView: () => void;
  exportAsPNG: () => void;
  fitToView: () => void;
  setLayerVisibility: (layerId: string, visible: boolean) => void;
}
```

### Data Types

```typescript
interface NetworkDataset {
  buses?: Bus[];
  aclines?: ACLine[];
  transformers?: Transformer[];
  loads?: Load[];
  generators?: Generator[];
  fixedShunts?: FixedShunt[];
  switchedShunts?: SwitchedShunt[];
}

interface PowerFlowResults {
  busResults?: BusFlowResult[];
  aclineResults?: ACLineFlowResult[];
  transformerResults?: TransformerFlowResult[];
  converged?: boolean;
  timestamp?: string;
}

interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface Point {
  x: number;
  y: number;
}
```

---

## Theming

The component supports three built-in themes:

### Light Theme

```tsx
<NetworkDiagram theme="light" data={data} />
```

### Dark Theme

```tsx
<NetworkDiagram theme="dark" data={data} />
```

### Professional Theme (Default)

```tsx
<NetworkDiagram theme="light" data={data} />
```

### Custom Styling

You can override styles using the `style` prop:

```tsx
<NetworkDiagram
  data={data}
  style={{ width: '100%', height: '600px' }}
/>
```

Or use CSS classes:

```tsx
<NetworkDiagram
  data={data}
  className="my-custom-diagram"
/>
```

```css
.my-custom-diagram {
  border: 1px solid #ccc;
  border-radius: 8px;
}
```

---

## Advanced Usage

### SDK Integration Hook

For automatic data synchronization with the PowerFlow SDK:

```tsx
import { useNetworkDiagram } from '@/hooks';

function MyPage() {
  const { handleRef, dataset, powerFlowResults } = useNetworkDiagram({
    onDataUpdate: (data) => console.log('Network updated:', data),
    onPowerFlowUpdate: (results) => console.log('Flow updated:', results),
    enableMCPIntegration: true,
  });

  return (
    <NetworkDiagram
      ref={handleRef}
      data={dataset}
      powerFlowResults={powerFlowResults}
    />
  );
}
```

### Using Configuration

Access and modify default configuration:

```tsx
import {
  NETWORK_DIAGRAM_CONSTANTS,
  DEFAULT_RENDER_STYLE,
  THEMES,
  getRenderStyle,
} from '@/components/features/NetworkDiagram';

// Access constants
const minScale = NETWORK_DIAGRAM_CONSTANTS.MIN_SCALE;
const maxScale = NETWORK_DIAGRAM_CONSTANTS.MAX_SCALE;

// Get theme style
const themeStyle = getRenderStyle('light');
```

---

## Architecture

The component follows commercial best practices with a modular architecture:

### Directory Structure

```
NetworkDiagram/
├── NetworkDiagram.tsx           # Main component (public API)
├── components/                  # React components
│   ├── NetworkDiagramCanvas.tsx
│   └── NetworkDiagramContainer.tsx
├── hooks/                       # Custom React hooks (internal)
│   ├── useTransform.ts          # Transform state & zoom animation
│   ├── useElementSelection.ts   # Selection state management
│   ├── useCanvasResize.ts       # Resize handling
│   ├── useCanvasInteraction.ts  # Mouse/keyboard interactions
│   └── useDataProcessing.ts     # Data processing & layout
├── interaction/                 # Interaction handlers
│   ├── DragHandler.ts           # Element dragging
│   ├── PanZoomHandler.ts        # Pan and zoom
│   └── SelectionHandler.ts      # Element selection
├── controllers/                 # Business logic
│   └── RenderController.ts      # Rendering orchestration
├── menus/                       # Context menu builders
│   └── ContextMenuBuilder.ts
├── config/                      # Configuration
│   ├── constants.ts             # Constants and magic numbers
│   ├── defaults.ts              # Default render style
│   └── themes.ts                # Theme definitions
├── renderers/                   # Rendering logic
├── layout/                      # Layout algorithms
├── factories/                   # Element factories
├── utils/                       # Utility functions
└── types/                       # TypeScript types
```

### Design Principles

1. **Single Responsibility**: Each module has one clear purpose
2. **Separation of Concerns**: UI, business logic, and interaction are separated
3. **Testability**: Hooks and handlers can be tested in isolation
4. **Reusability**: Modules can be reused in other diagram components
5. **Type Safety**: Full TypeScript support with exported types

### Component Hierarchy

```
NetworkDiagram (main export)
└── NetworkDiagramContainer
    ├── NetworkDiagramCanvas
    │   └── HTMLCanvasElement
    └── ContextMenu
```

### Data Flow

```
Props → Data Processing Hook → Elements Map
                                    ↓
                         Render Controller
                                    ↓
                         Canvas Renderer
```

### Interaction Flow

```
User Input → useCanvasInteraction Hook
                        ↓
              ┌─────────┼─────────┐
              ↓         ↓         ↓
         DragHandler  PanZoomHandler  SelectionHandler
              ↓         ↓         ↓
              └─────────┼─────────┘
                        ↓
                  State Updates
                        ↓
                   Re-render
```

---

## Best Practices

### Performance

1. **Avoid unnecessary re-renders**: Use `useCallback` and `useMemo` for expensive computations
2. **Batch state updates**: Update multiple state items together when possible
3. **Use refs for frequent access**: Access refs instead of state for values that change frequently
4. **Debounce expensive operations**: The resize handler is already debounced

### Memory Management

1. **Cleanup effects**: All hooks properly clean up in their return functions
2. **Cancel animations**: Animations are properly cancelled when new ones start
3. **Dispose renderers**: The CanvasRenderer is disposed when unmounted

### Type Safety

1. **Use exported types**: Always import types from the main export
2. **Type your data**: Ensure your network data matches the expected types
3. **Use type guards**: When checking element types, use proper type guards

### Testing

1. **Test hooks in isolation**: Use `@testing-library/react-hooks`
2. **Test handlers independently**: Mock canvas and refs
3. **Test integration**: Test the full component with real user interactions

---

## Changelog

### v2.0.0 (2026-02-20) - Refactored Architecture

**Major Changes:**

- Complete refactor following commercial best practices
- Reduced main file from 1,786 lines to ~90 lines (95% reduction)
- Extracted configuration to dedicated modules (`config/`)
- Created custom hooks for complex logic (`hooks/`)
- Implemented interaction handler classes (`interaction/`)
- Added render controller for orchestration (`controllers/`)
- Improved type safety throughout
- Enhanced documentation

**New Features:**

- Exported hooks for advanced usage
- Exported handlers for custom implementations
- Better performance with optimized animations
- Improved resize handling

**Bug Fixes:**

- Fixed zoom not working after refactoring (added `transform` to render trigger)
- Fixed canvas shaking when dragging after zoom
- Improved element selection behavior
- Eliminated black flashing during resize
- Prevented element selection after dragging

**Public API:**

- ✅ 100% backward compatible
- All existing code works without changes
- New exports available for advanced usage

### v1.0.0 - Initial Release

- Basic network diagram functionality
- Canvas-based rendering
- Interactive pan and zoom
- Element selection and dragging
- Context menu support

---

## Contributing

When contributing to the NetworkDiagram component:

1. **Follow the architecture**: Keep the separation of concerns
2. **Add types**: All new code should be fully typed
3. **Document changes**: Update this README with any new features
4. **Test thoroughly**: Add tests for new functionality
5. **Performance matters**: Profile and optimize any rendering-heavy code

---

## License

This component is part of the CypressEra project.

---

## Support

For issues, questions, or contributions, please refer to the main project repository.
