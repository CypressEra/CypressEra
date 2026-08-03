package services

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"os"
	"time"

	"go.uber.org/zap"
)

// ProgressEvent is a single event parsed from a flow-solver progress JSONL
// file. `Body` carries the raw decoded object; `Timestamp` records when the
// api-server observed the line.
type ProgressEvent struct {
	Body      map[string]interface{}
	Timestamp time.Time
}

// progressPollInterval is how often the tailer checks the JSONL file for new
// bytes. inotify/FSEvents is a future optimization; polling is cross-platform
// and 200ms is well within human-visible smoothness for UI updates.
const progressPollInterval = 200 * time.Millisecond

// TailProgress follows a flow-solver progress JSONL file, parsing each
// newline-terminated line as a JSON object and pushing it onto `events`.
//
// It returns when `ctx` is cancelled (typically once the solver process has
// exited), after a final drain of any bytes written between the last poll and
// cancellation. Partial trailing lines (no newline yet) are tolerated and
// retried on the next poll. The function never blocks the solver: a slow
// consumer simply receives events later.
//
// The events channel is closed before TailProgress returns so consumers can
// range over it.
func TailProgress(ctx context.Context, path string, events chan<- ProgressEvent, logger *zap.Logger) {
	defer close(events)

	var offset int64
	emit := func() {
		f, err := os.Open(path)
		if err != nil {
			// The solver may not have created the file yet, or never will
			// (progress is optional). Both are fine — try again next poll.
			return
		}
		defer f.Close()

		if _, err := f.Seek(offset, io.SeekStart); err != nil {
			return
		}

		reader := bufio.NewReader(f)
		for {
			line, err := reader.ReadBytes('\n')
			if err == io.EOF {
				// A partial trailing line with no newline yet. `offset` is
				// left before it so the full line is re-read once complete.
				break
			}
			if err != nil {
				logger.Warn("progress tailer read error", zap.String("path", path), zap.Error(err))
				return
			}
			offset += int64(len(line))

			var body map[string]interface{}
			if err := json.Unmarshal(line, &body); err != nil {
				logger.Warn("skipping malformed progress line",
					zap.String("path", path), zap.Error(err))
				continue
			}
			// Deliver every parsed line with an unconditional send. `offset`
			// has already advanced past this line, so abandoning the send
			// would drop it for good — and the final drain runs with `ctx`
			// already cancelled, so racing it against `ctx.Done()` here would
			// silently lose a fast run's progress. The consumer ranges
			// `events` until TailProgress closes it, so a receiver is always
			// present and this send cannot deadlock.
			events <- ProgressEvent{Body: body, Timestamp: time.Now()}
		}
	}

	ticker := time.NewTicker(progressPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			emit() // final drain of anything written before cancellation
			return
		case <-ticker.C:
			emit()
		}
	}
}
