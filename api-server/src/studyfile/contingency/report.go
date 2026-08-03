package contingency

// This file defines the `solve-contingency` engine output (the shape the
// flow-solver command writes) and the api-server contingency report — the
// engine output, enriched with bus names / kV / monitored-facility labels,
// plus a run summary.

// EngineOutput is the raw JSON the flow-solver `solve-contingency` command
// writes to its `--output` file.
type EngineOutput struct {
	Base          EngineBase          `json:"base"`
	Contingencies []EngineContingency `json:"contingencies"`
}

// EngineBase is the base-case (pre-contingency) monitored state.
type EngineBase struct {
	Converged  bool              `json:"converged"`
	Violations []EngineViolation `json:"violations"`
}

// EngineContingency is one contingency's outcome.
type EngineContingency struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Converged  bool              `json:"converged"`
	Islanded   bool              `json:"islanded"`
	Violations []EngineViolation `json:"violations"`
}

// EngineViolation is one row of the flat report. A monitored-element row has
// a Type (thermal/voltage/interface) and Status `converged`; a contingency
// status row has no Type and Status `non-converged`/`islanded`. The solver
// emits the numeric fields; the api-server fills the enrichment fields
// (monitored facility, kV, names, contingency name) and Status.
type EngineViolation struct {
	Type string `json:"type,omitempty"` // thermal | voltage | interface; absent on a status row
	// Status of the contingency this row belongs to: converged | non-converged | islanded.
	Status string `json:"status"`

	// ----- thermal -----
	MonitoredFacility *string  `json:"monitored_facility,omitempty"` // enriched
	FromBus           *int     `json:"from_bus,omitempty"`
	ToBus             *int     `json:"to_bus,omitempty"`
	Ckt               *string  `json:"ckt,omitempty"`
	Winding           *int     `json:"winding,omitempty"`
	FromKv            *float64 `json:"from_kv,omitempty"` // enriched
	ToKv              *float64 `json:"to_kv,omitempty"`   // enriched
	BaseRatingMva     *float64 `json:"base_rating_mva,omitempty"`
	ContRatingMva     *float64 `json:"cont_rating_mva,omitempty"`
	ContName          *string  `json:"cont_name,omitempty"` // enriched
	ContLoadingMva    *float64 `json:"cont_loading_mva,omitempty"`
	ContLoadingPct    *float64 `json:"cont_loading_pct,omitempty"`
	BaseLoadingMva    *float64 `json:"base_loading_mva,omitempty"`
	BaseLoadingPct    *float64 `json:"base_loading_pct,omitempty"`
	Violation         *bool    `json:"violation,omitempty"`

	// ----- voltage -----
	Bus                  *int     `json:"bus,omitempty"`
	BusName              *string  `json:"bus_name,omitempty"` // enriched
	BusKv                *float64 `json:"bus_kv,omitempty"`   // enriched
	VoltUpperLimitPu     *float64 `json:"volt_upper_limit_pu,omitempty"`
	VoltLowerLimitPu     *float64 `json:"volt_lower_limit_pu,omitempty"`
	VoltDeviationLimitPu *float64 `json:"volt_deviation_limit_pu,omitempty"`
	ContVoltagePu        *float64 `json:"cont_voltage_pu,omitempty"`
	BaseVoltagePu        *float64 `json:"base_voltage_pu,omitempty"`
	ContDeviationPu      *float64 `json:"cont_deviation_pu,omitempty"`

	// ----- interface -----
	Name *string `json:"name,omitempty"`
}

// isRealViolation reports whether the record counts toward the violation
// totals. Thermal records below 100% (Violation == false) are reported but do
// not count; voltage and interface records always count.
func (v EngineViolation) isRealViolation() bool {
	return v.Violation == nil || *v.Violation
}

// ReportSummary holds the run's headline counts.
type ReportSummary struct {
	Total          int `json:"total"`
	NonConverged   int `json:"non_converged"`
	Islanded       int `json:"islanded"`
	WithViolations int `json:"with_violations"`
}

// Report is the api-server contingency report: a flat list of mon/con-pair
// result rows plus a summary of the run.
type Report struct {
	Results []EngineViolation `json:"results"`
	Summary ReportSummary     `json:"summary"`
}

// statusRow builds a contingency-status row — no monitored element, just the
// contingency name and its non-converged / islanded status.
func statusRow(contName, status string) EngineViolation {
	cn := contName
	return EngineViolation{Status: status, ContName: &cn}
}
