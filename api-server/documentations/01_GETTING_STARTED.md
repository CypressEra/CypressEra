# Getting Started Guide

## Overview

X-Flow API Server is a high-performance Go API server for power flow analysis. It manages user sessions, network editing, and orchestrates calculations using a Rust-based flow-solver.

## Prerequisites

### 1. Install Go

**macOS (using Homebrew):**
```bash
brew install go
```

**macOS/Linux (Official Installer):**
1. Visit https://go.dev/dl/
2. Download the installer for your OS
3. Run the installer

**Verify installation:**
```bash
go version
```

You should see output like: `go version go1.21.x ...`

**Note:** After installing, make sure `go` is in your PATH. If not found, add Go's bin directory to your PATH:
```bash
# Add to ~/.zshrc (or ~/.bashrc on Linux)
export PATH=$PATH:/usr/local/go/bin
source ~/.zshrc
```

### 2. Setup Rust Solver

The API server requires the Rust-based flow-solver to be built and available.

**If the Rust solver is not yet set up, please refer to the flow-solver project for installation and build instructions.**

After the solver is built, configure the path in `config.yaml` (see [Configuration Guide](./05_CONFIGURATION.md)).

## Quick Start

### 1. Build the API Server

```bash
cd api-server
go build -o api-server src/main.go
```

### 2. Configure the Solver Path

Edit `config.yaml` and set the solver path:

```yaml
solver:
  path: "../flow-solver/target/release/flow-solver"
```

**Verify the solver binary exists:**
```bash
ls -la ../flow-solver/target/release/flow-solver
```

### 3. Run the API Server

```bash
./api-server
```

Server starts on `http://localhost:8080`

### 4. Test the Server

```bash
# Health check (no auth required)
curl http://localhost:8080/health

# Login to get a JWT access token (replace credentials as needed)
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "ChangeMe123!"}' | jq -r '.access_token')

# Create session (auth required)
curl -X POST http://localhost:8080/api/v1/session \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}' | jq
```

## Basic Workflow Example

```bash
BASE_URL="http://localhost:8080/api/v1"

# 0. Login and get JWT (replace credentials as needed)
TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "ChangeMe123!"}' | jq -r '.access_token')

AUTH_HEADER="Authorization: Bearer $TOKEN"

# 1. Create session (user is taken from the JWT)
SESSION_ID=$(curl -s -X POST "$BASE_URL/session" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{}' | jq -r '.session_id')

# 2. Upload file (if you have a RAWX file)
curl -X POST "$BASE_URL/user/upload" \
  -H "$AUTH_HEADER" \
  -F "file_type=models" \
  -F "file=@network.rawx"

# 3. Create a session from the uploaded network case
SESSION_ID=$(curl -s -X POST "$BASE_URL/session/load-case" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"file_name": "network.rawx"}' | jq -r '.session_id')

# 4. Get network data
curl -X POST "$BASE_URL/session/network" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"session_id": "'$SESSION_ID'"}' | jq

# 5. Edit network (add bus)
curl -X POST "$BASE_URL/session/edit" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
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
  }' | jq

# 6. Calculate power flow
curl -X POST "$BASE_URL/session/solve-flow" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "session_id": "'$SESSION_ID'",
    "config": {"method": "dc"}
  }' | jq

# 7. Get power flow results
curl -X POST "$BASE_URL/session/powerflow" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "session_id": "'$SESSION_ID'"
  }' | jq
```

## Project Structure

```
api-server/
├── src/
│   ├── main.go              # Entry point & routing
│   ├── handlers/api.go      # HTTP handlers
│   ├── services/           # Business logic services
│   │   ├── session.go      # Session management
│   │   ├── solver.go       # Power flow calculations
│   │   ├── editor.go       # Network editing
│   │   ├── parser.go       # Network parsing
│   │   └── files.go        # File operations
│   └── types/              # Type definitions
├── config.yaml             # Configuration
├── go.mod                   # Go dependencies
├── README.md                # Main README
└── documentations/          # Documentation files
    ├── 01_GETTING_STARTED.md
    ├── 02_ARCHITECTURE.md
    ├── 03_API_REFERENCE.md
    ├── 04_DEVELOPMENT.md
    └── 05_CONFIGURATION.md
```

## Key Features

- ✅ **Session Management** - Multi-user session handling with file isolation
- ✅ **File Operations** - Upload and manage RAWX power system files
- ✅ **Network Editing** - Add, modify, delete buses, loads, generators, lines, transformers
- ✅ **Power Flow** - dc / fnsl / fdns calculations with automatic result handling
- ✅ **Async Processing** - Channel-based Go ↔ Rust communication
- ✅ **User File Management** - Persistent storage for user models and knowledge base files

## Next Steps

- Read the [Architecture Guide](./02_ARCHITECTURE.md) to understand how the system works
- Check the [API Reference](./03_API_REFERENCE.md) for complete endpoint documentation
- See the [Development Guide](./04_DEVELOPMENT.md) for contributing
- Review [Configuration Guide](./05_CONFIGURATION.md) for advanced setup

## Troubleshooting

**Go not found?**
- Make sure Go is installed (see [Prerequisites](#1-install-go))
- Verify Go is in your PATH: `which go`
- If installed but not found, add `/usr/local/go/bin` to your PATH

**Solver not found?**
- Configure the solver path in `config.yaml`
- Verify the binary exists at the configured path
- Check the [Configuration Guide](./05_CONFIGURATION.md) for details

**Port already in use?**
- The server checks port availability on startup
- Change the port in `config.yaml` if needed
- Kill any existing processes using port 8080

For more troubleshooting help, see the [Architecture Guide](./02_ARCHITECTURE.md#troubleshooting).

