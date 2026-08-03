package contingency

// Tests for BuildReportEnriched — flattening engine output whose records
// arrive already enriched by the flow-solver (design D6). Preserves the
// behavioral assertions of the retired BuildReport round-trip test: base-case
// tagging, per-contingency rows, status rows, and summary counts. Label
// parity with the retired network-enriching path was proven by the
// dual-engine tests before its deletion.

import (
	"encoding/json"
	"testing"
)

func TestBuildReportEnrichedRoundTrip(t *testing.T) {
	engineJSON := `{
	  "base": {"converged": true, "violations": [
	    {"type": "thermal", "from_bus": 101, "to_bus": 102, "ckt": "1",
	     "monitored_facility": "COAL-A 101 138 kV - COAL-B 102 138 kV CKT 1",
	     "from_kv": 138, "to_kv": 138, "cont_name": "Base Case", "status": "converged",
	     "base_rating_mva": 175, "cont_rating_mva": 175,
	     "cont_loading_mva": 178.0, "cont_loading_pct": 101.7, "violation": true}
	  ]},
	  "contingencies": [
	    {"id": "L-101-102", "name": "L-101-102-1", "converged": true, "islanded": false,
	     "violations": [
	       {"type": "thermal", "from_bus": 101, "to_bus": 102, "ckt": "1",
	        "monitored_facility": "COAL-A 101 138 kV - COAL-B 102 138 kV CKT 1",
	        "from_kv": 138, "to_kv": 138, "cont_name": "L-101-102-1", "status": "converged",
	        "base_rating_mva": 175, "cont_rating_mva": 193,
	        "cont_loading_mva": 210.5, "cont_loading_pct": 109.1, "violation": true},
	       {"type": "voltage", "bus": 205, "bus_name": "EASTBUS", "bus_kv": 230,
	        "monitored_facility": "EASTBUS 205 230 kV", "cont_name": "L-101-102-1",
	        "status": "converged", "volt_upper_limit_pu": 1.05,
	        "volt_lower_limit_pu": 0.95, "cont_voltage_pu": 0.93}
	     ]},
	    {"id": "C-NC", "name": "C-NC", "converged": false, "islanded": false, "violations": []}
	  ]
	}`
	var out EngineOutput
	if err := json.Unmarshal([]byte(engineJSON), &out); err != nil {
		t.Fatalf("unmarshal engine output: %v", err)
	}

	rep := BuildReportEnriched(out)
	if rep.Summary.Total != 2 || rep.Summary.WithViolations != 1 || rep.Summary.NonConverged != 1 {
		t.Fatalf("summary = %#v, want 2 total / 1 with-violations / 1 non-converged", rep.Summary)
	}
	// Flat list: 1 base row + 2 contingency rows + 1 non-converged status row.
	if len(rep.Results) != 4 {
		t.Fatalf("results = %d rows, want 4", len(rep.Results))
	}

	base := rep.Results[0]
	if base.ContName == nil || *base.ContName != "Base Case" || base.Status != "converged" {
		t.Errorf("base row = %#v, want cont_name 'Base Case' / status converged", base)
	}

	// Enrichment passes through untouched.
	th := rep.Results[1]
	if th.MonitoredFacility == nil ||
		*th.MonitoredFacility != "COAL-A 101 138 kV - COAL-B 102 138 kV CKT 1" {
		t.Errorf("thermal facility = %v, want the enriched label preserved", th.MonitoredFacility)
	}
	if th.ContName == nil || *th.ContName != "L-101-102-1" || th.Status != "converged" {
		t.Errorf("thermal cont_name/status = %v / %q", th.ContName, th.Status)
	}
	vt := rep.Results[2]
	if vt.BusName == nil || *vt.BusName != "EASTBUS" || vt.BusKv == nil || *vt.BusKv != 230 {
		t.Errorf("voltage enrichment = %#v, want EASTBUS / 230 preserved", vt)
	}

	// Non-converged contingency: a single status row, no monitored element.
	nc := rep.Results[3]
	if nc.Status != "non-converged" || nc.Type != "" {
		t.Errorf("status row = %#v, want status non-converged / no type", nc)
	}
	if nc.ContName == nil || *nc.ContName != "C-NC" {
		t.Errorf("status row cont_name = %v, want C-NC", nc.ContName)
	}
	if nc.MonitoredFacility != nil || nc.ContLoadingMva != nil {
		t.Errorf("status row should carry no monitored element: %#v", nc)
	}
}

func TestBuildReportEnrichedIslanded(t *testing.T) {
	var out EngineOutput
	if err := json.Unmarshal([]byte(`{
	  "base": {"converged": true, "violations": []},
	  "contingencies": [{"id": "I", "name": "I", "converged": true, "islanded": true, "violations": []}]
	}`), &out); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	rep := BuildReportEnriched(out)
	if rep.Summary.Islanded != 1 || len(rep.Results) != 1 || rep.Results[0].Status != "islanded" {
		t.Errorf("islanded handling = %#v / %#v", rep.Summary, rep.Results)
	}
}
