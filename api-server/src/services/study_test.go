package services

// StudyService tests — solver-backed (the in-process Go pipeline is retired;
// parsing/resolution behavior itself is parity-locked by the golden suite in
// flow-solver/tests/fixtures/study). Engine-dependent tests skip when the
// flow-solver binary is not available (this repo's CI cannot see the sibling
// checkout).

import (
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap"
)

func testSolverBinary(t *testing.T) string {
	t.Helper()
	for _, p := range []string{
		"../../../flow-solver/target/release/flow-solver",
		"../../../flow-solver/target/debug/flow-solver",
	} {
		if _, err := os.Stat(p); err == nil {
			abs, _ := filepath.Abs(p)
			return abs
		}
	}
	t.Skip("flow-solver binary not available")
	return ""
}

func writeTemp(t *testing.T, name, content string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(p, []byte(content), 0644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return p
}

// Parse-only validation: without a model the service adds the study_no_model
// note (frozen message text) and the engine reports syntax diagnostics.
func TestStudyComputeParseOnlyWithoutModel(t *testing.T) {
	bin := testSolverBinary(t)
	svc := &StudyService{engine: NewSolverStudyEngine(bin, zap.NewNop()), logger: zap.NewNop(),
		cache: map[string]*cachedStudy{}}

	conPath := writeTemp(t, "t.con", "contingency 'c1'\n open branch from bus 1 to bus 2 ckt 1\nend\n")
	a := svc.compute("", "", conPath, "")

	if !a.HasFiles || a.HasModel {
		t.Fatalf("flags = %#v, want HasFiles && !HasModel", a)
	}
	foundNote := false
	for _, d := range a.Diagnostics.Items {
		if d.Code == "study_no_model" {
			foundNote = true
		}
	}
	if !foundNote {
		t.Errorf("expected study_no_model note, got %#v", a.Diagnostics.Items)
	}
	if a.ContingencyCount() != 1 || !a.HasConFile() {
		t.Errorf("contingency count = %d hasCon = %v, want 1/true", a.ContingencyCount(), a.HasConFile())
	}
}

// Grammar problems surface as diagnostics (problems are data), not failures.
func TestStudyComputeSyntaxDiagnosticsSurface(t *testing.T) {
	bin := testSolverBinary(t)
	svc := &StudyService{engine: NewSolverStudyEngine(bin, zap.NewNop()), logger: zap.NewNop(),
		cache: map[string]*cachedStudy{}}

	subPath := writeTemp(t, "t.sub", "subsystem 'A'\n AREA 1\n") // missing END
	a := svc.compute(subPath, "", "", "")
	if a.Diagnostics.Errors() == 0 {
		t.Errorf("expected an unterminated-block error diagnostic, got %#v", a.Diagnostics.Items)
	}
}

// An unreadable study file keeps its service-level diagnostic (exact code and
// message prefix — frozen frontend contract).
func TestStudyComputeUnreadableFileDiagnostic(t *testing.T) {
	bin := testSolverBinary(t)
	svc := &StudyService{engine: NewSolverStudyEngine(bin, zap.NewNop()), logger: zap.NewNop(),
		cache: map[string]*cachedStudy{}}

	a := svc.compute(filepath.Join(t.TempDir(), "missing.sub"), "", "", "")
	found := false
	for _, d := range a.Diagnostics.Items {
		if d.Code == "sub_unreadable" && d.File == "missing.sub" {
			found = true
		}
	}
	if !found {
		t.Errorf("expected sub_unreadable for missing.sub, got %#v", a.Diagnostics.Items)
	}
}

func TestStudyValidationResultCounts(t *testing.T) {
	a := &StudyAnalysis{HasFiles: true, HasModel: true}
	a.Diagnostics.Warn("t.mon", 1, "mon_unsupported", "skipped")
	a.Diagnostics.Error("t.sub", 2, "sub_unterminated", "missing END")
	vr := ValidationResult(a)
	if !vr.HasFiles || !vr.HasModel || vr.Errors != 1 || vr.Warnings != 1 || len(vr.Diagnostics) != 2 {
		t.Errorf("validation result = %#v", vr)
	}
}

func TestStudyModelFingerprint(t *testing.T) {
	p := writeTemp(t, "a.sub", "subsystem 'A'\nEND\n")
	fp1 := fingerprint(p, "", "")
	fp2 := fingerprint(p, "", "")
	if fp1 != fp2 {
		t.Errorf("fingerprint not stable: %q vs %q", fp1, fp2)
	}
	if fingerprint("") == fp1 {
		t.Error("empty-path fingerprint must differ from a real file's")
	}
}
