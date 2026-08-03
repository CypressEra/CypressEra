package services

import (
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// Demonstration: the simplest proof that warm-start control writeback works —
// compare solver iteration counts across two consecutive solves.
//
// It runs a 2x2 controlled experiment so the writeback is shown to be the
// CAUSE of the speedup, not some solver-internal caching:
//
//	                Run 1    Run 2
//	no writeback     N        N      (file unchanged -> identical)
//	with writeback   N        M<N    (warm-started from solved controls)
//
// Skips when the example case or release solver binary is absent, or -short.
func TestWarmStartDemo_IterationComparison(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping warm-start iteration demo in -short mode")
	}
	examplePath, _ := filepath.Abs("../../../flow-solver/examples/31HS2ap.rawx")
	solverBin, _ := filepath.Abs("../../../flow-solver/target/release/flow-solver")
	if _, err := os.Stat(examplePath); err != nil {
		t.Skipf("example case not available: %v", err)
	}
	if _, err := os.Stat(solverBin); err != nil {
		t.Skipf("release solver binary not available: %v", err)
	}

	svc, base := newTestSessionService(t)
	warmCfg, err := json.Marshal(acPowerFlowDefaults()) // flat_start:false (default)
	if err != nil {
		t.Fatal(err)
	}
	flatDefaults := acPowerFlowDefaults()
	flatDefaults["flat_start"] = true // the escape hatch: ignore stored v/controls
	flatCfg, err := json.Marshal(flatDefaults)
	if err != nil {
		t.Fatal(err)
	}

	// solve runs the release solver on workingFile exactly as SolverService
	// does, with the given config, and returns (converged, iterations, raw).
	solve := func(workingFile string, cfg []byte) (bool, int, map[string]interface{}) {
		t.Helper()
		outPath := filepath.Join(t.TempDir(), "out.json")
		cmd := exec.Command(solverBin, "solve-flow",
			"--input", `{"type": "rawx", "rawpath": "`+workingFile+`"}`,
			"--config", string(cfg),
			"--output", outPath,
			"--progress", filepath.Join(t.TempDir(), "p.jsonl"),
		)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("solve failed: %v\n%s", err, out)
		}
		raw, err := os.ReadFile(outPath)
		if err != nil {
			t.Fatal(err)
		}
		var r map[string]interface{}
		if err := json.Unmarshal(raw, &r); err != nil {
			t.Fatal(err)
		}
		converged, _ := r["converged"].(bool)
		iters, _ := r["iterations"].(float64)
		return converged, int(iters), r
	}

	// loadFreshWorkingFile places the example in the model library under a
	// unique name and creates a brand-new session working copy (so each arm
	// starts from the identical, untouched source state).
	loadFreshWorkingFile := func(tag string) string {
		t.Helper()
		modelDir := filepath.Join(base, "model", "u1")
		if err := os.MkdirAll(modelDir, 0755); err != nil {
			t.Fatal(err)
		}
		dst := filepath.Join(modelDir, "31HS2ap_"+tag+".rawx")
		in, err := os.Open(examplePath)
		if err != nil {
			t.Fatal(err)
		}
		defer in.Close()
		out, err := os.Create(dst)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := io.Copy(out, in); err != nil {
			out.Close()
			t.Fatal(err)
		}
		out.Close()

		sessionID, err := svc.LoadCase("u1", "31HS2ap_"+tag+".rawx")
		if err != nil {
			t.Fatalf("LoadCase: %v", err)
		}
		session, _ := svc.GetSession(sessionID)
		return session.FilePath
	}

	// --- Cold baseline: a true flat start (flat_start=true) ignores the
	// file's stored voltages/controls. This is the ONLY genuinely cold solve;
	// it exists to show that the default two runs are BOTH warm starts. ---
	flatFile := loadFreshWorkingFile("flat")
	flatConv, flatIters, _ := solve(flatFile, flatCfg)

	// --- Control arm: solve twice with the default (warm) config, NO
	// writeback in between. Both runs warm-start from the SAME shipped state. ---
	ctrlFile := loadFreshWorkingFile("control")
	ctrlConv1, ctrlIters1, _ := solve(ctrlFile, warmCfg)
	ctrlConv2, ctrlIters2, _ := solve(ctrlFile, warmCfg)

	// --- Warm arm: solve, WRITE BACK the converged controls, solve again.
	// Run 2 warm-starts from the upgraded (converged-control) state. ---
	warmFile := loadFreshWorkingFile("warm")
	warmConv1, warmIters1, warmResult := solve(warmFile, warmCfg)
	if err := svc.UpdateControlState(warmFile, warmResult); err != nil {
		t.Fatalf("UpdateControlState: %v", err)
	}
	warmConv2, warmIters2, _ := solve(warmFile, warmCfg)

	flatStatus := "converged"
	if !flatConv {
		flatStatus = "DID NOT CONVERGE (hit iteration cap)"
	}
	t.Logf("")
	t.Logf("  cold baseline (flat_start=true):          %3d iters  [%s]", flatIters, flatStatus)
	t.Logf("  ------------------------------------------------------")
	t.Logf("                            Run 1    Run 2")
	t.Logf("  no writeback (same state)  %3d      %3d", ctrlIters1, ctrlIters2)
	t.Logf("  with writeback (upgraded)  %3d      %3d", warmIters1, warmIters2)
	t.Logf("")

	// The four DEFAULT-config solves must converge (the flat baseline is only
	// illustrative — on this case a true cold start need not converge at all,
	// which is itself the point: the stored operating point is what makes it
	// solvable, and every default solve warm-starts from it).
	for _, c := range []bool{ctrlConv1, ctrlConv2, warmConv1, warmConv2} {
		if !c {
			t.Fatal("a default-config solve did not converge; iteration comparison is meaningless")
		}
	}
	// The shipped file already warm-starts: the default first run should beat
	// the true cold (flat) baseline. (Confirms "both runs are warm start".)
	if flatConv && warmIters1 >= flatIters {
		t.Logf("NOTE: warm run 1 (%d) did not beat flat start (%d) — the shipped "+
			"operating point did not help this case", warmIters1, flatIters)
	}
	// Both arms start from the same shipped state -> equal first-run iters.
	if ctrlIters1 != warmIters1 {
		t.Errorf("first-run iterations differ across arms (%d vs %d) — arms did not start identically",
			ctrlIters1, warmIters1)
	}
	// Control arm: no writeback -> file unchanged -> the second solve takes the
	// SAME iterations. Proves the file does not warm-start itself and isolates
	// the writeback as the only cause of any run-2 improvement.
	if ctrlIters2 != ctrlIters1 {
		t.Errorf("no-writeback run 2 = %d iters, expected %d (unchanged file must re-solve identically)",
			ctrlIters2, ctrlIters1)
	}
	// Warm arm: writeback -> the second solve warm-starts from converged
	// controls -> FEWER iterations than run 1 (and than the control arm's run 2).
	if warmIters2 >= warmIters1 {
		t.Errorf("with-writeback run 2 = %d iters, expected fewer than run 1 (%d) — no warm-start benefit",
			warmIters2, warmIters1)
	}
	t.Logf("writeback saved %d iterations on re-solve (%d -> %d); "+
		"control arm stayed at %d; true cold (flat) = %d",
		warmIters1-warmIters2, warmIters1, warmIters2, ctrlIters2, flatIters)
}
