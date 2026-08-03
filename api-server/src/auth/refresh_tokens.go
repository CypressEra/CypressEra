package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"go.uber.org/zap"
)

// Sentinel errors returned by the refresh-token service. Callers map these to
// HTTP responses; the wire format never reveals which one occurred.
var (
	ErrRefreshTokenNotFound = errors.New("refresh_token_not_found")
	ErrRefreshTokenExpired  = errors.New("refresh_token_expired")
	ErrRefreshTokenRevoked  = errors.New("refresh_token_revoked")
)

// refreshTokenBytes is the entropy of the plaintext refresh token (256 bits).
const refreshTokenBytes = 32

// hashRefreshToken computes the SHA-256 digest of the plaintext refresh token.
// The plaintext never persists server-side; only this digest is stored.
func hashRefreshToken(plaintext string) []byte {
	sum := sha256.Sum256([]byte(plaintext))
	return sum[:]
}

// hashPrefix returns a short hex prefix of the hash for safe logging.
func hashPrefix(hash []byte) string {
	if len(hash) == 0 {
		return ""
	}
	end := 4
	if len(hash) < end {
		end = len(hash)
	}
	return hex.EncodeToString(hash[:end])
}

// generateRefreshPlaintext returns a base64url-encoded 256-bit random token.
func generateRefreshPlaintext() (string, error) {
	buf := make([]byte, refreshTokenBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("read random bytes: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// parseIPForDB returns a sql-friendly representation of an IP for the INET column,
// or nil for blank/invalid input so the column stays NULL rather than rejecting.
func parseIPForDB(ip string) interface{} {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return nil
	}
	// X-Forwarded-For can be a comma-separated list; take the first.
	if comma := strings.IndexByte(ip, ','); comma >= 0 {
		ip = strings.TrimSpace(ip[:comma])
	}
	if parsed := net.ParseIP(ip); parsed != nil {
		return parsed.String()
	}
	return nil
}

// GenerateRefreshToken issues a new refresh token for the user, persists its
// SHA-256 hash, and returns the plaintext to send back to the client along
// with the row id. The plaintext is never stored.
func (s *Service) GenerateRefreshToken(ctx context.Context, userID, userAgent, ip string) (plaintext string, id string, err error) {
	plaintext, err = generateRefreshPlaintext()
	if err != nil {
		return "", "", err
	}
	hash := hashRefreshToken(plaintext)
	expiresAt := time.Now().Add(s.refreshTTL)

	err = s.db.QueryRow(ctx, `
INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
VALUES ($1, $2, $3, $4, $5)
RETURNING id
`, userID, hash, expiresAt, nullableString(userAgent), parseIPForDB(ip)).Scan(&id)
	if err != nil {
		return "", "", fmt.Errorf("insert refresh token: %w", err)
	}
	return plaintext, id, nil
}

// RotateRefreshToken validates the presented refresh token and atomically
// replaces it with a fresh one. The lookup, revocation, and insert run inside
// a single transaction with SELECT ... FOR UPDATE on the old row to serialize
// concurrent refreshes of the same token.
//
// Returns ErrRefreshTokenNotFound if no row matches; ErrRefreshTokenExpired if
// past expires_at; ErrRefreshTokenRevoked if already revoked (callers should
// follow up with DetectReuseAndBurnChain).
func (s *Service) RotateRefreshToken(ctx context.Context, oldPlaintext, userAgent, ip string) (newPlaintext string, newID string, userID string, err error) {
	if strings.TrimSpace(oldPlaintext) == "" {
		return "", "", "", ErrRefreshTokenNotFound
	}
	oldHash := hashRefreshToken(oldPlaintext)

	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", "", "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var (
		oldID      string
		rowUserID  string
		expiresAt  time.Time
		revokedAt  *time.Time
	)
	err = tx.QueryRow(ctx, `
SELECT id, user_id, expires_at, revoked_at
FROM refresh_tokens
WHERE token_hash = $1
FOR UPDATE
`, oldHash).Scan(&oldID, &rowUserID, &expiresAt, &revokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", "", ErrRefreshTokenNotFound
		}
		return "", "", "", fmt.Errorf("lookup refresh token: %w", err)
	}

	if revokedAt != nil {
		return "", "", "", ErrRefreshTokenRevoked
	}
	if time.Now().After(expiresAt) {
		return "", "", "", ErrRefreshTokenExpired
	}

	newPlaintext, err = generateRefreshPlaintext()
	if err != nil {
		return "", "", "", err
	}
	newHash := hashRefreshToken(newPlaintext)
	newExpiresAt := time.Now().Add(s.refreshTTL)

	// Insert the successor first so we can wire replaced_by_id on the old row.
	if err := tx.QueryRow(ctx, `
INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
VALUES ($1, $2, $3, $4, $5)
RETURNING id
`, rowUserID, newHash, newExpiresAt, nullableString(userAgent), parseIPForDB(ip)).Scan(&newID); err != nil {
		return "", "", "", fmt.Errorf("insert successor: %w", err)
	}

	if _, err := tx.Exec(ctx, `
UPDATE refresh_tokens
SET revoked_at = NOW(), replaced_by_id = $1
WHERE id = $2
`, newID, oldID); err != nil {
		return "", "", "", fmt.Errorf("revoke predecessor: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return "", "", "", fmt.Errorf("commit rotate: %w", err)
	}

	return newPlaintext, newID, rowUserID, nil
}

// RevokeRefreshToken marks the single row matching the plaintext as revoked.
// Unknown tokens are a no-op (idempotent; callers return 204 either way to
// avoid leaking whether the token existed).
func (s *Service) RevokeRefreshToken(ctx context.Context, plaintext string) error {
	if strings.TrimSpace(plaintext) == "" {
		return nil
	}
	hash := hashRefreshToken(plaintext)
	_, err := s.db.Exec(ctx, `
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE token_hash = $1 AND revoked_at IS NULL
`, hash)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}
	return nil
}

// RevokeAllRefreshTokensForUser revokes every active refresh-token row for the
// user. Powers "log out of all devices".
func (s *Service) RevokeAllRefreshTokensForUser(ctx context.Context, userID string) error {
	if strings.TrimSpace(userID) == "" {
		return errors.New("user id is required")
	}
	_, err := s.db.Exec(ctx, `
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE user_id = $1 AND revoked_at IS NULL
`, userID)
	if err != nil {
		return fmt.Errorf("revoke all refresh tokens: %w", err)
	}
	return nil
}

// DetectReuseAndBurnChain handles the case where /auth/refresh is called with
// a refresh token whose row is already revoked. It walks the replaced_by_id
// forward chain from this token and revokes every descendant that is still
// active. This is the leak-detection response: we cannot tell attacker from
// victim, so we burn the chain on both ends.
//
// Returns the user_id of the chain (for logging context) and the number of
// rows newly revoked.
func (s *Service) DetectReuseAndBurnChain(ctx context.Context, plaintext string) (userID string, burned int, err error) {
	if strings.TrimSpace(plaintext) == "" {
		return "", 0, nil
	}
	hash := hashRefreshToken(plaintext)

	// Recursive CTE walks the replaced_by_id chain forward from the matching
	// row, then we mark every still-active descendant revoked in one statement.
	// user_id is cast to text so COALESCE can default to '' when no chain row
	// exists (e.g. burn called with a token that was never issued).
	row := s.db.QueryRow(ctx, `
WITH RECURSIVE chain AS (
	SELECT id, user_id, replaced_by_id
	FROM refresh_tokens
	WHERE token_hash = $1
	UNION ALL
	SELECT rt.id, rt.user_id, rt.replaced_by_id
	FROM refresh_tokens rt
	JOIN chain c ON rt.id = c.replaced_by_id
),
updated AS (
	UPDATE refresh_tokens
	SET revoked_at = NOW()
	WHERE id IN (SELECT id FROM chain) AND revoked_at IS NULL
	RETURNING id
)
SELECT
	COALESCE((SELECT user_id::text FROM chain LIMIT 1), ''),
	(SELECT COUNT(*) FROM updated)
`, hash)

	if err := row.Scan(&userID, &burned); err != nil {
		return "", 0, fmt.Errorf("burn chain: %w", err)
	}

	s.logger.Warn("Refresh token reuse detected; burning chain",
		zap.String("user_id", userID),
		zap.Int("rows_burned", burned),
		zap.String("token_hash_prefix", hashPrefix(hash)),
	)

	return userID, burned, nil
}

// nullableString returns nil for empty strings so optional TEXT columns stay NULL.
func nullableString(s string) interface{} {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}
