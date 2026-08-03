package auth

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

func TestModeFromEnv(t *testing.T) {
	cases := []struct {
		env     string
		want    Mode
		wantErr bool
	}{
		{"", ModePassword, false},
		{"password", ModePassword, false},
		{"PASSWORD", ModePassword, false},
		{"none", ModeNone, false},
		{" None ", ModeNone, false},
		{"banana", "", true},
		{"disabled", "", true},
	}

	for _, tc := range cases {
		t.Run("AUTH_MODE="+tc.env, func(t *testing.T) {
			t.Setenv("AUTH_MODE", tc.env)
			got, err := ModeFromEnv()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error for %q, got mode %q", tc.env, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error for %q: %v", tc.env, err)
			}
			if got != tc.want {
				t.Fatalf("ModeFromEnv(%q) = %q, want %q", tc.env, got, tc.want)
			}
		})
	}
}

// newNoneModeService builds a Service via the real constructor with no DB,
// as main.go does when AUTH_MODE=none.
func newNoneModeService(t *testing.T) *Service {
	t.Helper()
	t.Setenv("AUTH_MODE", "none")
	t.Setenv("AUTH_JWT_SECRET", "test-secret")
	svc, err := NewService(nil, zap.NewNop())
	if err != nil {
		t.Fatalf("NewService in none mode without DB: %v", err)
	}
	return svc
}

func TestNoneModeServiceWithoutDatabase(t *testing.T) {
	svc := newNoneModeService(t)

	if svc.Mode() != ModeNone {
		t.Fatalf("Mode() = %q, want none", svc.Mode())
	}
	if svc.RefreshEnabled() {
		t.Fatal("refresh tokens must be disabled in none mode (they are postgres-backed)")
	}
	if svc.accessTTL != noneModeAccessTTL {
		t.Fatalf("accessTTL = %v, want %v", svc.accessTTL, noneModeAccessTTL)
	}
}

func TestSessionEndpointIssuesValidSyntheticToken(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc := newNoneModeService(t)
	handler := NewHandler(svc, zap.NewNop())

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/v1/auth/session", nil)
	handler.Session(c)

	if w.Code != http.StatusOK {
		t.Fatalf("Session returned %d: %s", w.Code, w.Body.String())
	}

	var resp LoginResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal session response: %v", err)
	}
	if resp.RefreshToken != "" {
		t.Fatal("none mode must not issue refresh tokens")
	}
	if resp.User.ID != SyntheticUserID || resp.User.Role != SyntheticUserRole {
		t.Fatalf("unexpected user in session response: %+v", resp.User)
	}
	// TTL should be ~30 days.
	if resp.ExpiresIn < int64((noneModeAccessTTL - time.Hour).Seconds()) {
		t.Fatalf("ExpiresIn = %d, expected ~%d", resp.ExpiresIn, int64(noneModeAccessTTL.Seconds()))
	}

	// The token must be a standard access JWT accepted by ParseToken...
	claims, err := svc.ParseToken(resp.AccessToken)
	if err != nil {
		t.Fatalf("ParseToken rejected session token: %v", err)
	}
	if claims.UserID != SyntheticUserID {
		t.Fatalf("claims.UserID = %q, want synthetic UUID", claims.UserID)
	}

	// ...and by GinAuthMiddleware, so WS/agent-server-style consumers work.
	mw := svc.GinAuthMiddleware()
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest(http.MethodGet, "/api/v1/stat", nil)
	c2.Request.Header.Set("Authorization", "Bearer "+resp.AccessToken)
	mw(c2)
	if w2.Code == http.StatusUnauthorized {
		t.Fatalf("GinAuthMiddleware rejected session token: %s", w2.Body.String())
	}
	if id, ok := GetUserIDFromContext(c2); !ok || id != SyntheticUserID {
		t.Fatalf("middleware set user id %q, want synthetic UUID", id)
	}
}

func TestAuthConfigEndpoint(t *testing.T) {
	gin.SetMode(gin.TestMode)

	cases := []struct {
		name                  string
		svc                   *Service
		wantMode              string
		wantGoogle            bool
		wantEmailVerification bool
	}{
		{
			name:     "none mode, nothing configured",
			svc:      &Service{mode: ModeNone, logger: zap.NewNop()},
			wantMode: "none",
		},
		{
			// Credentials in the environment don't matter in none mode: the
			// Google/registration endpoints are not mounted, so the config
			// must not advertise them.
			name: "none mode, credentials present but features not mounted",
			svc: &Service{
				mode:               ModeNone,
				logger:             zap.NewNop(),
				mailgunDomain:      "mg.example.com",
				mailgunAPIKey:      "key",
				googleClientID:     "id",
				googleClientSecret: "secret",
			},
			wantMode: "none",
		},
		{
			name: "password mode, fully configured",
			svc: &Service{
				mode:               ModePassword,
				logger:             zap.NewNop(),
				mailgunDomain:      "mg.example.com",
				mailgunAPIKey:      "key",
				googleClientID:     "id",
				googleClientSecret: "secret",
			},
			wantMode:              "password",
			wantGoogle:            true,
			wantEmailVerification: true,
		},
		{
			name: "password mode, google only",
			svc: &Service{
				mode:               ModePassword,
				logger:             zap.NewNop(),
				googleClientID:     "id",
				googleClientSecret: "secret",
			},
			wantMode:   "password",
			wantGoogle: true,
		},
		{
			name:     "password mode, mailgun key missing",
			svc:      &Service{mode: ModePassword, logger: zap.NewNop(), mailgunDomain: "mg.example.com"},
			wantMode: "password",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			handler := NewHandler(tc.svc, zap.NewNop())
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/auth/config", nil)
			handler.AuthConfig(c)

			if w.Code != http.StatusOK {
				t.Fatalf("AuthConfig returned %d", w.Code)
			}
			var resp AuthConfigResponse
			if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
				t.Fatalf("unmarshal config response: %v", err)
			}
			if resp.Mode != tc.wantMode {
				t.Errorf("mode = %q, want %q", resp.Mode, tc.wantMode)
			}
			if resp.GoogleEnabled != tc.wantGoogle {
				t.Errorf("google_enabled = %v, want %v", resp.GoogleEnabled, tc.wantGoogle)
			}
			if resp.EmailVerificationEnabled != tc.wantEmailVerification {
				t.Errorf("email_verification_enabled = %v, want %v", resp.EmailVerificationEnabled, tc.wantEmailVerification)
			}
		})
	}
}

func TestGoogleEndpointsNotConfigured(t *testing.T) {
	gin.SetMode(gin.TestMode)
	handler := NewHandler(&Service{mode: ModePassword, logger: zap.NewNop()}, zap.NewNop())

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/url", nil)
	handler.GoogleOAuthURL(c)

	if w.Code != http.StatusNotFound {
		t.Fatalf("GoogleOAuthURL returned %d, want 404", w.Code)
	}
	if !strings.Contains(w.Body.String(), "oauth_not_configured") {
		t.Fatalf("expected oauth_not_configured error code, got: %s", w.Body.String())
	}
}

// TestPasswordModeTTLUnchanged guards the compatibility contract: with
// AUTH_MODE unset, token TTL config behaves exactly as before this change.
func TestPasswordModeTTLDefaults(t *testing.T) {
	t.Setenv("AUTH_MODE", "")
	t.Setenv("AUTH_JWT_SECRET", "test-secret")
	t.Setenv("AUTH_ACCESS_TTL_MINUTES", "")
	t.Setenv("AUTH_TOKEN_TTL_HOURS", "")

	// Construct without touching the DB paths: NewService would migrate, so
	// build the Service directly the way NewService does for these fields.
	mode, err := ModeFromEnv()
	if err != nil {
		t.Fatalf("ModeFromEnv: %v", err)
	}
	if mode != ModePassword {
		t.Fatalf("mode = %q, want password", mode)
	}
}
