package services

import (
	"context"
	"fmt"
	"os"
	"time"

	"go.uber.org/zap"
)

// ProgressSink consumes solver progress events as they are tailed from the
// JSONL progress file. The api-server passes a sink that forwards events to
// the websocket layer; a nil sink disables forwarding (events are still
// drained so the tailer never blocks).
//
// Defined as a plain func rather than an interface so the handlers package
// can supply a closure without the services package importing handlers.
type ProgressSink func(event map[string]interface{})

// SolverService manages power flow calculations using the Rust flow-solver.
type SolverService struct {
	solverPath     string
	sessionService *SessionService
	logger         *zap.Logger
	// solverTimeout bounds a single solve-flow invocation. A non-positive value
	// means "no time cap" — the solve runs to completion (bounded only by
	// cancellation). See the unbounded-solve change.
	solverTimeout time.Duration
}

// NewSolverService creates a new solver service. A non-positive solverTimeout
// is passed through as "no time cap" (unbounded solve).
func NewSolverService(solverPath string, sessionService *SessionService, logger *zap.Logger, solverTimeout time.Duration) *SolverService {
	return &SolverService{
		solverPath:     solverPath,
		sessionService: sessionService,
		logger:         logger,
		solverTimeout:  solverTimeout,
	}
}

// SolvePowerFlowWithRawFile runs the power flow calculation for a session.
//
// The api-server allocates a session-scoped output path, invokes the
// flow-solver with `--output` (and `--progress`), waits for it to exit, then
// reads the result file. The solver never POSTs back — outcome is signalled
// by exit code. `progressSink`, if non-nil, receives streamed progress events.
func (s *SolverService) SolvePowerFlowWithRawFile(sessionID, rawFilePath, config string, progressSink ProgressSink) (string, error) {
	runID, outputPath, progressPath, err := s.sessionService.AllocateRunPaths(sessionID)
	if err != nil {
		return "", fmt.Errorf("failed to allocate run paths: %w", err)
	}

	args := []string{
		"solve-flow",
		"--input", fmt.Sprintf(`{"type": "rawx", "rawpath": "%s"}`, rawFilePath),
		"--config", config,
		"--output", outputPath,
		"--progress", progressPath,
	}

	s.logger.Info("Starting power flow calculation",
		zap.String("session_id", sessionID),
		zap.String("run_id", runID),
		zap.String("raw_file_path", rawFilePath),
		zap.String("output_path", outputPath))

	// Tail the progress JSONL while the solver runs. The tailer is cancelled
	// once the solver exits and closes its event channel on return.
	tailCtx, cancelTail := context.WithCancel(context.Background())
	events := make(chan ProgressEvent, 32)
	go TailProgress(tailCtx, progressPath, events, s.logger)
	tailDone := make(chan struct{})
	go func() {
		defer close(tailDone)
		for ev := range events {
			if progressSink != nil {
				progressSink(ev.Body)
			}
		}
	}()

	start := time.Now()
	run, err := RunSolver(context.Background(), s.solverPath, args, s.solverTimeout, s.logger)
	cancelTail()
	<-tailDone
	elapsed := time.Since(start)

	if err != nil {
		s.logger.Error("Power flow solver invocation failed",
			zap.String("session_id", sessionID),
			zap.String("run_id", runID),
			zap.Duration("elapsed", elapsed),
			zap.Error(err),
			zap.String("stderr", run.Stderr))
		if run.TimedOut {
			return "", err
		}
		return "", err
	}

	if run.ExitCode != 0 {
		solverErr := ExtractSolverError(run.Stderr)
		s.logger.Error("flow-solver exited with non-zero status",
			zap.String("session_id", sessionID),
			zap.String("run_id", runID),
			zap.Int("exit_code", run.ExitCode),
			zap.String("stderr", run.Stderr),
			zap.Error(solverErr))
		return "", solverErr
	}

	resultBytes, readErr := os.ReadFile(outputPath)
	if readErr != nil {
		s.logger.Error("solver exited 0 but result file is unreadable",
			zap.String("session_id", sessionID),
			zap.String("run_id", runID),
			zap.String("output_path", outputPath),
			zap.Error(readErr))
		return "", fmt.Errorf("solver succeeded but result file %s is unreadable: %w", outputPath, readErr)
	}

	s.logger.Info("Power flow calculation completed",
		zap.String("session_id", sessionID),
		zap.String("run_id", runID),
		zap.Duration("elapsed", elapsed))

	return string(resultBytes), nil
}

// HealthCheck checks if the solver binary is present and executable.
func (s *SolverService) HealthCheck() error {
	if _, err := os.Stat(s.solverPath); os.IsNotExist(err) {
		return fmt.Errorf("solver binary not found at: %s", s.solverPath)
	}
	return nil
}

// GetSolverPath returns the path to the solver binary.
func (s *SolverService) GetSolverPath() string {
	return s.solverPath
}
