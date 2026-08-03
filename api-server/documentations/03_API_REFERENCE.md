# API Reference

## Base URL

```
http://localhost:8080/api/v1
```

## Response contract (standardized for SDK/MCP)

All JSON responses use a consistent shape so clients (including the SDK and MCP tool results) can treat them uniformly:

- **Success (2xx):** Response body includes `"status": "success"` and, where applicable, a `"message"` field. Endpoints that previously omitted these (e.g. get user files, get power flow data) now include them.
- **Error (4xx/5xx):** Response body is `ErrorResponse`: `"status": "error"`, `"error"` (code), and `"message"` (human-readable). Use `response.status === "error"` or check the `error` field to detect failures without relying only on HTTP status.

This allows the frontend to build tool results for the AI (e.g. `status`, `message`, `next_action`) directly from the API response.

## Authentication

The API uses **JWT bearer tokens** for authentication.

- **Login endpoint (public):** `POST /auth/login`
- **Protected endpoints:** All `/api/v1/**` routes **except** `/auth/login` and the internal Rust callback routes (`/solver/result`, `/network/parse`, `/editor/edited`) require a valid `Authorization: Bearer <token>` header.

### Login

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "ChangeMe123!"
}
```

**Response:**
```json
{
  "access_token": "<jwt-token>",
  "token_type": "Bearer",
  "expires_in": 86400,
  "user": {
    "id": "c6c6e5d6-4f68-4a3b-9e3d-9f7b8f2a1b2c",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

The front-end or client SDK should:

- Store `access_token` securely (e.g. in memory or an HTTP-only cookie).
- Include it on **all subsequent API requests**:

```bash
TOKEN="<jwt-token-from-login>"
curl -X GET "http://localhost:8080/api/v1/stat" \
  -H "Authorization: Bearer $TOKEN"
```

> **Note:** Some request types still accept a `user_id` field for backward compatibility, but the server always uses the authenticated user from the JWT and ignores `user_id` where noted.

## Endpoint Overview

| Category | Endpoints |
|----------|-----------|
| **User File Management** | Upload, list, download, delete user files |
| **Session Lifecycle** | Create, manage, destroy sessions |
| **Session Model Operations** | Network operations within sessions |
| **System** | Health checks and statistics |

---

## User File Management

### Upload User File

Upload a file to the user's personal folder (models or knowledge base).

**Endpoint:** `POST /user/upload`

**Request:** Multipart form data (authenticated user is taken from the JWT)
- `file_type` (string, required) - Must be `"models"` or `"knowledge"`
- `file` (file, required) - The file to upload

**Response:**
```json
{
  "status": "success",
  "message": "File uploaded successfully",
  "file_path": "/path/to/uploaded/file.rawx"
}
```

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/user/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file_type=models" \
  -F "file=@network.rawx"
```

---

### Get User Files

List all files for a user in a specific category (models or knowledge).

**Endpoint:** `POST /user/files`

**Request:**
```json
{
  "file_type": "models"
}
```

**Response:**
```json
{
  "user_id": "c6c6e5d6-4f68-4a3b-9e3d-9f7b8f2a1b2c",
  "files": ["network1.rawx", "network2.rawx"],
  "total": 2
}
```

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/user/files" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "file_type": "models"
  }'
```

---

### Download User File

Download a user file with caching support (ETag, Last-Modified, Range requests).

**Endpoint:** `POST /user/files/download`

**Request:**
```json
{
  "file_type": "models",
  "file_name": "network.rawx"
}
```

**Response:** File content with appropriate Content-Type headers

**Headers:**
- `ETag` - For conditional requests
- `Last-Modified` - For cache validation
- `Cache-Control` - Cache directives
- `Accept-Ranges: bytes` - Supports Range requests

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/user/files/download" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "file_type": "models",
    "file_name": "network.rawx"
  }' \
  --output network.rawx
```

---

### Delete User File

Delete a user file from models or knowledge base.

**Endpoint:** `POST /user/files/delete`

**Request:**
```json
{
  "file_type": "models",
  "file_name": "network.rawx"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "File network.rawx deleted successfully",
  "file_name": "network.rawx"
}
```

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/user/files/delete" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "file_type": "models",
    "file_name": "network.rawx"
  }'
```

---

## Session Lifecycle Management

### Create Session

Create a new empty session for a user.

**Endpoint:** `POST /session`

**Request:** (body is optional; the authenticated user from JWT is used)
```json
{
}
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

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/session" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

---

### Load Case

Create a session from a network case (RAWX) in the user library, copying it into the session workspace.

**Endpoint:** `POST /session/load-case`

**Request:**
```json
{
  "file_name": "network.rawx"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Session created successfully from file",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "user_id": "c6c6e5d6-4f68-4a3b-9e3d-9f7b8f2a1b2c",
  "file_name": "network.rawx"
}
```

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/session/load-case" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "network.rawx"
  }'
```

---

### Get Session Info

Retrieve detailed information about a session.

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
  "status": "completed",
  "created_at": "2025-01-15T12:00:00Z",
  "updated_at": "2025-01-15T12:05:00Z",
  "file_path": "/path/to/session/file.rawx",
  "results_path": "/path/to/results/results.json",
  "method": "dc",
  "converged": true,
  "solution_time_ms": 125
}
```

**Session Status Values:**
- `created` - Session created, no file uploaded
- `file_uploaded` - File uploaded to session
- `ready` - Session ready for operations
- `processing` - Calculation or edit in progress
- `completed` - Operation completed successfully
- `failed` - Operation failed

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/session/info" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"}'
```

---

### Get User Sessions

List all sessions for a user.

**Endpoint:** `POST /user/sessions`

**Response:** Array of session objects
```json
[
  {
    "id": "session-id-1",
    "user_id": "c6c6e5d6-4f68-4a3b-9e3d-9f7b8f2a1b2c",
    "status": "completed",
    "created_at": "2025-01-15T12:00:00Z",
    "updated_at": "2025-01-15T12:05:00Z",
    "file_path": "/path/to/file.rawx",
    "results_path": "/path/to/results.json",
    "method": "dc",
    "converged": true,
    "solution_time_ms": 125
  }
]
```

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/user/sessions" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Delete User Sessions

Delete all sessions for a user.

**Endpoint:** `DELETE /user/sessions`

**Response:**
```json
{
  "status": "success",
  "message": "Cleaned up all sessions for user c6c6e5d6-4f68-4a3b-9e3d-9f7b8f2a1b2c",
  "user_id": "c6c6e5d6-4f68-4a3b-9e3d-9f7b8f2a1b2c"
}
```

**Example:**
```bash
curl -X DELETE "http://localhost:8080/api/v1/user/sessions" \
  -H "Authorization: Bearer $TOKEN"
```

---

### Save Case

Save the session's working case back to its origin library file.

**Endpoint:** `POST /session/save-case`

**Request:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Session file saved successfully to user file",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"
}
```

**Note:** This endpoint only works for sessions created from a library case (via `/session/load-case`).

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/session/save-case" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"}'
```

---

## Session Model Operations

### Get Session Network

Retrieve parsed network data (buses, loads, generators, etc.) from a session's working file.

**Endpoint:** `POST /session/network`

**Request:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"
}
```

**Response:**
```json
{
  "status": "success",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
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

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/session/network" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"}'
```

---

### Edit Network Element

Add, modify, or delete a network element in the session's working file.

**Endpoint:** `POST /session/edit`

**Request:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
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
}
```

**Element Types:**
- `bus` - Bus elements
- `load` - Load elements
- `generator` - Generator elements
- `acline` - AC transmission lines
- `transformer` - Transformer elements

**Actions:**
- `add` - Add new element (requires `data`)
- `modify` - Modify existing element (requires `identifier` and `data`)
- `delete` - Delete element (requires `identifier`)

**For Add Action:**
```json
{
  "session_id": "...",
  "element_type": "bus",
  "action": "add",
  "data": {
    "ibus": 99999,
    "name": "NEW BUS",
    "baskv": 230.0
  }
}
```

**For Modify Action:**
```json
{
  "session_id": "...",
  "element_type": "bus",
  "action": "modify",
  "identifier": {
    "ibus": 101
  },
  "data": {
    "name": "UPDATED BUS NAME",
    "vm": 1.05
  }
}
```

**For Delete Action:**
```json
{
  "session_id": "...",
  "element_type": "bus",
  "action": "delete",
  "identifier": {
    "ibus": 101
  }
}
```

**Response:**
```json
{
  "status": "success",
  "message": "bus add operation completed successfully",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "file_path": "/path/to/session/file.rawx"
}
```

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/session/edit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
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
```

---

### Solve Power Flow

Run a power flow calculation on the session's working file. Returns only success status, not full results.

**Endpoint:** `POST /session/solve-flow`

**Request:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "config": {
    "method": "dc"
  }
}
```

**Configuration:**
- `method` (string, optional) - Power flow method: `"dc"`, `"fnsl"`, or `"fdns"` (default: `"fnsl"`)
- `tolerance` (number, optional) - Convergence tolerance (default: 1e-6)
- `max_iterations` (number, optional) - Maximum iterations (default: 100)
- `lossless_network` (boolean, optional) - If true, assume lossless network; no branch loss calculation (default: true when omitted from request)
- `strip_vector_group_from_ang1` (boolean, optional) - If true, strip vector group (n×30°) from transformer ang1 when computing phase shifter angle; applies to two-winding transformers only (default: true). Omission or true ensures API results match flow-solver defaults.

**Response (Success):**
```json
{
  "status": "success",
  "success": true,
  "converged": true,
  "message": "Power flow calculation completed successfully",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "method": "dc"
}
```

**Response (Failure):**
```json
{
  "status": "error",
  "success": false,
  "converged": false,
  "message": "Power flow calculation failed: ...",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "method": "dc"
}
```

**Example:**
```bash
curl -X POST "http://localhost:8080/api/v1/session/solve-flow" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
    "config": {
      "method": "dc"
    }
  }'
```

---

### Get Power Flow Data

Retrieve power flow calculation results. Can optionally filter by bus numbers or branches.

**Endpoint:** `POST /session/powerflow`

**Request:**
```json
{
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "bus_numbers": [1, 2, 3],
  "branches": [
    {
      "from_bus": 1,
      "to_bus": 2,
      "id": "1"
    }
  ]
}
```

**Parameters:**
- `session_id` (string, required) - Session ID
- `bus_numbers` (array of integers, optional) - Filter by bus numbers. If empty or omitted, returns all buses.
- `branches` (array of objects, optional) - Filter by branches. If empty or omitted, returns all branches.
  - `from_bus` (integer, required) - From bus number
  - `to_bus` (integer, required) - To bus number
  - `id` (string, optional) - Branch ID. If provided, must match exactly. If omitted, matches by bus pair only (order doesn't matter).

**Response (flow-solver aligned):**
```json
{
  "status": "success",
  "message": "Power flow data retrieved",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "method": "dc",
  "converged": true,
  "solution_time_ms": 0,
  "iterations": 0,
  "max_mismatch": 0,
  "bus_results": [
    {
      "ibus": 1,
      "name": "BUS 1",
      "baskv": 230,
      "ide": 3,
      "vm": 1,
      "va": 0,
      "net_p_injection": 228.597,
      "net_q_injection": 0.536
    }
  ],
  "generator_results": [
    {
      "ibus": 1,
      "machid": "1",
      "pg": 228.597,
      "qg": 0
    },
    {
      "ibus": 6,
      "machid": "1",
      "pg": -11.2,
      "qg": 0
    }
  ],
  "acline_results": [
    {
      "ibus": 1,
      "jbus": 2,
      "ckt": "1",
      "p_flow": 206.71,
      "q_flow": 0,
      "s_flow": 206.71,
      "p_loss": 8.277,
      "q_loss": 0,
      "s_loss": 8.277
    }
  ],
  "transformer_results": [
    {
      "ibus": 3,
      "jbus": 301,
      "ckt": "1",
      "p_flow": 59.505,
      "q_flow": 0,
      "s_flow": 59.505,
      "p_loss": 0,
      "q_loss": 0,
      "s_loss": 0
    }
  ],
  "system_summary": {
    "total_load_mw": 195.51,
    "total_generation_mw": 217.397,
    "total_losses_mw": 21.887,
    "efficiency_percent": 89.93
  }
}
```

**Response fields:**
- `bus_results`: One per bus; `ibus`, `name`, `baskv`, `ide`, `vm`, `va` (degrees), `net_p_injection`, `net_q_injection`.
- `generator_results`: One per in-service generator; `ibus`, `machid`, `pg` (MW, solved; swing gen updated), `qg`.
- `acline_results`: One per AC line; `ibus`, `jbus`, `ckt`, `p_flow`, `q_flow`, `s_flow`, `p_loss`, `q_loss`, `s_loss`.
- `transformer_results`: One per transformer branch; `ibus`, `jbus`, `ckt` (and `kbus` for 3-winding), same flow/loss fields.
- `twotermdc_results`: One per two-terminal DC line; `ibus`, `jbus`, `p_flow`, `q_flow`, `s_flow`, `p_loss`, `q_loss`, `s_loss`.
- `vscdc_results`: One per VSC DC converter; `ibus1`, `ibus2`, `p_loss_mw`, `p_converter1_mw`, `p_converter2_mw`, `q_converter1_mvar`, `q_converter2_mvar`.
- `system_summary`: `total_load_mw`, `total_generation_mw`, `total_losses_mw`, `efficiency_percent`.

**Dynamic Result Fields:**
The API automatically includes any additional `*_results` fields from the solver response. This means:
- New component types added to the solver (e.g., `shunt_results`, `facts_results`) are automatically included in the API response
- No manual API code changes are required when adding new power system components
- The response remains backward compatible with existing clients

**Example (Get all results):**
```bash
curl -X POST "http://localhost:8080/api/v1/session/powerflow" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff"
  }'
```

**Example (Filter by buses):**
```bash
curl -X POST "http://localhost:8080/api/v1/session/powerflow" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
    "bus_numbers": [1, 2, 3]
  }'
```

**Example (Filter by branches):**
```bash
curl -X POST "http://localhost:8080/api/v1/session/powerflow" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
    "branches": [
      {
        "from_bus": 1,
        "to_bus": 2,
        "id": "1"
      },
      {
        "from_bus": 2,
        "to_bus": 3
      }
    ]
  }'
```

**Note:** When filtering branches, the `from_bus` and `to_bus` order doesn't matter - a branch from bus 1 to bus 2 will match a filter with `from_bus: 2, to_bus: 1`. If `id` is provided, it must match exactly.

---

## System Endpoints

### Health Check

Check if the API server is running and healthy.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "service": "power-flow-solver-api",
  "timestamp": "2025-01-15T12:00:00Z"
}
```

**Example:**
```bash
curl http://localhost:8080/health
```

---

### Get Statistics

Retrieve system statistics and health information.

**Endpoint:** `GET /stat`

**Response:**
```json
{
  "total_sessions": 10,
  "active_sessions": 3,
  "completed_sessions": 5,
  "failed_sessions": 2,
  "max_file_size": 10485760,
  "max_sessions_per_user": 5
}
```

**Example:**
```bash
curl http://localhost:8080/api/v1/stat
```

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "error": "error_code",
  "message": "Human readable error message"
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `invalid_request` | Malformed request body | 400 |
| `missing_user_id` | user_id is required | 400 |
| `missing_file_type` | file_type is required | 400 |
| `invalid_file_type` | file_type must be 'models' or 'knowledge' | 400 |
| `session_not_found` | Session doesn't exist | 404 |
| `file_not_found` | File not found | 404 |
| `no_working_file` | Session has no working file | 400 |
| `session_creation_failed` | Failed to create session | 500 |
| `file_upload_failed` | File upload failed | 500 |
| `file_save_failed` | Failed to save file | 500 |
| `calculation_failed` | Power flow calculation failed | 500 |
| `edit_failed` | Network edit operation failed | 500 |
| `parse_failed` | Network parsing failed | 500 |
| `invalid_method` | Invalid power flow method | 400 |
| `invalid_edit_request` | Invalid edit request parameters | 400 |

### Error Example

```json
{
  "error": "session_not_found",
  "message": "Session not found"
}
```

---

## Internal Endpoints (Rust Callbacks)

These endpoints are called by the Rust solver, not by clients.

### Receive Solver Results

**Endpoint:** `POST /solver/result`

Called by Rust solver to send power flow calculation results. This route does **not** require JWT auth and is intended to be reachable only from the trusted solver process (it should not be exposed to browsers or untrusted clients).

### Receive Parsed Network Data

**Endpoint:** `POST /network/parse`

Called by Rust parser to send parsed network data. This route does **not** require JWT auth and is intended only for solver→API communication.

### Receive Edited Network

**Endpoint:** `POST /editor/edited`

Called by Rust editor to send edited network data. This route does **not** require JWT auth and should not be called directly by frontend clients.

---

## Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| **User Files** |
| POST | `/user/upload` | Upload file to user folder |
| POST | `/user/files` | List user files |
| POST | `/user/files/download` | Download user file |
| POST | `/user/files/delete` | Delete user file |
| **Sessions** |
| POST | `/session` | Create empty session |
| POST | `/session/load-case` | Create a session from a library network case |
| POST | `/session/save-case` | Save the session's case back to its library file |
| POST | `/session/save-case-as` | Save the session's case as a new library file |
| POST | `/session/info` | Get session info |
| POST | `/user/sessions` | List user sessions |
| DELETE | `/user/sessions` | Delete user sessions |
| **Session Study Files** |
| POST | `/session/load-sub` | Load a subsystem (`.sub`) file into the session |
| POST | `/session/load-mon` | Load a monitored-elements (`.mon`) file into the session |
| POST | `/session/load-con` | Load a contingency (`.con`) file into the session |
| **Session Operations** |
| POST | `/session/network` | Get network data |
| POST | `/session/edit` | Edit network element |
| POST | `/session/solve-flow` | Solve power flow |
| POST | `/session/powerflow` | Get power flow results |
| **System** |
| GET | `/health` | Health check |
| GET | `/stat` | Statistics |

---

**Last Updated:** 2025-01-15  
**Version:** 1.0.0

