# Edit Element API Documentation

## Overview

The Edit Element API allows you to add, modify, and delete network elements (buses, loads, generators, AC lines, and transformers) in a session's temporary file. This API calls the Rust `flow-solver` edit command to perform the operations.

## Endpoint

```
POST /api/v1/edit
```

## Request Format

```json
{
  "session_id": "string (required)",
  "temp_file_id": "string (optional)",
  "element_type": "string (required)",
  "action": "string (required)",
  "data": {
    // Element data (required for add/modify)
  },
  "identifier": {
    // Element identifier (required for delete/modify)
  }
}
```

### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | The session ID to operate on |
| `temp_file_id` | string | No | Specific temp file ID. If not provided, uses the session's temp file |
| `element_type` | string | Yes | Type of element: `bus`, `load`, `generator`, `acline`, `transformer` |
| `action` | string | Yes | Action to perform: `add`, `delete`, `modify` |
| `data` | object | Conditional | Element data (required for `add` and `modify`) |
| `identifier` | object | Conditional | Element identifier (required for `delete` and `modify`) |

## Response Format

```json
{
  "status": "success",
  "message": "bus add operation completed successfully",
  "session_id": "028c45c8-b8d7-49d6-915e-c7c7f02ac9ff",
  "temp_file_id": "97c827bc-7f7d-4087-bef6-75977a2ceabe",
  "file_path": "/path/to/temp/file.rawx"
}
```

## Element Types and Identifiers

### Bus

**Identifier Fields:**
- `ibus` (integer): Bus number

**Example Add:**
```json
{
  "session_id": "your-session-id",
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

**Example Modify:**
```json
{
  "session_id": "your-session-id",
  "element_type": "bus",
  "action": "modify",
  "identifier": {
    "ibus": 99999
  },
  "data": {
    "ibus": 99999,
    "name": "MODIFIED BUS",
    "baskv": 345.0,
    "vm": 1.05
  }
}
```

**Example Delete:**
```json
{
  "session_id": "your-session-id",
  "element_type": "bus",
  "action": "delete",
  "identifier": {
    "ibus": 99999
  }
}
```

### Load

**Identifier Fields:**
- `ibus` (integer): Bus number
- `loadid` (string): Load ID

**Example Add:**
```json
{
  "session_id": "your-session-id",
  "element_type": "load",
  "action": "add",
  "data": {
    "ibus": 101,
    "loadid": "LOAD1",
    "stat": 1,
    "pl": 50.0,
    "ql": 20.0
  }
}
```

**Example Delete:**
```json
{
  "session_id": "your-session-id",
  "element_type": "load",
  "action": "delete",
  "identifier": {
    "ibus": 101,
    "loadid": "LOAD1"
  }
}
```

### Generator

**Identifier Fields:**
- `ibus` (integer): Bus number
- `machid` (string): Machine ID

**Example Add:**
```json
{
  "session_id": "your-session-id",
  "element_type": "generator",
  "action": "add",
  "data": {
    "ibus": 101,
    "machid": "GEN1",
    "pg": 100.0,
    "qg": 50.0,
    "qt": 200.0,
    "qb": -200.0,
    "vs": 1.0,
    "ireg": 0,
    "mbase": 100.0,
    "stat": 1
  }
}
```

### AC Line

**Identifier Fields:**
- `ibus` (integer): From bus number
- `jbus` (integer): To bus number
- `ckt` (string): Circuit ID

**Example Add:**
```json
{
  "session_id": "your-session-id",
  "element_type": "acline",
  "action": "add",
  "data": {
    "ibus": 101,
    "jbus": 102,
    "ckt": "1",
    "r": 0.01,
    "x": 0.05,
    "b": 0.001,
    "ratea": 100.0,
    "rateb": 100.0,
    "ratec": 100.0,
    "stat": 1
  }
}
```

### Transformer

**Identifier Fields:**
- `ibus` (integer): From bus number
- `jbus` (integer): To bus number
- `kbus` (integer, optional): Third winding bus (0 for two-winding)
- `ckt` (string): Circuit ID

**Example Add:**
```json
{
  "session_id": "your-session-id",
  "element_type": "transformer",
  "action": "add",
  "data": {
    "ibus": 101,
    "jbus": 102,
    "kbus": 0,
    "ckt": "1",
    "r1_2": 0.001,
    "x1_2": 0.05,
    "sbase1_2": 100.0,
    "windv1": 1.0,
    "windv2": 1.0,
    "stat": 1
  }
}
```

## Error Responses

### Session Not Found
```json
{
  "error": "session_not_found",
  "message": "Session not found"
}
```

### Temp File Not Found
```json
{
  "error": "temp_file_not_found",
  "message": "No temporary file found for this session"
}
```

### Invalid Request
```json
{
  "error": "invalid_edit_request",
  "message": "data is required for add action"
}
```

### Edit Failed
```json
{
  "error": "edit_failed",
  "message": "edit element failed: <error details>"
}
```

## Usage Workflow

1. **Create a session** using `/api/v1/sessions`
2. **Upload a file** using `/api/v1/upload`
3. **Wait for temp file creation** (automatic, usually < 1 second)
4. **Edit elements** using `/api/v1/edit`
   - Add new elements
   - Modify existing elements
   - Delete elements
5. **Calculate power flow** using `/api/v1/calculate` with the modified temp file
6. **Save changes** (optional) using `/api/v1/save`

## Example: Complete Workflow

```bash
# 1. Create session
SESSION_ID=$(curl -s -X POST http://localhost:8080/api/v1/sessions \
  -H "Content-Type: application/json" \
  -d '{"user_id": "user1"}' | jq -r '.session_id')

# 2. Upload file
curl -X POST "http://localhost:8080/api/v1/upload?session_id=$SESSION_ID" \
  -F "file=@sample.rawx"

# 3. Wait for temp file creation
sleep 2

# 4. Add a new bus
curl -X POST http://localhost:8080/api/v1/edit \
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

# 5. Calculate power flow with modified file
curl -X POST http://localhost:8080/api/v1/calculate \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {
      "method": "DC",
      "tolerance": 1e-6,
      "max_iterations": 100
    }
  }'
```

## Notes

- All edit operations modify the **temporary file** associated with the session
- The original uploaded file remains unchanged until you explicitly save
- Multiple edits can be performed on the same temp file
- The temp file is marked as modified after each successful edit
- Use the `/api/v1/save` endpoint to persist changes to the original file or save as a new file

## Testing

Run the provided test script:

```bash
cd api-server
./test_edit_element.sh
```

This script demonstrates all three operations (add, modify, delete) for different element types.