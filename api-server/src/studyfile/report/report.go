// Package report post-processes a power flow result against a resolved study
// model, producing the base-case monitored report: thermal loadings, voltage
// checks, and interface flows.
package report

import (

	"api-server/src/studyfile"
)

// ThermalRow is one monitored branch's base-case loading.
type ThermalRow struct {
	From       int     `json:"from"`
	To         int     `json:"to"`
	Ckt        string  `json:"ckt"`
	IsXfmr     bool    `json:"is_xfmr"`
	FlowMW     float64 `json:"flow_mw"`
	FlowMVA    float64 `json:"flow_mva"`
	Rating     float64 `json:"rating,omitempty"`
	HasRating  bool    `json:"has_rating"`
	LoadingPct float64 `json:"loading_pct,omitempty"`
	HasLoading bool    `json:"has_loading"`
	Violation  bool    `json:"violation"`
}

// ThermalGroup groups thermal rows by MONTYPE label.
type ThermalGroup struct {
	MonType string       `json:"mon_type"`
	Rows    []ThermalRow `json:"rows"`
}

// VoltageRow is one monitored bus's base-case voltage check.
type VoltageRow struct {
	Bus       int     `json:"bus"`
	MonType   string  `json:"mon_type,omitempty"`
	Vm        float64 `json:"vm"`
	Lo        float64 `json:"lo,omitempty"`
	Hi        float64 `json:"hi,omitempty"`
	HasLimits bool    `json:"has_limits"`
	Violation bool    `json:"violation"`
}

// InterfaceRow is one monitored interface's base-case flow.
type InterfaceRow struct {
	Name       string  `json:"name"`
	FlowMW     float64 `json:"flow_mw"`
	Rating     float64 `json:"rating,omitempty"`
	HasRating  bool    `json:"has_rating"`
	LoadingPct float64 `json:"loading_pct,omitempty"`
	HasLoading bool    `json:"has_loading"`
	Violation  bool    `json:"violation"`
}

// Summary holds the report's headline counts.
type Summary struct {
	MonitoredBranches int `json:"monitored_branches"`
	MonitoredBuses    int `json:"monitored_buses"`
	Interfaces        int `json:"interfaces"`
	Violations        int `json:"violations"`
	Skipped           int `json:"skipped"`
}

// MonitoredReport is the base-case post-processing result.
type MonitoredReport struct {
	Thermal     []ThermalGroup         `json:"thermal"`
	Voltage     []VoltageRow           `json:"voltage"`
	Interfaces  []InterfaceRow         `json:"interfaces"`
	Diagnostics []studyfile.Diagnostic `json:"diagnostics"`
	Summary     Summary                `json:"summary"`
}

func countViolations(rep *MonitoredReport) int {
	n := 0
	for _, g := range rep.Thermal {
		for _, r := range g.Rows {
			if r.Violation {
				n++
			}
		}
	}
	for _, v := range rep.Voltage {
		if v.Violation {
			n++
		}
	}
	for _, in := range rep.Interfaces {
		if in.Violation {
			n++
		}
	}
	return n
}

// countSkipped counts warn-and-skip diagnostics — each marks a skipped
// construct.
func countSkipped(d studyfile.Diagnostics) int {
	n := 0
	for _, it := range d.Items {
		if it.Severity == studyfile.SeverityWarning {
			n++
		}
	}
	return n
}
