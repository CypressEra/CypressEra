package services

import (
	"context"
	"testing"
	"time"

	"go.uber.org/zap"
)

func waitForState(t *testing.T, s *JobService, id string, want JobState) AnalysisJob {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if j, ok := s.Get(id); ok && j.State == want {
			return j
		}
		time.Sleep(5 * time.Millisecond)
	}
	j, _ := s.Get(id)
	t.Fatalf("job %s never reached %q (last state %q)", id, want, j.State)
	return AnalysisJob{}
}

func TestJobCompletesAndReportsProgress(t *testing.T) {
	s := NewJobService(2, zap.NewNop())
	job, err := s.Submit("sess-1", "contingency", 10, func(ctx context.Context, report func(JobProgress)) (string, error) {
		report(JobProgress{Done: 5, Total: 10})
		report(JobProgress{Done: 10, Total: 10})
		return "/tmp/result.json", nil
	})
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	done := waitForState(t, s, job.ID, JobCompleted)
	if done.Progress.Done != 10 || done.Progress.Total != 10 {
		t.Errorf("progress = %#v, want 10/10", done.Progress)
	}
	if done.ResultPath() != "/tmp/result.json" {
		t.Errorf("result path = %q", done.ResultPath())
	}
}

func TestJobFailureRecorded(t *testing.T) {
	s := NewJobService(1, zap.NewNop())
	job, _ := s.Submit("sess-2", "contingency", 0, func(ctx context.Context, report func(JobProgress)) (string, error) {
		return "", context.DeadlineExceeded
	})
	failed := waitForState(t, s, job.ID, JobFailed)
	if failed.Error == "" {
		t.Error("failed job should carry an error message")
	}
}

func TestJobCancellation(t *testing.T) {
	s := NewJobService(1, zap.NewNop())
	job, _ := s.Submit("sess-3", "contingency", 0, func(ctx context.Context, report func(JobProgress)) (string, error) {
		<-ctx.Done() // block until cancelled
		return "", ctx.Err()
	})
	waitForState(t, s, job.ID, JobRunning)
	if err := s.Cancel(job.ID); err != nil {
		t.Fatalf("cancel: %v", err)
	}
	cancelled := waitForState(t, s, job.ID, JobCancelled)
	if cancelled.State != JobCancelled {
		t.Errorf("state = %q, want cancelled", cancelled.State)
	}
	// Cancelling a finished job is rejected.
	if err := s.Cancel(job.ID); err == nil {
		t.Error("cancelling an already-finished job should error")
	}
}

func TestJobOnePerSession(t *testing.T) {
	s := NewJobService(2, zap.NewNop())
	block := make(chan struct{})
	job1, _ := s.Submit("sess-4", "contingency", 1, func(ctx context.Context, report func(JobProgress)) (string, error) {
		<-block
		return "/tmp/r.json", nil
	})
	waitForState(t, s, job1.ID, JobRunning)

	if _, err := s.Submit("sess-4", "contingency", 0, func(ctx context.Context, report func(JobProgress)) (string, error) {
		return "", nil
	}); err == nil {
		t.Error("a second job for the same session should be rejected")
	}
	close(block)
	waitForState(t, s, job1.ID, JobCompleted)
}

func TestJobSeedsInitialTotal(t *testing.T) {
	s := NewJobService(1, zap.NewNop())
	block := make(chan struct{})
	job, _ := s.Submit("sess-5", "contingency", 42, func(ctx context.Context, report func(JobProgress)) (string, error) {
		<-block
		return "/tmp/r.json", nil
	})
	// Before the run reports any progress, a status query already reports the
	// real total — not zero.
	got, ok := s.Get(job.ID)
	if !ok || got.Progress.Total != 42 {
		t.Errorf("initial progress = %#v, want total 42", got.Progress)
	}
	close(block)
	waitForState(t, s, job.ID, JobCompleted)
}

func TestJobGetUnknown(t *testing.T) {
	s := NewJobService(1, zap.NewNop())
	if _, ok := s.Get("nope"); ok {
		t.Error("Get of an unknown job id should report not found")
	}
}
