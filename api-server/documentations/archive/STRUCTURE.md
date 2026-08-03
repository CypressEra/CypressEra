# X-Flow API Server Architecture

## System Overview

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   React     │──────▶│   Go API    │──────▶│    Rust     │
│   Frontend  │◀──────│   Server    │◀──────│   Solver    │
└─────────────┘       └─────────────┘       └─────────────┘
                             │
                             ▼
                      ┌─────────────┐
                      │   Storage   │
                      │   (Files)   │
                      └─────────────┘
```

### Components

- **Frontend (React)**: User interface for power system analysis
- **API Server (Go)**: Session management, file handling, orchestration
- **Flow Solver (Rust)**: Power flow calculations, network parsing, editing
- **Storage**: File-based storage with session isolation

---

## Service Architecture

The API server uses four dedicated services with clear separation of concerns:

```
┌──────────────────────────────────────────────────────┐
│                   APIHandler                         │
│             (HTTP Layer - api.go)                    │
└──┬──────────┬──────────┬──────────┬─────────────────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Session │ │Solver  │ │Editor  │ │Parser  │
│Service │ │Service │ │Service │ │Service │
└────────┘ └────────┘ └────────┘ └────────┘
```

### 1. SessionService (`session.go`)

**Responsibility**: Session and file management

**Capabilities**:
- Create and manage user sessions
- Handle file uploads and storage
- Manage temporary files for editing
- Track session state and metadata
- File I/O operations

**Key Methods**:
```go
CreateSession(userID string) (*Session, error)
GetSession(sessionID string) (*Session, error)
SaveFile(sessionID string, data []byte) error
CreateTempFile(sessionID string) (string, error)
WriteToFile(path string, data []byte) error
```

---

### 2. SolverService (`solver.go`)

**Responsibility**: Power flow calculations

**Capabilities**:
- Execute DC/AC power flow calculations
- Manage asynchronous result channels
- Receive calculation results from Rust via HTTP callback
- Health checks for solver availability

**Key Methods**:
```go
SolvePowerFlowWithRawFile(sessionID, filePath string, config Config) (*Results, error)
ReceiveSolverResults(data map[string]interface{})
HealthCheck() error
```

**Communication Flow**:
```
1. Go: Start Rust solver subprocess
2. Go: Wait on channel
3. Rust: Calculate power flow
4. Rust: POST results to /api/v1/solver/result
5. Go: Receive HTTP callback → Put in channel
6. Go: Resume from channel → Return results
```

---

### 3. EditorService (`editor.go`)

**Responsibility**: Network element editing

**Capabilities**:
- Add new network elements
- Modify existing elements
- Delete elements
- Validate edit requests
- Receive edited networks from Rust via HTTP callback

**Supported Elements**:
- Buses
- Loads
- Generators
- AC Lines
- Transformers (2-winding and 3-winding)

**Key Methods**:
```go
EditElement(req *EditElementRequest) (map[string]interface{}, error)
ReceiveEditedNetwork(rawxData map[string]interface{})
ValidateEditRequest(req *EditElementRequest) error
```

**Communication Flow**:
```
1. Go: Start Rust edit subprocess
2. Go: Wait on channel
3. Rust: Edit network (add/modify/delete)
4. Rust: POST edited network to /api/v1/editor/edited
5. Go: Receive HTTP callback → Put in channel
6. Go: Resume from channel → Save to temp file → Return
```

---

### 4. ParserService (`parser.go`)

**Responsibility**: Network data parsing

**Capabilities**:
- Parse RAWX files to structured JSON
- Extract network data (buses, loads, generators, lines, transformers)
- Receive parsed data from Rust via HTTP callback

**Key Methods**:
```go
ParseNetworkData(filePath string) (*NetworkData, error)
ReceiveNetworkData(data map[string]interface{})
```

**Communication Flow**:
```
1. Go: Start Rust parse subprocess
2. Go: Wait on channel
3. Rust: Parse RAWX file
4. Rust: POST parsed data to /api/v1/network/parse
5. Go: Receive HTTP callback → Put in channel
6. Go: Resume from channel → Return network data
```

---

## Async Communication Pattern

All three services (Solver, Editor, Parser) use the same **channel-based async pattern**:

```go
type Service struct {
    solverPath  string
    logger      *zap.Logger
    dataChannel chan map[string]interface{} // ← Async bridge
}

// Execute method - starts subprocess and waits
func (s *Service) Execute(params) (result, error) {
    // 1. Start Rust subprocess (non-blocking)
    cmd := exec.Command(s.solverPath, args...)
    cmd.Start()
    
    // 2. Wait for HTTP callback via channel
    timeout := time.After(30 * time.Second)
    select {
    case data := <-s.dataChannel:  // ← Blocks until data arrives
        return data, nil
    case <-timeout:
        return nil, errors.New("timeout")
    }
}

// Receive method - HTTP callback handler
func (s *Service) Receive(data map[string]interface{}) {
    s.dataChannel <- data  // ← Unblocks Execute method
}
```

### Why This Pattern?

✅ **Non-blocking**: Go doesn't block on subprocess execution  
✅ **Async communication**: Rust can POST results when ready  
✅ **Timeout handling**: Automatic timeout if Rust doesn't respond  
✅ **Clean separation**: HTTP callbacks cleanly bridge to waiting functions

---

## Storage Structure

```
data/
├── uploads/              # User uploaded RAWX files
│   └── {user_id}/
│       └── {session_id}/
│           └── file.rawx
│
├── results/              # Calculation results
│   └── {user_id}/
│       └── {session_id}/
│           └── results.json
│
└── temp/                 # Temporary files (edited versions)
    └── {session_id}_temp_{uuid}.rawx
```

### File Lifecycle

1. **Upload**: User uploads `file.rawx` → Saved to `uploads/{user}/{session}/`
2. **Temp Created**: Automatically copied to `temp/` for editing
3. **Edit**: Modifications saved to temp file (original preserved)
4. **Calculate**: Can use original or temp file
5. **Save**: Temp file can overwrite original or save as new file
6. **Cleanup**: Temp files deleted after 24 hours or on session cleanup

---

## Project Structure

```
api-server/
├── src/
│   ├── main.go                  # Entry point, routing, initialization
│   │
│   ├── handlers/
│   │   └── api.go               # HTTP request handlers
│   │
│   ├── services/
│   │   ├── session.go           # Session & file management
│   │   ├── solver.go            # Power flow calculations
│   │   ├── editor.go            # Network element editing
│   │   └── parser.go            # Network data parsing
│   │
│   └── types/
│       ├── session.go           # Session types
│       ├── calculate_flow.go    # Calculation types
│       └── editor.go            # Editor types
│
├── data/                        # Storage (created at runtime)
│   ├── uploads/
│   ├── results/
│   └── temp/
│
├── config.yaml                  # Configuration
├── go.mod                       # Go dependencies
├── STRUCTURE.md                 # This file
├── API.md                       # API endpoint reference
└── WORKFLOW.md                  # Usage workflows
```

---

## Initialization Flow

```go
// main.go
func main() {
    // 1. Load configuration
    config := loadConfig()
    
    // 2. Initialize logger
    logger := initLogger(config)
    
    // 3. Initialize services
    sessionService := services.NewSessionService(config, logger)
    solverService  := services.NewSolverService(config.SolverPath, logger)
    editorService  := services.NewEditorService(config.SolverPath, logger)
    parserService  := services.NewParserService(config.SolverPath, logger)
    
    // 4. Create API handler with all services
    apiHandler := handlers.NewAPIHandler(
        sessionService,
        solverService,
        editorService,
        parserService,
        logger,
    )
    
    // 5. Setup routes
    router := gin.Default()
    setupRoutes(router, apiHandler)
    
    // 6. Start server
    router.Run(fmt.Sprintf("%s:%d", config.Host, config.Port))
}
```

---

## Configuration

### config.yaml

```yaml
server:
  host: "0.0.0.0"
  port: 8080

storage:
  base_path: "./data"
  max_file_size: 10485760        # 10MB
  max_sessions_per_user: 10
  temp_file_ttl_hours: 24

solver:
  path: "../flow-solver/target/release/flow-solver"

log:
  level: "info"                   # debug, info, warn, error
  format: "json"                  # json or console
```

### Environment Variables

Override config.yaml with environment variables:

```bash
export SERVER_HOST="0.0.0.0"
export SERVER_PORT=8080
export STORAGE_BASE_PATH="./data"
export STORAGE_MAX_FILE_SIZE=10485760
export SOLVER_PATH="../flow-solver/target/release/flow-solver"
export LOG_LEVEL="debug"
```

---

## API Endpoint to Service Mapping

| Endpoint | Handler | Service | Purpose |
|----------|---------|---------|---------|
| **Session Management** |
| `POST /session` | CreateSession | SessionService | Create new session |
| `POST /session/info` | GetSessionInfo | SessionService | Get session details |
| `POST /session/network` | GetSessionNetwork | ParserService | Parse and return network data |
| `POST /user/session` | GetUserSessions | SessionService | List user sessions |
| `DELETE /user/session` | DeleteUserSessions | SessionService | Delete user sessions |
| **File Operations** |
| `POST /upload` | UploadFile | SessionService | Upload RAWX file |
| `POST /save` | SaveFile | SessionService | Save temp file |
| **Network Editing** |
| `POST /edit` | EditElement | EditorService | Add/modify/delete element |
| **Calculation** |
| `POST /calculate` | CalculatePowerFlow | SolverService | Run power flow |
| **System** |
| `GET /health` | HealthCheck | - | Health check |
| `GET /stat` | GetStatistics | SessionService | Get statistics |
| **Internal (Rust Callbacks)** |
| `POST /solver/result` | ReceiveSolverResults | SolverService | Receive calculation results |
| `POST /network/parse` | ReceiveParsedNetworkData | ParserService | Receive parsed network |
| `POST /editor/edited` | ReceiveEditedNetwork | EditorService | Receive edited network |

---

## Error Handling

### Standard Error Response

All endpoints return consistent error format:

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
| `file_not_found` | No file uploaded | 404 |
| `session_creation_failed` | Failed to create session | 500 |
| `file_storage_failed` | Failed to store file | 500 |
| `calculation_failed` | Power flow failed | 500 |
| `edit_failed` | Edit operation failed | 500 |
| `parse_failed` | Parsing failed | 500 |
| `quota_exceeded` | User limit exceeded | 429 |

### Timeout Handling

All Rust operations have 30-second timeout:
- If timeout occurs, subprocess is killed
- Error returned with debugging hints
- Logs include context for troubleshooting

---

## Performance Considerations

- **Concurrent Processing**: Goroutines handle multiple simultaneous requests
- **Channel Buffering**: Channels have buffer size 10 for burst traffic
- **File Streaming**: Large files streamed to minimize memory
- **Temp File Cleanup**: Automatic cleanup after 24 hours
- **Connection Pooling**: HTTP client pools connections for callbacks

---

## Security

- **Session Isolation**: Users can only access their own sessions
- **File Validation**: Input files validated for size and format
- **Quota Limits**: Max sessions per user, max file size
- **Input Sanitization**: All inputs validated
- **CORS Configuration**: Configurable cross-origin handling

---

**Last Updated**: 2025-10-12  
**Version**: 1.0.0

