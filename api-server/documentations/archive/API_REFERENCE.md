# API Reference - X-Flow Power Flow Solver

## Base URL
```
http://localhost:8080/api/v1
```

## Naming Convention
All endpoints use **singular** terms for consistency:
- `/session` (not `/sessions`)
- `/user` (not `/users`)
- `/solver/result` (not `/solver/results`)

---

## Session Management

### 1. Create Session
Creates a new user session for file uploads and calculations.

**Endpoint:** `POST /session`

**Request:**
```json
{
  "user_id": "demo_user"
}
```

**Response:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "status": "success",
  "message": "Session created successfully"
}
```

---

### 2. Get Session Info
Retrieves detailed information about a session.

**Endpoint:** `POST /session/info`

**Request:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"
}
```

**Response:**
```json
{
  "id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "user_id": "demo_user",
  "status": "ready",
  "created_at": "2025-09-30T12:00:00Z",
  "updated_at": "2025-09-30T12:05:00Z",
  "file_path": "/data/uploads/demo_user/session-id/file.rawx",
  "results_path": "/data/results/demo_user/session-id/results.json",
  "method": "DC",
  "converged": true,
  "solution_time_ms": 125
}
```

---

### 3. Get Session Network
Retrieves the parsed network data (buses, loads, generators, etc.) from a session's file.

**Endpoint:** `POST /session/network`

**Request:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "temp_file_id": "optional-temp-file-id"
}
```

**Response:**
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
        "va": 0.0
      }
    ],
    "load": [...],
    "generator": [...],
    "acline": [...],
    "transformer": [...],
    "caseid": {...},
    "general": {...}
  }
}
```

---

### 4. Get User Sessions
Retrieves all sessions for a specific user.

**Endpoint:** `POST /user/session`

**Request:**
```json
{
  "user_id": "demo_user"
}
```

**Response:**
```json
[
  {
    "id": "session-id-1",
    "user_id": "demo_user",
    "status": "completed",
    "created_at": "2025-09-30T12:00:00Z",
    "updated_at": "2025-09-30T12:05:00Z",
    "file_path": "...",
    "results_path": "..."
  },
  {
    "id": "session-id-2",
    "user_id": "demo_user",
    "status": "ready",
    ...
  }
]
```

---

### 5. Delete User Sessions
Deletes all sessions for a specific user.

**Endpoint:** `DELETE /user/session`

**Request:**
```json
{
  "user_id": "demo_user"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Cleaned up all sessions for user demo_user",
  "user_id": "demo_user"
}
```

---

## File Operations

### 6. Upload File
Uploads a RAWX file to a session.

**Endpoint:** `POST /upload?session_id=<session_id>`

**Request:** Multipart form data
```bash
curl -X POST "http://localhost:8080/api/v1/upload?session_id=session-id" \
  -F "file=@network.rawx"
```

**Response:**
```json
{
  "status": "success",
  "message": "File uploaded successfully. Temp file creation in progress.",
  "file_path": "/data/uploads/user/session/file.rawx",
  "session_id": "session-id",
  "temp_file_id": ""
}
```

---

### 7. Save File
Saves a temporary file (overwrites original or saves as new file).

**Endpoint:** `POST /save`

**Request:**
```json
{
  "session_id": "session-id",
  "temp_file_id": "temp-file-id",
  "action": "overwrite",
  "new_name": "new_file.rawx"
}
```

**Actions:**
- `overwrite` - Overwrites the original uploaded file
- `save_as` - Saves as a new file (requires `new_name`)

**Response:**
```json
{
  "status": "success",
  "message": "File saved successfully (overwritten original)",
  "file_path": "/data/uploads/user/session/file.rawx",
  "temp_file_id": "temp-file-id"
}
```

---

## Network Editing

### 8. Edit Element
Adds, modifies, or deletes a network element.

**Endpoint:** `POST /edit`

**Request:**
```json
{
  "session_id": "session-id",
  "temp_file_id": "optional-temp-file-id",
  "element_type": "bus",
  "action": "add",
  "data": {
    "ibus": 99999,
    "name": "NEW BUS",
    "baskv": 230.0,
    "ide": 1,
    "vm": 1.0,
    "va": 0.0
  },
  "identifier": {
    "ibus": 99999
  }
}
```

**Element Types:**
- `bus`
- `load`
- `generator`
- `acline`
- `transformer`

**Actions:**
- `add` - Requires `data`
- `modify` - Requires `identifier` and `data`
- `delete` - Requires `identifier`

**Response:**
```json
{
  "status": "success",
  "message": "bus add operation completed successfully",
  "session_id": "session-id",
  "temp_file_id": "temp-file-id",
  "file_path": "/data/temp/session_temp.rawx"
}
```

---

## Power Flow Calculation

### 9. Calculate Power Flow
Runs power flow calculation on a session's network.

**Endpoint:** `POST /calculate`

**Request:**
```json
{
  "session_id": "session-id",
  "temp_file_id": "optional-temp-file-id",
  "config": {
    "method": "DC",
    "tolerance": 1e-6,
    "max_iterations": 100
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Power flow calculation completed successfully",
  "session_id": "session-id",
  "method": "DC",
  "used_temp_file": true,
  "results": {
    "converged": true,
    "iterations": 3,
    "solution_time_ms": 125,
    "bus_results": [...],
    "branch_results": [...],
    "system_summary": {...}
  }
}
```

---

## System Information

### 10. Health Check
Checks if the API server is healthy.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "service": "power-flow-solver-api",
  "timestamp": "2025-09-30T12:00:00Z"
}
```

---

### 11. Get Statistics
Retrieves storage and session statistics.

**Endpoint:** `GET /stat`

**Response:**
```json
{
  "total_sessions": 10,
  "active_sessions": 3,
  "total_files": 15,
  "total_temp_files": 8,
  "storage_used_mb": 45.2
}
```

---

## Internal Endpoints (Called by Rust)

These endpoints are called automatically by the Rust solver and should not be called directly by clients.

### Solver Result Callback
**Endpoint:** `POST /solver/result`  
**Called by:** Rust solver after power flow calculation

### Network Parse Callback
**Endpoint:** `POST /network/parse`  
**Called by:** Rust parser after parsing RAWX file

### Editor Callback
**Endpoint:** `POST /editor/edited`  
**Called by:** Rust solver after editing network elements

---

## Complete Workflow Example

```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Create session
SESSION=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}')
SESSION_ID=$(echo $SESSION | jq -r '.session_id')

# 2. Upload RAWX file
curl -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx"

# Wait for temp file creation
sleep 2

# 3. Get session info
curl -X POST "$BASE_URL/session/info" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}'

# 4. Get network data
curl -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq

# 5. Edit network (add a bus)
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {
      "ibus": 99999,
      "name": "NEW BUS",
      "baskv": 230.0,
      "ide": 1,
      "vm": 1.0,
      "va": 0.0
    }
  }'

# 6. Verify edit
curl -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | \
  jq '.network_data.bus[] | select(.ibus == 99999)'

# 7. Run power flow calculation
curl -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {
      "method": "DC",
      "tolerance": 1e-6,
      "max_iterations": 100
    }
  }' | jq

# 8. Save changes
curl -X POST "$BASE_URL/save" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "temp-file-id",
    "action": "overwrite"
  }'

# 9. Get all user sessions
curl -X POST "$BASE_URL/user/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq
```

---

## API Endpoint Summary Table

| Method | Endpoint | Purpose | Input |
|--------|----------|---------|-------|
| **Session Management** |
| POST | `/session` | Create session | `{user_id}` |
| POST | `/session/info` | Get session details | `{session_id}` |
| POST | `/session/network` | Get network data | `{session_id, temp_file_id?}` |
| POST | `/user/session` | Get user's sessions | `{user_id}` |
| DELETE | `/user/session` | Delete user's sessions | `{user_id}` |
| **File Operations** |
| POST | `/upload` | Upload RAWX file | Form data + query param |
| POST | `/save` | Save temp file | `{session_id, temp_file_id, action}` |
| **Network Editing** |
| POST | `/edit` | Edit network element | `{session_id, element_type, action, data?, identifier?}` |
| **Calculation** |
| POST | `/calculate` | Run power flow | `{session_id, config}` |
| **System** |
| GET | `/health` | Health check | None |
| GET | `/stat` | System statistics | None |
| **Internal (Rust Callbacks)** |
| POST | `/solver/result` | Receive calculation results | From Rust |
| POST | `/network/parse` | Receive parsed network | From Rust |
| POST | `/editor/edited` | Receive edited network | From Rust |

---

## Build Status

✅ **Go API Server:** Compiled successfully  
✅ **Rust Flow Solver:** Compiled successfully  
✅ **All endpoints:** Using singular naming convention  
✅ **Consistent design:** All use POST with JSON payloads (except GET endpoints)

---

## Testing

Run the test script:
```bash
cd api-server
./test_get_network.sh
```