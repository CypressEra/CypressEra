package contingency

// Settings survives the retirement of the input-side package (change
// `port-studyfile-to-flow-solver`): it configures an ACCC run and rides the
// study-driven `solve-contingency` input as well as the persisted
// study-result metadata.

import (
	"fmt"
	"strings"
)

// Settings configures an ACCC run: which monitored elements to report and how
// branch loading is measured. A nil field falls back to the engine default.
type Settings struct {
	// ReportScope: "thermal" | "voltage" | "both" (default both).
	ReportScope string `json:"report_scope,omitempty"`
	// LoadingThresholdPct: minimum branch loading at which a thermal record is
	// reported (default 100).
	LoadingThresholdPct *float64 `json:"loading_threshold_pct,omitempty"`
	// TransformerLoadingBasis / NonTransformerLoadingBasis: "mva" | "amps".
	// Defaults match PSS/E and TARA — transformers MVA, non-transformers Amps.
	TransformerLoadingBasis    string `json:"transformer_loading_basis,omitempty"`
	NonTransformerLoadingBasis string `json:"nontransformer_loading_basis,omitempty"`
	// Workers: contingency-solve worker count (`scale-accc-multicore`).
	// Nil/0 = automatic — the parallelism the OS/container grants the
	// engine process; the engine clamps to the contingency count.
	Workers *int `json:"workers,omitempty"`
	// WarmStart: contingency warm-start mode (`adaptive-accc-warm-start`).
	// "" (default) = auto — the engine probes and picks the working start;
	// "always" = warm-first everywhere; "never" = cold-first everywhere.
	WarmStart string `json:"warm_start,omitempty"`
}

// WithDefaults returns a copy of s with every absent field filled with its
// canonical default. A nil receiver yields a fully-defaulted Settings value
// (not nil), so callers can use this to materialize the effective settings
// regardless of what the user passed.
//
// Defaults mirror the documentation on the Settings struct above (PSS/E /
// TARA conventions): report_scope="both", loading_threshold_pct=100,
// transformer_loading_basis="mva", nontransformer_loading_basis="amps".
func (s *Settings) WithDefaults() Settings {
	var out Settings
	if s != nil {
		out = *s
	}
	if out.ReportScope == "" {
		out.ReportScope = "both"
	}
	if out.LoadingThresholdPct == nil {
		v := 100.0
		out.LoadingThresholdPct = &v
	}
	if out.TransformerLoadingBasis == "" {
		out.TransformerLoadingBasis = "mva"
	}
	if out.NonTransformerLoadingBasis == "" {
		out.NonTransformerLoadingBasis = "amps"
	}
	return out
}

// Validate rejects out-of-range settings. Empty enum fields are allowed — the
// engine applies its default.
func (s *Settings) Validate() error {
	if s == nil {
		return nil
	}
	switch strings.ToLower(s.ReportScope) {
	case "", "thermal", "voltage", "both":
	default:
		return fmt.Errorf("report_scope must be 'thermal', 'voltage', or 'both'")
	}
	for field, val := range map[string]string{
		"transformer_loading_basis":    s.TransformerLoadingBasis,
		"nontransformer_loading_basis": s.NonTransformerLoadingBasis,
	} {
		switch strings.ToLower(val) {
		case "", "mva", "amps":
		default:
			return fmt.Errorf("%s must be 'mva' or 'amps'", field)
		}
	}
	if s.LoadingThresholdPct != nil && *s.LoadingThresholdPct < 0 {
		return fmt.Errorf("loading_threshold_pct must not be negative")
	}
	if s.Workers != nil && *s.Workers < 0 {
		return fmt.Errorf("workers must not be negative (0 = automatic)")
	}
	switch strings.ToLower(s.WarmStart) {
	case "", "auto", "always", "never":
	default:
		return fmt.Errorf("warm_start must be 'auto', 'always', or 'never'")
	}
	return nil
}
