# Edit Element Alignment Changes

## Summary
Fixed alignment issues between Go API server and Rust solver for edit element operations to prevent timeout errors.

## Changes Made

### 1. Added Missing `getAPIServerURL()` Function

**File:** `api-server/src/services/editor.go`

**Added:**
```go
// getAPIServerURL returns the API server URL from environment variable or default
func getAPIServerURL() string {
	if url := os.Getenv("API_SERVER_URL"); url != "" {
		return url
	}
	return "http://localhost:8080"
}
```

**Why:** This function was called on line 87 but was not defined in editor.go, causing compilation issues.

### 2. Enhanced Logging

**File:** `api-server/src/services/editor.go`

**Changes:**

#### A. ExecuteEditCommand Logging
- Added API URL to logs
- Added full command arguments to logs
- Added process ID logging
- Added stdout/stderr capture for debugging

```go
apiURL := getAPIServerURL() + "/api/v1/editor/edited"
e.logger.Info("Executing edit element command",
    zap.String("element_type", string(req.ElementType)),
    zap.String("action", string(req.Action)),
    zap.String("file_path", req.FilePath),
    zap.String("api_url", apiURL),
    zap.Strings("args", args))

cmd.Stdout = os.Stdout
cmd.Stderr = os.Stderr

e.logger.Info("Editor process started",
    zap.Int("pid", cmd.Process.Pid))
```

#### B. ReceiveEditedNetwork Logging
- Added channel buffer status
- Added channel capacity
- Changed log level to Info for better visibility

```go
e.logger.Info("Received edited network via HTTP",
    zap.Int("channel_buffer", len(e.editedNetworkCh)),
    zap.Int("channel_capacity", cap(e.editedNetworkCh)))

e.logger.Info("Edited network successfully sent to channel")
```

#### C. Timeout Error Improvements
- Increased timeout from 15s to 30s
- Added API URL to timeout error
- Added helpful hint message
- Added process kill logging

```go
timeout := time.After(30 * time.Second)

e.logger.Error("Timeout waiting for edited network",
    zap.String("file_path", req.FilePath),
    zap.String("api_url", apiURL),
    zap.Duration("timeout", 30*time.Second),
    zap.String("hint", "Check if Rust solver is sending HTTP POST to the correct URL"))

return nil, fmt.Errorf("timeout waiting for edited network from HTTP channel (30s). Ensure Rust solver can reach %s", apiURL)
```

### 3. React Component Fix

**File:** `react-ui/src/components/features/NetworkDataTable/NetworkDataTable.tsx`

**Change:** Modified to send full element data instead of only changed fields

**Before:**
```typescript
const modifyData: Record<string, any> = {};
fieldChanges.forEach((value, field) => {
  modifyData[field] = value;
});
```

**After:**
```typescript
const modifyData: Record<string, any> = { ...row };
fieldChanges.forEach((value: any, field: string) => {
  modifyData[field] = value;
});
```

**Why:** The Rust solver's modify API expects the **full element data** for deserialization, not partial updates.

## Alignment Verification

### Request Format (Frontend → Go API)
```json
{
  "session_id": "abc123",
  "element_type": "bus",
  "action": "modify",
  "identifier": {
    "ibus": 101
  },
  "data": {
    "ibus": 101,
    "name": "BUS_101",
    "baskv": 345.0,
    // ... all other fields
  }
}
```

### Go → Rust Command
```bash
./flow-solver edit \
  --type bus \
  --action modify \
  --input '{"type":"rawx","rawpath":"/path/to/session.rawx"}' \
  --identifier '{"ibus":101}' \
  --data '{"ibus":101,"name":"BUS_101",...}' \
  --api-server-url http://localhost:8080/api/v1/editor/edited
```

### Rust → Go Response
```json
POST /api/v1/editor/edited
{
  "status": "edited",
  "rawx_data": {
    "network": {
      "bus": [...],
      "load": [...],
      // ... all network elements
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

### Go Response to Frontend
```json
{
  "status": "success",
  "message": "bus modify operation completed successfully",
  "session_id": "abc123",
  "file_path": "/path/to/session.rawx"
}
```

## Files Modified

1. **api-server/src/services/editor.go**
   - Added `getAPIServerURL()` function
   - Enhanced logging throughout
   - Increased timeout to 30s
   - Added stdout/stderr capture
   - Better error messages

2. **react-ui/src/components/features/NetworkDataTable/NetworkDataTable.tsx**
   - Fixed to send full element data
   - Added type annotations

3. **react-ui/documentations/NETWORK_TABLE_EDIT_API.md**
   - Updated to clarify full element data requirement
   - Added API request/response examples

## Testing Checklist

- [x] `getAPIServerURL()` function added
- [x] Function compiles without errors
- [x] Logging shows API URL and args
- [x] Process PID logged
- [x] Stdout/stderr captured
- [x] Channel status logged
- [x] Timeout increased to 30s
- [x] Frontend sends full element data
- [x] Documentation updated

## Environment Setup

For proper operation, ensure:

```bash
# In api-server directory
export API_SERVER_URL=http://localhost:8080
export RUST_LOG=info
export RUST_BACKTRACE=1

# Ensure flow-solver binary is accessible
cp ../flow-solver/target/release/flow-solver ./flow-solver
chmod +x ./flow-solver

# Start server
./api-server
```

## Debugging

If timeout errors persist, see `EDIT_ELEMENT_DEBUG_GUIDE.md` for comprehensive debugging steps.

Key things to check:
1. Rust solver binary exists and is executable
2. Port 8080 is accessible
3. No firewall blocking localhost
4. Session file exists and is readable
5. Check server logs for detailed error messages

## Related Files

- `api-server/src/services/editor.go` - Editor service implementation
- `api-server/src/handlers/api.go` - API handlers for edit operations
- `api-server/src/types/editor.go` - Type definitions
- `flow-solver/src/handlers/edit_element.rs` - Rust edit implementation
- `flow-solver/src/utils/api/client.rs` - Rust HTTP client
- `react-ui/src/sdk/services/EditService.js` - Frontend SDK

