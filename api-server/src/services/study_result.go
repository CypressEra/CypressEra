package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"

	"api-server/src/studyfile/contingency"
	"api-server/src/types"
)

// StudyResultType values for StudyResultMeta.Type.
const StudyResultTypeContingency = "ac_contingency_analysis"

// metaFileName / reportFileName are the two files of a study-result record.
const (
	metaFileName   = "meta.json"
	reportFileName = "report.json"
)

// StudyResultService is the durable, per-user store of completed analyses.
// A record lives at <basePath>/study-results/<user_id>/<result_id>/ as a
// small meta.json plus a report.json. The store is filesystem-backed,
// consistent with the per-user model/sub/mon/con libraries.
type StudyResultService struct {
	basePath string
	logger   *zap.Logger
}

// NewStudyResultService creates a StudyResultService over basePath.
func NewStudyResultService(basePath string, logger *zap.Logger) *StudyResultService {
	return &StudyResultService{basePath: basePath, logger: logger}
}

// userDir is the study-results directory for a user.
func (s *StudyResultService) userDir(userID string) string {
	return filepath.Join(s.basePath, "study-results", userID)
}

// resultDir is the directory of one study result.
func (s *StudyResultService) resultDir(userID, resultID string) string {
	return filepath.Join(s.userDir(userID), resultID)
}

// ReportPath returns the on-disk path of a result's report.json — used as the
// analysis job's durable result path.
func (s *StudyResultService) ReportPath(userID, resultID string) string {
	return filepath.Join(s.resultDir(userID, resultID), reportFileName)
}

// ResultIDFromReportPath recovers a study result's id from a report.json path
// returned by ReportPath: the id is the report file's parent directory name.
func ResultIDFromReportPath(reportPath string) string {
	if reportPath == "" {
		return ""
	}
	return filepath.Base(filepath.Dir(reportPath))
}

// Save writes a study-result record. It assigns an id and creation time when
// the metadata leaves them unset, stamps the app version, and returns the
// completed metadata. The id is the directory name under the user's store.
func (s *StudyResultService) Save(userID string, meta types.StudyResultMeta,
	report contingency.Report) (types.StudyResultMeta, error) {
	if meta.ID == "" {
		meta.ID = uuid.NewString()
	}
	if meta.CreatedAt.IsZero() {
		meta.CreatedAt = time.Now()
	}
	meta.AppVersion = PlatformVersion()

	dir := s.resultDir(userID, meta.ID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return meta, fmt.Errorf("failed to create study-result directory: %w", err)
	}
	if err := writeJSON(filepath.Join(dir, metaFileName), meta); err != nil {
		return meta, fmt.Errorf("failed to write study-result metadata: %w", err)
	}
	if err := writeJSON(filepath.Join(dir, reportFileName), report); err != nil {
		return meta, fmt.Errorf("failed to write study-result report: %w", err)
	}
	return meta, nil
}

// List returns the metadata of a user's study results, newest first. It reads
// only the small meta.json files. A directory whose meta.json is missing or
// unreadable is skipped rather than failing the whole list.
func (s *StudyResultService) List(userID string) ([]types.StudyResultMeta, error) {
	entries, err := os.ReadDir(s.userDir(userID))
	if err != nil {
		if os.IsNotExist(err) {
			return []types.StudyResultMeta{}, nil
		}
		return nil, fmt.Errorf("failed to read study-results directory: %w", err)
	}
	out := make([]types.StudyResultMeta, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		var meta types.StudyResultMeta
		if err := readJSON(filepath.Join(s.userDir(userID), e.Name(), metaFileName), &meta); err != nil {
			s.logger.Warn("skipping unreadable study result", zap.String("dir", e.Name()), zap.Error(err))
			continue
		}
		out = append(out, meta)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out, nil
}

// Get returns one study result — its metadata and full report.
func (s *StudyResultService) Get(userID, resultID string) (*types.StudyResult, error) {
	dir := s.resultDir(userID, resultID)
	if _, err := os.Stat(dir); err != nil {
		return nil, fmt.Errorf("study result %s not found", resultID)
	}
	var result types.StudyResult
	if err := readJSON(filepath.Join(dir, metaFileName), &result.Meta); err != nil {
		return nil, fmt.Errorf("study result %s metadata is unreadable: %w", resultID, err)
	}
	if err := readJSON(filepath.Join(dir, reportFileName), &result.Report); err != nil {
		return nil, fmt.Errorf("study result %s report is unreadable: %w", resultID, err)
	}
	return &result, nil
}

// Delete removes a study result and its files.
func (s *StudyResultService) Delete(userID, resultID string) error {
	dir := s.resultDir(userID, resultID)
	if _, err := os.Stat(dir); err != nil {
		return fmt.Errorf("study result %s not found", resultID)
	}
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("failed to delete study result %s: %w", resultID, err)
	}
	return nil
}

// writeJSON marshals v (indented) to path.
func writeJSON(path string, v interface{}) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// readJSON reads and unmarshals the JSON file at path into v.
func readJSON(path string, v interface{}) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}
