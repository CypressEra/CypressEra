# Edit Element API - Quick Reference

## Quick Start

```bash
# Set your base URL
BASE_URL="http://localhost:8080/api/v1"

# Create session and get ID
SESSION_ID=$(curl -s -X POST "$BASE_URL/sessions" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')

# Upload a file
curl -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@path/to/your/file.rawx"

# Wait for temp file creation
sleep 2
```

## Add Operations

### Add Bus
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {
      "ibus": 99999,
      "name": "NEW BUS 1",
      "baskv": 230.0,
      "ide": 1,
      "vm": 1.0,
      "va": 0.0
    }
  }'
```

### Add Load
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "load",
    "action": "add",
    "data": {
      "ibus": 101,
      "loadid": "LOAD1",
      "stat": 1,
      "pl": 100.0,
      "ql": 50.0
    }
  }'
```

### Add Generator
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
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
  }'
```

### Add AC Line
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
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
  }'
```

### Add Transformer
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
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
  }'
```

## Modify Operations

### Modify Bus
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "modify",
    "identifier": {
      "ibus": 101
    },
    "data": {
      "ibus": 101,
      "name": "UPDATED BUS NAME",
      "baskv": 345.0,
      "vm": 1.05
    }
  }'
```

### Modify Load
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "load",
    "action": "modify",
    "identifier": {
      "ibus": 101,
      "loadid": "1"
    },
    "data": {
      "ibus": 101,
      "loadid": "1",
      "stat": 1,
      "pl": 150.0,
      "ql": 75.0
    }
  }'
```

### Modify Generator
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "generator",
    "action": "modify",
    "identifier": {
      "ibus": 101,
      "machid": "1"
    },
    "data": {
      "ibus": 101,
      "machid": "1",
      "pg": 150.0,
      "qg": 75.0,
      "vs": 1.02
    }
  }'
```

## Delete Operations

### Delete Bus
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "delete",
    "identifier": {
      "ibus": 99999
    }
  }'
```

### Delete Load
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "load",
    "action": "delete",
    "identifier": {
      "ibus": 101,
      "loadid": "LOAD1"
    }
  }'
```

### Delete Generator
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "generator",
    "action": "delete",
    "identifier": {
      "ibus": 101,
      "machid": "GEN1"
    }
  }'
```

### Delete AC Line
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "acline",
    "action": "delete",
    "identifier": {
      "ibus": 101,
      "jbus": 102,
      "ckt": "1"
    }
  }'
```

### Delete Transformer
```bash
curl -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "transformer",
    "action": "delete",
    "identifier": {
      "ibus": 101,
      "jbus": 102,
      "kbus": 0,
      "ckt": "1"
    }
  }'
```

## Complete Workflow Example

```bash
#!/bin/bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Create session
echo "Creating session..."
SESSION_ID=$(curl -s -X POST "$BASE_URL/sessions" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')
echo "Session ID: $SESSION_ID"

# 2. Upload file
echo "Uploading file..."
curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@../flow-solver/examples/sample.rawx"
sleep 2

# 3. Add a new bus
echo "Adding new bus..."
curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {"ibus": 99999, "name": "NEW BUS", "baskv": 230.0, "ide": 1, "vm": 1.0, "va": 0.0}
  }' | jq

# 4. Modify the bus
echo "Modifying bus..."
curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "modify",
    "identifier": {"ibus": 99999},
    "data": {"ibus": 99999, "name": "MODIFIED BUS", "vm": 1.05}
  }' | jq

# 5. Run power flow calculation
echo "Running power flow calculation..."
curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {"method": "DC", "tolerance": 1e-6, "max_iterations": 100}
  }' | jq '.status, .message'

# 6. Delete the bus
echo "Deleting bus..."
curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "delete",
    "identifier": {"ibus": 99999}
  }' | jq

# 7. Clean up
echo "Cleaning up..."
curl -s -X DELETE "$BASE_URL/users/demo_user/sessions" | jq

echo "Done!"
```

## Tips

1. **Use jq for pretty output**: Pipe curl responses through `jq` for formatted JSON
2. **Store SESSION_ID**: Save the session ID in a variable for easy reuse
3. **Wait for temp files**: Allow 1-2 seconds after upload for temp file creation
4. **Check responses**: Verify each operation's response before proceeding
5. **Test incrementally**: Test add, then modify, then delete for each element type

## Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `session_not_found` | Invalid session ID | Create a new session |
| `temp_file_not_found` | Temp file not ready | Wait a moment after upload |
| `data is required for add action` | Missing data field | Include data in request |
| `identifier is required for delete action` | Missing identifier | Include identifier in request |
| `invalid element type` | Wrong element_type value | Use: bus, load, generator, acline, transformer |
| `invalid action` | Wrong action value | Use: add, delete, modify |