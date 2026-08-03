# Development Guide

## Development Setup

### Prerequisites

1. **Go 1.21+** - See [Getting Started](./01_GETTING_STARTED.md#1-install-go)
2. **Rust Solver** - Built and available at configured path
3. **Git** - For version control

### Clone and Setup

```bash
# Clone the repository (if applicable)
git clone <repository-url>
cd api-server

# Install dependencies
go mod download

# Build the server
go build -o api-server src/main.go
```

### Running in Development Mode

```bash
# Run directly with Go (auto-rebuild on changes with tools like air)
go run src/main.go

# Or use the built binary
./api-server
```

### Development Tools

**Recommended:**
- **air** - Live reload for Go development
  ```bash
  go install github.com/cosmtrek/air@latest
  air
  ```

- **golangci-lint** - Linting
  ```bash
  go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
  golangci-lint run
  ```

## Project Structure

```
api-server/
├── src/
│   ├── main.go              # Entry point, routing, initialization
│   ├── handlers/
│   │   └── api.go          # HTTP request handlers
│   ├── services/           # Business logic layer
│   │   ├── session.go     # Session and file management
│   │   ├── solver.go      # Power flow calculations
│   │   ├── editor.go      # Network editing
│   │   ├── parser.go      # Network parsing
│   │   └── files.go       # File operations
│   └── types/              # Type definitions
│       ├── session.go     # Session types
│       ├── calculate_flow.go # Calculation types
│       ├── editor.go       # Editor types
│       └── file.go         # File types
├── config.yaml             # Configuration file
├── go.mod                   # Go module dependencies
└── documentations/          # Documentation
```

## Code Organization

### Handler Layer (`handlers/api.go`)

**Responsibilities:**
- HTTP request/response handling
- Request validation
- Error handling and formatting
- Logging

**Pattern:**
```go
func (h *APIHandler) HandlerName(c *gin.Context) {
    // 1. Parse and validate request
    var req types.RequestType
    if err := c.ShouldBindJSON(&req); err != nil {
        // Return error
        return
    }
    
    // 2. Call service layer
    result, err := h.serviceService.Method(req)
    if err != nil {
        // Handle error
        return
    }
    
    // 3. Return response
    c.JSON(http.StatusOK, result)
}
```

### Service Layer (`services/`)

**Responsibilities:**
- Business logic
- Data validation
- External service communication (Rust solver)
- File operations

**Pattern:**
```go
func (s *Service) Method(req *Request) (*Response, error) {
    // 1. Validate input
    if err := s.validate(req); err != nil {
        return nil, err
    }
    
    // 2. Execute business logic
    result, err := s.execute(req)
    if err != nil {
        return nil, err
    }
    
    // 3. Return result
    return result, nil
}
```

### Type Definitions (`types/`)

**Responsibilities:**
- Request/response structures
- Domain models
- Type validation tags

## Adding New Endpoints

### 1. Define Request/Response Types

Add to appropriate file in `src/types/`:

```go
type NewRequest struct {
    Field1 string `json:"field1" binding:"required"`
    Field2 int    `json:"field2"`
}

type NewResponse struct {
    Status  string `json:"status"`
    Message string `json:"message"`
}
```

### 2. Add Handler Method

Add to `handlers/api.go`:

```go
func (h *APIHandler) NewHandler(c *gin.Context) {
    var req types.NewRequest
    
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, types.ErrorResponse{
            Error:   "invalid_request",
            Message: "Invalid request body",
        })
        return
    }
    
    // Call service
    result, err := h.serviceService.NewMethod(req)
    if err != nil {
        c.JSON(http.StatusInternalServerError, types.ErrorResponse{
            Error:   "operation_failed",
            Message: err.Error(),
        })
        return
    }
    
    c.JSON(http.StatusOK, result)
}
```

### 3. Add Service Method

Add to appropriate service file:

```go
func (s *Service) NewMethod(req types.NewRequest) (*types.NewResponse, error) {
    // Business logic here
    return &types.NewResponse{
        Status:  "success",
        Message: "Operation completed",
    }, nil
}
```

### 4. Register Route

Add to `setupRouter()` in `src/main.go`:

```go
api.POST("/new-endpoint", apiHandler.NewHandler)
```

## Testing

### Running Tests

```bash
# Run all tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Run specific test
go test ./src/services -run TestSessionService
```

### Writing Tests

**Example test structure:**

```go
package services_test

import (
    "testing"
    "api-server/src/services"
    "go.uber.org/zap"
)

func TestNewMethod(t *testing.T) {
    logger, _ := zap.NewDevelopment()
    service := services.NewService(logger)
    
    // Test case
    result, err := service.NewMethod(testRequest)
    if err != nil {
        t.Fatalf("Expected no error, got %v", err)
    }
    
    if result.Status != "success" {
        t.Errorf("Expected status 'success', got %s", result.Status)
    }
}
```

## Logging

The project uses `zap` for structured logging.

### Log Levels

- `debug` - Detailed debugging information
- `info` - General informational messages
- `warn` - Warning messages
- `error` - Error messages

### Logging Best Practices

```go
// Info level for normal operations
logger.Info("Operation completed",
    zap.String("session_id", sessionID),
    zap.Duration("duration", duration))

// Error level for errors
logger.Error("Operation failed",
    zap.String("session_id", sessionID),
    zap.Error(err))

// Warn level for recoverable issues
logger.Warn("Potential issue",
    zap.String("session_id", sessionID))
```

## Error Handling

### Error Response Format

All errors should follow the standard format:

```go
types.ErrorResponse{
    Error:   "error_code",
    Message: "Human readable message",
}
```

### Error Codes

Use descriptive, consistent error codes:
- `invalid_request` - Malformed request
- `session_not_found` - Session doesn't exist
- `operation_failed` - Operation failed

### Error Propagation

```go
// Service layer
if err != nil {
    return nil, fmt.Errorf("operation failed: %w", err)
}

// Handler layer
if err != nil {
    logger.Error("Operation failed", zap.Error(err))
    c.JSON(http.StatusInternalServerError, types.ErrorResponse{
        Error:   "operation_failed",
        Message: err.Error(),
    })
    return
}
```

## Concurrency

### Thread Safety

**Session Service:**
- Uses `sync.RWMutex` for thread-safe access
- Minimize lock time by copying data outside locks
- Use read locks when possible

```go
// Read operation
s.mutex.RLock()
session := s.sessions[sessionID]
s.mutex.RUnlock()

// Write operation
s.mutex.Lock()
s.sessions[sessionID] = session
s.mutex.Unlock()
```

### Channel Communication

**Pattern for Rust communication:**
```go
// Create channel
resultCh := make(chan Result, 10)

// Start Rust process
cmd := exec.Command(solverPath, args...)
cmd.Start()

// Wait for result with timeout
select {
case result := <-resultCh:
    return result, nil
case <-time.After(30 * time.Second):
    cmd.Process.Kill()
    return nil, fmt.Errorf("timeout")
}
```

## Code Style

### Naming Conventions

- **Packages:** lowercase, single word
- **Types:** PascalCase
- **Functions:** PascalCase (exported), camelCase (unexported)
- **Variables:** camelCase
- **Constants:** PascalCase or UPPER_CASE

### Formatting

```bash
# Format code
go fmt ./...

# Or use goimports
go install golang.org/x/tools/cmd/goimports@latest
goimports -w .
```

### Comments

- Export all public types and functions
- Use complete sentences
- Start with the name of the thing being described

```go
// SessionService manages user sessions and file operations.
type SessionService struct {
    // ...
}

// CreateSession creates a new user session.
func (s *SessionService) CreateSession(userID string) (*types.UserSession, error) {
    // ...
}
```

## Debugging

### Debug Logging

Set log level to `debug` in `config.yaml`:

```yaml
log:
  level: "debug"
  format: "console"
```

### Debugging Rust Communication

1. Check Rust solver logs
2. Verify callback URLs are correct
3. Check network connectivity
4. Use timeout debugging

### Common Issues

**Port already in use:**
```bash
# Find process using port
lsof -i :8080
# Kill process
kill -9 <PID>
```

**Solver not found:**
- Verify path in `config.yaml`
- Check file permissions
- Verify binary exists

## Performance Optimization

### File Operations

- Use streaming for large files
- Perform I/O outside mutex locks
- Use buffered channels for async operations

### Session Management

- Minimize lock time
- Use read locks when possible
- Clean up expired sessions regularly

### Memory Management

- Close file handles promptly
- Use appropriate buffer sizes
- Clean up channels and goroutines

## Contributing

### Workflow

1. Create feature branch
2. Make changes
3. Write/update tests
4. Update documentation
5. Submit pull request

### Commit Messages

Use clear, descriptive commit messages:
```
feat: Add session cleanup endpoint
fix: Resolve file path security issue
docs: Update API reference
refactor: Simplify session service
```

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Error handling implemented
- [ ] Logging added
- [ ] Thread safety considered

## Dependencies

### Adding Dependencies

```bash
go get <package>
go mod tidy
```

### Updating Dependencies

```bash
go get -u <package>
go mod tidy
```

### Key Dependencies

- **gin-gonic/gin** - HTTP web framework
- **spf13/viper** - Configuration management
- **uber-go/zap** - Structured logging
- **google/uuid** - UUID generation

## Next Steps

- Read [Architecture Guide](./02_ARCHITECTURE.md) for system design
- Check [API Reference](./03_API_REFERENCE.md) for endpoint details
- Review [Configuration Guide](./05_CONFIGURATION.md) for setup options

