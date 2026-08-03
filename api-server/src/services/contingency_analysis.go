package services

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"

	"api-server/src/studyfile/contingency"
	"api-server/src/types"
)

// contingencyTimeout is a generous backstop for one ACCC run; cancellation is
// the normal way a run stops early.
const contingencyTimeout = 30 * time.Minute

// ContingencyService orchestrates an AC contingency analysis run: it expands
// the session's study files into a `solve-contingency` input, drives the
// flow-solver as an async job, streams progress, and assembles the report.
type ContingencyService struct {
	sessionService     *SessionService
	studyService       *StudyService
	solverService      *SolverService
	jobService         *JobService
	studyResultService *StudyResultService
	logger             *zap.Logger
}

// NewContingencyService creates a ContingencyService.
func NewContingencyService(sessionService *SessionService, studyService *StudyService,
	solverService *SolverService, jobService *JobService, studyResultService *StudyResultService,
	logger *zap.Logger) *ContingencyService {
	return &ContingencyService{
		sessionService:     sessionService,
		studyService:       studyService,
		solverService:      solverService,
		jobService:         jobService,
		studyResultService: studyResultService,
		logger:             logger,
	}
}

// Start validates the prerequisites and submits an ACCC run as an async job.
// config is the power flow configuration the base case and every contingency
// are solved with. When omitted it resolves to the session's saved config, or
// an fnsl default; when supplied it is saved on the session.
func (s *ContingencyService) Start(sessionID string, settings *contingency.Settings,
	config map[string]interface{}) (*AnalysisJob, error) {
	if err := settings.Validate(); err != nil {
		return nil, err
	}
	session, ok := s.sessionService.GetSession(sessionID)
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	if session.FilePath == "" {
		return nil, fmt.Errorf("session has no network model — load a case first")
	}

	// ACCC requires all three study-file slots (.sub, .mon, .con). The sentinel
	// prefix is what the handler pattern-matches on — message text after the
	// prefix is what reaches the LLM verbatim, following a stable
	// "Missing: <kinds>." template the agent can read.
	if missing := missingStudyFiles(session.SubPath, session.MonPath, session.ConPath); len(missing) > 0 {
		return nil, fmt.Errorf(
			"study_files_missing: Cannot start ACCC: required study files are not loaded. "+
				"Missing: %s. Load each missing file with loadStudyFile, then retry.",
			strings.Join(missing, ", "),
		)
	}

	analysis, err := s.studyService.Analyze(sessionID)
	if err != nil {
		return nil, err
	}
	// At this point all three slots are populated. The remaining failures are
	// "contingency file is loaded but the definitions are empty/unparseable" —
	// distinct from a missing slot. The handler maps these to
	// `contingency_not_ready`.
	if !analysis.HasConFile() {
		return nil, fmt.Errorf("the contingency (.con) file is loaded but could not be parsed")
	}
	if analysis.ContingencyCount() == 0 {
		return nil, fmt.Errorf("the contingency (.con) file is loaded but defines no contingencies")
	}

	// Resolve the power flow config: an explicit config wins and is saved on
	// the session; otherwise the session's saved config is inherited.
	// ResolvePowerFlowConfig is called with the caller's original `config`
	// (not the merged value) so that an omitted request still does not
	// overwrite the session's saved config.
	effectiveConfig := s.sessionService.ResolvePowerFlowConfig(sessionID, config)

	// mergeWithACDefaults fills in every canonical AC field the caller did
	// not supply and forces method=fnsl (ACCC is AC by definition). The merged
	// value is shared by the solver input and the persisted study-result
	// meta below, so "what we ran with" and "what we report" stay in sync.
	resolvedConfig := mergeWithACDefaults(effectiveConfig)
	resolvedSettings := settings.WithDefaults()

	// Provenance for the study-result record: the network case and the
	// .sub / .mon / .con study files loaded into the session for this run.
	modelFile := session.OriginalFileName
	if modelFile == "" {
		modelFile = filepath.Base(session.FilePath)
	}
	resultMeta := types.StudyResultMeta{
		ModelFile:           modelFile,
		SubFile:             baseName(session.SubPath),
		MonFile:             baseName(session.MonPath),
		ConFile:             baseName(session.ConPath),
		SessionID:           sessionID,
		PowerFlowConfig:     resolvedConfig,
		ContingencySettings: &resolvedSettings,
	}

	// The solver parses and resolves the study files itself and returns
	// enriched records (design D6). The job total comes from the Analyze
	// pre-flight (design D7).
	input := contingency.StudyInput{
		Base:     map[string]interface{}{"type": "rawx", "rawpath": session.FilePath},
		Config:   resolvedConfig,
		Settings: &resolvedSettings,
		Study: contingency.StudyPaths{
			Sub: session.SubPath,
			Mon: session.MonPath,
			Con: session.ConPath,
		},
	}
	return s.jobService.Submit(sessionID, "contingency", analysis.ContingencyCount(),
		s.makeRun(sessionID, session.UserID, resultMeta, input,
			analysis.ContingencyCount(), contingency.BuildReportEnriched))
}
// JobService exposes the underlying job registry (for status/cancel handlers).
func (s *ContingencyService) JobService() *JobService { return s.jobService }

// makeRun builds the RunFunc that drives one `solve-contingency` invocation.
// input is either the numeric contingency.Input (go engine) or the
// study-path contingency.StudyInput (flow-solver engine); buildRep shapes the
// engine output into the report (network-enriching under the go engine,
// pass-through under the flow-solver engine whose records arrive enriched).
// On success the completed run is promoted to a durable study result owned by
// userID; resultMeta carries the run's provenance (network case, study files,
// session) and is completed with the run-derived fields before it is saved.
func (s *ContingencyService) makeRun(sessionID, userID string, resultMeta types.StudyResultMeta,
	input interface{}, total int, buildRep func(contingency.EngineOutput) contingency.Report) RunFunc {
	return func(ctx context.Context, report func(JobProgress)) (string, error) {
		runID, outputPath, progressPath, err := s.sessionService.AllocateRunPaths(sessionID)
		if err != nil {
			return "", fmt.Errorf("failed to allocate run paths: %w", err)
		}
		runDir := filepath.Dir(outputPath)
		inputPath := filepath.Join(runDir, "contingency-input.json")

		inputBytes, err := json.Marshal(input)
		if err != nil {
			return "", fmt.Errorf("failed to marshal contingency input: %w", err)
		}
		if err := os.WriteFile(inputPath, inputBytes, 0644); err != nil {
			return "", fmt.Errorf("failed to write contingency input: %w", err)
		}

		// Tail per-contingency progress and forward it (coalesced upstream).
		tailCtx, cancelTail := context.WithCancel(ctx)
		events := make(chan ProgressEvent, 64)
		go TailProgress(tailCtx, progressPath, events, s.logger)
		tailDone := make(chan struct{})
		go func() {
			defer close(tailDone)
			violations := 0
			for ev := range events {
				if ev.Body["event"] != "contingency" {
					continue
				}
				violations += contingencyViolationCount(ev.Body)
				report(JobProgress{
					Done:       intField(ev.Body, "index"),
					Total:      intField(ev.Body, "total"),
					Violations: violations,
				})
			}
		}()

		args := []string{
			"solve-contingency",
			"--input", "@" + inputPath,
			"--output", outputPath,
			"--progress", progressPath,
		}
		s.logger.Info("Starting contingency analysis",
			zap.String("session_id", sessionID), zap.String("run_id", runID),
			zap.Int("contingencies", total))

		run, runErr := RunSolver(ctx, s.solverService.GetSolverPath(), args, contingencyTimeout, s.logger)
		cancelTail()
		<-tailDone

		if runErr != nil {
			return "", runErr
		}
		if run.ExitCode != 0 {
			return "", ExtractSolverError(run.Stderr)
		}

		outBytes, err := os.ReadFile(outputPath)
		if err != nil {
			return "", fmt.Errorf("solver succeeded but result file is unreadable: %w", err)
		}
		var engineOut contingency.EngineOutput
		if err := json.Unmarshal(outBytes, &engineOut); err != nil {
			return "", fmt.Errorf("failed to parse contingency engine output: %w", err)
		}

		rep := buildRep(engineOut)

		// Promote the completed run into the durable, per-user study-result
		// store. The job's result path then points at the stored report, so
		// each run's report is its own file (no fixed-name overwrite).
		// resultMeta already carries the run's provenance; fill the
		// run-derived fields before saving.
		resultMeta.Type = StudyResultTypeContingency
		resultMeta.Summary = rep.Summary
		meta, err := s.studyResultService.Save(userID, resultMeta, rep)
		if err != nil {
			return "", fmt.Errorf("analysis completed but the result could not be saved: %w", err)
		}
		reportPath := s.studyResultService.ReportPath(userID, meta.ID)
		s.logger.Info("Contingency analysis completed",
			zap.String("session_id", sessionID), zap.String("run_id", runID),
			zap.String("study_result_id", meta.ID),
			zap.Int("contingencies", rep.Summary.Total),
			zap.Int("with_violations", rep.Summary.WithViolations))
		return reportPath, nil
	}
}

// contingencyViolationCount returns the violation count to add for a
// "contingency" progress event. A contingency that did not converge or that
// islanded contributes nothing — its report row is a status row, not a
// monitored violation — so it must not inflate the running count. Sub-100%
// thermal records are already excluded upstream by the solver's count.
func contingencyViolationCount(body map[string]interface{}) int {
	converged, _ := body["converged"].(bool)
	islanded, _ := body["islanded"].(bool)
	if !converged || islanded {
		return 0
	}
	return intField(body, "violations")
}

// intField reads a numeric JSON field as an int.
func intField(m map[string]interface{}, key string) int {
	switch v := m[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return 0
	}
}

// missingStudyFiles returns the canonical-order list of study-file slot
// names ("sub", "mon", "con") that are empty for the given paths. Returns
// an empty slice when all three slots are populated. Order is fixed —
// sub before mon before con — so the agent's recovery loop is deterministic
// and tests can pin on the exact slice.
func missingStudyFiles(subPath, monPath, conPath string) []string {
	var missing []string
	if subPath == "" {
		missing = append(missing, "sub")
	}
	if monPath == "" {
		missing = append(missing, "mon")
	}
	if conPath == "" {
		missing = append(missing, "con")
	}
	return missing
}
