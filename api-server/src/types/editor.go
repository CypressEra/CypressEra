package types

// EditElementRequest represents a request to edit a network element
type EditElementRequest struct {
	SessionID   string                 `json:"session_id" binding:"required"`
	ElementType string                 `json:"element_type" binding:"required"`
	Action      string                 `json:"action" binding:"required"`
	Data        map[string]interface{} `json:"data,omitempty"`       // Required for add/modify
	Identifier  map[string]interface{} `json:"identifier,omitempty"` // Required for delete/modify
}

// EditElementResponse represents the response from editing a network element
type EditElementResponse struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	SessionID string `json:"session_id"`
	FilePath  string `json:"file_path"`
}
