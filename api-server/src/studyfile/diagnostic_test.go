package studyfile

import "testing"

func TestDiagnosticsSeverityCounts(t *testing.T) {
	var d Diagnostics
	d.Warn("a.sub", 1, "w1", "warn one")
	d.Error("a.sub", 2, "e1", "error one")
	d.Warn("a.mon", 3, "w2", "warn two")

	if got := d.Errors(); got != 1 {
		t.Errorf("Errors() = %d, want 1", got)
	}
	if got := d.Warnings(); got != 2 {
		t.Errorf("Warnings() = %d, want 2", got)
	}
	if !d.HasErrors() {
		t.Error("HasErrors() = false, want true")
	}
}

func TestDiagnosticsEmptyCounts(t *testing.T) {
	var d Diagnostics
	if d.Errors() != 0 || d.Warnings() != 0 {
		t.Errorf("empty diagnostics: Errors=%d Warnings=%d, want 0/0", d.Errors(), d.Warnings())
	}
	if d.List() == nil {
		t.Error("List() returned nil, want an empty non-nil slice")
	}
}
