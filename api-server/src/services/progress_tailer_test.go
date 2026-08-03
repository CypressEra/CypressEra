package services

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"go.uber.org/zap"
)

// A fast run finishes before the first poll tick, so TailProgress reads the
// whole progress file only in its final drain — which runs with the context
// already cancelled. That drain must deliver every line, not race the
// cancelled context and drop a fast run's progress.
func TestTailProgressFinalDrainDeliversAllLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "progress.jsonl")
	content := `{"event":"start","total":3}
{"event":"contingency","index":1,"total":3,"violations":2}
{"event":"contingency","index":2,"total":3,"violations":0}
{"event":"contingency","index":3,"total":3,"violations":1}
{"event":"done","total":3}
`
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("write progress file: %v", err)
	}

	// Context already cancelled — TailProgress runs only its final drain,
	// exactly the path a sub-poll-interval run exercises.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	events := make(chan ProgressEvent, 16)
	go TailProgress(ctx, path, events, zap.NewNop())

	var got []map[string]interface{}
	for ev := range events {
		got = append(got, ev.Body)
	}

	if len(got) != 5 {
		t.Fatalf("drained %d events, want all 5 progress lines", len(got))
	}
	// The final contingency event must survive — it carries done == total.
	last := got[3]
	if last["event"] != "contingency" || last["index"].(float64) != 3 {
		t.Errorf("final contingency event lost or wrong: %v", last)
	}
}
