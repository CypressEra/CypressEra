// Package studyfile parses and resolves the .sub/.mon/.con study files
// (the TARA / PowerGEM study-file format) and post-processes a power flow
// result against the monitored elements they define.
//
// The package is api-server-only: it never changes the flow-solver, which
// stays a pure compute/query tool. Study-file semantics live entirely here.
package studyfile

// Severity classifies a diagnostic.
type Severity string

const (
	// SeverityWarning marks a construct that was skipped; parsing continued.
	SeverityWarning Severity = "warning"
	// SeverityError marks an unrecoverable problem (unreadable file, an
	// unterminated block). The surrounding file may be incomplete.
	SeverityError Severity = "error"
)

// Diagnostic is a single parse or resolution problem tied to a source
// location. Study-file processing never hard-fails on a skippable construct;
// it records a Diagnostic and continues.
type Diagnostic struct {
	File     string   `json:"file"`
	Line     int      `json:"line"`
	Severity Severity `json:"severity"`
	Code     string   `json:"code"`
	Message  string   `json:"message"`
}

// Diagnostics collects diagnostics produced while parsing and resolving.
// The zero value is ready to use.
type Diagnostics struct {
	Items []Diagnostic
}

// Add records a diagnostic.
func (d *Diagnostics) Add(file string, line int, sev Severity, code, msg string) {
	d.Items = append(d.Items, Diagnostic{
		File: file, Line: line, Severity: sev, Code: code, Message: msg,
	})
}

// Warn records a warning-severity diagnostic.
func (d *Diagnostics) Warn(file string, line int, code, msg string) {
	d.Add(file, line, SeverityWarning, code, msg)
}

// Error records an error-severity diagnostic.
func (d *Diagnostics) Error(file string, line int, code, msg string) {
	d.Add(file, line, SeverityError, code, msg)
}

// Merge appends another set of diagnostics.
func (d *Diagnostics) Merge(other Diagnostics) {
	d.Items = append(d.Items, other.Items...)
}

// HasErrors reports whether any error-severity diagnostic was recorded.
func (d *Diagnostics) HasErrors() bool {
	for _, it := range d.Items {
		if it.Severity == SeverityError {
			return true
		}
	}
	return false
}

// Count returns the number of diagnostics recorded.
func (d *Diagnostics) Count() int { return len(d.Items) }

// Errors returns the number of error-severity diagnostics.
func (d *Diagnostics) Errors() int { return d.countSeverity(SeverityError) }

// Warnings returns the number of warning-severity diagnostics.
func (d *Diagnostics) Warnings() int { return d.countSeverity(SeverityWarning) }

func (d *Diagnostics) countSeverity(sev Severity) int {
	n := 0
	for _, it := range d.Items {
		if it.Severity == sev {
			n++
		}
	}
	return n
}

// List returns the diagnostics, never nil — callers can serialize it directly.
func (d *Diagnostics) List() []Diagnostic {
	if d.Items == nil {
		return []Diagnostic{}
	}
	return d.Items
}
