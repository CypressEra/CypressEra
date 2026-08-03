package websocket

import (
	"encoding/json"
	"net/http"
	"time"

	"api-server/src/auth"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// In production, implement proper origin checking
		return true
	},
}

// TokenParser validates a signed access token and returns its claims.
// *auth.Service satisfies this. Depending on the parser instead of a raw secret
// keeps WebSocket auth on the exact same secret and validation rules as the
// HTTP API — no second AUTH_JWT_SECRET lookup, no divergent fallback default,
// no duplicated JWT parsing — and keeps the handler unit-testable.
type TokenParser interface {
	ParseToken(token string) (*auth.Claims, error)
}

// Handler handles WebSocket connections
type Handler struct {
	hub    *Hub
	logger *zap.Logger
	tokens TokenParser
}

// NewHandler creates a new WebSocket handler
func NewHandler(hub *Hub, logger *zap.Logger, tokens TokenParser) *Handler {
	return &Handler{
		hub:    hub,
		logger: logger,
		tokens: tokens,
	}
}

// HandleWebSocket handles WebSocket connection requests
func (h *Handler) HandleWebSocket(c *gin.Context) {
	// Get JWT token from query parameter or header
	tokenString := c.Query("token")
	if tokenString == "" {
		tokenString = c.GetHeader("Authorization")
		if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
			tokenString = tokenString[7:]
		}
	}

	if tokenString == "" {
		h.logger.Warn("WebSocket connection attempt without token")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
		return
	}

	// Validate the token with the auth service — the same parser, secret, and
	// rules the HTTP API uses (no second secret lookup, no duplicated parsing).
	claims, err := h.tokens.ParseToken(tokenString)
	if err != nil {
		h.logger.Warn("Invalid JWT token", zap.Error(err))
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return
	}

	// The auth service issues JWTs with the user id under the "uid" claim
	// (auth/auth.go: type Claims has `UserID string \`json:"uid"\``). The
	// RFC-7519 "sub" claim is also set to the same value as a fallback. We
	// historically looked for "user_id" — a key the issuer never set — so
	// every WS upgrade 401'd. Read uid first, sub second.
	userID := claims.UserID
	if userID == "" {
		userID = claims.Subject
	}
	if userID == "" {
		h.logger.Warn("Missing user id in token claims (looked for uid, sub)")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "missing user id"})
		return
	}

	// Upgrade HTTP connection to WebSocket
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		h.logger.Error("Failed to upgrade connection", zap.Error(err))
		return
	}

	// Create new client
	client := NewClient(
		generateClientID(),
		userID,
		conn,
	)
	client.UpdateLastPing()

	// Register client
	h.hub.Register(client)

	// Start read and write goroutines
	go h.writePump(client)
	go h.readPump(client)
}

// readPump pumps messages from the WebSocket connection to the hub
func (h *Handler) readPump(client *Client) {
	defer func() {
		h.hub.Unregister(client)
		client.Conn.Close()
	}()

	client.Conn.SetReadLimit(5120) // 5KB max message size
	client.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client.Conn.SetPongHandler(func(string) error {
		client.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		client.UpdateLastPing()
		return nil
	})

	for {
		_, message, err := client.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				h.logger.Error("WebSocket read error", zap.Error(err))
			}
			break
		}

		// Parse message
		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			h.logger.Warn("Failed to parse message", zap.Error(err))
			h.hub.SendError(client, "INVALID_MESSAGE", "Failed to parse message")
			continue
		}

		// Handle message based on type
		switch msg.Type {
		case "subscribe":
			h.handleSubscribe(client, &msg)
		case "unsubscribe":
			h.handleUnsubscribe(client, &msg)
		case "ping":
			h.handlePing(client)
		default:
			h.logger.Warn("Unknown message type", zap.String("type", msg.Type))
			h.hub.SendError(client, "UNKNOWN_TYPE", "Unknown message type")
		}
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (h *Handler) writePump(client *Client) {
	ticker := time.NewTicker(5 * time.Second)
	defer func() {
		ticker.Stop()
		client.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-client.Send:
			client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// Hub closed the channel
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			// One frame = one JSON message. We previously batched multiple
			// queued messages into a single text frame separated by '\n',
			// but a browser client does JSON.parse(event.data) on the whole
			// frame and chokes the moment a second message is appended. The
			// fix is to send each queued message as its own text frame.
			if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
			// Drain any queued messages, one frame each.
			n := len(client.Send)
			for i := 0; i < n; i++ {
				client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				next, more := <-client.Send
				if !more {
					return
				}
				if err := client.Conn.WriteMessage(websocket.TextMessage, next); err != nil {
					return
				}
			}
		case <-ticker.C:
			client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleSubscribe handles subscription requests
func (h *Handler) handleSubscribe(client *Client, msg *Message) {
	topic := msg.Topic
	if topic == "" {
		h.hub.SendError(client, "MISSING_TOPIC", "Topic is required")
		return
	}

	// Validate topic access (user should have access to the session)
	if !h.validateTopicAccess(client.UserID, topic) {
		h.hub.SendError(client, "UNAUTHORIZED", "Not authorized for this topic")
		return
	}

	client.Subscribe(topic)
	h.logger.Info("Client subscribed to topic",
		zap.String("client_id", client.ID),
		zap.String("topic", topic))

	// Send confirmation
	confirmMsg := map[string]interface{}{
		"type":      "subscribed",
		"topic":     topic,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(confirmMsg)
	client.Send <- data
}

// handleUnsubscribe handles unsubscription requests
func (h *Handler) handleUnsubscribe(client *Client, msg *Message) {
	topic := msg.Topic
	if topic == "" {
		h.hub.SendError(client, "MISSING_TOPIC", "Topic is required")
		return
	}

	client.Unsubscribe(topic)
	h.logger.Info("Client unsubscribed from topic",
		zap.String("client_id", client.ID),
		zap.String("topic", topic))

	// Send confirmation
	confirmMsg := map[string]interface{}{
		"type":      "unsubscribed",
		"topic":     topic,
		"timestamp": time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(confirmMsg)
	client.Send <- data
}

// handlePing handles ping messages
func (h *Handler) handlePing(client *Client) {
	client.UpdateLastPing()
	pongMsg := map[string]interface{}{
		"type":      "pong",
		"timestamp": time.Now().Format(time.RFC3339),
	}
	data, _ := json.Marshal(pongMsg)
	client.Send <- data
}

// validateTopicAccess validates if a user has access to a topic
func (h *Handler) validateTopicAccess(userID, topic string) bool {
	// TODO: Implement proper topic access validation
	// For now, allow all topics that match the pattern session:{sessionId}:*
	// In production, check if the user owns or has access to the session
	return true
}

// generateClientID generates a unique client ID
func generateClientID() string {
	return time.Now().Format("20060102150405") + "-" + randomString(8)
}

// randomString generates a random string of given length
func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		b[i] = charset[i%len(charset)]
	}
	return string(b)
}
