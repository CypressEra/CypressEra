# Edit Element Debug Guide

## Overview
This guide helps debug issues with the edit element functionality, particularly timeout errors.

## Architecture Flow

```
Frontend (React)
    ↓ POST /api/v1/session/edit
Go API Server (api-server)
    ↓ Execute: flow-solver edit --api-server-url http://localhost:8080/api/v1/editor/edited
Rust Solver (flow-solver)
    ↓ Edit network element
    ↓ POST /api/v1/editor/edited (send edited network back)
Go API Server (receives edited network via HTTP)
    ↓ Store in channel
EditElement function receives from channel
    ↓ Save to session file
    ↓ Return success response
Frontend
```

## Common Issues

### 1. Timeout Error (15-30s)

**Error Message:**
```json
{
    "error": "edit_failed",
    "message": "timeout waiting for edited network from HTTP channel (30s)"
}
```

**Possible Causes:**

#### A. API Server URL Misconfiguration
- **Check:** Ensure `API_SERVER_URL` environment variable is set correctly
- **Default:** `http://localhost:8080`
- **Fix:** Set environment variable before starting api-server:
  ```bash
  export API_SERVER_URL=http://localhost:8080
  ./api-server
  ```

#### B. Rust Solver Cannot Reach API Server
- **Check:** Verify Rust solver can make HTTP POST to Go API
- **Test:** Check if port 8080 is accessible
- **Fix:** Ensure no firewall blocking localhost:8080

#### C. Rust Solver Not Executing
- **Check:** Verify `flow-solver` binary path is correct
- **Location:** Should be in same directory as api-server or in PATH
- **Test:** Run manually:
  ```bash
  ./flow-solver edit --type bus --action modify \
    --input '{"type":"rawx","rawpath":"test.rawx"}' \
    --identifier '{"ibus":101}' \
    --data '{"ibus":101,"name":"TEST"}' \
    --api-server-url http://localhost:8080/api/v1/editor/edited
  ```

#### D. Rust Solver Crashes Before Sending
- **Check:** Look at stderr output from Rust solver
- **Debug:** Enable RUST_LOG=debug:
  ```bash
  export RUST_LOG=debug
  ./api-server
  ```

#### E. HTTP Endpoint Not Registered
- **Check:** Verify endpoint is registered in main.go:
  ```go
  api.POST("/editor/edited", apiHandler.ReceiveEditedNetwork)
  ```

## Debugging Steps

### Step 1: Check Logs
Look for these log messages in order:

1. **Request Received:**
   ```
   Executing edit element command
   element_type=bus action=modify file_path=/path/to/file.rawx
   api_url=http://localhost:8080/api/v1/editor/edited
   ```

2. **Process Started:**
   ```
   Editor process started pid=12345
   ```

3. **Waiting:**
   ```
   Waiting for edited network from Rust solver...
   ```

4. **Rust Solver Output:**
   Should see Rust logs indicating edit operation and HTTP POST

5. **Received:**
   ```
   Received edited network via HTTP
   channel_buffer=0 channel_capacity=10
   ```

6. **Success:**
   ```
   Edit element command completed successfully
   execution_time=1.234s
   ```

### Step 2: Manual Test of Rust Solver

Test if Rust solver can send HTTP properly:

```bash
# Terminal 1: Start API server with debug logging
export RUST_LOG=debug
cd api-server
./api-server

# Terminal 2: Manually invoke Rust solver
cd flow-solver
./flow-solver edit \
  --type bus \
  --action modify \
  --input '{"type":"rawx","rawpath":"../api-server/data/uploads/demo_user/test.rawx"}' \
  --identifier '{"ibus":101}' \
  --data '{"ibus":101,"name":"MODIFIED_BUS","baskv":345.0,"ide":1,"vm":1.0,"va":0.0}' \
  --api-server-url http://localhost:8080/api/v1/editor/edited
```

Expected output:
- Rust solver should log "Editing network elements"
- Rust solver should log "Edited network data sent successfully to API server"
- Go API should log "Received edited network via HTTP"

### Step 3: Check Network Connectivity

```bash
# Check if API server is listening
lsof -i :8080

# Test if endpoint is accessible
curl -X POST http://localhost:8080/api/v1/editor/edited \
  -H "Content-Type: application/json" \
  -d '{"status":"edited","rawx_data":{"network":{}},"timestamp":"2024-01-01T00:00:00Z"}'

# Should return:
# {"status":"success","message":"Edited network received successfully",...}
```

### Step 4: Verify File Paths

Ensure the session file exists and is readable:

```bash
# Check session working file
ls -la data/sessions/{user_id}/{session_id}.rawx

# Verify file is valid RAWX format
cat data/sessions/{user_id}/{session_id}.rawx | jq .
```

## Solution Checklist

- [ ] `flow-solver` binary exists and is executable
- [ ] `API_SERVER_URL` environment variable is set (or using default)
- [ ] Port 8080 is accessible
- [ ] `/api/v1/editor/edited` endpoint is registered
- [ ] Session file exists and is readable
- [ ] Rust solver has network access to API server
- [ ] Channel buffer is not full (capacity=10)

## Enhanced Logging

Recent changes added better logging:

1. **Command Args:** Full command arguments logged
2. **API URL:** Target API URL logged
3. **Process ID:** PID of Rust solver logged
4. **Channel Status:** Buffer and capacity logged
5. **Timeout Details:** URL and hint included in timeout error
6. **Stdout/Stderr:** Captured for debugging

## Environment Variables

```bash
# API Server Configuration
export API_SERVER_URL=http://localhost:8080

# Rust Logging
export RUST_LOG=info              # or debug for verbose
export RUST_BACKTRACE=1           # Enable backtraces

# Go Logging
# Configured in code, check main.go
```

## Quick Fix Summary

Most common fix:
```bash
# Ensure flow-solver is in the same directory as api-server
cd api-server
cp ../flow-solver/target/release/flow-solver ./flow-solver
chmod +x ./flow-solver

# Set environment and restart
export API_SERVER_URL=http://localhost:8080
export RUST_LOG=info
./api-server
```

## Contact

If issues persist after following this guide, check:
1. Server logs in `api-server/server.log`
2. Rust solver compilation warnings
3. Network firewall settings
4. File permissions for session files

