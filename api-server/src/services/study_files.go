package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.uber.org/zap"
)

// validUserFileType reports whether fileType is a recognized user-file library
// type. The .sub/.mon/.con study files join the model/knowledge library as
// the three explicit kinds sub, mon, and con. "diagram" stores the saved
// network-diagram layout files (.cyd / .cyd.gz) — see openspec change
// integrate-diagram-into-file-management.
func validUserFileType(fileType string) bool {
	switch fileType {
	case "model", "knowledge", "sub", "mon", "con", "diagram":
		return true
	default:
		return false
	}
}

// studyFileType reports whether fileType is one of the .sub/.mon/.con study
// file kinds.
func studyFileType(fileType string) bool {
	return fileType == "sub" || fileType == "mon" || fileType == "con"
}

// studyAnchorKeyword maps a study file kind to the keyword its content must
// contain. This is a coarse upload-time guard, not a grammar parse.
var studyAnchorKeyword = map[string]string{
	"sub": "subsystem",
	"mon": "monitor",
	"con": "contingency",
}

// ValidateStudyFile checks a .sub/.mon/.con study file at upload time without
// parsing its grammar. The declared fileType ("sub", "mon", or "con") must
// match the filename extension; the content must be non-empty and contain the
// anchor keyword for that kind (case-insensitive).
func ValidateStudyFile(fileType, fileName string, content []byte) error {
	if !studyFileType(fileType) {
		return fmt.Errorf("invalid study file type %q (expected sub, mon, or con)", fileType)
	}
	if ext := strings.ToLower(filepath.Ext(fileName)); ext != "."+fileType {
		return fmt.Errorf("file %s does not match file_type %q (expected a .%s file)", fileName, fileType, fileType)
	}
	if len(content) == 0 {
		return fmt.Errorf("study file %s is empty", fileName)
	}
	keyword := studyAnchorKeyword[fileType]
	if !strings.Contains(strings.ToLower(string(content)), keyword) {
		return fmt.Errorf("file %s does not contain the expected %q keyword", fileName, keyword)
	}
	return nil
}

// LoadStudyFileIntoSession copies a .sub/.mon/.con study file from the user's
// library (<fileType>/<user_id>/<file_name>) into the session's working
// directory (sessions/<user_id>/<session_id>/study/) and records it on the
// matching session slot — SubPath, MonPath, or ConPath — selected by fileType.
//
// fileType is the explicit kind ("sub", "mon", or "con"); the file's extension
// must match. It attaches to an existing session; it does not create one.
// Re-loading a file of the same kind replaces that slot (last-write-wins). It
// returns the working-copy path.
func (s *SessionService) LoadStudyFileIntoSession(userID, sessionID, fileType, fileName string) (string, error) {
	if !studyFileType(fileType) {
		return "", fmt.Errorf("invalid study file type %q (expected sub, mon, or con)", fileType)
	}
	if ext := strings.ToLower(filepath.Ext(fileName)); ext != "."+fileType {
		return "", fmt.Errorf("file %s does not match file_type %q (expected a .%s file)", fileName, fileType, fileType)
	}

	// Verify the session exists and belongs to the caller. A session owned by
	// another user is reported as "not found" to avoid leaking its existence.
	s.mutex.RLock()
	session, exists := s.sessions[sessionID]
	owned := exists && session.UserID == userID
	s.mutex.RUnlock()
	if !owned {
		return "", fmt.Errorf("session %s not found", sessionID)
	}

	// Resolve the library file (returns a "file not found" error if missing).
	libPath, _, err := s.GetUserFilePath(userID, fileType, fileName)
	if err != nil {
		return "", err
	}

	// Copy into the session's study working directory.
	studyDir := filepath.Join(s.basePath, "sessions", userID, sessionID, "study")
	if err := os.MkdirAll(studyDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create session study directory: %w", err)
	}
	destPath := filepath.Join(studyDir, fileName)
	if err := s.copyFile(libPath, destPath); err != nil {
		return "", fmt.Errorf("failed to copy study file into session: %w", err)
	}

	// Record the working copy on the matching session slot.
	s.mutex.Lock()
	switch fileType {
	case "sub":
		session.SubPath = destPath
	case "mon":
		session.MonPath = destPath
	case "con":
		session.ConPath = destPath
	}
	session.UpdatedAt = time.Now()
	s.mutex.Unlock()

	s.logger.Info("Loaded study file into session",
		zap.String("user_id", userID),
		zap.String("session_id", sessionID),
		zap.String("file_name", fileName),
		zap.String("kind", fileType),
		zap.String("file_path", destPath))

	return destPath, nil
}
