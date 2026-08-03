# Modal Component

A beautiful, draggable, macOS-style modal component for React. **Fully customizable** - the Modal is just a container, you control all the content inside.

## Philosophy

The Modal component provides the **window frame** only. You pass whatever content you want as children - forms, tables, editors, anything. Perfect for:

- 🎛️ **Parameter Editors** - Complex forms with multiple fields
- 📊 **Data Viewers** - Tables, charts, and detailed information
- ⚙️ **Settings Panels** - Application configuration
- 🖼️ **Media Viewers** - Images, videos, diagrams
- ✏️ **Content Editors** - Text, code, visual editors
- 📋 **Custom Dialogs** - Confirmations, wizards, multi-step flows

## Features

✅ **Fully Customizable Content** - You control everything inside  
✅ **Draggable** - Click and drag the header to move the modal around  
✅ **Optional Backdrop/Mask** - Show or hide the background mask  
✅ **macOS Style** - Beautiful traffic light buttons and modern design  
✅ **Keyboard Support** - Press ESC to close  
✅ **Minimize/Maximize** - Optional window controls  
✅ **Dark Mode** - Automatic dark mode support  
✅ **Responsive** - Works on mobile and desktop  
✅ **TypeScript** - Full type safety

## Basic Usage

The Modal is a **content wrapper** - you control what goes inside:

```tsx
import { Modal, Button } from '@/components/common';
import { useState } from 'react';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open Modal</button>
      
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="My Modal"
      >
        {/* Your custom content goes here - anything you want! */}
        <p>This is the modal content!</p>
        <Button onClick={() => setIsOpen(false)}>Close</Button>
      </Modal>
    </>
  );
}
```

> 💡 **Key Concept**: The Modal doesn't impose any structure on your content. You have full control over layout, buttons, forms, everything!

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | **required** | Whether the modal is visible |
| `onClose` | `() => void` | **required** | Callback when modal should close |
| `title` | `string` | `'Modal'` | Modal title in header |
| `children` | `ReactNode` | **required** | Modal content (slot) |
| `modal` | `boolean` | `false` | **Blocking mode** - shows mask and blocks other actions. Use `true` for dialogs requiring response |
| `maskClosable` | `boolean` | `true` | Close modal when clicking mask (only when `modal={true}`) |
| `draggable` | `boolean` | `true` | Enable dragging |
| `width` | `number \| string` | `600` | Modal width |
| `height` | `number \| string` | `'auto'` | Modal height |
| `zIndex` | `number` | `1000` | Z-index for stacking multiple modals |
| `className` | `string` | `''` | Custom CSS class |
| `showCloseButton` | `boolean` | `true` | Show close button in header |
| `showTrafficLights` | `boolean` | `true` | Show macOS traffic light buttons |
| `onMinimize` | `() => void` | - | Minimize button callback |
| `onMaximize` | `() => void` | - | Maximize button callback |
| `isMaximized` | `boolean` | `false` | Whether modal is maximized |
| `footer` | `ReactNode` | - | Footer content |

## Modal Behavior

### Non-Blocking (Default) - `modal={false}`

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Settings"
  modal={false}  // default, no mask
>
  <p>This is a floating window. You can:</p>
  <ul>
    <li>Click other parts of the app</li>
    <li>Open multiple modals at once</li>
    <li>Drag and arrange windows</li>
  </ul>
</Modal>
```

**Use for:** Settings panels, editors, data viewers, tool palettes

### Blocking - `modal={true}`

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Action"
  modal={true}  // shows mask, blocks everything
>
  <p>Are you sure?</p>
  <Button onClick={handleConfirm}>Yes</Button>
  <Button onClick={() => setIsOpen(false)}>No</Button>
</Modal>
```

**Use for:** Confirmations, alerts, notifications, login forms

---

## Examples

### Basic Non-Blocking Modal

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Welcome"
>
  <h2>Hello World!</h2>
  <p>This is a floating window (no backdrop).</p>
</Modal>
```

### Blocking Notification

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Success"
  modal={true}
  width={450}
>
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontSize: '48px' }}>✅</div>
    <p>Operation completed successfully!</p>
    <Button onClick={() => setIsOpen(false)}>OK</Button>
  </div>
</Modal>
```

### Custom Size

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Large Modal"
  width={800}
  height={600}
>
  <p>This is a larger modal</p>
</Modal>
```

### With Footer

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirm Action"
  footer={
    <>
      <Button variant="secondary" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleConfirm}>
        Confirm
      </Button>
    </>
  }
>
  <p>Are you sure you want to proceed?</p>
</Modal>
```

### With Minimize/Maximize

```tsx
function ModalWithControls() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="Advanced Modal"
      isMaximized={isMaximized}
      onMinimize={() => {
        console.log('Minimize clicked');
        // You can implement minimize logic here
      }}
      onMaximize={() => setIsMaximized(!isMaximized)}
    >
      <p>This modal has window controls!</p>
    </Modal>
  );
}
```

### Non-Draggable Modal

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Fixed Position"
  draggable={false}
>
  <p>This modal cannot be dragged</p>
</Modal>
```

### Form Modal

```tsx
function FormModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });

  const handleSubmit = () => {
    console.log('Form submitted:', formData);
    setIsOpen(false);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      title="User Information"
      width={500}
      footer={
        <>
          <Button variant="secondary" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Submit
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label>Name:</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
        <div>
          <label>Email:</label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            style={{ width: '100%', padding: '8px' }}
          />
        </div>
      </div>
    </Modal>
  );
}
```

### Alternative Close Button Style

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Alternative Style"
  showTrafficLights={false}
  showCloseButton={true}
>
  <p>Using alternative close button instead of traffic lights</p>
</Modal>
```

## Styling

The Modal component uses CSS Modules for styling. You can customize it by:

1. **Using className prop**: Add custom classes to the modal container
2. **CSS Variables**: Override CSS custom properties
3. **Theme Context**: Automatically adapts to dark/light mode

### Custom Styling Example

```tsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Custom Styled"
  className="my-custom-modal"
>
  <p>Custom content</p>
</Modal>
```

```css
/* Your custom CSS */
.my-custom-modal {
  border: 2px solid blue;
}
```

## Keyboard Shortcuts

- **ESC** - Close the modal (when maskClosable is true)

## Accessibility

- Modal uses proper ARIA attributes (`role="dialog"`, `aria-modal="true"`)
- Title is properly linked with `aria-labelledby`
- Focus management for keyboard navigation
- Screen reader friendly

## Browser Support

- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Multiple Modals

You can have **multiple modals open at the same time**:

```tsx
<Modal isOpen={settings} onClose={closeSettings} title="Settings" zIndex={1000}>
  {/* Settings content */}
</Modal>

<Modal isOpen={editor} onClose={closeEditor} title="Editor" zIndex={1001}>
  {/* Editor content */}
</Modal>

<Modal isOpen={alert} onClose={closeAlert} title="Alert" modal={true} zIndex={1100}>
  {/* Alert requires response before continuing */}
</Modal>
```

See `MULTIPLE_MODALS_EXAMPLE.md` for complete examples!

---

## Notes

- **Default behavior**: Non-blocking floating window (no mask)
- **Draggable anywhere**: Full freedom to position modals
- **Multiple instances**: Have many modals open simultaneously
- **Z-index stacking**: Control which modal appears on top
- **Blocking mode**: Use `modal={true}` for dialogs requiring response
- Smooth animations for opening/closing
- Backdrop blur effect requires browser support for `backdrop-filter`

