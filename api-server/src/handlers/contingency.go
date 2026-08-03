package handlers

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"api-server/src/auth"
	"api-server/src/services"
	"api-server/src/types"
)

// StartContingencyAnalysis starts an AC contingency analysis run as an async
// job and returns the job id immediately (HTTP 202).
func (h *APIHandler) StartContingencyAnalysis(c *gin.Context) {
	var req types.StartContingencyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid request body"))
		return
	}
	if err := req.Settings.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_settings", err.Error()))
		return
	}

	job, err := h.contingencyService.Start(req.SessionID, req.Settings, req.Config)
	if err != nil {
		msg := err.Error()
		const studyFilesMissingPrefix = "study_files_missing:"
		switch {
		case strings.HasPrefix(msg, studyFilesMissingPrefix):
			// Strip the sentinel; the rest of the message is the human-readable
			// text the agent reads to extract the "Missing: <kinds>." list.
			stripped := strings.TrimSpace(strings.TrimPrefix(msg, studyFilesMissingPrefix))
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("study_files_missing", stripped))
		case strings.Contains(msg, "session") && strings.Contains(msg, "not found"):
			c.JSON(http.StatusNotFound, types.NewErrorResponse("session_not_found", msg))
		case strings.Contains(msg, "already running"):
			c.JSON(http.StatusConflict, types.NewErrorResponse("analysis_in_progress", msg))
		default:
			// Prerequisite not met (no model, .con loaded but empty/unparseable).
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("contingency_not_ready", msg))
		}
		return
	}

	h.logger.Info("Started contingency analysis",
		zap.String("session_id", req.SessionID), zap.String("job_id", job.ID))

	userID, _ := auth.GetUserIDFromContext(c)
	h.eventPublisher.PublishAnalysisStarted(
		req.SessionID,
		userID,
		auth.GetRequestSourceFromContext(c),
		auth.GetRequestIDFromContext(c),
		job.ID,
	)

	c.JSON(http.StatusAccepted, job)
}

// GetAnalysisJob returns an analysis job's status and latest progress.
func (h *APIHandler) GetAnalysisJob(c *gin.Context) {
	job, ok := h.contingencyService.JobService().Get(c.Param("id"))
	if !ok {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("job_not_found", "Analysis job not found"))
		return
	}
	// A completed contingency run's result path is its study result's
	// report.json — surface the study result id so the UI can open it.
	if job.State == services.JobCompleted {
		job.StudyResultID = services.ResultIDFromReportPath(job.ResultPath())
	}
	c.JSON(http.StatusOK, job)
}

// GetAnalysisReport returns a completed analysis job's report.
func (h *APIHandler) GetAnalysisReport(c *gin.Context) {
	job, ok := h.contingencyService.JobService().Get(c.Param("id"))
	if !ok {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("job_not_found", "Analysis job not found"))
		return
	}
	if job.State != services.JobCompleted {
		c.JSON(http.StatusConflict, types.NewErrorResponse("job_not_ready",
			"Analysis is not complete (state: "+string(job.State)+")"))
		return
	}
	data, err := os.ReadFile(job.ResultPath())
	if err != nil {
		h.logger.Error("Analysis report unreadable", zap.String("job_id", job.ID))
		c.JSON(http.StatusInternalServerError,
			types.NewErrorResponse("report_unreadable", "Analysis completed but the report is unreadable"))
		return
	}
	c.Data(http.StatusOK, "application/json", data)
}

// CancelAnalysisJob cancels a running analysis job.
func (h *APIHandler) CancelAnalysisJob(c *gin.Context) {
	err := h.contingencyService.JobService().Cancel(c.Param("id"))
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "not found") {
			c.JSON(http.StatusNotFound, types.NewErrorResponse("job_not_found", msg))
		} else {
			c.JSON(http.StatusConflict, types.NewErrorResponse("job_already_finished", msg))
		}
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Analysis job cancelled"})
}
