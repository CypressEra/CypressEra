package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"api-server/src/types"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"
)

// Context keys for authenticated user information.
const (
	ContextUserIDKey    = "authUserID"
	ContextUserEmailKey = "authUserEmail"
	ContextUserRoleKey  = "authUserRole"
)

// User represents an authenticated user account stored in PostgreSQL.
type User struct {
	ID            string
	Email         string
	PasswordHash  string
	Role          string
	EmailVerified bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// Claims represents JWT claims for authenticated users.
type Claims struct {
	UserID string `json:"uid"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// Service manages authentication, user persistence, and JWTs.
type Service struct {
	mode               Mode
	db                 *pgxpool.Pool
	secret             []byte
	accessTTL          time.Duration
	refreshTTL         time.Duration
	refreshEnabled     bool
	logger             *zap.Logger
	mailgunDomain      string
	mailgunAPIKey      string
	mailgunFrom        string
	googleClientID     string
	googleClientSecret string
}

// NewService initializes the auth service, runs migrations, and optionally seeds an admin user.
// In ModeNone db must be nil: no migrations run, no admin is seeded, and only
// the db-free surface (token issuance/validation, config reporting) is usable.
func NewService(db *pgxpool.Pool, logger *zap.Logger) (*Service, error) {
	mode, err := ModeFromEnv()
	if err != nil {
		return nil, err
	}
	secret := os.Getenv("AUTH_JWT_SECRET")
	if strings.TrimSpace(secret) == "" {
		// For production deployments this MUST be overridden via environment/secret management.
		secret = "change-this-secret-in-prod"
		logger.Warn("AUTH_JWT_SECRET not set, using insecure default. Override this in production.")
	}

	// Access-token TTL: AUTH_ACCESS_TTL_MINUTES wins; AUTH_TOKEN_TTL_HOURS is honored
	// for one release cycle with a deprecation warning; default 15 min.
	accessTTLMinutes := 15
	if v := os.Getenv("AUTH_ACCESS_TTL_MINUTES"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			accessTTLMinutes = parsed
		}
	} else if v := os.Getenv("AUTH_TOKEN_TTL_HOURS"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			accessTTLMinutes = parsed * 60
			logger.Warn("AUTH_TOKEN_TTL_HOURS is deprecated; use AUTH_ACCESS_TTL_MINUTES instead",
				zap.Int("applied_minutes", accessTTLMinutes))
		}
	}

	refreshTTLDays := 30
	if v := os.Getenv("AUTH_REFRESH_TTL_DAYS"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 {
			refreshTTLDays = parsed
		}
	}

	refreshEnabled := false
	if v := strings.TrimSpace(strings.ToLower(os.Getenv("AUTH_REFRESH_ENABLED"))); v == "true" || v == "1" || v == "yes" {
		refreshEnabled = true
	}

	mailgunDomain := strings.TrimSpace(os.Getenv("MAILGUN_DOMAIN"))
	mailgunAPIKey := strings.TrimSpace(os.Getenv("MAILGUN_API_KEY"))
	mailgunFrom := strings.TrimSpace(os.Getenv("MAILGUN_FROM"))
	if mailgunDomain == "" || mailgunAPIKey == "" {
		logger.Warn("Mailgun not fully configured. Set MAILGUN_DOMAIN and MAILGUN_API_KEY to enable email verification.")
	}
	if mailgunFrom == "" && mailgunDomain != "" {
		mailgunFrom = fmt.Sprintf("CypressEra <no-reply@%s>", mailgunDomain)
	}

	googleClientID := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
	googleClientSecret := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_SECRET"))
	if googleClientID == "" || googleClientSecret == "" {
		logger.Warn("Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable Google sign-in.")
	}

	svc := &Service{
		mode:               mode,
		db:                 db,
		secret:             []byte(secret),
		accessTTL:          time.Duration(accessTTLMinutes) * time.Minute,
		refreshTTL:         time.Duration(refreshTTLDays) * 24 * time.Hour,
		refreshEnabled:     refreshEnabled,
		logger:             logger,
		mailgunDomain:      mailgunDomain,
		mailgunAPIKey:      mailgunAPIKey,
		mailgunFrom:        mailgunFrom,
		googleClientID:     googleClientID,
		googleClientSecret: googleClientSecret,
	}

	if mode == ModeNone {
		// No database: skip migrations and admin seeding. Long-lived access
		// tokens replace the refresh-token flow entirely.
		svc.accessTTL = noneModeAccessTTL
		svc.refreshEnabled = false
		return svc, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := svc.migrate(ctx); err != nil {
		return nil, fmt.Errorf("auth migration failed: %w", err)
	}

	if err := svc.ensureAdminUser(ctx); err != nil {
		// Log but don't block server startup – admin can be created later if needed.
		logger.Warn("Failed to ensure admin user", zap.Error(err))
	}

	return svc, nil
}

// Mode reports the authentication operating mode.
func (s *Service) Mode() Mode {
	return s.mode
}

// GoogleEnabled reports whether Google OAuth sign-in is configured.
func (s *Service) GoogleEnabled() bool {
	return s.googleClientID != "" && s.googleClientSecret != ""
}

// EmailVerificationEnabled reports whether Mailgun is configured, which gates
// the registration verification-email flow. When false, new registrations are
// auto-verified.
func (s *Service) EmailVerificationEnabled() bool {
	return s.mailgunDomain != "" && s.mailgunAPIKey != ""
}

// migrate creates the users table and required extensions if they do not exist.
func (s *Service) migrate(ctx context.Context) error {
	// Enable UUID generation (safe to run repeatedly).
	// pgcrypto + gen_random_uuid() is the modern default on Postgres.
	if _, err := s.db.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`); err != nil {
		return fmt.Errorf("create pgcrypto extension: %w", err)
	}

	createTableSQL := `
CREATE TABLE IF NOT EXISTS users (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	email TEXT NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	role TEXT NOT NULL DEFAULT 'user',
	email_verified BOOLEAN NOT NULL DEFAULT FALSE,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`

	if _, err := s.db.Exec(ctx, createTableSQL); err != nil {
		return fmt.Errorf("create users table: %w", err)
	}

	// Ensure email_verified column exists on older databases.
	if _, err := s.db.Exec(ctx, `
ALTER TABLE users
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;`); err != nil {
		return fmt.Errorf("ensure email_verified column: %w", err)
	}

	// Email verification tokens table.
	if _, err := s.db.Exec(ctx, `
CREATE TABLE IF NOT EXISTS email_verification_tokens (
	token TEXT PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at TIMESTAMPTZ NOT NULL,
	used_at TIMESTAMPTZ,
	passcode TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`); err != nil {
		return fmt.Errorf("create email_verification_tokens table: %w", err)
	}

	// Ensure passcode column exists on older databases.
	if _, err := s.db.Exec(ctx, `
ALTER TABLE email_verification_tokens
ADD COLUMN IF NOT EXISTS passcode TEXT NOT NULL DEFAULT '';`); err != nil {
		return fmt.Errorf("ensure passcode column: %w", err)
	}

	// Ensure created_at column exists on older databases.
	if _, err := s.db.Exec(ctx, `
ALTER TABLE email_verification_tokens
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`); err != nil {
		return fmt.Errorf("ensure created_at column: %w", err)
	}

	// Password reset tokens table.
	if _, err := s.db.Exec(ctx, `
CREATE TABLE IF NOT EXISTS password_reset_tokens (
	token TEXT PRIMARY KEY,
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	expires_at TIMESTAMPTZ NOT NULL,
	used_at TIMESTAMPTZ,
	passcode TEXT NOT NULL DEFAULT '',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`); err != nil {
		return fmt.Errorf("create password_reset_tokens table: %w", err)
	}

	// Ensure passcode column exists on older databases.
	if _, err := s.db.Exec(ctx, `
ALTER TABLE password_reset_tokens
ADD COLUMN IF NOT EXISTS passcode TEXT NOT NULL DEFAULT '';`); err != nil {
		return fmt.Errorf("ensure passcode column for password_reset_tokens: %w", err)
	}

	// Ensure created_at column exists on older databases.
	if _, err := s.db.Exec(ctx, `
ALTER TABLE password_reset_tokens
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`); err != nil {
		return fmt.Errorf("ensure created_at column for password_reset_tokens: %w", err)
	}

	// Refresh tokens table. Stores SHA-256 hashes of opaque refresh tokens issued
	// to clients; the plaintext value never persists server-side. Rotation marks
	// the old row revoked and links to its successor via replaced_by_id so a
	// reuse of a revoked token can burn the whole chain.
	if _, err := s.db.Exec(ctx, `
CREATE TABLE IF NOT EXISTS refresh_tokens (
	id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
	user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	token_hash BYTEA NOT NULL UNIQUE,
	expires_at TIMESTAMPTZ NOT NULL,
	revoked_at TIMESTAMPTZ,
	replaced_by_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
	user_agent TEXT,
	ip INET,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`); err != nil {
		return fmt.Errorf("create refresh_tokens table: %w", err)
	}

	if _, err := s.db.Exec(ctx, `CREATE INDEX IF NOT EXISTS refresh_tokens_user_id_idx ON refresh_tokens (user_id);`); err != nil {
		return fmt.Errorf("create refresh_tokens user_id index: %w", err)
	}

	// token_hash already has a UNIQUE constraint which gives an index; no extra index needed.

	return nil
}

// ensureAdminUser creates a default admin user for development/testing if configured.
func (s *Service) ensureAdminUser(ctx context.Context) error {
	email := strings.TrimSpace(os.Getenv("AUTH_ADMIN_EMAIL"))
	password := os.Getenv("AUTH_ADMIN_PASSWORD")

	if email == "" || password == "" {
		// Admin seeding not configured – nothing to do.
		return nil
	}

	// Check if the admin user already exists.
	var existingID string
	err := s.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&existingID)
	if err == nil && existingID != "" {
		s.logger.Info("Admin user already exists", zap.String("email", email))
		return nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return fmt.Errorf("query admin user: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}

	_, err = s.db.Exec(ctx,
		`INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, 'admin', TRUE)`,
		email, string(hash),
	)
	if err != nil {
		return fmt.Errorf("insert admin user: %w", err)
	}

	s.logger.Info("Seeded admin user",
		zap.String("email", email),
		zap.String("role", "admin"))
	return nil
}

// FindByEmail returns a user by email or ErrNoRows if not found.
func (s *Service) FindByEmail(ctx context.Context, email string) (*User, error) {
	row := s.db.QueryRow(ctx, `
SELECT id, email, password_hash, role, email_verified, created_at, updated_at
FROM users
WHERE email = $1
`, email)

	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

// Authenticate verifies the user's credentials and returns the matching user on success.
func (s *Service) Authenticate(ctx context.Context, email, password string) (*User, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return nil, errors.New("email and password are required")
	}

	u, err := s.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("invalid email or password")
		}
		return nil, fmt.Errorf("lookup user: %w", err)
	}

	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return nil, errors.New("invalid email or password")
	}

	// Admin users can skip email verification
	if !u.EmailVerified && u.Role != "admin" {
		return nil, errors.New("email_not_verified")
	}

	return u, nil
}

// RefreshEnabled reports whether refresh-token issuance/endpoints are turned on.
func (s *Service) RefreshEnabled() bool {
	return s.refreshEnabled
}

// GenerateToken issues a signed JWT for the given user and returns the token string and expiry time.
func (s *Service) GenerateToken(user *User) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(s.accessTTL)

	claims := &Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user.ID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(s.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign jwt: %w", err)
	}

	return signed, exp, nil
}

// ParseToken parses and validates a JWT, returning the Claims on success.
func (s *Service) ParseToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %T", token.Method)
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

// Handler exposes HTTP endpoints for authentication.
type Handler struct {
	service       *Service
	logger        *zap.Logger
	onUserCreated func(userID string) // called after a new user is created (e.g., to seed default files)
}

// NewHandler creates a new auth HTTP handler.
func NewHandler(service *Service, logger *zap.Logger) *Handler {
	return &Handler{
		service: service,
		logger:  logger,
	}
}

// SetOnUserCreated registers a callback invoked after a new user is created.
func (h *Handler) SetOnUserCreated(fn func(userID string)) {
	h.onUserCreated = fn
}

// LoginRequest represents the payload for the login endpoint.
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// LoginResponse represents the response from the login endpoint.
// RefreshToken is omitted entirely when AUTH_REFRESH_ENABLED is false so
// legacy clients see the original shape.
type LoginResponse struct {
	AccessToken  string        `json:"access_token"`
	TokenType    string        `json:"token_type"`
	ExpiresIn    int64         `json:"expires_in"` // seconds
	RefreshToken string        `json:"refresh_token,omitempty"`
	User         LoginUserInfo `json:"user"`
}

// LoginUserInfo is a minimal user representation returned from the auth API.
type LoginUserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// Login handles POST /api/v1/auth/login
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid login request", zap.Error(err))
		c.JSON(400, types.NewErrorResponse("invalid_request", "Invalid login payload"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	user, err := h.service.Authenticate(ctx, req.Email, req.Password)
	if err != nil {
		h.logger.Warn("Authentication failed", zap.String("email", req.Email), zap.Error(err))
		if err.Error() == "email_not_verified" {
			c.JSON(403, types.NewErrorResponse("email_not_verified", "Please verify your email address before signing in. Check your inbox for a verification link."))
		} else {
			c.JSON(401, types.NewErrorResponse("invalid_credentials", "Invalid email or password"))
		}
		return
	}

	token, exp, err := h.service.GenerateToken(user)
	if err != nil {
		h.logger.Error("Failed to generate JWT", zap.Error(err))
		c.JSON(500, types.NewErrorResponse("token_generation_failed", "Failed to generate access token"))
		return
	}

	resp := h.buildLoginResponse(c, user, token, exp)
	c.JSON(200, resp)
}

// buildLoginResponse fills the LoginResponse and, when refresh is enabled,
// issues a refresh token alongside the access JWT. Failure to issue a refresh
// token is logged but does not fail the login — the access token is still
// returned so the user gets in.
func (h *Handler) buildLoginResponse(c *gin.Context, user *User, accessToken string, accessExp time.Time) LoginResponse {
	expiresIn := int64(time.Until(accessExp).Seconds())
	if expiresIn < 0 {
		expiresIn = 0
	}

	resp := LoginResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   expiresIn,
		User: LoginUserInfo{
			ID:    user.ID,
			Email: user.Email,
			Role:  user.Role,
		},
	}

	if h.service.RefreshEnabled() {
		userAgent := c.Request.UserAgent()
		ip := c.ClientIP()
		refresh, _, err := h.service.GenerateRefreshToken(c.Request.Context(), user.ID, userAgent, ip)
		if err != nil {
			h.logger.Error("Failed to issue refresh token",
				zap.String("user_id", user.ID),
				zap.Error(err))
		} else {
			resp.RefreshToken = refresh
		}
	}

	return resp
}

// GinAuthMiddleware returns a Gin middleware that enforces JWT-based authentication.
// Allows service calls (with X-Service-Token) to bypass JWT verification.
func (s *Service) GinAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Check if this is a service call (authenticated via X-Service-Token)
		if IsServiceCall(c) {
			// Service call - already authenticated by ServiceAuthMiddleware
			// The user_id is already set in context if provided in the service token
			c.Next()
			return
		}

		// Regular user authentication via JWT
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			c.AbortWithStatusJSON(401, types.NewErrorResponse("unauthorized", "Missing or invalid Authorization header"))
			return
		}

		tokenStr := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer"))
		if tokenStr == "" {
			c.AbortWithStatusJSON(401, types.NewErrorResponse("unauthorized", "Missing access token"))
			return
		}

		claims, err := s.ParseToken(tokenStr)
		if err != nil {
			s.logger.Warn("Failed to parse JWT", zap.Error(err))
			c.AbortWithStatusJSON(401, types.NewErrorResponse("unauthorized", "Invalid or expired access token"))
			return
		}

		// Attach user information to context for downstream handlers.
		c.Set(ContextUserIDKey, claims.UserID)
		c.Set(ContextUserEmailKey, claims.Email)
		c.Set(ContextUserRoleKey, claims.Role)

		c.Next()
	}
}

// GetUserIDFromContext returns the current authenticated user ID (UUID string) from Gin context.
func GetUserIDFromContext(c *gin.Context) (string, bool) {
	if v, ok := c.Get(ContextUserIDKey); ok {
		if id, ok := v.(string); ok && id != "" {
			return id, true
		}
	}
	return "", false
}

// GetUserEmailFromContext returns the current authenticated user's email from Gin context.
func GetUserEmailFromContext(c *gin.Context) (string, bool) {
	if v, ok := c.Get(ContextUserEmailKey); ok {
		if email, ok := v.(string); ok && email != "" {
			return email, true
		}
	}
	return "", false
}

// RegisterRequest represents the payload for the registration endpoint.
type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=8"`
}

// RegisterResponse represents the response from the registration endpoint.
type RegisterResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// VerifyEmailResponse represents the JSON response for email verification.
type VerifyEmailResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// Register handles POST /api/v1/auth/register
func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid register request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid registration payload"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	userID, err := h.service.RegisterAndSendVerification(ctx, strings.TrimSpace(strings.ToLower(req.Email)), req.Password)
		if err != nil {
		h.logger.Warn("Registration failed", zap.String("email", req.Email), zap.Error(err))
		errStr := err.Error()
		exposeDetails := strings.TrimSpace(strings.ToLower(os.Getenv("GIN_MODE"))) != "release"

		if strings.Contains(errStr, "already_registered") {
			c.JSON(http.StatusConflict, types.NewErrorResponse("email_already_registered", "This email is already registered"))
			return
		}
		if strings.Contains(errStr, "mailgun_not_configured") {
			c.JSON(http.StatusServiceUnavailable, types.NewErrorResponse("email_not_configured", "Email service is not configured. Please contact support."))
			return
		}
		if strings.Contains(errStr, "mailgun_send_failed") {
			msg := "Failed to send verification email. Please verify MAILGUN_DOMAIN, MAILGUN_API_KEY, and that your recipient is authorized (Mailgun sandbox)."
			if exposeDetails {
				msg = msg + " (" + errStr + ")"
			}
			c.JSON(http.StatusBadGateway, types.NewErrorResponse("email_send_failed", msg))
			return
		}
		if strings.Contains(strings.ToLower(errStr), "duplicate key value") || strings.Contains(strings.ToLower(errStr), "unique constraint") {
			c.JSON(http.StatusConflict, types.NewErrorResponse("email_already_registered", "This email is already registered"))
			return
		}

		msg := "Registration failed"
		if exposeDetails {
			msg = msg + " (" + errStr + ")"
		}
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("registration_failed", msg))
		return
	}

	// Seed default study case files for the new user (non-blocking).
	if h.onUserCreated != nil && userID != "" {
		go h.onUserCreated(userID)
	}

	message := "Registration successful. Please check your email for a verification link."
	if !h.service.EmailVerificationEnabled() {
		message = "Registration successful. Your account is ready — you can sign in now."
	}
	c.JSON(http.StatusOK, RegisterResponse{
		Status:  "success",
		Message: message,
	})
}

// AuthConfigResponse reports which authentication features are active so the
// frontend can adapt (hide the Google button, skip login entirely, ...).
type AuthConfigResponse struct {
	Mode                     string `json:"mode"`
	GoogleEnabled            bool   `json:"google_enabled"`
	EmailVerificationEnabled bool   `json:"email_verification_enabled"`
}

// AuthConfig handles GET /api/v1/auth/config (unauthenticated, all modes).
// In ModeNone the Google/email features are reported false regardless of
// configured credentials: their endpoints are not mounted in that mode.
func (h *Handler) AuthConfig(c *gin.Context) {
	noAuth := h.service.Mode() == ModeNone
	c.JSON(http.StatusOK, AuthConfigResponse{
		Mode:                     string(h.service.Mode()),
		GoogleEnabled:            !noAuth && h.service.GoogleEnabled(),
		EmailVerificationEnabled: !noAuth && h.service.EmailVerificationEnabled(),
	})
}

// Session handles POST /api/v1/auth/session (unauthenticated, mounted only in
// ModeNone). It issues a standard access JWT for the synthetic single user, so
// every downstream JWT consumer — GinAuthMiddleware, the WebSocket upgrade,
// agent-server — works unchanged. No refresh token is issued; clients simply
// call this endpoint again when a token expires.
func (h *Handler) Session(c *gin.Context) {
	user := &User{
		ID:    SyntheticUserID,
		Email: SyntheticUserEmail,
		Role:  SyntheticUserRole,
	}

	token, exp, err := h.service.GenerateToken(user)
	if err != nil {
		h.logger.Error("Failed to generate session JWT", zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("token_generation_failed", "Failed to generate access token"))
		return
	}

	c.JSON(http.StatusOK, LoginResponse{
		AccessToken: token,
		TokenType:   "Bearer",
		ExpiresIn:   int64(time.Until(exp).Seconds()),
		User: LoginUserInfo{
			ID:    user.ID,
			Email: user.Email,
			Role:  user.Role,
		},
	})
}

// VerifyEmail handles GET /api/v1/auth/verify-email
func (h *Handler) VerifyEmail(c *gin.Context) {
	token := strings.TrimSpace(c.Query("token"))
	if token == "" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Missing token"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := h.service.VerifyEmailToken(ctx, token); err != nil {
		h.logger.Warn("Email verification failed", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("verification_failed", "Invalid or expired verification link"))
		return
	}

	// Optional redirect back to frontend app for a nicer UX.
	if redirect := strings.TrimSpace(c.Query("redirect")); redirect != "" {
		c.Redirect(http.StatusFound, redirect)
		return
	}

	// Simple JSON response – frontend can display a friendly page if desired.
	c.JSON(http.StatusOK, VerifyEmailResponse{
		Status:  "success",
		Message: "Email verified successfully. You can now sign in.",
	})
}

// VerifyPasscodeRequest represents the payload for the passcode verification endpoint.
type VerifyPasscodeRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Passcode string `json:"passcode" binding:"required,len=6"`
}

// VerifyPasscode handles POST /api/v1/auth/verify-passcode
func (h *Handler) VerifyPasscode(c *gin.Context) {
	var req VerifyPasscodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid verify passcode request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid payload. Email and 6-digit passcode are required."))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := h.service.VerifyPasscode(ctx, strings.TrimSpace(strings.ToLower(req.Email)), req.Passcode); err != nil {
		h.logger.Warn("Passcode verification failed", zap.String("email", req.Email), zap.Error(err))
		errStr := err.Error()
		if strings.Contains(errStr, "invalid_passcode") {
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_passcode", "Invalid or expired verification code"))
		} else if strings.Contains(errStr, "user_not_found") {
			c.JSON(http.StatusNotFound, types.NewErrorResponse("user_not_found", "No account found with this email"))
		} else {
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("verification_failed", "Verification failed"))
		}
		return
	}

	c.JSON(http.StatusOK, VerifyEmailResponse{
		Status:  "success",
		Message: "Email verified successfully. You can now sign in.",
	})
}

// ForgotPasswordRequest represents the payload for the forgot password endpoint.
type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

// ForgotPassword handles POST /api/v1/auth/forgot-password
func (h *Handler) ForgotPassword(c *gin.Context) {
	var req ForgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid forgot password request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Valid email is required"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := h.service.RequestPasswordReset(ctx, strings.TrimSpace(strings.ToLower(req.Email))); err != nil {
		h.logger.Warn("Password reset request failed", zap.String("email", req.Email), zap.Error(err))
		// Don't reveal errors - always return success for security
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "If an account with that email exists, a password reset code has been sent.",
	})
}

// ResetPasswordRequest represents the payload for the reset password endpoint.
type ResetPasswordRequest struct {
	Email       string `json:"email" binding:"required,email"`
	Passcode    string `json:"passcode" binding:"required,len=6"`
	NewPassword string `json:"newPassword" binding:"required,min=8"`
}

// ResetPassword handles POST /api/v1/auth/reset-password
func (h *Handler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid reset password request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Valid email, 6-digit passcode, and new password (min 8 chars) are required"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := h.service.ResetPasswordWithPasscode(ctx, strings.TrimSpace(strings.ToLower(req.Email)), req.Passcode, req.NewPassword); err != nil {
		h.logger.Warn("Password reset failed", zap.String("email", req.Email), zap.Error(err))
		errStr := err.Error()
		if strings.Contains(errStr, "invalid_passcode") {
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_passcode", "Invalid or expired reset code"))
		} else if strings.Contains(errStr, "passcode_expired") {
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("passcode_expired", "Reset code has expired. Please request a new one."))
		} else if strings.Contains(errStr, "passcode_already_used") {
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("passcode_used", "This reset code has already been used"))
		} else {
			c.JSON(http.StatusBadRequest, types.NewErrorResponse("reset_failed", "Password reset failed"))
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":  "success",
		"message": "Password reset successfully. You can now sign in with your new password.",
	})
}

// RegisterAndSendVerification creates a new user (if not existing) and sends a verification email.
// Returns the user ID on success.
func (s *Service) RegisterAndSendVerification(ctx context.Context, email, password string) (string, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || password == "" {
		return "", errors.New("email and password are required")
	}

	// Check if user already exists.
	var existingID string
	var existingVerified bool
	err := s.db.QueryRow(ctx, `SELECT id, email_verified FROM users WHERE email = $1`, email).Scan(&existingID, &existingVerified)
	if err == nil {
		if existingVerified {
			return "", fmt.Errorf("already_registered")
		}
		// If exists but not verified, we'll reuse the user and just send a new token.
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("lookup user: %w", err)
	}

	// Without Mailgun there is no way to prove address ownership: accounts
	// are created pre-verified and immediately usable, and existing emails
	// (verified or not) are simply taken.
	if !s.EmailVerificationEnabled() {
		if existingID != "" {
			return "", fmt.Errorf("already_registered")
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return "", fmt.Errorf("hash password: %w", err)
		}
		if err := s.db.QueryRow(ctx,
			`INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, 'user', TRUE) RETURNING id`,
			email, string(hash),
		).Scan(&existingID); err != nil {
			return "", fmt.Errorf("insert user: %w", err)
		}
		return existingID, nil
	}

	isNewUser := existingID == ""

	// Create user if it doesn't exist.
	if isNewUser {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return "", fmt.Errorf("hash password: %w", err)
		}
		if err := s.db.QueryRow(ctx,
			`INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, 'user', FALSE) RETURNING id`,
			email, string(hash),
		).Scan(&existingID); err != nil {
			return "", fmt.Errorf("insert user: %w", err)
		}
	}

	// Create a new verification token.
	_, passcode, err := s.createVerificationToken(ctx, existingID)
	if err != nil {
		return "", err
	}

	// Send verification email via Mailgun.
	if err := s.sendVerificationEmail(ctx, email, passcode); err != nil {
		return "", err
	}

	return existingID, nil
}

// createVerificationToken creates and stores a new email verification token with a 6-digit passcode.
func (s *Service) createVerificationToken(ctx context.Context, userID string) (token string, passcode string, err error) {
	// Generate a random token.
	buf := make([]byte, 32)
	if _, randErr := rand.Read(buf); randErr != nil {
		return "", "", fmt.Errorf("generate token: %w", randErr)
	}
	token = hex.EncodeToString(buf)

	// Generate a 6-digit passcode.
	passcodeBuf := make([]byte, 3)
	if _, randErr := rand.Read(passcodeBuf); randErr != nil {
		return "", "", fmt.Errorf("generate passcode: %w", randErr)
	}
	// Convert to a number between 0 and 999999, then format as 6 digits.
	passcodeNum := int(passcodeBuf[0])<<16 | int(passcodeBuf[1])<<8 | int(passcodeBuf[2])
	passcode = fmt.Sprintf("%06d", passcodeNum%1000000)

	expiresAt := time.Now().Add(48 * time.Hour)

	if _, execErr := s.db.Exec(ctx,
		`INSERT INTO email_verification_tokens (token, user_id, expires_at, used_at, passcode) VALUES ($1, $2, $3, NULL, $4)
ON CONFLICT (token) DO NOTHING`,
		token, userID, expiresAt, passcode,
	); execErr != nil {
		return "", "", fmt.Errorf("insert verification token: %w", execErr)
	}

	return token, passcode, nil
}

// sendVerificationEmail sends an email containing the verification passcode via Mailgun.
func (s *Service) sendVerificationEmail(ctx context.Context, email, passcode string) error {
	if s.mailgunDomain == "" || s.mailgunAPIKey == "" || s.mailgunFrom == "" {
		return fmt.Errorf("mailgun_not_configured")
	}

	form := url.Values{}
	form.Set("from", s.mailgunFrom)
	form.Set("to", email)
	form.Set("subject", "Verify your CypressEra account")
	form.Set("text", fmt.Sprintf(`Welcome to CypressEra!

Please verify your email address by entering the following passcode in the app:

Verification Code: %s

If you did not sign up, you can ignore this email.`, passcode))

	endpoint := fmt.Sprintf("https://api.mailgun.net/v3/%s/messages", s.mailgunDomain)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("create mailgun request: %w", err)
	}
	req.SetBasicAuth("api", s.mailgunAPIKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send mailgun request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("mailgun_send_failed status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	return nil
}

// VerifyEmailToken verifies the email associated with the given token.
func (s *Service) VerifyEmailToken(ctx context.Context, token string) error {
	var userID string
	var expiresAt time.Time
	var usedAt *time.Time

	err := s.db.QueryRow(ctx, `
SELECT user_id, expires_at, used_at
FROM email_verification_tokens
WHERE token = $1
`, token).Scan(&userID, &expiresAt, &usedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("token_not_found")
		}
		return fmt.Errorf("lookup_token: %w", err)
	}

	if usedAt != nil {
		return fmt.Errorf("token_already_used")
	}

	if time.Now().After(expiresAt) {
		return fmt.Errorf("token_expired")
	}

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin_tx: %w", err)
	}
	defer tx.Rollback(ctx)

	now := time.Now()
	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, userID); err != nil {
		return fmt.Errorf("update_user: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE email_verification_tokens SET used_at = $1 WHERE token = $2`, now, token); err != nil {
		return fmt.Errorf("update_token: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit_tx: %w", err)
	}

	return nil
}

// VerifyPasscode verifies the email using a 6-digit passcode.
func (s *Service) VerifyPasscode(ctx context.Context, email, passcode string) error {
	// Find user by email
	var userID string
	err := s.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("user_not_found")
		}
		return fmt.Errorf("lookup_user: %w", err)
	}

	// Find valid passcode for this user
	var token string
	var expiresAt time.Time
	var usedAt *time.Time

	err = s.db.QueryRow(ctx, `
SELECT token, expires_at, used_at
FROM email_verification_tokens
WHERE user_id = $1 AND passcode = $2
ORDER BY created_at DESC NULLS LAST
LIMIT 1
`, userID, passcode).Scan(&token, &expiresAt, &usedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("invalid_passcode")
		}
		return fmt.Errorf("lookup_passcode: %w", err)
	}

	if usedAt != nil {
		return fmt.Errorf("passcode_already_used")
	}

	if time.Now().After(expiresAt) {
		return fmt.Errorf("passcode_expired")
	}

	// Mark email as verified
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin_tx: %w", err)
	}
	defer tx.Rollback(ctx)

	now := time.Now()
	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, userID); err != nil {
		return fmt.Errorf("update_user: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE email_verification_tokens SET used_at = $1 WHERE token = $2`, now, token); err != nil {
		return fmt.Errorf("update_token: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit_tx: %w", err)
	}

	return nil
}

// RequestPasswordReset creates a reset token and sends a reset email.
func (s *Service) RequestPasswordReset(ctx context.Context, email string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return errors.New("email is required")
	}

	// Find user by email
	var userID string
	err := s.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Don't reveal whether email exists - just return success
			return nil
		}
		return fmt.Errorf("lookup_user: %w", err)
	}

	// Create reset token and passcode
	_, passcode, err := s.createPasswordResetToken(ctx, userID)
	if err != nil {
		return err
	}

	// Send reset email
	return s.sendPasswordResetEmail(ctx, email, passcode)
}

// createPasswordResetToken creates and stores a new password reset token with a 6-digit passcode.
func (s *Service) createPasswordResetToken(ctx context.Context, userID string) (token string, passcode string, err error) {
	// Generate a random token
	buf := make([]byte, 32)
	if _, randErr := rand.Read(buf); randErr != nil {
		return "", "", fmt.Errorf("generate token: %w", randErr)
	}
	token = hex.EncodeToString(buf)

	// Generate a 6-digit passcode
	passcodeBuf := make([]byte, 3)
	if _, randErr := rand.Read(passcodeBuf); randErr != nil {
		return "", "", fmt.Errorf("generate passcode: %w", randErr)
	}
	passcodeNum := int(passcodeBuf[0])<<16 | int(passcodeBuf[1])<<8 | int(passcodeBuf[2])
	passcode = fmt.Sprintf("%06d", passcodeNum%1000000)

	expiresAt := time.Now().Add(1 * time.Hour) // 1 hour expiry for password reset

	if _, execErr := s.db.Exec(ctx,
		`INSERT INTO password_reset_tokens (token, user_id, expires_at, used_at, passcode) VALUES ($1, $2, $3, NULL, $4)`,
		token, userID, expiresAt, passcode,
	); execErr != nil {
		return "", "", fmt.Errorf("insert reset token: %w", execErr)
	}

	return token, passcode, nil
}

// sendPasswordResetEmail sends a password reset email via Mailgun.
func (s *Service) sendPasswordResetEmail(ctx context.Context, email, passcode string) error {
	if s.mailgunDomain == "" || s.mailgunAPIKey == "" || s.mailgunFrom == "" {
		return fmt.Errorf("mailgun_not_configured")
	}

	form := url.Values{}
	form.Set("from", s.mailgunFrom)
	form.Set("to", email)
	form.Set("subject", "Reset your CypressEra password")
	form.Set("text", fmt.Sprintf(`You requested to reset your password.

Please use the following verification code:

Verification Code: %s

If you did not request a password reset, you can ignore this email.`, passcode))

	endpoint := fmt.Sprintf("https://api.mailgun.net/v3/%s/messages", s.mailgunDomain)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("create mailgun request: %w", err)
	}
	req.SetBasicAuth("api", s.mailgunAPIKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("send mailgun request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("mailgun_send_failed status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	return nil
}

// ResetPasswordWithPasscode resets the user's password using a passcode.
func (s *Service) ResetPasswordWithPasscode(ctx context.Context, email, passcode, newPassword string) error {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" || passcode == "" || newPassword == "" {
		return errors.New("email, passcode, and new password are required")
	}

	if len(newPassword) < 8 {
		return errors.New("password must be at least 8 characters")
	}

	// Find user by email
	var userID string
	err := s.db.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, email).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("invalid_passcode")
		}
		return fmt.Errorf("lookup_user: %w", err)
	}

	// Find valid passcode for this user
	var token string
	var expiresAt time.Time
	var usedAt *time.Time

	err = s.db.QueryRow(ctx, `
SELECT token, expires_at, used_at
FROM password_reset_tokens
WHERE user_id = $1 AND passcode = $2
ORDER BY created_at DESC NULLS LAST
LIMIT 1
`, userID, passcode).Scan(&token, &expiresAt, &usedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("invalid_passcode")
		}
		return fmt.Errorf("lookup_passcode: %w", err)
	}

	if usedAt != nil {
		return fmt.Errorf("passcode_already_used")
	}

	if time.Now().After(expiresAt) {
		return fmt.Errorf("passcode_expired")
	}

	// Hash new password
	hash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash password: %w", err)
	}

	// Update password and mark token as used
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin_tx: %w", err)
	}
	defer tx.Rollback(ctx)

	now := time.Now()
	if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, string(hash), userID); err != nil {
		return fmt.Errorf("update_password: %w", err)
	}
	if _, err := tx.Exec(ctx, `UPDATE password_reset_tokens SET used_at = $1 WHERE token = $2`, now, token); err != nil {
		return fmt.Errorf("update_token: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit_tx: %w", err)
	}

	return nil
}

// RefreshRequest is the body of POST /api/v1/auth/refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refresh_token" binding:"required"`
}

// RefreshResponse mirrors LoginResponse minus the user payload (the client
// already has it from login).
type RefreshResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int64  `json:"expires_in"`
	RefreshToken string `json:"refresh_token"`
}

// Refresh handles POST /api/v1/auth/refresh.
//
// IMPORTANT: This route must NOT be wrapped by GinAuthMiddleware — the whole
// point of refresh is that the access token has expired.
func (h *Handler) Refresh(c *gin.Context) {
	if !h.service.RefreshEnabled() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Missing refresh_token"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	userAgent := c.Request.UserAgent()
	ip := c.ClientIP()

	newPlaintext, _, userID, err := h.service.RotateRefreshToken(ctx, req.RefreshToken, userAgent, ip)
	if err != nil {
		switch {
		case errors.Is(err, ErrRefreshTokenRevoked):
			// Reuse of a rotated token — burn the entire forward chain.
			if _, _, burnErr := h.service.DetectReuseAndBurnChain(ctx, req.RefreshToken); burnErr != nil {
				h.logger.Error("Failed to burn refresh chain after reuse detection", zap.Error(burnErr))
			}
			c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Refresh token invalid"))
			return
		case errors.Is(err, ErrRefreshTokenNotFound), errors.Is(err, ErrRefreshTokenExpired):
			c.JSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Refresh token invalid"))
			return
		default:
			h.logger.Error("Failed to rotate refresh token", zap.Error(err))
			c.JSON(http.StatusInternalServerError, types.NewErrorResponse("refresh_failed", "Failed to refresh session"))
			return
		}
	}

	// Mint a new access token. We only need the rotated user's identity here;
	// load enough to build claims.
	user, err := h.service.findByID(ctx, userID)
	if err != nil {
		h.logger.Error("Failed to load user during refresh", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("refresh_failed", "Failed to refresh session"))
		return
	}

	access, exp, err := h.service.GenerateToken(user)
	if err != nil {
		h.logger.Error("Failed to mint access token during refresh", zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("refresh_failed", "Failed to refresh session"))
		return
	}

	expiresIn := int64(time.Until(exp).Seconds())
	if expiresIn < 0 {
		expiresIn = 0
	}

	c.JSON(http.StatusOK, RefreshResponse{
		AccessToken:  access,
		TokenType:    "Bearer",
		ExpiresIn:    expiresIn,
		RefreshToken: newPlaintext,
	})
}

// LogoutRequest is the body of POST /api/v1/auth/logout.
type LogoutRequest struct {
	RefreshToken string `json:"refresh_token"`
}

// Logout handles POST /api/v1/auth/logout. Idempotent: returns 204 even if the
// presented token is unknown so the response does not reveal token validity.
func (h *Handler) Logout(c *gin.Context) {
	if !h.service.RefreshEnabled() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	var req LogoutRequest
	_ = c.ShouldBindJSON(&req) // tolerate empty body

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if err := h.service.RevokeRefreshToken(ctx, req.RefreshToken); err != nil {
		h.logger.Error("Failed to revoke refresh token", zap.Error(err))
	}
	c.Status(http.StatusNoContent)
}

// LogoutAll handles POST /api/v1/auth/logout-all. Protected by GinAuthMiddleware
// so the user identity comes from the access token.
func (h *Handler) LogoutAll(c *gin.Context) {
	if !h.service.RefreshEnabled() {
		c.AbortWithStatus(http.StatusNotFound)
		return
	}

	userID, ok := GetUserIDFromContext(c)
	if !ok {
		c.AbortWithStatusJSON(http.StatusUnauthorized, types.NewErrorResponse("unauthorized", "Missing user context"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	if err := h.service.RevokeAllRefreshTokensForUser(ctx, userID); err != nil {
		h.logger.Error("Failed to revoke all refresh tokens", zap.String("user_id", userID), zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("logout_all_failed", "Failed to log out of all devices"))
		return
	}
	c.Status(http.StatusNoContent)
}

// findByID returns a user by UUID for internal use (refresh flow).
func (s *Service) findByID(ctx context.Context, userID string) (*User, error) {
	row := s.db.QueryRow(ctx, `
SELECT id, email, password_hash, role, email_verified, created_at, updated_at
FROM users
WHERE id = $1
`, userID)
	var u User
	if err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt); err != nil {
		return nil, err
	}
	return &u, nil
}

// GoogleOAuthURL generates the Google OAuth authorization URL.
func (h *Handler) GoogleOAuthURL(c *gin.Context) {
	if h.service.googleClientID == "" {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("oauth_not_configured", "Google OAuth is not configured"))
		return
	}

	// Get the frontend URL from query param or default
	frontendURL := strings.TrimSpace(c.Query("redirect_uri"))
	if frontendURL == "" {
		frontendURL = strings.TrimSpace(os.Getenv("FRONTEND_BASE_URL"))
		if frontendURL == "" {
			frontendURL = "http://localhost:3000"
		}
	}

	// Generate a random state for CSRF protection
	stateBuf := make([]byte, 16)
	if _, err := rand.Read(stateBuf); err != nil {
		h.logger.Error("Failed to generate OAuth state", zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("state_generation_failed", "Failed to generate OAuth state"))
		return
	}
	state := hex.EncodeToString(stateBuf)

	// Build the authorization URL
	authURL := fmt.Sprintf(
		"https://accounts.google.com/o/oauth2/auth?client_id=%s&redirect_uri=%s&response_type=code&scope=email%%20profile&state=%s&access_type=offline&prompt=consent",
		url.QueryEscape(h.service.googleClientID),
		url.QueryEscape(frontendURL+"/auth/google/callback"),
		url.QueryEscape(state),
	)

	c.JSON(http.StatusOK, gin.H{
		"auth_url": authURL,
		"state":    state,
	})
}

// GoogleCallbackRequest represents the payload for Google OAuth callback.
type GoogleCallbackRequest struct {
	Code  string `json:"code" binding:"required"`
	State string `json:"state"`
}

// GoogleCallback handles the OAuth callback from Google.
func (h *Handler) GoogleCallback(c *gin.Context) {
	var req GoogleCallbackRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid Google callback request", zap.Error(err))
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("invalid_request", "Invalid callback payload"))
		return
	}

	if h.service.googleClientID == "" || h.service.googleClientSecret == "" {
		c.JSON(http.StatusNotFound, types.NewErrorResponse("oauth_not_configured", "Google OAuth is not configured"))
		return
	}

	// Get the frontend URL from query param or default
	frontendURL := strings.TrimSpace(c.Query("redirect_uri"))
	if frontendURL == "" {
		frontendURL = strings.TrimSpace(os.Getenv("FRONTEND_BASE_URL"))
		if frontendURL == "" {
			frontendURL = "http://localhost:3000"
		}
	}
	redirectURI := frontendURL + "/auth/google/callback"

	// Exchange code for token
	tokenURL := "https://oauth2.googleapis.com/token"
	data := url.Values{}
	data.Set("code", req.Code)
	data.Set("client_id", h.service.googleClientID)
	data.Set("client_secret", h.service.googleClientSecret)
	data.Set("redirect_uri", redirectURI)
	data.Set("grant_type", "authorization_code")

	resp, err := http.PostForm(tokenURL, data)
	if err != nil {
		h.logger.Error("Failed to exchange Google OAuth token", zap.Error(err))
		c.JSON(http.StatusBadGateway, types.NewErrorResponse("token_exchange_failed", "Failed to exchange OAuth token"))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		h.logger.Error("Google OAuth token exchange failed", zap.Int("status", resp.StatusCode), zap.String("body", string(body)))
		c.JSON(http.StatusBadGateway, types.NewErrorResponse("token_exchange_failed", "Failed to exchange OAuth token"))
		return
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		h.logger.Error("Failed to decode Google OAuth token response", zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("token_decode_failed", "Failed to decode token response"))
		return
	}

	// Get user info from Google
	userInfoResp, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + url.QueryEscape(tokenResp.AccessToken))
	if err != nil {
		h.logger.Error("Failed to get Google user info", zap.Error(err))
		c.JSON(http.StatusBadGateway, types.NewErrorResponse("user_info_failed", "Failed to get user info from Google"))
		return
	}
	defer userInfoResp.Body.Close()

	if userInfoResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(userInfoResp.Body, 4096))
		h.logger.Error("Google user info request failed", zap.Int("status", userInfoResp.StatusCode), zap.String("body", string(body)))
		c.JSON(http.StatusBadGateway, types.NewErrorResponse("user_info_failed", "Failed to get user info from Google"))
		return
	}

	var googleUser struct {
		ID      string `json:"id"`
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture string `json:"picture"`
	}
	if err := json.NewDecoder(userInfoResp.Body).Decode(&googleUser); err != nil {
		h.logger.Error("Failed to decode Google user info", zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("user_info_decode_failed", "Failed to decode user info"))
		return
	}

	if googleUser.Email == "" {
		c.JSON(http.StatusBadRequest, types.NewErrorResponse("no_email", "Google account has no email"))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// Find or create user
	user, isNew, err := h.service.FindOrCreateGoogleUser(ctx, googleUser.Email, googleUser.ID)
	if err != nil {
		h.logger.Error("Failed to create/find Google user", zap.Error(err), zap.String("email", googleUser.Email))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("user_creation_failed", "Failed to create user account"))
		return
	}

	// Seed default study case files for new Google users (non-blocking).
	if isNew && h.onUserCreated != nil {
		go h.onUserCreated(user.ID)
	}

	// Generate JWT token
	token, exp, err := h.service.GenerateToken(user)
	if err != nil {
		h.logger.Error("Failed to generate JWT for Google user", zap.Error(err))
		c.JSON(http.StatusInternalServerError, types.NewErrorResponse("token_generation_failed", "Failed to generate access token"))
		return
	}

	c.JSON(http.StatusOK, h.buildLoginResponse(c, user, token, exp))
}

// FindOrCreateGoogleUser finds an existing user or creates a new one for Google OAuth.
// Returns the user and true if the user was newly created.
func (s *Service) FindOrCreateGoogleUser(ctx context.Context, email, googleID string) (*User, bool, error) {
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return nil, false, errors.New("email is required")
	}

	// Check if user already exists
	var u User
	err := s.db.QueryRow(ctx, `
SELECT id, email, password_hash, role, email_verified, created_at, updated_at
FROM users
WHERE email = $1
`, email).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt)

	if err == nil {
		// User exists - ensure email is verified
		if !u.EmailVerified {
			_, err = s.db.Exec(ctx, `UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, u.ID)
			if err != nil {
				return nil, false, fmt.Errorf("update user verified: %w", err)
			}
			u.EmailVerified = true
		}
		return &u, false, nil
	}

	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, fmt.Errorf("lookup user: %w", err)
	}

	// Create new user with random password (they'll use Google to sign in)
	randomPassword := make([]byte, 32)
	if _, randErr := rand.Read(randomPassword); randErr != nil {
		return nil, false, fmt.Errorf("generate random password: %w", randErr)
	}
	hash, err := bcrypt.GenerateFromPassword(randomPassword, bcrypt.DefaultCost)
	if err != nil {
		return nil, false, fmt.Errorf("hash password: %w", err)
	}

	err = s.db.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, role, email_verified) VALUES ($1, $2, 'user', TRUE) RETURNING id, email, password_hash, role, email_verified, created_at, updated_at`,
		email, string(hash),
	).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.EmailVerified, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, false, fmt.Errorf("insert user: %w", err)
	}

	s.logger.Info("Created new user via Google OAuth", zap.String("email", email))
	return &u, true, nil
}
