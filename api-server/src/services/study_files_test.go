package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"go.uber.org/zap"
)

func TestValidateStudyFile(t *testing.T) {
	cases := []struct {
		name     string
		fileType string
		fileName string
		content  string
		wantErr  bool
	}{
		{"valid sub", "sub", "winter.sub", "subsystem 'Inertia'\n AREA 17\nEND", false},
		{"valid mon", "mon", "winter.mon", "MONITOR LINES IN SYSTEM 'MonSys'", false},
		{"valid con", "con", "winter.con", "Contingency 'P21'\n OPENFROM branch ...\nEnd", false},
		{"valid uppercase keyword", "sub", "winter.sub", "SUBSYSTEM 'X'\nEND", false},
		{"empty file", "sub", "winter.sub", "", true},
		{"bad file type", "rawx", "winter.rawx", "subsystem 'X'", true},
		{"file_type/extension mismatch", "sub", "winter.con", "subsystem 'X'", true},
		{"sub missing keyword", "sub", "winter.sub", "AREA 17\nEND", true},
		{"mon missing keyword", "mon", "winter.mon", "just some text", true},
		{"con missing keyword", "con", "winter.con", "Default Dispatch\nEnd", true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateStudyFile(tc.fileType, tc.fileName, []byte(tc.content))
			if tc.wantErr && err == nil {
				t.Fatalf("expected an error, got nil")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("expected no error, got %v", err)
			}
		})
	}
}

// newStudyTestService builds a SessionService rooted at a temp directory.
func newStudyTestService(t *testing.T) (*SessionService, string) {
	t.Helper()
	base := t.TempDir()
	svc, err := NewSessionService(base, 10*1024*1024, 5, "", "", "", "", zap.NewNop())
	if err != nil {
		t.Fatalf("NewSessionService: %v", err)
	}
	return svc, base
}

func TestLoadStudyFileIntoSession_SetsCorrectSlot(t *testing.T) {
	svc, _ := newStudyTestService(t)
	userID := "user-1"

	session, err := svc.CreateSession(userID)
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	// Upload one library file of each kind, under its explicit file_type.
	uploads := []struct{ fileType, name, content string }{
		{"sub", "winter.sub", "subsystem 'X'\nEND"},
		{"mon", "winter.mon", "MONITOR LINES IN SYSTEM 'X'"},
		{"con", "winter.con", "Contingency 'C'\nEnd"},
	}
	for _, u := range uploads {
		if _, err := svc.UploadUserFile(userID, u.fileType, u.name, strings.NewReader(u.content)); err != nil {
			t.Fatalf("UploadUserFile %s: %v", u.name, err)
		}
	}

	// Load .sub — only SubPath is set.
	path, err := svc.LoadStudyFileIntoSession(userID, session.ID, "sub", "winter.sub")
	if err != nil {
		t.Fatalf("load winter.sub: %v", err)
	}
	got, _ := svc.GetSession(session.ID)
	if got.SubPath != path || got.SubPath == "" {
		t.Fatalf("SubPath = %q, want %q", got.SubPath, path)
	}
	if got.MonPath != "" || got.ConPath != "" {
		t.Fatalf("MonPath/ConPath should be empty, got %q / %q", got.MonPath, got.ConPath)
	}

	// Load .mon — MonPath set, SubPath unaffected.
	if _, err := svc.LoadStudyFileIntoSession(userID, session.ID, "mon", "winter.mon"); err != nil {
		t.Fatalf("load winter.mon: %v", err)
	}
	got, _ = svc.GetSession(session.ID)
	if got.MonPath == "" {
		t.Fatal("MonPath should be set after loading .mon")
	}
	if got.SubPath == "" {
		t.Fatal("SubPath should remain set after loading .mon")
	}

	// Load .con — ConPath set.
	if _, err := svc.LoadStudyFileIntoSession(userID, session.ID, "con", "winter.con"); err != nil {
		t.Fatalf("load winter.con: %v", err)
	}
	got, _ = svc.GetSession(session.ID)
	if got.ConPath == "" {
		t.Fatal("ConPath should be set after loading .con")
	}

	// The working copy lives on disk under the session study/ directory.
	if _, err := os.Stat(got.SubPath); err != nil {
		t.Fatalf("session working copy missing: %v", err)
	}
	if filepath.Base(filepath.Dir(got.SubPath)) != "study" {
		t.Fatalf("working copy not under study/: %q", got.SubPath)
	}
}

func TestLoadStudyFileIntoSession_ReloadReplacesSlot(t *testing.T) {
	svc, _ := newStudyTestService(t)
	userID := "user-1"
	session, _ := svc.CreateSession(userID)

	for _, name := range []string{"a.sub", "b.sub"} {
		if _, err := svc.UploadUserFile(userID, "sub", name, strings.NewReader("subsystem 'X'\nEND")); err != nil {
			t.Fatalf("UploadUserFile %s: %v", name, err)
		}
	}

	if _, err := svc.LoadStudyFileIntoSession(userID, session.ID, "sub", "a.sub"); err != nil {
		t.Fatalf("load a.sub: %v", err)
	}
	if _, err := svc.LoadStudyFileIntoSession(userID, session.ID, "sub", "b.sub"); err != nil {
		t.Fatalf("load b.sub: %v", err)
	}

	got, _ := svc.GetSession(session.ID)
	if filepath.Base(got.SubPath) != "b.sub" {
		t.Fatalf("SubPath = %q, want it to point at b.sub", got.SubPath)
	}
}

func TestLoadStudyFileIntoSession_Errors(t *testing.T) {
	svc, _ := newStudyTestService(t)
	userID := "user-1"
	session, _ := svc.CreateSession(userID)

	// Missing library file.
	if _, err := svc.LoadStudyFileIntoSession(userID, session.ID, "sub", "missing.sub"); err == nil ||
		!strings.Contains(err.Error(), "file not found") {
		t.Fatalf("expected 'file not found' error, got %v", err)
	}

	// file_type / extension mismatch (rejected before any file lookup).
	if _, err := svc.LoadStudyFileIntoSession(userID, session.ID, "sub", "winter.con"); err == nil ||
		!strings.Contains(err.Error(), "does not match file_type") {
		t.Fatalf("expected 'does not match file_type' error, got %v", err)
	}

	// Unknown session.
	if _, err := svc.LoadStudyFileIntoSession(userID, "no-such-session", "sub", "winter.sub"); err == nil ||
		!strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected session 'not found' error, got %v", err)
	}

	// Session owned by another user is reported as not found.
	if _, err := svc.LoadStudyFileIntoSession("other-user", session.ID, "sub", "winter.sub"); err == nil ||
		!strings.Contains(err.Error(), "not found") {
		t.Fatalf("expected session 'not found' error for wrong owner, got %v", err)
	}
}

func TestSessionCleanupRemovesStudyWorkingCopy(t *testing.T) {
	svc, base := newStudyTestService(t)
	userID := "user-1"
	session, _ := svc.CreateSession(userID)

	// Simulate a network case working file so the session has a FilePath, then
	// load a study file into the session.
	if _, err := svc.StoreFile(session.ID, "net.rawx", strings.NewReader("network data")); err != nil {
		t.Fatalf("StoreFile: %v", err)
	}
	if _, err := svc.UploadUserFile(userID, "sub", "winter.sub", strings.NewReader("subsystem 'X'\nEND")); err != nil {
		t.Fatalf("UploadUserFile: %v", err)
	}
	if _, err := svc.LoadStudyFileIntoSession(userID, session.ID, "sub", "winter.sub"); err != nil {
		t.Fatalf("LoadStudyFileIntoSession: %v", err)
	}

	sessionDir := filepath.Join(base, "sessions", userID, session.ID)
	studyWorkingDir := filepath.Join(sessionDir, "study")
	if _, err := os.Stat(studyWorkingDir); err != nil {
		t.Fatalf("session study dir should exist before cleanup: %v", err)
	}

	if err := svc.CleanupUserSessions(userID); err != nil {
		t.Fatalf("CleanupUserSessions: %v", err)
	}

	// The session directory (and its study/ subdirectory) is gone.
	if _, err := os.Stat(sessionDir); !os.IsNotExist(err) {
		t.Fatalf("session directory should be removed, stat err = %v", err)
	}

	// The library copy survives — it is the durable store.
	libPath := filepath.Join(base, "sub", userID, "winter.sub")
	if _, err := os.Stat(libPath); err != nil {
		t.Fatalf("library study file should survive session cleanup: %v", err)
	}
}
