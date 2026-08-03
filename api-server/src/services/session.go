package services

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"api-server/src/types"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// SessionServiceInterface defines the contract for session and workflow operations
type SessionServiceInterface interface {
	// Session management
	CreateSession(userID string) (*types.UserSession, error)
	GetSession(sessionID string) (*types.UserSession, bool)
	UpdateSessionStatus(sessionID string, status types.SessionStatus) error
	SetSessionFileInfo(sessionID string, filePath string) error
	SetSessionResults(sessionID string, resultsPath string, method string, converged bool, solutionTime int64) error
	SetSessionFailed(sessionID string) error
	GetUserSessions(userID string) []*types.UserSession
	CleanupUserSessions(userID string) error

	// File operations
	StoreFile(sessionID string, fileName string, fileReader io.Reader) (*types.FileInfo, error)
	GetFilePath(sessionID string) (string, error)
	SaveFile(sessionID string, fileName string, fileReader io.Reader) (string, error)

	// New user-centric file operations
	UploadUserFile(userID string, fileType string, fileName string, fileReader io.Reader) (string, error)
	GetUserFiles(userID string, fileType string) ([]string, error)
	DeleteUserFile(userID string, fileType string, fileName string) error
	LoadCase(userID string, fileName string) (string, error)
	SaveCase(sessionID string) error
	SaveCaseAs(sessionID string, newFileName string) error

	// Results management
	StoreResults(sessionID string, results []byte) (string, error)
	SaveResults(sessionID string, results interface{}) (string, error)
	SaveRawResults(sessionID string, rawJSON string) (string, error)
	GetResultsFromFile(sessionID string) (string, error)
	UpdateSessionResults(sessionID, resultsPath, method string, converged bool, solutionTime float64) error

	// Solver run artifacts
	AllocateRunPaths(sessionID string) (runID string, outputPath string, progressPath string, err error)

	// Utility methods
	GetStats() map[string]interface{}
	GetMaxFileSize() int64
	CleanupExpiredSessions(maxAge time.Duration) error
}

// SessionService manages user sessions, file operations, and workflow data
type SessionService struct {
	basePath                 string
	maxFileSize              int64
	maxSessionsPerUser       int
	sessions                 map[string]*types.UserSession
	sessionsByUser           map[string][]string
	mutex                    sync.RWMutex
	logger                   *zap.Logger
	fileService              *FileService
	defaultStudyCasePath     string // path to bundled default study case assets dir
	defaultKnowledgeBasePath string // path to bundled default knowledge base assets dir
	defaultStudyFilesPath    string // path to bundled default .sub/.mon/.con assets dir
	defaultDiagramsPath      string // path to bundled default .cyd diagram assets dir
}

// NewSessionService creates a new session service
func NewSessionService(basePath string, maxFileSize int64, maxSessionsPerUser int, defaultStudyCasePath string, defaultKnowledgeBasePath string, defaultStudyFilesPath string, defaultDiagramsPath string, logger *zap.Logger) (*SessionService, error) {
	// Create base directories for new structure
	dirs := []string{
		basePath,
		filepath.Join(basePath, "model"),     // User model files: model/{user_id}/filename.rawx
		filepath.Join(basePath, "knowledge"), // Knowledge base files: knowledge/{user_id}/*.rawx
		filepath.Join(basePath, "sub"),       // Subsystem study files: sub/{user_id}/*.sub
		filepath.Join(basePath, "mon"),       // Monitored-element study files: mon/{user_id}/*.mon
		filepath.Join(basePath, "con"),       // Contingency study files: con/{user_id}/*.con
		filepath.Join(basePath, "diagram"),   // Saved network-diagram layouts: diagram/{user_id}/*.cyd
		filepath.Join(basePath, "sessions"),      // Session workspaces: sessions/{user_id}/{session_id}/{filename}
		filepath.Join(basePath, "power-flow"),    // Standalone power-flow output: power-flow/{user_id}/{session_id}/results.json
		filepath.Join(basePath, "study-results"), // Durable analysis history: study-results/{user_id}/{result_id}/
	}

	// One-time migration: the standalone power-flow output directory was
	// renamed `results` -> `power-flow`. Rename it in place — before the
	// directories below are created — so existing results are not orphaned.
	oldResults := filepath.Join(basePath, "results")
	newPowerFlow := filepath.Join(basePath, "power-flow")
	if _, err := os.Stat(oldResults); err == nil {
		if _, statErr := os.Stat(newPowerFlow); os.IsNotExist(statErr) {
			if err := os.Rename(oldResults, newPowerFlow); err != nil {
				return nil, fmt.Errorf("failed to migrate results directory to power-flow: %w", err)
			}
		}
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	// Initialize file service for knowledge base index operations
	fileService := NewFileService(basePath, logger)

	return &SessionService{
		basePath:                 basePath,
		maxFileSize:              maxFileSize,
		maxSessionsPerUser:       maxSessionsPerUser,
		sessions:                 make(map[string]*types.UserSession),
		sessionsByUser:           make(map[string][]string),
		logger:                   logger,
		fileService:              fileService,
		defaultStudyCasePath:     defaultStudyCasePath,
		defaultKnowledgeBasePath: defaultKnowledgeBasePath,
		defaultStudyFilesPath:    defaultStudyFilesPath,
		defaultDiagramsPath:      defaultDiagramsPath,
	}, nil
}

// CreateSession creates a new user session
func (s *SessionService) CreateSession(userID string) (*types.UserSession, error) {
	// Create session outside of lock
	session := types.NewUserSession(userID)

	// Add to maps with minimal lock time
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Add to user's session list
	if s.sessionsByUser[userID] == nil {
		s.sessionsByUser[userID] = make([]string, 0, 1) // Pre-allocate with capacity
	}

	// Clean up old sessions if limit exceeded (keep only latest N sessions - FIFO)
	if len(s.sessionsByUser[userID]) >= s.maxSessionsPerUser {
		// Get oldest sessions to remove (FIFO - First In First Out)
		sessionsToRemove := len(s.sessionsByUser[userID]) - s.maxSessionsPerUser + 1

		for i := 0; i < sessionsToRemove; i++ {
			oldSessionID := s.sessionsByUser[userID][0]

			// Remove old session from maps
			if oldSession, exists := s.sessions[oldSessionID]; exists {
				// Clean up session files and directories
				if oldSession.FilePath != "" {
					if sessionDir := filepath.Dir(oldSession.FilePath); sessionDir != "" {
						os.RemoveAll(sessionDir)
					}
				}

				if oldSession.ResultsPath != "" {
					if resultsDir := filepath.Dir(oldSession.ResultsPath); resultsDir != "" {
						os.RemoveAll(resultsDir)
					}
				}

				s.logger.Info("Removed old session (FIFO cleanup)",
					zap.String("session_id", oldSessionID),
					zap.String("user_id", userID))
			}

			delete(s.sessions, oldSessionID)
			// Remove from user's session list
			s.sessionsByUser[userID] = s.sessionsByUser[userID][1:]
		}
	}

	// Add new session
	s.sessions[session.ID] = session
	s.sessionsByUser[userID] = append(s.sessionsByUser[userID], session.ID)

	s.logger.Info("Created new session",
		zap.String("session_id", session.ID),
		zap.String("user_id", userID),
		zap.Int("total_user_sessions", len(s.sessionsByUser[userID])))

	return session, nil
}

// GetSession retrieves a session by ID
func (s *SessionService) GetSession(sessionID string) (*types.UserSession, bool) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	session, exists := s.sessions[sessionID]
	return session, exists
}

// UpdateSessionStatus updates the status of a session
func (s *SessionService) UpdateSessionStatus(sessionID string, status types.SessionStatus) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
	}

	// Business logic: update status and timestamp
	session.Status = status
	session.UpdatedAt = time.Now()

	s.logger.Info("Updated session status",
		zap.String("session_id", sessionID),
		zap.String("status", string(status)))

	return nil
}

// SetSessionFileInfo sets the file path and updates session status
func (s *SessionService) SetSessionFileInfo(sessionID string, filePath string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
	}

	// Business logic: set file info and update status
	session.FilePath = filePath
	session.Status = types.SessionStatusFileUploaded
	session.UpdatedAt = time.Now()

	s.logger.Info("Set session file info",
		zap.String("session_id", sessionID),
		zap.String("file_path", filePath))

	return nil
}

// SetSessionResults sets the results information for a session
func (s *SessionService) SetSessionResults(sessionID string, resultsPath string, method string, converged bool, solutionTime int64) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
	}

	// Business logic: set results and update status
	session.ResultsPath = resultsPath
	session.Method = method
	session.Converged = &converged
	session.SolutionTime = &solutionTime
	session.Status = types.SessionStatusCompleted
	session.UpdatedAt = time.Now()

	s.logger.Info("Set session results",
		zap.String("session_id", sessionID),
		zap.String("method", method),
		zap.Bool("converged", converged))

	return nil
}

// SetSessionFailed marks a session as failed
func (s *SessionService) SetSessionFailed(sessionID string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session %s not found", sessionID)
	}

	// Business logic: mark as failed
	session.Status = types.SessionStatusFailed
	session.UpdatedAt = time.Now()

	s.logger.Info("Set session as failed",
		zap.String("session_id", sessionID))

	return nil
}

// StoreFile stores an uploaded file and returns file information.
//
// NOTE: no route uses this today. If it ever becomes a way to create a session
// working file, route RAWX content through sanitizeCopyRawx/sanitizeRawxBytes
// (rawx_sanitize.go) like LoadCase does, so working files stay strictly valid
// JSON for every consumer (warm-start writeback included).
func (s *SessionService) StoreFile(sessionID string, fileName string, fileReader io.Reader) (*types.FileInfo, error) {
	// First, get session info with minimal lock time
	var userID string
	var sessionExists bool
	func() {
		s.mutex.RLock()
		defer s.mutex.RUnlock()

		session, exists := s.sessions[sessionID]
		if !exists {
			sessionExists = false
			return
		}
		userID = session.UserID
		sessionExists = true
	}()

	if !sessionExists {
		return nil, fmt.Errorf("session %s not found", sessionID)
	}

	// Create session directory (outside of mutex lock)
	sessionDir := filepath.Join(s.basePath, "sessions", userID, sessionID)
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create session directory: %w", err)
	}

	// Create file path (use actual file name)
	filePath := filepath.Join(sessionDir, fileName)

	// Create file and copy content (outside of mutex lock)
	destFile, err := os.Create(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create file: %w", err)
	}
	defer destFile.Close()

	// Copy file content (potentially large operation)
	written, err := io.Copy(destFile, fileReader)
	if err != nil {
		// Clean up file on error
		os.Remove(filePath)
		return nil, fmt.Errorf("failed to copy file content: %w", err)
	}

	// Create file info
	fileInfo := types.NewFileInfo(sessionID, fileName, filePath, written)

	// Update session with file path (minimal lock time)
	if err := s.SetSessionFileInfo(sessionID, filePath); err != nil {
		// Clean up file on error
		os.Remove(filePath)
		return nil, fmt.Errorf("failed to update session file info: %w", err)
	}

	s.logger.Info("Stored file for session",
		zap.String("session_id", sessionID),
		zap.String("file_name", fileName),
		zap.String("file_path", filePath),
		zap.Int64("file_size", written))

	return fileInfo, nil
}

// AllocateRunPaths reserves a fresh per-run output path (and progress path)
// for a flow-solver invocation. Artifacts live under the session directory at
// sessions/<user_id>/<session_id>/runs/<run_id>.{json,jsonl} and are removed
// wholesale when the session directory is cleaned up.
//
// Each call returns a distinct run_id (UUID v4), so concurrent solver runs in
// the same session never collide.
func (s *SessionService) AllocateRunPaths(sessionID string) (string, string, string, error) {
	s.mutex.RLock()
	session, exists := s.sessions[sessionID]
	var userID string
	if exists {
		userID = session.UserID
	}
	s.mutex.RUnlock()

	if !exists {
		return "", "", "", fmt.Errorf("session %s not found", sessionID)
	}

	runsDir := filepath.Join(s.basePath, "sessions", userID, sessionID, "runs")
	if err := os.MkdirAll(runsDir, 0755); err != nil {
		return "", "", "", fmt.Errorf("failed to create runs directory: %w", err)
	}

	runID := uuid.NewString()
	outputPath := filepath.Join(runsDir, runID+".json")
	progressPath := filepath.Join(runsDir, runID+".jsonl")
	return runID, outputPath, progressPath, nil
}

// GetFilePath retrieves the file path for a session
func (s *SessionService) GetFilePath(sessionID string) (string, error) {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return "", fmt.Errorf("session %s not found", sessionID)
	}

	if session.FilePath == "" {
		return "", fmt.Errorf("no file uploaded for session %s", sessionID)
	}

	return session.FilePath, nil
}

// StoreResults stores calculation results for a session
func (s *SessionService) StoreResults(sessionID string, results []byte) (string, error) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return "", fmt.Errorf("session %s not found", sessionID)
	}

	// Create results directory
	resultsDir := filepath.Join(s.basePath, "power-flow", session.UserID, sessionID)
	if err := os.MkdirAll(resultsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create results directory: %w", err)
	}

	// Create results file
	resultsPath := filepath.Join(resultsDir, "results.json")
	if err := os.WriteFile(resultsPath, results, 0644); err != nil {
		return "", fmt.Errorf("failed to write results file: %w", err)
	}

	s.logger.Info("Stored results for session",
		zap.String("session_id", sessionID),
		zap.String("results_path", resultsPath))

	return resultsPath, nil
}

// GetUserSessions retrieves all sessions for a user
func (s *SessionService) GetUserSessions(userID string) []*types.UserSession {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	var userSessions []*types.UserSession
	if sessionIDs, exists := s.sessionsByUser[userID]; exists {
		for _, sessionID := range sessionIDs {
			if session, ok := s.sessions[sessionID]; ok {
				userSessions = append(userSessions, session)
			}
		}
	}

	return userSessions
}

// CleanupExpiredSessions removes sessions older than the specified duration
func (s *SessionService) CleanupExpiredSessions(maxAge time.Duration) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	cutoff := time.Now().Add(-maxAge)
	var expiredSessions []string

	// Find expired sessions
	for sessionID, session := range s.sessions {
		if session.UpdatedAt.Before(cutoff) {
			expiredSessions = append(expiredSessions, sessionID)
		}
	}

	// Remove expired sessions
	for _, sessionID := range expiredSessions {
		session := s.sessions[sessionID]

		// Remove from user's session list
		if userSessions, exists := s.sessionsByUser[session.UserID]; exists {
			for i, id := range userSessions {
				if id == sessionID {
					s.sessionsByUser[session.UserID] = append(userSessions[:i], userSessions[i+1:]...)
					break
				}
			}
		}

		// Remove session
		delete(s.sessions, sessionID)

		// Clean up files
		if session.FilePath != "" {
			if sessionDir := filepath.Dir(session.FilePath); sessionDir != "" {
				os.RemoveAll(sessionDir)
			}
		}

		if session.ResultsPath != "" {
			if resultsDir := filepath.Dir(session.ResultsPath); resultsDir != "" {
				os.RemoveAll(resultsDir)
			}
		}
	}

	if len(expiredSessions) > 0 {
		s.logger.Info("Cleaned up expired sessions",
			zap.Int("count", len(expiredSessions)))
	}

	return nil
}

// CleanupUserSessions removes all sessions for a specific user
func (s *SessionService) CleanupUserSessions(userID string) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	userSessions, exists := s.sessionsByUser[userID]
	if !exists {
		return nil // No sessions to clean up
	}

	var sessionsToDelete []string
	for _, sessionID := range userSessions {
		if session, ok := s.sessions[sessionID]; ok {
			sessionsToDelete = append(sessionsToDelete, sessionID)

			// Clean up files
			if session.FilePath != "" {
				if sessionDir := filepath.Dir(session.FilePath); sessionDir != "" {
					os.RemoveAll(sessionDir)
				}
			}

			if session.ResultsPath != "" {
				if resultsDir := filepath.Dir(session.ResultsPath); resultsDir != "" {
					os.RemoveAll(resultsDir)
				}
			}

			// Remove session
			delete(s.sessions, sessionID)
		}
	}

	// Clear user's session list
	delete(s.sessionsByUser, userID)

	s.logger.Info("Cleaned up user sessions",
		zap.String("user_id", userID),
		zap.Int("count", len(sessionsToDelete)))

	return nil
}

// GetStats returns storage statistics
func (s *SessionService) GetStats() map[string]interface{} {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	totalSessions := len(s.sessions)
	activeSessions := 0
	completedSessions := 0
	failedSessions := 0

	for _, session := range s.sessions {
		switch session.Status {
		case types.SessionStatusCompleted:
			completedSessions++
		case types.SessionStatusFailed:
			failedSessions++
		default:
			activeSessions++
		}
	}

	return map[string]interface{}{
		"total_sessions":        totalSessions,
		"active_sessions":       activeSessions,
		"completed_sessions":    completedSessions,
		"failed_sessions":       failedSessions,
		"max_file_size":         s.maxFileSize,
		"max_sessions_per_user": s.maxSessionsPerUser,
	}
}

// copyFile copies a file from src to dst
func (s *SessionService) copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}

// CopyDefaultStudyCase copies the bundled default study case file into the
// new user's model storage directory. Errors are logged but not returned so
// that registration is never blocked.
func (s *SessionService) CopyDefaultStudyCase(userID string) {
	if s.defaultStudyCasePath == "" {
		return
	}

	entries, err := os.ReadDir(s.defaultStudyCasePath)
	if err != nil {
		s.logger.Warn("Default study case assets directory not found",
			zap.String("path", s.defaultStudyCasePath), zap.Error(err))
		return
	}

	userModelsDir := filepath.Join(s.basePath, "model", userID)
	if err := os.MkdirAll(userModelsDir, 0755); err != nil {
		s.logger.Warn("Failed to create user models directory",
			zap.String("user_id", userID), zap.Error(err))
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		src := filepath.Join(s.defaultStudyCasePath, entry.Name())
		dst := filepath.Join(userModelsDir, entry.Name())
		if err := s.copyFile(src, dst); err != nil {
			s.logger.Warn("Failed to copy default study case file",
				zap.String("user_id", userID),
				zap.String("file", entry.Name()),
				zap.Error(err))
			return
		}
		s.logger.Info("Copied default study case for new user",
			zap.String("user_id", userID),
			zap.String("file", entry.Name()))
	}
}

// CopyDefaultKnowledgeBase copies the bundled default knowledge base file into the
// new user's knowledge storage directory. Errors are logged but not returned so
// that registration is never blocked.
func (s *SessionService) CopyDefaultKnowledgeBase(userID string) {
	if s.defaultKnowledgeBasePath == "" {
		return
	}

	entries, err := os.ReadDir(s.defaultKnowledgeBasePath)
	if err != nil {
		s.logger.Warn("Default knowledge base assets directory not found",
			zap.String("path", s.defaultKnowledgeBasePath), zap.Error(err))
		return
	}

	userKnowledgeDir := filepath.Join(s.basePath, "knowledge", userID)
	if err := os.MkdirAll(userKnowledgeDir, 0755); err != nil {
		s.logger.Warn("Failed to create user knowledge directory",
			zap.String("user_id", userID), zap.Error(err))
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		src := filepath.Join(s.defaultKnowledgeBasePath, entry.Name())
		dst := filepath.Join(userKnowledgeDir, entry.Name())
		if err := s.copyFile(src, dst); err != nil {
			s.logger.Warn("Failed to copy default knowledge base file",
				zap.String("user_id", userID),
				zap.String("file", entry.Name()),
				zap.Error(err))
			return
		}
		s.logger.Info("Copied default knowledge base for new user",
			zap.String("user_id", userID),
			zap.String("file", entry.Name()))
	}
}

// CopyDefaultStudyFiles copies the bundled default .sub / .mon / .con study
// files into the new user's storage. Each file is routed to the directory for
// its kind (sub/mon/con) by extension. Errors are logged but not returned, so
// that registration is never blocked.
func (s *SessionService) CopyDefaultStudyFiles(userID string) {
	if s.defaultStudyFilesPath == "" {
		return
	}

	entries, err := os.ReadDir(s.defaultStudyFilesPath)
	if err != nil {
		s.logger.Warn("Default study-files assets directory not found",
			zap.String("path", s.defaultStudyFilesPath), zap.Error(err))
		return
	}

	// Bundled-file extension → user-data subdirectory under basePath.
	dirByExt := map[string]string{".sub": "sub", ".mon": "mon", ".con": "con"}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		kindDir, ok := dirByExt[ext]
		if !ok {
			continue // not a study file — ignore other assets quietly
		}
		userKindDir := filepath.Join(s.basePath, kindDir, userID)
		if err := os.MkdirAll(userKindDir, 0755); err != nil {
			s.logger.Warn("Failed to create user study-files directory",
				zap.String("user_id", userID),
				zap.String("kind", kindDir), zap.Error(err))
			continue
		}
		src := filepath.Join(s.defaultStudyFilesPath, entry.Name())
		dst := filepath.Join(userKindDir, entry.Name())
		if err := s.copyFile(src, dst); err != nil {
			s.logger.Warn("Failed to copy default study file",
				zap.String("user_id", userID),
				zap.String("file", entry.Name()), zap.Error(err))
			continue
		}
		s.logger.Info("Copied default study file for new user",
			zap.String("user_id", userID),
			zap.String("file", entry.Name()),
			zap.String("kind", kindDir))
	}
}

// CopyDefaultDiagrams copies the bundled default `.cyd` / `.cyd.gz` diagram
// templates into the new user's storage at `diagram/{userID}/`. Errors are
// logged but not returned, so registration is never blocked.
func (s *SessionService) CopyDefaultDiagrams(userID string) {
	if s.defaultDiagramsPath == "" {
		return
	}

	entries, err := os.ReadDir(s.defaultDiagramsPath)
	if err != nil {
		s.logger.Warn("Default diagrams assets directory not found",
			zap.String("path", s.defaultDiagramsPath), zap.Error(err))
		return
	}

	userDiagramDir := filepath.Join(s.basePath, "diagram", userID)
	if err := os.MkdirAll(userDiagramDir, 0755); err != nil {
		s.logger.Warn("Failed to create user diagram directory",
			zap.String("user_id", userID), zap.Error(err))
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		lower := strings.ToLower(name)
		// Only seed the canonical diagram extensions; ignore stray non-cyd files
		// that might end up in the assets dir.
		if !strings.HasSuffix(lower, ".cyd") && !strings.HasSuffix(lower, ".cyd.gz") && !strings.HasSuffix(lower, ".cyd.json") {
			continue
		}
		src := filepath.Join(s.defaultDiagramsPath, name)
		dst := filepath.Join(userDiagramDir, name)
		// Don't clobber if the user happens to already have a file with the
		// same name (e.g. re-registration in dev).
		if _, statErr := os.Stat(dst); statErr == nil {
			continue
		}
		if err := s.copyFile(src, dst); err != nil {
			s.logger.Warn("Failed to copy default diagram",
				zap.String("user_id", userID),
				zap.String("file", name), zap.Error(err))
			continue
		}
		s.logger.Info("Copied default diagram for new user",
			zap.String("user_id", userID),
			zap.String("file", name))
	}
}

// WriteToFile writes data to a file
func (s *SessionService) WriteToFile(filePath string, data []byte) error {
	return os.WriteFile(filePath, data, 0644)
}

// GetMaxFileSize returns the maximum allowed file size
func (s *SessionService) GetMaxFileSize() int64 {
	return s.maxFileSize
}

// BasePath returns the resolved storage base path, so other stores (e.g. the
// study-result store) share the same on-disk root.
func (s *SessionService) BasePath() string {
	return s.basePath
}

// UpdateSessionResults updates session with calculation results
func (s *SessionService) UpdateSessionResults(sessionID, resultsPath, method string, converged bool, solutionTime float64) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found")
	}

	session.ResultsPath = resultsPath
	session.Method = method
	session.Converged = &converged
	solutionTimeMs := int64(solutionTime * 1000) // Convert to milliseconds
	session.SolutionTime = &solutionTimeMs
	session.Status = types.SessionStatusCompleted
	session.UpdatedAt = time.Now()

	return nil
}

// GetPowerFlowConfig returns the AC power flow configuration last saved for the
// session, or nil when none has been saved.
func (s *SessionService) GetPowerFlowConfig(sessionID string) map[string]interface{} {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	if session, exists := s.sessions[sessionID]; exists {
		return session.PowerFlowConfig
	}
	return nil
}

// SetPowerFlowConfig saves the AC power flow configuration on the session,
// replacing any previously saved configuration.
func (s *SessionService) SetPowerFlowConfig(sessionID string, config map[string]interface{}) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	session, exists := s.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found")
	}

	session.PowerFlowConfig = config
	session.UpdatedAt = time.Now()

	return nil
}

// ResolvePowerFlowConfig returns the effective power flow configuration for a
// run. When the request carries an explicit config it wins and is saved on the
// session; otherwise the session's saved config is used; otherwise nil, so the
// solver applies its defaults. A request without a config never overwrites the
// session's saved config.
func (s *SessionService) ResolvePowerFlowConfig(sessionID string, requestConfig map[string]interface{}) map[string]interface{} {
	if len(requestConfig) > 0 {
		_ = s.SetPowerFlowConfig(sessionID, requestConfig)
		return requestConfig
	}
	return s.GetPowerFlowConfig(sessionID)
}

// SaveFile saves an uploaded file and returns the file path.
//
// NOTE: no route uses this today. See the sanitization note on StoreFile
// before wiring it into any session working-file path.
func (s *SessionService) SaveFile(sessionID string, fileName string, fileReader io.Reader) (string, error) {
	fileInfo, err := s.StoreFile(sessionID, fileName, fileReader)
	if err != nil {
		return "", err
	}
	return fileInfo.FilePath, nil
}

// SaveResults saves power flow calculation results to a file
func (s *SessionService) SaveResults(sessionID string, results interface{}) (string, error) {
	session, exists := s.GetSession(sessionID)
	if !exists {
		return "", fmt.Errorf("session not found")
	}

	// Create results directory
	resultsDir := filepath.Join(s.basePath, "power-flow", session.UserID, sessionID)
	if err := os.MkdirAll(resultsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create results directory: %w", err)
	}

	// Create results file path
	resultsPath := filepath.Join(resultsDir, "results.json")

	// Convert results to JSON
	resultsJSON, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal results to JSON: %w", err)
	}

	// Write results to file
	if err := os.WriteFile(resultsPath, resultsJSON, 0644); err != nil {
		return "", fmt.Errorf("failed to write results file: %w", err)
	}

	return resultsPath, nil
}

// SaveRawResults saves raw JSON output directly to file
func (s *SessionService) SaveRawResults(sessionID string, rawJSON string) (string, error) {
	session, exists := s.GetSession(sessionID)
	if !exists {
		return "", fmt.Errorf("session not found")
	}

	// Create results directory
	resultsDir := filepath.Join(s.basePath, "power-flow", session.UserID, sessionID)
	if err := os.MkdirAll(resultsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create results directory: %w", err)
	}

	// Create results file path
	resultsPath := filepath.Join(resultsDir, "results.json")

	// Write raw JSON directly to file
	if err := os.WriteFile(resultsPath, []byte(rawJSON), 0644); err != nil {
		return "", fmt.Errorf("failed to write results file: %w", err)
	}

	return resultsPath, nil
}

// GetResultsFromFile reads power flow results from file
func (s *SessionService) GetResultsFromFile(sessionID string) (string, error) {
	session, exists := s.GetSession(sessionID)
	if !exists {
		return "", fmt.Errorf("session not found")
	}

	if session.ResultsPath == "" {
		return "", fmt.Errorf("no results file path for session")
	}

	// Read results file
	resultsData, err := os.ReadFile(session.ResultsPath)
	if err != nil {
		return "", fmt.Errorf("failed to read results file: %w", err)
	}

	return string(resultsData), nil
}

// UploadUserFile uploads a file to the user's folder (models or knowledge)
// fileType should be "model" or "knowledge"
func (s *SessionService) UploadUserFile(userID string, fileType string, fileName string, fileReader io.Reader) (string, error) {
	// Validate file type
	if !validUserFileType(fileType) {
		return "", fmt.Errorf("invalid file type: %s. Must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'", fileType)
	}

	// Create user directory based on file type
	userDir := filepath.Join(s.basePath, fileType, userID)
	if err := os.MkdirAll(userDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create user %s directory: %w", fileType, err)
	}

	// Create file path
	filePath := filepath.Join(userDir, fileName)

	// Create file and copy content
	destFile, err := os.Create(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to create file: %w", err)
	}
	defer destFile.Close()

	// Copy file content
	written, err := io.Copy(destFile, fileReader)
	if err != nil {
		// Clean up file on error
		os.Remove(filePath)
		return "", fmt.Errorf("failed to copy file content: %w", err)
	}

	s.logger.Info("Uploaded user file",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.String("file_name", fileName),
		zap.String("file_path", filePath),
		zap.Int64("file_size", written))

	return filePath, nil
}

// GetUserFiles returns a list of files for a user (models or knowledge)
// fileType should be "model" or "knowledge"
func (s *SessionService) GetUserFiles(userID string, fileType string) ([]string, error) {
	// Validate file type
	if !validUserFileType(fileType) {
		return nil, fmt.Errorf("invalid file type: %s. Must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'", fileType)
	}

	userDir := filepath.Join(s.basePath, fileType, userID)

	// Check if user directory exists
	if _, err := os.Stat(userDir); os.IsNotExist(err) {
		return []string{}, nil // Return empty slice if user has no files
	}

	// Read directory contents
	entries, err := os.ReadDir(userDir)
	if err != nil {
		return nil, fmt.Errorf("failed to read user directory: %w", err)
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() {
			// Skip hidden files (files starting with .)
			if strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			files = append(files, entry.Name())
		}
	}

	s.logger.Info("Retrieved user files",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.Int("file_count", len(files)))

	return files, nil
}

// GetUserFilePath returns the full file path for a user file
// Returns the file path and file info (size, mod time) if the file exists
func (s *SessionService) GetUserFilePath(userID string, fileType string, fileName string) (string, os.FileInfo, error) {
	// Validate file type
	if !validUserFileType(fileType) {
		return "", nil, fmt.Errorf("invalid file type: %s. Must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'", fileType)
	}

	// Construct file path
	filePath := filepath.Join(s.basePath, fileType, userID, fileName)

	// Check if file exists and get file info
	fileInfo, err := os.Stat(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil, fmt.Errorf("file not found: %s", fileName)
		}
		return "", nil, fmt.Errorf("failed to access file: %w", err)
	}

	// Security check: ensure the file is actually in the user's directory
	// (prevent directory traversal attacks)
	expectedDir := filepath.Join(s.basePath, fileType, userID)
	absFilePath, err := filepath.Abs(filePath)
	if err != nil {
		return "", nil, fmt.Errorf("failed to get absolute path: %w", err)
	}
	absExpectedDir, err := filepath.Abs(expectedDir)
	if err != nil {
		return "", nil, fmt.Errorf("failed to get absolute path: %w", err)
	}
	if !strings.HasPrefix(absFilePath, absExpectedDir) {
		return "", nil, fmt.Errorf("invalid file path: access denied")
	}

	return absFilePath, fileInfo, nil
}

// DeleteUserFile deletes a user file (models or knowledge)
func (s *SessionService) DeleteUserFile(userID string, fileType string, fileName string) error {
	// Validate file type
	if !validUserFileType(fileType) {
		return fmt.Errorf("invalid file type: %s. Must be 'model', 'knowledge', 'sub', 'mon', 'con', or 'diagram'", fileType)
	}

	// Construct file path
	filePath := filepath.Join(s.basePath, fileType, userID, fileName)

	// Security check: ensure the file is actually in the user's directory
	// (prevent directory traversal attacks)
	expectedDir := filepath.Join(s.basePath, fileType, userID)
	absFilePath, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %w", err)
	}
	absExpectedDir, err := filepath.Abs(expectedDir)
	if err != nil {
		return fmt.Errorf("failed to get absolute path: %w", err)
	}
	if !strings.HasPrefix(absFilePath, absExpectedDir) {
		return fmt.Errorf("invalid file path: access denied")
	}

	// Check if file exists
	if _, err := os.Stat(absFilePath); os.IsNotExist(err) {
		return fmt.Errorf("file not found: %s", fileName)
	}

	// Delete the file
	if err := os.Remove(absFilePath); err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	// If this is a knowledge base file, also clean up associated index files
	// (chunk NDJSON files and index.json metadata)
	if fileType == "knowledge" {
		if err := s.fileService.CleanupKnowledgeBaseIndex(userID, fileName); err != nil {
			// Log error but don't fail the deletion - file is already deleted
			s.logger.Warn("Failed to cleanup knowledge base index",
				zap.String("user_id", userID),
				zap.String("file_name", fileName),
				zap.Error(err))
		}
	}

	s.logger.Info("Deleted user file",
		zap.String("user_id", userID),
		zap.String("file_type", fileType),
		zap.String("file_name", fileName))

	return nil
}

// LoadCase creates a session and copies a user model file to the session workspace
func (s *SessionService) LoadCase(userID string, fileName string) (string, error) {
	// Get user model file path
	userFilePath := filepath.Join(s.basePath, "model", userID, fileName)

	// Check if file exists
	if _, err := os.Stat(userFilePath); os.IsNotExist(err) {
		return "", fmt.Errorf("model file %s not found for user %s", fileName, userID)
	}

	// Create session
	session, err := s.CreateSession(userID)
	if err != nil {
		return "", fmt.Errorf("failed to create session: %w", err)
	}

	// Create session workspace directory
	sessionDir := filepath.Join(s.basePath, "sessions", userID, session.ID)
	if err := os.MkdirAll(sessionDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create session directory: %w", err)
	}

	// Copy file to session workspace (use actual file name). RAWX files are
	// sanitized on the way in (PSS/E exports can carry JSON non-conformances;
	// see rawx_sanitize.go) so the working file is strictly valid JSON for
	// every downstream consumer, warm-start writeback included.
	sessionFilePath := filepath.Join(sessionDir, fileName)
	var copyErr error
	if strings.EqualFold(filepath.Ext(fileName), ".rawx") {
		copyErr = s.sanitizeCopyRawx(userFilePath, sessionFilePath)
	} else {
		copyErr = s.copyFile(userFilePath, sessionFilePath)
	}
	if copyErr != nil {
		return "", fmt.Errorf("failed to copy file to session workspace: %w", copyErr)
	}

	// Set session file info and original file information
	if err := s.SetSessionFileInfo(session.ID, sessionFilePath); err != nil {
		return "", fmt.Errorf("failed to set session file info: %w", err)
	}

	// Store original file information in session (needed for saving back to user file)
	s.mutex.Lock()
	session.FilePath = sessionFilePath
	session.OriginalFileName = fileName
	session.OriginalFilePath = userFilePath
	s.mutex.Unlock()

	s.logger.Info("Created session from file",
		zap.String("user_id", userID),
		zap.String("session_id", session.ID),
		zap.String("original_file_name", fileName),
		zap.String("original_file_path", userFilePath),
		zap.String("session_file_path", sessionFilePath))

	return session.ID, nil
}

// SaveCase saves the session's working file back to the user's original model file
func (s *SessionService) SaveCase(sessionID string) error {
	session, exists := s.GetSession(sessionID)
	if !exists {
		return fmt.Errorf("session not found")
	}

	if session.FilePath == "" {
		return fmt.Errorf("no working file found in session")
	}

	if session.OriginalFilePath == "" {
		return fmt.Errorf("no original file path found in session - session was not created from a user model file")
	}

	// Copy session working file back to original user model file (overwrite)
	if err := s.copyFile(session.FilePath, session.OriginalFilePath); err != nil {
		return fmt.Errorf("failed to save session file to user model file: %w", err)
	}

	s.logger.Info("Saved session file to user model file",
		zap.String("session_id", sessionID),
		zap.String("user_id", session.UserID),
		zap.String("original_file_path", session.OriginalFilePath),
		zap.String("original_file_name", session.OriginalFileName))

	return nil
}

// SaveCaseAs saves the session's working file as a new user model file
// This creates a new file, renames the session temp file to match, and updates the mapping
func (s *SessionService) SaveCaseAs(sessionID string, newFileName string) error {
	session, exists := s.GetSession(sessionID)
	if !exists {
		return fmt.Errorf("session not found")
	}

	if session.FilePath == "" {
		return fmt.Errorf("no working file found in session")
	}

	// Create user models directory if it doesn't exist
	userModelsDir := filepath.Join(s.basePath, "model", session.UserID)
	if err := os.MkdirAll(userModelsDir, 0755); err != nil {
		return fmt.Errorf("failed to create user models directory: %w", err)
	}

	// Create new user file path
	newUserFilePath := filepath.Join(userModelsDir, newFileName)

	// Check if file already exists - if it does, we'll overwrite it
	fileExists := false
	if _, err := os.Stat(newUserFilePath); err == nil {
		fileExists = true
		s.logger.Info("File already exists, will overwrite",
			zap.String("file_name", newFileName),
			zap.String("file_path", newUserFilePath))
	}

	// Copy session working file to new user file location (will overwrite if exists)
	if err := s.copyFile(session.FilePath, newUserFilePath); err != nil {
		return fmt.Errorf("failed to copy session file to new user file: %w", err)
	}

	// Get the session directory
	sessionDir := filepath.Dir(session.FilePath)
	oldFileName := filepath.Base(session.FilePath)
	newSessionFilePath := filepath.Join(sessionDir, newFileName)

	// Rename the session temp file to match the new file name
	if err := os.Rename(session.FilePath, newSessionFilePath); err != nil {
		// If rename fails, try to clean up the new user file we created
		os.Remove(newUserFilePath)
		return fmt.Errorf("failed to rename session temp file: %w", err)
	}

	// Update session with new file information
	s.mutex.Lock()
	session.FilePath = newSessionFilePath
	session.OriginalFileName = newFileName
	session.OriginalFilePath = newUserFilePath
	s.mutex.Unlock()

	if fileExists {
		s.logger.Info("Overwritten existing user model file",
			zap.String("session_id", sessionID),
			zap.String("user_id", session.UserID),
			zap.String("old_file_name", oldFileName),
			zap.String("new_file_name", newFileName),
			zap.String("new_user_file_path", newUserFilePath),
			zap.String("new_session_file_path", newSessionFilePath))
	} else {
		s.logger.Info("Saved session file as new user model file",
			zap.String("session_id", sessionID),
			zap.String("user_id", session.UserID),
			zap.String("old_file_name", oldFileName),
			zap.String("new_file_name", newFileName),
			zap.String("new_user_file_path", newUserFilePath),
			zap.String("new_session_file_path", newSessionFilePath))
	}

	return nil
}

// --- RAWX warm-start writeback helpers --------------------------------------
//
// All values written here are emitted by the solver in RAWX-native units, so
// the api-server only copies them into the matching rows by identity — no
// power-system math on the Go side.

// rawxFieldIndex returns the column index of a named field in a RAWX section's
// "fields" array, matched case-insensitively.
func rawxFieldIndex(fields []interface{}, name string) (int, bool) {
	for i, f := range fields {
		if s, ok := f.(string); ok && strings.EqualFold(s, name) {
			return i, true
		}
	}
	return -1, false
}

// rawxSection returns the fields[] and data[] arrays for a RAWX network section.
func rawxSection(network map[string]interface{}, name string) (fields []interface{}, data []interface{}, ok bool) {
	sec, ok := network[name].(map[string]interface{})
	if !ok {
		return nil, nil, false
	}
	if fields, ok = sec["fields"].([]interface{}); !ok {
		return nil, nil, false
	}
	if data, ok = sec["data"].([]interface{}); !ok {
		return nil, nil, false
	}
	return fields, data, true
}

func colFloat(cols []interface{}, idx int) (float64, bool) {
	if idx < 0 || idx >= len(cols) {
		return 0, false
	}
	f, ok := cols[idx].(float64)
	return f, ok
}

func colStr(cols []interface{}, idx int) string {
	if idx < 0 || idx >= len(cols) {
		return ""
	}
	return asStr(cols[idx])
}

func setCol(cols []interface{}, idx int, v float64) {
	if idx >= 0 && idx < len(cols) {
		cols[idx] = v
	}
}

func asFloat(v interface{}) float64 {
	if f, ok := v.(float64); ok {
		return f
	}
	return 0
}

func asStr(v interface{}) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		return ""
	}
}

func idKey4(ibus, jbus, kbus float64, ckt string) string {
	return fmt.Sprintf("%d|%d|%d|%s", int(ibus), int(jbus), int(kbus), strings.TrimSpace(ckt))
}

func idKey2(ibus float64, id string) string {
	return fmt.Sprintf("%d|%s", int(ibus), strings.TrimSpace(id))
}

// UpdateControlState folds the solved control state from a converged AC power
// flow into the session's working RAWX so the next solve warm-starts. It
// extends the bus-voltage writeback to transformer taps/angles, switched-shunt
// binit, generator reactive (+ slack real) power and two-terminal DC taps, in a
// single read/parse/write pass. Only operates on files under the sessions dir.
func (s *SessionService) UpdateControlState(filePath string, resultData map[string]interface{}) error {
	// Path guard: session working files only.
	sessionsDir := filepath.Join(s.basePath, "sessions")
	absFilePath, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("failed to resolve file path: %w", err)
	}
	absSessionsDir, err := filepath.Abs(sessionsDir)
	if err != nil {
		return fmt.Errorf("failed to resolve sessions directory: %w", err)
	}
	if !strings.HasPrefix(absFilePath, absSessionsDir) {
		return fmt.Errorf("control writeback only allowed for session files, got: %s", filePath)
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return fmt.Errorf("failed to read rawx file: %w", err)
	}
	var rawx map[string]interface{}
	if err := json.Unmarshal(data, &rawx); err != nil {
		return fmt.Errorf("failed to parse rawx JSON: %w", err)
	}
	network, ok := rawx["network"].(map[string]interface{})
	if !ok {
		return fmt.Errorf("rawx file missing 'network' key")
	}

	writeBusVoltages(network, resultData)
	writeTransformerTaps(network, resultData)
	writeSwitchedShunts(network, resultData)
	writeGenerators(network, resultData)
	writeTwoTermDc(network, resultData)

	updatedJSON, err := json.Marshal(rawx)
	if err != nil {
		return fmt.Errorf("failed to marshal updated rawx: %w", err)
	}
	return os.WriteFile(filePath, updatedJSON, 0644)
}

func writeBusVoltages(network map[string]interface{}, resultData map[string]interface{}) {
	results, _ := resultData["bus_results"].([]interface{})
	if len(results) == 0 {
		return
	}
	fields, rows, ok := rawxSection(network, "bus")
	if !ok {
		return
	}
	iIbus, okI := rawxFieldIndex(fields, "ibus")
	iVm, okVm := rawxFieldIndex(fields, "vm")
	iVa, okVa := rawxFieldIndex(fields, "va")
	if !okI || !okVm || !okVa {
		return
	}
	type vmva struct{ vm, va float64 }
	m := make(map[float64]vmva, len(results))
	for _, r := range results {
		rm, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		ibus, ok := rm["ibus"].(float64)
		if !ok {
			continue
		}
		vm, okVm := rm["vm"].(float64)
		va, okVa := rm["va"].(float64)
		if okVm && okVa {
			m[ibus] = vmva{vm, va}
		}
	}
	for _, row := range rows {
		cols, ok := row.([]interface{})
		if !ok {
			continue
		}
		ibus, ok := colFloat(cols, iIbus)
		if !ok {
			continue
		}
		if v, ok := m[ibus]; ok {
			setCol(cols, iVm, v.vm)
			setCol(cols, iVa, v.va)
		}
	}
}

func writeTransformerTaps(network map[string]interface{}, resultData map[string]interface{}) {
	results, _ := resultData["transformer_results"].([]interface{})
	if len(results) == 0 {
		return
	}
	fields, rows, ok := rawxSection(network, "transformer")
	if !ok {
		return
	}
	iIbus, _ := rawxFieldIndex(fields, "ibus")
	iJbus, _ := rawxFieldIndex(fields, "jbus")
	iKbus, _ := rawxFieldIndex(fields, "kbus")
	iCkt, _ := rawxFieldIndex(fields, "ckt")
	windvIdx := map[int]int{}
	angIdx := map[int]int{}
	for w := 1; w <= 3; w++ {
		if idx, ok := rawxFieldIndex(fields, fmt.Sprintf("windv%d", w)); ok {
			windvIdx[w] = idx
		}
		if idx, ok := rawxFieldIndex(fields, fmt.Sprintf("ang%d", w)); ok {
			angIdx[w] = idx
		}
	}
	type tap struct {
		winding     int
		windv, ang  float64
	}
	m := map[string][]tap{}
	for _, r := range results {
		rm, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		tw, ok := rm["tap_writeback"].([]interface{})
		if !ok || len(tw) == 0 {
			continue
		}
		key := idKey4(asFloat(rm["ibus"]), asFloat(rm["jbus"]), asFloat(rm["kbus"]), asStr(rm["ckt"]))
		var taps []tap
		for _, t := range tw {
			tm, ok := t.(map[string]interface{})
			if !ok {
				continue
			}
			windv, okW := tm["windv"].(float64)
			if !okW {
				continue
			}
			taps = append(taps, tap{int(asFloat(tm["winding"])), windv, asFloat(tm["ang"])})
		}
		if len(taps) > 0 {
			m[key] = taps
		}
	}
	if len(m) == 0 {
		return
	}
	for _, row := range rows {
		cols, ok := row.([]interface{})
		if !ok {
			continue
		}
		ib, _ := colFloat(cols, iIbus)
		jb, _ := colFloat(cols, iJbus)
		kb, _ := colFloat(cols, iKbus)
		key := idKey4(ib, jb, kb, colStr(cols, iCkt))
		taps, ok := m[key]
		if !ok {
			continue
		}
		for _, t := range taps {
			if idx, ok := windvIdx[t.winding]; ok {
				setCol(cols, idx, t.windv)
			}
			if idx, ok := angIdx[t.winding]; ok {
				setCol(cols, idx, t.ang)
			}
		}
	}
}

func writeSwitchedShunts(network map[string]interface{}, resultData map[string]interface{}) {
	results, _ := resultData["swshunt_results"].([]interface{})
	if len(results) == 0 {
		return
	}
	fields, rows, ok := rawxSection(network, "swshunt")
	if !ok {
		return
	}
	iIbus, okI := rawxFieldIndex(fields, "ibus")
	iShntid, _ := rawxFieldIndex(fields, "shntid")
	iBinit, okB := rawxFieldIndex(fields, "binit")
	if !okI || !okB {
		return
	}
	m := map[string]float64{}
	for _, r := range results {
		rm, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		ibus, ok := rm["ibus"].(float64)
		if !ok {
			continue
		}
		binit, ok := rm["binit_solved"].(float64)
		if !ok {
			continue
		}
		m[idKey2(ibus, asStr(rm["shntid"]))] = binit
	}
	for _, row := range rows {
		cols, ok := row.([]interface{})
		if !ok {
			continue
		}
		ibus, _ := colFloat(cols, iIbus)
		if b, ok := m[idKey2(ibus, colStr(cols, iShntid))]; ok {
			setCol(cols, iBinit, b)
		}
	}
}

func writeGenerators(network map[string]interface{}, resultData map[string]interface{}) {
	results, _ := resultData["generator_results"].([]interface{})
	if len(results) == 0 {
		return
	}
	fields, rows, ok := rawxSection(network, "generator")
	if !ok {
		return
	}
	iIbus, okI := rawxFieldIndex(fields, "ibus")
	iMachid, _ := rawxFieldIndex(fields, "machid")
	iQg, okQ := rawxFieldIndex(fields, "qg")
	iPg, _ := rawxFieldIndex(fields, "pg")
	if !okI || !okQ {
		return
	}
	type gen struct {
		qg float64
		pg *float64
	}
	m := map[string]gen{}
	for _, r := range results {
		rm, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		ibus, ok := rm["ibus"].(float64)
		if !ok {
			continue
		}
		qg, ok := rm["qg"].(float64)
		if !ok {
			continue
		}
		g := gen{qg: qg}
		if pg, ok := rm["pg_solved"].(float64); ok {
			pgv := pg
			g.pg = &pgv
		}
		m[idKey2(ibus, asStr(rm["machid"]))] = g
	}
	for _, row := range rows {
		cols, ok := row.([]interface{})
		if !ok {
			continue
		}
		ibus, _ := colFloat(cols, iIbus)
		g, ok := m[idKey2(ibus, colStr(cols, iMachid))]
		if !ok {
			continue
		}
		setCol(cols, iQg, g.qg)
		if g.pg != nil {
			setCol(cols, iPg, *g.pg)
		}
	}
}

func writeTwoTermDc(network map[string]interface{}, resultData map[string]interface{}) {
	results, _ := resultData["twotermdc_results"].([]interface{})
	if len(results) == 0 {
		return
	}
	fields, rows, ok := rawxSection(network, "twotermdc")
	if !ok {
		return
	}
	iName, _ := rawxFieldIndex(fields, "name")
	iIpr, _ := rawxFieldIndex(fields, "ipr")
	iIpi, _ := rawxFieldIndex(fields, "ipi")
	iTapr, okR := rawxFieldIndex(fields, "tapr")
	iTapi, okI := rawxFieldIndex(fields, "tapi")
	if !okR && !okI {
		return
	}
	type dc struct{ tapr, tapi *float64 }
	m := map[string]dc{}
	for _, r := range results {
		rm, ok := r.(map[string]interface{})
		if !ok {
			continue
		}
		var d dc
		if v, ok := rm["tapr"].(float64); ok {
			vv := v
			d.tapr = &vv
		}
		if v, ok := rm["tapi"].(float64); ok {
			vv := v
			d.tapi = &vv
		}
		if d.tapr == nil && d.tapi == nil {
			continue
		}
		if name := strings.TrimSpace(asStr(rm["dc_name"])); name != "" {
			m["name:"+name] = d
		}
		m[fmt.Sprintf("bus:%d|%d", int(asFloat(rm["ipr"])), int(asFloat(rm["ipi"])))] = d
	}
	for _, row := range rows {
		cols, ok := row.([]interface{})
		if !ok {
			continue
		}
		var d dc
		found := false
		if name := strings.TrimSpace(colStr(cols, iName)); name != "" {
			if dd, ok := m["name:"+name]; ok {
				d, found = dd, true
			}
		}
		if !found {
			ipr, _ := colFloat(cols, iIpr)
			ipi, _ := colFloat(cols, iIpi)
			if dd, ok := m[fmt.Sprintf("bus:%d|%d", int(ipr), int(ipi))]; ok {
				d, found = dd, true
			}
		}
		if !found {
			continue
		}
		if d.tapr != nil {
			setCol(cols, iTapr, *d.tapr)
		}
		if d.tapi != nil {
			setCol(cols, iTapi, *d.tapi)
		}
	}
}

// calculateFileHash calculates SHA256 hash of a file
func (s *SessionService) calculateFileHash(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}
