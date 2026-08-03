package services

import (
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap"
)

// A legacy deployment's results/ directory is renamed to power-flow/ on
// startup, carrying its contents, so existing standalone results survive.
func TestNewSessionServiceMigratesResultsToPowerFlow(t *testing.T) {
	base := t.TempDir()
	legacy := filepath.Join(base, "results", "u1", "s1")
	if err := os.MkdirAll(legacy, 0755); err != nil {
		t.Fatalf("setup: %v", err)
	}
	if err := os.WriteFile(filepath.Join(legacy, "results.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("setup: %v", err)
	}

	if _, err := NewSessionService(base, 1<<20, 10, "", "", "", "", zap.NewNop()); err != nil {
		t.Fatalf("NewSessionService: %v", err)
	}

	if _, err := os.Stat(filepath.Join(base, "results")); !os.IsNotExist(err) {
		t.Errorf("legacy results/ should be gone after migration, stat err = %v", err)
	}
	migrated := filepath.Join(base, "power-flow", "u1", "s1", "results.json")
	if _, err := os.Stat(migrated); err != nil {
		t.Errorf("expected the migrated file at %s, err = %v", migrated, err)
	}
}

// A fresh install creates power-flow/ directly, with no legacy directory.
func TestNewSessionServiceFreshInstallCreatesPowerFlow(t *testing.T) {
	base := t.TempDir()
	if _, err := NewSessionService(base, 1<<20, 10, "", "", "", "", zap.NewNop()); err != nil {
		t.Fatalf("NewSessionService: %v", err)
	}
	if _, err := os.Stat(filepath.Join(base, "power-flow")); err != nil {
		t.Errorf("fresh install should create power-flow/, err = %v", err)
	}
	if _, err := os.Stat(filepath.Join(base, "study-results")); err != nil {
		t.Errorf("fresh install should create study-results/, err = %v", err)
	}
}
