package services

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// A minimal RAWX with one of each controlled section. Field orders deliberately
// differ from any fixed layout to prove the writeback resolves columns by name.
const wsTestRawx = `{
  "network": {
    "bus":        {"fields":["ibus","name","baskv","ide","area","zone","owner","vm","va"],
                   "data":[[101,"B1",230.0,3,1,1,1,1.0,0.0],[102,"B2",230.0,1,1,1,1,1.0,0.0]]},
    "transformer":{"fields":["ibus","jbus","kbus","ckt","r1_2","x1_2","windv1","ang1","windv2","ang2"],
                   "data":[[101,102,0,"1 ",0.0,0.1,1.0,0.0,1.0,0.0]]},
    "swshunt":    {"fields":["ibus","shntid","modsw","binit"],
                   "data":[[102,"1",1,0.0]]},
    "generator":  {"fields":["ibus","machid","pg","qg","qt","qb","vs"],
                   "data":[[101,"1",50.0,10.0,99.0,-99.0,1.0]]},
    "twotermdc":  {"fields":["name","ipr","ipi","tapr","tapi"],
                   "data":[["DC1",101,102,1.0,1.0]]}
  }
}`

// Result carries solved control state in RAWX-native units, keyed by identity.
// The transformer reports BOTH windings to prove multi-winding writeback.
const wsTestResult = `{
  "bus_results":[{"ibus":101,"vm":1.05,"va":-1.2},{"ibus":102,"vm":0.98,"va":-3.4}],
  "transformer_results":[{"ibus":101,"jbus":102,"kbus":0,"ckt":"1 ",
     "tap_writeback":[{"winding":1,"windv":1.0375,"ang":0.0},{"winding":2,"windv":0.95,"ang":2.5}]}],
  "swshunt_results":[{"ibus":102,"shntid":"1","binit_solved":150.0}],
  "generator_results":[{"ibus":101,"machid":"1","qg":42.0,"pg_solved":55.5}],
  "twotermdc_results":[{"dc_name":"DC1","ipr":101,"ipi":102,"tapr":1.25,"tapi":1.3}]
}`

func wsCol(t *testing.T, network map[string]interface{}, section, field string, row int) interface{} {
	t.Helper()
	sec := network[section].(map[string]interface{})
	fields := sec["fields"].([]interface{})
	idx := -1
	for i, f := range fields {
		if f.(string) == field {
			idx = i
		}
	}
	if idx < 0 {
		t.Fatalf("field %q not found in section %q", field, section)
	}
	return sec["data"].([]interface{})[row].([]interface{})[idx]
}

func TestUpdateControlState_WritesAllSections(t *testing.T) {
	base := t.TempDir()
	sessionFile := filepath.Join(base, "sessions", "u1", "s1", "model.rawx")
	if err := os.MkdirAll(filepath.Dir(sessionFile), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(sessionFile, []byte(wsTestRawx), 0644); err != nil {
		t.Fatal(err)
	}

	var resultData map[string]interface{}
	if err := json.Unmarshal([]byte(wsTestResult), &resultData); err != nil {
		t.Fatal(err)
	}

	svc := &SessionService{basePath: base}
	if err := svc.UpdateControlState(sessionFile, resultData); err != nil {
		t.Fatalf("UpdateControlState failed: %v", err)
	}

	out, err := os.ReadFile(sessionFile)
	if err != nil {
		t.Fatal(err)
	}
	var rawx map[string]interface{}
	if err := json.Unmarshal(out, &rawx); err != nil {
		t.Fatal(err)
	}
	network := rawx["network"].(map[string]interface{})

	checks := []struct {
		section, field string
		row            int
		want           float64
	}{
		{"bus", "vm", 0, 1.05}, {"bus", "va", 0, -1.2},
		{"bus", "vm", 1, 0.98}, {"bus", "va", 1, -3.4},
		// multi-winding tap writeback (the 3-winding-collapse regression guard)
		{"transformer", "windv1", 0, 1.0375}, {"transformer", "ang1", 0, 0.0},
		{"transformer", "windv2", 0, 0.95}, {"transformer", "ang2", 0, 2.5},
		{"swshunt", "binit", 0, 150.0},
		{"generator", "qg", 0, 42.0}, {"generator", "pg", 0, 55.5},
		{"twotermdc", "tapr", 0, 1.25}, {"twotermdc", "tapi", 0, 1.3},
	}
	for _, c := range checks {
		got, ok := wsCol(t, network, c.section, c.field, c.row).(float64)
		if !ok || got != c.want {
			t.Errorf("%s.%s[%d] = %v, want %v", c.section, c.field, c.row, got, c.want)
		}
	}

	// Generator vs/qt/qb (control targets, not solved state) must be untouched.
	if got := wsCol(t, network, "generator", "vs", 0).(float64); got != 1.0 {
		t.Errorf("generator vs was modified: %v (control targets must not be written back)", got)
	}
}

func TestUpdateControlState_RejectsNonSessionPath(t *testing.T) {
	base := t.TempDir()
	// A file OUTSIDE the sessions directory must be rejected.
	outside := filepath.Join(base, "model", "u1", "case.rawx")
	if err := os.MkdirAll(filepath.Dir(outside), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(outside, []byte(wsTestRawx), 0644); err != nil {
		t.Fatal(err)
	}
	svc := &SessionService{basePath: base}
	if err := svc.UpdateControlState(outside, map[string]interface{}{}); err == nil {
		t.Fatal("expected error for non-session path, got nil")
	}
}
