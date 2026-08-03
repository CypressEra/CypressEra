package services

// The flow-solver study engine (change `port-studyfile-to-flow-solver`):
// parsing + resolution of .sub/.mon/.con study files is delegated to the
// Rust flow-solver's `validate-study` command — the single implementation of
// the PSS/E study-file grammar. (The migration-window STUDY_ENGINE toggle and
// the in-process Go pipeline have been retired.)

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"go.uber.org/zap"

	"api-server/src/studyfile"
)

// validateStudyTimeout bounds one validate-study invocation — parse+resolve
// is milliseconds; the bound covers pathological network loads.
const validateStudyTimeout = 2 * time.Minute

// SolverValidation is the parsed output of `flow-solver validate-study`.
type SolverValidation struct {
	Diagnostics      studyfile.Diagnostics
	ContingencyCount int
	// ResolvedModel is the full resolved study model in the retired Go
	// `resolver.ResolvedModel` JSON shape augmented with ratings — the input
	// of the slimmed base-case report builder. Nil in parse-only mode.
	ResolvedModel json.RawMessage
}

// SolverStudyEngine invokes the flow-solver `validate-study` command.
type SolverStudyEngine struct {
	solverPath string
	logger     *zap.Logger
}

// NewSolverStudyEngine creates a SolverStudyEngine.
func NewSolverStudyEngine(solverPath string, logger *zap.Logger) *SolverStudyEngine {
	return &SolverStudyEngine{solverPath: solverPath, logger: logger}
}

// validateOutput mirrors the validate-study output file.
type validateOutput struct {
	Diagnostics []studyfile.Diagnostic `json:"diagnostics"`
	Resolved    struct {
		ContingencyCount int `json:"contingency_count"`
	} `json:"resolved"`
	ResolvedModel json.RawMessage `json:"resolved_model"`
}

// Validate runs `flow-solver validate-study` over the given study files.
// Empty paths are omitted; an empty modelPath selects parse-only mode.
func (e *SolverStudyEngine) Validate(subPath, monPath, conPath, modelPath string) (*SolverValidation, error) {
	study := map[string]interface{}{}
	if subPath != "" {
		study["sub"] = subPath
	}
	if monPath != "" {
		study["mon"] = monPath
	}
	if conPath != "" {
		study["con"] = conPath
	}
	input := map[string]interface{}{"study": study}
	if modelPath != "" {
		input["base"] = map[string]interface{}{"type": "rawx", "rawpath": modelPath}
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal validate-study input: %w", err)
	}

	outFile, err := os.CreateTemp("", "validate-study-*.json")
	if err != nil {
		return nil, fmt.Errorf("failed to create validate-study output file: %w", err)
	}
	outPath := outFile.Name()
	outFile.Close()
	defer os.Remove(outPath)

	args := []string{
		"validate-study",
		"--input", string(inputJSON),
		"--output", outPath,
	}
	run, err := RunSolver(context.Background(), e.solverPath, args, validateStudyTimeout, e.logger)
	if err != nil {
		return nil, err
	}
	if run.ExitCode != 0 {
		return nil, ExtractSolverError(run.Stderr)
	}

	data, err := os.ReadFile(outPath)
	if err != nil {
		return nil, fmt.Errorf("validate-study succeeded but its output is unreadable: %w", err)
	}
	var out validateOutput
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("failed to parse validate-study output: %w", err)
	}
	val := &SolverValidation{
		ContingencyCount: out.Resolved.ContingencyCount,
		ResolvedModel:    out.ResolvedModel,
	}
	val.Diagnostics.Items = out.Diagnostics
	return val, nil
}

// readable reports whether a study file can be read, mirroring the go-engine
// pre-read so the service-level unreadable diagnostics keep their exact text.
func readable(path string) error {
	_, err := os.ReadFile(path)
	return err
}

// base returns filepath.Base for non-empty paths.
func base(p string) string {
	if p == "" {
		return ""
	}
	return filepath.Base(p)
}
