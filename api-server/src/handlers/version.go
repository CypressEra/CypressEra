package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"api-server/src/services"
)

// VersionResponse is the body of GET /api/version.
type VersionResponse struct {
	Version string `json:"version"`
	Build   string `json:"build"`
}

// VersionHandler returns the platform identity this api-server process reports:
// the platform version (resolved once from PLATFORM_VERSION; also stamped onto
// every newly-saved study-result's app_version) and the build channel (resolved
// once from PLATFORM_BUILD, e.g. "development" or "production").
func VersionHandler(c *gin.Context) {
	c.JSON(http.StatusOK, VersionResponse{
		Version: services.PlatformVersion(),
		Build:   services.PlatformBuild(),
	})
}
