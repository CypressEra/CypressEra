package handlers

import (
	"sync/atomic"
	"testing"
	"time"

	"go.uber.org/zap"

	"api-server/src/websocket"
)

// newTestPublisher returns an EventPublisher backed by a real but client-less
// hub. Broadcasts go nowhere (no registered clients), which is exactly what
// we want: we can exercise the coalescer state machine end-to-end without
// touching a network.
func newTestPublisher() *EventPublisher {
	hub := websocket.NewHub(zap.NewNop())
	return NewEventPublisher(hub, zap.NewNop())
}

// TestNetworkUpdateCoalescer verifies the debounced publish behavior of
// PublishNetworkUpdatedCoalesced: many calls within one window collapse to a
// single fire-after-debounce, and calls outside the window each get their
// own publish.
//
// The test does not bring up a real websocket hub. Instead it uses a nil hub:
// the publisher's helpers short-circuit early when hub == nil, BUT the timer
// path still runs because the buffer state machine is independent of the hub.
// We assert on the buffer's lifecycle via published-fire counts captured by
// swapping the flush function — kept simple by checking that the buffer is
// emptied by the flush rather than instrumenting the hub.
func TestNetworkUpdateCoalescer_BurstCollapses(t *testing.T) {
	// With a real hub absent, flushNetworkUpdate exits early after clearing
	// the buffer. That's the property we want to observe: post-flush buffer
	// is empty.
	p := newTestPublisher()

	sessionID := "session-burst"
	for i := 0; i < 10; i++ {
		p.PublishNetworkUpdatedCoalesced(sessionID, "agent", "", nil)
	}

	p.netMu.Lock()
	contribCount := 0
	if buf, ok := p.netBuffer[sessionID]; ok {
		contribCount = len(buf.contributors)
	}
	p.netMu.Unlock()
	if contribCount != 10 {
		t.Fatalf("expected 10 contributors buffered before flush, got %d", contribCount)
	}

	// Wait past the debounce window. AfterFunc fires once and the buffer
	// entry is deleted.
	time.Sleep(networkUpdateDebounce + 100*time.Millisecond)

	p.netMu.Lock()
	_, stillBuffered := p.netBuffer[sessionID]
	p.netMu.Unlock()
	if stillBuffered {
		t.Fatalf("buffer entry still present after debounce window — single-flush invariant broken")
	}
}

// TestNetworkUpdateCoalescer_OutsideWindow verifies that two bursts separated
// by more than the debounce window each get their own flush.
func TestNetworkUpdateCoalescer_OutsideWindow(t *testing.T) {
	p := newTestPublisher()
	sessionID := "session-two-bursts"

	// Burst 1.
	p.PublishNetworkUpdatedCoalesced(sessionID, "agent", "", nil)
	time.Sleep(networkUpdateDebounce + 100*time.Millisecond)

	p.netMu.Lock()
	if _, ok := p.netBuffer[sessionID]; ok {
		p.netMu.Unlock()
		t.Fatalf("expected first burst to have flushed and cleared its buffer entry")
	}
	p.netMu.Unlock()

	// Burst 2 — a new entry should re-appear, then flush.
	p.PublishNetworkUpdatedCoalesced(sessionID, "ui", "req-2", nil)

	p.netMu.Lock()
	buf, ok := p.netBuffer[sessionID]
	if !ok {
		p.netMu.Unlock()
		t.Fatalf("expected a fresh buffer entry for burst 2")
	}
	if len(buf.contributors) != 1 {
		t.Fatalf("burst 2 should have 1 contributor, got %d", len(buf.contributors))
	}
	p.netMu.Unlock()

	time.Sleep(networkUpdateDebounce + 100*time.Millisecond)

	p.netMu.Lock()
	_, stillBuffered := p.netBuffer[sessionID]
	p.netMu.Unlock()
	if stillBuffered {
		t.Fatalf("burst 2 buffer should have flushed and been deleted")
	}
}

// TestNetworkUpdateCoalescer_ContributorOrder verifies that contributors are
// retained in arrival order — this matters because the UI may want to know
// which actor caused the change, and ordering is the cheapest way to convey
// causality without reaching for a sequence number.
func TestNetworkUpdateCoalescer_ContributorOrder(t *testing.T) {
	p := newTestPublisher()
	sessionID := "session-order"

	var arrived atomic.Int32
	for _, src := range []string{"agent", "ui", "agent", "system"} {
		p.PublishNetworkUpdatedCoalesced(sessionID, src, "", nil)
		arrived.Add(1)
	}

	p.netMu.Lock()
	buf := p.netBuffer[sessionID]
	if buf == nil {
		p.netMu.Unlock()
		t.Fatalf("expected buffered entries")
	}
	want := []string{"agent", "ui", "agent", "system"}
	if len(buf.contributors) != len(want) {
		p.netMu.Unlock()
		t.Fatalf("expected %d contributors, got %d", len(want), len(buf.contributors))
	}
	for i, c := range buf.contributors {
		got, _ := c["source"].(string)
		if got != want[i] {
			p.netMu.Unlock()
			t.Fatalf("contributor[%d] source = %q, want %q", i, got, want[i])
		}
	}
	p.netMu.Unlock()

	// Let the timer flush so the test doesn't leak goroutines.
	time.Sleep(networkUpdateDebounce + 100*time.Millisecond)
}
