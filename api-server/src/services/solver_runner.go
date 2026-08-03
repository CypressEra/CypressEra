package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
)

// stderrCap bounds how much solver stderr the api-server retains for
// postmortem logging and structured-error extraction.
const stderrCap = 16 * 1024

// tailWriter is an io.Writer that keeps only the last `cap` bytes written.
// The flow-solver emits human-readable logs plus a final structured-error
// JSON line on stderr; the most recent bytes are the most diagnostic.
type tailWriter struct {
	mu  sync.Mutex
	buf []byte
	cap int
}

func newTailWriter(capBytes int) *tailWriter {
	return &tailWriter{cap: capBytes}
}

func (t *tailWriter) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.buf = append(t.buf, p...)
	if len(t.buf) > t.cap {
		t.buf = t.buf[len(t.buf)-t.cap:]
	}
	return len(p), nil
}

func (t *tailWriter) String() string {
	t.mu.Lock()
	defer t.mu.Unlock()
	return string(t.buf)
}

// SolverRunResult is the outcome of one flow-solver subprocess invocation.
type SolverRunResult struct {
	ExitCode int
	Stderr   string // bounded to stderrCap, tail-truncated
	TimedOut bool
}

// RunSolver execs the flow-solver binary with the given args, waits for it
// to exit, and returns the captured result.
//
// A positive timeout bounds the run with a deadline; a non-positive timeout
// (<= 0) means "no deadline" — the run is bounded only by cancellation of the
// parent context (e.g. shutdown / client disconnect). This lets long solves
// run to completion (see the unbounded-solve change) while parse/edit/analyze
// keep their own positive caps.
//
// The solver communicates outcome via exit code: 0 means the output file
// was written; non-zero means failure (see ExtractSolverError). The solver
// never POSTs to the api-server — all results are file-based.
func RunSolver(ctx context.Context, solverPath string, args []string, timeout time.Duration, logger *zap.Logger) (*SolverRunResult, error) {
	var runCtx context.Context
	var cancel context.CancelFunc
	if timeout > 0 {
		runCtx, cancel = context.WithTimeout(ctx, timeout)
	} else {
		// No time deadline; still cancellable via the parent context.
		runCtx, cancel = context.WithCancel(ctx)
	}
	defer cancel()

	cmd := exec.CommandContext(runCtx, solverPath, args...)
	cmd.Dir = "."
	cmd.Env = append(os.Environ(), "RUST_LOG=info", "RUST_BACKTRACE=1")

	// After the context fires and the process is killed, bound how long Wait
	// blocks on the stderr-copy goroutine. Without this, a killed process that
	// left grandchildren holding the stderr pipe could stall Wait indefinitely.
	cmd.WaitDelay = 3 * time.Second

	stderr := newTailWriter(stderrCap)
	cmd.Stderr = stderr
	// The solver no longer prints results to stdout; discard it.
	cmd.Stdout = nil

	start := time.Now()
	err := cmd.Run()
	elapsed := time.Since(start)

	result := &SolverRunResult{Stderr: stderr.String()}

	if runCtx.Err() == context.DeadlineExceeded {
		result.TimedOut = true
		logger.Error("flow-solver subprocess timed out",
			zap.Duration("timeout", timeout),
			zap.Duration("elapsed", elapsed))
		return result, fmt.Errorf("flow-solver timed out after %s", timeout)
	}

	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else {
			return result, fmt.Errorf("failed to run flow-solver: %w", err)
		}
		return result, nil
	}

	result.ExitCode = 0
	return result, nil
}

// newSolverOutputFile creates a temporary file for a solver subcommand whose
// result is consumed immediately and need not be session-scoped (parse, edit,
// analyze). It returns the path and a cleanup func that removes the file.
//
// The file is created then closed so the solver can write to it via atomic
// rename; the leftover empty file (if the solver never writes) is removed by
// the cleanup func.
func newSolverOutputFile(prefix string) (string, func(), error) {
	f, err := os.CreateTemp("", "flow-solver-"+prefix+"-*.json")
	if err != nil {
		return "", func() {}, fmt.Errorf("failed to create solver output file: %w", err)
	}
	path := f.Name()
	_ = f.Close()
	cleanup := func() {
		_ = os.Remove(path)
		_ = os.Remove(path + ".tmp")
	}
	return path, cleanup, nil
}

// ExtractSolverError scans the solver's stderr in reverse for the last line
// that parses as a JSON object containing an "error" key, and returns a
// caller-facing error. The flow-solver emits this structured line as the
// final stderr write before a non-zero exit.
func ExtractSolverError(stderr string) error {
	lines := strings.Split(stderr, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line == "" || !strings.HasPrefix(line, "{") {
			continue
		}
		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			continue
		}
		if msg, ok := obj["error"].(string); ok {
			if kind, ok := obj["kind"].(string); ok {
				return fmt.Errorf("solver error [%s]: %s", kind, msg)
			}
			return fmt.Errorf("solver error: %s", msg)
		}
	}
	return fmt.Errorf("flow-solver exited with an error but emitted no structured error line")
}
