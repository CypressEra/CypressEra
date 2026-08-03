package services

import (
	"reflect"
	"testing"
)

// missingStudyFiles must return the canonical-order list of empty slots so
// the handler can emit a deterministic "Missing: sub, mon, con." style
// message the chat agent reads to recover.
func TestMissingStudyFiles(t *testing.T) {
	cases := []struct {
		name             string
		sub, mon, con    string
		want             []string
	}{
		{"all loaded → nothing missing", "a.sub", "a.mon", "a.con", nil},
		{"only sub missing", "", "a.mon", "a.con", []string{"sub"}},
		{"only mon missing", "a.sub", "", "a.con", []string{"mon"}},
		{"only con missing", "a.sub", "a.mon", "", []string{"con"}},
		{"sub + mon missing → sub first", "", "", "a.con", []string{"sub", "mon"}},
		{"sub + con missing", "", "a.mon", "", []string{"sub", "con"}},
		{"mon + con missing", "a.sub", "", "", []string{"mon", "con"}},
		{"all three missing → sub, mon, con", "", "", "", []string{"sub", "mon", "con"}},
	}
	for _, c := range cases {
		got := missingStudyFiles(c.sub, c.mon, c.con)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}

// The running violation count must exclude contingencies that did not
// converge or that islanded, and (via the solver's count) sub-100% records.
func TestContingencyViolationCount(t *testing.T) {
	cases := []struct {
		name      string
		converged bool
		islanded  bool
		reported  float64
		want      int
	}{
		{"converged contributes its violations", true, false, 3, 3},
		{"islanded contributes nothing", true, true, 5, 0},
		{"non-converged contributes nothing", false, false, 2, 0},
		{"converged with none", true, false, 0, 0},
	}
	for _, c := range cases {
		body := map[string]interface{}{
			"converged":  c.converged,
			"islanded":   c.islanded,
			"violations": c.reported,
		}
		if got := contingencyViolationCount(body); got != c.want {
			t.Errorf("%s: got %d, want %d", c.name, got, c.want)
		}
	}
}
