package handlers

import (
	"api-server/src/websocket"
	"sync"
	"time"

	"go.uber.org/zap"
)

// EventPublisher handles WebSocket event publishing
type EventPublisher struct {
	hub    *websocket.Hub
	logger *zap.Logger

	// Network-update coalescer state. EditElement is called many times per
	// chat round; we debounce the resulting network:updated event so a flurry
	// of edits produces one client refetch instead of N. Best-effort: buffered
	// events are lost on process exit.
	netMu     sync.Mutex
	netBuffer map[string]*networkUpdateBuffer
}

// networkUpdateBuffer holds the in-flight coalesce state for one session.
type networkUpdateBuffer struct {
	timer        *time.Timer
	contributors []map[string]interface{}
}

// networkUpdateDebounce bounds how long EditElement edits accumulate before
// firing a single network:updated event. 200 ms is the breakpoint between
// "feels live" and "obviously delayed" for visual updates.
const networkUpdateDebounce = 200 * time.Millisecond

// NewEventPublisher creates a new event publisher
func NewEventPublisher(hub *websocket.Hub, logger *zap.Logger) *EventPublisher {
	return &EventPublisher{
		hub:       hub,
		logger:    logger,
		netBuffer: map[string]*networkUpdateBuffer{},
	}
}

// PublishSessionCreated publishes a session created event
func (p *EventPublisher) PublishSessionCreated(sessionID, userID string) {
	if p.hub == nil {
		return
	}

	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionStatus, sessionID),
		websocket.EventTypeSessionCreated,
		map[string]interface{}{
			"session_id": sessionID,
			"user_id":    userID,
			"timestamp":  time.Now().Format(time.RFC3339),
		},
	)

	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish session created event", zap.Error(err))
	}
}

// PublishSessionDeleted publishes a session deleted event
func (p *EventPublisher) PublishSessionDeleted(sessionID, userID string) {
	if p.hub == nil {
		return
	}

	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionStatus, sessionID),
		websocket.EventTypeSessionDeleted,
		map[string]interface{}{
			"session_id": sessionID,
			"user_id":    userID,
			"timestamp":  time.Now().Format(time.RFC3339),
		},
	)

	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish session deleted event", zap.Error(err))
	}
}

// PublishNetworkUpdated publishes a network updated event
func (p *EventPublisher) PublishNetworkUpdated(sessionID string, changes map[string]interface{}) {
	if p.hub == nil {
		return
	}

	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionNetwork, sessionID),
		websocket.EventTypeNetworkUpdated,
		map[string]interface{}{
			"session_id": sessionID,
			"changes":    changes,
			"timestamp":  time.Now().Format(time.RFC3339),
		},
	)

	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish network updated event", zap.Error(err))
	}
}

// PublishPowerFlowStarted publishes a power flow started event
func (p *EventPublisher) PublishPowerFlowStarted(sessionID, taskID string) {
	if p.hub == nil {
		return
	}

	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionPowerFlow, sessionID),
		websocket.EventTypePowerFlowStarted,
		map[string]interface{}{
			"session_id": sessionID,
			"task_id":    taskID,
			"timestamp":  time.Now().Format(time.RFC3339),
		},
	)

	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish power flow started event", zap.Error(err))
	}
}

// PublishPowerFlowCompleted publishes a power flow completed event.
//
// requestID echoes the client-supplied X-Request-Id (empty when none). The UI
// passes the id it originated into useInvalidationEvent's seenRequestIds set, so
// it skips the refetch for its own solve (which it already handled via the SDK)
// while still refetching for agent-triggered or other-client solves.
func (p *EventPublisher) PublishPowerFlowCompleted(sessionID string, result map[string]interface{}, requestID string) {
	if p.hub == nil {
		return
	}

	payload := map[string]interface{}{
		"session_id": sessionID,
		"result":     result,
		"timestamp":  time.Now().Format(time.RFC3339),
	}
	if requestID != "" {
		payload["request_id"] = requestID
	}

	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionPowerFlow, sessionID),
		websocket.EventTypePowerFlowCompleted,
		payload,
	)

	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish power flow completed event", zap.Error(err))
	}
}

// PublishSolverProgress publishes a streamed solver progress event.
//
// Progress events originate from the flow-solver's JSONL progress file,
// tailed by the SolverService. For solve-flow the solver emits only
// start/done markers, so this is effectively a no-op slot today; contingency
// analysis will emit per-contingency events through the same path.
func (p *EventPublisher) PublishSolverProgress(sessionID string, body map[string]interface{}) {
	if p.hub == nil {
		return
	}

	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionPowerFlow, sessionID),
		websocket.EventTypePowerFlowProgress,
		map[string]interface{}{
			"session_id": sessionID,
			"progress":   body,
			"timestamp":  time.Now().Format(time.RFC3339),
		},
	)

	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish solver progress event", zap.Error(err))
	}
}

// PublishPowerFlowFailed publishes a power flow failed event
func (p *EventPublisher) PublishPowerFlowFailed(sessionID, errorMsg string) {
	if p.hub == nil {
		return
	}

	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionPowerFlow, sessionID),
		websocket.EventTypePowerFlowFailed,
		map[string]interface{}{
			"session_id": sessionID,
			"error":      errorMsg,
			"timestamp":  time.Now().Format(time.RFC3339),
		},
	)

	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish power flow failed event", zap.Error(err))
	}
}

// HasHub returns true if the publisher has a hub
func (p *EventPublisher) HasHub() bool {
	return p.hub != nil
}

// ===========================================================================
// INVALIDATION EVENTS
// ===========================================================================
// These events tell subscribed clients "this slice changed, refetch if you
// care." Payloads are small by design: they identify what changed, not the
// new state. Clients refetch via the existing REST endpoints.

// PublishStudyFilesUpdated fires after a successful LoadSub/LoadMon/LoadCon.
// kinds is the set of slot kinds that changed (typically one).
func (p *EventPublisher) PublishStudyFilesUpdated(sessionID, userID, source, requestID string, kinds []string) {
	if p.hub == nil {
		return
	}
	payload := map[string]interface{}{
		"session_id": sessionID,
		"user_id":    userID,
		"source":     source,
		"kinds":      kinds,
		"timestamp":  time.Now().Format(time.RFC3339),
	}
	if requestID != "" {
		payload["request_id"] = requestID
	}
	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionStudyFiles, sessionID),
		websocket.EventTypeStudyFilesUpdated,
		payload,
	)
	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish study_files:updated", zap.Error(err))
	}
}

// PublishUserFilesUpdated fires after a successful UploadUserFile or
// DeleteUserFile. fileTypes lists the user-library folders that changed
// (typically one).
func (p *EventPublisher) PublishUserFilesUpdated(userID, source, requestID string, fileTypes []string) {
	if p.hub == nil {
		return
	}
	payload := map[string]interface{}{
		"user_id":    userID,
		"source":     source,
		"file_types": fileTypes,
		"timestamp":  time.Now().Format(time.RFC3339),
	}
	if requestID != "" {
		payload["request_id"] = requestID
	}
	event := websocket.NewEvent(
		websocket.FormatUserTopic(websocket.TopicUserFiles, userID),
		websocket.EventTypeUserFilesUpdated,
		payload,
	)
	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish user_files:updated", zap.Error(err))
	}
}

// PublishAnalysisStarted fires after a successful StartContingencyAnalysis.
func (p *EventPublisher) PublishAnalysisStarted(sessionID, userID, source, requestID, jobID string) {
	if p.hub == nil {
		return
	}
	payload := map[string]interface{}{
		"session_id": sessionID,
		"user_id":    userID,
		"source":     source,
		"job_id":     jobID,
		"timestamp":  time.Now().Format(time.RFC3339),
	}
	if requestID != "" {
		payload["request_id"] = requestID
	}
	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionAnalysis, sessionID),
		websocket.EventTypeAnalysisStarted,
		payload,
	)
	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish analysis:started", zap.Error(err))
	}
}

// PublishAnalysisFinished fires when an analysis job reaches a terminal
// state (completed/failed/cancelled). The job runner — not the cancel
// request handler — drives this so we get exactly one terminal event per
// job. source is always "system" because the originating request context
// is long gone by the time this fires.
func (p *EventPublisher) PublishAnalysisFinished(sessionID, jobID, state, errMsg, studyResultID string) {
	if p.hub == nil {
		return
	}
	var eventType string
	switch state {
	case "completed":
		eventType = websocket.EventTypeAnalysisCompleted
	case "failed":
		eventType = websocket.EventTypeAnalysisFailed
	case "cancelled":
		eventType = websocket.EventTypeAnalysisCancelled
	default:
		// Non-terminal state — nothing to publish.
		return
	}
	payload := map[string]interface{}{
		"session_id": sessionID,
		"source":     "system",
		"job_id":     jobID,
		"state":      state,
		"timestamp":  time.Now().Format(time.RFC3339),
	}
	if errMsg != "" {
		payload["error"] = errMsg
	}
	if studyResultID != "" {
		payload["study_result_id"] = studyResultID
	}
	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionAnalysis, sessionID),
		eventType,
		payload,
	)
	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish analysis terminal event",
			zap.String("event", eventType), zap.Error(err))
	}
}

// PublishNetworkUpdatedCoalesced records an EditElement contribution and
// schedules (or extends) a debounced network:updated publish. The descriptor
// is a small object the LLM-facing UI can use to know what changed without
// refetching everything — but the contract is still "client should refetch"
// not "client should patch in-place."
func (p *EventPublisher) PublishNetworkUpdatedCoalesced(sessionID, source, requestID string, descriptor map[string]interface{}) {
	if p.hub == nil {
		return
	}
	contribution := map[string]interface{}{
		"source": source,
	}
	if requestID != "" {
		contribution["request_id"] = requestID
	}
	if descriptor != nil {
		contribution["descriptor"] = descriptor
	}

	p.netMu.Lock()
	buf, ok := p.netBuffer[sessionID]
	if !ok {
		buf = &networkUpdateBuffer{}
		p.netBuffer[sessionID] = buf
	}
	buf.contributors = append(buf.contributors, contribution)
	if buf.timer != nil {
		buf.timer.Stop()
	}
	buf.timer = time.AfterFunc(networkUpdateDebounce, func() {
		p.flushNetworkUpdate(sessionID)
	})
	p.netMu.Unlock()
}

// flushNetworkUpdate publishes the buffered network:updated event for one
// session and clears its buffer. Called from the AfterFunc timer.
func (p *EventPublisher) flushNetworkUpdate(sessionID string) {
	p.netMu.Lock()
	buf := p.netBuffer[sessionID]
	if buf == nil {
		p.netMu.Unlock()
		return
	}
	contributors := buf.contributors
	delete(p.netBuffer, sessionID)
	p.netMu.Unlock()

	if len(contributors) == 0 {
		return
	}
	event := websocket.NewEvent(
		websocket.FormatSessionTopic(websocket.TopicSessionNetwork, sessionID),
		websocket.EventTypeNetworkUpdated,
		map[string]interface{}{
			"session_id":   sessionID,
			"contributors": contributors,
			"timestamp":    time.Now().Format(time.RFC3339),
		},
	)
	if err := p.hub.PublishEvent(event); err != nil {
		p.logger.Error("Failed to publish coalesced network:updated", zap.Error(err))
	}
}
