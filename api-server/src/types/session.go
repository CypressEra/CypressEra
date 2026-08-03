package types

import (
	"time"

	"github.com/google/uuid"
)

// SessionStatus represents the current status of a user session
type SessionStatus string

const (
	SessionStatusCreated      SessionStatus = "created"
	SessionStatusFileUploaded SessionStatus = "file_uploaded"
	SessionStatusReady        SessionStatus = "ready"
	SessionStatusProcessing   SessionStatus = "processing"
	SessionStatusCompleted    SessionStatus = "completed"
	SessionStatusFailed       SessionStatus = "failed"
)

// UserSession represents a user's calculation session
type UserSession struct {
	ID           string        `json:"id" db:"id"`
	UserID       string        `json:"user_id" db:"user_id"`
	Status       SessionStatus `json:"status" db:"status"`
	CreatedAt    time.Time     `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at" db:"updated_at"`
	FilePath     string        `json:"file_path,omitempty" db:"file_path"` // Session working file path
	ResultsPath  string        `json:"results_path,omitempty" db:"results_path"`
	Method       string        `json:"method,omitempty" db:"method"`
	Converged    *bool         `json:"converged,omitempty" db:"converged"`
	SolutionTime *int64        `json:"solution_time_ms,omitempty" db:"solution_time_ms"`

	// Original file information (for linking session to user file)
	OriginalFileName string `json:"original_file_name,omitempty" db:"original_file_name"` // Original user file name
	OriginalFilePath string `json:"original_file_path,omitempty" db:"original_file_path"` // Original user file path

	// Study files (.sub/.mon/.con) loaded into the session as working copies
	// under sessions/<user>/<session>/study/. Empty when not loaded. Each slot
	// is independent and set by POST /session/load-sub|load-mon|load-con
	// (last-write-wins).
	SubPath string `json:"sub_path,omitempty" db:"sub_path"` // Loaded .sub working copy
	MonPath string `json:"mon_path,omitempty" db:"mon_path"` // Loaded .mon working copy
	ConPath string `json:"con_path,omitempty" db:"con_path"` // Loaded .con working copy

	// PowerFlowConfig is the AC power flow configuration last used by a solve
	// or contingency run for this session. A run that omits settings inherits
	// it; a run with explicit settings replaces it. Nil until the first run.
	PowerFlowConfig map[string]interface{} `json:"power_flow_config,omitempty"`
}

// NewUserSession creates a new user session
func NewUserSession(userID string) *UserSession {
	now := time.Now()
	return &UserSession{
		ID:        uuid.New().String(),
		UserID:    userID,
		Status:    SessionStatusCreated,
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// SessionResponse represents session information response
type SessionResponse struct {
	ID        string        `json:"id"`
	UserID    string        `json:"user_id"`
	Status    SessionStatus `json:"status"`
	CreatedAt string        `json:"created_at"`
	UpdatedAt string        `json:"updated_at"`
	// Basenames of the session working files (never absolute server paths).
	// Omitted when the corresponding file is not set.
	ModelFile    string `json:"model_file,omitempty"`
	ResultsFile  string `json:"results_file,omitempty"`
	Method       string `json:"method,omitempty"`
	Converged    *bool  `json:"converged,omitempty"`
	SolutionTime *int64 `json:"solution_time_ms,omitempty"`

	// Loaded study-file names (basename of the session working copy).
	// Omitted when no file of that kind is loaded.
	SubFile string `json:"sub_file,omitempty"`
	MonFile string `json:"mon_file,omitempty"`
	ConFile string `json:"con_file,omitempty"`
}

// CreateSessionRequest represents a request to create a new session
type CreateSessionRequest struct {
	// UserID is ignored in favor of the authenticated user from JWT.
	// It is kept for backward compatibility with older clients.
	UserID string `json:"user_id"`
}

// CreateSessionResponse represents the response from creating a session
type CreateSessionResponse struct {
	SessionID string `json:"session_id"`
	Status    string `json:"status"`
	Message   string `json:"message"`
}

// CleanupSessionsResponse represents the response from cleaning up user sessions
type CleanupSessionsResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	UserID  string `json:"user_id"`
}

// HealthResponse represents health check response
type HealthResponse struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Timestamp string `json:"timestamp"`
}

// GetSessionInfoRequest represents a request to get session information
type GetSessionInfoRequest struct {
	SessionID string `json:"session_id" binding:"required"`
}

// GetNetworkRequest represents a request to get network data
type GetNetworkRequest struct {
	SessionID   string                 `json:"session_id" binding:"required"`
	ElementType string                 `json:"element_type"` // Optional: bus, load, generator, acline, transformer — return only this type
	Identifier  map[string]interface{} `json:"identifier"`   // Optional: filter to one element (e.g. {"ibus":1,"loadid":"1"})
}

// GetUserSessionsRequest represents a request to get all sessions for a user
type GetUserSessionsRequest struct {
	// UserID is ignored; the authenticated user from JWT is used instead.
	UserID string `json:"user_id"`
}

// UploadUserFileRequest represents a request to upload a file to user folder
type UploadUserFileRequest struct {
	// UserID is ignored; the authenticated user from JWT is used instead.
	UserID   string `form:"user_id"`
	FileType string `form:"file_type" binding:"required"` // "model" | "knowledge" | "sub" | "mon" | "con" | "diagram"
}

// GetUserFilesRequest represents a request to get user's files
type GetUserFilesRequest struct {
	// UserID is ignored; the authenticated user from JWT is used instead.
	UserID   string `json:"user_id"`
	FileType string `json:"file_type" binding:"required"` // "model" | "knowledge" | "sub" | "mon" | "con" | "diagram"
}

// LoadCaseRequest represents a request to create a session from a network case
// (RAWX) in the user library.
type LoadCaseRequest struct {
	// UserID is ignored; the authenticated user from JWT is used instead.
	UserID   string `json:"user_id"`
	FileName string `json:"file_name" binding:"required"`
}

// LoadStudyFileRequest represents a request to load a study file
// (.sub/.mon/.con) from the user library into an existing session.
type LoadStudyFileRequest struct {
	SessionID string `json:"session_id" binding:"required"`
	FileName  string `json:"file_name" binding:"required"`
}

// LoadStudyFileResponse represents the response after loading a study file
// into a session. It carries the validation result for all of the session's
// study files, so a client learns whether the file is usable from this one
// call — no separate validation request is needed.
//
// The response exposes only the file name, never an absolute server path.
type LoadStudyFileResponse struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	SessionID string `json:"session_id"`
	FileName  string `json:"file_name"`
	Type      string `json:"type"` // "sub" | "mon" | "con"
	StudyValidationResult
}

// SaveCaseRequest represents a request to save a session's case back to its
// origin library file.
type SaveCaseRequest struct {
	SessionID string `json:"session_id" binding:"required"`
}

// SaveCaseAsRequest represents a request to save a session's case as a new
// library file.
type SaveCaseAsRequest struct {
	SessionID   string `json:"session_id" binding:"required"`
	NewFileName string `json:"new_file_name" binding:"required"`
}

// SaveCaseAsResponse represents the response after saving a session's case as a
// new library file.
type SaveCaseAsResponse struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	SessionID string `json:"session_id"`
	FileName  string `json:"file_name"`
	FilePath  string `json:"file_path"`
}

// GetUserFilesResponse represents the response for getting user files
type GetUserFilesResponse struct {
	Status  string   `json:"status"`  // Always "success" for 200 responses
	Message string   `json:"message"`
	UserID  string   `json:"user_id"`
	Files   []string `json:"files"`
	Total   int      `json:"total"`
}
