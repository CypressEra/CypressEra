package auth

import (
	"fmt"
	"os"
	"strings"
	"time"
)

// Mode is the authentication operating mode of the server.
type Mode string

const (
	// ModePassword is the default: JWT login backed by postgres, exactly the
	// behavior that existed before AUTH_MODE was introduced.
	ModePassword Mode = "password"
	// ModeNone disables the login system: every browser session runs as a
	// fixed synthetic user and no database is required.
	ModeNone Mode = "none"
)

// Synthetic user identity used in ModeNone. The UUID is a constant so that
// /user-data/<user_id> paths stay stable across restarts and mode flips.
const (
	SyntheticUserID    = "00000000-0000-0000-0000-000000000001"
	SyntheticUserEmail = "local@cypressera.local"
	SyntheticUserRole  = "admin"
)

// noneModeAccessTTL is the access-token lifetime in ModeNone. There are no
// refresh tokens in this mode (they are postgres-backed); the UI silently
// re-requests a session on 401 instead, so a long TTL just reduces churn.
const noneModeAccessTTL = 30 * 24 * time.Hour

// ModeFromEnv parses AUTH_MODE. Unset or empty means ModePassword; anything
// other than the two known values is a startup error.
func ModeFromEnv() (Mode, error) {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv("AUTH_MODE")))
	switch raw {
	case "", string(ModePassword):
		return ModePassword, nil
	case string(ModeNone):
		return ModeNone, nil
	default:
		return "", fmt.Errorf("invalid AUTH_MODE %q: allowed values are %q (default) and %q", raw, ModePassword, ModeNone)
	}
}
