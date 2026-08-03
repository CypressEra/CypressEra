package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"go.uber.org/zap"
)

// parserTimeout bounds a single parse invocation.
const parserTimeout = 30 * time.Second

// ParserService manages network data parsing using the Rust flow-solver.
type ParserService struct {
	solverPath string
	logger     *zap.Logger
}

// NewParserService creates a new parser service.
func NewParserService(solverPath string, logger *zap.Logger) *ParserService {
	return &ParserService{
		solverPath: solverPath,
		logger:     logger,
	}
}

// ParseNetworkData parses a RAWX file using the Rust solver and returns the
// network data. The solver writes its result to a temp file which is read
// back and removed once consumed.
func (p *ParserService) ParseNetworkData(filePath string) (map[string]interface{}, error) {
	outputPath, cleanup, err := newSolverOutputFile("parse")
	if err != nil {
		return nil, err
	}
	defer cleanup()

	args := []string{
		"parse",
		"--file", filePath,
		"--output", outputPath,
	}

	p.logger.Info("Starting network data parsing", zap.String("file_path", filePath))

	run, err := RunSolver(context.Background(), p.solverPath, args, parserTimeout, p.logger)
	if err != nil {
		p.logger.Error("Network data parsing failed",
			zap.String("file_path", filePath),
			zap.Error(err),
			zap.String("stderr", run.Stderr))
		return nil, err
	}
	if run.ExitCode != 0 {
		solverErr := ExtractSolverError(run.Stderr)
		p.logger.Error("flow-solver parse exited with non-zero status",
			zap.String("file_path", filePath),
			zap.Int("exit_code", run.ExitCode),
			zap.String("stderr", run.Stderr),
			zap.Error(solverErr))
		return nil, solverErr
	}

	resultBytes, readErr := os.ReadFile(outputPath)
	if readErr != nil {
		return nil, fmt.Errorf("parse succeeded but result file is unreadable: %w", readErr)
	}

	var networkData map[string]interface{}
	if err := json.Unmarshal(resultBytes, &networkData); err != nil {
		return nil, fmt.Errorf("failed to parse network data JSON: %w", err)
	}

	p.logger.Info("Network data parsing completed", zap.String("file_path", filePath))
	return networkData, nil
}
