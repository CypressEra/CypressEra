package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"go.uber.org/zap"
)

// editorTimeout bounds a single edit invocation.
const editorTimeout = 30 * time.Second

// EditorService manages network element editing using the Rust flow-solver.
type EditorService struct {
	solverPath string
	logger     *zap.Logger
}

// NewEditorService creates a new editor service.
func NewEditorService(solverPath string, logger *zap.Logger) *EditorService {
	return &EditorService{
		solverPath: solverPath,
		logger:     logger,
	}
}

// ElementType represents the type of network element.
type ElementType string

const (
	ElementTypeBus           ElementType = "bus"
	ElementTypeLoad          ElementType = "load"
	ElementTypeGenerator     ElementType = "generator"
	ElementTypeAcLine        ElementType = "acline"
	ElementTypeTransformer   ElementType = "transformer"
	ElementTypeFixShunt      ElementType = "fixshunt"
	ElementTypeSwitchedShunt ElementType = "swshunt"
)

// ElementAction represents the action to perform on an element.
type ElementAction string

const (
	ElementActionAdd    ElementAction = "add"
	ElementActionDelete ElementAction = "delete"
	ElementActionModify ElementAction = "modify"
)

// EditElementRequest contains the parameters for editing a network element.
type EditElementRequest struct {
	ElementType ElementType            `json:"element_type"`
	Action      ElementAction          `json:"action"`
	FilePath    string                 `json:"file_path"`
	Data        map[string]interface{} `json:"data,omitempty"`       // Required for add/modify
	Identifier  map[string]interface{} `json:"identifier,omitempty"` // Required for delete/modify
}

// EditElement edits a network element using the Rust solver and returns the
// edited network in RAWX format. The solver writes the edited RAWX to a temp
// file which is read back once it exits.
func (e *EditorService) EditElement(req *EditElementRequest) (map[string]interface{}, error) {
	input := map[string]interface{}{
		"type":    "rawx",
		"rawpath": req.FilePath,
	}
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal input: %w", err)
	}

	outputPath, cleanup, err := newSolverOutputFile("edit")
	if err != nil {
		return nil, err
	}
	defer cleanup()

	args := []string{
		"edit",
		"--type", string(req.ElementType),
		"--action", string(req.Action),
		"--input", string(inputJSON),
		"--output", outputPath,
	}

	if req.Data != nil {
		dataJSON, err := json.Marshal(req.Data)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal data: %w", err)
		}
		args = append(args, "--data", string(dataJSON))
	}
	if req.Identifier != nil {
		identifierJSON, err := json.Marshal(req.Identifier)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal identifier: %w", err)
		}
		args = append(args, "--identifier", string(identifierJSON))
	}

	e.logger.Info("Executing edit element command",
		zap.String("element_type", string(req.ElementType)),
		zap.String("action", string(req.Action)),
		zap.String("file_path", req.FilePath))

	run, err := RunSolver(context.Background(), e.solverPath, args, editorTimeout, e.logger)
	if err != nil {
		e.logger.Error("edit element invocation failed",
			zap.String("file_path", req.FilePath),
			zap.Error(err),
			zap.String("stderr", run.Stderr))
		return nil, err
	}
	if run.ExitCode != 0 {
		solverErr := ExtractSolverError(run.Stderr)
		e.logger.Error("flow-solver edit exited with non-zero status",
			zap.String("file_path", req.FilePath),
			zap.Int("exit_code", run.ExitCode),
			zap.String("stderr", run.Stderr),
			zap.Error(solverErr))
		return nil, solverErr
	}

	resultBytes, readErr := os.ReadFile(outputPath)
	if readErr != nil {
		return nil, fmt.Errorf("edit succeeded but result file is unreadable: %w", readErr)
	}

	var rawxData map[string]interface{}
	if err := json.Unmarshal(resultBytes, &rawxData); err != nil {
		return nil, fmt.Errorf("failed to parse edited network JSON: %w", err)
	}

	e.logger.Info("Edit element command completed successfully",
		zap.String("element_type", string(req.ElementType)),
		zap.String("action", string(req.Action)),
		zap.String("file_path", req.FilePath))
	return rawxData, nil
}

// ValidateEditRequest validates the edit element request.
func (e *EditorService) ValidateEditRequest(req *EditElementRequest) error {
	validTypes := map[ElementType]bool{
		ElementTypeBus:           true,
		ElementTypeLoad:          true,
		ElementTypeGenerator:     true,
		ElementTypeAcLine:        true,
		ElementTypeTransformer:   true,
		ElementTypeFixShunt:      true,
		ElementTypeSwitchedShunt: true,
	}
	if !validTypes[req.ElementType] {
		return fmt.Errorf("invalid element type: %s", req.ElementType)
	}

	validActions := map[ElementAction]bool{
		ElementActionAdd:    true,
		ElementActionDelete: true,
		ElementActionModify: true,
	}
	if !validActions[req.Action] {
		return fmt.Errorf("invalid action: %s", req.Action)
	}

	switch req.Action {
	case ElementActionAdd:
		if len(req.Data) == 0 {
			return fmt.Errorf("data is required for add action")
		}
	case ElementActionDelete:
		if len(req.Identifier) == 0 {
			return fmt.Errorf("identifier is required for delete action")
		}
	case ElementActionModify:
		if len(req.Data) == 0 {
			return fmt.Errorf("data is required for modify action")
		}
		if len(req.Identifier) == 0 {
			return fmt.Errorf("identifier is required for modify action")
		}
	}

	if req.FilePath == "" {
		return fmt.Errorf("file path is required")
	}
	return nil
}
