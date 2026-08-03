package report

import (
	"fmt"
	"math"
	"strings"
)

// flow holds a branch's base-case loading magnitudes.
type flow struct {
	mw  float64 // active power magnitude, MW
	mva float64 // apparent power magnitude, MVA
}

// branchKey is an order-independent key for a branch: low-high terminals plus
// the normalized circuit id.
func branchKey(a, b int, ckt string) string {
	lo, hi := a, b
	if lo > hi {
		lo, hi = hi, lo
	}
	return fmt.Sprintf("%d-%d-%s", lo, hi, strings.ToUpper(strings.TrimSpace(ckt)))
}

// indexBranchFlows extracts per-branch flows from a power flow result. It is
// tolerant of the exact result schema: it tries a range of field names for
// the active/reactive power at each branch end.
func indexBranchFlows(result map[string]interface{}) map[string]flow {
	out := map[string]flow{}
	if result == nil {
		return out
	}
	for _, key := range []string{"acline_results", "transformer_results"} {
		for _, raw := range arr(result, key) {
			rec, ok := raw.(map[string]interface{})
			if !ok {
				continue
			}
			from, ok1 := numOf(rec, "ibus", "fbus", "frombus", "from", "i")
			to, ok2 := numOf(rec, "jbus", "tbus", "tobus", "to", "j")
			if !ok1 || !ok2 {
				continue
			}
			ckt := strOf(rec, "ckt", "id", "ckt_id")
			out[branchKey(int(from), int(to), ckt)] = flowOf(rec)
		}
	}
	return out
}

// flowOf extracts a branch result's MW and MVA loading. Both ends are tried
// and the heavier end is reported.
func flowOf(rec map[string]interface{}) flow {
	pf, okpf := numOf(rec, "p_from", "pfrom", "p_from_mw", "from_mw", "pf", "p", "mw")
	qf, okqf := numOf(rec, "q_from", "qfrom", "q_from_mvar", "from_mvar", "qf", "q", "mvar")
	pt, okpt := numOf(rec, "p_to", "pto", "p_to_mw", "to_mw", "pt")
	qt, okqt := numOf(rec, "q_to", "qto", "q_to_mvar", "to_mvar", "qt")

	var f flow
	if v, ok := numOf(rec, "loading_mva", "mva", "s_from", "from_mva", "mva_from", "apparent_power"); ok {
		f.mva = math.Abs(v)
	}
	if okpf {
		f.mw = math.Abs(pf)
		end := math.Abs(pf)
		if okqf {
			end = math.Hypot(pf, qf)
		}
		if end > f.mva {
			f.mva = end
		}
	}
	if okpt {
		if math.Abs(pt) > f.mw {
			f.mw = math.Abs(pt)
		}
		end := math.Abs(pt)
		if okqt {
			end = math.Hypot(pt, qt)
		}
		if end > f.mva {
			f.mva = end
		}
	}
	if f.mva == 0 {
		f.mva = f.mw
	}
	return f
}

// indexBusVoltages maps bus number to voltage magnitude (pu).
func indexBusVoltages(result map[string]interface{}) map[int]float64 {
	out := map[int]float64{}
	if result == nil {
		return out
	}
	for _, raw := range arr(result, "bus_results") {
		rec, ok := raw.(map[string]interface{})
		if !ok {
			continue
		}
		bus, ok := numOf(rec, "ibus", "bus", "number", "i")
		if !ok {
			continue
		}
		if vm, ok := numOf(rec, "vm", "v", "vmag", "voltage", "vm_pu"); ok {
			out[int(bus)] = vm
		}
	}
	return out
}

// ----- tolerant JSON accessors -----

func arr(m map[string]interface{}, key string) []interface{} {
	if v, ok := m[key].([]interface{}); ok {
		return v
	}
	return nil
}

func numOf(m map[string]interface{}, keys ...string) (float64, bool) {
	for _, k := range keys {
		switch v := m[k].(type) {
		case float64:
			return v, true
		case int:
			return float64(v), true
		}
	}
	return 0, false
}

func strOf(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k].(string); ok {
			return v
		}
	}
	return ""
}
