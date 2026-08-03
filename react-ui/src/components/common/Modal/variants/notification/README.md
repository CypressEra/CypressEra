# NotificationModal Component

A simple, beautiful notification modal for displaying alerts, success messages, errors, and warnings. Built on top of the Modal component.

## Quick Usage

```tsx
import { NotificationModal } from '@/components/common';

// Simple usage
<NotificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Success"
  message="File uploaded successfully!"
  type="success"
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | **required** | Whether the notification is visible |
| `onClose` | `() => void` | **required** | Callback when notification closes |
| `title` | `string` | **required** | Notification title |
| `message` | `string` | **required** | Notification message |
| `type` | `'success' \| 'error' \| 'warning' \| 'info'` | `'info'` | Type of notification (determines icon) |
| `width` | `number \| string` | `400` | Modal width |
| `buttonText` | `string` | `'OK'` | Custom button text |
| `onButtonClick` | `() => void` | `onClose` | Custom button action |

## Examples

### Success Notification

```tsx
<NotificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Success"
  message="Your changes have been saved successfully!"
  type="success"
/>
```

### Error Notification

```tsx
<NotificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Error"
  message="Failed to upload file. Please try again."
  type="error"
/>
```

### Warning Notification

```tsx
<NotificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Warning"
  message="Please select a .rawx file"
  type="warning"
/>
```

### Info Notification

```tsx
<NotificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Information"
  message="Please upload a file first"
  type="info"
/>
```

### Custom Button

```tsx
<NotificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Confirmation"
  message="Do you want to continue?"
  type="info"
  buttonText="Continue"
  onButtonClick={() => {
    console.log('User clicked continue');
    setIsOpen(false);
  }}
/>
```

### Wider Notification

```tsx
<NotificationModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Detailed Message"
  message="This is a longer message that needs more space to display properly."
  type="info"
  width={600}
/>
```

## With State Management

```tsx
function MyComponent() {
  const [notification, setNotification] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info' as NotificationType,
  });

  const showNotification = (title: string, message: string, type: NotificationType = 'info') => {
    setNotification({ isOpen: true, title, message, type });
  };

  const handleUpload = async () => {
    try {
      await uploadFile();
      showNotification('Success', 'File uploaded successfully!', 'success');
    } catch (error) {
      showNotification('Error', `Upload failed: ${error.message}`, 'error');
    }
  };

  return (
    <>
      <button onClick={handleUpload}>Upload File</button>
      
      <NotificationModal
        isOpen={notification.isOpen}
        onClose={() => setNotification({ ...notification, isOpen: false })}
        title={notification.title}
        message={notification.message}
        type={notification.type}
      />
    </>
  );
}
```

## Icons by Type

- **Success**: ✅ (green checkmark)
- **Error**: ❌ (red X)
- **Warning**: ⚠️ (yellow warning sign)
- **Info**: ℹ️ (blue info)

## Features

✅ **Simple API** - Just 3 required props (isOpen, onClose, title, message)  
✅ **Type-based icons** - Automatic icon based on notification type  
✅ **Blocking** - Shows mask, requires user acknowledgment  
✅ **Draggable** - Can be moved around  
✅ **macOS Style** - Beautiful traffic light buttons  
✅ **Dark Mode** - Automatic theme support  
✅ **Flexible** - Custom width and button text  

## When to Use

Use `NotificationModal` for:
- ✅ Success confirmations
- ✅ Error messages
- ✅ Warnings
- ✅ Info alerts
- ✅ Simple user notifications

Use the base `Modal` component for:
- Complex forms
- Data editors
- Settings panels
- Custom layouts
- Multi-step wizards

## Comparison

```tsx
// Before: Manual Modal setup (verbose)
<Modal isOpen={open} onClose={close} title="Success" modal={true}>
  <div style={{ textAlign: 'center', padding: '20px 0' }}>
    <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
    <p>File uploaded!</p>
    <Button onClick={close}>OK</Button>
  </div>
</Modal>

// After: NotificationModal (simple)
<NotificationModal
  isOpen={open}
  onClose={close}
  title="Success"
  message="File uploaded!"
  type="success"
/>
```

Much cleaner and reusable! 🎉

