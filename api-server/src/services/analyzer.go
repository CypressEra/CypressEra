package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"go.uber.org/zap"
)

// analyzerTimeout bounds a single analyze invocation.
const analyzerTimeout = 30 * time.Second

// AnalyzerService runs graph traversal queries via the flow-solver CLI.
// Results are delivered via the solver's --output file.
type AnalyzerService struct {
	solverPath string
	logger     *zap.Logger
}

// NewAnalyzerService creates a new analyzer service.
func NewAnalyzerService(solverPath string, logger *zap.Logger) *AnalyzerService {
	return &AnalyzerService{
		solverPath: solverPath,
		logger:     logger,
	}
}

// FindShortestPath spawns the flow-solver and reads the result from --output.
func (a *AnalyzerService) FindShortestPath(filePath string, fromBus, toBus int) (map[string]interface{}, error) {
	input, err := json.Marshal(map[string]interface{}{
		"type":    "rawx",
		"rawpath": filePath,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal input: %w", err)
	}

	outputPath, cleanup, err := newSolverOutputFile("shortest-path")
	if err != nil {
		return nil, err
	}
	defer cleanup()

	args := []string{
		"analyze",
		"--input", string(input),
		"find-shortest-path",
		"--from", fmt.Sprintf("%d", fromBus),
		"--to", fmt.Sprintf("%d", toBus),
		"--output", outputPath,
	}

	resultBytes, err := a.runAnalyze(args, "find-shortest-path", outputPath)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(resultBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse shortest-path result JSON: %w", err)
	}
	return result, nil
}

// FindNeighbourElements spawns the flow-solver and reads the result from --output.
func (a *AnalyzerService) FindNeighbourElements(filePath string, originBus, n int, elementTypes []string) ([]interface{}, error) {
	input, err := json.Marshal(map[string]interface{}{
		"type":    "rawx",
		"rawpath": filePath,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to marshal input: %w", err)
	}

	outputPath, cleanup, err := newSolverOutputFile("neighbour-elements")
	if err != nil {
		return nil, err
	}
	defer cleanup()

	args := []string{
		"analyze",
		"--input", string(input),
		"find-elements-n-levels",
		"--origin", fmt.Sprintf("%d", originBus),
		"--n", fmt.Sprintf("%d", n),
		"--output", outputPath,
	}
	if len(elementTypes) > 0 {
		args = append(args, "--kinds", strings.Join(elementTypes, ","))
	}

	resultBytes, err := a.runAnalyze(args, "find-elements-n-levels", outputPath)
	if err != nil {
		return nil, err
	}

	var result []interface{}
	if err := json.Unmarshal(resultBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to parse neighbour-elements result JSON: %w", err)
	}
	return result, nil
}

// runAnalyze spawns the flow-solver, waits for it to exit, and reads the
// result file written to outputPath.
func (a *AnalyzerService) runAnalyze(args []string, subCmd, outputPath string) ([]byte, error) {
	a.logger.Info("Starting flow-solver analyze",
		zap.String("subcommand", subCmd))

	run, err := RunSolver(context.Background(), a.solverPath, args, analyzerTimeout, a.logger)
	if err != nil {
		a.logger.Error("flow-solver analyze invocation failed",
			zap.String("subcommand", subCmd),
			zap.Error(err),
			zap.String("stderr", run.Stderr))
		return nil, err
	}
	if run.ExitCode != 0 {
		solverErr := ExtractSolverError(run.Stderr)
		a.logger.Error("flow-solver analyze exited with non-zero status",
			zap.String("subcommand", subCmd),
			zap.Int("exit_code", run.ExitCode),
			zap.String("stderr", run.Stderr),
			zap.Error(solverErr))
		return nil, solverErr
	}

	resultBytes, readErr := os.ReadFile(outputPath)
	if readErr != nil {
		return nil, fmt.Errorf("analyze %s succeeded but result file is unreadable: %w", subCmd, readErr)
	}

	a.logger.Info("flow-solver analyze process completed",
		zap.String("subcommand", subCmd))
	return resultBytes, nil
}
