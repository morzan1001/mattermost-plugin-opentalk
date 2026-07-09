package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/crypto"
)

// ErrMeetingAlreadyActive is returned by callers that detect a live meeting
// already persisted for a channel. The caller should treat the accompanying
// *ActiveMeeting return value as the existing meeting rather than creating a
// new one. Use errors.Is(err, store.ErrMeetingAlreadyActive) to branch.
var ErrMeetingAlreadyActive = errors.New("meeting already active in this channel")

// ActiveMeeting is per-channel state for a running OpenTalk meeting.
// Tokens are NOT stored here – ticket/resumption are short-lived and live
// only in the originating webapp tab. EnableSIP plus DialIn-Info are cached
// so the custom-post can show dial-in details without re-querying OpenTalk.
type ActiveMeeting struct {
	ChannelID     string    `json:"channel_id"`
	RoomID        string    `json:"room_id"`
	InviteCode    string    `json:"invite_code"`
	HostUserID    string    `json:"host_user_id"`
	PostID        string    `json:"post_id"`
	CreatedAt     time.Time `json:"created_at"`
	LastHeartbeat time.Time `json:"last_heartbeat"`
	EnableSIP     bool      `json:"enable_sip"`
	DialInNumber  string    `json:"dial_in_number,omitempty"`
	DialInPIN     string    `json:"dial_in_pin,omitempty"`

	// HostHeartbeatReceived flips to true the first time any participant's
	// webapp reports a heartbeat against this meeting. Until then (e.g. a
	// mobile-only host) the reaper grants a longer initial grace before reaping.
	HostHeartbeatReceived bool `json:"host_heartbeat_received,omitempty"`
}

func meetingKey(channelID string) string {
	return "meeting_" + channelID
}

// decodeActiveMeeting decrypts then unmarshals, falling back to treating raw
// as plaintext JSON when decryption fails. This keeps unencrypted records
// (tests store with a nil key) readable. Production records are always
// AES-GCM, so a record that fails BOTH paths -- e.g. ciphertext under a
// rotated TokenEncryptionKey -- surfaces as an error the caller treats as an
// orphan. It is NOT a key-rotation recovery path: rotating the key makes live
// records undecodable, not plaintext-readable.
func decodeActiveMeeting(encKey, raw []byte) (*ActiveMeeting, error) {
	if plain, dErr := crypto.Decrypt(encKey, raw); dErr == nil {
		raw = plain
	}
	var am ActiveMeeting
	if err := json.Unmarshal(raw, &am); err != nil {
		return nil, fmt.Errorf("unmarshal ActiveMeeting: %w", err)
	}
	return &am, nil
}

func encodeActiveMeeting(encKey []byte, am *ActiveMeeting) ([]byte, error) {
	raw, err := json.Marshal(am)
	if err != nil {
		return nil, fmt.Errorf("marshal ActiveMeeting: %w", err)
	}
	return crypto.Encrypt(encKey, raw)
}

func (s *Store) SaveActiveMeeting(encKey []byte, am *ActiveMeeting) error {
	value, err := encodeActiveMeeting(encKey, am)
	if err != nil {
		return err
	}
	return s.Set(meetingKey(am.ChannelID), value, 0)
}

// CreateActiveMeetingAtomic persists am only if no meeting exists for the
// same channel. Returns ErrMeetingAlreadyActive when another node won the
// race. The Mattermost KV CAS guarantees this even across cluster nodes.
func (s *Store) CreateActiveMeetingAtomic(encKey []byte, am *ActiveMeeting) error {
	value, err := encodeActiveMeeting(encKey, am)
	if err != nil {
		return err
	}
	ok, appErr := s.api.KVSetWithOptions(meetingKey(am.ChannelID), value, model.PluginKVSetOptions{
		Atomic:   true,
		OldValue: nil,
	})
	if appErr != nil {
		return appErr
	}
	if !ok {
		return ErrMeetingAlreadyActive
	}
	return nil
}

func (s *Store) LoadActiveMeeting(encKey []byte, channelID string) (*ActiveMeeting, error) {
	raw, err := s.Get(meetingKey(channelID))
	if err != nil {
		return nil, err
	}
	return decodeActiveMeeting(encKey, raw)
}

// LoadActiveMeetingRaw also returns the stored ciphertext, for callers that
// need it as the compare-and-set precondition of a later conditional write.
func (s *Store) LoadActiveMeetingRaw(encKey []byte, channelID string) (*ActiveMeeting, []byte, error) {
	raw, err := s.Get(meetingKey(channelID))
	if err != nil {
		return nil, nil, err
	}
	am, dErr := decodeActiveMeeting(encKey, raw)
	if dErr != nil {
		return nil, nil, dErr
	}
	return am, raw, nil
}

// SaveActiveMeetingCAS writes am only if the stored value still equals prev
// (the ciphertext previously read). Returns false when the record changed or
// was deleted meanwhile, so a heartbeat cannot resurrect a meeting that end/
// dismiss/reaper deleted concurrently.
func (s *Store) SaveActiveMeetingCAS(encKey []byte, am *ActiveMeeting, prev []byte) (bool, error) {
	value, err := encodeActiveMeeting(encKey, am)
	if err != nil {
		return false, err
	}
	ok, appErr := s.api.KVSetWithOptions(meetingKey(am.ChannelID), value, model.PluginKVSetOptions{
		Atomic:   true,
		OldValue: prev,
	})
	if appErr != nil {
		return false, appErr
	}
	return ok, nil
}

func (s *Store) DeleteActiveMeeting(channelID string) error {
	return s.Delete(meetingKey(channelID))
}

// ListActiveMeetings enumerates every meeting_<channelID> KV entry by paging
// through KVList. Records that no longer decode under the current encryption
// key (e.g. after a TokenEncryptionKey change) are deleted as orphans:
// leaving them would brick the channel forever, since LoadActiveMeeting can
// no longer read them and CreateActiveMeetingAtomic's CAS keeps failing on
// the stale key.
func (s *Store) ListActiveMeetings(encKey []byte) ([]*ActiveMeeting, error) {
	out := make([]*ActiveMeeting, 0, 8)
	page := 0
	const perPage = 200
	for {
		keys, appErr := s.api.KVList(page, perPage)
		if appErr != nil {
			return out, appErr
		}
		if len(keys) == 0 {
			break
		}
		for _, k := range keys {
			if !strings.HasPrefix(k, "meeting_") {
				continue
			}
			raw, err := s.Get(k)
			if err != nil {
				continue
			}
			am, dErr := decodeActiveMeeting(encKey, raw)
			if dErr != nil {
				_ = s.api.KVDelete(k)
				s.api.LogWarn("[opentalk] deleted undecodable ActiveMeeting orphan", "key", k, "err", dErr.Error())
				continue
			}
			out = append(out, am)
		}
		if len(keys) < perPage {
			break
		}
		page++
	}
	return out, nil
}

func dismissalKey(channelID, roomID string) string {
	return "dismiss_" + channelID + "_" + roomID
}

// AddDismissal records that mmUserID has dismissed the call in
// (channelID, roomID) and returns the full updated set. The read-modify-write
// runs under a compare-and-set retry loop so concurrent dismissals (different
// users, possibly on different cluster nodes) cannot clobber each other and
// lose a member from the set -- which would break the all-declined -> MISSED
// flip.
func (s *Store) AddDismissal(channelID, roomID, mmUserID string) ([]string, error) {
	key := dismissalKey(channelID, roomID)
	ttl := int64((1 * time.Hour).Seconds())
	const maxAttempts = 5
	for range maxAttempts {
		oldRaw, appErr := s.api.KVGet(key)
		if appErr != nil {
			return nil, appErr
		}
		var set []string
		if oldRaw != nil {
			if err := json.Unmarshal(oldRaw, &set); err != nil {
				return nil, err
			}
		}
		if slices.Contains(set, mmUserID) {
			return set, nil
		}
		next := append(append([]string(nil), set...), mmUserID)
		raw, err := json.Marshal(next)
		if err != nil {
			return nil, err
		}
		ok, appErr := s.api.KVSetWithOptions(key, raw, model.PluginKVSetOptions{
			Atomic:          true,
			OldValue:        oldRaw,
			ExpireInSeconds: ttl,
		})
		if appErr != nil {
			return nil, appErr
		}
		if ok {
			return next, nil
		}
	}
	return nil, fmt.Errorf("AddDismissal: CAS contention on %s", key)
}

// DeleteDismissals removes the dismissal set for (channelID, roomID).
func (s *Store) DeleteDismissals(channelID, roomID string) error {
	return s.Delete(dismissalKey(channelID, roomID))
}
