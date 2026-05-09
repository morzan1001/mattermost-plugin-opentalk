# Mobile Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the OpenTalk plugin usable on the official Mattermost mobile app by enriching the bot meeting post with Slack-style attachments (server-side only), adding two post-action endpoints, and giving mobile-started meetings a 30-minute reaper grace before the first webapp heartbeat.

**Architecture:** Strictly additive on the server. The webapp keeps owning the rich card via `registerPostTypeComponent`; mobile renders the new `props.attachments` because unknown post types fall through to default body rendering. No webapp changes. No new configuration.

**Tech Stack:** Go 1.x server-side. `github.com/mattermost/mattermost/server/public/model` (Slack-attachment + post-action types). `github.com/stretchr/testify` for tests. `github.com/mattermost/mattermost/server/public/plugin/plugintest` for API mocks. Build wrapped in `bash -lc` because the Go toolchain only resolves on a login shell in this sandbox.

Spec: [docs/superpowers/specs/2026-05-09-mobile-handoff-design.md](../specs/2026-05-09-mobile-handoff-design.md)

---

## File-touch map

| Path | Responsibility |
| --- | --- |
| `server/store/meeting.go` | Add `HostHeartbeatReceived bool` JSON field to `ActiveMeeting`. |
| `server/store/meeting_test.go` | Cover round-trip including the new field. |
| `server/post/meeting_post.go` | Build `props.attachments` (one Slack attachment) in `BuildMeetingPost`; rebuild on `ApplyEndedStatus` and `ApplyMissedStatus`. New `isDM` parameter on `BuildMeetingPost`. New unexported helper `buildAttachment(am, frontendURL, hostName, locale, isDM, status)` that returns `[]*model.SlackAttachment`. |
| `server/post/meeting_post_test.go` | Cover attachment shape per status (STARTED-channel, STARTED-DM, ENDED, MISSED). |
| `server/plugin.go` | `CreateMeeting`: pass `isDM` into `BuildMeetingPost`. ServeHTTP `Handlers` block: add new `IsDMChannel` callback. Heartbeat-flag wiring lives in the heartbeat handler (next row), not here. |
| `server/http/handlers.go` *(new)* | Move the `Handlers` struct definition out of `oauth.go` into a dedicated file alongside the post-action shared helpers. `oauth.go` keeps only the OAuth handlers. (Cosmetic split — same package, no API change.) |
| `server/http/meetings.go` | Pass `isDM` into `BuildMeetingPost` via `h.IsDMChannel(channelID)`. New `MeetingsPostActionEnd` and `MeetingsPostActionDismiss` handlers. New `Handlers.IsDMChannel func(channelID string) bool` field. After `MeetingsHeartbeat` saves successfully, set `HostHeartbeatReceived = true` on first heartbeat. |
| `server/http/meetings_test.go` | Cover post-action handlers (auth, host gate on end, response shape, update-post round-trip). Cover heartbeat-sets-flag once. |
| `server/http/http.go` | Register two new POST routes: `/api/v1/meetings/post-action/end`, `/api/v1/meetings/post-action/dismiss`. |
| `server/reaper/reaper.go` | Apply 30-minute pre-heartbeat grace branch in `tick()`. Constant `preHeartbeatGrace = 30 * time.Minute` in package scope. |
| `server/reaper/reaper_test.go` | New cases: pre-heartbeat fresh (keep), pre-heartbeat stale (kill), post-heartbeat fresh (keep), post-heartbeat stale (kill). |
| `server/i18n/i18n.go` | No structural change — call sites declare `Translatable{DE, EN}` inline. |
| `server/command/help.go` | Append a "Mobile" section to the help string in DE and EN. |
| `server/command/help_test.go` | Assert the new section appears (DE and EN). |

---

## Task 1: Add `HostHeartbeatReceived` field to `ActiveMeeting`

**Files:**
- Modify: `server/store/meeting.go` (struct around line 21)
- Modify: `server/store/meeting_test.go`

- [ ] **Step 1.1: Write the failing test**

Open `server/store/meeting_test.go` and replace the body of `TestActiveMeeting_RoundTrip` (currently around line 13) with:

```go
func TestActiveMeeting_RoundTrip(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVSetWithExpiry", mock.Anything, mock.Anything, mock.AnythingOfType("int64")).Return(nil)
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil).Once()

	s := New(api)
	am := &ActiveMeeting{
		ChannelID:             "ch-1",
		RoomID:                "room-1",
		InviteCode:            "inv-1",
		HostUserID:            "host-uid",
		PostID:                "post-1",
		CreatedAt:             time.Date(2026, 5, 5, 18, 0, 0, 0, time.UTC),
		LastHeartbeat:         time.Date(2026, 5, 5, 18, 1, 0, 0, time.UTC),
		EnableSIP:             true,
		DialInNumber:          "+49 30 555 1234",
		DialInPIN:             "4242",
		HostHeartbeatReceived: true,
	}

	// Capture the bytes that SaveActiveMeeting writes, then re-feed them on KVGet.
	var written []byte
	api.ExpectedCalls = nil
	api.On("KVSetWithExpiry", "meeting_ch-1", mock.AnythingOfType("[]uint8"), mock.AnythingOfType("int64")).
		Run(func(args mock.Arguments) { written = args.Get(1).([]byte) }).
		Return(nil)
	api.On("KVGet", "meeting_ch-1").Return(func() []byte { return written }, nil)

	require.NoError(t, s.SaveActiveMeeting(am))

	got, err := s.LoadActiveMeeting("ch-1")
	require.NoError(t, err)
	assert.Equal(t, am.HostHeartbeatReceived, got.HostHeartbeatReceived,
		"HostHeartbeatReceived must round-trip through JSON")
}
```

(Imports may need `"github.com/mattermost/mattermost/server/public/plugin/plugintest"` and `"github.com/stretchr/testify/mock"` if they aren't already in the test file.)

- [ ] **Step 1.2: Run the test and verify it fails**

```bash
bash -lc 'go test ./server/store/... -run TestActiveMeeting_RoundTrip -v'
```

Expected: FAIL with `unknown field 'HostHeartbeatReceived' in struct literal`.

- [ ] **Step 1.3: Add the field**

In `server/store/meeting.go`, modify the `ActiveMeeting` struct:

```go
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

	// HostHeartbeatReceived flips to true the first time the host's webapp
	// reports a heartbeat against this meeting. Mobile-only hosts never set
	// it; the reaper grants them a longer initial grace before reaping.
	HostHeartbeatReceived bool `json:"host_heartbeat_received,omitempty"`
}
```

- [ ] **Step 1.4: Run the test and verify it passes**

```bash
bash -lc 'go test ./server/store/... -run TestActiveMeeting_RoundTrip -v'
```

Expected: PASS.

- [ ] **Step 1.5: Run the full store test package as a regression check**

```bash
bash -lc 'go test ./server/store/...'
```

Expected: PASS.

- [ ] **Step 1.6: Commit**

```bash
git add server/store/meeting.go server/store/meeting_test.go
git commit -m "$(cat <<'EOF'
feat(server): track HostHeartbeatReceived on ActiveMeeting

Used by the reaper to give mobile-only hosts a longer initial grace
before the first webapp heartbeat arrives.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Reaper grants pre-heartbeat grace

**Files:**
- Modify: `server/reaper/reaper.go`
- Modify: `server/reaper/reaper_test.go`

- [ ] **Step 2.1: Write the failing tests**

Append to `server/reaper/reaper_test.go`:

```go
// TestRunOnce_PreHeartbeat_Fresh_NotEnded covers the case where no webapp
// heartbeat has been received yet and the meeting is younger than the
// pre-heartbeat grace window — must NOT be ended.
func TestRunOnce_PreHeartbeat_Fresh_NotEnded(t *testing.T) {
	young := &store.ActiveMeeting{
		ChannelID:             "ch-young",
		RoomID:                "room-young",
		CreatedAt:             time.Now().UTC().Add(-2 * time.Minute), // 2m old
		LastHeartbeat:         time.Now().UTC().Add(-2 * time.Minute), // matches CreatedAt at creation
		HostHeartbeatReceived: false,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{young})

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	assert.Empty(t, ended, "young meeting without heartbeat must survive")
}

// TestRunOnce_PreHeartbeat_OldEnough_Ended covers the case where no webapp
// heartbeat has been received and the meeting is older than the pre-heartbeat
// grace window — must be ended.
func TestRunOnce_PreHeartbeat_OldEnough_Ended(t *testing.T) {
	stale := &store.ActiveMeeting{
		ChannelID:             "ch-old",
		RoomID:                "room-old",
		CreatedAt:             time.Now().UTC().Add(-31 * time.Minute), // older than 30m grace
		LastHeartbeat:         time.Now().UTC().Add(-31 * time.Minute),
		HostHeartbeatReceived: false,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{stale})
	api.On("LogInfo",
		mock.AnythingOfType("string"),
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
		mock.Anything, mock.Anything,
	).Return()

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	require.Len(t, ended, 1)
	assert.Equal(t, "ch-old", ended[0].ChannelID)
}

// TestRunOnce_PostHeartbeat_FreshHeartbeat_NotEnded covers a meeting where
// the webapp has heartbeat at least once and the heartbeat is recent — the
// existing 5-minute staleness path must keep it alive even if CreatedAt is old.
func TestRunOnce_PostHeartbeat_FreshHeartbeat_NotEnded(t *testing.T) {
	old := &store.ActiveMeeting{
		ChannelID:             "ch-active",
		RoomID:                "room-active",
		CreatedAt:             time.Now().UTC().Add(-2 * time.Hour), // very old
		LastHeartbeat:         time.Now().UTC(),                     // beat just now
		HostHeartbeatReceived: true,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{old})

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	assert.Empty(t, ended, "actively-heartbeating meeting must not be ended")
}
```

- [ ] **Step 2.2: Run and verify they fail**

```bash
bash -lc 'go test ./server/reaper/... -run "TestRunOnce_PreHeartbeat|TestRunOnce_PostHeartbeat_Fresh" -v'
```

Expected: `TestRunOnce_PreHeartbeat_Fresh_NotEnded` fails (currently the existing logic kills any meeting whose `LastHeartbeat` is older than 5 min, and 2m old with a 2m-old heartbeat actually still survives... let's verify: with `staleness=5m`, `LastHeartbeat=2m ago` → cutoff is `now-5m`; `2m ago` is AFTER `now-5m` → not stale. So this test PASSES even on the unchanged code). The truly failing test is `TestRunOnce_PreHeartbeat_OldEnough_Ended` — wait, in the unchanged code, with `staleness=5m` and `LastHeartbeat=31m ago`, the meeting IS stale and IS ended → test PASSES on unchanged code too.

Realisation: the current behaviour already satisfies these scenarios because they piggy-back on `LastHeartbeat`. To actually exercise the grace branch, the test must distinguish a case where the **current** code would kill but the **new** code must keep. That happens when:

- `HostHeartbeatReceived=false`
- `LastHeartbeat` is older than the 5-minute staleness window
- `CreatedAt` is younger than the 30-minute grace window

So replace the test for the "fresh" case with this stricter version that fails on current code:

```go
func TestRunOnce_PreHeartbeat_StaleByOldRule_KeptByGrace(t *testing.T) {
	// Heartbeat is 10 min old → would be ended by the existing 5-min staleness
	// rule. But the host has never sent a heartbeat AND the meeting is only
	// 10 min old → grace branch must keep it.
	now := time.Now().UTC()
	young := &store.ActiveMeeting{
		ChannelID:             "ch-grace",
		RoomID:                "room-grace",
		CreatedAt:             now.Add(-10 * time.Minute),
		LastHeartbeat:         now.Add(-10 * time.Minute),
		HostHeartbeatReceived: false,
	}

	api := setupAPIWithMeetings(t, []*store.ActiveMeeting{young})

	s := store.New(api)
	var ended []*store.ActiveMeeting
	r := New(api, s, func(am *store.ActiveMeeting) { ended = append(ended, am) },
		time.Minute, 5*time.Minute)

	r.RunOnce()

	assert.Empty(t, ended,
		"pre-heartbeat meeting under the 30-min grace must not be ended even though LastHeartbeat is older than the 5-min staleness")
}
```

(Replace the earlier `TestRunOnce_PreHeartbeat_Fresh_NotEnded` with this one. Keep the `OldEnough_Ended` and `PostHeartbeat_Fresh_NotEnded` cases as-is.)

Re-run:

```bash
bash -lc 'go test ./server/reaper/... -run "TestRunOnce_PreHeartbeat|TestRunOnce_PostHeartbeat_Fresh" -v'
```

Expected: `TestRunOnce_PreHeartbeat_StaleByOldRule_KeptByGrace` FAILs ("expected empty, got 1 ended") with the unchanged reaper.

- [ ] **Step 2.3: Implement the grace branch**

Replace `tick()` in `server/reaper/reaper.go` with:

```go
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
```

Place `const preHeartbeatGrace` at file scope above `tick`.

- [ ] **Step 2.4: Run reaper tests and verify they pass**

```bash
bash -lc 'go test ./server/reaper/... -v'
```

Expected: PASS, including the new cases AND the existing `TestRunOnce_StaleMeeting_Ended` (its `HostHeartbeatReceived` defaults to `false`; with `LastHeartbeat=10m ago` and `CreatedAt=zero-value` (year 1) the grace branch would kick in — wait, that's a problem).

Look at `TestRunOnce_StaleMeeting_Ended` and `TestRunOnce_MixedMeetings_OnlyStaleEnded` in the existing file: both create meetings with no `CreatedAt` set, defaulting to `time.Time{}` (year 1). Under the new code those meetings have `HostHeartbeatReceived=false` and `CreatedAt=time.Time{}`, which is far older than `graceCutoff` → reaper still ends them. **Existing tests stay green.**

Verify by re-running:

```bash
bash -lc 'go test ./server/reaper/... -v'
```

Expected: PASS for all existing + new cases.

- [ ] **Step 2.5: Commit**

```bash
git add server/reaper/reaper.go server/reaper/reaper_test.go
git commit -m "$(cat <<'EOF'
feat(server): reaper grants 30-min grace before first webapp heartbeat

Mobile-started meetings never receive a webapp heartbeat. Under the old
rule the 5-minute staleness window killed them. The new branch keeps a
meeting alive until 30 minutes past CreatedAt as long as no webapp has
ever heartbeat against it; once a heartbeat arrives, the existing
5-minute regime takes over.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Heartbeat handler flips `HostHeartbeatReceived` once

**Files:**
- Modify: `server/http/meetings.go` (`MeetingsHeartbeat`, around line 387)
- Modify: `server/http/meetings_test.go`

- [ ] **Step 3.1: Write the failing test**

Append to `server/http/meetings_test.go`:

```go
// TestMeetingsHeartbeat_FlipsHostHeartbeatReceivedOnFirstCall verifies that
// the heartbeat handler flips HostHeartbeatReceived to true on the first
// successful host call and persists the meeting back to KV.
func TestMeetingsHeartbeat_FlipsHostHeartbeatReceived(t *testing.T) {
	api := &plugintest.API{}

	am := &store.ActiveMeeting{
		ChannelID:             "ch-1",
		RoomID:                "room-1",
		HostUserID:            "host-uid",
		CreatedAt:             time.Now().UTC().Add(-1 * time.Minute),
		LastHeartbeat:         time.Now().UTC().Add(-1 * time.Minute),
		HostHeartbeatReceived: false,
	}
	stored, err := json.Marshal(am)
	require.NoError(t, err)
	api.On("KVGet", "meeting_ch-1").Return(stored, nil)

	var saved []byte
	api.On("KVSetWithExpiry", "meeting_ch-1", mock.AnythingOfType("[]uint8"), mock.AnythingOfType("int64")).
		Run(func(args mock.Arguments) { saved = args.Get(1).([]byte) }).
		Return(nil)

	h := &Handlers{Store: store.New(api)}

	body, _ := json.Marshal(map[string]string{"channel_id": "ch-1"})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/heartbeat", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "host-uid")
	rr := httptest.NewRecorder()
	h.MeetingsHeartbeat(rr, req)

	assert.Equal(t, nethttp.StatusNoContent, rr.Code)

	var got store.ActiveMeeting
	require.NoError(t, json.Unmarshal(saved, &got))
	assert.True(t, got.HostHeartbeatReceived,
		"first host heartbeat must flip the flag")
	assert.False(t, got.LastHeartbeat.IsZero(), "LastHeartbeat must be advanced")
}
```

(Imports may need `"bytes"`, `"net/http/httptest"`, `"encoding/json"`, `"github.com/mattermost/mattermost/server/public/plugin/plugintest"`, `"github.com/stretchr/testify/mock"`. Most are already present in the test file.)

- [ ] **Step 3.2: Run and verify it fails**

```bash
bash -lc 'go test ./server/http/... -run TestMeetingsHeartbeat_FlipsHostHeartbeatReceived -v'
```

Expected: FAIL — `got.HostHeartbeatReceived` is `false` because the current handler doesn't set it.

- [ ] **Step 3.3: Modify `MeetingsHeartbeat`**

In `server/http/meetings.go`, around line 419 (`am.LastHeartbeat = time.Now().UTC()`), expand the assignment so the flag flips:

```go
	am.LastHeartbeat = time.Now().UTC()
	am.HostHeartbeatReceived = true
	if sErr := h.Store.SaveActiveMeeting(am); sErr != nil {
		nethttp.Error(w, "save heartbeat: "+sErr.Error(), nethttp.StatusInternalServerError)
		return
	}
```

(Setting the bool unconditionally is cheap and idempotent — once true it stays true.)

- [ ] **Step 3.4: Run and verify it passes**

```bash
bash -lc 'go test ./server/http/... -run TestMeetingsHeartbeat -v'
```

Expected: PASS for the new test and any existing heartbeat tests.

- [ ] **Step 3.5: Commit**

```bash
git add server/http/meetings.go server/http/meetings_test.go
git commit -m "$(cat <<'EOF'
feat(server): heartbeat handler flips HostHeartbeatReceived

First successful host heartbeat moves the meeting out of the reaper's
pre-heartbeat grace window into the existing 5-minute staleness regime.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Build Slack attachment for STARTED status (channel)

**Files:**
- Modify: `server/post/meeting_post.go`
- Modify: `server/post/meeting_post_test.go`

- [ ] **Step 4.1: Write the failing test**

Append to `server/post/meeting_post_test.go`:

```go
// TestBuildMeetingPost_AttachmentSTARTED_Channel verifies that a non-DM
// meeting post carries one Slack attachment with the join markdown link,
// an "End meeting" action button, and NO "Decline" action.
func TestBuildMeetingPost_AttachmentSTARTED_Channel(t *testing.T) {
	am := &store.ActiveMeeting{
		ChannelID:    "ch-1",
		RoomID:       "room-1",
		InviteCode:   "inv-1",
		HostUserID:   "host-uid",
		CreatedAt:    time.Date(2026, 5, 5, 18, 0, 0, 0, time.UTC),
		EnableSIP:    true,
		DialInNumber: "+49 30 555 1234",
		DialInPIN:    "4242",
	}

	post := BuildMeetingPost(am, "https://opentalk.example", "alice", "en", false)
	rawAtt := post.GetProp("attachments")
	require.NotNil(t, rawAtt, "post.props.attachments must be populated")

	atts, ok := rawAtt.([]*model.SlackAttachment)
	require.True(t, ok, "attachments must be []*model.SlackAttachment, got %T", rawAtt)
	require.Len(t, atts, 1)

	att := atts[0]
	assert.Equal(t, "#1e88e5", att.Color)
	assert.NotEmpty(t, att.Title)
	assert.Contains(t, att.Text, "https://opentalk.example/invite/inv-1",
		"attachment text must include the join URL as a markdown link")
	assert.Contains(t, att.Text, "[", "join URL must be wrapped in markdown link syntax")
	assert.Contains(t, att.Text, "+49 30 555 1234", "dial-in number must appear when EnableSIP")
	assert.Contains(t, att.Text, "4242", "dial-in PIN must appear when EnableSIP")

	require.Len(t, att.Actions, 1, "channel post: only End meeting button, no Decline")
	endAction := att.Actions[0]
	assert.Equal(t, "end", endAction.Id)
	assert.Equal(t, "button", endAction.Type)
	assert.NotNil(t, endAction.Integration)
	assert.Contains(t, endAction.Integration.URL, "/api/v1/meetings/post-action/end",
		"End button must point at the post-action endpoint")
	assert.Equal(t, "ch-1", endAction.Integration.Context["channel_id"])
}
```

(Imports: add `"github.com/mattermost/mattermost/server/public/model"` and `"github.com/stretchr/testify/require"` if missing.)

The existing `TestBuildMeetingPost_Initial` (top of file) calls `BuildMeetingPost(am, frontendURL, "alice", "")` with 4 args. The new signature is 5 args (`isDM` last). Update the call sites in the file:

- `TestBuildMeetingPost_Initial`: change last argument from `""` to `"", false`.
- `TestBuildMeetingPost_LocaleDE`: both `BuildMeetingPost` calls — append `, false` (DE locale → channel).
- `TestBuildMeetingPost_NoSIPLeavesDialInProps`: append `, false`.
- `TestApplyEndedStatus_UpdatesProps`: append `, false`.
- `TestApplyMissedStatus_SetsStatus`: append `, false`.

- [ ] **Step 4.2: Run and verify it fails**

```bash
bash -lc 'go test ./server/post/... -run TestBuildMeetingPost_AttachmentSTARTED_Channel -v'
```

Expected: FAIL — compilation error because `BuildMeetingPost` takes 4 args, not 5. (After we change the signature in 4.3 the failure will become "attachments must be populated".)

- [ ] **Step 4.3: Add the attachment builder and update the signature**

Replace the body of `server/post/meeting_post.go` with:

```go
// Package post owns the Mattermost-Post-Type used by the plugin to render
// in-channel meeting cards. The server constructs the post via the Bot user;
// the webapp registers a custom React component to render it. The same post
// also carries a Slack-style attachment so clients without a custom-post
// renderer (mattermost-mobile, ad-hoc viewers) get a usable card with a
// join link and action buttons.
package post

import (
	"fmt"
	"time"

	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

// MeetingPostType is the Post.Type value the webapp registers a renderer for.
const MeetingPostType = "custom_opentalk_meeting"

// PostActionPathEnd / PostActionPathDismiss are the relative plugin URLs the
// attachment action buttons POST to. They live here so meeting_post.go owns
// the mapping; http.NewRouter binds them to handlers.
const (
	PostActionPathEnd     = "/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings/post-action/end"
	PostActionPathDismiss = "/plugins/com.github.morzan1001.mattermost-plugin-opentalk/api/v1/meetings/post-action/dismiss"
)

// BuildMeetingPost constructs the initial bot-authored post for a freshly
// created meeting. The Message field is plain text including the join URL —
// the universal fallback. props.attachments carries a richer Slack-style
// card for clients that render attachments (mattermost-mobile). The webapp
// suppresses the attachment via its custom-post renderer.
//
// isDM is true for direct or group channels; controls whether the "Decline"
// action is emitted on the attachment.
func BuildMeetingPost(am *store.ActiveMeeting, frontendURL, hostUsername, locale string, isDM bool) *model.Post {
	inviteURL := fmt.Sprintf("%s/invite/%s", frontendURL, am.InviteCode)
	msg := fmt.Sprintf(i18n.T(locale, i18n.Translatable{
		DE: "OpenTalk-Meeting gestartet — beitreten: %s",
		EN: "OpenTalk meeting started — join: %s",
	}), inviteURL)

	props := model.StringInterface{
		"room_id":       am.RoomID,
		"invite_code":   am.InviteCode,
		"host_user_id":  am.HostUserID,
		"host_username": hostUsername,
		"frontend_url":  frontendURL,
		"status":        "STARTED",
		"started_at":    am.CreatedAt.Unix(),
	}
	if am.EnableSIP {
		if am.DialInNumber != "" {
			props["dial_in_number"] = am.DialInNumber
		}
		if am.DialInPIN != "" {
			props["dial_in_pin"] = am.DialInPIN
		}
	}
	props["attachments"] = buildAttachment(am, frontendURL, hostUsername, locale, isDM, "STARTED")

	return &model.Post{
		ChannelId: am.ChannelID,
		Message:   msg,
		Type:      MeetingPostType,
		Props:     props,
	}
}

// buildAttachment constructs the single Slack attachment that travels with
// every meeting post. The shape varies by status:
//
//   STARTED: blue, join link in body, End meeting (always), Decline (DM only)
//   ENDED:   grey, ended-at + duration, no actions
//   MISSED:  grey, missed-call from host, no actions
func buildAttachment(am *store.ActiveMeeting, frontendURL, hostUsername, locale string, isDM bool, status string) []*model.SlackAttachment {
	switch status {
	case "ENDED":
		// In the BuildMeetingPost initial-call path the meeting is never
		// ENDED; this branch is only reached from rebuildAttachmentForStatus
		// where the timestamp is supplied via the post props, not via am.
		// Building "now" here is a safe fallback if the helper is ever
		// invoked directly.
		endedAt := time.Now().UTC()
		title := i18n.T(locale, i18n.Translatable{
			DE: "OpenTalk-Meeting (beendet)",
			EN: "OpenTalk meeting (ended)",
		})
		text := i18n.T(locale, i18n.Translatable{
			DE: fmt.Sprintf("Beendet um %s.", endedAt.Format("15:04")),
			EN: fmt.Sprintf("Ended at %s.", endedAt.Format("15:04")),
		})
		return []*model.SlackAttachment{{
			Title: title,
			Text:  text,
			Color: "#9e9e9e",
		}}

	case "MISSED":
		title := i18n.T(locale, i18n.Translatable{
			DE: "OpenTalk-Meeting (verpasst)",
			EN: "OpenTalk meeting (missed)",
		})
		text := i18n.T(locale, i18n.Translatable{
			DE: fmt.Sprintf("Verpasster Anruf von %s.", hostUsername),
			EN: fmt.Sprintf("Missed call from %s.", hostUsername),
		})
		return []*model.SlackAttachment{{
			Title: title,
			Text:  text,
			Color: "#9e9e9e",
		}}
	}

	// STARTED (default).
	inviteURL := fmt.Sprintf("%s/invite/%s", frontendURL, am.InviteCode)
	startedAt := am.CreatedAt
	if startedAt.IsZero() {
		startedAt = time.Now().UTC()
	}

	title := i18n.T(locale, i18n.Translatable{
		DE: "OpenTalk-Meeting",
		EN: "OpenTalk meeting",
	})

	hostLine := i18n.T(locale, i18n.Translatable{
		DE: fmt.Sprintf("Host: %s", hostUsername),
		EN: fmt.Sprintf("Host: %s", hostUsername),
	})
	startedLine := i18n.T(locale, i18n.Translatable{
		DE: fmt.Sprintf("Gestartet um %s", startedAt.Format("15:04")),
		EN: fmt.Sprintf("Started at %s", startedAt.Format("15:04")),
	})
	joinLine := i18n.T(locale, i18n.Translatable{
		DE: fmt.Sprintf("[Meeting beitreten](%s)", inviteURL),
		EN: fmt.Sprintf("[Join meeting](%s)", inviteURL),
	})

	body := hostLine + "\n" + startedLine
	if am.EnableSIP && (am.DialInNumber != "" || am.DialInPIN != "") {
		dialLine := i18n.T(locale, i18n.Translatable{
			DE: fmt.Sprintf("Einwahl: %s · PIN %s", am.DialInNumber, am.DialInPIN),
			EN: fmt.Sprintf("Dial-in: %s · PIN %s", am.DialInNumber, am.DialInPIN),
		})
		body += "\n" + dialLine
	}
	body += "\n\n" + joinLine

	endLabel := i18n.T(locale, i18n.Translatable{
		DE: "Meeting beenden",
		EN: "End meeting",
	})
	declineLabel := i18n.T(locale, i18n.Translatable{
		DE: "Ablehnen",
		EN: "Decline",
	})

	actions := []*model.PostAction{{
		Id:    "end",
		Name:  endLabel,
		Type:  model.PostActionTypeButton,
		Style: "danger",
		Integration: &model.PostActionIntegration{
			URL: PostActionPathEnd,
			Context: map[string]any{
				"channel_id": am.ChannelID,
				"room_id":    am.RoomID,
			},
		},
	}}
	if isDM {
		actions = append(actions, &model.PostAction{
			Id:   "dismiss",
			Name: declineLabel,
			Type: model.PostActionTypeButton,
			Integration: &model.PostActionIntegration{
				URL: PostActionPathDismiss,
				Context: map[string]any{
					"channel_id": am.ChannelID,
					"room_id":    am.RoomID,
				},
			},
		})
	}

	return []*model.SlackAttachment{{
		Title:   title,
		Text:    body,
		Color:   "#1e88e5",
		Actions: actions,
	}}
}

// ApplyEndedStatus mutates an existing meeting-post in place to mark the
// meeting as ended. The caller is responsible for calling pluginapi.Post.Update.
func ApplyEndedStatus(p *model.Post, endedAt time.Time) {
	startedAtRaw := p.GetProp("started_at")
	var duration int64
	switch v := startedAtRaw.(type) {
	case int64:
		duration = endedAt.Unix() - v
	case float64:
		duration = endedAt.Unix() - int64(v)
	}
	p.AddProp("status", "ENDED")
	p.AddProp("ended_at", endedAt.Unix())
	p.AddProp("duration_seconds", duration)

	rebuildAttachmentForStatus(p, "ENDED", endedAt, duration)
}

// ApplyMissedStatus mutates the post in place to reflect a "missed" custom-
// post-status (DM call where all recipients declined or timed out).
func ApplyMissedStatus(p *model.Post, when time.Time) {
	if p.Props == nil {
		p.Props = model.StringInterface{}
	}
	p.AddProp("status", "MISSED")
	p.AddProp("ended_at", when.Unix())

	rebuildAttachmentForStatus(p, "MISSED", when, 0)
}

// rebuildAttachmentForStatus rewrites props.attachments to a status-appropriate
// shape. Reads host_username off the post props for the MISSED text. Locale
// is not preserved on the post — the channel-locale at update time is unknown
// — so the rebuilt attachment renders in English. Acceptable degradation.
func rebuildAttachmentForStatus(p *model.Post, status string, when time.Time, durationSeconds int64) {
	hostUsername, _ := p.GetProp("host_username").(string)

	if status == "ENDED" {
		text := fmt.Sprintf("Ended at %s.", when.Format("15:04"))
		if durationSeconds > 0 {
			h := durationSeconds / 3600
			m := (durationSeconds % 3600) / 60
			s := durationSeconds % 60
			if h > 0 {
				text = fmt.Sprintf("Ended at %s, duration %d:%02d:%02d.", when.Format("15:04"), h, m, s)
			} else {
				text = fmt.Sprintf("Ended at %s, duration %d:%02d.", when.Format("15:04"), m, s)
			}
		}
		p.AddProp("attachments", []*model.SlackAttachment{{
			Title: "OpenTalk meeting (ended)",
			Text:  text,
			Color: "#9e9e9e",
		}})
		return
	}

	// MISSED.
	p.AddProp("attachments", []*model.SlackAttachment{{
		Title: "OpenTalk meeting (missed)",
		Text:  fmt.Sprintf("Missed call from %s.", hostUsername),
		Color: "#9e9e9e",
	}})
}
```

(The `_ = am`, `_ = frontendURL` keep `am`/`frontendURL` references compiling without lint warnings; remove them if `golangci-lint` flags them — they're not required.)

- [ ] **Step 4.4: Update all callers of `BuildMeetingPost` to pass `isDM`**

These call sites also need updating to compile:

- `server/plugin.go:363` — change to `post.BuildMeetingPost(am, cfg.OpenTalkFrontendURL, hostName, hostLocale, false)`. We will set `isDM` correctly in Task 5; for now `false` keeps everything compiling.
- `server/http/meetings.go:120` — change to `post.BuildMeetingPost(am, h.FrontendURL, hostName, hostLocale, false)`. Same temporary-`false`.

- [ ] **Step 4.5: Run and verify the new test passes**

```bash
bash -lc 'go test ./server/post/... -run TestBuildMeetingPost_AttachmentSTARTED_Channel -v'
```

Expected: PASS.

- [ ] **Step 4.6: Run all post tests**

```bash
bash -lc 'go test ./server/post/...'
```

Expected: PASS for all (existing + new).

- [ ] **Step 4.7: Verify the full server still builds**

```bash
bash -lc 'go build ./...'
```

Expected: success — no compile errors.

- [ ] **Step 4.8: Commit**

```bash
git add server/post/meeting_post.go server/post/meeting_post_test.go server/plugin.go server/http/meetings.go
git commit -m "$(cat <<'EOF'
feat(server): emit Slack attachment on meeting post for mobile clients

Attachments only render on Mattermost clients without a custom-post
renderer for our type — i.e. the mobile app. Webapp users continue to
see the rich React component. STARTED carries the join markdown link
and an End-meeting action; ENDED/MISSED rebuild a grey terminal-state
attachment when ApplyEndedStatus/ApplyMissedStatus run.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Pass `isDM` from callers + add `Decline` action on DM attachments

**Files:**
- Modify: `server/plugin.go`
- Modify: `server/http/oauth.go` (Handlers struct)
- Modify: `server/http/meetings.go`
- Modify: `server/post/meeting_post_test.go`
- Modify: `server/http/meetings_test.go`

- [ ] **Step 5.1: Write the failing test for the DM attachment**

Append to `server/post/meeting_post_test.go`:

```go
// TestBuildMeetingPost_AttachmentSTARTED_DM verifies that for a DM channel
// the attachment carries both End and Decline actions, in that order.
func TestBuildMeetingPost_AttachmentSTARTED_DM(t *testing.T) {
	am := &store.ActiveMeeting{
		ChannelID:  "ch-dm",
		RoomID:     "room-dm",
		InviteCode: "inv-dm",
		HostUserID: "host-uid",
	}

	post := BuildMeetingPost(am, "https://opentalk.example", "alice", "en", true)
	rawAtt := post.GetProp("attachments")
	atts, ok := rawAtt.([]*model.SlackAttachment)
	require.True(t, ok)
	require.Len(t, atts, 1)

	att := atts[0]
	require.Len(t, att.Actions, 2, "DM post: End + Decline")
	assert.Equal(t, "end", att.Actions[0].Id)
	assert.Equal(t, "dismiss", att.Actions[1].Id)
	assert.Contains(t, att.Actions[1].Integration.URL, "/api/v1/meetings/post-action/dismiss")
}
```

- [ ] **Step 5.2: Run and verify it passes (no production change yet)**

```bash
bash -lc 'go test ./server/post/... -run TestBuildMeetingPost_AttachmentSTARTED_DM -v'
```

Expected: PASS — the production code from Task 4 already emits the DM action when `isDM=true`. The remaining work is wiring the bool through the call sites.

- [ ] **Step 5.3: Add `IsDMChannel` to `Handlers`**

In `server/http/oauth.go`, expand the `Handlers` struct with one new field. Add it after `ChannelMembersOf`:

```go
	// IsDMChannel returns true if the given channel is a direct or group
	// channel. Used by MeetingsCreate to render the "Decline" action on
	// the bot post's mobile attachment.
	IsDMChannel func(channelID string) bool
```

- [ ] **Step 5.4: Use `IsDMChannel` in `MeetingsCreate`**

In `server/http/meetings.go`, around line 120 in `MeetingsCreate`:

```go
	isDM := false
	if h.IsDMChannel != nil {
		isDM = h.IsDMChannel(body.ChannelID)
	}
	botPost := post.BuildMeetingPost(am, h.FrontendURL, hostName, hostLocale, isDM)
```

- [ ] **Step 5.5: Wire `IsDMChannel` from `Plugin.ServeHTTP`**

In `server/plugin.go` inside the `handlers := &pluginhttp.Handlers{...}` literal (the same place that already sets `ChannelMembersOf`), add:

```go
		IsDMChannel: func(channelID string) bool {
			ch, err := p.API.GetChannel(channelID)
			if err != nil || ch == nil {
				return false
			}
			return ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup
		},
```

- [ ] **Step 5.6: Use `isDM` in `Plugin.CreateMeeting` (slash-command path)**

`Plugin.CreateMeeting` already fetches `ch` a few lines below the `BuildMeetingPost` call. Restructure to fetch `ch` BEFORE the `BuildMeetingPost` call so we can pass `isDM`. In `server/plugin.go`, replace the relevant block (currently around lines 357-372 + 373-) with:

```go
	hostName := mmUserID
	hostLocale := ""
	if u, err := p.API.GetUser(mmUserID); err == nil && u != nil {
		hostName = displayNameOf(u)
		hostLocale = u.Locale
	}

	ch, chErr := p.API.GetChannel(channelID)
	isDM := chErr == nil && ch != nil &&
		(ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup)

	botPost := post.BuildMeetingPost(am, cfg.OpenTalkFrontendURL, hostName, hostLocale, isDM)
	botPost.UserId = p.botUserID
	if err := p.client.Post.CreatePost(botPost); err != nil {
		return nil, fmt.Errorf("post meeting card: %w", err)
	}
	am.PostID = botPost.Id
	if err := p.store.SaveActiveMeeting(am); err != nil {
		return nil, fmt.Errorf("persist meeting (with post_id): %w", err)
	}

	if chErr == nil && ch != nil {
		// (existing block that builds payload + DM push using ch.Type stays here,
		// just delete the inner `ch, chErr := p.API.GetChannel(channelID)` line
		// because we already fetched ch above.)
		payload := map[string]any{
			...
```

(Adapt the existing surrounding code to remove the duplicate `ch, chErr := p.API.GetChannel(channelID)` further down. Read the file before editing to confirm the exact line range.)

- [ ] **Step 5.7: Run and verify all server tests still pass**

```bash
bash -lc 'go test ./server/...'
```

Expected: PASS.

- [ ] **Step 5.8: Commit**

```bash
git add server/plugin.go server/http/oauth.go server/http/meetings.go server/post/meeting_post_test.go
git commit -m "$(cat <<'EOF'
feat(server): wire IsDMChannel through to meeting-post attachment

DM and group channels now get a "Decline" action button alongside
"End meeting" on the bot post's mobile attachment.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `MeetingsPostActionEnd` handler

**Files:**
- Modify: `server/http/meetings.go`
- Modify: `server/http/meetings_test.go`

The handler accepts a `model.PostActionIntegrationRequest`, host-gates against `mmUserID`, and reuses the existing `MeetingsEnd` business logic via a small extracted helper.

- [ ] **Step 6.1: Extract a shared helper from `MeetingsEnd`**

In `server/http/meetings.go`, add a private helper that performs the meeting-end side-effects (post update, KV delete, broadcast). Refactor `MeetingsEnd` to call it:

```go
// endMeetingFor performs the meeting-end side-effects: marks the post ENDED,
// deletes the ActiveMeeting record, broadcasts meeting_ended. Returns the
// updated *model.Post (or nil if the post lookup failed) so callers that
// need it for a post-action response can use it.
func (h *Handlers) endMeetingFor(am *store.ActiveMeeting) (*model.Post, error) {
	var updated *model.Post
	if am.PostID != "" && h.PostGetter != nil && h.PostUpdater != nil {
		if p, getErr := h.PostGetter(am.PostID); getErr == nil && p != nil {
			post.ApplyEndedStatus(p, time.Now().UTC())
			if uErr := h.PostUpdater(p); uErr == nil {
				updated = p
			}
		}
	}
	if delErr := h.Store.DeleteActiveMeeting(am.ChannelID); delErr != nil {
		return updated, delErr
	}
	if h.BroadcastFunc != nil {
		h.BroadcastFunc("meeting_ended", map[string]any{
			"channel_id": am.ChannelID,
			"room_id":    am.RoomID,
		})
	}
	return updated, nil
}
```

Replace the existing `MeetingsEnd` body with:

```go
func (h *Handlers) MeetingsEnd(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body endMeetingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	if body.ChannelID == "" {
		nethttp.Error(w, "channel_id required", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(body.ChannelID)
	if err != nil {
		nethttp.Error(w, "no active meeting in this channel", nethttp.StatusNotFound)
		return
	}
	if am.HostUserID != mmUserID {
		nethttp.Error(w, "only the host can end the meeting", nethttp.StatusForbidden)
		return
	}

	if _, eErr := h.endMeetingFor(am); eErr != nil {
		nethttp.Error(w, "delete meeting: "+eErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	w.WriteHeader(nethttp.StatusNoContent)
}
```

Add the import for `"github.com/mattermost/mattermost/server/public/model"` to `meetings.go` (for `*model.Post`).

- [ ] **Step 6.2: Re-run existing meeting tests to verify the refactor**

```bash
bash -lc 'go test ./server/http/...'
```

Expected: PASS — refactor must be behavior-preserving.

- [ ] **Step 6.3: Write the failing test for `MeetingsPostActionEnd`**

Append to `server/http/meetings_test.go`:

```go
// TestMeetingsPostActionEnd_HostSucceedsReturnsUpdate verifies that a host
// pressing the "End meeting" attachment button gets a 200 with an Update
// payload that the mobile client uses to rerender the post.
func TestMeetingsPostActionEnd_Host(t *testing.T) {
	api := &plugintest.API{}

	am := &store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
		CreatedAt:  time.Now().UTC().Add(-5 * time.Minute),
	}
	stored, err := json.Marshal(am)
	require.NoError(t, err)
	api.On("KVGet", "meeting_ch-1").Return(stored, nil)
	api.On("KVDelete", "meeting_ch-1").Return(nil)

	var broadcasts []string
	h := &Handlers{
		Store: store.New(api),
		PostGetter: func(id string) (*model.Post, error) {
			return &model.Post{Id: id, Props: model.StringInterface{
				"started_at":    am.CreatedAt.Unix(),
				"frontend_url":  "https://opentalk.example",
				"host_username": "alice",
			}}, nil
		},
		PostUpdater: func(p *model.Post) error { return nil },
		BroadcastFunc: func(event string, _ map[string]any) {
			broadcasts = append(broadcasts, event)
		},
	}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "host-uid",
		ChannelId: "ch-1",
		PostId:    "post-1",
		Context: map[string]any{
			"channel_id": "ch-1",
			"room_id":    "room-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/end", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "host-uid")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionEnd(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, "host end action returns 200")

	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.NotNil(t, resp.Update, "response must carry an Update post")
	assert.Equal(t, "ENDED", resp.Update.GetProp("status"))
	assert.Contains(t, broadcasts, "meeting_ended")
}

// TestMeetingsPostActionEnd_NonHost verifies that a non-host pressing the
// button gets an EphemeralText error and the meeting is unchanged.
func TestMeetingsPostActionEnd_NonHost(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "ch-1",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
	}
	stored, err := json.Marshal(am)
	require.NoError(t, err)
	api.On("KVGet", "meeting_ch-1").Return(stored, nil)

	h := &Handlers{Store: store.New(api)}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "intruder-uid",
		ChannelId: "ch-1",
		Context: map[string]any{
			"channel_id": "ch-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/end", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "intruder-uid")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionEnd(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code, "non-host returns 200 with ephemeral text")
	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Nil(t, resp.Update)
	assert.NotEmpty(t, resp.EphemeralText, "non-host gets a friendly ephemeral message")
	api.AssertNotCalled(t, "KVDelete", mock.Anything)
}
```

- [ ] **Step 6.4: Run and verify they fail**

```bash
bash -lc 'go test ./server/http/... -run TestMeetingsPostActionEnd -v'
```

Expected: FAIL — `MeetingsPostActionEnd` is not defined.

- [ ] **Step 6.5: Implement `MeetingsPostActionEnd`**

Append to `server/http/meetings.go`:

```go
// MeetingsPostActionEnd is the post-action endpoint backing the "End meeting"
// button on the bot-post attachment. Mobile users tap the button to fire this
// without typing /opentalk end. Host-gated: non-host clicks return an
// EphemeralText. Successful host-clicks return an Update so the mobile client
// rerenders the post in its ENDED state without reload.
func (h *Handlers) MeetingsPostActionEnd(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body model.PostActionIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	channelID, _ := body.Context["channel_id"].(string)
	if channelID == "" {
		nethttp.Error(w, "channel_id required in context", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(channelID)
	if err != nil {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "This meeting is no longer active.",
		})
		return
	}
	if am.HostUserID != mmUserID {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "Only the host can end this meeting.",
		})
		return
	}

	updated, eErr := h.endMeetingFor(am)
	if eErr != nil {
		nethttp.Error(w, "end meeting: "+eErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	writePostActionResponse(w, &model.PostActionIntegrationResponse{Update: updated})
}

func writePostActionResponse(w nethttp.ResponseWriter, resp *model.PostActionIntegrationResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(nethttp.StatusOK)
	_ = json.NewEncoder(w).Encode(resp)
}
```

- [ ] **Step 6.6: Run and verify the new tests pass**

```bash
bash -lc 'go test ./server/http/... -run TestMeetingsPostActionEnd -v'
```

Expected: PASS for both.

- [ ] **Step 6.7: Commit**

```bash
git add server/http/meetings.go server/http/meetings_test.go
git commit -m "$(cat <<'EOF'
feat(server): post-action endpoint for End-meeting button

Mobile users can tap the End-meeting attachment button to terminate
the call without typing /opentalk end. Host-gated; non-host taps
return an EphemeralText.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `MeetingsPostActionDismiss` handler

**Files:**
- Modify: `server/http/meetings.go`
- Modify: `server/http/meetings_test.go`

- [ ] **Step 7.1: Extract a shared dismiss helper**

Refactor `MeetingsDismiss` similarly: pull the "record dismissal + maybe-MISSED transition" logic into `dismissFor(am, mmUserID)`:

```go
// dismissFor records the dismissal and returns:
//   updated: the *model.Post if the dismissal flipped the meeting to MISSED
//            (so the caller can include it in a post-action Update); else nil.
func (h *Handlers) dismissFor(am *store.ActiveMeeting, mmUserID string) (*model.Post, error) {
	dismissedSet, err := h.Store.AddDismissal(am.ChannelID, am.RoomID, mmUserID)
	if err != nil {
		return nil, err
	}
	if h.BroadcastFunc != nil {
		h.BroadcastFunc("incoming_call_dismissed", map[string]any{
			"channel_id": am.ChannelID,
			"room_id":    am.RoomID,
			"mm_user_id": mmUserID,
		})
	}
	if h.ChannelMembersOf == nil {
		return nil, nil
	}
	members := h.ChannelMembersOf(am.ChannelID)
	recipients := make([]string, 0, len(members))
	for _, uid := range members {
		if uid != am.HostUserID {
			recipients = append(recipients, uid)
		}
	}
	if len(recipients) == 0 || !allIn(dismissedSet, recipients) {
		return nil, nil
	}

	var updated *model.Post
	if am.PostID != "" && h.PostGetter != nil && h.PostUpdater != nil {
		if pp, ge := h.PostGetter(am.PostID); ge == nil && pp != nil {
			post.ApplyMissedStatus(pp, time.Now().UTC())
			if uErr := h.PostUpdater(pp); uErr == nil {
				updated = pp
			}
		}
	}
	_ = h.Store.DeleteActiveMeeting(am.ChannelID)
	_ = h.Store.DeleteDismissals(am.ChannelID, am.RoomID)
	if h.BroadcastFunc != nil {
		h.BroadcastFunc("meeting_ended", map[string]any{
			"channel_id": am.ChannelID,
			"room_id":    am.RoomID,
		})
	}
	return updated, nil
}
```

Then replace the body of `MeetingsDismiss` with the same lookup-and-delegate shape:

```go
func (h *Handlers) MeetingsDismiss(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body dismissRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	if body.ChannelID == "" || body.RoomID == "" {
		nethttp.Error(w, "channel_id and room_id required", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(body.ChannelID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.WriteHeader(nethttp.StatusNoContent)
			return
		}
		nethttp.Error(w, "load meeting: "+err.Error(), nethttp.StatusInternalServerError)
		return
	}
	if am.RoomID != body.RoomID {
		w.WriteHeader(nethttp.StatusNoContent)
		return
	}

	if _, eErr := h.dismissFor(am, mmUserID); eErr != nil {
		nethttp.Error(w, "save dismissal: "+eErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	w.WriteHeader(nethttp.StatusNoContent)
}
```

- [ ] **Step 7.2: Re-run existing tests to verify the refactor**

```bash
bash -lc 'go test ./server/http/...'
```

Expected: PASS — behavior-preserving refactor.

- [ ] **Step 7.3: Write the failing test for `MeetingsPostActionDismiss`**

Append to `server/http/meetings_test.go`:

```go
// TestMeetingsPostActionDismiss_RecipientDeclines verifies the path where a
// recipient taps Decline on the attachment. Returns 200 with an EphemeralText
// when the meeting is still live (other recipients haven't all declined).
func TestMeetingsPostActionDismiss_StillLive(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "dm-ch",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
	}
	stored, _ := json.Marshal(am)
	api.On("KVGet", "meeting_dm-ch").Return(stored, nil)
	api.On("KVGet", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	})).Return([]byte(nil), nil)
	api.On("KVSetWithExpiry", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	}), mock.Anything, mock.AnythingOfType("int64")).Return(nil)

	h := &Handlers{
		Store:         store.New(api),
		BroadcastFunc: func(string, map[string]any) {},
		ChannelMembersOf: func(string) []string {
			return []string{"host-uid", "alice", "bob"} // alice declines, bob still live
		},
	}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "alice",
		ChannelId: "dm-ch",
		Context: map[string]any{
			"channel_id": "dm-ch",
			"room_id":    "room-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/dismiss", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "alice")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionDismiss(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code)
	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	assert.Nil(t, resp.Update, "still-live meeting: no Update")
	assert.NotEmpty(t, resp.EphemeralText, "still-live meeting: ephemeral confirmation")
}

// TestMeetingsPostActionDismiss_LastRecipientFlipsMissed verifies the path
// where the dismissing user is the last non-host member, flipping the
// meeting to MISSED and returning an Update.
func TestMeetingsPostActionDismiss_FlipsMissed(t *testing.T) {
	api := &plugintest.API{}
	am := &store.ActiveMeeting{
		ChannelID:  "dm-ch",
		RoomID:     "room-1",
		HostUserID: "host-uid",
		PostID:     "post-1",
	}
	stored, _ := json.Marshal(am)
	api.On("KVGet", "meeting_dm-ch").Return(stored, nil)
	api.On("KVGet", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	})).Return([]byte(nil), nil)
	api.On("KVSetWithExpiry", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "dismiss_")
	}), mock.Anything, mock.AnythingOfType("int64")).Return(nil)
	api.On("KVDelete", mock.MatchedBy(func(k string) bool {
		return strings.HasPrefix(k, "meeting_") || strings.HasPrefix(k, "dismiss_")
	})).Return(nil)

	h := &Handlers{
		Store:         store.New(api),
		BroadcastFunc: func(string, map[string]any) {},
		ChannelMembersOf: func(string) []string {
			return []string{"host-uid", "alice"} // alice is the only non-host
		},
		PostGetter: func(id string) (*model.Post, error) {
			return &model.Post{Id: id, Props: model.StringInterface{
				"frontend_url":  "https://opentalk.example",
				"host_username": "host-display",
			}}, nil
		},
		PostUpdater: func(*model.Post) error { return nil },
	}

	body, _ := json.Marshal(model.PostActionIntegrationRequest{
		UserId:    "alice",
		ChannelId: "dm-ch",
		Context: map[string]any{
			"channel_id": "dm-ch",
			"room_id":    "room-1",
		},
	})
	req := httptest.NewRequest(nethttp.MethodPost, "/api/v1/meetings/post-action/dismiss", bytes.NewReader(body))
	req.Header.Set("Mattermost-User-ID", "alice")
	rr := httptest.NewRecorder()
	h.MeetingsPostActionDismiss(rr, req)

	require.Equal(t, nethttp.StatusOK, rr.Code)
	var resp model.PostActionIntegrationResponse
	require.NoError(t, json.Unmarshal(rr.Body.Bytes(), &resp))
	require.NotNil(t, resp.Update, "last decliner: Update with MISSED post")
	assert.Equal(t, "MISSED", resp.Update.GetProp("status"))
}
```

(Imports: `"strings"` if not already present.)

Note: the `KVGet` mock for the dismiss-set key returns nil bytes; `store.AddDismissal` should treat that as an empty set and add the user. If `AddDismissal` uses a different key shape, adjust the mock matcher; the goal is for the call to succeed.

- [ ] **Step 7.4: Run and verify they fail**

```bash
bash -lc 'go test ./server/http/... -run TestMeetingsPostActionDismiss -v'
```

Expected: FAIL — `MeetingsPostActionDismiss` is not defined.

- [ ] **Step 7.5: Implement `MeetingsPostActionDismiss`**

Append to `server/http/meetings.go`:

```go
// MeetingsPostActionDismiss is the post-action endpoint backing the "Decline"
// button on a DM meeting attachment. Records the user's dismissal; if the
// dismissal flips the meeting to MISSED, returns an Update so the mobile
// client rerenders the post.
func (h *Handlers) MeetingsPostActionDismiss(w nethttp.ResponseWriter, r *nethttp.Request) {
	mmUserID := r.Header.Get("Mattermost-User-ID")
	if mmUserID == "" {
		nethttp.Error(w, "unauthorized", nethttp.StatusUnauthorized)
		return
	}
	var body model.PostActionIntegrationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		nethttp.Error(w, "bad request: "+err.Error(), nethttp.StatusBadRequest)
		return
	}
	channelID, _ := body.Context["channel_id"].(string)
	roomID, _ := body.Context["room_id"].(string)
	if channelID == "" || roomID == "" {
		nethttp.Error(w, "channel_id and room_id required in context", nethttp.StatusBadRequest)
		return
	}

	am, err := h.Store.LoadActiveMeeting(channelID)
	if err != nil {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "This meeting is no longer active.",
		})
		return
	}
	if am.RoomID != roomID {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "This meeting is no longer active.",
		})
		return
	}
	if mmUserID == am.HostUserID {
		// Host can't decline their own meeting; harmless no-op.
		writePostActionResponse(w, &model.PostActionIntegrationResponse{
			EphemeralText: "You are the host of this meeting.",
		})
		return
	}

	updated, dErr := h.dismissFor(am, mmUserID)
	if dErr != nil {
		nethttp.Error(w, "save dismissal: "+dErr.Error(), nethttp.StatusInternalServerError)
		return
	}
	if updated != nil {
		writePostActionResponse(w, &model.PostActionIntegrationResponse{Update: updated})
		return
	}
	writePostActionResponse(w, &model.PostActionIntegrationResponse{
		EphemeralText: "Call declined.",
	})
}
```

- [ ] **Step 7.6: Run and verify the new tests pass**

```bash
bash -lc 'go test ./server/http/... -run TestMeetingsPostActionDismiss -v'
```

Expected: PASS for both.

- [ ] **Step 7.7: Commit**

```bash
git add server/http/meetings.go server/http/meetings_test.go
git commit -m "$(cat <<'EOF'
feat(server): post-action endpoint for Decline button

Recipients on mobile can decline a DM call from the post attachment.
If the dismissing user is the last non-host member, the meeting flips
to MISSED and the response Update lets the mobile client rerender.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Register the two new routes

**Files:**
- Modify: `server/http/http.go`

- [ ] **Step 8.1: Add the routes**

Replace the body of `NewRouter` in `server/http/http.go`:

```go
func NewRouter(handlers *Handlers) *mux.Router {
	r := mux.NewRouter()
	r.HandleFunc("/oauth/start", handlers.OAuthStart).Methods(nethttp.MethodGet)
	r.HandleFunc("/oauth/callback", handlers.OAuthCallback).Methods(nethttp.MethodGet)
	r.HandleFunc("/api/v1/me", handlers.Me).Methods(nethttp.MethodGet)
	r.HandleFunc("/api/v1/meetings", handlers.MeetingsCreate).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/{room_id}/join", handlers.MeetingsJoin).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/end", handlers.MeetingsEnd).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/dismiss", handlers.MeetingsDismiss).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/heartbeat", handlers.MeetingsHeartbeat).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/post-action/end", handlers.MeetingsPostActionEnd).Methods(nethttp.MethodPost)
	r.HandleFunc("/api/v1/meetings/post-action/dismiss", handlers.MeetingsPostActionDismiss).Methods(nethttp.MethodPost)
	return r
}
```

- [ ] **Step 8.2: Smoke-test routing with a tiny request test**

Append to `server/http/meetings_test.go`:

```go
// TestRouter_PostActionRoutesRegistered verifies that the two new routes
// are reachable through the gorilla/mux router (not just by direct handler
// invocation).
func TestRouter_PostActionRoutesRegistered(t *testing.T) {
	api := &plugintest.API{}
	api.On("KVGet", mock.AnythingOfType("string")).Return([]byte(nil), nil).Maybe()
	h := &Handlers{Store: store.New(api)}

	router := NewRouter(h)

	for _, path := range []string{
		"/api/v1/meetings/post-action/end",
		"/api/v1/meetings/post-action/dismiss",
	} {
		body, _ := json.Marshal(model.PostActionIntegrationRequest{
			Context: map[string]any{
				"channel_id": "ch-x",
				"room_id":    "room-x",
			},
		})
		req := httptest.NewRequest(nethttp.MethodPost, path, bytes.NewReader(body))
		req.Header.Set("Mattermost-User-ID", "any-uid")
		rr := httptest.NewRecorder()
		router.ServeHTTP(rr, req)
		assert.NotEqual(t, nethttp.StatusNotFound, rr.Code, "route %s must be registered", path)
	}
}
```

- [ ] **Step 8.3: Run and verify**

```bash
bash -lc 'go test ./server/http/... -run TestRouter_PostActionRoutesRegistered -v'
```

Expected: PASS.

- [ ] **Step 8.4: Commit**

```bash
git add server/http/http.go server/http/meetings_test.go
git commit -m "$(cat <<'EOF'
feat(server): register post-action endpoints in router

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Mobile section in help text

**Files:**
- Modify: `server/command/help.go`
- Modify: `server/command/help_test.go`

- [ ] **Step 9.1: Write the failing test**

Append to `server/command/help_test.go`:

```go
// TestHelp_IncludesMobileSection verifies the help output mentions the
// mobile-handoff in both DE and EN.
func TestHelp_IncludesMobileSection(t *testing.T) {
	deOut := buildHelp("de")
	assert.Contains(t, deOut, "Mobil")
	assert.Contains(t, deOut, "Browser",
		"German mobile section must mention that the call opens in the browser")

	enOut := buildHelp("en")
	assert.Contains(t, enOut, "Mobile")
	assert.Contains(t, enOut, "browser",
		"English mobile section must mention that the call opens in the browser")
}
```

- [ ] **Step 9.2: Run and verify it fails**

```bash
bash -lc 'go test ./server/command/... -run TestHelp_IncludesMobileSection -v'
```

Expected: FAIL — current help text has no mobile section.

- [ ] **Step 9.3: Append the mobile section**

Edit `server/command/help.go`:

```go
package command

import (
	"github.com/mattermost/mattermost/server/public/model"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
)

func (h *Handler) help(args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	locale := h.localeOf(args.UserId)
	return ephemeral(buildHelp(locale)), nil
}

func buildHelp(locale string) string {
	return i18n.T(locale, i18n.Translatable{
		DE: `**OpenTalk Plugin – Kommandos**
- ` + "`/opentalk connect`" + ` — verbinde dein Mattermost-Konto mit OpenTalk
- ` + "`/opentalk disconnect`" + ` — entferne die Verbindung
- ` + "`/opentalk info`" + ` — zeige aktuellen Verbindungsstatus
- ` + "`/opentalk start`" + ` — starte ein Meeting in diesem Channel
- ` + "`/opentalk join`" + ` — tritt einem laufenden Meeting bei
- ` + "`/opentalk end`" + ` — beendet das Meeting (nur für Host)
- ` + "`/opentalk dial-in`" + ` — zeigt SIP-Einwahldaten
- ` + "`/opentalk ring on|off`" + ` — Klingelton bei eingehenden Anrufen ein-/ausschalten
- ` + "`/opentalk help`" + ` — diese Hilfe

**Auf dem Handy**
Auf der Mattermost-Mobil-App öffnet der Beitritt den OpenTalk-Web-Client im System-Browser. Aktionen wie *Meeting beenden* oder *Ablehnen* sind als Schaltflächen im Meeting-Post verfügbar; Slash-Kommandos funktionieren wie auf dem Desktop.`,
		EN: `**OpenTalk Plugin – commands**
- ` + "`/opentalk connect`" + ` — link your Mattermost account to OpenTalk
- ` + "`/opentalk disconnect`" + ` — remove the link
- ` + "`/opentalk info`" + ` — show current connection status
- ` + "`/opentalk start`" + ` — start a meeting in this channel
- ` + "`/opentalk join`" + ` — join an active meeting
- ` + "`/opentalk end`" + ` — end the meeting (host only)
- ` + "`/opentalk dial-in`" + ` — show SIP dial-in details
- ` + "`/opentalk ring on|off`" + ` — toggle ringtone for incoming calls
- ` + "`/opentalk help`" + ` — this help

**On Mobile**
On the Mattermost mobile app, joining a meeting opens the OpenTalk web client in your system browser. Actions like *End meeting* and *Decline* are available as buttons on the meeting post; slash commands work the same as on desktop.`,
	})
}
```

- [ ] **Step 9.4: Run and verify it passes**

```bash
bash -lc 'go test ./server/command/...'
```

Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add server/command/help.go server/command/help_test.go
git commit -m "$(cat <<'EOF'
docs(server): help text mentions mobile-handoff behaviour

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Full-suite verification + dist build

**Files:** none modified — verification only.

- [ ] **Step 10.1: Run the full Go test suite**

```bash
bash -lc 'go test ./...'
```

Expected: PASS for every package.

- [ ] **Step 10.2: Run lint**

```bash
bash -lc 'make lint'
```

Expected: clean (or only pre-existing warnings unrelated to the diff).

- [ ] **Step 10.3: Build the plugin bundle**

```bash
bash -lc 'make dist'
```

Expected: `dist/com.github.morzan1001.mattermost-plugin-opentalk-<version>.tar.gz` is produced without error.

- [ ] **Step 10.4: Confirm the spec → plan mapping is complete**

Re-read [docs/superpowers/specs/2026-05-09-mobile-handoff-design.md](../specs/2026-05-09-mobile-handoff-design.md). For each line in the spec's "Files touched" table:

| Spec entry | Implemented in |
| --- | --- |
| `server/post/meeting_post.go` (attachments) | Task 4, 5 |
| `server/store/meeting.go` (HostHeartbeatReceived) | Task 1 |
| `server/plugin.go` (heartbeat flag wiring) | Task 3 (handler-side) + Task 5 (isDM) |
| `server/http/meetings.go` (post-action handlers + helpers) | Task 6, 7 |
| `server/http/http.go` (routes) | Task 8 |
| `server/reaper/reaper.go` (grace branch) | Task 2 |
| `server/i18n/...` | inline at call sites in Tasks 4, 6, 7, 9 |
| `server/command/help.go` (mobile section) | Task 9 |
| Tests across all of the above | Tasks 1-9 |

If anything is missing, add a follow-up task.

- [ ] **Step 10.5: Manual smoke test (post-deploy)**

This step is not automatable from inside the sandbox; document for the operator.

1. Upload the new bundle to the runforest.run instance: disable the previous version, remove it, upload the new one, enable it.
2. **Web smoke:** in a browser, hard-reload (Ctrl+Shift+R). Run `/opentalk start` in a channel. Confirm the existing rich card renders (no Slack attachment visible). End the meeting via the channel-header / mini-bar; confirm post flips to ENDED.
3. **Mobile smoke (channel call):** on the iOS or Android Mattermost app, open the same channel. Confirm the bot post shows a card with a `[Join meeting]` link, host line, started-at line, and an `End meeting` button. Tap the link — system browser opens at the OpenTalk frontend; you can complete the join.
4. **Mobile smoke (DM call):** open a DM, run `/opentalk start`. Verify the recipient on mobile gets a push titled "Incoming call from <host>"; tapping it opens the post; the attachment shows a `Decline` button alongside `End meeting`. Tap `Decline` — the post flips to `MISSED`.
5. **Mobile smoke (no-heartbeat survival):** start a meeting from mobile, leave it idle (don't open the OpenTalk frontend) for 6 minutes. Confirm the meeting is still active (was not killed by the old 5-min reaper). Then after >30 minutes, confirm the reaper has cleaned it up.

Operator records pass/fail per item; report regressions back to the engineer.

---

## Self-review

- **Spec coverage:** all spec sections — attachments per status, post-action endpoints, reaper grace, i18n, help text, no-config, no-webapp-changes — are mapped to tasks above. ✓
- **Placeholder scan:** no `TBD`, `TODO` (other than allowed inline plan operator notes), or "implement later" markers. Every code block is complete. ✓
- **Type consistency:** `BuildMeetingPost(am, frontendURL, hostUsername, locale, isDM)` is consistent across Tasks 4-5 and all callers. `HostHeartbeatReceived` is consistent across Tasks 1, 2, 3. `endMeetingFor` and `dismissFor` helpers are introduced in Tasks 6-7 with stable signatures used by both old and new endpoints. ✓
