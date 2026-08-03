# Modal Usage Examples

## Basic Philosophy

The Modal component is designed to be **fully customizable**. You pass whatever content you want as children. The modal just provides the window frame, dragging, and background overlay.

## Simple Notification

```tsx
import { Modal, Button } from '@/components/common';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Success">
      <div style={{ textAlign: 'center', padding: '20px 0' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <p>Operation completed successfully!</p>
        <Button onClick={() => setIsOpen(false)} style={{ marginTop: '20px' }}>
          OK
        </Button>
      </div>
    </Modal>
  );
}
```

## Parameter Editor (Form)

```tsx
import { Modal, Button } from '@/components/common';
import { useState } from 'react';

function ParameterEditor() {
  const [isOpen, setIsOpen] = useState(false);
  const [params, setParams] = useState({
    voltage: 1.0,
    power: 100,
    tolerance: 1e-6,
    maxIterations: 100,
  });

  const handleSave = () => {
    console.log('Saving parameters:', params);
    setIsOpen(false);
  };

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Edit Parameters</Button>
      
      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Power Flow Parameters"
        width={600}
      >
        {/* Your custom content here */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Voltage (p.u.)
              </label>
              <input
                type="number"
                value={params.voltage}
                onChange={(e) => setParams({ ...params, voltage: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Power (MW)
              </label>
              <input
                type="number"
                value={params.power}
                onChange={(e) => setParams({ ...params, power: parseFloat(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Tolerance
              </label>
              <input
                type="number"
                value={params.tolerance}
                onChange={(e) => setParams({ ...params, tolerance: parseFloat(e.target.value) })}
                step="0.000001"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                Max Iterations
              </label>
              <input
                type="number"
                value={params.maxIterations}
                onChange={(e) => setParams({ ...params, maxIterations: parseInt(e.target.value) })}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                }}
              />
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            gap: '12px',
            paddingTop: '16px',
            borderTop: '1px solid #e5e7eb'
          }}>
            <Button variant="secondary" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Save Parameters
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
```

## Bus Element Editor

```tsx
function BusElementEditor({ busData, onSave, onClose }) {
  const [data, setData] = useState(busData);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Edit Bus #${busData.id}`}
      width={700}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Basic Info Section */}
        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            Basic Information
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label>Bus Name</label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => setData({ ...data, name: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label>Base Voltage (kV)</label>
              <input
                type="number"
                value={data.baseKV}
                onChange={(e) => setData({ ...data, baseKV: parseFloat(e.target.value) })}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Electrical Parameters */}
        <div>
          <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
            Electrical Parameters
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <label>Voltage Magnitude (p.u.)</label>
              <input type="number" value={data.vm} style={inputStyle} />
            </div>
            <div>
              <label>Voltage Angle (deg)</label>
              <input type="number" value={data.va} style={inputStyle} />
            </div>
            <div>
              <label>Bus Type</label>
              <select value={data.type} style={inputStyle}>
                <option value="PQ">PQ (Load)</option>
                <option value="PV">PV (Generator)</option>
                <option value="Slack">Slack</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <Button variant="danger" onClick={() => console.log('Delete')}>
            Delete Bus
          </Button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => onSave(data)}>
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  fontSize: '14px',
};
```

## Data Table Viewer

```tsx
function DataTableModal({ data, isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bus Results"
      width={900}
      height={600}
    >
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        overflow: 'auto'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Bus ID</th>
              <th style={thStyle}>Voltage (p.u.)</th>
              <th style={thStyle}>Angle (deg)</th>
              <th style={thStyle}>P (MW)</th>
              <th style={thStyle}>Q (MVAr)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={tdStyle}>{row.id}</td>
                <td style={tdStyle}>{row.voltage.toFixed(4)}</td>
                <td style={tdStyle}>{row.angle.toFixed(2)}</td>
                <td style={tdStyle}>{row.p.toFixed(2)}</td>
                <td style={tdStyle}>{row.q.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

const thStyle = { padding: '12px', textAlign: 'left', fontWeight: '600' };
const tdStyle = { padding: '12px' };
```

## Settings Panel with Tabs

```tsx
function SettingsModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('general');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Application Settings"
      width={800}
      height={500}
    >
      <div style={{ display: 'flex', height: '100%' }}>
        {/* Sidebar */}
        <div style={{ 
          width: '200px', 
          borderRight: '1px solid #e5e7eb',
          paddingRight: '16px',
        }}>
          {['general', 'analysis', 'display', 'advanced'].map(tab => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 16px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: activeTab === tab ? '#eff6ff' : 'transparent',
                color: activeTab === tab ? '#2563eb' : '#6b7280',
                fontWeight: activeTab === tab ? '600' : '400',
                marginBottom: '4px',
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, paddingLeft: '24px', overflow: 'auto' }}>
          {activeTab === 'general' && (
            <div>
              <h3>General Settings</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <label>
                  <input type="checkbox" /> Auto-save enabled
                </label>
                <label>
                  <input type="checkbox" /> Show notifications
                </label>
              </div>
            </div>
          )}
          {activeTab === 'analysis' && (
            <div>
              <h3>Analysis Settings</h3>
              <p>Configure power flow analysis parameters...</p>
            </div>
          )}
          {/* Add other tabs */}
        </div>
      </div>
    </Modal>
  );
}
```

## Confirmation Dialog

```tsx
function ConfirmDeleteModal({ itemName, isOpen, onConfirm, onCancel }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Confirm Deletion"
      width={450}
    >
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: '20px 0'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px', color: '#ef4444' }}>
          ⚠️
        </div>
        <p style={{ fontSize: '15px', lineHeight: '1.6', margin: 0 }}>
          Are you sure you want to delete <strong>{itemName}</strong>?
          <br />
          This action cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

## Image Viewer

```tsx
function ImageViewerModal({ imageUrl, title, isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      width={1000}
      height={700}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100%',
        background: '#f9fafb'
      }}>
        <img 
          src={imageUrl} 
          alt={title}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      </div>
    </Modal>
  );
}
```

## Key Principles

1. **Modal is just a container** - You control all the content inside
2. **Fully customizable** - Use any HTML/React components as children
3. **No restrictions** - Forms, tables, images, charts, anything works
4. **You control layout** - The modal doesn't impose any content structure
5. **You control actions** - Place buttons wherever you want in your content

The Modal component provides:
- Window frame with macOS styling
- Draggable header
- Background overlay/mask
- Open/close state management
- ESC key handling
- Traffic light buttons (optional)

Everything else is up to you! 🎨

