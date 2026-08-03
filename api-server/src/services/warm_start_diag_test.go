package services

import (
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// Diagnostic (not an assertion gate): run the flat / no-writeback / with-
// writeback iteration experiment on whatever case CASE_RAWX points at, and log
// the numbers verbatim — including convergence — so cases that do NOT converge
// under the default config still report useful data instead of failing.
//
//	CASE_RAWX=/abs/path/to/case.rawx go test ./src/services/ \
//	    -run TestWarmStartDiag -v -count=1 -timeout 30m
func TestWarmStartDiag(t *testing.T) {
	casePath := os.Getenv("CASE_RAWX")
	if casePath == "" {
		t.Skip("set CASE_RAWX=/abs/path/to/case.rawx to run this diagnostic")
	}
	solverBin, _ := filepath.Abs("../../../flow-solver/target/release/flow-solver")
	if _, err := os.Stat(solverBin); err != nil {
		t.Skipf("release solver binary not available: %v", err)
	}
	if _, err := os.Stat(casePath); err != nil {
		t.Skipf("case not available: %v", err)
	}

	svc, base := newTestSessionService(t)
	warmCfg, _ := json.Marshal(acPowerFlowDefaults())
	flatDefaults := acPowerFlowDefaults()
	flatDefaults["flat_start"] = true
	flatCfg, _ := json.Marshal(flatDefaults)

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
		conv, _ := r["converged"].(bool)
		iters, _ := r["iterations"].(float64)
		return conv, int(iters), r
	}

	loadFresh := func(tag string) string {
		t.Helper()
		modelDir := filepath.Join(base, "model", "u1")
		os.MkdirAll(modelDir, 0755)
		name := "case_" + tag + ".rawx"
		dst := filepath.Join(modelDir, name)
		in, err := os.Open(casePath)
		if err != nil {
			t.Fatal(err)
		}
		out, err := os.Create(dst)
		if err != nil {
			in.Close()
			t.Fatal(err)
		}
		if _, err := io.Copy(out, in); err != nil {
			t.Fatal(err)
		}
		in.Close()
		out.Close()
		sid, err := svc.LoadCase("u1", name)
		if err != nil {
			t.Fatalf("LoadCase: %v", err)
		}
		s, _ := svc.GetSession(sid)
		return s.FilePath
	}

	fmtRes := func(conv bool, iters int) string {
		if conv {
			return "converged"
		}
		return "DID NOT CONVERGE (capped)"
	}

	flatConv, flatIters, _ := solve(loadFresh("flat"), flatCfg)

	ctrlFile := loadFresh("control")
	c1conv, c1, _ := solve(ctrlFile, warmCfg)
	c2conv, c2, _ := solve(ctrlFile, warmCfg)

	warmFile := loadFresh("warm")
	w1conv, w1, w1res := solve(warmFile, warmCfg)
	if err := svc.UpdateControlState(warmFile, w1res); err != nil {
		t.Fatalf("UpdateControlState: %v", err)
	}
	w2conv, w2, _ := solve(warmFile, warmCfg)

	t.Logf("")
	t.Logf("  case: %s", filepath.Base(casePath))
	t.Logf("  cold baseline (flat_start=true):  %3d iters  [%s]", flatIters, fmtRes(flatConv, flatIters))
	t.Logf("  --------------------------------------------------------")
	t.Logf("                             Run 1                 Run 2")
	t.Logf("  no writeback   %3d [%s]   %3d [%s]", c1, fmtRes(c1conv, c1), c2, fmtRes(c2conv, c2))
	t.Logf("  with writeback %3d [%s]   %3d [%s]", w1, fmtRes(w1conv, w1), w2, fmtRes(w2conv, w2))
	t.Logf("")
	t.Logf("  writeback delta on re-solve: %d -> %d (%+d iters)", w1, w2, w2-w1)
}
