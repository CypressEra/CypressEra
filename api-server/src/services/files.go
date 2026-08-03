package services

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"go.uber.org/zap"
)

// FileService handles file-related operations including knowledge base index management
type FileService struct {
	basePath string
	logger   *zap.Logger
}

// NewFileService creates a new file service
func NewFileService(basePath string, logger *zap.Logger) *FileService {
	return &FileService{
		basePath: basePath,
		logger:   logger,
	}
}

// CleanupKnowledgeBaseIndex removes chunk files and metadata for a deleted knowledge base file
// This should be called when a knowledge base file is deleted to clean up associated index data
func (f *FileService) CleanupKnowledgeBaseIndex(userID string, fileName string) error {
	// Step 1: Delete the chunk NDJSON file
	if err := f.deleteChunkFile(userID, fileName); err != nil {
		return fmt.Errorf("failed to delete chunk file: %w", err)
	}

	// Step 2: Remove file entry from index.json
	if err := f.removeFileFromIndexMetadata(userID, fileName); err != nil {
		return fmt.Errorf("failed to remove file from index metadata: %w", err)
	}

	f.logger.Info("Cleaned up knowledge base index",
		zap.String("user_id", userID),
		zap.String("file_name", fileName))

	return nil
}

// sanitizeFilename sanitizes a filename for use in chunk file paths
// Matches the logic in mcp-server/src/knowledgeBase/repositories/vectorStore.repository.ts
func (f *FileService) sanitizeFilename(filename string) string {
	// Replace invalid characters with underscore (keep alphanumeric, dots, hyphens, underscores)
	var sanitized strings.Builder
	for _, r := range filename {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') || r == '.' || r == '-' || r == '_' {
			sanitized.WriteRune(r)
		} else {
			sanitized.WriteRune('_')
		}
	}
	result := sanitized.String()

	// Replace multiple underscores with single underscore
	for strings.Contains(result, "__") {
		result = strings.ReplaceAll(result, "__", "_")
	}

	// Remove leading and trailing underscores
	result = strings.Trim(result, "_")

	// Limit length to 200 characters
	if len(result) > 200 {
		result = result[:200]
	}

	// If filename is too short after sanitization, use hash as fallback
	if len(result) < 3 {
		hash := sha256.Sum256([]byte(filename))
		result = fmt.Sprintf("%x", hash)[:16]
	}

	return result
}

// deleteChunkFile deletes the chunk NDJSON file for a knowledge base file
// Path: {basePath}/knowledge/{userId}/.index/chunks/{sanitized_filename}.ndjson
func (f *FileService) deleteChunkFile(userID string, fileName string) error {
	// Get the sanitized filename
	sanitized := f.sanitizeFilename(fileName)

	// Construct chunk file path
	chunkFilePath := filepath.Join(f.basePath, "knowledge", userID, ".index", "chunks", sanitized+".ndjson")

	// Check if file exists before trying to delete
	if _, err := os.Stat(chunkFilePath); os.IsNotExist(err) {
		// File doesn't exist, that's okay - might not have been indexed
		f.logger.Debug("Chunk file does not exist, skipping deletion",
			zap.String("user_id", userID),
			zap.String("file_name", fileName),
			zap.String("chunk_file_path", chunkFilePath))
		return nil
	}

	// Delete the chunk file
	if err := os.Remove(chunkFilePath); err != nil {
		return fmt.Errorf("failed to remove chunk file: %w", err)
	}

	f.logger.Info("Deleted chunk file",
		zap.String("user_id", userID),
		zap.String("file_name", fileName),
		zap.String("chunk_file_path", chunkFilePath))

	return nil
}

// IndexMetadata represents the structure of index.json
type IndexMetadata struct {
	Version        string                       `json:"version"`
	UserID         string                       `json:"userId"`
	LastIndexed    string                       `json:"lastIndexed"`
	FileHashes     map[string]string            `json:"fileHashes"`
	IndexingStatus map[string]FileIndexingStatus `json:"indexingStatus"`
}

// FileIndexingStatus represents the indexing status of a file
type FileIndexingStatus struct {
	Status       string `json:"status"`
	LastModified string `json:"lastModified,omitempty"`
	ChunkCount   int    `json:"chunkCount,omitempty"`
	Error        string `json:"error,omitempty"`
}

// removeFileFromIndexMetadata removes a file entry from index.json
// Path: {basePath}/knowledge/{userId}/.index/index.json
func (f *FileService) removeFileFromIndexMetadata(userID string, fileName string) error {
	// Construct index.json path
	indexPath := filepath.Join(f.basePath, "knowledge", userID, ".index", "index.json")

	// Check if index.json exists
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		// Index file doesn't exist, that's okay - might not have been indexed
		f.logger.Debug("Index file does not exist, skipping update",
			zap.String("user_id", userID),
			zap.String("file_name", fileName))
		return nil
	}

	// Read existing index.json
	data, err := os.ReadFile(indexPath)
	if err != nil {
		return fmt.Errorf("failed to read index.json: %w", err)
	}

	// Parse JSON
	var metadata IndexMetadata
	if err := json.Unmarshal(data, &metadata); err != nil {
		return fmt.Errorf("failed to parse index.json: %w", err)
	}

	// Remove file from fileHashes
	if _, exists := metadata.FileHashes[fileName]; exists {
		delete(metadata.FileHashes, fileName)
	}

	// Remove file from indexingStatus
	if _, exists := metadata.IndexingStatus[fileName]; exists {
		delete(metadata.IndexingStatus, fileName)
	}

	// Write back to disk
	updatedData, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal index.json: %w", err)
	}

	if err := os.WriteFile(indexPath, updatedData, 0644); err != nil {
		return fmt.Errorf("failed to write index.json: %w", err)
	}

	f.logger.Info("Removed file from index.json",
		zap.String("user_id", userID),
		zap.String("file_name", fileName))

	return nil
}

