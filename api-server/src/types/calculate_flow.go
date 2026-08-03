package types

import "api-server/src/studyfile/report"

// PowerFlowCalculationRequest represents a power flow calculation request.
// Config is optional: when omitted, the run uses the session's saved power
// flow configuration, or the solver defaults when the session has none.
type PowerFlowCalculationRequest struct {
	SessionID string                 `json:"session_id" binding:"required"`
	Config    map[string]interface{} `json:"config,omitempty"`
	// RequestID is an optional client-generated id echoed into the
	// powerflow:completed event so the originating UI can self-skip its
	// duplicate refetch. Carried in the BODY (not an X-Request-Id header) to
	// keep the solve a CORS "simple request" — adding a custom header would
	// force a preflight the CORS allowlist rejects.
	RequestID string `json:"request_id,omitempty"`
}

// PowerFlowCalculationResponse represents the response from a power flow calculation.
// MonitoredReport is present only when the session has study files attached.
type PowerFlowCalculationResponse struct {
	Status          string                  `json:"status"`
	Success         bool                    `json:"success"`
	Converged       bool                    `json:"converged"`
	Message         string                  `json:"message"`
	SessionID       string                  `json:"session_id"`
	Method          string                  `json:"method"`
	MonitoredReport *report.MonitoredReport `json:"monitored_report,omitempty"`
	// Solve-health telemetry (`surface-solve-telemetry`): additive, absent
	// when the underlying result predates the solver's telemetry fields.
	Iterations     int                    `json:"iterations,omitempty"`
	SolutionTimeMs float64                `json:"solution_time_ms,omitempty"`
	// True when an fdns request completed via the solver's automatic
	// full-Newton fallback (a SUCCESS-path note, not an error).
	FdnsFallback bool                   `json:"fdns_fallback,omitempty"`
	// KLU factorization counters for the solve (symbolic / full_factor /
	// refactor / reused_solve) — the kernel-reuse observability field.
	KernelReuse map[string]interface{} `json:"kernel_reuse,omitempty"`
}

// GetPowerFlowDataRequest represents a request to get power flow data
type GetPowerFlowDataRequest struct {
	SessionID string   `json:"session_id" binding:"required"`
	BusNumbers []int32 `json:"bus_numbers,omitempty"` // Filter by bus numbers (empty = all)
	Branches  []BranchFilter `json:"branches,omitempty"` // Filter by branches (empty = all)
}

// BranchFilter represents a branch filter criteria
type BranchFilter struct {
	FromBus int32  `json:"from_bus"`
	ToBus   int32  `json:"to_bus"`
	ID      string `json:"id,omitempty"` // Optional branch ID
}

// PowerFlowDataResponse represents the response with power flow data (flow-solver aligned)
type PowerFlowDataResponse struct {
	Status              string                 `json:"status"`  // Always "success" for 200 responses
	Message             string                 `json:"message"`
	SessionID           string                 `json:"session_id"`
	Method              string                 `json:"method"`
	Converged          bool                   `json:"converged"`
	SolutionTimeMs      float64                `json:"solution_time_ms"`
	Iterations         int                    `json:"iterations,omitempty"`
	MaxMismatch        float64                `json:"max_mismatch,omitempty"`
	BusResults         []interface{}          `json:"bus_results"`
	GeneratorResults   []interface{}          `json:"generator_results,omitempty"`
	AclineResults      []interface{}          `json:"acline_results"`
	TransformerResults []interface{}          `json:"transformer_results"`
	TwotermdcResults   []interface{}          `json:"twotermdc_results,omitempty"`
	VscdcResults       []interface{}          `json:"vscdc_results,omitempty"`
	SystemSummary      map[string]interface{} `json:"system_summary,omitempty"`
}

// ErrorResponse represents an error response. All API error responses should use NewErrorResponse
// so that status is always "error" and clients (e.g. SDK/MCP) can check response.status consistently.
type ErrorResponse struct {
	Status  string `json:"status"`  // Always "error" for 4xx/5xx JSON responses
	Error   string `json:"error"`
	Message string `json:"message"`
}

// NewErrorResponse returns an ErrorResponse with status "error" for consistent API contract.
func NewErrorResponse(errCode, message string) ErrorResponse {
	return ErrorResponse{Status: "error", Error: errCode, Message: message}
}
