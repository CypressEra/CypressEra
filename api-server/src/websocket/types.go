package websocket

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

// Client represents a WebSocket client connection
type Client struct {
	ID       string
	UserID   string
	Conn     *websocket.Conn
	Send     chan []byte
	Topics   map[string]bool
	mu       sync.RWMutex
	lastPing time.Time
}

// NewClient creates a new WebSocket client
func NewClient(id, userID string, conn *websocket.Conn) *Client {
	return &Client{
		ID:     id,
		UserID: userID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		Topics: make(map[string]bool),
	}
}

// Subscribe adds a topic to the client's subscription list
func (c *Client) Subscribe(topic string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.Topics[topic] = true
}

// Unsubscribe removes a topic from the client's subscription list
func (c *Client) Unsubscribe(topic string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.Topics, topic)
}

// IsSubscribed checks if the client is subscribed to a topic
func (c *Client) IsSubscribed(topic string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.Topics[topic]
}

// UpdateLastPing updates the last ping time
func (c *Client) UpdateLastPing() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastPing = time.Now()
}

// GetLastPing returns the last ping time
func (c *Client) GetLastPing() time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lastPing
}

// Message represents a WebSocket message
type Message struct {
	Type      string                 `json:"type"`
	Topic     string                 `json:"topic,omitempty"`
	Event     string                 `json:"event,omitempty"`
	Payload   map[string]interface{} `json:"payload,omitempty"`
	Timestamp string                 `json:"timestamp"`
}

// SubscriptionMessage represents a subscription request
type SubscriptionMessage struct {
	Type  string `json:"type"`
	Topic string `json:"topic"`
}

// Event represents a WebSocket event
type Event struct {
	Type      string                 `json:"type"`
	Topic     string                 `json:"topic"`
	Event     string                 `json:"event"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp string                 `json:"timestamp"`
}

// NewEvent creates a new WebSocket event
func NewEvent(topic, eventType string, payload map[string]interface{}) *Event {
	return &Event{
		Type:      "event",
		Topic:     topic,
		Event:     eventType,
		Payload:   payload,
		Timestamp: time.Now().Format(time.RFC3339),
	}
}

// ToJSON converts the event to JSON bytes
func (e *Event) ToJSON() ([]byte, error) {
	return json.Marshal(e)
}

// EventType constants
const (
	EventTypeNetworkUpdated    = "network:updated"
	EventTypeNetworkAdded      = "network:added"
	EventTypeNetworkDeleted    = "network:deleted"
	EventTypePowerFlowStarted  = "powerflow:started"
	EventTypePowerFlowProgress = "powerflow:progress"
	EventTypePowerFlowCompleted = "powerflow:completed"
	EventTypePowerFlowFailed   = "powerflow:failed"
	EventTypeSessionCreated    = "session:created"
	EventTypeSessionDeleted    = "session:deleted"
	EventTypeSessionStatus     = "session:status"
	// Invalidation events fired by mutating handlers so any subscribed client
	// (UI tabs, future automation) refetches the affected slice via REST.
	EventTypeStudyFilesUpdated = "study_files:updated"
	EventTypeUserFilesUpdated  = "user_files:updated"
	EventTypeAnalysisStarted   = "analysis:started"
	EventTypeAnalysisCompleted = "analysis:completed"
	EventTypeAnalysisFailed    = "analysis:failed"
	EventTypeAnalysisCancelled = "analysis:cancelled"
)

// Topic constants. Two topic classes exist:
//   session:{session_id}:{domain} — per-session mutations
//   user:{user_id}:{domain}       — per-user-library mutations (uploads, deletes)
const (
	TopicSessionNetwork    = "session:%s:network"
	TopicSessionPowerFlow  = "session:%s:powerflow"
	TopicSessionStatus     = "session:%s:status"
	TopicSessionStudyFiles = "session:%s:study_files"
	TopicSessionAnalysis   = "session:%s:analysis"
	TopicUserFiles         = "user:%s:files"
)

// FormatSessionTopic formats a session topic with the session ID
func FormatSessionTopic(template, sessionID string) string {
	return fmt.Sprintf(template, sessionID)
}

// FormatUserTopic formats a user-scoped topic. Mirrors FormatSessionTopic but
// for the user:{user_id}:{domain} class. Used by the user-library file events
// that aren't tied to any one session.
func FormatUserTopic(template, userID string) string {
	return fmt.Sprintf(template, userID)
}
