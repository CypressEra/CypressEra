# File Selector Modal

A macOS-style file selector dialog component with folder navigation support. Perfect for file browsing, selection, and navigation in a native macOS Finder-like interface.

## Features

✅ **macOS-style Design** - Native Finder-like appearance  
✅ **Folder Navigation** - Full folder structure support with breadcrumbs  
✅ **History Navigation** - Back/forward navigation like a browser  
✅ **Single/Multiple Selection** - Support for both single and multiple file selection  
✅ **File Filtering** - Customizable file filtering  
✅ **Customizable** - Flexible file system provider interface  
✅ **Dark Mode** - Full dark mode support  
✅ **Responsive** - Resizable modal with proper scrolling  

## Basic Usage

### Using with Dialog System

```tsx
import { useDialog, DIALOG_IDS } from '@/components/common';
import { FileSelectorModal } from '@/components/common';

function MyComponent() {
  const { openDialog } = useDialog();

  const handleOpenFileSelector = () => {
    openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
      title: 'Select a File',
      onSelect: (file) => {
        console.log('Selected file:', file);
      },
      defaultFiles: [
        { name: 'Documents', type: 'folder', path: '/Documents' },
        { name: 'report.pdf', type: 'file', path: '/Documents/report.pdf', size: 1024 },
        { name: 'image.png', type: 'file', path: '/Documents/image.png', size: 2048 },
      ],
    });
  };

  return <button onClick={handleOpenFileSelector}>Select File</button>;
}
```

### Direct Usage

```tsx
import { FileSelectorModal } from '@/components/common';
import type { FileItem } from '@/components/common';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (file: FileItem) => {
    console.log('Selected:', file);
    setIsOpen(false);
  };

  return (
    <FileSelectorModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onSelect={handleSelect}
      title="Choose a File"
      defaultFiles={[
        { name: 'file.txt', type: 'file', path: '/file.txt' },
      ]}
    />
  );
}
```

## Props

### FileSelectorModalProps

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | - | Whether the modal is open |
| `onClose` | `() => void` | - | Callback when modal is closed |
| `title` | `string` | `'Select File'` | Modal title |
| `onSelect` | `(file: FileItem) => void` | - | Callback when a file is selected (single mode) |
| `onSelectMultiple` | `(files: FileItem[]) => void` | - | Callback when files are selected (multiple mode) |
| `initialPath` | `string` | `'/'` | Initial path to start browsing |
| `allowMultiple` | `boolean` | `false` | Allow multiple file selection |
| `fileFilter` | `(file: FileItem) => boolean` | - | Filter function to show/hide files |
| `getFiles` | `(path: string) => Promise<FileItem[]>` | - | Custom file system provider |
| `defaultFiles` | `FileItem[]` | `[]` | Default file list (for mock/testing) |
| `width` | `number \| string` | `700` | Modal width |
| `height` | `number \| string` | `500` | Modal height |

### FileItem

```tsx
interface FileItem {
  name: string;           // File or folder name
  type: 'file' | 'folder'; // Item type
  path: string;           // Full path
  size?: number;          // File size in bytes
  modified?: Date;        // Last modified date
  icon?: string;          // Custom icon (emoji or icon name)
}
```

## Examples

### Single File Selection

```tsx
const { openDialog } = useDialog();

openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
  title: 'Select a Document',
  onSelect: (file) => {
    console.log('Selected:', file.path);
    // Handle file selection
  },
  fileFilter: (file) => {
    // Only show PDF files
    return file.type === 'file' && file.name.endsWith('.pdf');
  },
});
```

### Multiple File Selection

```tsx
const { openDialog } = useDialog();

openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
  title: 'Select Multiple Files',
  allowMultiple: true,
  onSelectMultiple: (files) => {
    console.log('Selected files:', files.map(f => f.path));
    // Handle multiple file selection
  },
});
```

### Custom File System Provider

```tsx
const getFilesFromAPI = async (path: string): Promise<FileItem[]> => {
  const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
  const data = await response.json();
  return data.files.map((file: any) => ({
    name: file.name,
    type: file.isDirectory ? 'folder' : 'file',
    path: file.path,
    size: file.size,
    modified: new Date(file.modified),
  }));
};

openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
  title: 'Select File',
  getFiles: getFilesFromAPI,
  onSelect: (file) => {
    console.log('Selected:', file);
  },
});
```

### Filter by File Type

```tsx
openDialog(DIALOG_IDS.FILE_SELECTOR, FileSelectorModal, {
  title: 'Select Image',
  fileFilter: (file) => {
    if (file.type === 'folder') return true; // Always show folders
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    return imageExts.some(ext => file.name.toLowerCase().endsWith(ext));
  },
  onSelect: (file) => {
    // Handle image selection
  },
});
```

## Navigation

The file selector supports multiple navigation methods:

- **Breadcrumb Navigation**: Click any part of the breadcrumb to navigate
- **Back/Forward Buttons**: Navigate through history like a browser
- **Up Button**: Navigate to parent folder
- **Double-click**: Double-click folders to navigate, files to select (single mode)
- **Single-click**: Select files (multiple mode) or navigate folders

## Styling

The component uses macOS-style design with:
- Native macOS colors and fonts
- Smooth transitions and hover effects
- Proper dark mode support
- Scrollable file list with custom scrollbar
- Responsive layout

## Integration with Dialog System

The FileSelectorModal is designed to work seamlessly with the dialog system:

1. Add `FILE_SELECTOR` to `DIALOG_IDS` (already done)
2. Use `useDialog()` hook to open it
3. Pass configuration through dialog props

## Best Practices

1. **Provide File System Provider**: For production, implement a `getFiles` function that connects to your backend API
2. **Use File Filtering**: Filter files by extension, type, or custom criteria
3. **Handle Errors**: Implement error handling in your `getFiles` function
4. **Set Initial Path**: Use `initialPath` to start users in a relevant directory
5. **Multiple Selection**: Use `allowMultiple` for batch operations

## Component Location

The FileSelectorModal is placed in:
```
src/components/common/Modal/variants/file-selector/
```

This location makes it:
- ✅ **Generic and Reusable**: Can be used anywhere in the app
- ✅ **Consistent**: Follows the same pattern as other modal variants
- ✅ **Discoverable**: Easy to find in the common components folder
- ✅ **Maintainable**: Clear separation of concerns

## Future Enhancements

Potential improvements:
- [ ] Grid/List view toggle
- [ ] File preview
- [ ] Search functionality
- [ ] File operations (create, delete, rename)
- [ ] Drag and drop support
- [ ] Keyboard shortcuts
- [ ] File type icons (better icon system)

