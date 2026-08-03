package services

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"go.uber.org/zap"
	"go.uber.org/zap/zaptest/observer"
)

// Tests added from the adversarial review of the sanitize-rawx-escapes-on-load
// change: Rust-parity pins for UTF-8 replacement, the utf8.Valid gate, error-
// path artifact cleanup, fallback logging, and the save round-trip.

func TestRepairInvalidUTF8_MaximalSubparts(t *testing.T) {
	// PARITY PINS with Rust String::from_utf8_lossy (see the mirror vectors in
	// flow-solver/src/core/models.rs test_utf8_lossy_replacement_pins): one
	// U+FFFD per maximal invalid subpart — NOT one per run of invalid bytes.
	tests := []struct {
		name string
		in   []byte
		want string
	}{
		// Adjacent cp1252 curly quotes: two subparts, two replacements.
		{"adjacent invalid bytes", []byte("a\x93\x94b"), "a��b"},
		// GBK-encoded text: subparts C4 / E3 BA / C3 -> three replacements.
		{"gbk text", []byte("\xC4\xE3\xBA\xC3"), "���"},
		// Distinct legacy identifiers must stay distinct after repair.
		{"one invalid byte", []byte("\x91"), "�"},
		{"two invalid bytes", []byte("\x91\x92"), "��"},
		// Truncated multi-byte sequence at EOF is ONE maximal subpart.
		{"truncated sequence", []byte("\xE3\x81"), "�"},
		// Surrogate encoding: ED / A0 / 80 -> three replacements.
		{"utf16 surrogate", []byte("\xED\xA0\x80"), "���"},
		// Overlong encoding: E0 / 80 -> two replacements.
		{"overlong", []byte("\xE0\x80"), "��"},
		// Valid input passes through unchanged.
		{"valid passthrough", []byte("Tã“ã‡U"), "Tã“ã‡U"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := string(repairInvalidUTF8(tt.in)); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
	if string(repairInvalidUTF8([]byte("\x91"))) == string(repairInvalidUTF8([]byte("\x91\x92"))) {
		t.Error("distinct invalid-byte identifiers collapsed to the same repaired string")
	}
}

func TestSanitizeRawxBytes_UTF8OnlyDefectIsRepaired(t *testing.T) {
	// Structurally valid JSON whose ONLY defect is invalid UTF-8. Go's
	// json.Valid accepts it (the scanner is byte-oriented), so this input is
	// the regression guard for the utf8.Valid half of the fast-path gate:
	// without it, the file would be copied unrepaired and serde_json (strict)
	// would still reject it.
	in := []byte("{\"title\":\"\x93\x94\"}")
	if !json.Valid(in) {
		t.Fatal("precondition: input must be structurally valid JSON")
	}
	out, repairs, err := sanitizeRawxBytes(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repairs) != 1 || repairs[0] != repairInvalidUTF8Bytes {
		t.Fatalf("repairs = %v, want [%s]", repairs, repairInvalidUTF8Bytes)
	}
	var doc struct{ Title string }
	if err := json.Unmarshal(out, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Title != "��" {
		t.Errorf("title = %q, want two replacement chars (maximal subparts)", doc.Title)
	}
}

func TestSanitizeCopyRawx_WriteFailureLeavesNoArtifacts(t *testing.T) {
	svc, base := newTestSessionService(t)
	srcPath := placeModelFile(t, base, "u1", "case.rawx", []byte(`{"network":{}}`))

	roDir := filepath.Join(base, "readonly")
	if err := os.MkdirAll(roDir, 0555); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Chmod(roDir, 0755) })

	dst := filepath.Join(roDir, "case.rawx")
	if err := svc.sanitizeCopyRawx(srcPath, dst); err == nil {
		t.Fatal("expected error writing into a read-only directory")
	}
	entries, err := os.ReadDir(roDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Errorf("write failure left artifacts behind: %v", entries)
	}
}

func TestLoadCase_UnrepairableRawxLogsWarning(t *testing.T) {
	base := t.TempDir()
	core, logs := observer.New(zap.WarnLevel)
	svc, err := NewSessionService(base, 100<<20, 10, "", "", "", "", zap.New(core))
	if err != nil {
		t.Fatal(err)
	}
	placeModelFile(t, base, "u1", "broken.rawx", []byte(`{"network": {"bus"`))

	if _, err := svc.LoadCase("u1", "broken.rawx"); err != nil {
		t.Fatalf("LoadCase must fail open on unrepairable RAWX, got: %v", err)
	}

	found := false
	for _, entry := range logs.All() {
		if strings.Contains(entry.Message, "not repairable") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected a warning naming the unrepairable file, got none")
	}
}

func TestSaveCaseAs_HealedFileRoundTrip(t *testing.T) {
	// Spec scenario "Save round-trip stays valid", covered here without the
	// skippable e2e: load a defective file, save it under a new name, and the
	// library copy must be strictly valid JSON whose re-load takes the
	// byte-identical fast path.
	svc, base := newTestSessionService(t)
	src := []byte(`{"network":{"transformer":{"fields":["ibus","name"],"data":[[1,"T\U00E3\U201C\U00E3\U2021U"]]}}}`)
	if json.Valid(src) {
		t.Fatal("precondition: fixture must be invalid JSON")
	}
	placeModelFile(t, base, "u1", "case.rawx", src)

	sessionID, err := svc.LoadCase("u1", "case.rawx")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.SaveCaseAs(sessionID, "healed.rawx"); err != nil {
		t.Fatalf("SaveCaseAs: %v", err)
	}

	libBytes, err := os.ReadFile(filepath.Join(base, "model", "u1", "healed.rawx"))
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(libBytes) {
		t.Fatal("library file from SaveCaseAs is not strictly valid JSON")
	}

	reload, err := os.ReadFile(loadCaseWorkingFile(t, svc, "u1", "healed.rawx"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(reload, libBytes) {
		t.Error("re-load of the healed library file was not a byte-identical fast-path copy")
	}
}
