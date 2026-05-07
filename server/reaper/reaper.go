// Package reaper watches the ActiveMeeting KV-store and ends meetings
// whose LastHeartbeat is older than the configured staleness threshold.
// Runs as a single goroutine started by Plugin.OnActivate; cancelled
// on OnDeactivate.
package reaper

import (
	"context"
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// EndMeetingFunc is called for each stale meeting the reaper detects.
// Implementation is provided by the host plugin (server/plugin.go) so
// the same post-update + broadcast + KV-cleanup happens regardless of
// whether the host clicked "end for all", all DM-recipients declined,
// or the reaper detected a dead session.
type EndMeetingFunc func(am *store.ActiveMeeting)

type Reaper struct {
	api        plugin.API
	store      *store.Store
	endMeeting EndMeetingFunc
	interval   time.Duration
	staleness  time.Duration
	mu         sync.Mutex
	cancel     context.CancelFunc
}

// New returns a Reaper. interval is how often the goroutine checks;
// staleness is how long a meeting can go without a heartbeat before
// it's considered dead.
func New(api plugin.API, s *store.Store, end EndMeetingFunc, interval, staleness time.Duration) *Reaper {
	return &Reaper{
		api:        api,
		store:      s,
		endMeeting: end,
		interval:   interval,
		staleness:  staleness,
	}
}

// Start begins the periodic loop. Idempotent.
func (r *Reaper) Start() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	r.cancel = cancel
	go r.loop(ctx)
}

// Stop terminates the loop. Idempotent.
func (r *Reaper) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancel != nil {
		r.cancel()
		r.cancel = nil
	}
}

// RunOnce executes a single reaper tick synchronously. It is safe to call
// from tests and from an admin-trigger endpoint without starting the
// background loop. RunOnce does not acquire the mu lock because tick() itself
// is stateless (all state lives in the KV-store and the callback).
func (r *Reaper) RunOnce() {
	r.tick()
}

func (r *Reaper) loop(ctx context.Context) {
	t := time.NewTicker(r.interval)
	defer t.Stop()

	// Tick immediately so a long-stale entry at deploy time is cleaned
	// up promptly without waiting one interval.
	r.tick()

	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			r.tick()
		}
	}
}

func (r *Reaper) tick() {
	meetings, err := r.store.ListActiveMeetings()
	if err != nil {
		r.api.LogWarn("[opentalk] reaper: ListActiveMeetings failed", "err", err.Error())
		return
	}
	cutoff := time.Now().UTC().Add(-r.staleness)
	for _, am := range meetings {
		if am.LastHeartbeat.Before(cutoff) {
			r.api.LogInfo("[opentalk] reaper: ending stale meeting",
				"channel_id", am.ChannelID,
				"room_id", am.RoomID,
				"last_heartbeat", am.LastHeartbeat.Format(time.RFC3339),
			)
			r.endMeeting(am)
		}
	}
}
