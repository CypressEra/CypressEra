# API & Network Documentation

Complete guide to API configuration, network operations, and data management.

## Table of Contents

- [API Configuration](#api-configuration)
- [API Client Usage](#api-client-usage)
- [Network Data Structure](#network-data-structure)
- [Network Editing Operations](#network-editing-operations)
- [Data Aggregation](#data-aggregation)
- [Caching Strategy](#caching-strategy)
- [Network Updates & Events](#network-updates--events)
- [Complete Examples](#complete-examples)
- [API Reference](#api-reference)

## API Configuration

### Configuration File

Located at `src/config/api.ts`:

```typescript
// Get API base URL from window object (injected by server.js)
export const API_BASE_URL = window.API_BASE_URL || 'http://localhost:8080';
export const MCP_BASE_URL = window.MCP_BASE_URL || 'http://localhost:3001';

// API request timeout
export const API_TIMEOUT = 30000; // 30 seconds
```

### Environment Variables

Set via `server.js` EJS template at runtime:

```bash
# Development
API_BASE_URL=http://localhost:8080 MCP_BASE_URL=http://localhost:3001 npm start

# Production
API_BASE_URL=https://api.example.com MCP_BASE_URL=https://mcp.example.com npm run serve
```

### Accessing Configuration

```typescript
import { API_BASE_URL, MCP_BASE_URL } from '@/config/api';

console.log('API URL:', API_BASE_URL);
console.log('MCP URL:', MCP_BASE_URL);
```

## API Client Usage

### Basic API Client

The `apiClient` provides simple HTTP methods:

```typescript
import { apiClient, API_BASE_URL } from '@/config/api';

// GET request
const data = await apiClient.get('/api/v1/session/info');

// POST request
const result = await apiClient.post('/api/v1/session/calculate', {
  session_id: 'abc123',
  config: { method: 'DC' }
});

// PUT request
await apiClient.put('/api/v1/session/edit', editData);

// DELETE request
await apiClient.delete('/api/v1/user/files/delete', {
  fileName: 'case9.rawx'
});
```

### Example: Custom API Call

```typescript
import { API_BASE_URL } from '@/config/api';

const customAPICall = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/custom-endpoint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: 'value' }),
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};
```

### Example: File Upload with Progress

```typescript
const uploadFileWithProgress = async (file: File, onProgress: (progress: number) => void) => {
  const formData = new FormData();
  formData.append('file', file);
  
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100;
        onProgress(progress);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    });
    
    xhr.addEventListener('error', () => {
      reject(new Error('Upload failed'));
    });
    
    xhr.open('POST', `${API_BASE_URL}/api/v1/user/upload`);
    xhr.send(formData);
  });
};

// Usage
await uploadFileWithProgress(file, (progress) => {
  console.log(`Upload progress: ${progress.toFixed(1)}%`);
});
```

## Network Data Structure

### Complete Network Data Format

```typescript
interface NetworkData {
  network_data: {
    // Buses
    bus: Bus[];
    
    // AC Transmission Lines
    acline: Acline[];
    
    // Transformers
    transformer: Transformer[];
    
    // Generators
    generator: Generator[];
    
    // Loads
    load: Load[];
    
    // Fixed Shunts
    fixshunt?: FixShunt[];
    
    // Switched Shunts
    swshunt?: SwShunt[];
  };
}

// Bus Structure
interface Bus {
  ibus: number;           // Bus number (unique identifier)
  name: string;           // Bus name
  baskv: number;          // Base voltage (kV)
  ide: number;            // Bus type (1=PQ, 2=PV, 3=Slack)
  area: number;           // Area number
  zone: number;           // Zone number
  owner: number;          // Owner number
  vm: number;             // Voltage magnitude (pu)
  va: number;             // Voltage angle (degrees)
  nvhi: number;           // Normal voltage high limit (pu)
  nvlo: number;           // Normal voltage low limit (pu)
  evhi: number;           // Emergency voltage high limit (pu)
  evlo: number;           // Emergency voltage low limit (pu)
}

// AC Line Structure
interface Acline {
  ibus: number;           // From bus
  jbus: number;           // To bus
  ckt: string;            // Circuit ID
  rpu: number;             // Resistance (pu)
  xpu: number;             // Reactance (pu)
  bpu: number;             // Susceptance (pu)
  rate1: number;           // Rating 1 (MVA)
  rate2?: number;         // Rating 2 (MVA)
  rate3?: number;         // Rating 3 (MVA)
  stat: number;           // Status (0=out, 1=in service)
  met: number;            // Metering end (1=I, 2=J)
  len?: number;           // Length (miles)
  // ... additional fields
}

// Generator Structure
interface Generator {
  ibus: number;           // Bus number
  machid: string;         // Machine ID
  pg: number;             // Real power generation (MW)
  qg: number;             // Reactive power generation (MVar)
  qt: number;             // Maximum reactive power (MVar)
  qb: number;             // Minimum reactive power (MVar)
  vs: number;             // Voltage setpoint (pu)
  stat: number;           // Status (0=offline, 1=online)
  mbase: number;          // Machine base MVA
  // ... additional fields
}

// Load Structure
interface Load {
  ibus: number;           // Bus number
  loadid: string;         // Load ID
  stat: number;           // Status (0=inactive, 1=active)
  pl: number;             // Real power load (MW)
  ql: number;             // Reactive power load (MVar)
  // ... additional fields
}
```

### Example: Accessing Network Data

```typescript
import { PowerFlowApp } from '@/sdk';

const analyzeNetwork = async () => {
  const network = await PowerFlowApp.getNetwork();
  const data = network.network_data;
  
  // Count elements
  const stats = {
    buses: data.bus?.length || 0,
    lines: data.acline?.length || 0,
    generators: data.generator?.length || 0,
    loads: data.load?.length || 0,
    transformers: data.transformer?.length || 0,
  };
  
  // Find specific bus
  const bus101 = data.bus?.find(b => b.ibus === 101);
  if (bus101) {
    console.log(`Bus 101: ${bus101.name}, Voltage: ${bus101.vm} pu`);
  }
  
  // Find lines connected to a bus
  const linesFromBus101 = data.acline?.filter(l => l.ibus === 101);
  console.log(`Bus 101 has ${linesFromBus101.length} outgoing lines`);
  
  // Find generators on a bus
  const gensOnBus101 = data.generator?.filter(g => g.ibus === 101);
  console.log(`Bus 101 has ${gensOnBus101.length} generators`);
  
  // Calculate total load
  const totalLoad = data.load?.reduce((sum, load) => sum + (load.pl || 0), 0) || 0;
  console.log(`Total system load: ${totalLoad.toFixed(2)} MW`);
  
  // Calculate total generation
  const totalGen = data.generator?.reduce((sum, gen) => sum + (gen.pg || 0), 0) || 0;
  console.log(`Total generation: ${totalGen.toFixed(2)} MW`);
  
  return stats;
};
```

## Network Editing Operations

### Element Identifiers

Each element type requires specific identifier fields:

```typescript
import { ELEMENT_TYPES } from '@/sdk';

// Bus identifier
const busId = { ibus: 101 };

// Load identifier
const loadId = { ibus: 101, loadid: '1' };

// Generator identifier
const genId = { ibus: 101, machid: '1' };

// AC Line identifier
const lineId = { ibus: 101, jbus: 102, ckt: '1' };

// Transformer identifier
const xfmrId = { ibus: 101, jbus: 102, kbus: 0, ckt: '1' };
```

### Complete Editing Examples

#### Example 1: Add Complete Bus with Load and Generator

```typescript
const addCompleteBus = async (busNumber: number) => {
  try {
    // 1. Add the bus
    await PowerFlowApp.addElement('bus', {
      ibus: busNumber,
      name: `BUS_${busNumber}`,
      baskv: 230.0,
      ide: 1,  // PQ bus
      area: 1,
      zone: 1,
      owner: 1,
      vm: 1.0,
      va: 0.0,
      nvhi: 1.05,
      nvlo: 0.95,
      evhi: 1.10,
      evlo: 0.90,
    });
    
    // 2. Add a load
    await PowerFlowApp.addElement('load', {
      ibus: busNumber,
      loadid: '1',
      stat: 1,
      pl: 100.0,  // 100 MW
      ql: 50.0,   // 50 MVar
      area: 1,
      zone: 1,
    });
    
    // 3. Add a generator
    await PowerFlowApp.addElement('generator', {
      ibus: busNumber,
      machid: '1',
      pg: 150.0,  // 150 MW
      qg: 75.0,   // 75 MVar
      qt: 100.0,  // Max Q
      qb: -50.0,  // Min Q
      vs: 1.0,    // Voltage setpoint
      stat: 1,
      mbase: 100.0,
      rmpct: 100.0,
      pt: 200.0,  // Max P
      pb: 0.0,    // Min P
    });
    
    console.log(`Complete bus ${busNumber} added with load and generator`);
  } catch (error) {
    console.error('Failed to add complete bus:', error);
  }
};
```

#### Example 2: Modify Multiple Bus Voltages

```typescript
const adjustVoltages = async (voltageAdjustments: Array<{bus: number, voltage: number}>) => {
  try {
    for (const adj of voltageAdjustments) {
      await PowerFlowApp.modifyElement('bus', 
        { ibus: adj.bus },
        { vm: adj.voltage }
      );
      console.log(`Bus ${adj.bus} voltage set to ${adj.voltage} pu`);
    }
    
    // Recalculate after voltage adjustments
    const results = await PowerFlowApp.calculate('ac');
    console.log('Recalculation complete:', results.results?.converged);
  } catch (error) {
    console.error('Voltage adjustment failed:', error);
  }
};

// Usage
await adjustVoltages([
  { bus: 101, voltage: 1.02 },
  { bus: 102, voltage: 1.03 },
  { bus: 103, voltage: 1.01 },
]);
```

#### Example 3: Modify Line Impedance and Recalculate

```typescript
const modifyLineAndRecalculate = async (
  fromBus: number,
  toBus: number,
  circuitId: string,
  newR: number,
  newX: number
) => {
  try {
    // Modify line impedance
    await PowerFlowApp.modifyElement('acline',
      { ibus: fromBus, jbus: toBus, ckt: circuitId },
      { rpu: newR, xpu: newX }
    );
    
    console.log(`Line ${fromBus}-${toBus} impedance updated: R=${newR}, X=${newX}`);
    
    // Get updated network
    const network = await PowerFlowApp.getNetwork();
    const line = network.network_data.acline.find(
      l => l.ibus === fromBus && l.jbus === toBus && l.ckt === circuitId
    );
    
    console.log('Updated line data:', line);
    
    // Recalculate
    const results = await PowerFlowApp.calculate('dc');
    
    // Check power flows on the modified line
    if (results.results?.branch_results) {
      const branchResult = results.results.branch_results.find(
        br => br.ibus === fromBus && br.jbus === toBus && br.ckt === circuitId
      );
      
      if (branchResult) {
        console.log(`Line flow: P=${branchResult.p_flow.toFixed(2)} MW, Q=${branchResult.q_flow.toFixed(2)} MVar`);
        console.log(`Line loss: P=${branchResult.p_loss.toFixed(2)} MW`);
      }
    }
  } catch (error) {
    console.error('Line modification failed:', error);
  }
};
```

#### Example 4: Delete Element and All Related Elements

```typescript
const deleteBusAndRelated = async (busNumber: number) => {
  try {
    const network = PowerFlowApp.getCachedNetwork();
    const data = network.network_data;
    
    // 1. Delete all loads on the bus
    const loads = data.load?.filter(l => l.ibus === busNumber) || [];
    for (const load of loads) {
      await PowerFlowApp.deleteElement('load', {
        ibus: busNumber,
        loadid: load.loadid
      });
      console.log(`Deleted load ${load.loadid} on bus ${busNumber}`);
    }
    
    // 2. Delete all generators on the bus
    const generators = data.generator?.filter(g => g.ibus === busNumber) || [];
    for (const gen of generators) {
      await PowerFlowApp.deleteElement('generator', {
        ibus: busNumber,
        machid: gen.machid
      });
      console.log(`Deleted generator ${gen.machid} on bus ${busNumber}`);
    }
    
    // 3. Delete all lines connected to the bus
    const linesFrom = data.acline?.filter(l => l.ibus === busNumber) || [];
    const linesTo = data.acline?.filter(l => l.jbus === busNumber) || [];
    const allLines = [...linesFrom, ...linesTo];
    
    for (const line of allLines) {
      await PowerFlowApp.deleteElement('acline', {
        ibus: line.ibus,
        jbus: line.jbus,
        ckt: line.ckt
      });
      console.log(`Deleted line ${line.ibus}-${line.jbus} (${line.ckt})`);
    }
    
    // 4. Finally, delete the bus
    await PowerFlowApp.deleteElement('bus', { ibus: busNumber });
    console.log(`Deleted bus ${busNumber} and all related elements`);
    
  } catch (error) {
    console.error('Failed to delete bus and related elements:', error);
  }
};
```

## Data Aggregation

### Aggregating Calculation Results with Network Data

The SDK automatically aggregates calculation results with network data, but you can also do it manually:

```typescript
import { aggregateNetworkData } from '@/sdk/utils/dataAggregator';

const aggregateResults = (networkData: NetworkData, calculationResult: CalculationResult) => {
  // Aggregate calculation results into network data
  const aggregated = aggregateNetworkData(networkData, calculationResult);
  
  // Now buses have voltage and angle from calculation
  aggregated.network_data.bus.forEach((bus: any) => {
    console.log(`Bus ${bus.ibus}: V=${bus.vm} pu, Angle=${bus.va}°`);
  });
  
  // Lines have power flows
  aggregated.network_data.acline.forEach((line: any) => {
    console.log(`Line ${line.ibus}-${line.jbus}: P=${line.p_flow} MW`);
  });
  
  return aggregated;
};
```

### Example: Display Aggregated Data in Table

```typescript
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';
import { aggregateNetworkData } from '@/sdk/utils/dataAggregator';

function NetworkTable() {
  const { networkData, calculationResult } = usePowerFlowSDK();
  
  // Aggregate data
  const aggregatedData = useMemo(() => {
    if (!networkData || !calculationResult) return null;
    return aggregateNetworkData(networkData, calculationResult);
  }, [networkData, calculationResult]);
  
  if (!aggregatedData) return <div>No data</div>;
  
  return (
    <table>
      <thead>
        <tr>
          <th>Bus</th>
          <th>Name</th>
          <th>Voltage (pu)</th>
          <th>Angle (deg)</th>
          <th>Generation (MW)</th>
          <th>Load (MW)</th>
        </tr>
      </thead>
      <tbody>
        {aggregatedData.network_data.bus.map((bus: any) => (
          <tr key={bus.ibus}>
            <td>{bus.ibus}</td>
            <td>{bus.name}</td>
            <td>{bus.vm?.toFixed(4)}</td>
            <td>{bus.va?.toFixed(2)}</td>
            <td>{bus.pg?.toFixed(2) || 0}</td>
            <td>{bus.pl?.toFixed(2) || 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Example: Get Aggregated Bus Data

```typescript
import { getAggregatedBuses } from '@/sdk/utils/dataAggregator';

const getBusDataWithResults = (networkData: NetworkData, calculationResult: CalculationResult) => {
  // Get buses with calculation results aggregated
  const buses = getAggregatedBuses(networkData, calculationResult);
  
  // Each bus now has:
  // - Original network data (ibus, name, baskv, etc.)
  // - Calculation results (vm, va from calculation)
  // - Aggregated generation/load (pg, qg, pl, ql)
  
  return buses.map((bus: any) => ({
    number: bus.ibus,
    name: bus.name,
    voltage: bus.vm,
    angle: bus.va,
    generation: bus.pg || 0,
    load: bus.pl || 0,
    netPower: (bus.pg || 0) - (bus.pl || 0),
  }));
};
```

## Caching Strategy

### Understanding the Cache

The SDK maintains two caches:
1. **Network Data Cache** - Current network state
2. **Calculation Result Cache** - Last calculation results

### Cache Operations

```typescript
// Get cached network (fast, no API call)
const cachedNetwork = PowerFlowApp.getCachedNetwork();

// Get cached calculation result (fast, no API call)
const cachedResult = PowerFlowApp.getCachedCalculationResult();

// Clear all caches
PowerFlowApp.clearCache();

// Update cache manually (after local edits)
PowerFlowApp.updateCachedNetwork(newNetworkData);
```

### Example: Smart Data Loading

```typescript
const loadNetworkData = async (forceRefresh: boolean = false) => {
  // Check cache first
  let network = PowerFlowApp.getCachedNetwork();
  
  if (!network || forceRefresh) {
    // Load from API if no cache or forced refresh
    console.log('Loading network from API...');
    network = await PowerFlowApp.getNetwork();
  } else {
    console.log('Using cached network data');
  }
  
  return network;
};

// Usage
const network = await loadNetworkData(false);  // Use cache if available
const freshNetwork = await loadNetworkData(true);  // Force refresh
```

### Example: Cache Invalidation

```typescript
const editAndRefresh = async () => {
  try {
    // Make edit
    await PowerFlowApp.modifyElement('bus', { ibus: 101 }, { vm: 1.05 });
    
    // Network cache is automatically updated by SDK
    // But if you need fresh data, reload
    const updatedNetwork = await PowerFlowApp.getNetwork();
    
    return updatedNetwork;
  } catch (error) {
    console.error('Edit failed:', error);
  }
};
```

## Network Updates & Events

### Subscribing to Network Updates

```typescript
import { SDK_EVENTS } from '@/sdk';

// Subscribe to network update events
const unsubscribe = PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, (data) => {
  console.log('Network updated:', data);
  
  // Get fresh network data
  const network = PowerFlowApp.getCachedNetwork();
  console.log('Updated network:', network);
  
  // Update your UI
  // setNetworkData(network);
});
```

### Example: React Component with Network Updates

```typescript
import { useEffect, useState } from 'react';
import { PowerFlowApp, SDK_EVENTS } from '@/sdk';

function NetworkMonitor() {
  const [networkData, setNetworkData] = useState(null);
  
  useEffect(() => {
    // Initial load
    const loadNetwork = async () => {
      const network = await PowerFlowApp.getNetwork();
      setNetworkData(network);
    };
    loadNetwork();
    
    // Subscribe to updates
    const handleNetworkUpdate = (data: any) => {
      const network = PowerFlowApp.getCachedNetwork();
      setNetworkData(network);
    };
    
    PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdate);
    PowerFlowApp.on(SDK_EVENTS.EDIT_COMPLETE, handleNetworkUpdate);
    
    return () => {
      PowerFlowApp.off(SDK_EVENTS.NETWORK_UPDATED, handleNetworkUpdate);
      PowerFlowApp.off(SDK_EVENTS.EDIT_COMPLETE, handleNetworkUpdate);
    };
  }, []);
  
  if (!networkData) return <div>Loading...</div>;
  
  return (
    <div>
      <h3>Network Status</h3>
      <p>Buses: {networkData.network_data.bus.length}</p>
      <p>Lines: {networkData.network_data.acline.length}</p>
    </div>
  );
}
```

## Complete Examples

### Example 1: Complete Network Editing Workflow

```typescript
const completeEditingWorkflow = async () => {
  try {
    // 1. Load network
    const network = await PowerFlowApp.getNetwork();
    console.log('Initial network loaded');
    
    // 2. Add a new bus
    await PowerFlowApp.addElement('bus', {
      ibus: 99999,
      name: 'NEW_BUS',
      baskv: 230.0,
      ide: 1,
      vm: 1.0,
      va: 0.0,
    });
    console.log('Bus 99999 added');
    
    // 3. Add a load to the new bus
    await PowerFlowApp.addElement('load', {
      ibus: 99999,
      loadid: '1',
      stat: 1,
      pl: 50.0,
      ql: 25.0,
    });
    console.log('Load added to bus 99999');
    
    // 4. Connect to existing bus with a line
    await PowerFlowApp.addElement('acline', {
      ibus: 101,  // Existing bus
      jbus: 99999,  // New bus
      ckt: '1',
      rpu: 0.01,
      xpu: 0.05,
      bpu: 0.001,
      rate1: 100.0,
      stat: 1,
    });
    console.log('Line added from bus 101 to bus 99999');
    
    // 5. Modify the new bus voltage
    await PowerFlowApp.modifyElement('bus', { ibus: 99999 }, { vm: 1.02 });
    console.log('Bus 99999 voltage set to 1.02 pu');
    
    // 6. Recalculate
    const results = await PowerFlowApp.calculate('dc');
    console.log('Recalculation complete:', results.results?.converged);
    
    // 7. Check results for new bus
    const newBusResult = results.results?.bus_results?.find(
      (b: any) => b.ibus === 99999
    );
    if (newBusResult) {
      console.log(`Bus 99999 result: V=${newBusResult.vm.toFixed(4)} pu`);
    }
    
    // 8. Save changes
    await PowerFlowApp.saveSessionToUserFile();
    console.log('Changes saved');
    
  } catch (error) {
    console.error('Editing workflow failed:', error);
  }
};
```

### Example 2: Batch Load Modification

```typescript
const batchModifyLoads = async (loadChanges: Array<{
  bus: number;
  loadid: string;
  newPL: number;
  newQL: number;
}>) => {
  try {
    console.log(`Modifying ${loadChanges.length} loads...`);
    
    // Modify all loads
    for (const change of loadChanges) {
      await PowerFlowApp.modifyElement('load',
        { ibus: change.bus, loadid: change.loadid },
        { pl: change.newPL, ql: change.newQL }
      );
    }
    
    console.log('All loads modified');
    
    // Recalculate
    const results = await PowerFlowApp.calculate('dc');
    
    // Calculate total load change
    const totalPL = loadChanges.reduce((sum, c) => sum + c.newPL, 0);
    const totalQL = loadChanges.reduce((sum, c) => sum + c.newQL, 0);
    
    console.log(`Total load: P=${totalPL.toFixed(2)} MW, Q=${totalQL.toFixed(2)} MVar`);
    console.log('Calculation converged:', results.results?.converged);
    
    return results;
  } catch (error) {
    console.error('Batch modification failed:', error);
    throw error;
  }
};

// Usage
await batchModifyLoads([
  { bus: 101, loadid: '1', newPL: 120.0, newQL: 60.0 },
  { bus: 102, loadid: '1', newPL: 80.0, newQL: 40.0 },
  { bus: 103, loadid: '1', newPL: 150.0, newQL: 75.0 },
]);
```

### Example 3: Network Analysis with Aggregated Data

```typescript
const analyzeNetworkWithResults = async () => {
  try {
    // 1. Get network data
    const network = await PowerFlowApp.getNetwork();
    
    // 2. Run calculation
    const results = await PowerFlowApp.calculate('dc');
    
    // 3. Aggregate data
    const aggregated = aggregateNetworkData(network, results);
    
    // 4. Analyze
    const analysis = {
      totalBuses: aggregated.network_data.bus.length,
      totalLines: aggregated.network_data.acline.length,
      
      // Voltage statistics
      voltageStats: {
        min: Math.min(...aggregated.network_data.bus.map((b: any) => b.vm || 0)),
        max: Math.max(...aggregated.network_data.bus.map((b: any) => b.vm || 0)),
        avg: aggregated.network_data.bus.reduce((sum: number, b: any) => sum + (b.vm || 0), 0) / aggregated.network_data.bus.length,
      },
      
      // Power flow statistics
      lineFlows: aggregated.network_data.acline.map((line: any) => ({
        from: line.ibus,
        to: line.jbus,
        power: line.p_flow || 0,
        loss: line.p_loss || 0,
        utilization: line.rate1 ? ((line.p_flow || 0) / line.rate1 * 100) : 0,
      })),
      
      // Bus loading
      busLoading: aggregated.network_data.bus.map((bus: any) => ({
        bus: bus.ibus,
        name: bus.name,
        voltage: bus.vm || 0,
        generation: bus.pg || 0,
        load: bus.pl || 0,
        netPower: (bus.pg || 0) - (bus.pl || 0),
      })),
    };
    
    // 5. Find overloaded lines
    const overloadedLines = analysis.lineFlows.filter(
      (line: any) => line.utilization > 100
    );
    
    if (overloadedLines.length > 0) {
      console.warn(`⚠️ ${overloadedLines.length} overloaded lines found`);
      overloadedLines.forEach((line: any) => {
        console.warn(`Line ${line.from}-${line.to}: ${line.utilization.toFixed(1)}% utilization`);
      });
    }
    
    // 6. Find buses with voltage violations
    const voltageViolations = analysis.busLoading.filter(
      (bus: any) => bus.voltage < 0.95 || bus.voltage > 1.05
    );
    
    if (voltageViolations.length > 0) {
      console.warn(`⚠️ ${voltageViolations.length} voltage violations found`);
      voltageViolations.forEach((bus: any) => {
        console.warn(`Bus ${bus.bus}: ${bus.voltage.toFixed(4)} pu`);
      });
    }
    
    return analysis;
  } catch (error) {
    console.error('Network analysis failed:', error);
    throw error;
  }
};
```

### Example 4: React Component - Network Editor

```typescript
import React, { useState } from 'react';
import { usePowerFlowSDK } from '@/hooks/usePowerFlowSDK';

function NetworkEditor() {
  const {
    networkData,
    calculationResult,
    addElement,
    modifyElement,
    deleteElement,
    calculate,
    loading,
  } = usePowerFlowSDK();
  
  const [selectedBus, setSelectedBus] = useState<number | null>(null);
  
  const handleAddBus = async () => {
    const busNum = prompt('Enter bus number:');
    if (!busNum) return;
    
    try {
      await addElement('bus', {
        ibus: parseInt(busNum),
        name: `BUS_${busNum}`,
        baskv: 230.0,
        ide: 1,
        vm: 1.0,
        va: 0.0,
      });
      
      // Recalculate after adding bus
      await calculate('dc');
    } catch (error) {
      console.error('Failed to add bus:', error);
    }
  };
  
  const handleModifyBus = async (busNumber: number) => {
    const newVoltage = prompt('Enter new voltage (pu):');
    if (!newVoltage) return;
    
    try {
      await modifyElement('bus', 
        { ibus: busNumber },
        { vm: parseFloat(newVoltage) }
      );
      
      // Recalculate
      await calculate('dc');
    } catch (error) {
      console.error('Failed to modify bus:', error);
    }
  };
  
  const handleDeleteBus = async (busNumber: number) => {
    if (!confirm(`Delete bus ${busNumber}?`)) return;
    
    try {
      await deleteElement('bus', { ibus: busNumber });
      await calculate('dc');
    } catch (error) {
      console.error('Failed to delete bus:', error);
    }
  };
  
  if (!networkData) return <div>No network data</div>;
  
  return (
    <div>
      <button onClick={handleAddBus} disabled={loading}>
        Add Bus
      </button>
      
      <table>
        <thead>
          <tr>
            <th>Bus</th>
            <th>Name</th>
            <th>Voltage (pu)</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {networkData.network_data.bus.map((bus: any) => {
            // Get voltage from calculation results if available
            const busResult = calculationResult?.results?.bus_results?.find(
              (b: any) => b.ibus === bus.ibus
            );
            const voltage = busResult?.vm || bus.vm || 0;
            
            return (
              <tr key={bus.ibus}>
                <td>{bus.ibus}</td>
                <td>{bus.name}</td>
                <td>{voltage.toFixed(4)}</td>
                <td>
                  <button onClick={() => handleModifyBus(bus.ibus)}>Modify</button>
                  <button onClick={() => handleDeleteBus(bus.ibus)}>Delete</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

## API Reference

### Network Data Methods

```typescript
// Get network data (API call)
PowerFlowApp.getNetwork(sessionId?: string): Promise<NetworkData>

// Get cached network (no API call)
PowerFlowApp.getCachedNetwork(): NetworkData | null

// Update cached network
PowerFlowApp.updateCachedNetwork(networkData: NetworkData): void
```

### Edit Methods

```typescript
// Add element
PowerFlowApp.addElement(
  elementType: string,
  data: object
): Promise<{message: string}>

// Modify element
PowerFlowApp.modifyElement(
  elementType: string,
  identifier: object,
  data: object
): Promise<{message: string}>

// Delete element
PowerFlowApp.deleteElement(
  elementType: string,
  identifier: object
): Promise<{message: string}>
```

### Element Identifiers Reference

```typescript
// Bus
{ ibus: number }

// Load
{ ibus: number, loadid: string }

// Generator
{ ibus: number, machid: string }

// AC Line
{ ibus: number, jbus: number, ckt: string }

// Transformer
{ ibus: number, jbus: number, kbus: number, ckt: string }

// Fixed Shunt
{ ibus: number, shntid: string }

// Switched Shunt
{ ibus: number, shntid: string }
```

### Data Aggregation Functions

```typescript
// Aggregate network data with calculation results
aggregateNetworkData(
  networkData: NetworkData,
  calculationResult: CalculationResult
): NetworkData

// Get aggregated buses
getAggregatedBuses(
  networkData: NetworkData,
  calculationResult: CalculationResult
): Bus[]

// Get aggregated lines
getAggregatedLines(
  networkData: NetworkData,
  calculationResult: CalculationResult
): Acline[]
```

## Best Practices

1. **Use cached data when possible** - Avoid unnecessary API calls
2. **Subscribe to events** - Use `NETWORK_UPDATED` event instead of polling
3. **Batch operations** - Group multiple edits before recalculating
4. **Validate identifiers** - Ensure identifier fields match element type
5. **Handle errors** - Always wrap API calls in try-catch
6. **Clear cache when needed** - Clear cache when switching sessions
7. **Use aggregation** - Use data aggregation functions for combined views

## Troubleshooting

### Network data not updating after edit

```typescript
// Subscribe to network update events
PowerFlowApp.on(SDK_EVENTS.NETWORK_UPDATED, () => {
  const network = PowerFlowApp.getCachedNetwork();
  // Update your component state
});

// Or manually reload
const network = await PowerFlowApp.getNetwork();
```

### Element not found error

```typescript
// Verify element exists before modifying/deleting
const network = PowerFlowApp.getCachedNetwork();
const bus = network.network_data.bus.find(b => b.ibus === 101);

if (!bus) {
  console.error('Bus 101 not found');
  return;
}

// Now safe to modify/delete
await PowerFlowApp.modifyElement('bus', { ibus: 101 }, { vm: 1.05 });
```

### Cache out of sync

```typescript
// Force refresh
PowerFlowApp.clearCache();
const network = await PowerFlowApp.getNetwork();
```

## See Also

- [SDK.md](./SDK.md) - Complete SDK documentation
- [SETUP.md](./SETUP.md) - Environment configuration
- API config: `src/config/api.ts`
- Data aggregator: `src/sdk/utils/dataAggregator.js`
- Network elements: `src/parameters/networkElements.ts`
