# Calling Solver from Different Repository

## Overview

When the solver is in a **different repository**, the API server still calls it the same way - via `exec.Command()`. The key is making the compiled solver binary accessible to the API server.

## How It Works

The API server executes the solver like this:

```go
// src/services/solver.go
cmd := exec.Command(solverPath, args...)
cmd.Start()  // Non-blocking execution
```

The solver then:
1. Processes the file
2. Performs calculation
3. Sends results back via HTTP POST to callback URL

## Setup Options

### Option 1: Build Separately + Mount Binary (Recommended)

**Step 1:** Build solver in its own repository

```bash
# In solver repository
cd /path/to/separate/solver-repo
cargo build --release
# Binary created at: target/release/flow-solver
```

**Step 2:** Update docker-compose.yml to mount the binary

```yaml
services:
  api-server:
    volumes:
      - ./data:/app/data
      # Mount solver binary from different repo
      - /absolute/path/to/solver-repo/target/release/flow-solver:/app/flow-solver:ro
    environment:
      - SOLVER_PATH=/app/flow-solver
```

**Step 3:** Configure solver path

You can set it via:
- **Environment variable:** `SOLVER_PATH=/app/flow-solver`
- **config.yaml:** `solver.path: "/app/flow-solver"`
- **docker-compose.yml:** `SOLVER_PATH=${SOLVER_PATH:-/app/flow-solver}`

### Option 2: Use Environment Variable for Path

**docker-compose.yml:**
```yaml
services:
  api-server:
    volumes:
      - ./data:/app/data
      - ${SOLVER_BINARY_PATH}:/app/flow-solver:ro
    environment:
      - SOLVER_PATH=/app/flow-solver
```

**.env file or export:**
```bash
export SOLVER_BINARY_PATH=/path/to/solver-repo/target/release/flow-solver
```

### Option 3: Copy Binary into API Server Repo

**Step 1:** Build solver in its repo
```bash
cd /path/to/solver-repo
cargo build --release
```

**Step 2:** Copy binary to API server repo
```bash
# Create bin directory in API server
mkdir -p api-server/bin

# Copy solver binary
cp /path/to/solver-repo/target/release/flow-solver api-server/bin/flow-solver
```

**Step 3:** Update config
```yaml
# config.yaml
solver:
  path: "./bin/flow-solver"
```

### Option 4: System-Wide Installation

**Step 1:** Install solver system-wide
```bash
cd /path/to/solver-repo
cargo build --release
sudo cp target/release/flow-solver /usr/local/bin/flow-solver
```

**Step 2:** Configure to use system path
```yaml
# config.yaml
solver:
  path: "/usr/local/bin/flow-solver"
```

**Note:** In Docker, you'd need to install it in the container or mount it.

## Docker Setup for Different Repo

### Complete Example

**Directory Structure:**
```
workspace/
├── api-server/              # This repo
│   ├── docker-compose.yml
│   └── ...
└── solver-repo/            # Different repo (anywhere)
    └── target/release/
        └── flow-solver
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  api-server:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
    environment:
      - GIN_MODE=release
      - API_SERVER_URL=http://localhost:8080
      - SOLVER_PATH=/app/flow-solver
    volumes:
      - ./data:/app/data
      # Mount solver from different repo (use absolute path)
      - /absolute/path/to/solver-repo/target/release/flow-solver:/app/flow-solver:ro
    restart: unless-stopped
```

**Important:** Use **absolute path** for the volume mount when the solver is in a different location.

### Using Relative Paths (If Possible)

If both repos are in a common parent directory:

```
workspace/
├── api-server/
└── solver-repo/
```

Then you can use:
```yaml
volumes:
  - ../solver-repo/target/release/flow-solver:/app/flow-solver:ro
```

## Configuration Methods

### Method 1: Environment Variable (Recommended)

```bash
# Set before running
export SOLVER_PATH=/app/flow-solver

# Or in docker-compose.yml
environment:
  - SOLVER_PATH=/app/flow-solver
```

The code reads it via:
```go
// src/main.go
viper.BindEnv("solver.path", "SOLVER_PATH")
solverPath := viper.GetString("solver.path")
```

### Method 2: config.yaml

```yaml
# config.yaml
solver:
  path: "/app/flow-solver"  # Absolute path
  # or
  path: "../solver-repo/target/release/flow-solver"  # Relative path
```

### Method 3: config.env (if you use it)

```bash
# config.env
SOLVER_PATH=/app/flow-solver
```

## How the Call Works

### 1. API Server Receives Request

```go
// Client calls: POST /api/v1/calculate
// Handler: handlers/api.go::CalculatePowerFlow()
```

### 2. API Server Executes Solver

```go
// src/services/solver.go
args := []string{
    "solve",
    "--input", `{"type": "rawx", "rawpath": "/path/to/file.rawx"}`,
    "--config", `{"method": "DC"}`,
    "--api-server-url", "http://localhost:8080/api/v1/solver/result",
}

cmd := exec.Command(solverPath, args...)  // solverPath from config
cmd.Start()  // Non-blocking
```

### 3. Solver Processes and Calls Back

The solver:
- Reads the file from the provided path
- Performs calculation
- POSTs results to: `http://localhost:8080/api/v1/solver/result`

### 4. API Server Receives Results

```go
// src/handlers/api.go::ReceiveSolverResults()
// Receives HTTP POST from solver
// Sends to channel
// Original request handler receives and responds
```

## Key Points

### ✅ What Works

- **Local binary execution**: Solver must be a compiled binary
- **File path**: Can be absolute or relative (resolved to absolute)
- **Same machine/container**: Binary must be on same filesystem
- **HTTP callbacks**: Solver sends results back via HTTP

### ❌ What Doesn't Work

- **Network address**: Cannot use `http://solver-service:8080`
- **Remote execution**: Cannot execute binary on different machine directly
- **Source code**: Must be compiled binary, not source

### 🔄 If You Need Remote Execution

If the solver is on a different machine, you'd need to:

1. **Option A:** Make solver an HTTP service
   - Solver runs as HTTP server
   - API server calls it via HTTP client
   - Requires code changes

2. **Option B:** Use SSH/remote execution
   - API server SSH to remote machine
   - Execute solver remotely
   - More complex, requires SSH setup

3. **Option C:** Shared filesystem
   - NFS, S3, or shared volume
   - Both access same files
   - Binary accessible to both

## Example: Different Repo Setup

### Scenario
- API server repo: `/Users/dev/api-server`
- Solver repo: `/Users/dev/solver-repo` (different location)

### Steps

**1. Build solver:**
```bash
cd /Users/dev/solver-repo
cargo build --release
```

**2. Update docker-compose.yml:**
```yaml
services:
  api-server:
    volumes:
      - ./data:/app/data
      - /Users/dev/solver-repo/target/release/flow-solver:/app/flow-solver:ro
    environment:
      - SOLVER_PATH=/app/flow-solver
```

**3. Run:**
```bash
cd /Users/dev/api-server
docker-compose up
```

The API server will:
- Find solver at `/app/flow-solver` (mounted from different repo)
- Execute it when needed
- Receive results via HTTP callback

## Troubleshooting

### "solver binary not found"

**Check:**
- Binary exists at the path
- Path is correct (absolute or relative)
- Docker volume mount is correct
- File permissions (executable)

**Debug:**
```bash
# In container
docker exec -it api-server-container ls -la /app/flow-solver
docker exec -it api-server-container /app/flow-solver --help
```

### "permission denied"

**Fix:**
```bash
chmod +x /path/to/solver-repo/target/release/flow-solver
```

### Callback not received

**Check:**
- `API_SERVER_URL` is correct
- API server is accessible from solver
- Network connectivity
- Solver logs for HTTP errors

## Summary

When solver is in different repo:

1. ✅ **Build solver separately** in its own repo
2. ✅ **Mount binary** via Docker volume (absolute path)
3. ✅ **Configure path** via environment variable or config.yaml
4. ✅ **API server executes** it the same way (exec.Command)
5. ✅ **Solver calls back** via HTTP POST

The coordination mechanism (HTTP callbacks) works the same regardless of where the solver repo is located!

