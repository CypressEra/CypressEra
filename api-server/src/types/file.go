package types

import (
	"time"

	"github.com/google/uuid"
)

// FileInfo represents uploaded file information
type FileInfo struct {
	ID         string    `json:"id" db:"id"`
	SessionID  string    `json:"session_id" db:"session_id"`
	FileName   string    `json:"file_name" db:"file_name"`
	FilePath   string    `json:"file_path" db:"file_path"`
	FileSize   int64     `json:"file_size" db:"file_size"`
	UploadedAt time.Time `json:"uploaded_at" db:"uploaded_at"`
}

// NewFileInfo creates new file information
func NewFileInfo(sessionID, fileName, filePath string, fileSize int64) *FileInfo {
	return &FileInfo{
		ID:         uuid.New().String(),
		SessionID:  sessionID,
		FileName:   fileName,
		FilePath:   filePath,
		FileSize:   fileSize,
		UploadedAt: time.Now(),
	}
}

// UploadUserFileResponse represents the response after uploading a file to user folder
type UploadUserFileResponse struct {
	Status   string `json:"status"`
	Message  string `json:"message"`
	FilePath string `json:"file_path"`
}

// DownloadUserFileRequest represents a request to download a user file
type DownloadUserFileRequest struct {
	// UserID is ignored; the authenticated user from JWT is used instead.
	UserID   string `json:"user_id"`
	FileType string `json:"file_type" binding:"required"` // "model" or "knowledge"
	FileName string `json:"file_name" binding:"required"`
}

// DeleteUserFileRequest represents a request to delete a user file
type DeleteUserFileRequest struct {
	// UserID is ignored; the authenticated user from JWT is used instead.
	UserID   string `json:"user_id"`
	FileType string `json:"file_type" binding:"required"` // "model" or "knowledge"
	FileName string `json:"file_name" binding:"required"`
}

// DeleteUserFileResponse represents the response after deleting a user file
type DeleteUserFileResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	FileName string `json:"file_name"`
}
