package contingency

import "testing"

func TestSettingsValidate(t *testing.T) {
	bad := -1.0
	cases := []struct {
		name string
		s    *Settings
		ok   bool
	}{
		{"nil is fine", nil, true},
		{"defaults via empty", &Settings{}, true},
		{"valid scope+basis", &Settings{ReportScope: "thermal", TransformerLoadingBasis: "amps"}, true},
		{"bad scope", &Settings{ReportScope: "everything"}, false},
		{"bad basis", &Settings{NonTransformerLoadingBasis: "kva"}, false},
		{"negative threshold", &Settings{LoadingThresholdPct: &bad}, false},
	}
	for _, c := range cases {
		err := c.s.Validate()
		if (err == nil) != c.ok {
			t.Errorf("%s: Validate() err = %v, want ok=%v", c.name, err, c.ok)
		}
	}
}

func TestSettingsWithDefaults(t *testing.T) {
	out := (*Settings)(nil).WithDefaults()
	if out.ReportScope != "both" || *out.LoadingThresholdPct != 100.0 ||
		out.TransformerLoadingBasis != "mva" || out.NonTransformerLoadingBasis != "amps" {
		t.Errorf("defaults = %#v", out)
	}
}
