# X-Flow API Workflows

Complete workflows and usage examples for common scenarios.

---

## Table of Contents

- [Workflow 1: Basic Session and Calculation](#workflow-1-basic-session-and-calculation)
- [Workflow 2: Network Inspection](#workflow-2-network-inspection)
- [Workflow 3: Network Editing](#workflow-3-network-editing)
- [Workflow 4: Scenario Analysis](#workflow-4-scenario-analysis)
- [Workflow 5: Temp File Management](#workflow-5-temp-file-management)
- [Workflow 6: Batch Operations](#workflow-6-batch-operations)

---

## Workflow 1: Basic Session and Calculation

**Goal**: Create a session, upload a file, and run power flow calculation.

### Steps

```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Create session
echo "Creating session..."
SESSION=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}')
SESSION_ID=$(echo $SESSION | jq -r '.session_id')
echo "Session ID: $SESSION_ID"

# 2. Upload RAWX file
echo "Uploading file..."
curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx" | jq

# Wait for temp file creation
sleep 2

# 3. Get session info
echo "Session info:"
curl -s -X POST "$BASE_URL/session/info" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq

# 4. Run DC power flow calculation
echo "Running DC power flow..."
curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {
      "method": "DC",
      "tolerance": 1e-6,
      "max_iterations": 100
    }
  }' | jq

# 5. View results (already in previous response, or get session info again)
echo "Final session info with results:"
curl -s -X POST "$BASE_URL/session/info" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq
```

### Expected Output

1. Session created with UUID
2. File uploaded successfully
3. Calculation completes with converged results
4. Bus voltages and branch flows available

---

## Workflow 2: Network Inspection

**Goal**: Upload a file and inspect its network data.

### Steps

```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Create session and upload
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')

curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx" > /dev/null

sleep 2

# 2. Get network data
echo "Fetching network data..."
NETWORK=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}')

# 3. Analyze network
echo -e "\n=== Network Summary ==="
BUS_COUNT=$(echo $NETWORK | jq '.network_data.bus | length')
LOAD_COUNT=$(echo $NETWORK | jq '.network_data.load | length')
GEN_COUNT=$(echo $NETWORK | jq '.network_data.generator | length')
LINE_COUNT=$(echo $NETWORK | jq '.network_data.acline | length')
XFMR_COUNT=$(echo $NETWORK | jq '.network_data.transformer | length')

echo "Buses: $BUS_COUNT"
echo "Loads: $LOAD_COUNT"
echo "Generators: $GEN_COUNT"
echo "AC Lines: $LINE_COUNT"
echo "Transformers: $XFMR_COUNT"

# 4. Show specific bus details
echo -e "\n=== Bus 101 Details ==="
echo $NETWORK | jq '.network_data.bus[] | select(.ibus == 101)'

# 5. Show all loads
echo -e "\n=== All Loads ==="
echo $NETWORK | jq '.network_data.load[]'

# 6. Calculate total load
echo -e "\n=== Total System Load ==="
TOTAL_P=$(echo $NETWORK | jq '[.network_data.load[].pl] | add')
TOTAL_Q=$(echo $NETWORK | jq '[.network_data.load[].ql] | add')
echo "Total P: $TOTAL_P MW"
echo "Total Q: $TOTAL_Q MVAr"
```

### Use Cases

- Verify network data after upload
- Check element counts
- Find specific buses or components
- Calculate system totals

---

## Workflow 3: Network Editing

**Goal**: Add a bus, verify it, modify it, then delete it.

### Steps

```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Setup
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')

curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx" > /dev/null

sleep 2

# 2. Get initial bus count
echo "=== Initial Network ==="
INITIAL_COUNT=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | \
  jq '.network_data.bus | length')
echo "Initial bus count: $INITIAL_COUNT"

# 3. Add new bus
echo -e "\n=== Adding Bus 99999 ==="
EDIT_RESULT=$(curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {
      "ibus": 99999,
      "name": "NEW BUS",
      "baskv": 345.0,
      "ide": 1,
      "vm": 1.0,
      "va": 0.0
    }
  }')
echo $EDIT_RESULT | jq
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')

# 4. Verify bus was added
echo -e "\n=== After Adding Bus ==="
NEW_COUNT=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}' | \
  jq '.network_data.bus | length')
echo "New bus count: $NEW_COUNT (was $INITIAL_COUNT)"

echo -e "\n=== New Bus Details ==="
curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}' | \
  jq '.network_data.bus[] | select(.ibus == 99999)'

# 5. Modify the bus
echo -e "\n=== Modifying Bus 99999 ==="
EDIT_RESULT=$(curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "element_type": "bus",
    "action": "modify",
    "identifier": {
      "ibus": 99999
    },
    "data": {
      "baskv": 500.0,
      "vm": 1.05
    }
  }')
echo $EDIT_RESULT | jq
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')

echo -e "\n=== Modified Bus Details ==="
curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}' | \
  jq '.network_data.bus[] | select(.ibus == 99999)'

# 6. Delete the bus
echo -e "\n=== Deleting Bus 99999 ==="
EDIT_RESULT=$(curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "element_type": "bus",
    "action": "delete",
    "identifier": {
      "ibus": 99999
    }
  }')
echo $EDIT_RESULT | jq
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')

# 7. Verify deletion
echo -e "\n=== After Deleting Bus ==="
FINAL_COUNT=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}' | \
  jq '.network_data.bus | length')
echo "Final bus count: $FINAL_COUNT (back to $INITIAL_COUNT)"

# 8. Cleanup
curl -s -X DELETE "$BASE_URL/user/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq
```

### Expected Output

```
Initial bus count: 5
New bus count: 6 (was 5)
Modified bus shows baskv: 500.0, vm: 1.05
Final bus count: 5 (back to 5)
```

---

## Workflow 4: Scenario Analysis

**Goal**: Modify loads and compare power flow results.

### Steps

```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Setup
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')

curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx" > /dev/null

sleep 2

# 2. Baseline power flow (original network)
echo "=== Baseline Scenario (Original Load) ==="
BASELINE=$(curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {"method": "DC"}
  }')

BASELINE_LOSSES=$(echo $BASELINE | jq '.results.system_summary.total_losses_mw')
echo "Baseline losses: $BASELINE_LOSSES MW"

# Get current temp file ID
TEMP_FILE_ID=$(curl -s -X POST "$BASE_URL/session/info" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq -r '.temp_file_id')

# 3. Scenario A: Increase load at bus 101 by 50%
echo -e "\n=== Scenario A: +50% Load at Bus 101 ==="

# Get current load
CURRENT_LOAD=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}' | \
  jq '.network_data.load[] | select(.ibus == 101)')

CURRENT_PL=$(echo $CURRENT_LOAD | jq '.pl')
CURRENT_QL=$(echo $CURRENT_LOAD | jq '.ql')
NEW_PL=$(echo "$CURRENT_PL * 1.5" | bc)
NEW_QL=$(echo "$CURRENT_QL * 1.5" | bc)

echo "Original load: P=$CURRENT_PL, Q=$CURRENT_QL"
echo "New load: P=$NEW_PL, Q=$NEW_QL"

# Modify load
EDIT_RESULT=$(curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "element_type": "load",
    "action": "modify",
    "identifier": {
      "ibus": 101,
      "loadid": "1"
    },
    "data": {
      "pl": '$NEW_PL',
      "ql": '$NEW_QL'
    }
  }')
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')

# Run power flow
SCENARIO_A=$(curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "config": {"method": "DC"}
  }')

SCENARIO_A_LOSSES=$(echo $SCENARIO_A | jq '.results.system_summary.total_losses_mw')
echo "Scenario A losses: $SCENARIO_A_LOSSES MW"

# 4. Scenario B: Further increase load
echo -e "\n=== Scenario B: +100% Load at Bus 101 ==="
NEW_PL=$(echo "$CURRENT_PL * 2.0" | bc)
NEW_QL=$(echo "$CURRENT_QL * 2.0" | bc)

EDIT_RESULT=$(curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "element_type": "load",
    "action": "modify",
    "identifier": {
      "ibus": 101,
      "loadid": "1"
    },
    "data": {
      "pl": '$NEW_PL',
      "ql": '$NEW_QL'
    }
  }')
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')

SCENARIO_B=$(curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "config": {"method": "DC"}
  }')

SCENARIO_B_LOSSES=$(echo $SCENARIO_B | jq '.results.system_summary.total_losses_mw')
echo "Scenario B losses: $SCENARIO_B_LOSSES MW"

# 5. Summary
echo -e "\n=== Scenario Comparison ==="
echo "Baseline:   $BASELINE_LOSSES MW losses"
echo "Scenario A: $SCENARIO_A_LOSSES MW losses (+50% load)"
echo "Scenario B: $SCENARIO_B_LOSSES MW losses (+100% load)"

# 6. Cleanup
curl -s -X DELETE "$BASE_URL/user/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' > /dev/null
```

### Use Cases

- N-1 contingency analysis
- Load growth studies
- Generator dispatch optimization
- Sensitivity analysis

---

## Workflow 5: Temp File Management

**Goal**: Understand and manage temporary files through edits.

### Steps

```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Setup
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')

UPLOAD_RESULT=$(curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx")
TEMP_FILE_ID=$(echo $UPLOAD_RESULT | jq -r '.temp_file_id')

echo "=== Initial Upload ==="
echo "Session ID: $SESSION_ID"
echo "Initial Temp File ID: $TEMP_FILE_ID"

sleep 2

# 2. Make first edit
echo -e "\n=== Edit 1: Add Bus 99999 ==="
EDIT1=$(curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {"ibus": 99999, "name": "BUS A", "baskv": 230.0}
  }')
TEMP_FILE_ID=$(echo $EDIT1 | jq -r '.temp_file_id')
echo "New Temp File ID: $TEMP_FILE_ID"

# 3. Make second edit
echo -e "\n=== Edit 2: Add Bus 99998 ==="
EDIT2=$(curl -s -X POST "$BASE_URL/edit" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "element_type": "bus",
    "action": "add",
    "data": {"ibus": 99998, "name": "BUS B", "baskv": 230.0}
  }')
TEMP_FILE_ID=$(echo $EDIT2 | jq -r '.temp_file_id')
echo "New Temp File ID: $TEMP_FILE_ID"

# 4. Verify both buses are in temp file
echo -e "\n=== Current Temp File Contents ==="
NETWORK=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}')
echo "Bus 99999:"
echo $NETWORK | jq '.network_data.bus[] | select(.ibus == 99999)'
echo "Bus 99998:"
echo $NETWORK | jq '.network_data.bus[] | select(.ibus == 99998)'

# 5. Run calculation using temp file
echo -e "\n=== Calculate Using Temp File ==="
curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "config": {"method": "DC"}
  }' | jq '.status, .message, .used_temp_file'

# 6. Save temp file as new file
echo -e "\n=== Save As New File ==="
curl -s -X POST "$BASE_URL/save" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "action": "save_as",
    "new_name": "modified_network.rawx"
  }' | jq

# 7. Alternative: Overwrite original
echo -e "\n=== Or Overwrite Original ==="
curl -s -X POST "$BASE_URL/save" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "action": "overwrite"
  }' | jq

# 8. Cleanup
curl -s -X DELETE "$BASE_URL/user/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' > /dev/null
```

### Key Concepts

1. **Temp File Creation**: Automatic on upload and after each edit
2. **Temp File ID**: Changes with each edit
3. **Original Preserved**: Original file remains unchanged until explicit save
4. **Save Options**: Overwrite or save as new file
5. **Auto Cleanup**: Temp files deleted after 24 hours

---

## Workflow 6: Batch Operations

**Goal**: Perform multiple edits efficiently.

### Steps

```bash
BASE_URL="http://localhost:8080/api/v1"

# 1. Setup
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')

curl -s -X POST "$BASE_URL/upload?session_id=$SESSION_ID" \
  -F "file=@network.rawx" > /dev/null

sleep 2

TEMP_FILE_ID=$(curl -s -X POST "$BASE_URL/session/info" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq -r '.temp_file_id')

echo "=== Batch Edit: Increase All Loads by 10% ==="

# 2. Get all loads
NETWORK=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}')

LOADS=$(echo $NETWORK | jq -c '.network_data.load[]')

# 3. Edit each load
echo "$LOADS" | while IFS= read -r load; do
    IBUS=$(echo $load | jq '.ibus')
    LOADID=$(echo $load | jq -r '.loadid')
    PL=$(echo $load | jq '.pl')
    QL=$(echo $load | jq '.ql')
    
    NEW_PL=$(echo "$PL * 1.1" | bc)
    NEW_QL=$(echo "$QL * 1.1" | bc)
    
    echo "Increasing load at bus $IBUS (ID: $LOADID): $PL -> $NEW_PL MW"
    
    EDIT_RESULT=$(curl -s -X POST "$BASE_URL/edit" \
      -H "Content-Type: application/json" \
      -d '{
        "session_id": "'$SESSION_ID'",
        "temp_file_id": "'$TEMP_FILE_ID'",
        "element_type": "load",
        "action": "modify",
        "identifier": {
          "ibus": '$IBUS',
          "loadid": "'$LOADID'"
        },
        "data": {
          "pl": '$NEW_PL',
          "ql": '$NEW_QL'
        }
      }')
    
    TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')
done

# 4. Verify changes
echo -e "\n=== Verifying Changes ==="
UPDATED_NETWORK=$(curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}')

ORIGINAL_TOTAL=$(echo $NETWORK | jq '[.network_data.load[].pl] | add')
UPDATED_TOTAL=$(echo $UPDATED_NETWORK | jq '[.network_data.load[].pl] | add')

echo "Original total load: $ORIGINAL_TOTAL MW"
echo "Updated total load:  $UPDATED_TOTAL MW"

# 5. Run power flow
echo -e "\n=== Running Power Flow ==="
curl -s -X POST "$BASE_URL/calculate" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "temp_file_id": "'$TEMP_FILE_ID'",
    "config": {"method": "DC"}
  }' | jq '.status, .results.converged'

# 6. Cleanup
curl -s -X DELETE "$BASE_URL/user/session" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "demo_user"}' > /dev/null
```

### Use Cases

- Bulk parameter updates
- Automated testing
- Data migration
- Parameter sweeps

---

## Common Patterns

### Pattern 1: Edit and Verify

```bash
# 1. Make edit
EDIT_RESULT=$(curl -s -X POST "$BASE_URL/edit" ...)
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')

# 2. Verify immediately
curl -s -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -d '{"session_id": "'$SESSION_ID'", "temp_file_id": "'$TEMP_FILE_ID'"}' | \
  jq '.network_data.bus[] | select(.ibus == 99999)'
```

### Pattern 2: Edit Chain

```bash
# Multiple edits in sequence, each using previous temp file
TEMP_FILE_ID=$(curl ... edit 1 ... | jq -r '.temp_file_id')
TEMP_FILE_ID=$(curl ... edit 2 ... -d '{"temp_file_id": "'$TEMP_FILE_ID'", ...}' | jq -r '.temp_file_id')
TEMP_FILE_ID=$(curl ... edit 3 ... -d '{"temp_file_id": "'$TEMP_FILE_ID'", ...}' | jq -r '.temp_file_id')
```

### Pattern 3: Calculate and Compare

```bash
# Baseline
BASELINE=$(curl ... calculate ... | jq '.results')

# Make changes
...

# Compare
SCENARIO=$(curl ... calculate ... | jq '.results')
echo "Baseline: $(echo $BASELINE | jq '.system_summary.total_losses_mw')"
echo "Scenario: $(echo $SCENARIO | jq '.system_summary.total_losses_mw')"
```

### Pattern 4: Error Handling

```bash
RESULT=$(curl -s -X POST "$BASE_URL/edit" ...)

if [ $(echo $RESULT | jq -r '.status') == "success" ]; then
    echo "Edit successful"
    TEMP_FILE_ID=$(echo $RESULT | jq -r '.temp_file_id')
else
    echo "Edit failed: $(echo $RESULT | jq -r '.message')"
    exit 1
fi
```

---

## Tips and Best Practices

### 1. Always Check Temp File ID

After each edit, extract and use the new temp file ID:
```bash
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')
```

### 2. Use jq for JSON Processing

Install jq for easy JSON parsing:
```bash
brew install jq  # macOS
apt-get install jq  # Ubuntu
```

### 3. Add Delays After Upload

Give the system time to create temp files:
```bash
sleep 2
```

### 4. Verify Before Calculating

Always verify edits before running expensive calculations:
```bash
# Quick verification
curl ... session/network ... | jq '.network_data.bus | length'
```

### 5. Clean Up Sessions

Delete sessions when done to free resources:
```bash
curl -X DELETE "$BASE_URL/user/session" \
  -d '{"user_id": "demo_user"}'
```

### 6. Use Variables

Store frequently used values:
```bash
SESSION_ID="..."
BASE_URL="http://localhost:8080/api/v1"
TEMP_FILE_ID="..."
```

### 7. Log API Calls

For debugging, save API responses:
```bash
curl ... | tee response.json | jq
```

---

## Troubleshooting Workflows

### Issue: Temp File Not Found

**Problem**: Using old temp file ID after edit

**Solution**: Always extract new temp file ID after each edit
```bash
TEMP_FILE_ID=$(echo $EDIT_RESULT | jq -r '.temp_file_id')
```

### Issue: Session Not Found

**Problem**: Session expired or invalid

**Solution**: Create a new session
```bash
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -d '{"user_id": "demo_user"}' | jq -r '.session_id')
```

### Issue: File Not Uploaded

**Problem**: Trying to edit before uploading file

**Solution**: Verify upload success before editing
```bash
curl ... upload ...
sleep 2  # Wait for temp file creation
curl ... session/info ... | jq '.file_path'
```

---

**Last Updated**: 2025-10-12  
**Version**: 1.0.0

