package report

// Tests for BuildFromEngine — the base-case monitored report built from the
// flow-solver's engine-resolved study model. These preserve the behavioral
// assertions of the retired Build() tests (loading, violations, interfaces,
// no-rating diagnostics, summary, diagnostic merging); dual-engine parity of
// the two builders was proven before the legacy path was deleted.

import (
	"testing"

	"api-server/src/studyfile"
)

func fixtureResult() map[string]interface{} {
	return map[string]interface{}{
		"acline_results": []interface{}{
			map[string]interface{}{"ibus": 1.0, "jbus": 2.0, "ckt": "1", "p_from": 80.0, "q_from": 10.0},
			map[string]interface{}{"ibus": 3.0, "jbus": 4.0, "ckt": "1", "p_from": 60.0, "q_from": 0.0},
		},
		"bus_results": []interface{}{
			map[string]interface{}{"ibus": 5.0, "vm": 0.90},
		},
	}
}

func TestBuildFromEngineThermalLoadingAndViolation(t *testing.T) {
	rm := &EngineResolvedModel{
		Thermal: []EngineThermalMonitor{
			{From: 1, To: 2, Ckt: "1", MonType: "BES", BaseRating: 100},
			{From: 3, To: 4, Ckt: "1", MonType: "BES", BaseRating: 50},
		},
	}
	rep := BuildFromEngine(fixtureResult(), rm, studyfile.Diagnostics{})

	if len(rep.Thermal) != 1 || rep.Thermal[0].MonType != "BES" {
		t.Fatalf("thermal groups = %#v, want one BES group", rep.Thermal)
	}
	rows := rep.Thermal[0].Rows
	if len(rows) != 2 {
		t.Fatalf("rows = %#v, want 2", rows)
	}
	// Branch 1-2: hypot(80,10) ≈ 80.6 MVA of 100 → ~80.6%, no violation.
	if rows[0].Violation || rows[0].LoadingPct < 80 || rows[0].LoadingPct > 81 {
		t.Errorf("row 1-2 = %#v, want ~80.6%% loaded, not violated", rows[0])
	}
	// Branch 3-4: 60 MVA of 50 → 120%, violation.
	if !rows[1].Violation || rows[1].LoadingPct < 119 || rows[1].LoadingPct > 121 {
		t.Errorf("row 3-4 = %#v, want 120%% loaded, violated", rows[1])
	}
}

func TestBuildFromEngineVoltageViolation(t *testing.T) {
	rm := &EngineResolvedModel{
		Voltage: []EngineVoltageMonitor{{Bus: 5, Lo: 0.95, Hi: 1.05, HasLimits: true}},
	}
	rep := BuildFromEngine(fixtureResult(), rm, studyfile.Diagnostics{})
	if len(rep.Voltage) != 1 {
		t.Fatalf("voltage rows = %#v, want 1", rep.Voltage)
	}
	if !rep.Voltage[0].Violation || rep.Voltage[0].Vm != 0.90 {
		t.Errorf("voltage row = %#v, want vm 0.90 violated", rep.Voltage[0])
	}
}

func TestBuildFromEngineInterfaceFlow(t *testing.T) {
	rm := &EngineResolvedModel{
		Interfaces: []EngineInterface{
			{Name: "I", Rating: 200, HasRating: true, Members: []EngineInterfaceMember{
				{From: 1, To: 2, Ckt: "1", Factor: 1.0},
			}},
		},
	}
	rep := BuildFromEngine(fixtureResult(), rm, studyfile.Diagnostics{})
	if len(rep.Interfaces) != 1 {
		t.Fatalf("interface rows = %#v, want 1", rep.Interfaces)
	}
	in := rep.Interfaces[0]
	if in.FlowMW != 80 || !in.HasLoading || in.Violation {
		t.Errorf("interface row = %#v, want 80 MW, 40%% loaded, not violated", in)
	}
}

func TestBuildFromEngineNoRatingDiagnostic(t *testing.T) {
	rm := &EngineResolvedModel{
		// BaseRating 0: the engine found no rating for this monitored branch.
		Thermal: []EngineThermalMonitor{{From: 7, To: 8, Ckt: "1"}},
	}
	rep := BuildFromEngine(fixtureResult(), rm, studyfile.Diagnostics{})
	if rep.Thermal[0].Rows[0].HasLoading {
		t.Error("branch with no rating should have no loading")
	}
	found := false
	for _, d := range rep.Diagnostics {
		if d.Code == "report_no_rating" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected report_no_rating diagnostic, got %#v", rep.Diagnostics)
	}
}

func TestBuildFromEngineSummary(t *testing.T) {
	rm := &EngineResolvedModel{
		Thermal: []EngineThermalMonitor{
			{From: 1, To: 2, Ckt: "1", BaseRating: 100},
			{From: 3, To: 4, Ckt: "1", BaseRating: 50},
		},
		Voltage: []EngineVoltageMonitor{{Bus: 5, Lo: 0.95, Hi: 1.05, HasLimits: true}},
	}
	rep := BuildFromEngine(fixtureResult(), rm, studyfile.Diagnostics{})
	if rep.Summary.MonitoredBranches != 2 || rep.Summary.MonitoredBuses != 1 {
		t.Errorf("summary counts = %#v", rep.Summary)
	}
	// One thermal violation (3-4) + one voltage violation (bus 5).
	if rep.Summary.Violations != 2 {
		t.Errorf("violations = %d, want 2", rep.Summary.Violations)
	}
}

func TestBuildFromEngineMergesParseDiagnostics(t *testing.T) {
	var d studyfile.Diagnostics
	d.Warn("t.con", 5, "con_unsupported", "skipped")
	rep := BuildFromEngine(fixtureResult(), &EngineResolvedModel{}, d)
	if len(rep.Diagnostics) != 1 || rep.Diagnostics[0].Code != "con_unsupported" {
		t.Errorf("diagnostics = %#v, want the merged parse diagnostic", rep.Diagnostics)
	}
	if rep.Summary.Skipped != 1 {
		t.Errorf("skipped = %d, want 1", rep.Summary.Skipped)
	}
}
