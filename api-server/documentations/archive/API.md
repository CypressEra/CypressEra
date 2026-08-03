# X-Flow API Reference

Complete reference for all API endpoints.

**Base URL**: `http://localhost:8080/api/v1`

---

## Table of Contents

- [Session Management](#session-management)
- [File Operations](#file-operations)
- [Network Editing](#network-editing)
- [Power Flow Calculation](#power-flow-calculation)
- [System Information](#system-information)

---

## Session Management

### Create Session

Create a new user session for file uploads and calculations.

**Endpoint**: `POST /session`

**Request**:
```json
{
  "user_id": "demo_user"
}
```

**Response**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "message": "Session created successfully"
}
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/session \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq
```

---

### Get Session Info

Retrieve detailed information about a session.

**Endpoint**: `POST /session/info`

**Request**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "demo_user",
  "status": "ready",
  "created_at": "2025-10-12T12:00:00Z",
  "updated_at": "2025-10-12T12:05:00Z",
  "file_path": "/data/uploads/demo_user/550e8400.../file.rawx",
  "results_path": "/data/results/demo_user/550e8400.../results.json",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
  "temp_file_modified": true,
  "method": "DC",
  "converged": true,
  "solution_time_ms": 125
}
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/session/info \
  -H "Content-Type: application/json" \
  -d '{"session_id": "550e8400-e29b-41d4-a716-446655440000"}' | jq
```

---

### Get Session Network

Retrieve parsed network data (buses, loads, generators, lines, transformers).

**Endpoint**: `POST /session/network`

**Request**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe"
}
```

**Parameters**:
- `session_id` (required): Session ID
- `temp_file_id` (optional): Use temp file instead of original

**Response**:
```json
{
  "status": "success",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
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
    "load": [
      {
        "ibus": 101,
        "loadid": "1",
        "stat": 1,
        "pl": 100.0,
        "ql": 50.0
      }
    ],
    "generator": [
      {
        "ibus": 101,
        "machid": "1",
        "pg": 150.0,
        "qg": 75.0,
        "stat": 1
      }
    ],
    "acline": [...],
    "transformer": [...],
    "caseid": {...},
    "general": {...}
  }
}
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/session/network \
  -H "Content-Type: application/json" \
  -d '{"session_id": "550e8400-e29b-41d4-a716-446655440000"}' | jq
```

---

### Get User Sessions

Retrieve all sessions for a specific user.

**Endpoint**: `POST /user/session`

**Request**:
```json
{
  "user_id": "demo_user"
}
```

**Response**:
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "demo_user",
    "status": "completed",
    "created_at": "2025-10-12T12:00:00Z",
    "updated_at": "2025-10-12T12:05:00Z",
    "file_path": "/data/uploads/demo_user/550e8400.../file.rawx",
    "results_path": "/data/results/demo_user/550e8400.../results.json"
  },
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "user_id": "demo_user",
    "status": "ready",
    "created_at": "2025-10-12T13:00:00Z",
    ...
  }
]
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/user/session \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq
```

---

### Delete User Sessions

Delete all sessions and files for a specific user.

**Endpoint**: `DELETE /user/session`

**Request**:
```json
{
  "user_id": "demo_user"
}
```

**Response**:
```json
{
  "status": "success",
  "message": "Cleaned up all sessions for user demo_user",
  "user_id": "demo_user"
}
```

**Example**:
```bash
curl -X DELETE http://localhost:8080/api/v1/user/session \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq
```

---

## File Operations

### Upload File

Upload a RAWX file to a session.

**Endpoint**: `POST /upload?session_id={session_id}`

**Request**: Multipart form data with file

**Parameters**:
- `session_id` (query parameter, required): Session ID
- `file` (form data, required): RAWX file

**Response**:
```json
{
  "status": "success",
  "message": "File uploaded successfully",
  "file_path": "/data/uploads/demo_user/550e8400.../file.rawx",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe"
}
```

**Example**:
```bash
curl -X POST "http://localhost:8080/api/v1/upload?session_id=550e8400-e29b-41d4-a716-446655440000" \
  -F "file=@network.rawx" | jq
```

**Notes**:
- File is saved to session's upload directory
- Temp file is automatically created for editing
- Max file size configurable (default 10MB)

---

### Save File

Save a temporary file (overwrite original or save as new file).

**Endpoint**: `POST /save`

**Request**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
  "action": "overwrite",
  "new_name": "modified_network.rawx"
}
```

**Parameters**:
- `session_id` (required): Session ID
- `temp_file_id` (required): Temp file ID to save
- `action` (required): `"overwrite"` or `"save_as"`
- `new_name` (required for `save_as`): New filename

**Actions**:
- `overwrite`: Overwrites the original uploaded file
- `save_as`: Saves as a new file with specified name

**Response**:
```json
{
  "status": "success",
  "message": "File saved successfully (overwritten original)",
  "file_path": "/data/uploads/demo_user/550e8400.../file.rawx",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe"
}
```

**Example - Overwrite**:
```bash
curl -X POST http://localhost:8080/api/v1/save \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
    "action": "overwrite"
  }' | jq
```

**Example - Save As**:
```bash
curl -X POST http://localhost:8080/api/v1/save \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
    "action": "save_as",
    "new_name": "modified_network.rawx"
  }' | jq
```

---

## Network Editing

### Edit Element

Add, modify, or delete a network element.

**Endpoint**: `POST /edit`

**Request Format**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
  "element_type": "bus|load|generator|acline|transformer",
  "action": "add|modify|delete",
  "data": { /* element data */ },
  "identifier": { /* element identifier */ }
}
```

**Parameters**:
- `session_id` (required): Session ID
- `temp_file_id` (optional): Use temp file; if omitted, edits original file
- `element_type` (required): Type of element
- `action` (required): Action to perform
- `data` (required for `add`/`modify`): Element data
- `identifier` (required for `modify`/`delete`): Element identifier

**Element Types**:
- `bus` - Buses/nodes
- `load` - Loads
- `generator` - Generators
- `acline` - AC transmission lines
- `transformer` - Transformers

**Actions**:
- `add` - Add new element (requires `data`)
- `modify` - Modify existing element (requires `identifier` + `data`)
- `delete` - Delete element (requires `identifier`)

**Response**:
```json
{
  "status": "success",
  "message": "bus add operation completed successfully",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
  "file_path": "/data/temp/session_temp_uuid.rawx"
}
```

---

### Element Types and Identifiers

#### Bus

**Identifier**:
```json
{
  "ibus": 101
}
```

**Data Example**:
```json
{
  "ibus": 99999,
  "name": "NEW BUS",
  "baskv": 230.0,
  "ide": 1,
  "vm": 1.0,
  "va": 0.0
}
```

**Add Bus Example**:
```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
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
  }' | jq
```

**Modify Bus Example**:
```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "element_type": "bus",
    "action": "modify",
    "identifier": {
      "ibus": 99999
    },
    "data": {
      "baskv": 345.0,
      "vm": 1.05
    }
  }' | jq
```

**Delete Bus Example**:
```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "element_type": "bus",
    "action": "delete",
    "identifier": {
      "ibus": 99999
    }
  }' | jq
```

---

#### Load

**Identifier**:
```json
{
  "ibus": 101,
  "loadid": "1"
}
```

**Data Example**:
```json
{
  "ibus": 101,
  "loadid": "1",
  "stat": 1,
  "pl": 100.0,
  "ql": 50.0
}
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "element_type": "load",
    "action": "modify",
    "identifier": {
      "ibus": 101,
      "loadid": "1"
    },
    "data": {
      "pl": 150.0,
      "ql": 75.0
    }
  }' | jq
```

---

#### Generator

**Identifier**:
```json
{
  "ibus": 101,
  "machid": "1"
}
```

**Data Example**:
```json
{
  "ibus": 101,
  "machid": "1",
  "pg": 150.0,
  "qg": 75.0,
  "qt": 100.0,
  "qb": -100.0,
  "stat": 1
}
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "element_type": "generator",
    "action": "modify",
    "identifier": {
      "ibus": 101,
      "machid": "1"
    },
    "data": {
      "pg": 200.0,
      "qg": 100.0
    }
  }' | jq
```

---

#### AC Line

**Identifier**:
```json
{
  "ibus": 101,
  "jbus": 102,
  "ckt": "1"
}
```

**Data Example**:
```json
{
  "ibus": 101,
  "jbus": 102,
  "ckt": "1",
  "rpu": 0.01,
  "xpu": 0.1,
  "bpu": 0.0,
  "stat": 1
}
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "element_type": "acline",
    "action": "modify",
    "identifier": {
      "ibus": 101,
      "jbus": 102,
      "ckt": "1"
    },
    "data": {
      "rpu": 0.02,
      "xpu": 0.15
    }
  }' | jq
```

---

#### Transformer

**Identifier**:
```json
{
  "ibus": 101,
  "jbus": 102,
  "kbus": 0,
  "ckt": "1"
}
```

**Note**: `kbus` is 0 for 2-winding transformers, bus number for 3-winding

**Data Example**:
```json
{
  "ibus": 101,
  "jbus": 102,
  "kbus": 0,
  "ckt": "1",
  "stat": 1,
  "r12": 0.01,
  "x12": 0.1
}
```

**Example**:
```bash
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "element_type": "transformer",
    "action": "delete",
    "identifier": {
      "ibus": 101,
      "jbus": 102,
      "kbus": 0,
      "ckt": "1"
    }
  }' | jq
```

---

## Power Flow Calculation

### Calculate Power Flow

Run DC or AC power flow calculation on a session's network.

**Endpoint**: `POST /calculate`

**Request**:
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
  "config": {
    "method": "DC",
    "tolerance": 1e-6,
    "max_iterations": 100
  }
}
```

**Parameters**:
- `session_id` (required): Session ID
- `temp_file_id` (optional): Use temp file; if omitted, uses original file
- `config` (required): Calculation configuration
  - `method` (required): `"DC"` or `"AC"`
  - `tolerance` (optional): Convergence tolerance (default: 1e-6)
  - `max_iterations` (optional): Max iterations (default: 100)

**Methods**:
- `DC` - DC power flow (fast, linear approximation)
- `AC` - AC power flow (accurate, nonlinear Newton-Raphson)

**Response**:
```json
{
  "status": "success",
  "message": "Power flow calculation completed successfully",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "method": "DC",
  "used_temp_file": true,
  "results": {
    "converged": true,
    "iterations": 3,
    "solution_time_ms": 125,
    "bus_results": [
      {
        "bus_number": 101,
        "voltage_magnitude": 1.02,
        "voltage_angle": 0.0,
        "p_gen": 150.0,
        "q_gen": 75.0,
        "p_load": 100.0,
        "q_load": 50.0
      }
    ],
    "branch_results": [
      {
        "from_bus": 101,
        "to_bus": 102,
        "circuit": "1",
        "p_from": 45.5,
        "q_from": 22.8,
        "p_to": -45.0,
        "q_to": -22.5,
        "losses": 0.5
      }
    ],
    "system_summary": {
      "total_generation_mw": 500.0,
      "total_load_mw": 450.0,
      "total_losses_mw": 50.0,
      "convergence_time_ms": 125
    }
  }
}
```

**Example - DC Power Flow**:
```bash
curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "config": {
      "method": "DC",
      "tolerance": 1e-6,
      "max_iterations": 100
    }
  }' | jq
```

**Example - AC Power Flow with Temp File**:
```bash
curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
    "config": {
      "method": "AC",
      "tolerance": 1e-8,
      "max_iterations": 50
    }
  }' | jq
```

---

## System Information

### Health Check

Check if the API server is healthy.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "service": "x-flow-api-server",
  "timestamp": "2025-10-12T12:00:00Z"
}
```

**Example**:
```bash
curl http://localhost:8080/health | jq
```

---

### Get Statistics

Retrieve storage and session statistics.

**Endpoint**: `GET /stat`

**Response**:
```json
{
  "total_sessions": 10,
  "active_sessions": 3,
  "total_files": 15,
  "total_temp_files": 8,
  "storage_used_mb": 45.2
}
```

**Example**:
```bash
curl http://localhost:8080/api/v1/stat | jq
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
| `session_not_found` | Session doesn't exist | 404 |
| `file_not_found` | No file uploaded for session | 404 |
| `session_creation_failed` | Failed to create session | 500 |
| `file_storage_failed` | Failed to store uploaded file | 500 |
| `calculation_failed` | Power flow calculation failed | 500 |
| `edit_failed` | Network edit operation failed | 500 |
| `parse_failed` | Network parsing failed | 500 |
| `quota_exceeded` | User has exceeded limits | 429 |

### Error Example

```json
{
  "error": "session_not_found",
  "message": "Session with ID '550e8400-e29b-41d4-a716-446655440000' not found"
}
```

---

## Quick Reference

| Method | Endpoint | Purpose |
|--------|----------|---------|
| **Session** |
| POST | `/session` | Create session |
| POST | `/session/info` | Get session info |
| POST | `/session/network` | Get network data |
| POST | `/user/session` | List user sessions |
| DELETE | `/user/session` | Delete user sessions |
| **File** |
| POST | `/upload` | Upload RAWX file |
| POST | `/save` | Save temp file |
| **Edit** |
| POST | `/edit` | Edit network element |
| **Calculate** |
| POST | `/calculate` | Run power flow |
| **System** |
| GET | `/health` | Health check |
| GET | `/stat` | Statistics |

---

**Last Updated**: 2025-10-12  
**Version**: 1.0.0

