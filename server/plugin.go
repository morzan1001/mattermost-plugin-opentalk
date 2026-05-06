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

	"github.com/opentalk/mattermost-plugin-opentalk/server/command"
	pluginhttp "github.com/opentalk/mattermost-plugin-opentalk/server/http"
	"github.com/opentalk/mattermost-plugin-opentalk/server/oidc"
	"github.com/opentalk/mattermost-plugin-opentalk/server/opentalk"
	"github.com/opentalk/mattermost-plugin-opentalk/server/post"
	"github.com/opentalk/mattermost-plugin-opentalk/server/store"
)

const pluginID = "de.opentalk.mattermost-plugin"

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

	// Purge runtime state from the previous plugin process. Active meetings
	// from before the redeploy aren't reachable any more (the WS clients
	// have been disconnected and reset their session-slice on bundle reload),
	// so leaving them in KV would only feed stale incoming-call modals when
	// any session reconciles state. Same logic for dismissal sets.
	if n, err := p.store.PurgeKeysWithPrefix("meeting_"); err == nil && n > 0 {
		p.API.LogInfo("[opentalk] purged stale active-meetings on activate", "count", n)
	}
	if n, err := p.store.PurgeKeysWithPrefix("dismiss_"); err == nil && n > 0 {
		p.API.LogInfo("[opentalk] purged stale dismissals on activate", "count", n)
	}

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
	}
	return h.Execute(args)
}

func (p *Plugin) OnDeactivate() error {
	return nil
}

func (p *Plugin) getOIDCClient() *oidc.Client {
	p.oidcMu.RLock()
	defer p.oidcMu.RUnlock()
	return p.oidcClient
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

		OpenTalk:      opentalk.NewClient(cfg.OpenTalkControllerURL),
		RoomserverURL: cfg.OpenTalkRoomserverURL,
		Defaults: pluginhttp.MeetingDefaults{
			EnableSIP:             cfg.DefaultEnableSIP,
			WaitingRoom:           cfg.DefaultWaitingRoom,
			InviteExpirationHours: cfg.InviteExpirationHours,
		},
		AccessTokenFor: p.accessTokenFor,

		BotUserID:   p.botUserID,
		FrontendURL: cfg.OpenTalkFrontendURL,
		// pluginapi.PostService.CreatePost mutates the input post in-place
		// (server-assigned Id, CreateAt, ...) and returns only error. We
		// adapt to the (post, error) signature the handler expects.
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

		// Phase 6: end-meeting endpoint reuses the same Post API the slash-
		// command handler uses (server/command/end.go).
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

		// Phase 8a: dismiss endpoint needs the member list to detect when all
		// DM recipients have declined (auto-MISSED transition).
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

	deviceSecret, err := generateDeviceSecret()
	if err != nil {
		return nil, err
	}

	ot := opentalk.NewClient(cfg.OpenTalkControllerURL)

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
	if u, err := p.API.GetUser(mmUserID); err == nil && u != nil {
		hostName = displayNameOf(u)
	}
	botPost := post.BuildMeetingPost(am, cfg.OpenTalkFrontendURL, hostName)
	botPost.UserId = p.botUserID
	if err := p.client.Post.CreatePost(botPost); err != nil {
		return nil, fmt.Errorf("post meeting card: %w", err)
	}
	am.PostID = botPost.Id
	if err := p.store.SaveActiveMeeting(am); err != nil {
		return nil, fmt.Errorf("persist meeting (with post_id): %w", err)
	}

	ch, chErr := p.API.GetChannel(channelID)
	if chErr == nil && ch != nil {
		isDM := ch.Type == model.ChannelTypeDirect || ch.Type == model.ChannelTypeGroup
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

			// OmitUsers excludes the host from receiving their own ring —
			// otherwise creating a DM-meeting makes the host ring themselves.
			p.API.PublishWebSocketEvent("incoming_call", payload, &model.WebsocketBroadcast{
				ChannelId: channelID,
				OmitUsers: map[string]bool{mmUserID: true},
			})

			// Best-effort push notification per recipient.
			for _, uid := range recipients {
				push := &model.PushNotification{
					Type:      model.PushTypeMessage,
					Category:  model.CategoryCanReply,
					ChannelId: channelID,
					Message:   "Anruf von " + hostName,
					SenderId:  p.botUserID,
				}
				if pErr := p.API.SendPushNotification(push, uid); pErr != nil {
					p.API.LogWarn("[opentalk] push failed", "user", uid, "err", pErr.Error())
				}
			}
		} else {
			// Channel meeting (Phase 8b ChannelCallToast). Host doesn't need
			// a toast for their own meeting.
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
