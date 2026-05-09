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

// EndMeetingFunc ends a stale meeting detected by the reaper.
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

// Stop terminates the loop. Idempotent; safe to call on a nil receiver.
func (r *Reaper) Stop() {
	if r == nil {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.cancel != nil {
		r.cancel()
		r.cancel = nil
	}
}

// RunOnce executes a single reaper tick synchronously; safe to call from tests.
func (r *Reaper) RunOnce() {
	r.tick()
}

func (r *Reaper) loop(ctx context.Context) {
	t := time.NewTicker(r.interval)
	defer t.Stop()

	// Tick immediately to clean up long-stale entries at deploy time.
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

const preHeartbeatGrace = 30 * time.Minute

func (r *Reaper) tick() {
	meetings, err := r.store.ListActiveMeetings()
	if err != nil {
		r.api.LogWarn("[opentalk] reaper: ListActiveMeetings failed", "err", err.Error())
		return
	}
	now := time.Now().UTC()
	staleCutoff := now.Add(-r.staleness)
	graceCutoff := now.Add(-preHeartbeatGrace)
	for _, am := range meetings {
		if !am.HostHeartbeatReceived {
			// No webapp heartbeat yet — trust CreatedAt for the longer grace.
			if am.CreatedAt.Before(graceCutoff) {
				r.api.LogInfo("[opentalk] reaper: ending meeting past pre-heartbeat grace",
					"channel_id", am.ChannelID,
					"room_id", am.RoomID,
					"created_at", am.CreatedAt.Format(time.RFC3339),
				)
				r.endMeeting(am)
			}
			continue
		}
		if am.LastHeartbeat.Before(staleCutoff) {
			r.api.LogInfo("[opentalk] reaper: ending stale meeting",
				"channel_id", am.ChannelID,
				"room_id", am.RoomID,
				"last_heartbeat", am.LastHeartbeat.Format(time.RFC3339),
			)
			r.endMeeting(am)
		}
	}
}
