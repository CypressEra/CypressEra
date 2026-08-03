package services

// acPowerFlowDefaults returns the canonical AC power-flow configuration that
// the flow-solver applies when a field is absent from its input. The keys and
// values here MUST stay in lock-step with the Rust fallback in
// flow-solver/src/utils/config/io.rs (`load_from_json_with_defaults`, the
// fallback `PowerFlowConfig { … }` block) — that file is the source of truth.
//
// Two other places also mirror these values; if any of the three changes, all
// three must move together:
//   - flow-solver/src/utils/config/io.rs (Rust, authoritative)
//   - react-ui/src/contexts/SolverSettingsContext.tsx (AC_SETTINGS_DEFAULTS)
//   - this function
//
// powerflow_defaults_test.go pins the exact key/value set as a drift detector.
//
// Solver-internal knobs the UI never surfaces (lossless_network,
// enable_validation, verbose_output, output_format, strip_vector_group_from_ang1)
// are intentionally omitted — including them in the persisted meta would just
// add noise users can't act on.
func acPowerFlowDefaults() map[string]interface{} {
	return map[string]interface{}{
		"method":                      "fnsl",
		"tolerance":                   1e-3,
		"max_iterations":              100,
		"flat_start":                  false,
		"max_outerloop_iterations":    50,
		"control_tolerance":           0.1,
		"tap_adjustment":              "stepping",
		"phase_shift_adjustment":      true,
		"dc_tap_adjustment":           true,
		"switched_shunt_adjustment":   "enable_all",
		"area_interchange_adjustment": "disabled",
	}
}

// mergeWithACDefaults returns a fresh map that starts from acPowerFlowDefaults
// and overlays any keys the caller supplied. method is forced to "fnsl" after
// the merge since ACCC (and every other caller of this helper today) is AC by
// definition. Nil and empty-map inputs are treated identically — both yield
// the full default set.
func mergeWithACDefaults(caller map[string]interface{}) map[string]interface{} {
	out := acPowerFlowDefaults()
	for k, v := range caller {
		out[k] = v
	}
	out["method"] = "fnsl"
	return out
}
