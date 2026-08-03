package services

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"go.uber.org/zap"
)

// writeFakeSolver writes an executable shell script that emulates the
// flow-solver CLI for the behaviours under test. `body` is the script body;
// it receives the original args. Skips on non-POSIX platforms.
func writeFakeSolver(t *testing.T, body string) string {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("fake solver script requires a POSIX shell")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "fake-solver.sh")
	script := "#!/bin/sh\n" + body + "\n"
	if err := os.WriteFile(path, []byte(script), 0755); err != nil {
		t.Fatalf("write fake solver: %v", err)
	}
	return path
}

func TestRunSolver_Success(t *testing.T) {
	solver := writeFakeSolver(t, `exit 0`)
	run, err := RunSolver(context.Background(), solver, nil, 5*time.Second, zap.NewNop())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if run.ExitCode != 0 {
		t.Fatalf("expected exit 0, got %d", run.ExitCode)
	}
	if run.TimedOut {
		t.Fatal("did not expect timeout")
	}
}

func TestRunSolver_NonZeroExitWithStructuredError(t *testing.T) {
	solver := writeFakeSolver(t, `echo 'some log line' >&2
echo '{"error":"bad input","kind":"parse_error"}' >&2
exit 1`)
	run, err := RunSolver(context.Background(), solver, nil, 5*time.Second, zap.NewNop())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if run.ExitCode != 1 {
		t.Fatalf("expected exit 1, got %d", run.ExitCode)
	}
	solverErr := ExtractSolverError(run.Stderr)
	if solverErr == nil {
		t.Fatal("expected a structured solver error")
	}
	msg := solverErr.Error()
	if want := "parse_error"; !strings.Contains(msg, want) {
		t.Errorf("error %q should mention kind %q", msg, want)
	}
	if want := "bad input"; !strings.Contains(msg, want) {
		t.Errorf("error %q should mention message %q", msg, want)
	}
}

func TestRunSolver_Timeout(t *testing.T) {
	solver := writeFakeSolver(t, `sleep 30`)
	start := time.Now()
	run, err := RunSolver(context.Background(), solver, nil, 500*time.Millisecond, zap.NewNop())
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("expected a timeout error")
	}
	if !run.TimedOut {
		t.Error("expected TimedOut to be set")
	}
	if elapsed > 5*time.Second {
		t.Errorf("solver should have been killed promptly, took %s", elapsed)
	}
}

func TestExtractSolverError_NoStructuredLine(t *testing.T) {
	err := ExtractSolverError("just some plain log output\nwith no json\n")
	if err == nil {
		t.Fatal("expected a fallback error when no structured line is present")
	}
}

func TestExtractSolverError_PicksLastJSONObject(t *testing.T) {
	stderr := `{"error":"first","kind":"a"}
some interleaved log
{"error":"second","kind":"b"}
trailing log line`
	err := ExtractSolverError(stderr)
	if err == nil || !strings.Contains(err.Error(), "second") {
		t.Fatalf("expected the last JSON error object, got %v", err)
	}
}

func TestTailProgress_ObservesEventsInOrder(t *testing.T) {
	dir := t.TempDir()
	progressPath := filepath.Join(dir, "progress.jsonl")

	ctx, cancel := context.WithCancel(context.Background())
	events := make(chan ProgressEvent, 16)
	go TailProgress(ctx, progressPath, events, zap.NewNop())

	// Emulate a solver appending JSONL events while the tailer follows.
	go func() {
		f, err := os.OpenFile(progressPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			return
		}
		defer f.Close()
		for i := 0; i < 3; i++ {
			line, _ := json.Marshal(map[string]interface{}{"event": "step", "i": i})
			f.Write(append(line, '\n'))
			f.Sync()
			time.Sleep(120 * time.Millisecond)
		}
		time.Sleep(300 * time.Millisecond)
		cancel()
	}()

	var got []int
	for ev := range events {
		if iv, ok := ev.Body["i"].(float64); ok {
			got = append(got, int(iv))
		}
	}
	if len(got) != 3 {
		t.Fatalf("expected 3 progress events, got %d (%v)", len(got), got)
	}
	for i, v := range got {
		if v != i {
			t.Errorf("event %d out of order: got i=%d", i, v)
		}
	}
}

func TestAllocateRunPaths(t *testing.T) {
	base := t.TempDir()
	svc, err := NewSessionService(base, 10*1024*1024, 5, "", "", "", "", zap.NewNop())
	if err != nil {
		t.Fatalf("NewSessionService: %v", err)
	}
	session, err := svc.CreateSession("user-1")
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	runID1, out1, prog1, err := svc.AllocateRunPaths(session.ID)
	if err != nil {
		t.Fatalf("AllocateRunPaths: %v", err)
	}
	runID2, out2, _, err := svc.AllocateRunPaths(session.ID)
	if err != nil {
		t.Fatalf("AllocateRunPaths (second call): %v", err)
	}

	if runID1 == runID2 {
		t.Error("repeated calls must yield distinct run IDs")
	}
	if out1 == out2 {
		t.Error("repeated calls must yield distinct output paths")
	}
	if filepath.Ext(out1) != ".json" || filepath.Ext(prog1) != ".jsonl" {
		t.Errorf("unexpected extensions: %s / %s", out1, prog1)
	}
	if _, err := os.Stat(filepath.Dir(out1)); err != nil {
		t.Errorf("runs directory should exist: %v", err)
	}

	if _, _, _, err := svc.AllocateRunPaths("nonexistent-session"); err == nil {
		t.Error("expected an error for an unknown session")
	}
}
