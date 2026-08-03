package types

// FindShortestPathRequest is the body for POST /api/v1/session/analysis/shortest-path.
type FindShortestPathRequest struct {
	SessionID string `json:"session_id" binding:"required"`
	FromBus   int    `json:"from_bus" binding:"required"`
	ToBus     int    `json:"to_bus" binding:"required"`
}

// FindShortestPathResponse is the success envelope for the shortest-path endpoint.
type FindShortestPathResponse struct {
	Status    string `json:"status"`
	SessionID string `json:"session_id"`
	Found     bool   `json:"found"`
	// Path is the ordered sequence of bus IDs from FromBus to ToBus (inclusive).
	// Omitted when Found is false.
	Path    []int  `json:"path,omitempty"`
	Message string `json:"message,omitempty"`
}

// FindNeighbourElementsRequest is the body for POST /api/v1/session/analysis/neighbour-elements.
type FindNeighbourElementsRequest struct {
	SessionID    string   `json:"session_id" binding:"required"`
	OriginBus    int      `json:"origin_bus" binding:"required"`
	N            int      `json:"n" binding:"required"`
	ElementTypes []string `json:"element_types,omitempty"`
}

// FindNeighbourElementsResponse is the success envelope for the neighbour-elements endpoint.
type FindNeighbourElementsResponse struct {
	Status        string        `json:"status"`
	SessionID     string        `json:"session_id"`
	OriginBus     int           `json:"origin_bus"`
	MaxBusesAway  int           `json:"max_buses_away"`
	Elements      []interface{} `json:"elements"`
}
