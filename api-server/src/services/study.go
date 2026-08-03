package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"go.uber.org/zap"

	"api-server/src/studyfile"
	"api-server/src/studyfile/report"
	"api-server/src/types"
)

// StudyService validates a session's .sub/.mon/.con study files and
// post-processes power flow results against the monitored elements. All
// study-file semantics live in the flow-solver (`validate-study`); this
// service owns session lookup, caching, and service-level diagnostics only
// (change `port-studyfile-to-flow-solver`).
type StudyService struct {
	sessionService *SessionService
	engine         *SolverStudyEngine
	logger         *zap.Logger

	mu    sync.Mutex
	cache map[string]*cachedStudy // resolved study model, by session id
}

// cachedStudy memoizes a session's validation result, keyed by a fingerprint
// of its input files so it is reused until a file changes.
type cachedStudy struct {
	fingerprint string
	analysis    *StudyAnalysis
}

// StudyAnalysis is the engine-validated study model for a session.
type StudyAnalysis struct {
	Diagnostics studyfile.Diagnostics
	HasFiles    bool // false when the session has no study files attached
	HasModel    bool // false when no network model is attached (parse-only validation)
	// EngineResolved is the flow-solver validate-study result: the resolved
	// summary plus the full resolved model the report layer consumes.
	EngineResolved *SolverValidation
	hasCon         bool
}

// HasConFile reports whether a contingency file is attached to the analysis.
func (a *StudyAnalysis) HasConFile() bool { return a.hasCon }

// ContingencyCount is the resolved contingency count.
func (a *StudyAnalysis) ContingencyCount() int {
	if a.EngineResolved == nil {
		return 0
	}
	return a.EngineResolved.ContingencyCount
}

// NewStudyService creates a StudyService backed by the flow-solver study
// engine.
func NewStudyService(sessionService *SessionService, logger *zap.Logger, solverPath string) *StudyService {
	return &StudyService{
		sessionService: sessionService,
		engine:         NewSolverStudyEngine(solverPath, logger),
		logger:         logger,
		cache:          map[string]*cachedStudy{},
	}
}

// ValidationResult projects a StudyAnalysis into the API-facing validation
// payload — diagnostics plus error/warning counts.
func ValidationResult(a *StudyAnalysis) types.StudyValidationResult {
	return types.StudyValidationResult{
		HasFiles:    a.HasFiles,
		HasModel:    a.HasModel,
		Diagnostics: a.Diagnostics.List(),
		Errors:      a.Diagnostics.Errors(),
		Warnings:    a.Diagnostics.Warnings(),
	}
}

// Analyze validates the study files loaded on a session. The result is
// cached and reused until one of the input files changes. A session with no
// study files yields an analysis with HasFiles == false.
func (s *StudyService) Analyze(sessionID string) (*StudyAnalysis, error) {
	session, ok := s.sessionService.GetSession(sessionID)
	if !ok {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}
	if session.SubPath == "" && session.MonPath == "" && session.ConPath == "" {
		return &StudyAnalysis{HasFiles: false}, nil
	}

	fp := fingerprint(session.SubPath, session.MonPath, session.ConPath, session.FilePath)
	s.mu.Lock()
	if c, ok := s.cache[sessionID]; ok && c.fingerprint == fp {
		s.mu.Unlock()
		return c.analysis, nil
	}
	s.mu.Unlock()

	analysis := s.compute(session.SubPath, session.MonPath, session.ConPath, session.FilePath)

	s.mu.Lock()
	s.cache[sessionID] = &cachedStudy{fingerprint: fp, analysis: analysis}
	s.mu.Unlock()
	return analysis, nil
}

// BuildReport analyzes the session's study files and post-processes the given
// power flow result JSON into a monitored report.
func (s *StudyService) BuildReport(sessionID, resultJSON string) (*report.MonitoredReport, error) {
	analysis, err := s.Analyze(sessionID)
	if err != nil {
		return nil, err
	}
	if !analysis.HasFiles {
		return nil, nil
	}
	result := decodeResult(resultJSON)
	var rm *report.EngineResolvedModel
	if analysis.EngineResolved != nil && len(analysis.EngineResolved.ResolvedModel) > 0 {
		rm = &report.EngineResolvedModel{}
		if err := json.Unmarshal(analysis.EngineResolved.ResolvedModel, rm); err != nil {
			return nil, fmt.Errorf("failed to parse the engine-resolved study model: %w", err)
		}
	}
	return report.BuildFromEngine(result, rm, analysis.Diagnostics), nil
}

// compute delegates parsing + resolution to `flow-solver validate-study`.
// Service-level diagnostics (unreadable files, the no-model note) are added
// here; their message text is a frozen frontend contract (design D9a).
func (s *StudyService) compute(subPath, monPath, conPath, modelPath string) *StudyAnalysis {
	var diags studyfile.Diagnostics

	sub, mon := subPath, monPath
	if subPath != "" {
		if err := readable(subPath); err != nil {
			diags.Error(base(subPath), 0, "sub_unreadable", "cannot read .sub file: "+err.Error())
			sub = ""
		}
	}
	if monPath != "" {
		if err := readable(monPath); err != nil {
			diags.Error(base(monPath), 0, "mon_unreadable", "cannot read .mon file: "+err.Error())
			mon = ""
		}
	}
	hasModel := modelPath != ""
	if !hasModel {
		diags.Warn("", 0, "study_no_model",
			"no network model attached — showing syntax checks only; "+
				"load a case to resolve subsystems and monitors")
	}

	val, err := s.engine.Validate(sub, mon, conPath, modelPath)
	if err != nil {
		// Engine invocation failure: surface as a diagnostic so validation
		// still responds (problems are data — design D3).
		diags.Error("", 0, "study_engine_error", "study engine failed: "+err.Error())
		return &StudyAnalysis{
			Diagnostics: diags, HasFiles: true, HasModel: hasModel,
			hasCon: conPath != "", EngineResolved: &SolverValidation{},
		}
	}
	diags.Merge(val.Diagnostics)
	return &StudyAnalysis{
		Diagnostics:    diags,
		HasFiles:       true,
		HasModel:       hasModel,
		EngineResolved: val,
		hasCon:         conPath != "",
	}
}

// fingerprint combines the size and modtime of each present input file.
func fingerprint(paths ...string) string {
	var b strings.Builder
	for _, p := range paths {
		if p == "" {
			b.WriteString("-;")
			continue
		}
		if fi, err := os.Stat(p); err == nil {
			fmt.Fprintf(&b, "%s:%d:%d;", p, fi.Size(), fi.ModTime().UnixNano())
		} else {
			fmt.Fprintf(&b, "%s:err;", p)
		}
	}
	return b.String()
}

func baseName(p string) string {
	if p == "" {
		return ""
	}
	return filepath.Base(p)
}

// decodeResult parses a power flow result JSON string. A malformed string
// yields a nil map; the report builder tolerates it.
func decodeResult(resultJSON string) map[string]interface{} {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(resultJSON), &m); err != nil {
		return nil
	}
	return m
}
