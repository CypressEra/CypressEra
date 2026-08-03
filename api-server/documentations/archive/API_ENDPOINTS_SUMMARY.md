# API Endpoints - Quick Reference

## Base URL
```
http://localhost:8080/api/v1
```

## Naming Convention
✅ **Singular terms** throughout: `/session`, `/user`, `/solver/result`

---

## All Endpoints (Alphabetical)

### Calculate Power Flow
```bash
POST /calculate
{"session_id": "...", "config": {...}}
```

### Edit Network Element
```bash
POST /edit
{"session_id": "...", "element_type": "bus", "action": "add", "data": {...}}
```

### Create Session
```bash
POST /session
{"user_id": "demo_user"}
```

### Get Session Info
```bash
POST /session/info
{"session_id": "..."}
```

### Get Session Network Data
```bash
POST /session/network
{"session_id": "...", "temp_file_id": "optional"}
```

### Get User Sessions
```bash
POST /user/session
{"user_id": "demo_user"}
```

### Delete User Sessions
```bash
DELETE /user/session
{"user_id": "demo_user"}
```

### Upload File
```bash
POST /upload?session_id=...
[multipart form data]
```

### Save File
```bash
POST /save
{"session_id": "...", "temp_file_id": "...", "action": "overwrite"}
```

### Health Check
```bash
GET /health
```

### System Statistics
```bash
GET /stat
```

---

## Internal Endpoints (Rust Callbacks)

### Solver Result (from Rust)
```bash
POST /solver/result
{"status": "completed", "result": {...}}
```

### Network Parse (from Rust)
```bash
POST /network/parse
{"status": "parsed", "network_data": {...}}
```

### Editor Edited (from Rust)
```bash
POST /editor/edited
{"status": "edited", "rawx_data": {"network": {...}}}
```

---

## Quick Test

```bash
BASE_URL="http://localhost:8080/api/v1"

# Create and work with a session
curl -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test"}' | jq -r '.session_id'

# Get session info
curl -X POST "$BASE_URL/session/info" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "session-id"}' | jq

# Get network data
curl -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "session-id"}' | jq
```

---

## Build Status
✅ **Compiled successfully**  
✅ **All endpoints use singular naming**  
✅ **Consistent POST + JSON design**