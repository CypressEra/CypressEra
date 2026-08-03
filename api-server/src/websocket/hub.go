package websocket

import (
	"encoding/json"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Hub maintains the set of active clients and broadcasts messages to them
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	logger     *zap.Logger
}

// NewHub creates a new Hub instance
func NewHub(logger *zap.Logger) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		logger:     logger,
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			h.logger.Info("Client registered",
				zap.String("client_id", client.ID),
				zap.String("user_id", client.UserID),
				zap.Int("total_clients", len(h.clients)))

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			h.logger.Info("Client unregistered",
				zap.String("client_id", client.ID),
				zap.String("user_id", client.UserID),
				zap.Int("total_clients", len(h.clients)))

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()

		case <-ticker.C:
			h.cleanupInactiveClients()
		}
	}
}

// Register registers a new client
func (h *Hub) Register(client *Client) {
	h.register <- client
}

// Unregister unregisters a client
func (h *Hub) Unregister(client *Client) {
	h.unregister <- client
}

// Broadcast sends a message to all connected clients
func (h *Hub) Broadcast(message []byte) {
	h.broadcast <- message
}

// BroadcastToTopic sends a message to all clients subscribed to a topic
func (h *Hub) BroadcastToTopic(topic string, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	sentCount := 0
	for client := range h.clients {
		if client.IsSubscribed(topic) {
			select {
			case client.Send <- message:
				sentCount++
			default:
				close(client.Send)
				delete(h.clients, client)
			}
		}
	}

	h.logger.Debug("Broadcast to topic",
		zap.String("topic", topic),
		zap.Int("recipients", sentCount))
}

// PublishEvent publishes an event to all subscribers of the event's topic
func (h *Hub) PublishEvent(event *Event) error {
	message, err := event.ToJSON()
	if err != nil {
		return err
	}

	h.BroadcastToTopic(event.Topic, message)
	return nil
}

// GetClientCount returns the number of connected clients
func (h *Hub) GetClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// GetClientsByUserID returns all clients for a specific user
func (h *Hub) GetClientsByUserID(userID string) []*Client {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var clients []*Client
	for client := range h.clients {
		if client.UserID == userID {
			clients = append(clients, client)
		}
	}
	return clients
}

// cleanupInactiveClients removes clients that haven't sent a ping in 60 seconds
func (h *Hub) cleanupInactiveClients() {
	h.mu.Lock()
	defer h.mu.Unlock()

	now := time.Now()
	for client := range h.clients {
		if now.Sub(client.GetLastPing()) > 60*time.Second {
			h.logger.Info("Removing inactive client",
				zap.String("client_id", client.ID),
				zap.Duration("inactive_duration", now.Sub(client.GetLastPing())))

			close(client.Send)
			delete(h.clients, client)
		}
	}
}

// SendError sends an error message to a client
func (h *Hub) SendError(client *Client, code, message string) {
	errorMsg := map[string]interface{}{
		"type":      "error",
		"code":      code,
		"message":   message,
		"timestamp": time.Now().Format(time.RFC3339),
	}

	data, err := json.Marshal(errorMsg)
	if err != nil {
		h.logger.Error("Failed to marshal error message", zap.Error(err))
		return
	}

	select {
	case client.Send <- data:
	default:
		h.logger.Warn("Failed to send error message, client buffer full")
	}
}
