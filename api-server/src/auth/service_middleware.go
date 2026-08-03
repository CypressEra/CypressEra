package auth

import (
	"encoding/base64"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"go.uber.org/zap"
)

// ServiceClaims represents the claims in a service token
type ServiceClaims struct {
	Service     string   `json:"service"`
	Permissions []string `json:"permissions,omitempty"`
	UserID      string   `json:"user_id,omitempty"`
	jwt.RegisteredClaims
}

// ServiceAuthMiddleware creates a middleware for service authentication
func ServiceAuthMiddleware(logger *zap.Logger) gin.HandlerFunc {
	secret := os.Getenv("SERVICE_AUTH_SECRET")
	if secret == "" {
		logger.Warn("SERVICE_AUTH_SECRET not set, service authentication disabled")
		return func(c *gin.Context) {
			c.Next()
		}
	}

	return func(c *gin.Context) {
		// Get service token from header
		tokenString := c.GetHeader("X-Service-Token")
		logger.Info("ServiceAuthMiddleware checking token",
			zap.Bool("hasToken", tokenString != ""),
			zap.Int("tokenLength", len(tokenString)))

		if tokenString == "" {
			c.Next()
			return
		}

		// Debug: Log token parts
		parts := strings.Split(tokenString, ".")
		if len(parts) != 3 {
			logger.Warn("Invalid token format", zap.Int("parts", len(parts)))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token format"})
			c.Abort()
			return
		}

		// Decode header and payload for debugging
		headerJSON, _ := base64.RawURLEncoding.DecodeString(parts[0])
		payloadJSON, _ := base64.RawURLEncoding.DecodeString(parts[1])
		logger.Info("Token decoded",
			zap.String("header", string(headerJSON)),
			zap.String("payload", string(payloadJSON)),
			zap.String("signature", parts[2]))

		// Parse and validate token
		token, err := jwt.ParseWithClaims(tokenString, &ServiceClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				logger.Warn("Invalid signing method", zap.String("method", token.Header["alg"].(string)))
				return nil, jwt.ErrSignatureInvalid
			}
			logger.Info("Token parsing - signing method OK", zap.String("alg", "HS256"))
			return []byte(secret), nil
		})

		if err != nil {
			logger.Error("Token parse error",
				zap.Error(err),
				zap.String("errorType", fmt.Sprintf("%T", err)))
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid service token", "detail": err.Error()})
			c.Abort()
			return
		}
		
		if !token.Valid {
			logger.Warn("Token is not valid")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid service token"})
			c.Abort()
			return
		}

		// Extract claims
		claims, ok := token.Claims.(*ServiceClaims)
		if !ok {
			logger.Warn("Invalid service token claims")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid claims"})
			c.Abort()
			return
		}

		// Set service context
		c.Set("is_service", true)
		c.Set("service_name", claims.Service)
		c.Set("service_permissions", claims.Permissions)

		// Check if user_id is in claims (for headless mode)
		if claims.UserID != "" {
			c.Set("user_id", claims.UserID)
		}

		logger.Info("Service authenticated",
			zap.String("service", claims.Service),
			zap.Strings("permissions", claims.Permissions),
			zap.String("user_id", claims.UserID))

		c.Next()
	}
}

// IsServiceCall checks if the current request is a service call
func IsServiceCall(c *gin.Context) bool {
	isService, exists := c.Get("is_service")
	return exists && isService.(bool)
}

// Request-source / request-id helpers used by handlers that publish
// invalidation events. Source distinguishes who caused the mutation; clients
// (the UI) use it to skip refetches for changes they themselves initiated.
//
// Source values:
//   "ui"     — request authenticated via a user JWT (the default case)
//   "agent"  — request authenticated via the agent-server's service token
//   "system" — background workers that don't have a request context; callers
//              must pass this value explicitly (e.g. JobService.finish).

// GetRequestSourceFromContext returns the source for the current request:
// "agent" for service-token calls, "ui" otherwise (defensive default —
// most callers in this codebase are UI-driven).
func GetRequestSourceFromContext(c *gin.Context) string {
	if IsServiceCall(c) {
		return "agent"
	}
	return "ui"
}

// GetRequestIDFromContext returns the client-supplied X-Request-Id, or "" if
// the request didn't include one. Used to echo into the event payload so the
// UI can skip refetches for its own optimistic writes.
func GetRequestIDFromContext(c *gin.Context) string {
	if v, ok := c.Get("request_id"); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

// RequestIDMiddleware stashes the incoming X-Request-Id header on the gin
// context. Cheap, always-on, optional for callers — its absence is handled
// gracefully by GetRequestIDFromContext.
func RequestIDMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if id := c.GetHeader("X-Request-Id"); id != "" {
			c.Set("request_id", id)
		}
		c.Next()
	}
}

// GetServiceName returns the service name from context
func GetServiceName(c *gin.Context) string {
	if serviceName, exists := c.Get("service_name"); exists {
		return serviceName.(string)
	}
	return ""
}

// GetServicePermissions returns the service permissions from context
func GetServicePermissions(c *gin.Context) []string {
	if permissions, exists := c.Get("service_permissions"); exists {
		return permissions.([]string)
	}
	return nil
}

// HasServicePermission checks if the service has a specific permission
func HasServicePermission(c *gin.Context, permission string) bool {
	permissions := GetServicePermissions(c)
	for _, p := range permissions {
		if p == permission || p == "*" {
			return true
		}
	}
	return false
}

// GenerateServiceToken generates a service token (for testing purposes)
func GenerateServiceToken(service string, permissions []string, userID string, secret string) (string, error) {
	now := time.Now()
	claims := ServiceClaims{
		Service:     service,
		Permissions: permissions,
		UserID:      userID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(1 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// RequireServiceAuth creates a middleware that requires service authentication
func RequireServiceAuth(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !IsServiceCall(c) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "service authentication required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// RequireServicePermission creates a middleware that requires a specific permission
func RequireServicePermission(permission string, logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !IsServiceCall(c) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "service authentication required"})
			c.Abort()
			return
		}

		if !HasServicePermission(c, permission) {
			logger.Warn("Service lacks required permission",
				zap.String("service", GetServiceName(c)),
				zap.String("required_permission", permission))
			c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
			c.Abort()
			return
		}

		c.Next()
	}
}

// OptionalServiceAuth creates a middleware that optionally extracts service info
func OptionalServiceAuth(logger *zap.Logger) gin.HandlerFunc {
	return ServiceAuthMiddleware(logger)
}

// GetUserIDFromContextOrService gets user ID from either regular auth or service auth
func GetUserIDFromContextOrService(c *gin.Context) string {
	// First check if it's a regular user
	if userID, ok := GetUserIDFromContext(c); ok {
		return userID
	}

	// Then check if it's a service call with user context
	if IsServiceCall(c) {
		if userID, exists := c.Get("user_id"); exists {
			return userID.(string)
		}
	}

	return ""
}

// GetAuthType returns the type of authentication used
func GetAuthType(c *gin.Context) string {
	if IsServiceCall(c) {
		return "service"
	}
	if _, ok := GetUserIDFromContext(c); ok {
		return "user"
	}
	return "none"
}

// AuthInfo represents authentication information
type AuthInfo struct {
	Type        string
	UserID      string
	ServiceName string
	Permissions []string
}

// GetAuthInfo returns all authentication information
func GetAuthInfo(c *gin.Context) *AuthInfo {
	info := &AuthInfo{
		Type: GetAuthType(c),
	}

	if info.Type == "user" {
		info.UserID, _ = GetUserIDFromContext(c)
	} else if info.Type == "service" {
		info.ServiceName = GetServiceName(c)
		info.Permissions = GetServicePermissions(c)
		info.UserID = GetUserIDFromContextOrService(c)
	}

	return info
}
