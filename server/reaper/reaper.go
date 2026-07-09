// Package reaper watches the ActiveMeeting KV-store and ends meetings
// whose LastHeartbeat is older than the configured staleness threshold.
// Runs as a single goroutine started by Plugin.OnActivate; cancelled
// on OnDeactivate.
package reaper

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// EndMeetingFunc ends a stale meeting detected by the reaper.
type EndMeetingFunc func(am *store.ActiveMeeting)

const (
	leaderKey = "reaper_leader"
)

type Reaper struct {
	api        plugin.API
	store      *store.Store
	endMeeting EndMeetingFunc
	encKey     func() []byte
	interval   time.Duration
	staleness  time.Duration
	leaderTTL  time.Duration
	nodeID     []byte
	mu         sync.Mutex
	cancel     context.CancelFunc
}

func newNodeID() []byte {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return []byte(time.Now().UTC().Format(time.RFC3339Nano))
	}
	id := make([]byte, hex.EncodedLen(len(b)))
	hex.Encode(id, b)
	return id
}

// New returns a Reaper. interval is the tick cadence; staleness is the
// meeting-side timeout for missing heartbeats. encKey returns the current
// token-encryption key so the reaper can read encrypted ActiveMeeting
// records; the function is evaluated per tick so config changes propagate.
func New(api plugin.API, s *store.Store, end EndMeetingFunc, encKey func() []byte, interval, staleness time.Duration) *Reaper {
	return &Reaper{
		api:        api,
		store:      s,
		endMeeting: end,
		encKey:     encKey,
		interval:   interval,
		staleness:  staleness,
		leaderTTL:  3 * interval,
		nodeID:     newNodeID(),
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

// acquireOrRenewLeader: best-effort cluster leader election via KV CAS so reaper mutations run once cluster-wide; a non-nil lease owned by another node must bail (passing it as OldValue would CAS-overwrite a live foreign lease).
func (r *Reaper) acquireOrRenewLeader() bool {
	raw, appErr := r.api.KVGet(leaderKey)
	if appErr != nil {
		return false
	}
	if raw != nil && !bytes.Equal(raw, r.nodeID) {
		return false
	}
	ttlSeconds := int64(r.leaderTTL.Seconds())
	if ttlSeconds < 1 {
		ttlSeconds = 1
	}
	opts := model.PluginKVSetOptions{
		Atomic:          true,
		OldValue:        raw,
		ExpireInSeconds: ttlSeconds,
	}
	ok, sErr := r.api.KVSetWithOptions(leaderKey, r.nodeID, opts)
	if sErr != nil {
		return false
	}
	return ok
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
	if !r.acquireOrRenewLeader() {
		return
	}
	var key []byte
	if r.encKey != nil {
		key = r.encKey()
	}
	meetings, err := r.store.ListActiveMeetings(key)
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
