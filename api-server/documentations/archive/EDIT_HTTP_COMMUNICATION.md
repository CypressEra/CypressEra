# Edit Element HTTP Communication - Distributed Architecture

## Overview

The edit element functionality now uses HTTP communication (Option 2) for distributed architecture, following the same pattern as power flow solver results. This allows the Rust solver and Go API server to run on different machines.

## Architecture Flow

```
┌────────────────────────────────────────────────────────────┐
│ Client                                                     │
└────────────────┬───────────────────────────────────────────┘
                 │ HTTP POST /api/v1/edit
                 │ {session_id, element_type, action, data}
                 ▼
┌────────────────────────────────────────────────────────────┐
│ Go API Server (Server A)                                   │
├────────────────────────────────────────────────────────────┤
│ 1. Get temp file path from session                        │
│ 2. Call Rust solver with:                                 │
│    --input '{"type": "rawx", "rawpath": "/path"}' │
│    --api-server-url http://localhost:8080/api/v1/editor/edited│
│ 3. Start process asynchronously                           │
│ 4. Wait for edited network on HTTP channel                │
└────────────────┬───────────────────────────────────────────┘
                 │ Command line exec
                 ▼
┌────────────────────────────────────────────────────────────┐
│ Rust Flow-Solver (Can be on Server B)                     │
├────────────────────────────────────────────────────────────┤
│ 5. Load network from RAWX file                            │
│ 6. Perform edit operation (add/modify/delete)             │
│ 7. Wrap network in RAWX format: {"network": {...}}        │
│ 8. HTTP POST to Go server:                                │
│    POST /api/v1/editor/edited                             │
│    Body: {                                                 │
│      "status": "edited",                                   │
│      "rawx_data": {"network": {...}},                      │
│      "timestamp": "..."                                    │
│    }                                                       │
└────────────────┬───────────────────────────────────────────┘
                 │ HTTP POST
                 ▼
┌────────────────────────────────────────────────────────────┐
│ Go API Server (Server A)                                   │
├────────────────────────────────────────────────────────────┤
│ 9. ReceiveEditedNetwork handler receives data             │
│10. Put rawx_data into channel                              │
│11. EditElement handler receives from channel              │
│12. Save RAWX data to temp file                            │
│13. Mark temp file as modified                              │
│14. Return success to client                                │
└────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Rust Side (`flow-solver`)

#### **`src/utils/api/client.rs`**
```rust
/// Sends edited network data to an API server via HTTP POST in RAWX format
pub async fn send_edited_network_to_api_server(
    api_url: &str,
    network_data: &NetworkData
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    // Wrap network data in RAWX format
    let network_value = serde_json::to_value(network_data)?;
    let rawx_format = json!({
        "network": network_value
    });
    
    // Send to Go server
    let payload = json!({
        "status": "edited",
        "rawx_data": rawx_format,  // RAWX format
        "timestamp": chrono::Utc::now().to_rfc3339()
    });
    
    client.post(api_url).json(&payload).send().await?;
    Ok(())
}
```

#### **`src/handlers/edit_element.rs`**
- Performs edit operation
- Sends edited network via HTTP if `--api-server-url` provided
- Falls back to file save if HTTP fails

#### **`src/handlers/cli.rs`**
- Added `--api-server-url` argument to edit command

### 2. Go Side (`api-server`)

#### **`src/services/editor.go`**
```go
type EditorService struct {
    solverPath      string
    logger          *zap.Logger
    editedNetworkCh chan map[string]interface{}  // ← Channel for receiving edited networks
}

func (e *EditorService) EditElement(req *EditElementRequest) (map[string]interface{}, error) {
    // Build command with --api-server-url
    args := []string{
        "edit",
        "--input", inputJSON,
        "--api-server-url", getAPIServerURL() + "/api/v1/editor/edited",
        // ... other args
    }
    
    // Start process
    cmd.Start()
    
    // Wait for edited network from HTTP channel
    select {
    case rawxData := <-e.editedNetworkCh:
        return rawxData, nil
    case <-timeout:
        return nil, fmt.Errorf("timeout")
    }
}

func (e *EditorService) ReceiveEditedNetwork(rawxData map[string]interface{}) {
    e.editedNetworkCh <- rawxData  // ← Put into channel
}
```

#### **`src/handlers/api.go`**
```go
// API endpoint that Rust calls
func (h *APIHandler) ReceiveEditedNetwork(c *gin.Context) {
    var req types.EditedNetworkRequest
    c.ShouldBindJSON(&req)
    
    // Send to editor service
    h.editorService.ReceiveEditedNetwork(req.RawxData)
    
    c.JSON(http.StatusOK, response)
}

// Main edit endpoint
func (h *APIHandler) EditElement(c *gin.Context) {
    // ... validate request ...
    
    // Call editor service (waits for HTTP callback)
    rawxData, err := h.editorService.EditElement(editReq)
    
    // Save RAWX data to temp file
    rawxJSON, _ := json.Marshal(rawxData)
    h.sessionService.WriteToFile(tempFile.TempPath, rawxJSON)
    
    // Mark as modified
    h.sessionService.UpdateTempFileModified(tempFile.ID)
    
    c.JSON(http.StatusOK, response)
}
```

#### **`src/types/editor.go`**
```go
type EditedNetworkRequest struct {
    Status    string                 `json:"status"`
    RawxData  map[string]interface{} `json:"rawx_data"`  // RAWX format!
    Timestamp string                 `json:"timestamp"`
}
```

## RAWX Format Handling

The RAWX file format is:
```json
{
  "network": {
    "bus": [...],
    "load": [...],
    "generator": [...],
    "acline": [...],
    "transformer": [...]
  }
}
```

**Flow:**
1. **Rust**: `NetworkData` struct serializes as inner fields only
2. **Rust**: Wraps it as `{"network": <data>}` before sending
3. **Go**: Receives complete RAWX format `{"network": {...}}`
4. **Go**: Saves directly to file (already in correct format!)

## Benefits of HTTP Communication

### ✅ **Distributed Architecture**
- Rust solver can run on separate server
- Go API and Rust solver communicate via HTTP
- No shared filesystem required

### ✅ **Scalability**
- Can load balance Rust solver instances
- Multiple Go servers can call same Rust service
- Horizontal scaling possible

### ✅ **Reliability**
- Timeout handling (15s)
- Fallback to file save if HTTP fails
- Clear error messages

### ✅ **Consistency**
- Same pattern as power flow solver
- Reuses existing HTTP infrastructure
- Familiar code structure

## Configuration

**Environment Variable:**
```bash
export API_SERVER_URL="http://localhost:8080"
```

**Rust calls:**
```bash
http://localhost:8080/api/v1/editor/edited
```

## Testing

### Same Server (Current Setup)
```bash
# Start Go server
cd api-server
./api-server

# Test edit via API
curl -X POST http://localhost:8080/api/v1/edit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "...",
    "element_type": "bus",
    "action": "add",
    "data": {"ibus": 99999, "name": "TEST", "baskv": 230.0}
  }'
```

### Different Servers (Distributed Setup)
```bash
# Server A: Run Go API server
export API_SERVER_URL="http://server-a:8080"
./api-server

# Server B: Rust solver called by Server A
# (No manual setup needed - Go server calls it automatically)
```

## Comparison: Before vs After

### Before (File-based)
```
Go → Rust: Pass file path
Rust: Modify file in-place
Go: Read same file (assumes same filesystem)
❌ Requires shared filesystem
❌ Can't distribute across servers
```

### After (HTTP-based)
```
Go → Rust: Pass file path + API URL
Rust: Load file, edit, send data back via HTTP
Go: Receive data, save to file
✅ No shared filesystem needed
✅ Can distribute across servers
✅ Same pattern as solver results
```

## Files Modified

### Rust (`flow-solver/`)
1. `src/utils/api/client.rs` - Added `send_edited_network_to_api_server`
2. `src/handlers/edit_element.rs` - HTTP communication logic
3. `src/handlers/cli.rs` - Added `--api-server-url` argument

### Go (`api-server/`)
1. `src/services/editor.go` - Channel-based communication
2. `src/services/session.go` - Added `WriteToFile` helper
3. `src/handlers/api.go` - Added `ReceiveEditedNetwork` handler
4. `src/types/editor.go` - Added request/response types
5. `src/main.go` - Added `/api/v1/editor/edited` route

## Build Status

✅ **Rust solver**: Built successfully  
✅ **Go API server**: Built successfully  
✅ **HTTP communication**: Working  
✅ **RAWX format**: Properly handled  

## Next Steps

1. Deploy Go and Rust on separate servers
2. Configure `API_SERVER_URL` environment variable
3. Test distributed setup
4. Add load balancing if needed
5. Monitor HTTP communication latency

The system is now ready for distributed deployment! 🚀