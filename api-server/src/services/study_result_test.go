package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"go.uber.org/zap"

	"api-server/src/studyfile/contingency"
	"api-server/src/types"
)

// The study-result store round-trips a record: save stamps it, list and get
// return it, delete removes it.
func TestStudyResultStoreRoundTrip(t *testing.T) {
	resetPlatformVersionForTest()
	t.Setenv("PLATFORM_VERSION", "test-1.2.3")
	svc := NewStudyResultService(t.TempDir(), zap.NewNop())

	// An empty store lists nothing.
	if got, err := svc.List("u1"); err != nil || len(got) != 0 {
		t.Fatalf("empty List = %v, %v; want an empty list", got, err)
	}

	report := contingency.Report{
		Results: []contingency.EngineViolation{},
		Summary: contingency.ReportSummary{Total: 5, WithViolations: 2},
	}
	meta, err := svc.Save("u1", types.StudyResultMeta{
		Type:       StudyResultTypeContingency,
		ModelFile:  "IEEE 25-Bus Network.rawx",
		SessionID:  "sess-1",
		Summary:    report.Summary,
	}, report)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if meta.ID == "" || meta.AppVersion != "test-1.2.3" || meta.CreatedAt.IsZero() {
		t.Errorf("Save did not stamp id / app version / created_at: %#v", meta)
	}

	// List returns the saved result's metadata.
	list, err := svc.List("u1")
	if err != nil || len(list) != 1 || list[0].ID != meta.ID {
		t.Fatalf("List after save = %v, %v; want the one result", list, err)
	}
	if list[0].Summary.Total != 5 {
		t.Errorf("listed summary = %#v, want total 5", list[0].Summary)
	}

	// Get returns metadata and the full report.
	full, err := svc.Get("u1", meta.ID)
	if err != nil || full.Meta.ID != meta.ID || full.Report.Summary.WithViolations != 2 {
		t.Fatalf("Get = %#v, err %v", full, err)
	}

	// An unknown id is a not-found error.
	if _, err := svc.Get("u1", "does-not-exist"); err == nil {
		t.Error("Get of an unknown id should error")
	}

	// Delete removes the record; a second delete is a not-found error.
	if err := svc.Delete("u1", meta.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if got, _ := svc.List("u1"); len(got) != 0 {
		t.Errorf("List after delete = %v; want empty", got)
	}
	if err := svc.Delete("u1", meta.ID); err == nil {
		t.Error("Delete of an already-deleted result should error")
	}
}

// A saved study result round-trips the .sub / .mon / .con study-file names,
// and a study file not loaded for the run is omitted rather than stored blank.
func TestStudyResultCarriesStudyFiles(t *testing.T) {
	svc := NewStudyResultService(t.TempDir(), zap.NewNop())
	report := contingency.Report{Summary: contingency.ReportSummary{Total: 1}}

	// All three study files recorded — Get and List both serve them.
	saved, err := svc.Save("u1", types.StudyResultMeta{
		Type:       StudyResultTypeContingency,
		ModelFile:  "Bench_Case.rawx",
		SubFile:    "ieee_25bus.sub",
		MonFile:    "ieee_25bus.mon",
		ConFile:    "ieee_25bus.con",
		Summary:    report.Summary,
	}, report)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	full, err := svc.Get("u1", saved.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if full.Meta.SubFile != "ieee_25bus.sub" ||
		full.Meta.MonFile != "ieee_25bus.mon" ||
		full.Meta.ConFile != "ieee_25bus.con" {
		t.Errorf("study files = %q / %q / %q, want the ieee_25bus trio",
			full.Meta.SubFile, full.Meta.MonFile, full.Meta.ConFile)
	}
	list, err := svc.List("u1")
	if err != nil || len(list) != 1 || list[0].ConFile != "ieee_25bus.con" {
		t.Errorf("listed con_file = %#v, %v; want ieee_25bus.con", list, err)
	}

	// A run with no .mon loaded: MonFile is empty and omitted from meta.json.
	noMon, err := svc.Save("u1", types.StudyResultMeta{
		Type:    StudyResultTypeContingency,
		SubFile: "ieee_25bus.sub",
		ConFile: "ieee_25bus.con",
		Summary: report.Summary,
	}, report)
	if err != nil {
		t.Fatalf("Save (no mon): %v", err)
	}
	got, err := svc.Get("u1", noMon.ID)
	if err != nil {
		t.Fatalf("Get (no mon): %v", err)
	}
	if got.Meta.MonFile != "" {
		t.Errorf("MonFile = %q, want empty for a run with no .mon", got.Meta.MonFile)
	}
	metaPath := filepath.Join(filepath.Dir(svc.ReportPath("u1", noMon.ID)), "meta.json")
	raw, err := os.ReadFile(metaPath)
	if err != nil {
		t.Fatalf("read meta.json: %v", err)
	}
	if strings.Contains(string(raw), "mon_file") {
		t.Errorf("meta.json should omit the mon_file key when no .mon was loaded:\n%s", raw)
	}
}
