package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	nethttp "net/http"
	"strings"
	"sync"
	"time"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
	"github.com/mattermost/mattermost/server/public/pluginapi"

	"github.com/morzan1001/mattermost-plugin-opentalk/server/command"
	pluginhttp "github.com/morzan1001/mattermost-plugin-opentalk/server/http"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/i18n"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/oidc"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/opentalk"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/post"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/reaper"
	"github.com/morzan1001/mattermost-plugin-opentalk/server/store"
)

const pluginID = "com.github.morzan1001.mattermost-plugin-opentalk"

const botUsername = "opentalk-bot"
const botDisplayName = "OpenTalk Bot"
const botDescription = "Posts about OpenTalk meetings created from Mattermost."

type Plugin struct {
	plugin.MattermostPlugin

	client *pluginapi.Client

	configurationLock sync.RWMutex
	configuration     *Configuration

	botUserID string

	store      *store.Store
	oidcClient *oidc.Client
	oidcMu     sync.RWMutex

	otClient *opentalk.Client

	reaper *reaper.Reaper

	channelLocks sync.Map
	userLocks    sync.Map
}

// channelMembersOf pages through every member of a channel and returns the
// flat list of user IDs. A single GetChannelMembers call is capped at 200 by
// the Mattermost plugin API, so any channel larger than 200 members needs
// pagination — without it the dismiss-quorum check silently truncated and
// channel-broadcast loops missed users.
func (p *Plugin) channelMembersOf(channelID string) []string {
	const perPage = 200
	const safetyCap = 10000
	out := make([]string, 0, perPage)
	for page := 0; len(out) < safetyCap; page++ {
		members, err := p.API.GetChannelMembers(channelID, page, perPage)
		if err != nil || len(members) == 0 {
			return out
		}
		for _, m := range members {
			out = append(out, m.UserId)
		}
		if len(members) < perPage {
			return out
		}
	}
	return out
}

// acquireChannelLock serialises in-process operations for a channel so the
// LoadActiveMeeting -> external-service -> SaveActiveMeeting sequence in
// MeetingsCreate / CreateMeeting cannot interleave with itself. CAS on
// SaveActiveMeeting still protects cross-node races.
func (p *Plugin) acquireChannelLock(channelID string) func() {
	mu, _ := p.channelLocks.LoadOrStore(channelID, &sync.Mutex{})
	m := mu.(*sync.Mutex)
	m.Lock()
	return m.Unlock
}

func (p *Plugin) OnActivate() error {
	p.client = pluginapi.NewClient(p.API, p.Driver)

	botID, err := p.API.EnsureBotUser(&model.Bot{
		Username:    botUsername,
		DisplayName: botDisplayName,
		Description: botDescription,
	})
	if err != nil {
		return fmt.Errorf("failed to ensure bot user: %w", err)
	}
	p.botUserID = botID

	p.store = store.New(p.API)

	// Heartbeat-driven reaper: stale meetings (no heartbeat for >5min) are
	// ended within ~60s. The encryption key is resolved per-tick so a
	// config rotation propagates without a restart.
	p.reaper = reaper.New(p.API, p.store, p.endMeetingFromReaper,
		func() []byte { return []byte(p.getConfiguration().TokenEncryptionKey) },
		60*time.Second, 5*time.Minute)
	p.reaper.Start()

	if err := p.API.RegisterCommand(&model.Command{
		Trigger:          command.Trigger,
		AutoComplete:     true,
		AutoCompleteDesc: "OpenTalk plugin commands",
		AutoCompleteHint: "[connect|disconnect|info|help]",
		AutocompleteData: command.AutocompleteData(),
	}); err != nil {
		return fmt.Errorf("register command: %w", err)
	}

	return nil
}

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, *model.AppError) {
	cfg := p.getConfiguration()
	h := &command.Handler{
		API:            p.API,
		Store:          p.store,
		OIDCClient:     p.getOIDCClient(),
		EncryptionKey:  []byte(cfg.TokenEncryptionKey),
		SiteURL:        p.getSiteURL(),
		PluginID:       pluginID,
		FrontendURL:    cfg.OpenTalkFrontendURL,
		MeetingCreator: p.CreateMeeting,
		OpenTalk:       p.getOTClient(),
		AccessTokenFor: p.accessTokenFor,
		PostGetter: func(postID string) (*model.Post, error) {
			mp, appErr := p.API.GetPost(postID)
			if appErr != nil {
				return nil, appErr
			}
			return mp, nil
		},
		PostUpdater: func(mp *model.Post) error {
			return p.client.Post.UpdatePost(mp)
		},
		Broadcaster: func(event string, payload map[string]any, b *model.WebsocketBroadcast) {
			p.API.PublishWebSocketEvent(event, payload, b)
		},
		LocaleOf: p.localeOf,
	}
	return h.Execute(args)
}

func (p *Plugin) OnDeactivate() error {
	p.reaper.Stop()
	return nil
}

// endMeetingFromReaper transitions a stale meeting to ENDED status. MISSED is
// reserved for the "all DM recipients declined before joining" path.
func (p *Plugin) endMeetingFromReaper(am *store.ActiveMeeting) {
	if am.PostID != "" {
		if pp, appErr := p.API.GetPost(am.PostID); appErr == nil && pp != nil {
			post.ApplyEndedStatus(pp, time.Now().UTC())
			_ = p.client.Post.UpdatePost(pp)
		}
	}
	_ = p.store.DeleteActiveMeeting(am.ChannelID)
	_ = p.store.DeleteDismissals(am.ChannelID, am.RoomID)
	p.API.PublishWebSocketEvent("meeting_ended", map[string]any{
		"channel_id": am.ChannelID,
		"room_id":    am.RoomID,
	}, &model.WebsocketBroadcast{ChannelId: am.ChannelID})
}

// NotificationWillBePushed suppresses the standard MM push for our
// custom_opentalk_meeting bot post -- we already send our own call-flavored
// push from notifyMeetingStarted. Our own push carries no PostId (identified
// by that omission, it returns early above); the standard bot-post push
// carries the post id and its Type, and is the one we cancel here. A
// SenderId guard cannot separate the two: both are authored by the bot, so
// both carry SenderId == botUserID and the standard push would slip through.
func (p *Plugin) NotificationWillBePushed(push *model.PushNotification, mmUserID string) (*model.PushNotification, string) {
	if push == nil || push.PostId == "" {
		return push, ""
	}
	pp, appErr := p.API.GetPost(push.PostId)
	if appErr != nil || pp == nil {
		return push, ""
	}
	if pp.Type == "custom_opentalk_meeting" {
		return nil, "opentalk plugin owns this notification"
	}
	return push, ""
}

func (p *Plugin) getOIDCClient() *oidc.Client {
	p.oidcMu.RLock()
	defer p.oidcMu.RUnlock()
	return p.oidcClient
}

func (p *Plugin) getOTClient() *opentalk.Client {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()
	return p.otClient
}

func (p *Plugin) setOIDCClient(c *oidc.Client) {
	p.oidcMu.Lock()
	defer p.oidcMu.Unlock()
	p.oidcClient = c
}

func (p *Plugin) getSiteURL() string {
	cfg := p.API.GetConfig()
	if cfg != nil && cfg.ServiceSettings.SiteURL != nil {
		return *cfg.ServiceSettings.SiteURL
	}
	return ""
}

func splitScopes(s string) []string {
	return strings.Fields(s)
}

// displayNameOf returns the user's preferred display name in this priority:
// nickname > first+last > username. Falls back to username on any nil/empty.
func displayNameOf(u *model.User) string {
	if u == nil {
		return ""
	}
	if nick := strings.TrimSpace(u.Nickname); nick != "" {
		return nick
	}
	full := strings.TrimSpace(u.FirstName + " " + u.LastName)
	if full != "" {
		return full
	}
	return u.Username
}

// ServeHTTP routes plugin HTTP requests through the gorilla/mux-Router in
// server/http. Returns 503 if the plugin has not been configured yet (i.e.,
// OnConfigurationChange has not produced a valid OIDC client).
func (p *Plugin) ServeHTTP(c *plugin.Context, w nethttp.ResponseWriter, r *nethttp.Request) {
	oidcClient := p.getOIDCClient()
	if oidcClient == nil || p.store == nil {
		nethttp.Error(w, "plugin not configured", nethttp.StatusServiceUnavailable)
		return
	}

	cfg := p.getConfiguration()
	handlers := &pluginhttp.Handlers{
		Store:         p.store,
		OIDC:          oidcClient,
		EncryptionKey: []byte(cfg.TokenEncryptionKey),
		BroadcastFunc: func(event string, payload map[string]any, b *model.WebsocketBroadcast) {
			p.API.PublishWebSocketEvent(event, payload, b)
		},

		OpenTalk:      p.getOTClient(),
		RoomserverURL: cfg.OpenTalkRoomserverURL,
		Defaults: pluginhttp.MeetingDefaults{
			EnableSIP:             cfg.DefaultEnableSIP,
			WaitingRoom:           cfg.DefaultWaitingRoom,
			InviteExpirationHours: cfg.InviteExpirationHours,
		},
		AccessTokenFor: p.accessTokenFor,

		BotUserID:   p.botUserID,
		FrontendURL: cfg.OpenTalkFrontendURL,
		// pluginapi.Post.CreatePost mutates in-place; adapt to (post, error) shape.
		CreatePost: func(mp *model.Post) (*model.Post, error) {
			if err := p.client.Post.CreatePost(mp); err != nil {
				return nil, err
			}
			return mp, nil
		},
		HostUsernameOf: func(mmUserID string) string {
			u, err := p.API.GetUser(mmUserID)
			if err != nil || u == nil {
				return ""
			}
			return u.Username
		},
		HostDisplayNameOf: func(mmUserID string) string {
			u, err := p.API.GetUser(mmUserID)
			if err != nil || u == nil {
				return ""
			}
			return displayNameOf(u)
		},
		LocaleOf: p.localeOf,

		IsConnected: func(mmUserID string) bool {
			cfg := p.getConfiguration()
			_, err := p.store.LoadUserInfo([]byte(cfg.TokenEncryptionKey), mmUserID)
			return err == nil
		},
		UsernameOf: func(mmUserID string) string {
			u, err := p.API.GetUser(mmUserID)
			if err != nil || u == nil {
				return ""
			}
			return displayNameOf(u)
		},

		PostGetter: func(postID string) (*model.Post, error) {
			pp, appErr := p.API.GetPost(postID)
			if appErr != nil {
				return nil, appErr
			}
			return pp, nil
		},
		PostUpdater: func(mp *model.Post) error {
			return p.client.Post.UpdatePost(mp)
		},

		ChannelMembersOf: func(channelID string) []string {
			return p.channelMembersOf(channelID)
		},
		IsChannelMember: func(channelID, mmUserID string) bool {
			if channelID == "" || mmUserID == "" {
				return false
			}
			m, err := p.API.GetChannelMember(channelID, mmUserID)
			return err == nil && m != nil
		},
		AcquireChannelLock:   p.acquireChannelLock,
		NotifyMeetingStarted: p.notifyMeetingStarted,
		IsDMChannel: func(channelID string) bool {
			ch, err := p.API.GetChannel(channelID)
			if err != nil || ch == nil {
				return false
			}
			return ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup
		},
		LogWarn: func(msg string, args ...any) {
			p.API.LogWarn(msg, args...)
		},
	}
	pluginhttp.NewRouter(handlers).ServeHTTP(w, r)
}

// CreateMeeting provisions an OpenTalk room + bot post for channelID on
// behalf of mmUserID.
func (p *Plugin) CreateMeeting(channelID, mmUserID string) (*store.ActiveMeeting, error) {
	cfg := p.getConfiguration()

	token, err := p.accessTokenFor(mmUserID)
	if err != nil {
		return nil, fmt.Errorf("access token: %w", err)
	}

	release := p.acquireChannelLock(channelID)
	defer release()

	encKey := []byte(cfg.TokenEncryptionKey)
	if existing, lErr := p.store.LoadActiveMeeting(encKey, channelID); lErr == nil && existing != nil {
		return existing, store.ErrMeetingAlreadyActive
	}

	deviceSecret, err := generateDeviceSecret()
	if err != nil {
		return nil, err
	}

	ot := p.getOTClient()

	room, err := ot.CreateRoom(token, opentalk.CreateRoomRequest{
		EnableSIP:   cfg.DefaultEnableSIP,
		WaitingRoom: cfg.DefaultWaitingRoom,
	})
	if err != nil {
		return nil, fmt.Errorf("create room: %w", err)
	}

	expiry := time.Now().Add(time.Duration(cfg.InviteExpirationHours) * time.Hour).UTC()
	invite, err := ot.CreateInvite(token, room.ID, opentalk.CreateInviteRequest{Expiration: &expiry})
	if err != nil {
		return nil, fmt.Errorf("create invite: %w", err)
	}

	if _, err := ot.StartRoom(token, room.ID, opentalk.StartRequest{DeviceSecret: deviceSecret}); err != nil {
		return nil, fmt.Errorf("start room: %w", err)
	}

	am := &store.ActiveMeeting{
		ChannelID:     channelID,
		RoomID:        room.ID,
		InviteCode:    invite.InviteCode,
		HostUserID:    mmUserID,
		CreatedAt:     time.Now().UTC(),
		LastHeartbeat: time.Now().UTC(),
		EnableSIP:     cfg.DefaultEnableSIP,
	}
	if err := p.store.CreateActiveMeetingAtomic(encKey, am); err != nil {
		if errors.Is(err, store.ErrMeetingAlreadyActive) {
			if dErr := ot.DeleteInvite(token, room.ID, invite.InviteCode); dErr != nil {
				p.API.LogWarn("[opentalk] rollback DeleteInvite failed", "room", room.ID, "err", dErr.Error())
			}
			if existing, lErr := p.store.LoadActiveMeeting(encKey, channelID); lErr == nil && existing != nil {
				return existing, store.ErrMeetingAlreadyActive
			}
			return nil, store.ErrMeetingAlreadyActive
		}
		return nil, fmt.Errorf("persist meeting: %w", err)
	}

	hostUsername := mmUserID
	hostDisplayName := mmUserID
	hostLocale := ""
	if u, err := p.API.GetUser(mmUserID); err == nil && u != nil {
		hostUsername = u.Username
		hostDisplayName = displayNameOf(u)
		hostLocale = u.Locale
	}

	ch, chErr := p.API.GetChannel(channelID)
	isDM := chErr == nil && ch != nil &&
		(ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup)

	botPost := post.BuildMeetingPost(am, cfg.OpenTalkFrontendURL, hostUsername, hostDisplayName, hostLocale, isDM)
	botPost.UserId = p.botUserID
	if err := p.client.Post.CreatePost(botPost); err != nil {
		return nil, fmt.Errorf("post meeting card: %w", err)
	}
	am.PostID = botPost.Id
	if err := p.store.SaveActiveMeeting(encKey, am); err != nil {
		return nil, fmt.Errorf("persist meeting (with post_id): %w", err)
	}

	p.notifyMeetingStarted(am)

	return am, nil
}

// notifyMeetingStarted is the single entry point for "a meeting just became
// joinable" notifications. Both the HTTP MeetingsCreate path and the
// slash-command path funnel through here so DMs always ring the recipients,
// not only when the meeting is started via /opentalk start. Safe to call
// more than once for the same meeting (e.g. on a header-button click while
// a stale meeting is still in KV) — the receiving webapp reduces to the
// newest ring per channel.
func (p *Plugin) notifyMeetingStarted(am *store.ActiveMeeting) {
	if am == nil {
		return
	}
	ch, chErr := p.API.GetChannel(am.ChannelID)
	if chErr != nil || ch == nil {
		return
	}

	hostName := am.HostUserID
	if u, uErr := p.API.GetUser(am.HostUserID); uErr == nil && u != nil {
		hostName = displayNameOf(u)
	}

	payload := map[string]any{
		"channel_id":   am.ChannelID,
		"room_id":      am.RoomID,
		"host_user_id": am.HostUserID,
		"host_name":    hostName,
		"post_id":      am.PostID,
		// lets the webapp ignore stale broadcasts on WS reconnect
		"created_at_unix_ms": time.Now().UnixMilli(),
	}

	isDM := ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup
	if !isDM {
		// Channel meeting: passive toast for everyone else.
		p.API.PublishWebSocketEvent("meeting_started", payload, &model.WebsocketBroadcast{
			ChannelId: am.ChannelID,
			OmitUsers: map[string]bool{am.HostUserID: true},
		})
		return
	}

	members := p.channelMembersOf(am.ChannelID)
	recipients := make([]string, 0, len(members))
	for _, uid := range members {
		if uid != am.HostUserID {
			recipients = append(recipients, uid)
		}
	}
	payload["dm_user_ids"] = recipients

	// Defense-in-depth: fire both ChannelId- and UserId-scoped broadcasts.
	// Either path on its own has cluster / cache edge cases under which MM
	// silently drops the event; sending via both gives us two independent
	// delivery routes. The webapp reducer is idempotent on channelID so a
	// double-delivery is harmless.
	p.API.PublishWebSocketEvent("incoming_call", payload, &model.WebsocketBroadcast{
		ChannelId: am.ChannelID,
		OmitUsers: map[string]bool{am.HostUserID: true},
	})
	for _, uid := range recipients {
		p.API.PublishWebSocketEvent("incoming_call", payload, &model.WebsocketBroadcast{
			UserId: uid,
		})
	}
	p.API.LogInfo("[opentalk] incoming_call broadcast",
		"channel_id", am.ChannelID,
		"room_id", am.RoomID,
		"recipients", strings.Join(recipients, ","),
	)

	// Respect the server's push privacy setting: with generic contents the
	// sender's name must not appear in the push payload.
	pushContents := model.FullNotification
	if mmCfg := p.API.GetConfig(); mmCfg != nil && mmCfg.EmailSettings.PushNotificationContents != nil {
		pushContents = *mmCfg.EmailSettings.PushNotificationContents
	}
	generic := pushContents == model.GenericNotification || pushContents == model.GenericNoChannelNotification

	// Best-effort push notification per recipient; skip DND users.
	for _, uid := range recipients {
		status, _ := p.API.GetUserStatus(uid)
		if status != nil && status.Status == model.StatusDnd {
			continue
		}
		message := i18n.T(p.localeOf(uid), i18n.Translatable{
			DE: "Anruf von " + hostName,
			EN: "Incoming call from " + hostName,
		})
		if generic {
			message = i18n.T(p.localeOf(uid), i18n.Translatable{
				DE: "Eingehender Anruf",
				EN: "Incoming call",
			})
		}
		// No PostId: the NotificationWillBePushed hook cancels the standard
		// bot-post push by its post id + Type, and identifies this call push
		// to keep by the absence of a PostId.
		push := &model.PushNotification{
			Version:     model.PushMessageV2,
			Type:        model.PushTypeMessage,
			TeamId:      ch.TeamId,
			ChannelId:   am.ChannelID,
			SenderId:    p.botUserID,
			ChannelType: ch.Type,
			Message:     message,
		}
		if pErr := p.API.SendPushNotification(push, uid); pErr != nil {
			p.API.LogWarn("[opentalk] push failed", "user", uid, "err", pErr.Error())
		}
	}
}

func generateDeviceSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate device secret: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// localeOf returns the user's MM locale for i18n lookups. Empty string
// (the default) yields English in i18n.T.
func (p *Plugin) localeOf(mmUserID string) string {
	if mmUserID == "" {
		return ""
	}
	u, err := p.API.GetUser(mmUserID)
	if err != nil || u == nil {
		return ""
	}
	return u.Locale
}

// accessTokenFor returns a fresh OIDC access token for the given Mattermost
// user, transparently refreshing it via the IdP if the cached token is
// (about to be) expired. If a refresh occurs, the rotated UserInfo is
// persisted; persistence failures are logged but don't block the caller —
// we still return the working in-memory token.
func (p *Plugin) accessTokenFor(mmUserID string) (string, error) {
	// Serialize per user so two concurrent callers don't both refresh and race
	// their SaveUserInfo writes -- with a rotating refresh token the loser's
	// stored token would be invalidated. The second caller re-loads under the
	// lock and sees the already-refreshed token.
	mu, _ := p.userLocks.LoadOrStore(mmUserID, &sync.Mutex{})
	m := mu.(*sync.Mutex)
	m.Lock()
	defer m.Unlock()

	cfg := p.getConfiguration()
	encKey := []byte(cfg.TokenEncryptionKey)

	info, err := p.store.LoadUserInfo(encKey, mmUserID)
	if err != nil {
		return "", err
	}

	fresh, err := oidc.EnsureFreshToken(context.Background(), p.getOIDCClient(), info)
	if err != nil {
		return "", err
	}
	if fresh != info {
		if saveErr := p.store.SaveUserInfo(encKey, fresh); saveErr != nil {
			p.API.LogWarn("failed to persist refreshed UserInfo", "err", saveErr.Error())
		}
	}
	return fresh.AccessToken, nil
}
