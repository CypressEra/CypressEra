package services

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"go.uber.org/zap"
)

// newTestSessionService builds a real SessionService over a temp directory so
// LoadCase runs end-to-end (session creation, workspace dirs, sanitizing copy).
func newTestSessionService(t *testing.T) (*SessionService, string) {
	t.Helper()
	base := t.TempDir()
	svc, err := NewSessionService(base, 100<<20, 10, "", "", "", "", zap.NewNop())
	if err != nil {
		t.Fatalf("NewSessionService: %v", err)
	}
	return svc, base
}

// placeModelFile writes a model-library file for userID and returns its path.
func placeModelFile(t *testing.T, base, userID, fileName string, content []byte) string {
	t.Helper()
	dir := filepath.Join(base, "model", userID)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, fileName)
	if err := os.WriteFile(p, content, 0644); err != nil {
		t.Fatal(err)
	}
	return p
}

// loadCaseWorkingFile runs LoadCase and returns the created working file path.
func loadCaseWorkingFile(t *testing.T, svc *SessionService, userID, fileName string) string {
	t.Helper()
	sessionID, err := svc.LoadCase(userID, fileName)
	if err != nil {
		t.Fatalf("LoadCase: %v", err)
	}
	session, ok := svc.GetSession(sessionID)
	if !ok {
		t.Fatal("session not found after LoadCase")
	}
	return session.FilePath
}

func TestLoadCase_SanitizesNonConformantRawx(t *testing.T) {
	svc, base := newTestSessionService(t)

	// The 31HS2ap defect shape (\U escapes in a transformer name) plus a raw
	// TAB inside a string value — both must be repaired on the copy.
	src := []byte("{\"network\":{\"transformer\":{\"fields\":[\"ibus\",\"name\"]," +
		"\"data\":[[1,\"T\\U00E3\\U201C\\U00E3\\U2021U\"],[2,\"615:B-961775\t\"]]}}}")
	srcPath := placeModelFile(t, base, "u1", "case.rawx", src)

	workingFile := loadCaseWorkingFile(t, svc, "u1", "case.rawx")

	got, err := os.ReadFile(workingFile)
	if err != nil {
		t.Fatal(err)
	}
	if !json.Valid(got) {
		t.Fatal("working file is not strictly valid JSON after LoadCase")
	}
	var doc struct {
		Network struct {
			Transformer struct {
				Data [][]interface{} `json:"data"`
			} `json:"transformer"`
		} `json:"network"`
	}
	if err := json.Unmarshal(got, &doc); err != nil {
		t.Fatal(err)
	}
	if name := doc.Network.Transformer.Data[0][1].(string); name != "Tã“ã‡U" {
		t.Errorf("repaired name = %q, want %q (must match Rust solver decoding)", name, "Tã“ã‡U")
	}
	if name := doc.Network.Transformer.Data[1][1].(string); name != "615:B-961775\t" {
		t.Errorf("repaired winding name = %q, want trailing TAB preserved", name)
	}

	// The model-library source must be untouched.
	srcAfter, err := os.ReadFile(srcPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(srcAfter, src) {
		t.Error("LoadCase modified the model-library source file")
	}

	// No leftover temp file from the atomic write.
	if _, err := os.Stat(workingFile + ".tmp"); !os.IsNotExist(err) {
		t.Error("temp file left behind after atomic rename")
	}
}

func TestLoadCase_ValidRawxCopiedByteIdentical(t *testing.T) {
	svc, base := newTestSessionService(t)

	// Quirky-but-valid formatting: sanitization must not reformat or reorder.
	src := []byte("{\n  \"network\": {\"bus\": {\"fields\": [\"ibus\"],\t\"data\": [[1]]}}\n}\n")
	placeModelFile(t, base, "u1", "clean.rawx", src)

	workingFile := loadCaseWorkingFile(t, svc, "u1", "clean.rawx")

	got, err := os.ReadFile(workingFile)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, src) {
		t.Errorf("valid RAWX must be copied byte-identical\ngot:  %q\nwant: %q", got, src)
	}
}

func TestLoadCase_UnrepairableRawxCopiedVerbatim(t *testing.T) {
	svc, base := newTestSessionService(t)

	src := []byte(`{"network": {"bus"`) // truncated JSON — not repairable
	placeModelFile(t, base, "u1", "broken.rawx", src)

	// LoadCase must still succeed (fail-open) with a verbatim copy.
	workingFile := loadCaseWorkingFile(t, svc, "u1", "broken.rawx")

	got, err := os.ReadFile(workingFile)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, src) {
		t.Errorf("unrepairable RAWX must be copied verbatim\ngot:  %q\nwant: %q", got, src)
	}
}

func TestLoadCase_NonRawxFileUsesPlainCopy(t *testing.T) {
	svc, base := newTestSessionService(t)

	// A non-JSON model file with a non-.rawx extension must not go through
	// the sanitizer (and must not log repair warnings for being non-JSON).
	src := []byte("0, BASE_CASE / PSS(R)E 35 RAW\r\n1,'B1', 230.0\r\n")
	placeModelFile(t, base, "u1", "legacy.raw", src)

	workingFile := loadCaseWorkingFile(t, svc, "u1", "legacy.raw")

	got, err := os.ReadFile(workingFile)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, src) {
		t.Error("non-RAWX model file must be copied byte-identical")
	}
}

func TestUpdateControlState_SucceedsOnSanitizedWorkingFile(t *testing.T) {
	// End-to-end for the defect that motivated this change: a working file
	// that carried \U escapes is sanitized by LoadCase, after which the
	// warm-start writeback parses it and writes solved state — the exact call
	// that failed with `invalid character 'U' in string escape code` before.
	svc, base := newTestSessionService(t)

	src := []byte(strings.Replace(wsTestRawx, `[101,"B1",230.0,`, `[101,"T\U00E3\U201C\U00E3\U2021U",230.0,`, 1))
	if json.Valid(src) {
		t.Fatal("fixture must be invalid JSON before sanitization")
	}
	placeModelFile(t, base, "u1", "warm.rawx", src)

	workingFile := loadCaseWorkingFile(t, svc, "u1", "warm.rawx")

	var resultData map[string]interface{}
	if err := json.Unmarshal([]byte(wsTestResult), &resultData); err != nil {
		t.Fatal(err)
	}
	if err := svc.UpdateControlState(workingFile, resultData); err != nil {
		t.Fatalf("UpdateControlState on sanitized working file: %v", err)
	}

	out, err := os.ReadFile(workingFile)
	if err != nil {
		t.Fatal(err)
	}
	var rawx map[string]interface{}
	if err := json.Unmarshal(out, &rawx); err != nil {
		t.Fatal(err)
	}
	network := rawx["network"].(map[string]interface{})
	// Warm-start state landed…
	if got := wsCol(t, network, "bus", "vm", 0).(float64); got != 1.05 {
		t.Errorf("bus vm[0] = %v, want 1.05 (writeback did not land)", got)
	}
	// …and the repaired name survived the writeback re-marshal.
	if got := wsCol(t, network, "bus", "name", 0).(string); got != "Tã“ã‡U" {
		t.Errorf("bus name[0] = %q, want %q after writeback round-trip", got, "Tã“ã‡U")
	}
}
