package report

// BuildFromEngine is the slimmed base-case monitored report builder (change
// `port-studyfile-to-flow-solver`, design D6): it consumes the resolved model
// emitted by `flow-solver validate-study` (`resolved_model`) instead of the
// retired in-process resolver — ratings arrive on the rows, so no network
// access is needed. Output shape and row semantics are identical to Build.

import (
	"api-server/src/studyfile"
)

// EngineResolvedModel mirrors validate-study's `resolved_model` block: the
// retired Go `resolver.ResolvedModel` JSON shape augmented with ratings.
type EngineResolvedModel struct {
	Thermal                  []EngineThermalMonitor  `json:"thermal"`
	Voltage                  []EngineVoltageMonitor  `json:"voltage"`
	Interfaces               []EngineInterface       `json:"interfaces"`
	SkippedContingencyScoped int                     `json:"skipped_contingency_scoped"`
}

// EngineThermalMonitor is a monitored branch with its normal rating.
type EngineThermalMonitor struct {
	From       int     `json:"from"`
	To         int     `json:"to"`
	Ckt        string  `json:"ckt"`
	IsXfmr     bool    `json:"is_xfmr"`
	MonType    string  `json:"mon_type"`
	BaseRating float64 `json:"base_rating"`
}

// EngineVoltageMonitor is a monitored bus with its base-case limits.
type EngineVoltageMonitor struct {
	Bus       int     `json:"bus"`
	MonType   string  `json:"mon_type"`
	Lo        float64 `json:"lo"`
	Hi        float64 `json:"hi"`
	HasLimits bool    `json:"has_limits"`
}

// EngineInterface is a monitored interface; Rating is the effective rating
// (declared, or the summed member RATE1s — the fallback is already applied).
type EngineInterface struct {
	Name      string                  `json:"name"`
	Rating    float64                 `json:"rating"`
	HasRating bool                    `json:"has_rating"`
	Members   []EngineInterfaceMember `json:"members"`
}

// EngineInterfaceMember is one branch of a monitored interface.
type EngineInterfaceMember struct {
	From   int     `json:"from"`
	To     int     `json:"to"`
	Ckt    string  `json:"ckt"`
	Factor float64 `json:"factor"`
}

// BuildFromEngine post-processes a flow-solver power flow result against the
// engine-resolved study model. parseDiags carries the parse and resolution
// diagnostics (from validate-study plus any service-level ones).
func BuildFromEngine(result map[string]interface{}, rm *EngineResolvedModel,
	parseDiags studyfile.Diagnostics) *MonitoredReport {
	diags := parseDiags
	rep := &MonitoredReport{
		Thermal:    []ThermalGroup{},
		Voltage:    []VoltageRow{},
		Interfaces: []InterfaceRow{},
	}
	if rm == nil {
		rm = &EngineResolvedModel{}
	}

	branchFlows := indexBranchFlows(result)
	busVm := indexBusVoltages(result)

	// ----- thermal -----
	groupOrder := []string{}
	groups := map[string]*ThermalGroup{}
	for _, tm := range rm.Thermal {
		row := ThermalRow{From: tm.From, To: tm.To, Ckt: tm.Ckt, IsXfmr: tm.IsXfmr}
		if tm.BaseRating > 0 {
			row.Rating, row.HasRating = tm.BaseRating, true
		}
		if f, ok := branchFlows[branchKey(tm.From, tm.To, tm.Ckt)]; ok {
			row.FlowMW, row.FlowMVA = f.mw, f.mva
		}
		if row.HasRating && row.FlowMVA > 0 {
			row.LoadingPct = row.FlowMVA / row.Rating * 100
			row.HasLoading = true
			row.Violation = row.LoadingPct > 100
		} else if !row.HasRating {
			diags.Warn("", 0, "report_no_rating",
				"monitored branch "+branchKey(tm.From, tm.To, tm.Ckt)+
					" has no rating — loading not computed")
		}
		g, ok := groups[tm.MonType]
		if !ok {
			g = &ThermalGroup{MonType: tm.MonType}
			groups[tm.MonType] = g
			groupOrder = append(groupOrder, tm.MonType)
		}
		g.Rows = append(g.Rows, row)
	}
	for _, mt := range groupOrder {
		rep.Thermal = append(rep.Thermal, *groups[mt])
	}

	// ----- voltage -----
	for _, vm := range rm.Voltage {
		row := VoltageRow{Bus: vm.Bus, MonType: vm.MonType,
			Lo: vm.Lo, Hi: vm.Hi, HasLimits: vm.HasLimits}
		if v, ok := busVm[vm.Bus]; ok {
			row.Vm = v
			if vm.HasLimits {
				row.Violation = v < vm.Lo || v > vm.Hi
			}
		}
		rep.Voltage = append(rep.Voltage, row)
	}

	// ----- interfaces -----
	for _, in := range rm.Interfaces {
		row := InterfaceRow{Name: in.Name}
		for _, mem := range in.Members {
			if f, ok := branchFlows[branchKey(mem.From, mem.To, mem.Ckt)]; ok {
				row.FlowMW += f.mw * mem.Factor
			}
		}
		if in.Rating > 0 {
			row.Rating, row.HasRating = in.Rating, true
		}
		if row.HasRating && row.Rating > 0 {
			row.LoadingPct = abs(row.FlowMW) / row.Rating * 100
			row.HasLoading = true
			row.Violation = abs(row.FlowMW) > row.Rating
		}
		rep.Interfaces = append(rep.Interfaces, row)
	}

	// ----- diagnostics & summary -----
	rep.Diagnostics = diags.List()
	rep.Summary = Summary{
		MonitoredBranches: len(rm.Thermal),
		MonitoredBuses:    len(rm.Voltage),
		Interfaces:        len(rm.Interfaces),
		Violations:        countViolations(rep),
		Skipped:           countSkipped(diags),
	}
	return rep
}

func abs(f float64) float64 {
	if f < 0 {
		return -f
	}
	return f
}
