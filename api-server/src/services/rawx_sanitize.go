package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"unicode/utf8"

	"go.uber.org/zap"
)

// This file repairs the known JSON non-conformances of PSS/E RAWX exports so
// that session working files are strictly valid JSON (RFC 8259) from the
// moment they are created. It is a byte-for-byte behavioral port of the
// flow-solver's recovery passes (flow-solver/src/core/models.rs:
// normalize_psse_unicode_escapes, escape_control_chars_in_strings, and the
// from_utf8_lossy fallback) — the two implementations are pinned to each
// other by shared test vectors and MUST NOT diverge, or the same file would
// decode to different strings in Go and Rust.

// Names of the individual repairs, reported by sanitizeRawxBytes for logging.
const (
	repairUppercaseUnicodeEscapes = "uppercase-unicode-escapes"
	repairControlCharsInStrings   = "control-chars-in-strings"
	repairInvalidUTF8Bytes        = "invalid-utf8"
)

// normalizePsseUnicodeEscapes rewrites PSS/E's non-conformant uppercase
// `\UXXXX` unicode escapes (exactly 4 hex digits) to the JSON-legal lowercase
// `\uXXXX` form. The scan is escape-aware: a backslash consumes the next byte,
// so a literal escaped backslash (`\\`) followed by `U` is left intact. Every
// other byte is copied verbatim, so the transform is otherwise lossless.
func normalizePsseUnicodeEscapes(input []byte) []byte {
	out := make([]byte, 0, len(input))
	i := 0
	for i < len(input) {
		if input[i] == '\\' && i+1 < len(input) {
			next := input[i+1]
			if next == 'U' && i+6 <= len(input) && isASCIIHex4(input[i+2:i+6]) {
				// '\UXXXX' -> '\uXXXX'
				out = append(out, '\\', 'u')
				out = append(out, input[i+2:i+6]...)
				i += 6
			} else {
				// Preserve any other escape pair as-is (incl. '\\').
				out = append(out, input[i], next)
				i += 2
			}
		} else {
			out = append(out, input[i])
			i++
		}
	}
	return out
}

func isASCIIHex4(b []byte) bool {
	for _, c := range b {
		switch {
		case c >= '0' && c <= '9', c >= 'a' && c <= 'f', c >= 'A' && c <= 'F':
		default:
			return false
		}
	}
	return true
}

// escapeControlCharsInStrings escapes raw (unescaped) ASCII control characters
// (0x00–0x1F) that appear *inside* JSON string literals into their JSON escape
// forms. Strict JSON forbids unescaped control bytes inside strings, but PSS/E
// rawx exports emit them anyway — e.g. a transformer winding name carrying a
// literal TAB.
//
// The scan is string-aware and escape-aware: a control byte is only rewritten
// when it occurs inside an open string literal, so JSON *structural*
// whitespace between tokens is left exactly as-is. A backslash inside a string
// consumes the next byte (so `\"` does not close the string and an
// already-escaped sequence is preserved verbatim). Outside strings, and for
// non-control bytes inside strings, every byte is copied unchanged — so a
// file with no in-string control characters is returned byte-for-byte
// identical.
func escapeControlCharsInStrings(input []byte) []byte {
	const hex = "0123456789abcdef"
	out := make([]byte, 0, len(input))
	inString := false
	escaped := false // previous byte was an unescaped '\' inside a string
	for _, b := range input {
		if !inString {
			out = append(out, b)
			if b == '"' {
				inString = true
				escaped = false
			}
			continue
		}
		if escaped {
			// This byte is the target of a backslash escape (e.g. the '"' in
			// `\"` or the 'u' in `\uXXXX`); copy it verbatim.
			out = append(out, b)
			escaped = false
			continue
		}
		switch {
		case b == '\\':
			out = append(out, b)
			escaped = true
		case b == '"':
			out = append(out, b)
			inString = false
		case b <= 0x1F:
			// Raw control byte inside a string — rewrite to a JSON escape.
			switch b {
			case 0x08:
				out = append(out, '\\', 'b')
			case 0x09:
				out = append(out, '\\', 't')
			case 0x0A:
				out = append(out, '\\', 'n')
			case 0x0C:
				out = append(out, '\\', 'f')
			case 0x0D:
				out = append(out, '\\', 'r')
			default:
				out = append(out, '\\', 'u', '0', '0', hex[b>>4], hex[b&0x0F])
			}
		default:
			out = append(out, b)
		}
	}
	return out
}

// replacementChar is the UTF-8 encoding of U+FFFD.
var replacementChar = []byte("�")

// repairInvalidUTF8 replaces invalid UTF-8 byte sequences with U+FFFD,
// mirroring the solver's String::from_utf8_lossy fallback. PSS/E case titles
// often carry cp1252 bytes (Windows smart quotes etc.) that no JSON parser
// accepts as UTF-8. Valid input is returned unchanged (same slice, no copy).
//
// Replacement follows the same "substitution of maximal subparts" policy as
// Rust (WHATWG Encoding standard): each maximal prefix of a valid sequence
// yields exactly ONE replacement character, so adjacent unrelated invalid
// bytes yield one U+FFFD each. strings.ToValidUTF8 is NOT equivalent — it
// coalesces a whole run of invalid bytes into a single replacement, which
// would make Go and Rust decode different strings from the same file (and
// collapse distinct legacy-encoded names into one). Pinned by shared test
// vectors with the Rust suite.
func repairInvalidUTF8(input []byte) []byte {
	if utf8.Valid(input) {
		return input
	}
	out := make([]byte, 0, len(input)+16)
	n := len(input)
	i := 0
	for i < n {
		b := input[i]
		if b < 0x80 {
			out = append(out, b)
			i++
			continue
		}
		// Expected continuation count and the valid range of the FIRST
		// continuation byte for this lead (later continuations are 0x80–0xBF).
		// Leads 0x80–0xC1 and 0xF5–0xFF are never valid.
		var need int
		lo, hi := byte(0x80), byte(0xBF)
		switch {
		case b >= 0xC2 && b <= 0xDF:
			need = 1
		case b == 0xE0:
			need, lo = 2, 0xA0 // excludes overlong encodings
		case b >= 0xE1 && b <= 0xEC:
			need = 2
		case b == 0xED:
			need, hi = 2, 0x9F // excludes UTF-16 surrogates
		case b >= 0xEE && b <= 0xEF:
			need = 2
		case b == 0xF0:
			need, lo = 3, 0x90 // excludes overlong encodings
		case b >= 0xF1 && b <= 0xF3:
			need = 3
		case b == 0xF4:
			need, hi = 3, 0x8F // excludes code points above U+10FFFF
		default:
			out = append(out, replacementChar...)
			i++
			continue
		}
		j, got := i+1, 0
		for got < need && j < n {
			c := input[j]
			if got == 0 {
				if c < lo || c > hi {
					break
				}
			} else if c < 0x80 || c > 0xBF {
				break
			}
			j++
			got++
		}
		if got == need {
			out = append(out, input[i:j]...)
		} else {
			// The maximal subpart input[i:j] becomes a single U+FFFD.
			out = append(out, replacementChar...)
		}
		i = j
	}
	return out
}

// sanitizeCopyRawx copies a RAWX model file into the session workspace,
// repairing the known PSS/E JSON non-conformances on the way so the working
// file is strictly valid JSON for every consumer (Go writeback, Rust solver
// fast path, browser download). The write is atomic (temp file + rename in
// the destination directory), so an interrupted copy can never leave a
// truncated or half-sanitized working file. If the bytes cannot be repaired,
// the source is copied verbatim (fail-open — behavior identical to a plain
// copy) and the original parse error is logged.
func (s *SessionService) sanitizeCopyRawx(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return fmt.Errorf("failed to read model file: %w", err)
	}

	out, repairs, sanErr := sanitizeRawxBytes(data)
	if sanErr != nil {
		s.logger.Warn("RAWX is not repairable to valid JSON; copying verbatim",
			zap.String("source_file", filepath.Base(src)),
			zap.Error(sanErr))
	} else if len(repairs) > 0 {
		s.logger.Info("Repaired non-conformant RAWX JSON while creating session working file",
			zap.String("source_file", filepath.Base(src)),
			zap.Strings("repairs", repairs))
	}

	tmp := dst + ".tmp"
	if err := os.WriteFile(tmp, out, 0644); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("failed to write session working file: %w", err)
	}
	if err := os.Rename(tmp, dst); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("failed to finalize session working file: %w", err)
	}
	return nil
}

// sanitizeRawxBytes makes RAWX bytes strictly-valid JSON where the defects are
// limited to the known PSS/E non-conformances. Contract (design D4):
//
//   - Already-valid input (structurally valid JSON *and* valid UTF-8, per
//     RFC 8259) is returned as-is — byte-identical, repairs == nil. This also
//     makes the sanitizer idempotent by construction.
//   - Otherwise the repair passes run in the same order as the solver's
//     recovery path; the result is returned only if it validates, together
//     with the list of repairs that changed the bytes (for logging).
//   - If the bytes still do not validate, the ORIGINAL input is returned
//     unchanged with a non-nil error carrying the original parse failure —
//     the caller degrades to a verbatim copy (fail-open), never a
//     half-sanitized file.
func sanitizeRawxBytes(input []byte) (out []byte, repairs []string, err error) {
	// Note: json.Valid alone is not enough — Go's scanner is byte-oriented and
	// accepts invalid UTF-8 inside strings, which RFC 8259 (and serde_json)
	// does not. The utf8.Valid check keeps the fast path strict.
	if json.Valid(input) && utf8.Valid(input) {
		return input, nil, nil
	}

	fixed := normalizePsseUnicodeEscapes(input)
	if !bytes.Equal(fixed, input) {
		repairs = append(repairs, repairUppercaseUnicodeEscapes)
	}
	prev := fixed
	fixed = escapeControlCharsInStrings(fixed)
	if !bytes.Equal(fixed, prev) {
		repairs = append(repairs, repairControlCharsInStrings)
	}
	prev = fixed
	fixed = repairInvalidUTF8(fixed)
	if !bytes.Equal(fixed, prev) {
		repairs = append(repairs, repairInvalidUTF8Bytes)
	}

	if json.Valid(fixed) {
		return fixed, repairs, nil
	}

	// Report the parse error of the ORIGINAL bytes (mirrors the solver, which
	// surfaces the first error when its recovery retry also fails).
	var probe json.RawMessage
	origErr := json.Unmarshal(input, &probe)
	return input, nil, fmt.Errorf("rawx not repairable to valid JSON: %w", origErr)
}
