package services

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Diagram files are an opaque user-file category alongside model/knowledge/sub/mon/con.
// The service treats `.cyd` / `.cyd.gz` as bytes; validation lives client-side.
//
// Spec: openspec/changes/integrate-diagram-into-file-management/specs/diagram-file-management/spec.md

func TestUploadUserFile_DiagramRoundtrip(t *testing.T) {
	svc, base := newStudyTestService(t)
	userID := "user-diagram"
	const filename = "ieee14.cyd"
	const content = `{"type":"cypressera.diagram","version":"1.0"}`

	path, err := svc.UploadUserFile(userID, "diagram", filename, strings.NewReader(content))
	if err != nil {
		t.Fatalf("UploadUserFile: %v", err)
	}

	expectedDir := filepath.Join(base, "diagram", userID)
	if !strings.HasPrefix(path, expectedDir) {
		t.Fatalf("path = %q, want under %q", path, expectedDir)
	}

	// File contents should round-trip byte-for-byte.
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(got) != content {
		t.Fatalf("content mismatch: got %q, want %q", got, content)
	}

	// List should include the uploaded file.
	files, err := svc.GetUserFiles(userID, "diagram")
	if err != nil {
		t.Fatalf("GetUserFiles: %v", err)
	}
	if len(files) != 1 || files[0] != filename {
		t.Fatalf("GetUserFiles = %v, want [%q]", files, filename)
	}

	// Resolve via GetUserFilePath (the read path used by DownloadUserFile).
	resolved, info, err := svc.GetUserFilePath(userID, "diagram", filename)
	if err != nil {
		t.Fatalf("GetUserFilePath: %v", err)
	}
	if resolved != path {
		t.Fatalf("resolved = %q, want %q", resolved, path)
	}
	if info == nil || info.Size() != int64(len(content)) {
		t.Fatalf("FileInfo wrong: %+v", info)
	}

	// Delete and confirm gone.
	if err := svc.DeleteUserFile(userID, "diagram", filename); err != nil {
		t.Fatalf("DeleteUserFile: %v", err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("file still exists after delete: %v", err)
	}
}

func TestUploadUserFile_DiagramGzippedBytesPassThrough(t *testing.T) {
	svc, _ := newStudyTestService(t)
	userID := "user-gz"
	// Fake gzip-magic bytes — we don't decompress, just verify byte fidelity.
	payload := []byte{0x1f, 0x8b, 0x08, 0x00, 0xde, 0xad, 0xbe, 0xef}

	path, err := svc.UploadUserFile(userID, "diagram", "big.cyd.gz", bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("UploadUserFile: %v", err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("payload mismatch: got %x, want %x", got, payload)
	}
}

func TestUploadUserFile_RejectsUnknownType(t *testing.T) {
	svc, _ := newStudyTestService(t)
	_, err := svc.UploadUserFile("u", "layout", "x.cyd", io.NopCloser(strings.NewReader("")))
	if err == nil {
		t.Fatalf("expected an error for unknown file_type")
	}
	if !strings.Contains(err.Error(), "invalid file type") {
		t.Fatalf("expected 'invalid file type' error, got %v", err)
	}
}

func TestGetUserFiles_EmptyDiagramFolderReturnsEmptySlice(t *testing.T) {
	svc, _ := newStudyTestService(t)
	files, err := svc.GetUserFiles("nobody", "diagram")
	if err != nil {
		t.Fatalf("GetUserFiles: %v", err)
	}
	if len(files) != 0 {
		t.Fatalf("expected empty slice, got %v", files)
	}
}
