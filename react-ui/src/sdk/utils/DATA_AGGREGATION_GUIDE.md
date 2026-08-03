# Data Aggregation Guide

## Overview

After power flow calculation, the SDK automatically **aggregates** calculation results with network data. This means bus voltage results and AC line power flows are merged into the network data structure.

## What Gets Aggregated

### 1. Bus Data

**Original network data:**
```javascript
{
  ibus: 1,
  name: "Bus 1",
  baskv: 230,
  vm: 1.0,      // Base case voltage
  va: 0.0,      // Base case angle
}
```

**After calculation (aggregated):**
```javascript
{
  ibus: 1,
  name: "Bus 1",
  baskv: 230,
  vm: 1.045,              // ← Updated from calculation
  va: -2.34,              // ← Updated from calculation
  net_p_injection: 100.5, // ← Added from calculation
  net_q_injection: 25.3,  // ← Added from calculation
}
```

### 2. AC Line Data

**Original network data (NO P and Q):**
```javascript
{
  ibus: 1,
  jbus: 2,
  ckt: "1",
  r: 0.01,
  x: 0.05,
  b: 0.002,
  // No p_flow, q_flow, s_flow
}
```

**After calculation (aggregated with flows):**
```javascript
{
  ibus: 1,
  jbus: 2,
  ckt: "1",
  r: 0.01,
  x: 0.05,
  b: 0.002,
  p_flow: 150.5,  // ← Added from calculation
  q_flow: 35.2,   // ← Added from calculation
  s_flow: 154.6,  // ← Added from calculation
}
```

## Automatic Aggregation

When you call `calculate()`, the SDK automatically:

1. ✅ Runs power flow calculation
2. ✅ Gets calculation results (bus_results, branch_results)
3. ✅ Merges results into network data
4. ✅ Updates `networkData` in the hook state

```typescript
// In your component
const { calculate, networkData } = usePowerFlowSDK();

await calculate('fnsl');

// networkData is now automatically aggregated!
console.log(networkData.network_data.bus); // Has updated vm, va
console.log(networkData.network_data.acline); // Has p_flow, q_flow
```

## Helper Functions

### Get Aggregated Buses

```typescript
const { getAggregatedBuses } = usePowerFlowSDK();

const buses = getAggregatedBuses();
// Returns: Array of buses with voltage results merged
```

### Get Aggregated Lines

```typescript
const { getAggregatedLines } = usePowerFlowSDK();

const lines = getAggregatedLines();
// Returns: Array of AC lines with P, Q, S flows added
```

## Manual Aggregation

If you need to manually aggregate data:

```typescript
import { aggregateNetworkData } from '@/sdk';

const aggregated = aggregateNetworkData(networkData, calculationResult);
```

### Individual Aggregation

```typescript
import { 
  aggregateBusData, 
  aggregateAclineData 
} from '@/sdk';

// Aggregate just buses
const busesWithResults = aggregateBusData(
  networkData.network_data.bus,
  calculationResult.results.bus_results
);

// Aggregate just AC lines
const linesWithFlows = aggregateAclineData(
  networkData.network_data.acline,
  calculationResult.results.branch_results
);
```

## Matching Logic

### Bus Matching
- Matches by `ibus` (network) = `bus_number` (result)

### AC Line Matching
- Matches by: `from_bus`, `to_bus`, and `circuit_id`
- Key format: `{from_bus}_{to_bus}_{ckt}`
- Example: `1_2_1` matches line from bus 1 to bus 2, circuit "1"

## Use Cases

### Display Results in Table

```typescript
function BusResultsTable() {
  const { getAggregatedBuses } = usePowerFlowSDK();
  const buses = getAggregatedBuses();

  return (
    <table>
      <thead>
        <tr>
          <th>Bus</th>
          <th>V (p.u.)</th>
          <th>Angle (deg)</th>
          <th>P (MW)</th>
          <th>Q (MVAr)</th>
        </tr>
      </thead>
      <tbody>
        {buses.map(bus => (
          <tr key={bus.ibus}>
            <td>{bus.ibus}</td>
            <td>{bus.vm?.toFixed(4)}</td>
            <td>{bus.va?.toFixed(2)}</td>
            <td>{bus.net_p_injection?.toFixed(2)}</td>
            <td>{bus.net_q_injection?.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Display Line Flows

```typescript
function LineFlowsTable() {
  const { getAggregatedLines } = usePowerFlowSDK();
  const lines = getAggregatedLines();

  return (
    <table>
      <thead>
        <tr>
          <th>From</th>
          <th>To</th>
          <th>P (MW)</th>
          <th>Q (MVAr)</th>
          <th>S (MVA)</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, idx) => (
          <tr key={idx}>
            <td>{line.ibus}</td>
            <td>{line.jbus}</td>
            <td>{line.p_flow?.toFixed(2)}</td>
            <td>{line.q_flow?.toFixed(2)}</td>
            <td>{line.s_flow?.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

### Update Network Diagram

```typescript
function NetworkDiagram() {
  const { networkData, calculationResult } = usePowerFlowSDK();

  // networkData already has aggregated results after calculate()
  const buses = networkData?.network_data?.bus || [];
  
  return (
    <svg>
      {buses.map(bus => (
        <BusElement
          key={bus.ibus}
          bus={bus}
          voltage={bus.vm}     // From calculation
          angle={bus.va}       // From calculation
        />
      ))}
    </svg>
  );
}
```

## Benefits

✅ **Automatic** - No manual merging needed  
✅ **Real-time** - Results immediately available after calculation  
✅ **Type-safe** - Proper matching by bus/line identifiers  
✅ **Non-destructive** - Original data preserved, results added  
✅ **Helper methods** - Easy access to aggregated data  

## API Reference

### `aggregateNetworkData(networkData, calculationResult)`
Aggregates all calculation results into network data.

### `aggregateBusData(busArray, busResults)`
Merges bus voltage results into bus data array.

### `aggregateAclineData(aclineArray, branchResults)`
Adds P, Q, S flows to AC line data array.

### `getAggregatedBuses()`
Hook method - returns buses with results merged.

### `getAggregatedLines()`
Hook method - returns AC lines with flows added.

---

**Note:** Aggregation happens automatically in the `calculate()` hook method. You can access aggregated data directly from `networkData` or use the helper methods.

