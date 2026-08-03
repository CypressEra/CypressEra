package handlers

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"

	"api-server/src/auth"
	"api-server/src/types"
)

// ListStudyResults returns the metadata of the user's stored study results.
func (h *APIHandler) ListStudyResults(c *gin.Context) {
	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}
	results, err := h.studyResultService.List(userID)
	if err != nil {
		h.logger.Error("Failed to list study results", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError,
			types.NewErrorResponse("study_results_unreadable", "Failed to list study results"))
		return
	}
	c.JSON(http.StatusOK, types.StudyResultListResponse{Status: "success", Results: results})
}

// GetStudyResult returns one study result — its metadata and full report.
func (h *APIHandler) GetStudyResult(c *gin.Context) {
	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}
	result, err := h.studyResultService.Get(userID, c.Param("id"))
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, types.NewErrorResponse("study_result_not_found", err.Error()))
			return
		}
		h.logger.Error("Failed to read study result", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("study_result_unreadable", err.Error()))
		return
	}
	c.JSON(http.StatusOK, result)
}

// DeleteStudyResult removes a study result.
func (h *APIHandler) DeleteStudyResult(c *gin.Context) {
	userID, ok := auth.GetUserIDFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Authentication required"))
		return
	}
	if err := h.studyResultService.Delete(userID, c.Param("id")); err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, types.NewErrorResponse("study_result_not_found", err.Error()))
			return
		}
		h.logger.Error("Failed to delete study result", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("study_result_delete_failed", err.Error()))
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "success", "message": "Study result deleted"})
}
