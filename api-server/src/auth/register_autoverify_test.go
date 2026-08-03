package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

// TestRegisterAutoVerifyWithoutMailgun exercises the no-Mailgun registration
// branch against a real postgres. Skipped unless TEST_DATABASE_URL is set,
// e.g. TEST_DATABASE_URL=postgres://xflow:xflow_password@localhost:5433/xflow?sslmode=disable
func TestRegisterAutoVerifyWithoutMailgun(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping postgres-backed registration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect test database: %v", err)
	}
	defer pool.Close()

	// Password mode with Mailgun unconfigured — the auto-verify branch.
	svc := &Service{
		mode:      ModePassword,
		db:        pool,
		secret:    []byte("test-secret"),
		accessTTL: 15 * time.Minute,
		logger:    zap.NewNop(),
	}
	if err := svc.migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		t.Fatalf("rand: %v", err)
	}
	email := "autoverify-" + hex.EncodeToString(buf) + "@test.local"
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	})

	userID, err := svc.RegisterAndSendVerification(ctx, email, "test-password-123")
	if err != nil {
		t.Fatalf("register without mailgun should succeed, got: %v", err)
	}
	if userID == "" {
		t.Fatal("expected a user ID")
	}

	// Account must be immediately verified and loginable.
	u, err := svc.FindByEmail(ctx, email)
	if err != nil {
		t.Fatalf("find registered user: %v", err)
	}
	if !u.EmailVerified {
		t.Fatal("user must be created email_verified=true when Mailgun is unconfigured")
	}
	if _, err := svc.Authenticate(ctx, email, "test-password-123"); err != nil {
		t.Fatalf("authenticate immediately after no-mailgun registration: %v", err)
	}

	// Re-registering the same email must conflict, not silently reuse.
	if _, err := svc.RegisterAndSendVerification(ctx, email, "other-password-456"); err == nil {
		t.Fatal("re-registration should fail with already_registered")
	} else if err.Error() != "already_registered" {
		t.Fatalf("expected already_registered, got: %v", err)
	}
}
