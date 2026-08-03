package services

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// Acceptance gate for the sanitize-rawx-escapes-on-load change, run against
// the real 24 MB PSS/E 35.6 export that motivated it. Exercises the full
// pipeline: LoadCase sanitizing copy → flow-solver AC solve → warm-start
// control writeback (the exact call that previously failed with `invalid
// character 'U' in string escape code`) → second solve on the warm file →
// SaveCaseAs round-trip. Skips when the example file or the release solver
// binary is absent (e.g. CI checkouts without flow-solver artifacts) and
// under -short.
func TestE2E_31HS2ap_SanitizeSolveWriteback(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping 31HS2ap end-to-end acceptance in -short mode")
	}
	examplePath, err := filepath.Abs("../../../flow-solver/examples/31HS2ap.rawx")
	if err != nil {
		t.Fatal(err)
	}
	solverBin, err := filepath.Abs("../../../flow-solver/target/release/flow-solver")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(examplePath); err != nil {
		t.Skipf("example case not available: %v", err)
	}
	if _, err := os.Stat(solverBin); err != nil {
		t.Skipf("release solver binary not available: %v", err)
	}

	svc, base := newTestSessionService(t)

	// Place the real export in the user's model library (streamed, not read
	// into memory) and create the session working copy through LoadCase.
	modelDir := filepath.Join(base, "model", "u1")
	if err := os.MkdirAll(modelDir, 0755); err != nil {
		t.Fatal(err)
	}
	copyStream := func(src, dst string) {
		t.Helper()
		in, err := os.Open(src)
		if err != nil {
			t.Fatal(err)
		}
		defer in.Close()
		out, err := os.Create(dst)
		if err != nil {
			t.Fatal(err)
		}
		defer out.Close()
		if _, err := io.Copy(out, in); err != nil {
			t.Fatal(err)
		}
	}
	copyStream(examplePath, filepath.Join(modelDir, "31HS2ap.rawx"))

	sessionID, err := svc.LoadCase("u1", "31HS2ap.rawx")
	if err != nil {
		t.Fatalf("LoadCase: %v", err)
	}
	session, ok := svc.GetSession(sessionID)
	if !ok {
		t.Fatal("session not found")
	}
	workingFile := session.FilePath

	// 5.1 — the working file is strictly valid JSON, the source was invalid,
	// and the two defective transformer names decode to the solver-identical
	// strings with no uppercase \U escapes left behind.
	srcBytes, err := os.ReadFile(examplePath)
	if err != nil {
		t.Fatal(err)
	}
	if json.Valid(srcBytes) {
		t.Fatal("precondition: the raw example is expected to be invalid JSON")
	}
	working, err := os.ReadFile(workingFile)
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(working) {
		t.Fatal("working file is not strictly valid JSON after LoadCase")
	}
	if bytes.Contains(working, []byte(`\U00E3`)) {
		t.Fatal("uppercase \\U escapes survived sanitization")
	}
	// Fresh sanitization keeps the escape TEXT (lowercased); raw UTF-8 only
	// appears once a writeback re-marshals the file. Accept either encoding —
	// both decode to the same string. BOTH defective names (the parallel
	// transformer pair) must survive.
	escText := []byte("T\\u00E3\\u201C\\u00E3\\u2021U")
	if !bytes.Contains(working, escText) && !bytes.Contains(working, []byte("Tã“ã‡U")) {
		t.Fatal("repaired transformer name not found in working file")
	}
	escText1 := append(append([]byte{}, escText...), []byte("_1")...)
	if !bytes.Contains(working, escText1) && !bytes.Contains(working, []byte("Tã“ã‡U_1")) {
		t.Fatal("second repaired transformer name (_1) not found in working file")
	}

	// Solve helper: runs the release solver the same way SolverService does.
	cfg, err := json.Marshal(acPowerFlowDefaults())
	if err != nil {
		t.Fatal(err)
	}
	solve := func(label string) map[string]interface{} {
		t.Helper()
		outPath := filepath.Join(t.TempDir(), "out.json")
		progressPath := filepath.Join(t.TempDir(), "progress.jsonl")
		cmd := exec.Command(solverBin, "solve-flow",
			"--input", `{"type": "rawx", "rawpath": "`+workingFile+`"}`,
			"--config", string(cfg),
			"--output", outPath,
			"--progress", progressPath,
		)
		start := time.Now()
		if outBytes, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s solve failed: %v\n%s", label, err, outBytes)
		}
		raw, err := os.ReadFile(outPath)
		if err != nil {
			t.Fatalf("%s solve produced no output: %v", label, err)
		}
		var result map[string]interface{}
		if err := json.Unmarshal(raw, &result); err != nil {
			t.Fatalf("%s solve output is not JSON: %v", label, err)
		}
		converged, _ := result["converged"].(bool)
		iters, _ := result["iterations"].(float64)
		t.Logf("%s solve: converged=%v iterations=%v elapsed=%s", label, converged, iters, time.Since(start).Round(time.Millisecond))
		if !converged {
			t.Fatalf("%s solve did not converge", label)
		}
		return result
	}

	// 5.2 — cold solve, then the warm-start writeback that used to fail.
	cold := solve("cold")
	if err := svc.UpdateControlState(workingFile, cold); err != nil {
		t.Fatalf("UpdateControlState on sanitized 31HS2ap working file: %v", err)
	}
	afterWriteback, err := os.ReadFile(workingFile)
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(afterWriteback) {
		t.Fatal("working file invalid after warm-start writeback")
	}
	// The writeback re-marshals the document, so the repaired names must now
	// be present as raw UTF-8 — content preserved across the round-trip.
	if !bytes.Contains(afterWriteback, []byte("Tã“ã‡U")) {
		t.Fatal("repaired transformer name lost across the writeback re-marshal")
	}
	if !bytes.Contains(afterWriteback, []byte("Tã“ã‡U_1")) {
		t.Fatal("second repaired transformer name (_1) lost across the writeback re-marshal")
	}

	// 5.3 — the second solve consumes the warm working file without error,
	// and the save round-trip yields a strictly valid library file whose
	// re-load takes the byte-identical fast path.
	solve("warm")

	if err := svc.SaveCaseAs(sessionID, "31HS2ap_healed.rawx"); err != nil {
		t.Fatalf("SaveCaseAs: %v", err)
	}
	libFile := filepath.Join(modelDir, "31HS2ap_healed.rawx")
	libBytes, err := os.ReadFile(libFile)
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(libBytes) {
		t.Fatal("library file from SaveCaseAs is not strictly valid JSON")
	}

	session2File := loadCaseWorkingFile(t, svc, "u1", "31HS2ap_healed.rawx")
	reload, err := os.ReadFile(session2File)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(reload, libBytes) {
		t.Fatal("re-load of healed library file was not a byte-identical fast-path copy")
	}
}
