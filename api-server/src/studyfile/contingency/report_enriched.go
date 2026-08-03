package contingency

// BuildReportEnriched flattens engine output whose records were ALREADY
// enriched by the flow-solver (design D6 of `port-studyfile-to-flow-solver`):
// same flattening, status rows, and summary as BuildReport, with no network
// index — bus names, kV, facility labels, and contingency names arrive on the
// records themselves.
func BuildReportEnriched(out EngineOutput) Report {
	results := []EngineViolation{}
	summary := ReportSummary{Total: len(out.Contingencies)}

	for vi := range out.Base.Violations {
		row := out.Base.Violations[vi]
		row.Status = "converged"
		if row.ContName == nil {
			cn := "Base Case"
			row.ContName = &cn
		}
		results = append(results, row)
	}

	for ci := range out.Contingencies {
		c := &out.Contingencies[ci]
		switch {
		case !c.Converged:
			summary.NonConverged++
			results = append(results, statusRow(c.Name, "non-converged"))
		case c.Islanded:
			summary.Islanded++
			results = append(results, statusRow(c.Name, "islanded"))
		default:
			real := false
			for vi := range c.Violations {
				row := c.Violations[vi]
				row.Status = "converged"
				if row.ContName == nil && c.Name != "" {
					cn := c.Name
					row.ContName = &cn
				}
				if row.isRealViolation() {
					real = true
				}
				results = append(results, row)
			}
			if real {
				summary.WithViolations++
			}
		}
	}
	return Report{Results: results, Summary: summary}
}
