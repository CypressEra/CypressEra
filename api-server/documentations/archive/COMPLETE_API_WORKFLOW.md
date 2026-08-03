# Complete API Workflow Documentation

## Overview

This document shows all available APIs and how they work together in a complete workflow.

## All Available APIs

### **Session Management**

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| POST | `/api/v1/sessions` | Create session | `{user_id}` | `{session_id}` |
| GET | `/api/v1/sessions/:id` | Get session info | session_id | Session details |
| GET | `/api/v1/sessions/:id/network` | **Get network data** | session_id | **NetworkData JSON** |
| GET | `/api/v1/users/:id/sessions` | Get all user sessions | user_id | Array of sessions |
| DELETE | `/api/v1/users/:id/sessions` | Cleanup sessions | user_id | Success message |

### **File Operations**

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| POST | `/api/v1/upload` | Upload RAWX file | file + session_id | file_path |
| POST | `/api/v1/save` | Save temp file | session_id, action | saved_path |

### **Network Editing**

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| POST | `/api/v1/edit` | Edit element | session_id, element_type, action, data | success + file_path |

### **Power Flow**

| Method | Endpoint | Purpose | Input | Output |
|--------|----------|---------|-------|--------|
| POST | `/api/v1/calculate` | Run power flow | session_id, config | results |

### **Internal Callbacks** (Rust→Go)

| Method | Endpoint | Called By | Purpose |
|--------|----------|-----------|---------|
| POST | `/api/v1/solver/results` | Rust solve | Send power flow results |
| POST | `/api/v1/network/parse` | Rust parse | Send parsed network |
| POST | `/api/v1/editor/edited` | Rust edit | Send edited network |

## Complete Workflow Example

### **Scenario: Load network, inspect it, edit it, verify, then calculate**

```bash
BASE_URL="http://localhost:8080/api/v1"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 1: Setup - Create session and upload file
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "Creating session..."
SESSION_ID=$(curl -s -X POST "$BASE_URL/sessions" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')
echo "Session ID: $SESSION_ID"

echo "Uploading RAWX file..."
curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx"
sleep 2

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 2: Inspect - Get initial network data ← NEW API!
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "Getting initial network data..."
INITIAL_NETWORK=$(curl -s "$BASE_URL/sessions/$SESSION_ID/network")

# Count elements
BUS_COUNT=$(echo $INITIAL_NETWORK | jq '.network_data.bus | length')
LOAD_COUNT=$(echo $INITIAL_NETWORK | jq '.network_data.load | length')
GEN_COUNT=$(echo $INITIAL_NETWORK | jq '.network_data.generator | length')

echo "Initial network:"
echo "  Buses: $BUS_COUNT"
echo "  Loads: $LOAD_COUNT"
echo "  Generators: $GEN_COUNT"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 3: Edit - Add a new bus
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "Adding new bus 99999..."
curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {
      "ibus": 99999,
      "name": "NEW GENERATION BUS",
      "baskv": 345.0,
      "ide": 1,
      "vm": 1.0,
      "va": 0.0
    }
  }' | jq '.status, .message'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 4: Verify - Check the edit worked ← Use NEW API!
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "Verifying new bus was added..."
UPDATED_NETWORK=$(curl -s "$BASE_URL/sessions/$SESSION_ID/network")

NEW_BUS_COUNT=$(echo $UPDATED_NETWORK | jq '.network_data.bus | length')
echo "Bus count after edit: $NEW_BUS_COUNT (was $BUS_COUNT)"

echo "New bus details:"
echo $UPDATED_NETWORK | jq '.network_data.bus[] | select(.ibus == 99999)'

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 5: Calculate - Run power flow
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "Running power flow calculation..."
CALC_RESULT=$(curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {
      "method": "DC",
      "tolerance": 1e-6,
      "max_iterations": 100
    }
  }')

echo "Calculation status: $(echo $CALC_RESULT | jq -r '.status')"
echo "Converged: $(echo $CALC_RESULT | jq -r '.results.converged')"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Step 6: Cleanup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "Cleaning up..."
curl -s -X DELETE "$BASE_URL/users/demo_user/sessions" | jq -r '.message'

echo ""
echo "=== Complete Workflow Test Finished ==="
echo ""
echo "What we did:"
echo "  1. Created session"
echo "  2. Uploaded file"
echo "  3. ✨ Retrieved initial network data (NEW!)"
echo "  4. Added new bus"
echo "  5. ✨ Verified bus was added (NEW!)"
echo "  6. Ran power flow"
echo "  7. Cleaned up"