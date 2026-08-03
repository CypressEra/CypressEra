package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"api-server/src/auth"
	"api-server/src/services"
	"api-server/src/types"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

// APIHandler handles HTTP API requests
type APIHandler struct {
	sessionService     *services.SessionService
	solverService      *services.SolverService
	editorService      *services.EditorService
	parserService      *services.ParserService
	analyzerService    *services.AnalyzerService
	studyService       *services.StudyService
	contingencyService *services.ContingencyService
	studyResultService *services.StudyResultService
	eventPublisher     *EventPublisher
	logger             *zap.Logger
}

// NewAPIHandler creates a new API handler
func NewAPIHandler(sessionService *services.SessionService, solverService *services.SolverService, editorService *services.EditorService, parserService *services.ParserService, analyzerService *services.AnalyzerService, studyService *services.StudyService, contingencyService *services.ContingencyService, studyResultService *services.StudyResultService, logger *zap.Logger) *APIHandler {
	return &APIHandler{
		sessionService:     sessionService,
		solverService:      solverService,
		editorService:      editorService,
		parserService:      parserService,
		analyzerService:    analyzerService,
		studyService:       studyService,
		contingencyService: contingencyService,
		studyResultService: studyResultService,
		eventPublisher:     NewEventPublisher(nil, logger), // Will be set later if WebSocket is enabled
		logger:             logger,
	}
}

// SetEventPublisher sets the event publisher (called after WebSocket hub is
// initialized) and wires analysis-job progress through it.
func (h *APIHandler) SetEventPublisher(publisher *EventPublisher) {
	h.eventPublisher = publisher
	if h.contingencyService != nil {
		h.contingencyService.JobService().SetSink(func(sessionID string, event map[string]interface{}) {
			// Per-tick progress continues to flow through the existing
			// powerflow channel so live progress bars keep working.
			publisher.PublishSolverProgress(sessionID, event)

			// On terminal job state (state ∈ completed/failed/cancelled), also
			// publish a discrete analysis:* invalidation event on the analysis
			// topic so ProjectExplorer (and anything else watching) can refetch
			// its study-result list / running-job badge without polling.
			state, _ := event["state"].(string)
			jobID, _ := event["job_id"].(string)
			errMsg, _ := event["error"].(string)
			studyResultID, _ := event["study_result_id"].(string)
			switch state {
			case "completed", "failed", "cancelled":
				publisher.PublishAnalysisFinished(sessionID, jobID, state, errMsg, studyResultID)
			}
		})
	}
}

// CreateSession creates a new user session
func (h *APIHandler) CreateSession(c *gin.Context) {
	var req types.CreateSessionRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid create session request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		// Try service auth
		userID = auth.GetUserIDFromContextOrService(c)
		if userID == "" {
			c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
			return
		}
	}

	session, err := h.sessionService.CreateSession(userID)
	if err != nil {
		h.logger.Error("Failed to create session", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("session_creation_failed", err.Error()))
		return
	}

	// Publish session created event
	h.eventPublisher.PublishSessionCreated(session.ID, userID)

	response := types.CreateSessionResponse{
		SessionID: session.ID,
		Status:    "success",
		Message:   "Session created successfully",
	}
	c.JSON(http.StatusOK, response)
}

// CalculatePowerFlow runs power flow calculation for a session
func (h *APIHandler) CalculatePowerFlow(c *gin.Context) {
	var req types.PowerFlowCalculationRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid calculate request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	// Verify session exists
	_, exists := h.sessionService.GetSession(req.SessionID)
	if !exists {
		h.logger.Error("Failed to get session", zap.String("session_id", req.SessionID))
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", "Session not found"))
		return
	}

	// Get session info to get the working file path
	session, exists := h.sessionService.GetSession(req.SessionID)
	if !exists {
		h.logger.Error("Session not found", zap.String("session_id", req.SessionID))
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", "Session not found"))
		return
	}

	// Use the session's working file directly
	if session.FilePath == "" {
		h.logger.Error("Session has no working file", zap.String("session_id", req.SessionID))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("no_working_file", "Session has no working file. Please upload a file first."))
		return
	}

	inputFilePath := session.FilePath
	h.logger.Info("Using session's working file for calculation",
		zap.String("session_id", req.SessionID),
		zap.String("file_path", inputFilePath))

	// Create input JSON with the actual file path
	input := map[string]interface{}{
		"type":    "rawx",
		"rawpath": inputFilePath,
	}

	// Resolve the effective power flow config: an explicit request config wins
	// and is saved on the session; otherwise the session's saved config;
	// otherwise empty, so the solver applies its defaults.
	effectiveConfig := h.sessionService.ResolvePowerFlowConfig(req.SessionID, req.Config)
	if effectiveConfig == nil {
		effectiveConfig = map[string]interface{}{}
	}

	// Method: taken from the resolved config when present, else default fnsl.
	method := "fnsl"
	if m, ok := effectiveConfig["method"].(string); ok && m != "" {
		method = strings.ToLower(m)
	}
	if method != "dc" && method != "fnsl" && method != "fdns" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_method", "Method must be 'dc', 'fnsl', or 'fdns'"))
		return
	}
	effectiveConfig["method"] = method

	// Update session status
	h.sessionService.UpdateSessionStatus(req.SessionID, types.SessionStatusProcessing)

	// Convert config to JSON string
	_, err := json.Marshal(input)
	if err != nil {
		h.logger.Error("Failed to marshal input", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_input", "Failed to marshal input to JSON"))
		return
	}

	configStr, err := json.Marshal(effectiveConfig)
	if err != nil {
		h.logger.Error("Failed to marshal config", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_config", "Failed to marshal config to JSON"))
		return
	}

	// Use session working file for calculation
	h.logger.Info("Using session working file for calculation",
		zap.String("session_id", req.SessionID),
		zap.String("file_path", inputFilePath))

	// Forward streamed solver progress events to the websocket layer. For
	// solve-flow this is a near-no-op slot (the solver emits only start/done);
	// contingency analysis will exercise it fully.
	progressSink := func(event map[string]interface{}) {
		h.eventPublisher.PublishSolverProgress(req.SessionID, event)
	}
	rawJSON, err := h.solverService.SolvePowerFlowWithRawFile(req.SessionID, inputFilePath, string(configStr), progressSink)

	if err != nil {
		h.logger.Error("Power flow calculation failed", zap.String("session_id", req.SessionID), zap.Error(err))

		// Update session status to failed
		h.sessionService.UpdateSessionStatus(req.SessionID, types.SessionStatusFailed)

		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("calculation_failed", err.Error()))
		return
	}

	// Save raw JSON results directly
	resultsPath, err := h.sessionService.SaveRawResults(req.SessionID, rawJSON)
	if err != nil {
		h.logger.Error("Failed to save results", zap.String("session_id", req.SessionID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("results_save_failed", "Calculation succeeded but failed to save results"))
		return
	}

	// Parse the JSON to get basic info for session update
	var resultData map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &resultData); err != nil {
		h.logger.Warn("Failed to parse result JSON for session update", zap.Error(err))
	}

	// Update session status and results
	converged := true
	solutionTime := 0.0
	if convergedVal, ok := resultData["converged"].(bool); ok {
		converged = convergedVal
	}
	if timeVal, ok := resultData["solution_time_ms"].(float64); ok {
		solutionTime = timeVal / 1000.0
	}

	h.sessionService.UpdateSessionResults(req.SessionID, resultsPath, method, converged, solutionTime)

	h.logger.Info("Power flow calculation completed successfully", zap.String("session_id", req.SessionID), zap.String("method", method), zap.Bool("converged", converged))

	// Fold the converged control state into the session temp rawx so the next
	// solve warm-starts (bus voltages + transformer taps/angles, switched-shunt
	// binit, generator Q/slack P, two-terminal DC taps). All values are emitted
	// by the solver in RAWX-native units; the writeback only copies them in.
	if converged && method != "dc" {
		if err := h.sessionService.UpdateControlState(session.FilePath, resultData); err != nil {
			h.logger.Warn("Failed to update control state in session file",
				zap.String("session_id", req.SessionID),
				zap.String("file_path", session.FilePath),
				zap.Error(err))
		} else {
			h.logger.Info("Updated session temp file with converged control state (warm-start)",
				zap.String("session_id", req.SessionID))
		}
	}

	// Parse the raw results into structured JSON
	var parsedResults map[string]interface{}
	if err := json.Unmarshal([]byte(rawJSON), &parsedResults); err != nil {
		h.logger.Error("Failed to parse results JSON", zap.Error(err))
		c.JSON(http.StatusInternalServerError, gin.H{
			"status":  "error",
			"message": "Failed to parse results",
		})
		return
	}

	// Check if the calculation actually succeeded
	powerFlowMethod, _ := parsedResults["power_flow_method"].(string)
	converged = parsedResults["converged"].(bool)
	errorMessage, _ := parsedResults["message"].(string)

	var status, message string
	var httpStatus int
	success := true

	if powerFlowMethod == "ERROR" || !converged {
		// Calculation failed
		status = "error"
		success = false
		if errorMessage != "" {
			message = errorMessage
		} else {
			message = "Power flow calculation failed"
		}
		httpStatus = http.StatusInternalServerError

		// Update session status to failed
		h.sessionService.UpdateSessionStatus(req.SessionID, types.SessionStatusFailed)
	} else {
		// Calculation succeeded
		status = "success"
		message = "Power flow calculation completed successfully"
		httpStatus = http.StatusOK

		// Notify session subscribers that a solve finished so the UI refetches
		// results and reflects the warm-started control state — important when
		// the solve was triggered by the agent (the UI's own solve refetches via
		// the SDK). Topic subscription scopes this to the right session; the
		// echoed request id lets the originating UI self-skip its duplicate.
		// Prefer the body-carried id (CORS-simple), fall back to the header.
		requestID := req.RequestID
		if requestID == "" {
			requestID = auth.GetRequestIDFromContext(c)
		}
		h.eventPublisher.PublishPowerFlowCompleted(req.SessionID, parsedResults, requestID)
	}

	// Return only success status, not full results — plus the solve-health
	// telemetry (`surface-solve-telemetry`): iterations / wall time /
	// fdns_fallback / kernel_reuse, all additive and absence-tolerant.
	response := types.PowerFlowCalculationResponse{
		Status:    status,
		Success:   success,
		Converged: converged,
		Message:   message,
		SessionID: req.SessionID,
		Method:    method,
	}
	if it, ok := parsedResults["iterations"].(float64); ok {
		response.Iterations = int(it)
	}
	if t, ok := parsedResults["solution_time_ms"].(float64); ok {
		response.SolutionTimeMs = t
	}
	if fb, ok := parsedResults["fdns_fallback"].(bool); ok && fb {
		response.FdnsFallback = true
	}
	if kr, ok := parsedResults["kernel_reuse"].(map[string]interface{}); ok {
		response.KernelReuse = kr
	}

	// When the session has study files attached, post-process the result
	// into a monitored report. A study-file failure must not fail the run.
	if success {
		if rep, err := h.studyService.BuildReport(req.SessionID, rawJSON); err != nil {
			h.logger.Warn("Failed to build monitored report",
				zap.String("session_id", req.SessionID), zap.Error(err))
		} else if rep != nil {
			response.MonitoredReport = rep
		}
	}

	c.JSON(httpStatus, response)
}

// ValidateStudyFiles parses and resolves the study files loaded on a session
// and returns the diagnostics, without running a power flow.
func (h *APIHandler) ValidateStudyFiles(c *gin.Context) {
	var req types.StudyValidateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	analysis, err := h.studyService.Analyze(req.SessionID)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", err.Error()))
			return
		}
		h.logger.Error("Failed to validate study files",
			zap.String("session_id", req.SessionID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("study_validate_failed", err.Error()))
		return
	}

	c.JSON(http.StatusOK, types.StudyValidateResponse{
		Status:                "success",
		SessionID:             req.SessionID,
		StudyValidationResult: services.ValidationResult(analysis),
	})
}

// studyFileBaseName returns the file name of a session working-copy path, or
// "" when the path is unset. Session responses expose basenames only, never
// absolute server paths.
func studyFileBaseName(p string) string {
	if p == "" {
		return ""
	}
	return filepath.Base(p)
}

// GetSessionInfo retrieves session information
func (h *APIHandler) GetSessionInfo(c *gin.Context) {
	var req types.GetSessionInfoRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid get session info request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	sessionID := req.SessionID

	session, exists := h.sessionService.GetSession(sessionID)
	if !exists {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", fmt.Sprintf("Session %s not found", sessionID)))
		return
	}

	c.JSON(http.StatusOK, types.SessionResponse{
		ID:           session.ID,
		UserID:       session.UserID,
		Status:       session.Status,
		CreatedAt:    session.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    session.UpdatedAt.Format(time.RFC3339),
		ModelFile:    studyFileBaseName(session.FilePath),
		ResultsFile:  studyFileBaseName(session.ResultsPath),
		Method:       session.Method,
		Converged:    session.Converged,
		SolutionTime: session.SolutionTime,
		SubFile:      studyFileBaseName(session.SubPath),
		MonFile:      studyFileBaseName(session.MonPath),
		ConFile:      studyFileBaseName(session.ConPath),
	})
}

// GetPowerFlowData retrieves power flow calculation results with optional filtering
func (h *APIHandler) GetPowerFlowData(c *gin.Context) {
	var req types.GetPowerFlowDataRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid get power flow data request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	session, exists := h.sessionService.GetSession(req.SessionID)
	if !exists {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", fmt.Sprintf("Session %s not found", req.SessionID)))
		return
	}

	if session.ResultsPath == "" {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("no_results", "No power flow results found for this session. Please run a calculation first."))
		return
	}

	// Read results from file
	resultsData, err := h.sessionService.GetResultsFromFile(req.SessionID)
	if err != nil {
		h.logger.Error("Failed to read results file", zap.String("session_id", req.SessionID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("read_results_failed", fmt.Sprintf("Failed to read results: %v", err)))
		return
	}

	// Parse results
	var results map[string]interface{}
	if err := json.Unmarshal([]byte(resultsData), &results); err != nil {
		h.logger.Error("Failed to parse results JSON", zap.String("session_id", req.SessionID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("parse_results_failed", "Failed to parse results JSON"))
		return
	}

	// Extract basic info
	method := session.Method
	if method == "" {
		if m, ok := results["power_flow_method"].(string); ok {
			method = m
		}
	}
	converged := false
	if c, ok := results["converged"].(bool); ok {
		converged = c
	}
	solutionTimeMs := 0.0
	if t, ok := results["solution_time_ms"].(float64); ok {
		solutionTimeMs = t
	}
	iterations := 0
	if i, ok := results["iterations"].(float64); ok {
		iterations = int(i)
	}
	maxMismatch := 0.0
	if m, ok := results["max_mismatch"].(float64); ok {
		maxMismatch = m
	}

	// Get bus results (flow-solver uses ibus; legacy used bus_number)
	busResultsRaw, _ := results["bus_results"].([]interface{})
	busResults := make([]interface{}, 0)
	if len(req.BusNumbers) == 0 {
		busResults = busResultsRaw
	} else {
		busSet := make(map[int32]bool)
		for _, busNum := range req.BusNumbers {
			busSet[busNum] = true
		}
		for _, bus := range busResultsRaw {
			if busMap, ok := bus.(map[string]interface{}); ok {
				var busNum float64
				if n, ok := busMap["ibus"].(float64); ok {
					busNum = n
				} else if n, ok := busMap["bus_number"].(float64); ok {
					busNum = n
				}
				if busSet[int32(busNum)] {
					busResults = append(busResults, bus)
				}
			}
		}
	}

	// Get generator results
	generatorResultsRaw, _ := results["generator_results"].([]interface{})

	// Get acline_results and transformer_results (flow-solver structure)
	aclineResultsRaw, _ := results["acline_results"].([]interface{})
	transformerResultsRaw, _ := results["transformer_results"].([]interface{})
	twotermdcResultsRaw, _ := results["twotermdc_results"].([]interface{})
	vscdcResultsRaw, _ := results["vscdc_results"].([]interface{})

	// Optionally filter acline_results and transformer_results by req.Branches (ibus, jbus, ckt)
	if len(req.Branches) > 0 {
		aclineFiltered := make([]interface{}, 0)
		for _, b := range aclineResultsRaw {
			if m, ok := b.(map[string]interface{}); ok {
				ibus, _ := m["ibus"].(float64)
				jbus, _ := m["jbus"].(float64)
				ckt, _ := m["ckt"].(string)
				if ckt == "" {
					ckt = "1"
				}
				for _, filter := range req.Branches {
					matches := (int32(ibus) == filter.FromBus && int32(jbus) == filter.ToBus && ckt == filter.ID) ||
						(int32(ibus) == filter.ToBus && int32(jbus) == filter.FromBus && ckt == filter.ID)
					if filter.ID == "" {
						matches = (int32(ibus) == filter.FromBus && int32(jbus) == filter.ToBus) ||
							(int32(ibus) == filter.ToBus && int32(jbus) == filter.FromBus)
					}
					if matches {
						aclineFiltered = append(aclineFiltered, b)
						break
					}
				}
			}
		}
		aclineResultsRaw = aclineFiltered
		transformerFiltered := make([]interface{}, 0)
		for _, b := range transformerResultsRaw {
			if m, ok := b.(map[string]interface{}); ok {
				ibus, _ := m["ibus"].(float64)
				jbus, _ := m["jbus"].(float64)
				ckt, _ := m["ckt"].(string)
				if ckt == "" {
					ckt = "1"
				}
				for _, filter := range req.Branches {
					matches := (int32(ibus) == filter.FromBus && int32(jbus) == filter.ToBus && ckt == filter.ID) ||
						(int32(ibus) == filter.ToBus && int32(jbus) == filter.FromBus && ckt == filter.ID)
					if filter.ID == "" {
						matches = (int32(ibus) == filter.FromBus && int32(jbus) == filter.ToBus) ||
							(int32(ibus) == filter.ToBus && int32(jbus) == filter.FromBus)
					}
					if matches {
						transformerFiltered = append(transformerFiltered, b)
						break
					}
				}
			}
		}
		transformerResultsRaw = transformerFiltered
	}

	// Get system summary
	systemSummary, _ := results["system_summary"].(map[string]interface{})

	// Build base response
	baseResponse := map[string]interface{}{
		"status":           "success",
		"message":          "Power flow data retrieved",
		"session_id":       req.SessionID,
		"method":           method,
		"converged":        converged,
		"solution_time_ms": solutionTimeMs,
		"iterations":       iterations,
		"max_mismatch":     maxMismatch,
		"bus_results":      busResults,
		"generator_results": generatorResultsRaw,
		"acline_results":   aclineResultsRaw,
		"transformer_results": transformerResultsRaw,
		"twotermdc_results": twotermdcResultsRaw,
		"vscdc_results":    vscdcResultsRaw,
		"system_summary":   systemSummary,
	}

	// Solve-health telemetry pass-through (`surface-solve-telemetry`):
	// additive, absent on pre-telemetry result files.
	if fb, ok := results["fdns_fallback"].(bool); ok && fb {
		baseResponse["fdns_fallback"] = true
	}
	if kr, ok := results["kernel_reuse"].(map[string]interface{}); ok {
		baseResponse["kernel_reuse"] = kr
	}

	// Dynamically include any additional *_results fields from solver
	// This ensures new component types are automatically passed through without code changes
	for key, value := range results {
		if strings.HasSuffix(key, "_results") {
			// Skip if already set above (known result types)
			if _, exists := baseResponse[key]; !exists {
				baseResponse[key] = value
			}
		}
	}

	c.JSON(http.StatusOK, baseResponse)
}

// GetUserSessions retrieves all sessions for a user
func (h *APIHandler) GetUserSessions(c *gin.Context) {
	var req types.GetUserSessionsRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid get user sessions request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}

	sessions := h.sessionService.GetUserSessions(userID)
	var responses []types.SessionResponse

	for _, session := range sessions {
		responses = append(responses, types.SessionResponse{
			ID:           session.ID,
			UserID:       session.UserID,
			Status:       session.Status,
			CreatedAt:    session.CreatedAt.Format(time.RFC3339),
			UpdatedAt:    session.UpdatedAt.Format(time.RFC3339),
			ModelFile:    studyFileBaseName(session.FilePath),
			ResultsFile:  studyFileBaseName(session.ResultsPath),
			Method:       session.Method,
			Converged:    session.Converged,
			SolutionTime: session.SolutionTime,
		})
	}

	c.JSON(http.StatusOK, responses)
}

// HealthCheck provides health status
func (h *APIHandler) HealthCheck(c *gin.Context) {
	// Check solver health
	if err := h.solverService.HealthCheck(); err != nil {
		h.logger.Warn("Solver health check failed", zap.Error(err))
	}

	c.JSON(http.StatusOK, types.HealthResponse{
		Status:    "healthy",
		Service:   "power-flow-solver-api",
		Timestamp: time.Now().Format(time.RFC3339),
	})
}

// GetStats returns storage statistics
func (h *APIHandler) GetStats(c *gin.Context) {
	stats := h.sessionService.GetStats()
	c.JSON(http.StatusOK, stats)
}

// CleanupUserSessions removes all sessions for a specific user
func (h *APIHandler) CleanupUserSessions(c *gin.Context) {
	var req types.GetUserSessionsRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid cleanup user sessions request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}

	err := h.sessionService.CleanupUserSessions(userID)
	if err != nil {
		h.logger.Error("Failed to cleanup user sessions", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("cleanup_failed", "Failed to cleanup user sessions"))
		return
	}

	response := types.CleanupSessionsResponse{
		Status:  "success",
		Message: fmt.Sprintf("Cleaned up all sessions for user %s", userID),
		UserID:  userID,
	}
	c.JSON(http.StatusOK, response)
}

// UploadUserFile uploads a file directly to the user's folder (models, knowledge,
// study files, or diagram layouts).
func (h *APIHandler) UploadUserFile(c *gin.Context) {
	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}

	fileType := c.PostForm("file_type")
	if fileType == "" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("missing_file_type", "file_type form field is required (must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram')"))
		return
	}

	// Validate file type
	if fileType != "model" && fileType != "knowledge" && fileType != "sub" && fileType != "mon" && fileType != "con" && fileType != "diagram" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_file_type", "file_type must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'"))
		return
	}

	// Get uploaded file
	file, err := c.FormFile("file")
	if err != nil {
		h.logger.Error("Failed to get uploaded file", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("file_upload_failed", "No file uploaded"))
		return
	}

	// Open file
	src, err := file.Open()
	if err != nil {
		h.logger.Error("Failed to open uploaded file", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("file_open_failed", "Failed to open uploaded file"))
		return
	}
	defer src.Close()

	// Check file size
	if file.Size > h.sessionService.GetMaxFileSize() {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("file_too_large", fmt.Sprintf("File size %d bytes exceeds maximum allowed size %d bytes", file.Size, h.sessionService.GetMaxFileSize())))
		return
	}

	// Study files (.sub/.mon/.con) are content-validated at upload time — a
	// cheap non-empty + file_type/extension + anchor-keyword check, not a parse.
	var uploadReader io.Reader = src
	if fileType == "sub" || fileType == "mon" || fileType == "con" {
		content, readErr := io.ReadAll(src)
		if readErr != nil {
			h.logger.Error("Failed to read uploaded study file", zap.String("user_id", userID), zap.Error(readErr))
			c.JSON(http.StatusInternalServerError, types.NewErrorResponse("file_open_failed", "Failed to read uploaded file"))
			return
		}
		if validErr := services.ValidateStudyFile(fileType, file.Filename, content); validErr != nil {
			h.logger.Warn("Rejected invalid study file",
				zap.String("user_id", userID), zap.String("file_name", file.Filename), zap.Error(validErr))
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_study_file", validErr.Error()))
			return
		}
		uploadReader = bytes.NewReader(content)
	}

	// Save file to user folder
	filePath, err := h.sessionService.UploadUserFile(userID, fileType, file.Filename, uploadReader)
	if err != nil {
		h.logger.Error("Failed to save uploaded file", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("file_save_failed", "Failed to save uploaded file"))
		return
	}

	h.logger.Info("User file uploaded successfully",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.String("file_name", file.Filename),
		zap.String("file_path", filePath))

	h.eventPublisher.PublishUserFilesUpdated(
		userID,
		auth.GetRequestSourceFromContext(c),
		auth.GetRequestIDFromContext(c),
		[]string{fileType},
	)

	c.JSON(http.StatusOK, types.UploadUserFileResponse{
		Status:   "success",
		Message:  "File uploaded successfully",
		FilePath: filePath,
	})
}

// GetUserFiles returns a list of files uploaded by a user (models or knowledge)
func (h *APIHandler) GetUserFiles(c *gin.Context) {
	var req types.GetUserFilesRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid get user files request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}
	fileType := req.FileType

	// Validate file type
	if fileType != "model" && fileType != "knowledge" && fileType != "sub" && fileType != "mon" && fileType != "con" && fileType != "diagram" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_file_type", "file_type must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'"))
		return
	}

	h.logger.Info("Getting user files", zap.String("user_id", userID), zap.String("file_type", fileType))

	// Get user files
	userFiles, err := h.sessionService.GetUserFiles(userID, fileType)
	if err != nil {
		h.logger.Error("Failed to get user files", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("failed_to_get_files", "Failed to retrieve user files"))
		return
	}

	response := types.GetUserFilesResponse{
		Status:  "success",
		Message: "Retrieved user files",
		UserID:  userID,
		Files:   userFiles,
		Total:   len(userFiles),
	}

	h.logger.Info("Successfully retrieved user files",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.Int("file_count", len(userFiles)))

	c.JSON(http.StatusOK, response)
}

// DownloadUserFile downloads a user file with caching support
func (h *APIHandler) DownloadUserFile(c *gin.Context) {
	var req types.DownloadUserFileRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid download file request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}
	fileType := req.FileType
	fileName := req.FileName

	// Validate file type
	if fileType != "model" && fileType != "knowledge" && fileType != "sub" && fileType != "mon" && fileType != "con" && fileType != "diagram" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_file_type", "file_type must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'"))
		return
	}

	h.logger.Info("Downloading user file",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.String("file_name", fileName))

	// Get file path and info
	filePath, fileInfo, err := h.sessionService.GetUserFilePath(userID, fileType, fileName)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			h.logger.Error("File not found", zap.String("user_id", userID), zap.String("file_name", fileName), zap.Error(err))
			c.JSON(http.StatusNotFound, types.NewErrorResponse("file_not_found", fmt.Sprintf("File not found: %s", fileName)))
			return
		}
		h.logger.Error("Failed to get file path", zap.String("user_id", userID), zap.String("file_name", fileName), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("file_access_failed", "Failed to access file"))
		return
	}

	// Open file
	file, err := os.Open(filePath)
	if err != nil {
		h.logger.Error("Failed to open file", zap.String("file_path", filePath), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("file_open_failed", "Failed to open file"))
		return
	}
	defer file.Close()

	// Generate ETag from file modification time and size
	etag := fmt.Sprintf(`"%x-%x"`, fileInfo.ModTime().Unix(), fileInfo.Size())
	lastModified := fileInfo.ModTime().Format(http.TimeFormat)

	// Check conditional requests (If-None-Match, If-Modified-Since)
	ifNoneMatch := c.GetHeader("If-None-Match")
	ifModifiedSince := c.GetHeader("If-Modified-Since")

	if ifNoneMatch != "" && ifNoneMatch == etag {
		c.Status(http.StatusNotModified)
		return
	}

	if ifModifiedSince != "" {
		if t, err := time.Parse(http.TimeFormat, ifModifiedSince); err == nil {
			if fileInfo.ModTime().Before(t.Add(time.Second)) || fileInfo.ModTime().Equal(t) {
				c.Status(http.StatusNotModified)
				return
			}
		}
	}

	// Detect Content-Type
	var contentType string
	ext := strings.ToLower(filepath.Ext(fileName))
	switch ext {
	case ".pdf":
		contentType = "application/pdf"
	case ".png":
		contentType = "image/png"
	case ".jpg", ".jpeg":
		contentType = "image/jpeg"
	case ".gif":
		contentType = "image/gif"
	case ".txt":
		contentType = "text/plain"
	case ".json":
		contentType = "application/json"
	case ".xml":
		contentType = "application/xml"
	case ".zip":
		contentType = "application/zip"
	case ".rawx", ".raw":
		contentType = "application/octet-stream"
	case ".sub", ".mon", ".con":
		contentType = "text/plain; charset=utf-8"
	default:
		// Read first 512 bytes to detect content type
		buffer := make([]byte, 512)
		n, _ := file.Read(buffer)
		contentType = http.DetectContentType(buffer[:n])
		// Reset file pointer
		file.Seek(0, 0)
	}

	// Set response headers
	c.Header("Content-Type", contentType)
	c.Header("Content-Length", fmt.Sprintf("%d", fileInfo.Size()))
	c.Header("ETag", etag)
	c.Header("Last-Modified", lastModified)
	c.Header("Cache-Control", "public, max-age=3600")
	c.Header("Accept-Ranges", "bytes")

	// Handle Range requests
	rangeHeader := c.GetHeader("Range")
	if rangeHeader != "" {
		// Parse range header (e.g., "bytes=0-1023")
		var start, end int64
		fmt.Sscanf(rangeHeader, "bytes=%d-%d", &start, &end)
		if end == 0 || end >= fileInfo.Size() {
			end = fileInfo.Size() - 1
		}
		if start < 0 || start > end || end >= fileInfo.Size() {
			c.Header("Content-Range", fmt.Sprintf("bytes */%d", fileInfo.Size()))
			c.Status(http.StatusRequestedRangeNotSatisfiable)
			return
		}

		// Seek to start position
		file.Seek(start, 0)
		length := end - start + 1

		c.Header("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, fileInfo.Size()))
		c.Header("Content-Length", fmt.Sprintf("%d", length))
		c.DataFromReader(http.StatusPartialContent, length, contentType, file, nil)
		return
	}

	// Stream the entire file
	c.DataFromReader(http.StatusOK, fileInfo.Size(), contentType, file, nil)

	h.logger.Info("File downloaded successfully",
		zap.String("user_id", userID),
		zap.String("file_name", fileName),
		zap.String("file_type", fileType),
		zap.Int64("file_size", fileInfo.Size()))
}

// DeleteUserFile deletes a user file (models or knowledge)
func (h *APIHandler) DeleteUserFile(c *gin.Context) {
	var req types.DeleteUserFileRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid delete file request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}
	fileType := req.FileType
	fileName := req.FileName

	// Validate file type
	if fileType != "model" && fileType != "knowledge" && fileType != "sub" && fileType != "mon" && fileType != "con" && fileType != "diagram" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_file_type", "file_type must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'"))
		return
	}

	h.logger.Info("Deleting user file",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.String("file_name", fileName))

	// Delete the file
	err := h.sessionService.DeleteUserFile(userID, fileType, fileName)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			h.logger.Error("File not found", zap.String("user_id", userID), zap.String("file_name", fileName), zap.Error(err))
			c.JSON(http.StatusNotFound, types.NewErrorResponse("file_not_found", fmt.Sprintf("File not found: %s", fileName)))
			return
		}
		h.logger.Error("Failed to delete file", zap.String("user_id", userID), zap.String("file_name", fileName), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("file_delete_failed", "Failed to delete file"))
		return
	}

	response := types.DeleteUserFileResponse{
		Status:   "success",
		Message:  fmt.Sprintf("File %s deleted successfully", fileName),
		FileName: fileName,
	}

	h.logger.Info("File deleted successfully",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.String("file_name", fileName))

	h.eventPublisher.PublishUserFilesUpdated(
		userID,
		auth.GetRequestSourceFromContext(c),
		auth.GetRequestIDFromContext(c),
		[]string{fileType},
	)

	c.JSON(http.StatusOK, response)
}

// LoadSub loads a subsystem (.sub) file from the user library into a session.
func (h *APIHandler) LoadSub(c *gin.Context) { h.loadStudyFile(c, "sub") }

// LoadMon loads a monitored-elements (.mon) file from the user library into a session.
func (h *APIHandler) LoadMon(c *gin.Context) { h.loadStudyFile(c, "mon") }

// LoadCon loads a contingency (.con) file from the user library into a session.
func (h *APIHandler) LoadCon(c *gin.Context) { h.loadStudyFile(c, "con") }

// loadStudyFile copies a .sub/.mon/.con study file of the given kind
// ("sub"/"mon"/"con") from the user library into an existing session, recording
// it on the matching session slot (SubPath/MonPath/ConPath).
func (h *APIHandler) loadStudyFile(c *gin.Context, fileType string) {
	var req types.LoadStudyFileRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid load study file request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}

	h.logger.Info("Loading study file into session",
		zap.String("user_id", userID),
		zap.String("session_id", req.SessionID),
		zap.String("file_name", req.FileName),
		zap.String("kind", fileType))

	_, err := h.sessionService.LoadStudyFileIntoSession(userID, req.SessionID, fileType, req.FileName)
	if err != nil {
		msg := err.Error()
		switch {
		case strings.Contains(msg, "does not match file_type"):
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_study_file", msg))
		case strings.Contains(msg, "file not found"):
			c.JSON(http.StatusNotFound, types.NewErrorResponse("file_not_found", msg))
		case strings.Contains(msg, "session") && strings.Contains(msg, "not found"):
			c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", msg))
		default:
			h.logger.Error("Failed to load study file",
				zap.String("user_id", userID),
				zap.String("session_id", req.SessionID),
				zap.String("file_name", req.FileName),
				zap.Error(err))
			c.JSON(http.StatusInternalServerError, types.NewErrorResponse("study_load_failed", "Failed to load study file"))
		}
		return
	}

	h.logger.Info("Loaded study file into session",
		zap.String("user_id", userID),
		zap.String("session_id", req.SessionID),
		zap.String("file_name", req.FileName),
		zap.String("kind", fileType))

	resp := types.LoadStudyFileResponse{
		Status:    "success",
		Message:   "Study file loaded into session",
		SessionID: req.SessionID,
		FileName:  req.FileName,
		Type:      fileType,
	}

	// Validate the session's study files and return the result inline, so the
	// caller learns whether the loaded file is usable from this one call. A
	// validation failure must not fail the load itself.
	if analysis, verr := h.studyService.Analyze(req.SessionID); verr != nil {
		h.logger.Warn("Study file loaded but validation failed",
			zap.String("session_id", req.SessionID), zap.Error(verr))
	} else {
		resp.StudyValidationResult = services.ValidationResult(analysis)
	}

	// Publish BEFORE the JSON response so the event fires for every successful
	// load, regardless of whether the response reaches the client.
	h.eventPublisher.PublishStudyFilesUpdated(
		req.SessionID,
		userID,
		auth.GetRequestSourceFromContext(c),
		auth.GetRequestIDFromContext(c),
		[]string{fileType},
	)

	c.JSON(http.StatusOK, resp)
}

// LoadCase creates a session and copies a user file to the session workspace
func (h *APIHandler) LoadCase(c *gin.Context) {
	var req types.LoadCaseRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid create session from file request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}

	h.logger.Info("Creating session from file",
		zap.String("user_id", userID),
		zap.String("file_name", req.FileName))

	// Create session from file
	sessionID, err := h.sessionService.LoadCase(userID, req.FileName)
	if err != nil {
		h.logger.Error("Failed to create session from file",
			zap.String("user_id", userID),
			zap.String("file_name", req.FileName),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("session_creation_failed", "Failed to create session from file"))
		return
	}

	h.logger.Info("Successfully created session from file",
		zap.String("user_id", userID),
		zap.String("file_name", req.FileName),
		zap.String("session_id", sessionID))

	c.JSON(http.StatusOK, gin.H{
		"status":     "success",
		"message":    "Session created successfully from file",
		"session_id": sessionID,
		"user_id":    userID,
		"file_name":  req.FileName,
	})
}

// SaveCase saves the session's working file back to the user's original file
func (h *APIHandler) SaveCase(c *gin.Context) {
	var req types.SaveCaseRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid save session to user file request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	h.logger.Info("Saving session to user file", zap.String("session_id", req.SessionID))

	// Save session to user file
	err := h.sessionService.SaveCase(req.SessionID)
	if err != nil {
		h.logger.Error("Failed to save session to user file",
			zap.String("session_id", req.SessionID),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("save_failed", "Failed to save session to user file"))
		return
	}

	h.logger.Info("Successfully saved session to user file",
		zap.String("session_id", req.SessionID))

	c.JSON(http.StatusOK, gin.H{
		"status":     "success",
		"message":    "Session file saved successfully to user file",
		"session_id": req.SessionID,
	})
}

// SaveCaseAs saves the session's working file as a new user model file
func (h *APIHandler) SaveCaseAs(c *gin.Context) {
	var req types.SaveCaseAsRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid save session as user file request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	h.logger.Info("Saving session as new user file",
		zap.String("session_id", req.SessionID),
		zap.String("new_file_name", req.NewFileName))

	// Save session as new user file (will overwrite if file already exists)
	err := h.sessionService.SaveCaseAs(req.SessionID, req.NewFileName)
	if err != nil {
		if strings.Contains(err.Error(), "session not found") {
			h.logger.Error("Session not found", zap.String("session_id", req.SessionID))
			c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", "Session not found"))
			return
		}
		h.logger.Error("Failed to save session as new user file",
			zap.String("session_id", req.SessionID),
			zap.String("new_file_name", req.NewFileName),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("save_failed", "Failed to save session as new user file"))
		return
	}

	// Get updated session to get the new file path
	updatedSession, _ := h.sessionService.GetSession(req.SessionID)

	h.logger.Info("Successfully saved session as new user file",
		zap.String("session_id", req.SessionID),
		zap.String("new_file_name", req.NewFileName))

	response := types.SaveCaseAsResponse{
		Status:    "success",
		Message:   "Session file saved successfully as new user file",
		SessionID: req.SessionID,
		FileName:  req.NewFileName,
		FilePath:  updatedSession.OriginalFilePath,
	}
	c.JSON(http.StatusOK, response)
}

// EditElement edits a network element in a session's working file
func (h *APIHandler) EditElement(c *gin.Context) {
	var req types.EditElementRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid edit element request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	// Get session info to get the working file path
	session, exists := h.sessionService.GetSession(req.SessionID)
	if !exists {
		h.logger.Error("Session not found", zap.String("session_id", req.SessionID))
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", "Session not found"))
		return
	}

	// Use the session's working file directly
	if session.FilePath == "" {
		h.logger.Error("Session has no working file", zap.String("session_id", req.SessionID))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("no_working_file", "Session has no working file. Please upload a file first."))
		return
	}

	// Create edit request for the editor service
	editReq := &services.EditElementRequest{
		ElementType: services.ElementType(strings.ToLower(req.ElementType)),
		Action:      services.ElementAction(strings.ToLower(req.Action)),
		FilePath:    session.FilePath,
		Data:        req.Data,
		Identifier:  req.Identifier,
	}

	// Validate the edit request
	if err := h.editorService.ValidateEditRequest(editReq); err != nil {
		h.logger.Error("Invalid edit request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_edit_request", err.Error()))
		return
	}

	// Execute the edit operation
	h.logger.Info("Editing network element",
		zap.String("session_id", req.SessionID),
		zap.String("file_path", session.FilePath),
		zap.String("element_type", req.ElementType),
		zap.String("action", req.Action))

	rawxData, err := h.editorService.EditElement(editReq)
	if err != nil {
		h.logger.Error("Edit element operation failed",
			zap.String("session_id", req.SessionID),
			zap.String("file_path", session.FilePath),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("edit_failed", err.Error()))
		return
	}

	// Save the edited network (in RAWX format) back to the session working file
	rawxJSON, err := json.Marshal(rawxData)
	if err != nil {
		h.logger.Error("Failed to marshal edited network",
			zap.String("session_id", req.SessionID),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("marshal_failed", "Failed to marshal edited network"))
		return
	}

	// Write the edited network to the session working file
	if err := h.sessionService.WriteToFile(session.FilePath, rawxJSON); err != nil {
		h.logger.Error("Failed to save edited network to file",
			zap.String("session_id", req.SessionID),
			zap.String("file_path", session.FilePath),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("save_failed", "Failed to save edited network to file"))
		return
	}

	h.logger.Info("Network element edited successfully",
		zap.String("session_id", req.SessionID),
		zap.String("file_path", session.FilePath),
		zap.String("element_type", req.ElementType),
		zap.String("action", req.Action))

	// Generate descriptive success message with identifiers
	// For add: use Data; for delete/modify: use Identifier
	var identifierForMessage map[string]interface{}
	if req.Action == "add" {
		identifierForMessage = req.Data
	} else {
		identifierForMessage = req.Identifier
	}
	successMessage := generateEditSuccessMessage(req.ElementType, req.Action, identifierForMessage)

	// Coalesce network:updated events — chat-driven workflows can issue
	// many EditElement calls in quick succession; one debounced refetch on
	// the UI side is enough.
	h.eventPublisher.PublishNetworkUpdatedCoalesced(
		req.SessionID,
		auth.GetRequestSourceFromContext(c),
		auth.GetRequestIDFromContext(c),
		map[string]interface{}{
			"element_type": req.ElementType,
			"action":       req.Action,
			"identifier":   identifierForMessage,
		},
	)

	// Return success response
	response := types.EditElementResponse{
		Status:    "success",
		Message:   successMessage,
		SessionID: req.SessionID,
		FilePath:  session.FilePath,
	}
	c.JSON(http.StatusOK, response)
}

// GetSessionNetwork retrieves the network data for a session.
// If element_type is set, returns only that element type; if identifier is also set, filters to that one element.
func (h *APIHandler) GetSessionNetwork(c *gin.Context) {
	var req types.GetNetworkRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid get network request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}

	// Fallback: accept element_type from query if not in body (e.g. some clients send it as query param)
	if req.ElementType == "" {
		req.ElementType = c.Query("element_type")
	}

	sessionID := req.SessionID

	// Get session info to get the working file path
	session, exists := h.sessionService.GetSession(sessionID)
	if !exists {
		h.logger.Error("Session not found", zap.String("session_id", sessionID))
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", "Session not found"))
		return
	}

	// Use the session's working file directly
	if session.FilePath == "" {
		h.logger.Error("Session has no working file", zap.String("session_id", sessionID))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("no_working_file", "Session has no working file. Please upload a file first."))
		return
	}

	h.logger.Info("Parsing network data for session",
		zap.String("session_id", sessionID),
		zap.String("file_path", session.FilePath),
		zap.String("element_type", req.ElementType))

	// Parse the session's working file using Rust parser
	networkData, err := h.parserService.ParseNetworkData(session.FilePath)
	if err != nil {
		h.logger.Error("Failed to parse network data",
			zap.String("session_id", sessionID),
			zap.String("file_path", session.FilePath),
			zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("parse_failed", err.Error()))
		return
	}

	// If element_type requested, return only that type (and optionally filter by identifier)
	if req.ElementType != "" {
		elementType := strings.ToLower(strings.TrimSpace(req.ElementType))
		raw, ok := networkData[elementType]
		if !ok {
			c.JSON(http.StatusOK, gin.H{
				"status":       "success",
				"session_id":   sessionID,
				"network_data": map[string]interface{}{elementType: []interface{}{}},
			})
			return
		}
		slice, ok := raw.([]interface{})
		if !ok {
			c.JSON(http.StatusOK, gin.H{
				"status":       "success",
				"session_id":   sessionID,
				"network_data": networkData,
			})
			return
		}
		if len(req.Identifier) > 0 {
			var filtered []interface{}
			for _, item := range slice {
				obj, ok := item.(map[string]interface{})
				if !ok {
					continue
				}
				match := true
				for k, v := range req.Identifier {
					if ov, exists := obj[k]; !exists || !equalJSON(ov, v) {
						match = false
						break
					}
				}
				if match {
					filtered = append(filtered, item)
				}
			}
			
			// For acline and transformer, if no match found, try swapping ibus and jbus
			if len(filtered) == 0 && (elementType == "acline" || elementType == "transformer") {
				// Check if identifier contains both ibus and jbus
				ibusVal, hasIbus := req.Identifier["ibus"]
				jbusVal, hasJbus := req.Identifier["jbus"]
				
				if hasIbus && hasJbus {
					// Try with swapped ibus and jbus
					swappedIdentifier := make(map[string]interface{})
					for k, v := range req.Identifier {
						swappedIdentifier[k] = v
					}
					swappedIdentifier["ibus"] = jbusVal
					swappedIdentifier["jbus"] = ibusVal
					
					for _, item := range slice {
						obj, ok := item.(map[string]interface{})
						if !ok {
							continue
						}
						match := true
						for k, v := range swappedIdentifier {
							if ov, exists := obj[k]; !exists || !equalJSON(ov, v) {
								match = false
								break
							}
						}
						if match {
							filtered = append(filtered, item)
						}
					}
				}
			}
			
			slice = filtered
		}
		c.JSON(http.StatusOK, gin.H{
			"status":       "success",
			"session_id":   sessionID,
			"network_data": map[string]interface{}{elementType: slice},
		})
		return
	}

	h.logger.Info("Network data retrieved successfully",
		zap.String("session_id", sessionID))

	c.JSON(http.StatusOK, gin.H{
		"status":       "success",
		"session_id":   sessionID,
		"network_data": networkData,
	})
}

// equalJSON compares two values for equality (numbers and strings; identifier values are simple types).
func equalJSON(a, b interface{}) bool {
	switch va := a.(type) {
	case float64:
		if vb, ok := b.(float64); ok {
			return va == vb
		}
		if vb, ok := b.(int); ok {
			return va == float64(vb)
		}
		return false
	case string:
		vb, ok := b.(string)
		return ok && va == vb
	case int:
		if vb, ok := b.(float64); ok {
			return float64(va) == vb
		}
		if vb, ok := b.(int); ok {
			return va == vb
		}
		return false
	default:
		return a == b
	}
}

// FindShortestPath finds the minimum-hop path between two buses in the session network.
func (h *APIHandler) FindShortestPath(c *gin.Context) {
	var req types.FindShortestPathRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid find-shortest-path request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request",
			"Invalid request body: session_id, from_bus, and to_bus are all required integer fields."))
		return
	}

	session, exists := h.sessionService.GetSession(req.SessionID)
	if !exists {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found",
			fmt.Sprintf("Session %s not found. Call getSessionInfo to verify the session is still active, or createSessionFromFile to start a new one.", req.SessionID)))
		return
	}
	if session.FilePath == "" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("no_working_file",
			"Session has no loaded network file. Call createSessionFromFile first to load a case before running path analysis."))
		return
	}

	raw, err := h.analyzerService.FindShortestPath(session.FilePath, req.FromBus, req.ToBus)
	if err != nil {
		h.logger.Error("FindShortestPath failed", zap.String("session_id", req.SessionID), zap.Error(err))
		status, code := classifyAnalysisError(err)
		c.JSON(status, types.NewErrorResponse(code,
			fmt.Sprintf("Shortest-path analysis failed: %v. Verify that bus %d and bus %d both exist in the network and are in-service (use getNetwork to inspect the bus list).", err, req.FromBus, req.ToBus)))
		return
	}

	found, _ := raw["found"].(bool)
	resp := types.FindShortestPathResponse{
		Status:    "success",
		SessionID: req.SessionID,
		Found:     found,
	}
	if found {
		if pathRaw, ok := raw["path"].([]interface{}); ok {
			path := make([]int, len(pathRaw))
			for i, v := range pathRaw {
				if f, ok := v.(float64); ok {
					path[i] = int(f)
				}
			}
			resp.Path = path
		}
	} else {
		resp.Message = fmt.Sprintf(
			"No path found between bus %d and bus %d — they are in separate disconnected islands. Check that both buses are in-service and reachable through in-service AC lines or transformers.",
			req.FromBus, req.ToBus)
	}

	c.JSON(http.StatusOK, resp)
}

// FindNeighbourElements returns all in-service elements within N bus-levels of originBus.
func (h *APIHandler) FindNeighbourElements(c *gin.Context) {
	var req types.FindNeighbourElementsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid find-neighbour-elements request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request",
			"Invalid request body: session_id, origin_bus, and n are all required. n must be an integer between 1 and 99."))
		return
	}

	if req.N < 1 || req.N > 99 {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_n",
			fmt.Sprintf("n=%d is out of range. n must be an integer between 1 and 99. Use a smaller value for a tighter neighbourhood search.", req.N)))
		return
	}

	session, exists := h.sessionService.GetSession(req.SessionID)
	if !exists {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found",
			fmt.Sprintf("Session %s not found. Call getSessionInfo to verify the session is still active, or createSessionFromFile to start a new one.", req.SessionID)))
		return
	}
	if session.FilePath == "" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("no_working_file",
			"Session has no loaded network file. Call createSessionFromFile first to load a case before running neighbourhood analysis."))
		return
	}

	elements, err := h.analyzerService.FindNeighbourElements(session.FilePath, req.OriginBus, req.N, req.ElementTypes)
	if err != nil {
		h.logger.Error("FindNeighbourElements failed", zap.String("session_id", req.SessionID), zap.Error(err))
		status, code := classifyAnalysisError(err)
		c.JSON(status, types.NewErrorResponse(code,
			fmt.Sprintf("Neighbourhood analysis failed: %v. Verify that bus %d exists in the network and is in-service (use getNetwork to inspect the bus list).", err, req.OriginBus)))
		return
	}

	c.JSON(http.StatusOK, types.FindNeighbourElementsResponse{
		Status:       "success",
		SessionID:    req.SessionID,
		OriginBus:    req.OriginBus,
		MaxBusesAway: req.N,
		Elements:     elements,
	})
}

// classifyAnalysisError maps an analyzer error to an HTTP status and error code.
//
// A missing/invalid bus is a client input error, not a server fault: it returns
// 400 so callers (and their retry layers) treat it as deterministic and do not
// retry. Genuine solver faults fall through to 500.
func classifyAnalysisError(err error) (int, string) {
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "not found") || strings.Contains(msg, "out of range") {
		return http.StatusBadRequest, "bus_not_found"
	}
	return http.StatusInternalServerError, "analysis_failed"
}

// generateEditSuccessMessage creates a descriptive success message for edit operations
func generateEditSuccessMessage(elementType, action string, identifier map[string]interface{}) string {
	// Capitalize first letter of element type for display
	et := strings.ToLower(elementType)
	elementName := strings.ToUpper(string(et[0])) + et[1:]
	
	// Format action verb
	actionVerb := map[string]string{
		"add":    "added",
		"delete": "deleted",
		"modify": "modified",
	}[strings.ToLower(action)]
	
	if actionVerb == "" {
		actionVerb = action
	}
	
	// Get identifier fields for each element type
	identifierFields := map[string][]string{
		"bus":         {"ibus"},
		"load":        {"ibus", "loadid"},
		"generator":   {"ibus", "machid"},
		"acline":      {"ibus", "jbus", "ckt"},
		"transformer": {"ibus", "jbus", "ckt"},
	}
	
	// Format identifier string
	var identifierParts []string
	
	if fields, ok := identifierFields[et]; ok && identifier != nil {
		for _, field := range fields {
			if val, exists := identifier[field]; exists {
				switch field {
				case "ibus":
					identifierParts = append(identifierParts, fmt.Sprintf("bus %v", formatValue(val)))
				case "jbus":
					identifierParts = append(identifierParts, fmt.Sprintf("to-bus %v", formatValue(val)))
				case "loadid":
					identifierParts = append(identifierParts, fmt.Sprintf("loadid '%v'", formatValue(val)))
				case "machid":
					identifierParts = append(identifierParts, fmt.Sprintf("machid '%v'", formatValue(val)))
				case "ckt":
					identifierParts = append(identifierParts, fmt.Sprintf("ckt '%v'", formatValue(val)))
				default:
					identifierParts = append(identifierParts, fmt.Sprintf("%s=%v", field, formatValue(val)))
				}
			}
		}
	}
	
	if len(identifierParts) > 0 {
		return fmt.Sprintf("%s [%s] has been successfully %s.", elementName, strings.Join(identifierParts, ", "), actionVerb)
	}
	return fmt.Sprintf("%s has been successfully %s.", elementName, actionVerb)
}

// formatValue formats a value for display in messages
func formatValue(val interface{}) string {
	switch v := val.(type) {
	case float64:
		// If it's a whole number, display as int
		if v == float64(int(v)) {
			return fmt.Sprintf("%d", int(v))
		}
		return fmt.Sprintf("%v", v)
	case string:
		return v
	default:
		return fmt.Sprintf("%v", v)
	}
}
