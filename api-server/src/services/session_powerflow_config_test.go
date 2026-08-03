package services

import (
	"testing"

	"api-server/src/types"
)

// ResolvePowerFlowConfig resolves explicit > session-saved > nil, persists an
// explicit config, and never overwrites the saved config with an empty request.
func TestResolvePowerFlowConfig(t *testing.T) {
	svc := &SessionService{
		sessions: map[string]*types.UserSession{
			"s1": {ID: "s1"},
			"s2": {ID: "s2"},
		},
	}

	// Explicit config wins and is persisted on the session.
	explicit := map[string]interface{}{"tap_adjustment": "locked"}
	got := svc.ResolvePowerFlowConfig("s1", explicit)
	if got["tap_adjustment"] != "locked" {
		t.Fatalf("explicit not returned: %v", got)
	}
	if svc.sessions["s1"].PowerFlowConfig["tap_adjustment"] != "locked" {
		t.Errorf("explicit config not saved on the session")
	}

	// A later run that omits config inherits the saved config.
	got = svc.ResolvePowerFlowConfig("s1", nil)
	if got["tap_adjustment"] != "locked" {
		t.Errorf("saved config not inherited: %v", got)
	}

	// An empty request must not overwrite the saved config.
	svc.ResolvePowerFlowConfig("s1", map[string]interface{}{})
	if svc.sessions["s1"].PowerFlowConfig["tap_adjustment"] != "locked" {
		t.Errorf("empty request overwrote the saved config")
	}

	// A session with nothing saved and no request config resolves to nil,
	// letting the solver apply its defaults.
	if got := svc.ResolvePowerFlowConfig("s2", nil); got != nil {
		t.Errorf("expected nil for an unconfigured session, got %v", got)
	}
}
