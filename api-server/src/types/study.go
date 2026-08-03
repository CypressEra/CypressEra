package types

import (
	"api-server/src/studyfile"
	"api-server/src/studyfile/contingency"
)

// StudyValidationResult is the API-facing outcome of validating a session's
// study files: every parse and resolution diagnostic plus severity counts.
// It is embedded in both the load responses and the validate response so the
// shape is identical wherever validation surfaces.
type StudyValidationResult struct {
	// HasFiles is false when the session has no study files attached.
	HasFiles bool `json:"has_files"`
	// HasModel is false when no network model is attached; validation is
	// then parse-only and resolution diagnostics are not produced.
	HasModel    bool                   `json:"has_model"`
	Diagnostics []studyfile.Diagnostic `json:"diagnostics"`
	Errors      int                    `json:"errors"`
	Warnings    int                    `json:"warnings"`
}

// StudyValidateRequest asks the server to parse and resolve a session's
// loaded study files without running a power flow.
type StudyValidateRequest struct {
	SessionID string `json:"session_id" binding:"required"`
}

// StartContingencyRequest asks the server to start an AC contingency analysis
// run for a session. Settings are optional; omitted fields take engine defaults.
// Config is the power flow configuration (the same option set a standalone
// power flow uses); when omitted the run solves with an fnsl default.
type StartContingencyRequest struct {
	SessionID string                 `json:"session_id" binding:"required"`
	Settings  *contingency.Settings  `json:"settings,omitempty"`
	Config    map[string]interface{} `json:"config,omitempty"`
}

// StudyValidateResponse returns the validation result for a session's study
// files.
type StudyValidateResponse struct {
	Status    string `json:"status"`
	SessionID string `json:"session_id"`
	StudyValidationResult
}
