# Architecture and System Design

## Overview

X-Flow API Server is built with a service-oriented architecture that separates concerns into distinct layers: HTTP handlers, business logic services, and external Rust solver integration.

## System Architecture

```
┌─────────────────┐
│   Frontend      │
│   (React)       │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────────────────────────┐
│      API Server (Go)                │
│  ┌──────────────────────────────┐   │
│  │   HTTP Handlers (Gin)        │   │
│  └───────────┬──────────────────┘   │
│              │                       │
│  ┌───────────▼──────────────────┐   │
│  │   Service Layer               │   │
│  │  • SessionService             │   │
│  │  • SolverService              │   │
│  │  • EditorService              │   │
│  │  • ParserService              │   │
│  └───────────┬──────────────────┘   │
│              │                       │
│  ┌───────────▼──────────────────┐   │
│  │   File Storage                │   │
│  │  • User Models                │   │
│  │  • Session Workspaces         │   │
│  │  • Results                    │   │
│  └──────────────────────────────┘   │
└───────────┬─────────────────────────┘
            │
            │ HTTP Callbacks
            ▼
┌─────────────────────────────┐
│   Flow Solver (Rust)        │
│  • Power Flow Calculation    │
│  • Network Parsing           │
│  • Network Editing           │
└─────────────────────────────┘
```

## Service Layer

### SessionService

Manages user sessions, file operations, and workflow data.

**Key Responsibilities:**
- Create and manage user sessions
- Handle file uploads and storage
- Manage session lifecycle (create, update, cleanup)
- Track session status and results
- User file management (models and knowledge base)

**Storage Structure:**
```
{base_path}/
├── models/              # User model files
│   └── {user_id}/
│       └── *.rawx
├── knowledge/           # Knowledge base files
│   └── {user_id}/
│       └── *.rawx
├── sessions/            # Session workspaces
│   └── {user_id}/
│       └── {session_id}/
│           └── *.rawx   # Working file
└── results/             # Calculation results
    └── {user_id}/
        └── {session_id}/
            └── results.json
```

**Session States:**
- `created` - Session created, no file uploaded
- `file_uploaded` - File uploaded to session
- `ready` - Session ready for operations
- `processing` - Calculation or edit in progress
- `completed` - Operation completed successfully
- `failed` - Operation failed

**RAWX Ingestion Sanitization (working-file creation):**

PSS/E 35.x RAWX exports can be non-conformant JSON: uppercase `\UXXXX` unicode
escapes (RFC 8259 requires lowercase `\uXXXX`), raw control bytes (e.g. literal
TABs) inside string values, and non-UTF-8 metadata bytes. When `LoadCase`
copies a `.rawx` model file into the session workspace, it repairs these on the
way (`src/services/rawx_sanitize.go`) so the working file is strictly valid
JSON for every consumer — the warm-start control writeback, the Rust solver's
zero-copy fast path, and file downloads. Rules:

- Already-valid files are copied **byte-identical** (no reformatting).
- Repairs change representation, never content: escapes are lowercased, control
  chars gain their JSON escape form, invalid UTF-8 becomes U+FFFD. No deeper
  reconstruction (e.g. mojibake repair) is attempted — content is preserved
  exactly as the Rust solver's own recovery pass decodes it, and the two
  implementations are pinned to each other by shared test vectors
  (`rawx_sanitize_test.go` ↔ `flow-solver/src/core/models.rs` tests).
- Unrepairable files are copied **verbatim** with a warning (fail-open;
  identical to the previous blind-copy behavior).
- Writes are atomic (temp file + rename), so an interrupted load can never
  leave a truncated working file.
- The model-library source is never modified by `LoadCase`. Corrupt library
  files heal progressively: `SaveCase`/`SaveCaseAs` copy the (sanitized)
  working file back, so the next save round-trip produces a valid library file.

**Zero-impedance handling (solver, default since 2026-07-03):** the
flow-solver consolidates PSS/E zero-impedance ties/switches (≤ the case's
`thrshz`) into electrical supernodes by default
(`merge_zero_impedance_branches`, explicit `false` opts out), with
per-iteration generator Q-limit switching and warm-restart divergence
recovery enabled alongside. Results keep full per-element fidelity: merged
buses report their node voltage, merged ties/switches report KCL-allocated
flows, and supernode reconciliation labels the F26Legacy remote-regulation
slack explicitly. See `flow-solver` config docs
(`openspec/changes/fix-zero-impedance-merge`) for the evidence trail.

The supernode flow-reconciliation gate is also a **correctness instrument**:
because it is the only place that checks per-element KCL after a converged
solve, it surfaces defects that never show up as a non-convergence. On the
25SSWG benchmark it exposed and drove to zero five residue classes
(`openspec/changes/supernode-residue-hardening`): phantom PV buses
(type-2 with no in-service machine, now solved PQ per PSS/E), 3-winding
transformer impedance aliasing under merge, a 2W transformer flow-reporting
tap bug (KCL-violating reported flows against correctly-solved voltages),
blacked-out de-energized islands, and self-regulating switched-shunt control
settling. The allocation summary now labels every supernode category —
remote-reg slack, local switched-shunt V-reg slack, de-energized, and any
genuine reconciliation failure — so a residue is always attributable, never
silent.

This is what enables the **warm-start writeback** on affected cases: after a
converged AC solve the api-server folds the solved control state (bus voltages,
transformer taps/angles, switched-shunt `binit`, generator Q/slack P, DC taps)
back into the working file (`UpdateControlState`), and the next solve continues
from that operating point. A strict `encoding/json` parse of the working file
is the writeback's first step — possible only because ingestion guarantees
valid JSON.

*Deferred follow-up:* optional repair-at-upload for `file_type == "model"`
(mirroring the `.sub`/`.mon`/`.con` validation hook in `handlers/api.go`) would
stop non-conformant files entering the library at all. Not required for
correctness — `LoadCase` sanitization already covers every downstream consumer,
including files already in user libraries.

### SolverService

Orchestrates power flow calculations using the Rust solver.

**Key Responsibilities:**
- Execute power flow calculations
- Communicate with Rust solver via HTTP callbacks
- Handle calculation results
- Manage solver process lifecycle

**Communication Pattern:**
1. Go starts Rust solver process with file path and config
2. Rust solver performs calculation
3. Rust solver sends results back via HTTP POST to `/api/v1/solver/result`
4. Go receives results through channel-based communication

### EditorService

Manages network element editing operations.

**Key Responsibilities:**
- Validate edit requests
- Execute edit operations via Rust solver
- Handle edited network data
- Support add/modify/delete operations

**Supported Element Types:**
- `bus` - Bus elements
- `load` - Load elements
- `generator` - Generator elements
- `acline` - AC transmission lines
- `transformer` - Transformer elements

**Supported Actions:**
- `add` - Add new element (requires `data`)
- `modify` - Modify existing element (requires `identifier` and `data`)
- `delete` - Delete element (requires `identifier`)

**Communication Pattern:**
1. Go validates edit request
2. Go starts Rust solver edit command
3. Rust solver performs edit operation
4. Rust solver sends edited network via HTTP POST to `/api/v1/editor/edited`
5. Go receives edited network through channel

### ParserService

Handles network data parsing from RAWX files.

**Key Responsibilities:**
- Parse RAWX files using Rust solver
- Extract network topology data
- Return structured network data (buses, loads, generators, etc.)

**Communication Pattern:**
1. Go starts Rust parser process
2. Rust parser parses RAWX file
3. Rust parser sends parsed data via HTTP POST to `/api/v1/network/parse`
4. Go receives parsed data through channel

## HTTP Handler Layer

The handler layer (`handlers/api.go`) provides HTTP endpoints using the Gin framework.

**Key Features:**
- Request validation
- Error handling
- Response formatting
- Logging

**Endpoint Categories:**
1. **User File Management** - Upload, list, download, delete user files
2. **Session Lifecycle** - Create, manage, destroy sessions
3. **Session Model Operations** - Network operations within sessions
4. **Internal Rust Callbacks** - Receive data from Rust components
5. **System Information** - Health checks and statistics

## Communication Patterns

### Go → Rust Communication

Go initiates operations by executing Rust solver processes:

```go
cmd := exec.Command(solverPath, args...)
cmd.Start()
```

**Arguments passed:**
- File paths (RAWX files)
- Configuration (JSON)
- Callback URL (where Rust should send results)

### Rust → Go Communication

Rust sends results back via HTTP POST callbacks:

```
POST /api/v1/solver/result      - Power flow results
POST /api/v1/network/parse      - Parsed network data
POST /api/v1/editor/edited      - Edited network data
```

**Channel-based Processing:**
- Go services use channels to receive data from HTTP callbacks
- Timeout mechanisms prevent indefinite waiting
- Error handling for failed operations

## Data Flow

### Power Flow Calculation Flow

```
1. Client → POST /api/v1/session/solve-flow
2. Handler → SolverService.SolvePowerFlowWithRawFile()
3. SolverService → Exec Rust solver process
4. Rust Solver → Performs calculation
5. Rust Solver → POST /api/v1/solver/result (callback)
6. Handler → Receives results via channel
7. SolverService → Saves results to session
8. Handler → Returns results to client
```

### Network Editing Flow

```
1. Client → POST /api/v1/session/edit
2. Handler → EditorService.EditElement()
3. EditorService → Validates request
4. EditorService → Exec Rust solver edit command
5. Rust Solver → Performs edit operation
6. Rust Solver → POST /api/v1/editor/edited (callback)
7. Handler → Receives edited network via channel
8. EditorService → Saves edited network to session file
9. Handler → Returns success to client
```

### Network Parsing Flow

```
1. Client → POST /api/v1/session/network
2. Handler → ParserService.ParseNetworkData()
3. ParserService → Exec Rust parser process
4. Rust Parser → Parses RAWX file
5. Rust Parser → POST /api/v1/network/parse (callback)
6. Handler → Receives parsed data via channel
7. Handler → Returns network data to client
```

## Configuration

Configuration is managed via `config.yaml` and environment variables.

**Key Configuration Areas:**
- Server settings (host, port)
- Storage settings (base path, file size limits, session limits)
- Solver settings (binary path)
- Logging settings (level, format)

See [Configuration Guide](./05_CONFIGURATION.md) for details.

## Error Handling

### Error Response Format

All errors follow a consistent format:

```json
{
  "error": "error_code",
  "message": "Human readable error message"
}
```

### Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `invalid_request` | Malformed request | 400 |
| `session_not_found` | Session doesn't exist | 404 |
| `file_not_found` | File not found | 404 |
| `no_working_file` | Session has no working file | 400 |
| `session_creation_failed` | Failed to create session | 500 |
| `calculation_failed` | Power flow calculation failed | 500 |
| `edit_failed` | Edit operation failed | 500 |
| `parse_failed` | Network parsing failed | 500 |

## Concurrency and Thread Safety

### Session Management

- Uses `sync.RWMutex` for thread-safe session access
- Minimizes lock time by copying data outside locks
- FIFO cleanup when session limits are exceeded

### Channel Communication

- Buffered channels (capacity 10) for async communication
- Timeout mechanisms (15-30 seconds) prevent blocking
- Process cleanup on timeout

## Performance Considerations

### File Operations

- Large file operations performed outside mutex locks
- Streaming file uploads/downloads
- Efficient file copying for session creation

### Session Cleanup

- Automatic cleanup of expired sessions (24 hours)
- FIFO cleanup when user session limit exceeded
- Background goroutine for periodic cleanup

## Security Considerations

### File Path Security

- Absolute path resolution prevents directory traversal
- Path validation ensures files are in expected directories
- User isolation via directory structure

### Input Validation

- Request validation at handler level
- Service-level validation for business logic
- Type checking for all inputs

## Troubleshooting

### Solver Communication Issues

**Problem:** Timeout waiting for Rust solver results

**Solutions:**
- Verify Rust solver can reach API server URL
- Check `API_SERVER_URL` environment variable
- Ensure firewall allows localhost communication
- Check Rust solver logs for errors

### Session Not Found

**Problem:** Session ID not found

**Solutions:**
- Verify session was created successfully
- Check session hasn't expired (24 hour TTL)
- Verify user_id matches session owner

### File Operations Fail

**Problem:** File upload/download fails

**Solutions:**
- Check file size limits in config
- Verify storage directory permissions
- Check disk space availability
- Verify file path is within allowed directories

## Next Steps

- Read [API Reference](./03_API_REFERENCE.md) for endpoint details
- See [Development Guide](./04_DEVELOPMENT.md) for contributing
- Check [Configuration Guide](./05_CONFIGURATION.md) for setup options

