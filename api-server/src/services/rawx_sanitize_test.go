package services

import (
	"bytes"
	"encoding/json"
	"testing"
)

func TestNormalizePsseUnicodeEscapes(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty", ``, ``},
		{"plain no-op", `{"a":"hello"}`, `{"a":"hello"}`},
		{"lowercase escape untouched", `{"a":"\u00e3"}`, `{"a":"\u00e3"}`},
		// The exact 31HS2ap defect: uppercase \U + 4 hex digits.
		{"4-hex rewrite",
			`{"name":"T\U00E3\U201C\U00E3\U2021U"}`,
			`{"name":"T\u00E3\u201C\u00E3\u2021U"}`},
		{"lowercase hex digits accepted", `{"a":"\U00e3"}`, `{"a":"\u00e3"}`},
		// Escaped backslash + 'U' is literal content, not an escape.
		{"escaped backslash preserved", `{"n":"\\U00E3"}`, `{"n":"\\U00E3"}`},
		// Fewer than 4 hex digits: not rewritten (falls to the unrepairable path).
		{"short hex untouched", `{"a":"\U12x"}`, `{"a":"\U12x"}`},
		{"non-hex untouched", `{"a":"\UZZZZ"}`, `{"a":"\UZZZZ"}`},
		// PIN (shared with the Rust suite, models.rs): 8-hex-digit Python-style
		// escapes consume only the first 4 digits; the rest stays literal text.
		// PSS/E emits only 4-digit forms; this pins Go and Rust to identical
		// behavior on the pathological case so the ports cannot drift silently.
		{"8-hex pin", `"\U0001F600"`, `"\u0001F600"`},
		{"truncated at EOF", `"\U00`, `"\U00`},
		{"backslash at EOF", `"a\`, `"a\`},
		{"mixed content",
			`{"a":"\U00E3 and \\U0041 and B","b":1}`,
			`{"a":"\u00E3 and \\U0041 and B","b":1}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := normalizePsseUnicodeEscapes([]byte(tt.in))
			if !bytes.Equal(got, []byte(tt.want)) {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestEscapeControlCharsInStrings(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"empty", ``, ``},
		{"clean no-op", `{"a": "hello", "b": [1, 2, 3], "c": null}`, `{"a": "hello", "b": [1, 2, 3], "c": null}`},
		// The winding-name shape from the solver's own test suite.
		{"tab inside string", "{\"name\": \"615:B-961775\t\", \"x\": 1}", `{"name": "615:B-961775\t", "x": 1}`},
		{"newline and cr inside string", "{\"a\":\"x\ny\rz\"}", `{"a":"x\ny\rz"}`},
		{"backspace and formfeed", "{\"a\":\"\b\f\"}", `{"a":"\b\f"}`},
		// Control byte without a short escape form -> \u00XX (lowercase hex).
		{"nul byte", "{\"a\":\"x\x00y\"}", `{"a":"x\u0000y"}`},
		{"unit separator", "{\"a\":\"x\x1fy\"}", `{"a":"x\u001fy"}`},
		// Structural whitespace between tokens is legal JSON and must stay raw.
		{"structural tabs untouched", "{\t\"a\":\t\"x\ty\"}", "{\t\"a\":\t\"x\\ty\"}"},
		// An escaped quote does not close the string: the TAB after it is
		// still in-string and must be escaped.
		{"escaped quote does not close string", "{\"a\":\"x\\\"\ty\"}", `{"a":"x\"\ty"}`},
		// Already-escaped sequences are preserved verbatim.
		{"existing escapes preserved", `{"a":"x\t\nz"}`, `{"a":"x\t\nz"}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := escapeControlCharsInStrings([]byte(tt.in))
			if !bytes.Equal(got, []byte(tt.want)) {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSanitizeRawxBytes_ValidInputByteIdentical(t *testing.T) {
	// Deliberately quirky-but-valid formatting: the fast path must return the
	// bytes untouched (no reformatting, no key reordering).
	in := []byte("{\n  \"z\": 1,\t\"a\": \"café \\u00E3\"  }")
	out, repairs, err := sanitizeRawxBytes(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repairs != nil {
		t.Errorf("expected no repairs for valid input, got %v", repairs)
	}
	if !bytes.Equal(out, in) {
		t.Errorf("valid input must be byte-identical: got %q, want %q", out, in)
	}
}

func TestSanitizeRawxBytes_Repairs31HS2apNames(t *testing.T) {
	// The two real defective strings from 31HS2ap.rawx. After repair the file
	// must be strictly valid and decode to the same strings the Rust solver's
	// sanitizer produces: "Tã“ã‡U" / "Tã“ã‡U_1".
	in := []byte(`{"names":["T\U00E3\U201C\U00E3\U2021U","T\U00E3\U201C\U00E3\U2021U_1"]}`)
	out, repairs, err := sanitizeRawxBytes(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repairs) != 1 || repairs[0] != repairUppercaseUnicodeEscapes {
		t.Errorf("repairs = %v, want [%s]", repairs, repairUppercaseUnicodeEscapes)
	}
	if !json.Valid(out) {
		t.Fatal("sanitized output is not valid JSON")
	}
	var doc struct{ Names []string }
	if err := json.Unmarshal(out, &doc); err != nil {
		t.Fatal(err)
	}
	want := []string{"Tã“ã‡U", "Tã“ã‡U_1"}
	for i, w := range want {
		if doc.Names[i] != w {
			t.Errorf("names[%d] = %q, want %q (must match Rust solver decoding)", i, doc.Names[i], w)
		}
	}
}

func TestSanitizeRawxBytes_RepairsControlCharsAndUTF8(t *testing.T) {
	// A raw TAB inside a string plus a cp1252 smart quote (0x93, invalid UTF-8).
	in := []byte("{\"title\":\"\x93case\x94\",\"name\":\"615:B\t\"}")
	out, repairs, err := sanitizeRawxBytes(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !json.Valid(out) {
		t.Fatal("sanitized output is not valid JSON")
	}
	wantRepairs := []string{repairControlCharsInStrings, repairInvalidUTF8Bytes}
	if len(repairs) != len(wantRepairs) || repairs[0] != wantRepairs[0] || repairs[1] != wantRepairs[1] {
		t.Errorf("repairs = %v, want %v", repairs, wantRepairs)
	}
	var doc struct {
		Title string
		Name  string
	}
	if err := json.Unmarshal(out, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Name != "615:B\t" {
		t.Errorf("name = %q, want %q", doc.Name, "615:B\t")
	}
	if doc.Title != "�case�" {
		t.Errorf("title = %q, want %q (invalid UTF-8 lossy-decoded)", doc.Title, "�case�")
	}
}

func TestSanitizeRawxBytes_UnrepairableReturnsOriginal(t *testing.T) {
	cases := map[string]string{
		"truncated":     `{"network": {"bus"`,
		"short-hex \\U": `{"a":"\U12x"}`,
		"not JSON":      `0, BASE_CASE / PSS(R)E 35 RAW`,
	}
	for name, in := range cases {
		t.Run(name, func(t *testing.T) {
			out, repairs, err := sanitizeRawxBytes([]byte(in))
			if err == nil {
				t.Fatal("expected error for unrepairable input")
			}
			if repairs != nil {
				t.Errorf("expected no repairs reported on failure, got %v", repairs)
			}
			if !bytes.Equal(out, []byte(in)) {
				t.Errorf("unrepairable input must be returned unchanged: got %q", out)
			}
		})
	}
}

func TestSanitizeRawxBytes_Idempotent(t *testing.T) {
	inputs := []string{
		`{"name":"T\U00E3\U201C\U00E3\U2021U"}`,
		"{\"name\": \"615:B-961775\t\", \"x\": 1}",
		"{\"title\":\"\x93case\x94\"}",
		`{"clean": true}`,
	}
	for _, in := range inputs {
		once, _, err := sanitizeRawxBytes([]byte(in))
		if err != nil {
			t.Fatalf("first pass failed for %q: %v", in, err)
		}
		twice, repairs, err := sanitizeRawxBytes(once)
		if err != nil {
			t.Fatalf("second pass failed for %q: %v", in, err)
		}
		if repairs != nil {
			t.Errorf("second pass reported repairs %v for %q — not idempotent", repairs, in)
		}
		if !bytes.Equal(twice, once) {
			t.Errorf("sanitize(sanitize(x)) != sanitize(x) for %q", in)
		}
	}
}
