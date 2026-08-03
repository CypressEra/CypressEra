# Multiple Modals & Modal Behavior

## Understanding Modal vs Non-Modal

### `modal={false}` (Default) - Non-Blocking Window
```tsx
<Modal isOpen={open} onClose={close} title="Settings" modal={false}>
  {/* No mask, can interact with other elements */}
  <p>This is like a floating window. You can:</p>
  <ul>
    <li>Click on other parts of the app</li>
    <li>Open more modals</li>
    <li>Have multiple windows open at once</li>
  </ul>
</Modal>
```

**Use Cases:**
- 🎛️ Settings panels
- 📊 Data viewers
- 🔧 Tool palettes
- 📝 Floating editors
- 📈 Charts/graphs

### `modal={true}` - Blocking Dialog
```tsx
<Modal isOpen={open} onClose={close} title="Confirm" modal={true}>
  {/* Shows mask, blocks other actions */}
  <p>Are you sure you want to delete this item?</p>
  <Button onClick={handleDelete}>Delete</Button>
  <Button onClick={close}>Cancel</Button>
</Modal>
```

**Use Cases:**
- ⚠️ Confirmations
- ✅ Notifications
- ❌ Error messages
- 📝 Forms requiring completion
- 🔐 Login dialogs

---

## Multiple Modals Example

```tsx
import { Modal, Button } from '@/components/common';
import { useState } from 'react';

function MultiModalExample() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setSettingsOpen(true)}>Open Settings</Button>
      <Button onClick={() => setEditorOpen(true)}>Open Editor</Button>

      {/* Settings Panel - Non-blocking, can stay open */}
      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="Settings"
        width={400}
        modal={false}  // No mask, doesn't block
        zIndex={1000}
      >
        <div>
          <h3>Application Settings</h3>
          <label>
            <input type="checkbox" /> Auto-save
          </label>
          <label>
            <input type="checkbox" /> Dark mode
          </label>
        </div>
      </Modal>

      {/* Editor Panel - Non-blocking, can coexist with settings */}
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        title="Parameter Editor"
        width={600}
        modal={false}  // No mask, doesn't block
        zIndex={1001}  // Appears on top of settings
      >
        <div>
          <h3>Edit Parameters</h3>
          <input type="number" placeholder="Voltage" />
          <input type="number" placeholder="Power" />
          
          <Button onClick={() => setConfirmOpen(true)}>
            Save Changes
          </Button>
        </div>
      </Modal>

      {/* Confirmation - Blocking, requires response */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm Save"
        width={450}
        modal={true}  // Shows mask, blocks everything
        zIndex={1100}  // Appears on top of everything
      >
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
          <p>Are you sure you want to save these changes?</p>
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'center' }}>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => {
              console.log('Saved!');
              setConfirmOpen(false);
              setEditorOpen(false);
            }}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
```

---

## Z-Index Management

### Automatic Stacking
By default, modals use z-index 1000. Each modal gets its own layer.

### Manual Stacking
Control the order explicitly:

```tsx
<Modal zIndex={1000}>Base modal</Modal>
<Modal zIndex={1010}>On top of base</Modal>
<Modal zIndex={1020} modal={true}>Blocking dialog on top</Modal>
```

### Recommended Z-Index Strategy

```tsx
// Non-blocking windows
const ZINDEX_TOOLS = 1000;      // Tool palettes
const ZINDEX_EDITORS = 1010;    // Editors
const ZINDEX_VIEWERS = 1020;    // Data viewers

// Blocking dialogs (always on top)
const ZINDEX_DIALOGS = 1100;    // Confirmations
const ZINDEX_ALERTS = 1200;     // Alerts/notifications
```

---

## Real-World Scenario

### Power Flow Application

```tsx
function PowerFlowApp() {
  const [busEditor, setBusEditor] = useState(false);
  const [lineEditor, setLineEditor] = useState(false);
  const [results, setResults] = useState(false);
  const [notification, setNotification] = useState(false);

  return (
    <>
      {/* Bus Editor - floating, non-blocking */}
      <Modal
        isOpen={busEditor}
        onClose={() => setBusEditor(false)}
        title="Edit Bus #1"
        modal={false}
        zIndex={1000}
      >
        <BusParameterForm />
      </Modal>

      {/* Line Editor - floating, can be open alongside bus editor */}
      <Modal
        isOpen={lineEditor}
        onClose={() => setLineEditor(false)}
        title="Edit Line 1-2"
        modal={false}
        zIndex={1001}
      >
        <LineParameterForm />
      </Modal>

      {/* Results Viewer - floating, non-blocking */}
      <Modal
        isOpen={results}
        onClose={() => setResults(false)}
        title="Analysis Results"
        width={900}
        modal={false}
        zIndex={1002}
      >
        <ResultsTable />
      </Modal>

      {/* Success Notification - blocking, must acknowledge */}
      <Modal
        isOpen={notification}
        onClose={() => setNotification(false)}
        title="Analysis Complete"
        modal={true}  // Blocks everything until dismissed
        zIndex={1100}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '48px' }}>✅</div>
          <p>Power flow analysis completed successfully!</p>
          <Button onClick={() => setNotification(false)}>OK</Button>
        </div>
      </Modal>
    </>
  );
}
```

---

## Benefits

✅ **No mask by default** - Modals are non-blocking floating windows  
✅ **Multiple modals** - Have many windows open at once  
✅ **Draggable** - Position each window where you want  
✅ **Overlapping** - Stack and arrange as needed  
✅ **Blocking when needed** - Use `modal={true}` for critical dialogs  
✅ **Flexible z-index** - Control stacking order manually  

This gives you a **true windowing system** like desktop applications! 🪟

