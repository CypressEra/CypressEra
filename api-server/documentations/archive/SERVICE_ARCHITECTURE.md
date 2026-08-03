# Service Architecture - Separation of Concerns

## Overview

The API server now has a clean separation of concerns with dedicated services for each domain:

```
┌─────────────────────────────────────────────────────────┐
│                    APIHandler                           │
│              (HTTP Layer - api.go)                      │
└──┬──────────┬──────────┬──────────┬───────────────────┘
   │          │          │          │
   ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│Session │ │Solver  │ │Editor  │ │Parser  │
│Service │ │Service │ │Service │ │Service │
└────────┘ └────────┘ └────────┘ └────────┘
```

---

## Service Responsibilities

### 1. **SessionService** (`session.go`)
**Purpose:** Session and file management

**Responsibilities:**
- Create and manage user sessions
- Handle file uploads and storage
- Manage temporary files
- Save calculation results
- Track session state

**Key Methods:**
- `CreateSession()`
- `GetSession()`
- `SaveFile()`
- `CreateTempFile()`
- `UpdateTempFileModified()`
- `WriteToFile()`

---

### 2. **SolverService** (`solver.go`)
**Purpose:** Power flow calculations only

**Responsibilities:**
- ✅ Execute power flow calculations
- ✅ Receive calculation results via HTTP
- ✅ Manage result channels
- ❌ NOT for parsing (moved to ParserService)

**Key Methods:**
- `SolvePowerFlowWithRawFile()`
- `ReceiveSolverResults()`
- `HealthCheck()`

**Removed:**
- ❌ `ParseNetworkData()` → Moved to ParserService
- ❌ `ReceiveNetworkData()` → Moved to ParserService

---

### 3. **EditorService** (`editor.go`)
**Purpose:** Network element editing

**Responsibilities:**
- ✅ Add/modify/delete network elements
- ✅ Communicate with Rust edit command
- ✅ Receive edited networks via HTTP
- ✅ Validate edit requests

**Key Methods:**
- `EditElement()`
- `ReceiveEditedNetwork()`
- `ValidateEditRequest()`

---

### 4. **ParserService** (`parser.go`) ⭐ NEW
**Purpose:** Network data parsing

**Responsibilities:**
- ✅ Parse RAWX files to NetworkData
- ✅ Communicate with Rust parse command
- ✅ Receive parsed data via HTTP
- ✅ Provide structured network data

**Key Methods:**
- `ParseNetworkData()`
- `ReceiveNetworkData()`

---

## Why This Separation?

### Before (Mixed Concerns):
```
SolverService
├── SolvePowerFlow() ✅ Power flow related
├── ReceiveSolverResults() ✅ Power flow related
├── ParseNetworkData() ❌ Not power flow!
└── ReceiveNetworkData() ❌ Not power flow!
```

### After (Clear Separation):
```
SolverService (Power Flow Only)
├── SolvePowerFlow() ✅
└── ReceiveSolverResults() ✅

ParserService (Parsing Only)
├── ParseNetworkData() ✅
└── ReceiveNetworkData() ✅
```

---

## Service Communication Patterns

All services follow the same **HTTP callback pattern**:

### Pattern:
```go
type Service struct {
    solverPath string
    logger     *zap.Logger
    dataChannel chan map[string]interface{}  // ← Channel for async communication
}

// Method 1: Execute operation (waits for callback)
func (s *Service) DoWork(input) (output, error) {
    cmd := exec.Command(s.solverPath, args...)
    cmd.Start()  // Non-blocking
    
    select {
    case data := <-s.dataChannel:  // Wait for HTTP callback
        return data, nil
    case <-timeout:
        return nil, error
    }
}

// Method 2: Receive HTTP callback (puts in channel)
func (s *Service) ReceiveData(data) {
    s.dataChannel <- data  // Send to channel
}
```

### Applied to Each Service:

| Service | Execute Method | Receive Method | Channel Data |
|---------|---------------|----------------|--------------|
| **SolverService** | `SolvePowerFlowWithRawFile()` | `ReceiveSolverResults()` | Power flow results |
| **EditorService** | `EditElement()` | `ReceiveEditedNetwork()` | Edited network (RAWX) |
| **ParserService** | `ParseNetworkData()` | `ReceiveNetworkData()` | Parsed network data |

---

## API Endpoint Mapping

| Endpoint | Handler | Service Used |
|----------|---------|--------------|
| `POST /session` | CreateSession | SessionService |
| `POST /session/info` | GetSessionInfo | SessionService |
| `POST /session/network` | GetSessionNetwork | **ParserService** ⭐ |
| `POST /user/session` | GetUserSessions | SessionService |
| `POST /upload` | UploadFile | SessionService |
| `POST /save` | SaveFile | SessionService |
| `POST /edit` | EditElement | **EditorService** |
| `POST /calculate` | CalculatePowerFlow | **SolverService** |
| `POST /solver/result` | ReceiveSolverResults | **SolverService** |
| `POST /network/parse` | ReceiveParsedNetworkData | **ParserService** ⭐ |
| `POST /editor/edited` | ReceiveEditedNetwork | **EditorService** |

---

## Benefits of This Architecture

### ✅ **Single Responsibility**
Each service has one clear purpose

### ✅ **Maintainability**
Changes to parsing don't affect solving

### ✅ **Testability**
Each service can be tested independently

### ✅ **Scalability**
Services can be split into microservices later

### ✅ **Clarity**
Code organization reflects domain logic

---

## File Structure

```
api-server/src/
├── services/
│   ├── session.go   → Session & file management
│   ├── solver.go    → Power flow calculations
│   ├── editor.go    → Network element editing
│   └── parser.go    → Network data parsing ⭐ NEW
├── handlers/
│   └── api.go       → HTTP handlers (uses all services)
├── types/
│   ├── session.go
│   ├── calculate_flow.go
│   └── editor.go
└── main.go          → Service initialization & routing
```

---

## Initialization Flow

```go
// main.go
func main() {
    // Initialize services
    sessionService := initSessionService(logger)
    solverService  := initSolverService(logger)   // Power flow only
    editorService  := initEditorService(logger)   // Editing only
    parserService  := initParserService(logger)   // Parsing only ⭐
    
    // Create API handler with all services
    apiHandler := handlers.NewAPIHandler(
        sessionService,
        solverService,
        editorService,
        parserService,  // ⭐ New service
        logger,
    )
}
```

---

## Build Status

✅ **Go API Server:** Compiled successfully  
✅ **Service separation:** Clean and logical  
✅ **All tests updated:** Using new architecture  

The code is now more maintainable with clear separation of concerns! 🎯