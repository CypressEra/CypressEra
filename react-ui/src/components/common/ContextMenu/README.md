# ContextMenu Component

A customizable right-click context menu component with support for first-level and second-level (submenu) items, custom actions, and data passing.

## Features

- ✅ Customizable first-level menu items
- ✅ Customizable second-level menu items (submenus)
- ✅ Associate functions/actions with menu items
- ✅ Pass data to action handlers
- ✅ Support for icons, separators, and disabled items
- ✅ Automatic positioning and overflow handling
- ✅ macOS-style design with dark mode support
- ✅ Keyboard support (ESC to close)
- ✅ Click outside to close

## Basic Usage

### Using the Hook (Recommended)

```tsx
import { ContextMenu, useContextMenu } from '@/components/common';

function MyComponent() {
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu({
    items: [
      {
        id: 'copy',
        label: 'Copy',
        action: (data) => {
          console.log('Copy clicked', data);
        },
      },
      {
        id: 'paste',
        label: 'Paste',
        action: () => {
          console.log('Paste clicked');
        },
      },
    ],
  });

  return (
    <div onContextMenu={(e) => showContextMenu(e)}>
      Right-click me!
      {contextMenu.isOpen && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={hideContextMenu}
        />
      )}
    </div>
  );
}
```

### Direct Usage

```tsx
import { ContextMenu, MenuItem } from '@/components/common';
import { useState } from 'react';

function MyComponent() {
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const items: MenuItem[] = [
    {
      id: 'copy',
      label: 'Copy',
      action: () => console.log('Copy'),
    },
    {
      id: 'paste',
      label: 'Paste',
      action: () => console.log('Paste'),
    },
  ];

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPosition({ x: e.clientX, y: e.clientY });
      }}
    >
      Right-click me!
      {menuPosition && (
        <ContextMenu
          items={items}
          position={menuPosition}
          onClose={() => setMenuPosition(null)}
        />
      )}
    </div>
  );
}
```

## Advanced Usage

### With Submenus

```tsx
const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu({
  items: [
    {
      id: 'edit',
      label: 'Edit',
      submenu: [
        {
          id: 'cut',
          label: 'Cut',
          action: () => console.log('Cut'),
        },
        {
          id: 'copy',
          label: 'Copy',
          action: () => console.log('Copy'),
        },
        {
          id: 'paste',
          label: 'Paste',
          action: () => console.log('Paste'),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      submenu: [
        {
          id: 'zoom-in',
          label: 'Zoom In',
          action: () => console.log('Zoom In'),
        },
        {
          id: 'zoom-out',
          label: 'Zoom Out',
          action: () => console.log('Zoom Out'),
        },
      ],
    },
  ],
});
```

### With Data Input

```tsx
const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu({
  items: [
    {
      id: 'delete',
      label: 'Delete',
      data: { itemId: '123', itemName: 'My Item' },
      action: (data) => {
        console.log('Deleting item:', data?.itemId, data?.itemName);
        // Delete logic here
      },
    },
    {
      id: 'edit',
      label: 'Edit',
      data: { itemId: '123' },
      action: async (data) => {
        const item = await fetchItem(data?.itemId);
        console.log('Editing item:', item);
      },
    },
  ],
});
```

### With Icons

```tsx
import { Copy, Paste, Trash } from 'lucide-react';

const items: MenuItem[] = [
  {
    id: 'copy',
    label: 'Copy',
    icon: <Copy size={16} />,
    action: () => console.log('Copy'),
  },
  {
    id: 'paste',
    label: 'Paste',
    icon: <Paste size={16} />,
    action: () => console.log('Paste'),
  },
  {
    id: 'delete',
    label: 'Delete',
    icon: <Trash size={16} />,
    action: () => console.log('Delete'),
  },
];
```

### With Separators and Disabled Items

```tsx
const items: MenuItem[] = [
  {
    id: 'copy',
    label: 'Copy',
    action: () => console.log('Copy'),
  },
  {
    id: 'paste',
    label: 'Paste',
    disabled: true, // Disabled item
    action: () => console.log('Paste'),
  },
  {
    id: 'separator-1',
    separator: true, // Separator line
  },
  {
    id: 'delete',
    label: 'Delete',
    action: () => console.log('Delete'),
  },
];
```

### Dynamic Menu Items

```tsx
function MyComponent() {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const getContextMenuItems = (): MenuItem[] => {
    return [
      {
        id: 'select-all',
        label: 'Select All',
        action: () => {
          setSelectedItems(['item1', 'item2', 'item3']);
        },
      },
      {
        id: 'deselect-all',
        label: 'Deselect All',
        disabled: selectedItems.length === 0,
        action: () => {
          setSelectedItems([]);
        },
      },
      {
        id: 'separator-1',
        separator: true,
      },
      {
        id: 'delete-selected',
        label: `Delete ${selectedItems.length} item(s)`,
        disabled: selectedItems.length === 0,
        data: { selectedItems },
        action: (data) => {
          console.log('Deleting items:', data?.selectedItems);
          setSelectedItems([]);
        },
      },
    ];
  };

  const { contextMenu, showContextMenu, hideContextMenu, updateItems } = useContextMenu({
    items: getContextMenuItems(),
  });

  // Update menu items when selection changes
  useEffect(() => {
    updateItems(getContextMenuItems());
  }, [selectedItems]);

  return (
    <div onContextMenu={(e) => showContextMenu(e)}>
      {/* Your content */}
      {contextMenu.isOpen && (
        <ContextMenu
          items={contextMenu.items}
          position={contextMenu.position}
          onClose={hideContextMenu}
        />
      )}
    </div>
  );
}
```

## API Reference

### ContextMenu Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `items` | `MenuItem[]` | Yes | Array of menu items to display |
| `position` | `{ x: number; y: number }` | No | Position where menu should appear (if not provided, menu won't render) |
| `onClose` | `() => void` | No | Callback when menu is closed |
| `className` | `string` | No | Additional CSS class name |

### MenuItem

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for the menu item |
| `label` | `string` | Yes | Display text for the menu item |
| `icon` | `React.ReactNode` | No | Icon to display before the label |
| `disabled` | `boolean` | No | Whether the item is disabled |
| `separator` | `boolean` | No | Whether this item is a separator line |
| `action` | `(data?: MenuItemData) => void \| Promise<void>` | No | Function to call when item is clicked |
| `data` | `MenuItemData` | No | Data to pass to the action function |
| `submenu` | `SubMenuItem[]` | No | Array of submenu items (creates a second-level menu) |

### SubMenuItem

Same as `MenuItem`, but without the `submenu` property (submenus cannot be nested deeper than 2 levels).

### useContextMenu Hook

```tsx
const {
  contextMenu,
  showContextMenu,
  hideContextMenu,
  updateItems,
} = useContextMenu(options);
```

#### Parameters

- `options.items`: Initial menu items
- `options.onClose`: Optional callback when menu closes

#### Returns

- `contextMenu.isOpen`: Whether menu is currently open
- `contextMenu.position`: Current menu position
- `contextMenu.items`: Current menu items
- `showContextMenu(event, items?)`: Show menu at event position
- `hideContextMenu()`: Hide the menu
- `updateItems(items)`: Update menu items dynamically

## Styling

The component uses CSS Modules and supports the theme system. It automatically adapts to light/dark mode based on the `html.dark` class or `prefers-color-scheme` media query.

Custom styling can be applied via the `className` prop or by overriding CSS variables:

- `--bg-primary`: Menu background color
- `--bg-tertiary`: Menu background in dark mode
- `--border-primary`: Menu border color
- `--text-primary`: Menu text color
- `--selection-bg`: Hover/selection background color

