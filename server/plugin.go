package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
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
	// ended within ~60s.
	p.reaper = reaper.New(p.API, p.store, p.endMeetingFromReaper,
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
		Broadcaster: func(event string, payload map[string]any) {
			p.API.PublishWebSocketEvent(event, payload, &model.WebsocketBroadcast{})
		},
		LocaleOf: p.localeOf,
	}
	return h.Execute(args)
}

func (p *Plugin) OnDeactivate() error {
	if p.reaper != nil {
		p.reaper.Stop()
	}
	return nil
}

// endMeetingFromReaper mirrors the MeetingsEnd HTTP handler (minus the
// host-permission check). Status is ENDED, not MISSED — MISSED is reserved
// for the "all DM recipients declined before joining" path.
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

// NotificationWillBePushed is called by the Mattermost server before any
// push-notification is dispatched. Returning (nil, "<reason>") tells MM
// to suppress this push. We use it to drop the duplicate notification
// the standard pipeline would send for our custom_opentalk_meeting
// posts (we already send our own call-flavored push from CreateMeeting).
func (p *Plugin) NotificationWillBePushed(push *model.PushNotification, mmUserID string) (*model.PushNotification, string) {
	if push == nil {
		return push, ""
	}
	if push.PostId == "" {
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
// Used wherever the plugin shows a human-readable participant name (bot-
// post host attribution, OpenTalk join displayName, etc.).
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
		BroadcastFunc: func(event string, payload map[string]any) {
			p.API.PublishWebSocketEvent(event, payload, &model.WebsocketBroadcast{})
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
		// pluginapi.PostService.CreatePost mutates in-place and returns only
		// error; adapt to the (post, error) signature the handler expects.
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

		// Dismiss endpoint needs the member list to detect when all DM
		// recipients have declined (auto-MISSED transition).
		ChannelMembersOf: func(channelID string) []string {
			members, err := p.API.GetChannelMembers(channelID, 0, 100)
			if err != nil || members == nil {
				return nil
			}
			out := make([]string, 0, len(members))
			for _, m := range members {
				out = append(out, m.UserId)
			}
			return out
		},
		IsDMChannel: func(channelID string) bool {
			ch, err := p.API.GetChannel(channelID)
			if err != nil || ch == nil {
				return false
			}
			return ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup
		},
	}
	pluginhttp.NewRouter(handlers).ServeHTTP(w, r)
}

// CreateMeeting orchestrates room creation, invite generation, an initial
// host start-ticket, KV persistence, and the bot-authored custom-post for
// the given channel. Returns the persisted ActiveMeeting (with PostID).
//
// Used by both the HTTP handler and the /opentalk start slash command.
// device_secret is generated here for callers that don't have one (slash-
// command path). Returns an error if the user is not connected to OpenTalk.
func (p *Plugin) CreateMeeting(channelID, mmUserID string) (*store.ActiveMeeting, error) {
	cfg := p.getConfiguration()

	token, err := p.accessTokenFor(mmUserID)
	if err != nil {
		return nil, fmt.Errorf("access token: %w", err)
	}

	// Guard: if a meeting is already active in this channel, return it as a
	// sentinel so callers can branch with errors.Is(err, store.ErrMeetingAlreadyActive).
	if existing, lErr := p.store.LoadActiveMeeting(channelID); lErr == nil && existing != nil {
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
	if err := p.store.SaveActiveMeeting(am); err != nil {
		return nil, fmt.Errorf("persist meeting: %w", err)
	}

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
		payload := map[string]any{
			"channel_id":   channelID,
			"room_id":      room.ID,
			"host_user_id": mmUserID,
			"host_name":    hostName,
			"post_id":      botPost.Id,

			// Freshness marker so the webapp can ignore broadcasts that
			// arrive on a late WS-reconnect / plugin re-activate (we don't
			// want to ring the user for a meeting that was started 5 min
			// ago and is essentially stale).
			"created_at_unix_ms": time.Now().UnixMilli(),
		}
		if isDM {
			// Resolve recipients (channel members minus host).
			members, mErr := p.API.GetChannelMembers(channelID, 0, 100)
			recipients := make([]string, 0, 4)
			if mErr == nil {
				for _, m := range members {
					if m.UserId != mmUserID {
						recipients = append(recipients, m.UserId)
					}
				}
			}
			payload["dm_user_ids"] = recipients

			p.API.PublishWebSocketEvent("incoming_call", payload, &model.WebsocketBroadcast{
				ChannelId: channelID,
				OmitUsers: map[string]bool{mmUserID: true},
			})

			// Best-effort push notification per recipient; skip DND users.
			for _, uid := range recipients {
				status, _ := p.API.GetUserStatus(uid)
				if status != nil && status.Status == model.StatusDnd {
					continue
				}
				push := &model.PushNotification{
					Version:     model.PushMessageV2,
					Type:        model.PushTypeMessage,
					TeamId:      ch.TeamId,
					ChannelId:   channelID,
					PostId:      botPost.Id,
					SenderId:    p.botUserID,
					ChannelType: ch.Type,
					Message: i18n.T(p.localeOf(uid), i18n.Translatable{
						DE: "Anruf von " + hostName,
						EN: "Incoming call from " + hostName,
					}),
					IsIdLoaded: true,
				}
				if pErr := p.API.SendPushNotification(push, uid); pErr != nil {
					p.API.LogWarn("[opentalk] push failed", "user", uid, "err", pErr.Error())
				}
			}
		} else {
			// Channel meeting: broadcast so others see the ChannelCallToast.
			// Host is omitted — no need to notify yourself.
			p.API.PublishWebSocketEvent("meeting_started", payload, &model.WebsocketBroadcast{
				ChannelId: channelID,
				OmitUsers: map[string]bool{mmUserID: true},
			})
		}
	}

	return am, nil
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
