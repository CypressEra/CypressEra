package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// JobState is the lifecycle state of an analysis job.
type JobState string

const (
	JobQueued    JobState = "queued"
	JobRunning   JobState = "running"
	JobCompleted JobState = "completed"
	JobFailed    JobState = "failed"
	JobCancelled JobState = "cancelled"
)

// JobProgress is the latest progress of a running analysis job.
type JobProgress struct {
	Done       int    `json:"done"`
	Total      int    `json:"total"`
	Violations int    `json:"violations"`
	Detail     string `json:"detail,omitempty"`
}

// AnalysisJob is an async, long-running analysis (e.g. AC contingency
// analysis). Jobs are held in memory; a completed job's result is on disk.
type AnalysisJob struct {
	ID        string      `json:"id"`
	SessionID string      `json:"session_id"`
	Type      string      `json:"type"`
	State     JobState    `json:"state"`
	Progress  JobProgress `json:"progress"`
	Error     string      `json:"error,omitempty"`
	CreatedAt time.Time   `json:"created_at"`
	UpdatedAt time.Time   `json:"updated_at"`
	// StudyResultID is the durable study result a completed contingency run
	// produced; empty until completion and for jobs that produce no result.
	StudyResultID string `json:"study_result_id,omitempty"`

	resultPath string             // on-disk result path; set when completed
	cancel     context.CancelFunc // cancels the run; not serialized
}

// ResultPath returns the on-disk path of a completed job's result.
func (j *AnalysisJob) ResultPath() string { return j.resultPath }

// RunFunc executes a job's work. It must observe ctx (stopping promptly on
// cancellation) and call report as work advances. It returns the on-disk
// path of the result.
type RunFunc func(ctx context.Context, report func(JobProgress)) (resultPath string, err error)

// JobSink delivers a job event to a session's clients (wired to the
// WebSocket event publisher by the handler layer).
type JobSink func(sessionID string, event map[string]interface{})

// progressInterval bounds how often progress is fanned to the WebSocket, so a
// run with many work items does not flood the channel.
const progressInterval = 250 * time.Millisecond

// JobService owns the in-memory registry of async analysis jobs.
type JobService struct {
	mu     sync.Mutex
	jobs   map[string]*AnalysisJob
	sem    chan struct{} // bounds concurrently-executing jobs
	sink   JobSink
	logger *zap.Logger
}

// NewJobService creates a JobService bounding concurrent jobs to maxConcurrent.
func NewJobService(maxConcurrent int, logger *zap.Logger) *JobService {
	if maxConcurrent < 1 {
		maxConcurrent = 1
	}
	return &JobService{
		jobs:   map[string]*AnalysisJob{},
		sem:    make(chan struct{}, maxConcurrent),
		logger: logger,
	}
}

// SetSink wires the WebSocket event sink (called after the publisher exists).
func (s *JobService) SetSink(sink JobSink) { s.sink = sink }

// Submit registers a job and starts it in the background. It rejects a second
// job for a session that already has one queued or running. total is the
// number of work items (e.g. contingencies); it seeds the job's progress so a
// status query before the first progress event still reports the real total.
func (s *JobService) Submit(sessionID, jobType string, total int, run RunFunc) (*AnalysisJob, error) {
	s.mu.Lock()
	for _, j := range s.jobs {
		if j.SessionID == sessionID && (j.State == JobQueued || j.State == JobRunning) {
			s.mu.Unlock()
			return nil, fmt.Errorf("an analysis job is already running for this session")
		}
	}
	now := time.Now()
	ctx, cancel := context.WithCancel(context.Background())
	job := &AnalysisJob{
		ID:        uuid.New().String(),
		SessionID: sessionID,
		Type:      jobType,
		State:     JobQueued,
		Progress:  JobProgress{Total: total},
		CreatedAt: now,
		UpdatedAt: now,
		cancel:    cancel,
	}
	s.jobs[job.ID] = job
	s.mu.Unlock()

	go s.execute(ctx, job, run)
	return job, nil
}

// Get returns a snapshot copy of a job by id.
func (s *JobService) Get(id string) (AnalysisJob, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	j, ok := s.jobs[id]
	if !ok {
		return AnalysisJob{}, false
	}
	return *j, true
}

// Cancel cancels a queued or running job. Cancelling a finished job is an error.
func (s *JobService) Cancel(id string) error {
	s.mu.Lock()
	job, ok := s.jobs[id]
	if !ok {
		s.mu.Unlock()
		return fmt.Errorf("job %s not found", id)
	}
	finished := job.State == JobCompleted || job.State == JobFailed || job.State == JobCancelled
	cancel := job.cancel
	s.mu.Unlock()

	if finished {
		return fmt.Errorf("job %s has already finished", id)
	}
	cancel()
	return nil
}

// execute runs a job: acquire a concurrency slot, run, and finalize.
func (s *JobService) execute(ctx context.Context, job *AnalysisJob, run RunFunc) {
	s.sem <- struct{}{}
	defer func() { <-s.sem }()

	if ctx.Err() != nil { // cancelled while queued
		s.finish(job, JobCancelled, "", "")
		return
	}
	s.mu.Lock()
	job.State = JobRunning
	job.UpdatedAt = time.Now()
	s.mu.Unlock()
	s.emit(job, "progress")

	resultPath, err := run(ctx, s.coalescedReporter(job))

	switch {
	case ctx.Err() != nil:
		s.finish(job, JobCancelled, "", "")
	case err != nil:
		s.logger.Warn("analysis job failed", zap.String("job_id", job.ID), zap.Error(err))
		s.finish(job, JobFailed, err.Error(), "")
	default:
		s.finish(job, JobCompleted, "", resultPath)
	}
}

// coalescedReporter returns a progress callback that always records progress
// in memory but fans it to the WebSocket at most once per progressInterval.
func (s *JobService) coalescedReporter(job *AnalysisJob) func(JobProgress) {
	var lastEmit time.Time
	return func(p JobProgress) {
		s.mu.Lock()
		job.Progress = p
		job.UpdatedAt = time.Now()
		emit := time.Since(lastEmit) >= progressInterval
		if emit {
			lastEmit = time.Now()
		}
		s.mu.Unlock()
		if emit {
			s.emit(job, "progress")
		}
	}
}

// finish records a terminal state and emits the terminal event.
func (s *JobService) finish(job *AnalysisJob, state JobState, errMsg, resultPath string) {
	s.mu.Lock()
	job.State = state
	job.Error = errMsg
	job.resultPath = resultPath
	job.UpdatedAt = time.Now()
	// Surface the study-result id at finish time so the terminal event
	// (consumed by the WS sink) carries it without the consumer recomputing
	// from the on-disk path.
	if state == JobCompleted && resultPath != "" {
		job.StudyResultID = ResultIDFromReportPath(resultPath)
	}
	s.mu.Unlock()
	s.emit(job, "done")
}

// emit fans a job event to the session's WebSocket clients.
func (s *JobService) emit(job *AnalysisJob, kind string) {
	if s.sink == nil {
		return
	}
	s.mu.Lock()
	ev := map[string]interface{}{
		"event":      "analysis:" + kind,
		"job_id":     job.ID,
		"job_type":   job.Type,
		"state":      string(job.State),
		"done":       job.Progress.Done,
		"total":      job.Progress.Total,
		"violations": job.Progress.Violations,
	}
	if job.Error != "" {
		ev["error"] = job.Error
	}
	if job.StudyResultID != "" {
		ev["study_result_id"] = job.StudyResultID
	}
	sessionID := job.SessionID
	s.mu.Unlock()
	s.sink(sessionID, ev)
}
