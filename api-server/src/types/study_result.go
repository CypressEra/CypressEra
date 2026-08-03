package types

import (
	"time"

	"api-server/src/studyfile/contingency"
)

// StudyResultMeta is the metadata envelope for a stored study result — what is
// needed to identify, list, and reproduce a completed analysis. It is written
// to meta.json and is the unit returned by the study-results list endpoint.
type StudyResultMeta struct {
	ID         string    `json:"id"`
	Type       string    `json:"type"` // e.g. "ac_contingency_analysis"
	AppVersion string    `json:"app_version"`
	CreatedAt  time.Time `json:"created_at"`
	// ModelFile is the network model file the analysis ran on.
	ModelFile string `json:"model_file,omitempty"`
	// SubFile / MonFile / ConFile are the basenames of the .sub / .mon / .con
	// study files loaded into the session for the run. A file not loaded for
	// the run is left empty (and omitted from the JSON).
	SubFile string `json:"sub_file,omitempty"`
	MonFile string `json:"mon_file,omitempty"`
	ConFile string `json:"con_file,omitempty"`
	// SessionID records which session produced the result (provenance).
	SessionID string `json:"session_id,omitempty"`
	// PowerFlowConfig and ContingencySettings capture the run configuration so
	// the result is reproducible.
	PowerFlowConfig     map[string]interface{} `json:"power_flow_config,omitempty"`
	ContingencySettings *contingency.Settings  `json:"contingency_settings,omitempty"`
	// Summary is the report's headline counts, carried in the metadata so the
	// list can be shown without reading the full report.
	Summary contingency.ReportSummary `json:"summary"`
}

// StudyResult is a stored study result in full — its metadata plus the
// analysis report. Returned when a single result is opened.
type StudyResult struct {
	Meta   StudyResultMeta    `json:"meta"`
	Report contingency.Report `json:"report"`
}

// StudyResultListResponse is the list of a user's study results.
type StudyResultListResponse struct {
	Status  string            `json:"status"`
	Results []StudyResultMeta `json:"results"`
}
