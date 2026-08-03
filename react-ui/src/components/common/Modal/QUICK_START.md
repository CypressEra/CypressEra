# Modal Quick Start

## TL;DR

```tsx
// Non-blocking floating window (default)
<Modal isOpen={open} onClose={close} title="My Modal">
  {/* Put ANYTHING you want here */}
</Modal>

// Blocking dialog (shows mask, requires response)
<Modal isOpen={open} onClose={close} title="Alert" modal={true}>
  {/* User must respond before continuing */}
</Modal>
```

The Modal is just a **beautiful window frame**. You control everything inside.

- Default: Non-blocking floating window (no mask)
- `modal={true}`: Blocking dialog (shows mask)
- Multiple modals can be open at once

---

## 3 Common Patterns

### 1. Simple Notification

```tsx
<Modal isOpen={open} onClose={close} title="Success" width={450}>
  <div style={{ textAlign: 'center', padding: '20px 0' }}>
    <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
    <p>Operation completed!</p>
    <Button onClick={close} style={{ marginTop: '20px' }}>OK</Button>
  </div>
</Modal>
```

### 2. Form/Editor

```tsx
<Modal isOpen={open} onClose={close} title="Edit Parameters" width={700}>
  <form onSubmit={handleSubmit}>
    <input name="voltage" type="number" />
    <input name="power" type="number" />
    <input name="frequency" type="number" />
    
    <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
      <Button type="button" onClick={close}>Cancel</Button>
      <Button type="submit">Save</Button>
    </div>
  </form>
</Modal>
```

### 3. Data Viewer

```tsx
<Modal isOpen={open} onClose={close} title="Results" width={900}>
  <table>
    <thead>
      <tr>
        <th>Bus</th>
        <th>Voltage</th>
        <th>Power</th>
      </tr>
    </thead>
    <tbody>
      {data.map(row => (
        <tr key={row.id}>
          <td>{row.bus}</td>
          <td>{row.voltage}</td>
          <td>{row.power}</td>
        </tr>
      ))}
    </tbody>
  </table>
</Modal>
```

---

## Customization Props

```tsx
<Modal
  isOpen={boolean}           // Required: show/hide modal
  onClose={() => void}       // Required: close handler
  title="string"             // Optional: header title
  modal={false}              // Optional: blocking mode (shows mask)
  width={600}                // Optional: modal width
  height="auto"              // Optional: modal height
  draggable={true}           // Optional: enable dragging
  zIndex={1000}              // Optional: stacking order
  maskClosable={true}        // Optional: click mask to close (when modal=true)
  showTrafficLights={true}   // Optional: macOS buttons
  onMaximize={() => void}    // Optional: maximize handler
  onMinimize={() => void}    // Optional: minimize handler
>
  {/* Your content */}
</Modal>
```

---

## Multiple Modals

```tsx
// You can have multiple modals open at once!
<Modal isOpen={settings} title="Settings" zIndex={1000}>
  {/* Settings panel */}
</Modal>

<Modal isOpen={editor} title="Editor" zIndex={1001}>
  {/* Editor panel */}
</Modal>

<Modal isOpen={alert} title="Alert" modal={true} zIndex={1100}>
  {/* Blocking alert on top */}
</Modal>
```

---

## Remember

- ✅ Modal = Window frame only
- ✅ You control all content inside
- ✅ No structure imposed
- ✅ **Default: Non-blocking** (no mask, floating window)
- ✅ **`modal={true}`**: Blocking (shows mask, requires response)
- ✅ **Multiple modals**: Can have many open at once
- ✅ **Free dragging**: Position anywhere on screen
- ✅ **Z-index control**: Stack modals as needed

See `USAGE_EXAMPLES.md` for complex real-world examples!  
See `MULTIPLE_MODALS_EXAMPLE.md` for multi-window scenarios!

