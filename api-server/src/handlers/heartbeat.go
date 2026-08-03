package handlers

import (
	"net/http"
	"os"
	"runtime"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// HeartbeatResponse represents the heartbeat response
type HeartbeatResponse struct {
	Status       string                     `json:"status"`
	Uptime       int64                      `json:"uptime"`
	Timestamp    string                     `json:"timestamp"`
	Dependencies map[string]DependencyStatus `json:"dependencies"`
	Metrics      Metrics                    `json:"metrics"`
}

// DependencyStatus represents the status of a dependency
type DependencyStatus struct {
	Status    string `json:"status"`
	LatencyMs int64  `json:"latency_ms,omitempty"`
	Version   string `json:"version,omitempty"`
	URL       string `json:"url,omitempty"`
	Error     string `json:"error,omitempty"`
}

// Metrics represents system metrics
type Metrics struct {
	MemoryMB         uint64 `json:"memory_mb"`
	Goroutines       int    `json:"goroutines"`
	ActiveConnections int   `json:"active_connections"`
}

// HeartbeatHandler handles heartbeat requests
type HeartbeatHandler struct {
	logger        *zap.Logger
	startTime     time.Time
	dbChecker     func() (bool, int64, error)
	solverChecker func() (bool, string, error)
	mcpChecker    func() (bool, error)
	wsHub         interface{ GetClientCount() int }
}

// NewHeartbeatHandler creates a new heartbeat handler
func NewHeartbeatHandler(
	logger *zap.Logger,
	dbChecker func() (bool, int64, error),
	solverChecker func() (bool, string, error),
	mcpChecker func() (bool, error),
	wsHub interface{ GetClientCount() int },
) *HeartbeatHandler {
	return &HeartbeatHandler{
		logger:        logger,
		startTime:     time.Now(),
		dbChecker:     dbChecker,
		solverChecker: solverChecker,
		mcpChecker:    mcpChecker,
		wsHub:         wsHub,
	}
}

// Heartbeat returns detailed health status
func (h *HeartbeatHandler) Heartbeat(c *gin.Context) {
	response := HeartbeatResponse{
		Status:       "healthy",
		Uptime:       int64(time.Since(h.startTime).Seconds()),
		Timestamp:    time.Now().Format(time.RFC3339),
		Dependencies: make(map[string]DependencyStatus),
		Metrics:      h.collectMetrics(),
	}

	// Check dependencies
	h.checkDependencies(&response)

	// Determine overall status
	allHealthy := true
	for _, dep := range response.Dependencies {
		if dep.Status == "unhealthy" {
			allHealthy = false
			break
		}
	}

	if !allHealthy {
		response.Status = "degraded"
	}

	c.JSON(http.StatusOK, response)
}

// HealthCheck returns basic health status (backward compatible)
func (h *HeartbeatHandler) HealthCheck(c *gin.Context) {
	// Redirect to heartbeat for backward compatibility
	h.Heartbeat(c)
}

// checkDependencies checks the health of all dependencies
func (h *HeartbeatHandler) checkDependencies(response *HeartbeatResponse) {
	// Check database
	if h.dbChecker != nil {
		healthy, latency, err := h.dbChecker()
		status := "healthy"
		var errorMsg string
		if err != nil {
			status = "unhealthy"
			errorMsg = err.Error()
		} else if !healthy {
			status = "unhealthy"
		}

		response.Dependencies["database"] = DependencyStatus{
			Status:    status,
			LatencyMs: latency,
			Error:     errorMsg,
		}
	}

	// Check solver
	if h.solverChecker != nil {
		healthy, version, err := h.solverChecker()
		status := "healthy"
		var errorMsg string
		if err != nil {
			status = "unhealthy"
			errorMsg = err.Error()
		} else if !healthy {
			status = "unhealthy"
		}

		response.Dependencies["solver"] = DependencyStatus{
			Status:  status,
			Version: version,
			Error:   errorMsg,
		}
	}

	// Check MCP server
	if h.mcpChecker != nil {
		healthy, err := h.mcpChecker()
		status := "healthy"
		var errorMsg string
		if err != nil {
			status = "unhealthy"
			errorMsg = err.Error()
		} else if !healthy {
			status = "unhealthy"
		}

		agentURL := os.Getenv("AGENT_SERVER_URL")
		if agentURL == "" {
			agentURL = "http://localhost:3001/health"
		}

		response.Dependencies["agent_server"] = DependencyStatus{
			Status: status,
			URL:    agentURL,
			Error:  errorMsg,
		}
	}
}

// collectMetrics collects system metrics
func (h *HeartbeatHandler) collectMetrics() Metrics {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	activeConnections := 0
	if h.wsHub != nil {
		activeConnections = h.wsHub.GetClientCount()
	}

	return Metrics{
		MemoryMB:         m.Alloc / 1024 / 1024,
		Goroutines:       runtime.NumGoroutine(),
		ActiveConnections: activeConnections,
	}
}

// SimpleHealthCheck provides a minimal health check
func SimpleHealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "power-flow-solver-api",
		"timestamp": time.Now().Format(time.RFC3339),
	})
}
