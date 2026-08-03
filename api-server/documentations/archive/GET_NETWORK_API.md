# Get Session Network API

## Overview

This API endpoint retrieves the current network data (in JSON format) from a session's temp file. It's useful for:
- Displaying network structure in UI
- Inspecting network state after edits
- Validating network before power flow calculation
- Debugging network configuration

## Endpoints

### Get Session Network
```
POST /api/v1/sessions/network
```

### Get Session Info
```
POST /api/v1/sessions/info
```

## Request Format

### Get Network Request
```json
{
  "session_id": "string (required)",
  "temp_file_id": "string (optional)"
}
```

### Get Session Info Request
```json
{
  "session_id": "string (required)"
}
```

## Response Format

```json
{
  "status": "success",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
  "network_data": {
    "bus": [
      {
        "ibus": 101,
        "name": "Bus 101",
        "baskv": 230.0,
        "ide": 1,
        "vm": 1.0,
        "va": 0.0,
        "area": 1,
        "zone": 1,
        "owner": 1
      }
    ],
    "load": [
      {
        "ibus": 101,
        "loadid": "1",
        "stat": 1,
        "pl": 100.0,
        "ql": 50.0
      }
    ],
    "generator": [...],
    "acline": [...],
    "transformer": [...],
    "caseid": {...},
    "general": {...},
    "adjust": {...}
  }
}
```

## Network Data Structure

The `network_data` field contains all network elements in a structured format:

### **Arrays of Elements:**
- `bus` - Array of bus objects
- `load` - Array of load objects
- `generator` - Array of generator objects
- `acline` - Array of AC line objects
- `transformer` - Array of transformer objects
- `fixshunt` - Array of fixed shunt objects
- `swshunt` - Array of switched shunt objects
- `area` - Array of area objects
- `zone` - Array of zone objects
- `owner` - Array of owner objects

### **Configuration Objects:**
- `caseid` - Case identification
- `general` - General parameters
- `gauss` - Gauss-Seidel solver parameters
- `newton` - Newton-Raphson solver parameters
- `adjust` - Adjustment parameters
- `tysl` - TYSL parameters
- `solver` - Solver configuration

## Usage Examples

### **Get Session Info:**
```bash
BASE_URL="http://localhost:8080/api/v1"

curl -X POST "$BASE_URL/sessions/info" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id"
  }'
```

### **Get Network Data:**
```bash
# Get network data for a session
curl -X POST "$BASE_URL/sessions/network" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id"
  }'
```

### **With Specific Temp File:**
```bash
# Get network data from a specific temp file
curl -X POST "$BASE_URL/sessions/network" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "your-session-id",
    "temp_file_id": "temp-file-id"
  }'
```

### **Complete Workflow:**
```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Create session
SESSION_ID=$(curl -s -X POST "$BASE_URL/sessions" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')

# 2. Upload file
curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx"

# Wait for temp file
sleep 2

# 3. Get initial network data
curl -s -X POST "$BASE_URL/sessions/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq

# 4. Edit an element
curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "modify",
    "identifier": {"ibus": 101},
    "data": {"ibus": 101, "vm": 1.05}
  }'

# 5. Get updated network data (see the change!)
curl -s -X POST "$BASE_URL/sessions/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq

# 6. Get specific bus data
curl -s -X POST "$BASE_URL/sessions/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | \
  jq '.network_data.bus[] | select(.ibus == 101)'
```

## How It Works

```
Client                Go Server              Rust Parser
  │                       │                       │
  │ GET /sessions/...     │                       │
  │  /network             │                       │
  ├──────────────────────►│                       │
  │                       │                       │
  │                       │ Get temp file path    │
  │                       │                       │
  │                       │ parse --file path     │
  │                       ├──────────────────────►│
  │                       │  --api-server-url     │
  │                       │                       │
  │                       │ Wait on channel       │ Parse RAWX
  │                       │                       │ to NetworkData
  │                       │                       │
  │                       │ POST /network/parse   │
  │                       │◄──────────────────────┤
  │                       │ {network_data: {...}} │
  │                       │                       │
  │                       │ Receive from channel  │
  │                       │                       │
  │ Response              │                       │
  │◄──────────────────────┤                       │
  │ {network_data: {...}} │                       │
  │                       │                       │
```

## Response Fields

### **Success Response:**
```json
{
  "status": "success",
  "session_id": "...",
  "temp_file_id": "...",
  "network_data": {
    "bus": [...],
    "load": [...],
    ...
  }
}
```

### **Error Responses:**

**Session Not Found:**
```json
{
  "error": "session_not_found",
  "message": "Session not found"
}
```

**Temp File Not Found:**
```json
{
  "error": "temp_file_not_found",
  "message": "No temporary file found for this session"
}
```

**Parse Failed:**
```json
{
  "error": "parse_failed",
  "message": "Failed to parse network data: ..."
}
```

## Use Cases

### **1. Display Network in UI**
```javascript
// Frontend code
async function displayNetwork(sessionId) {
  const response = await fetch(
    'http://localhost:8080/api/v1/sessions/network',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    }
  );
  const data = await response.json();
  
  // Display buses
  data.network_data.bus.forEach(bus => {
    console.log(`Bus ${bus.ibus}: ${bus.name} - ${bus.baskv} kV`);
  });
  
  // Display loads
  data.network_data.load.forEach(load => {
    console.log(`Load at bus ${load.ibus}: ${load.pl} MW`);
  });
}
```

### **2. Validate Before Calculation**
```bash
# Check if network has required elements
NETWORK=$(curl -s -X POST "$BASE_URL/sessions/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}')

BUS_COUNT=$(echo $NETWORK | jq '.network_data.bus | length')
GEN_COUNT=$(echo $NETWORK | jq '.network_data.generator | length')

echo "Network has $BUS_COUNT buses and $GEN_COUNT generators"

if [ $GEN_COUNT -lt 1 ]; then
  echo "Error: No generators in network!"
  exit 1
fi
```

### **3. Inspect After Edits**
```bash
# Edit element
curl -X POST "$BASE_URL/edit" -d '{...}'

# Verify the edit
curl -s -X POST "$BASE_URL/sessions/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | \
  jq '.network_data.bus[] | select(.ibus == 99999)'

# Output:
# {
#   "ibus": 99999,
#   "name": "NEW BUS",
#   "baskv": 230.0,
#   ...
# }
```

## API Routes Summary

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| POST | `/api/v1/sessions` | Create session | user_id | session_id |
| POST | `/api/v1/upload` | Upload RAWX file | file, session_id | file_path |
| **POST** | **`/api/v1/sessions/info`** | **Get session info** | **session_id** | **Session details** |
| **POST** | **`/api/v1/sessions/network`** | **Get network data** | **session_id** | **NetworkData JSON** |
| POST | `/api/v1/edit` | Edit element | session_id, element data | success |
| POST | `/api/v1/calculate` | Run power flow | session_id, config | results |

The new API completes the workflow by allowing you to **read** the network data at any point! 🎯

## Build Status

✅ **Go API server**: Compiled successfully  
✅ **New endpoint**: `/api/v1/sessions/:session_id/network`  
✅ **Ready to use!**